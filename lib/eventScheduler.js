const { INFO, ERROR } = require('../../../lib/logSvc')(__filename)
const { Guild, PlayerState } = require('../models')
const broadcastManager = require('./broadcastManager')
const guildChannelManager = require('./guildChannelManager')
const csvLoader = require('./csvLoader')

class EventScheduler {
  constructor() {
    this._timers = []
    this._oceanBusClient = null
  }

  setOceanBusClient(client) {
    this._oceanBusClient = client
  }

  start() {
    this._scheduleRecurring()
    INFO('[EventScheduler] 定时事件调度器已启动')
  }

  stop() {
    for (const timer of this._timers) {
      clearInterval(timer)
    }
    this._timers = []
    INFO('[EventScheduler] 定时事件调度器已停止')
  }

  _scheduleRecurring() {
    const everyHour = setInterval(() => this._tickHourly(), 3600 * 1000)
    this._timers.push(everyHour)

    const everyMinute = setInterval(() => this._tickMinutely(), 60 * 1000)
    this._timers.push(everyMinute)

    this._tickHourly()
  }

  async _tickHourly() {
    try {
      const now = new Date()
      const utcHour = now.getUTCHours()
      const utcDay = now.getUTCDay()

      if (utcHour === 0) {
        await this._triggerDayReset()
      }

      if (utcDay === 0 && utcHour === 12) {
        await this._triggerWeekendBuff('double_reward')
      }

      await this._checkBirthdayEvents(now)
    } catch (err) {
      ERROR(`[EventScheduler] 小时 Tick 错误: ${err.message}`)
    }
  }

  async _tickMinutely() {
    try {
      await this._checkTerritoryTakeovers()
    } catch (err) {
      ERROR(`[EventScheduler] 分钟 Tick 错误: ${err.message}`)
    }
  }

  async _triggerDayReset() {
    INFO('[EventScheduler] 🌅 每日重置事件触发')
    const { Quest } = require('../models')
    const questManager = require('./questManager')
    await questManager.refreshQuestsForAll()
  }

  async _triggerWeekendBuff(buffType) {
    INFO('[EventScheduler] 🎉 周末双倍奖励事件触发!')
    await broadcastManager.sendBroadcast('SYSTEM', '🎉 周末庆典！接下来24小时内，所有任务奖励翻倍！')

    const allPlayers = await PlayerState.find({ deleted: { $ne: true } })
    for (const player of allPlayers) {
      if (!player.active_buffs) player.active_buffs = []
      player.active_buffs.push({
        buff_type: 'reward_boost',
        buff_value: 2,
        source: 'weekend_event',
        expires_at: new Date(Date.now() + 24 * 3600 * 1000)
      })
      await player.save()
    }
    INFO(`[EventScheduler] 为 ${allPlayers.length} 名玩家施加双倍奖励Buff`)
  }

  async _checkBirthdayEvents(now) {
    const todayMonth = now.getUTCMonth()
    const todayDate = now.getUTCDate()

    const players = await PlayerState.find({ deleted: { $ne: true } })
    for (const player of players) {
      if (!player.createDate) continue
      const birthDate = new Date(player.createDate)
      if (birthDate.getUTCMonth() === todayMonth && birthDate.getUTCDate() === todayDate) {
        const age = now.getUTCFullYear() - birthDate.getUTCFullYear()
        await broadcastManager.sendBroadcast(
          'SYSTEM',
          `🎂 生日快乐！龙虾 ${player.openid.substring(0, 8)} 迎来了第 ${age} 个生日！祝你旅途愉快！`
        )
        player.stamina = Math.min(100, player.stamina + 50)
        player.coins += 100
        await player.save()
        INFO(`[EventScheduler] 🎂 玩家 ${player.openid} 生日! 发放奖励`)
      }
    }
  }

  async _checkTerritoryTakeovers() {
  }

  async triggerSocialEvent(eventType, initiatorOpenid, targetOpenid = null, extra = {}) {
    const eventTemplate = csvLoader.socialEvents.find(e => e.event_id === eventType)
    if (!eventTemplate) {
      ERROR(`[EventScheduler] 未知社交事件类型: ${eventType}`)
      return
    }

    let initiatorMsg = eventTemplate.desc_template || ''
    let targetMsg = eventTemplate.desc_template || ''

    if (initiatorOpenid) {
      initiatorMsg = initiatorMsg.replace(/\{target_name\}/g, targetOpenid || '某龙虾')
        .replace(/\{initiator_name\}/g, initiatorOpenid.substring(0, 8))
        .replace(/\{location_name\}/g, extra.location_name || '')

      if (eventTemplate.effect_stamina_initiator || eventTemplate.effect_coins_initiator) {
        const initiatorPlayer = await PlayerState.findOne({ openid: initiatorOpenid })
        if (initiatorPlayer) {
          if (eventTemplate.effect_stamina_initiator) {
            initiatorPlayer.stamina = Math.max(0, Math.min(100, initiatorPlayer.stamina + parseInt(eventTemplate.effect_stamina_initiator)))
          }
          if (eventTemplate.effect_coins_initiator) {
            initiatorPlayer.coins = Math.max(0, initiatorPlayer.coins + parseInt(eventTemplate.effect_coins_initiator))
          }
          await initiatorPlayer.save()
        }
      }

      if (this._oceanBusClient) {
        try {
          await this._oceanBusClient.sendMessage(initiatorOpenid, {
            msg_type: 'SOCIAL_EVENT',
            event_id: eventType,
            desc: initiatorMsg,
            stamina_change: parseInt(eventTemplate.effect_stamina_initiator) || 0,
            coins_change: parseInt(eventTemplate.effect_coins_initiator) || 0,
            timestamp: Date.now()
          })
        } catch (e) {
          ERROR(`[EventScheduler] 社交事件通知失败 (${initiatorOpenid}): ${e.message}`)
        }
      }

      INFO(`[EventScheduler] 🎭 社交事件 [${eventType}]: ${initiatorOpenid.substring(0, 8)} → ${initiatorMsg.substring(0, 50)}`)
    }

    if (targetOpenid) {
      targetMsg = targetMsg.replace(/\{initiator_name\}/g, initiatorOpenid.substring(0, 8))
        .replace(/\{target_name\}/g, targetOpenid.substring(0, 8))
        .replace(/\{location_name\}/g, extra.location_name || '')

      if (eventTemplate.effect_stamina_target || eventTemplate.effect_coins_target) {
        const targetPlayer = await PlayerState.findOne({ openid: targetOpenid })
        if (targetPlayer) {
          if (eventTemplate.effect_stamina_target) {
            targetPlayer.stamina = Math.max(0, Math.min(100, targetPlayer.stamina + parseInt(eventTemplate.effect_stamina_target)))
          }
          if (eventTemplate.effect_coins_target) {
            targetPlayer.coins = Math.max(0, targetPlayer.coins + parseInt(eventTemplate.effect_coins_target))
          }
          await targetPlayer.save()
        }
      }

      if (this._oceanBusClient) {
        try {
          await this._oceanBusClient.sendMessage(targetOpenid, {
            msg_type: 'SOCIAL_EVENT',
            event_id: eventType,
            desc: targetMsg,
            stamina_change: parseInt(eventTemplate.effect_stamina_target) || 0,
            coins_change: parseInt(eventTemplate.effect_coins_target) || 0,
            timestamp: Date.now()
          })
        } catch (e) {
          ERROR(`[EventScheduler] 社交事件通知失败 (${targetOpenid}): ${e.message}`)
        }
      }

      INFO(`[EventScheduler] 🎭 社交事件 [${eventType}]: ${targetOpenid.substring(0, 8)} → ${targetMsg.substring(0, 50)}`)
    }
  }

  async triggerWorldEvent(eventType, content) {
    const result = await broadcastManager.sendBroadcast('SYSTEM', content)
    INFO(`[EventScheduler] 🌍 世界事件 [${eventType}]: ${content.substring(0, 50)}`)
    return result
  }

  async triggerRegionalEvent(locationId, content) {
    const { Territory } = require('../models')
    const onlinePlayers = []

    const allPlayers = await PlayerState.find({ deleted: { $ne: true } })
    for (const player of allPlayers) {
      if (player.location.startsWith(locationId.split(':')[0])) {
        onlinePlayers.push(player.openid)
      }
    }

    INFO(`[EventScheduler] 📍 区域事件 [${locationId}]: ${content.substring(0, 50)}, 通知 ${onlinePlayers.length} 名玩家`)
    return { event_type: 'regional', location_id: locationId, recipients: onlinePlayers }
  }

  async triggerGuildEvent(guildId, content) {
    await guildChannelManager.announceToGuild(guildId, content)
    INFO(`[EventScheduler] ⚔️ 公会事件 [${guildId}]: ${content.substring(0, 50)}`)
  }

  async triggerTerritoryTakeoverEvent(territoryId, oldOwner, newOwner) {
    const { Territory } = require('../models')
    const territory = await Territory.findOne({ location_id: territoryId })
    if (!territory) return

    if (newOwner) {
      await this.triggerGuildEvent(
        newOwner,
        `🏰 好消息！我们公会占领了 ${territoryId}！这是我们势力扩张的重要一步！`
      )
    }

    if (oldOwner && oldOwner !== newOwner) {
      await this.triggerGuildEvent(
        oldOwner,
        `⚠️ 警报！我们失去了 ${territoryId} 的控制权...公会士气受损，卷土重来！`
      )
    }
  }

  async triggerGuildUpgrade(guildId, newLevel) {
    const guild = await Guild.findOne({ guild_id: guildId })
    if (!guild) return

    guild.level = newLevel
    await guild.save()

    await this.triggerGuildEvent(
      guildId,
      `🎉 恭喜！我们公会升级了！当前等级: ${newLevel}！公会成员更加团结了！`
    )

    INFO(`[EventScheduler] ⬆️ 公会 ${guildId} 升级至 Lv.${newLevel}`)
  }
}

module.exports = new EventScheduler()
