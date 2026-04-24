const { INFO, ERROR } = require('../../../lib/logSvc')(__filename)
const { Quest, PlayerState } = require('../models')
const csvLoader = require('./csvLoader')
const util = require('../../../lib/util')

const DAILY_QUEST_COUNT = 3
const DAILY_RESET_HOUR = 0

class QuestManager {
  start() {
    this._scheduleNextReset()
    INFO('[QuestManager] 每日任务引擎已启动')
  }

  _scheduleNextReset() {
    const now = new Date()
    const nextReset = new Date(now)
    nextReset.setUTCHours(DAILY_RESET_HOUR, 0, 0, 0)
    if (nextReset <= now) {
      nextReset.setUTCDate(nextReset.getUTCDate() + 1)
    }
    const delayMs = nextReset.getTime() - now.getTime()
    INFO(`[QuestManager] 下次任务重置: ${nextReset.toISOString()} (${Math.round(delayMs / 3600000)}小时后)`)
    setTimeout(async () => {
      await this._resetDailyQuests()
      this._scheduleNextReset()
    }, delayMs)
  }

  async _resetDailyQuests() {
    try {
      const expired = await Quest.updateMany(
        { quest_type: 'daily', status: 'active', expires_at: { $lte: new Date() } },
        { $set: { status: 'expired' } }
      )
      INFO(`[QuestManager] 每日任务已过期: ${expired.modifiedCount} 条`)
    } catch (err) {
      ERROR(`[QuestManager] 重置每日任务失败: ${err.message}`)
    }
  }

  async generateDailyQuests(playerOpenid) {
    const now = new Date()
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

    const existingActive = await Quest.find({
      player_openid: playerOpenid,
      quest_type: 'daily',
      status: 'active'
    })

    if (existingActive.length >= DAILY_QUEST_COUNT) {
      return existingActive
    }

    const puzzleConfigs = csvLoader.getRandomDailyPuzzles(DAILY_QUEST_COUNT)
    const quests = []
    const expiresAt = new Date(todayStart.getTime() + 24 * 3600 * 1000)

    for (const cfg of puzzleConfigs) {
      const quest = await Quest.create({
        quest_id: util.createId(),
        player_openid: playerOpenid,
        quest_type: cfg.quest_type || 'daily',
        quest_config_id: cfg.quest_config_id,
        title: cfg.title,
        description: cfg.description,
        trigger_action: cfg.trigger_action,
        trigger_params: cfg.trigger_params || {},
        target_value: cfg.target_value,
        current_progress: 0,
        status: 'active',
        rewards: {
          stamina: cfg.reward_stamina || 0,
          coins: cfg.reward_coins || 0,
          buff_type: cfg.reward_buff_type || '',
          buff_value: cfg.reward_buff_value || 0
        },
        expires_at: expiresAt
      })
      quests.push(quest)
      INFO(`[QuestManager] 为 ${playerOpenid} 生成每日任务: ${cfg.title}`)
    }

    return quests
  }

  async checkQuestProgress(playerOpenid, actionId, params = {}) {
    const activeQuests = await Quest.find({
      player_openid: playerOpenid,
      quest_type: 'daily',
      status: 'active'
    })

    const updatedQuests = []
    for (const quest of activeQuests) {
      const matched = this._matchAction(quest, actionId, params)
      if (!matched) continue

      quest.current_progress += 1
      if (quest.current_progress >= quest.target_value && quest.status === 'active') {
        quest.status = 'completed'
        quest.completed_at = new Date()
        INFO(`[QuestManager] 玩家 ${playerOpenid} 完成任务: ${quest.title}`)
      }
      await quest.save()
      updatedQuests.push(quest)
    }

    return updatedQuests
  }

  _matchAction(quest, actionId, params) {
    const trigger = quest.trigger_action

    if (trigger === 'discover_poi') {
      return actionId === 'DISCOVER_POI' || params.action_id === 'DISCOVER_POI'
    }

    if (trigger === 'guild_advocate') {
      if (quest.trigger_params && quest.trigger_params.at_territory) {
        return actionId === 'guild_advocate' && params.at_territory === true
      }
      return actionId === 'guild_advocate'
    }

    if (trigger === 'move') {
      return actionId === 'move'
    }

    if (trigger === 'bury_bottle') {
      return actionId === 'BURY_MESSAGE'
    }

    if (trigger === 'dig_bottle') {
      return actionId === 'DIG_MESSAGE'
    }

    if (trigger === 'open_treasure_box') {
      return actionId === 'OPEN_TREASURE_BOX' && params.msg === 'BOX_OPENED'
    }

    if (trigger === 'treasure_partner') {
      return actionId === 'OPEN_TREASURE_BOX' && params.msg === 'BOX_OPENED'
    }

    if (trigger === 'join_guild') {
      return actionId === 'JOIN_GUILD'
    }

    if (trigger === 'found_guild') {
      return actionId === 'FOUND_GUILD'
    }

    if (trigger === 'do_action') {
      if (quest.trigger_params && quest.trigger_params.action_id) {
        return params.action_id === quest.trigger_params.action_id
      }
      return params.action_id === actionId
    }

    if (trigger === 'travel_distance') {
      if (actionId === 'move' && params.distance_km) {
        return params.distance_km >= (quest.trigger_params.min_km || 0)
      }
      return false
    }

    return false
  }

  async claimReward(questId, playerOpenid) {
    const quest = await Quest.findOne({ quest_id: questId, player_openid: playerOpenid })
    if (!quest) {
      return { code: 404, msg: 'ERR_QUEST_NOT_FOUND' }
    }

    if (quest.status === 'claimed') {
      return { code: 400, msg: 'ERR_QUEST_ALREADY_CLAIMED' }
    }

    if (quest.status !== 'completed') {
      return { code: 400, msg: 'ERR_QUEST_NOT_COMPLETED' }
    }

    const player = await PlayerState.findOne({ openid: playerOpenid })
    if (!player) {
      return { code: 404, msg: 'ERR_PLAYER_NOT_FOUND' }
    }

    const rewards = quest.rewards || {}
    player.stamina = Math.min(100, player.stamina + (rewards.stamina || 0))
    player.coins += (rewards.coins || 0)

    if (rewards.buff_type && rewards.buff_value > 0) {
      if (!player.active_buffs) player.active_buffs = []
      player.active_buffs.push({
        buff_type: rewards.buff_type,
        buff_value: rewards.buff_value,
        source: 'quest_reward',
        expires_at: new Date(Date.now() + 24 * 3600 * 1000)
      })
    }

    quest.status = 'claimed'
    quest.claimed_at = new Date()
    await player.save()
    await quest.save()

    INFO(`[QuestManager] 玩家 ${playerOpenid} 领取任务奖励: +${rewards.stamina}体力 +${rewards.coins}币`)
    return { code: 0, msg: 'REWARD_CLAIMED', data: { rewards, player } }
  }

  async getPlayerQuests(playerOpenid) {
    return Quest.find({
      player_openid: playerOpenid,
      quest_type: 'daily'
    }).sort({ created_at: -1 })
  }

  async refreshQuestsForAll() {
    const activePlayers = await PlayerState.find({
      deleted: { $ne: true }
    })

    for (const player of activePlayers) {
      await this.generateDailyQuests(player.openid)
    }

    INFO(`[QuestManager] 为 ${activePlayers.length} 名玩家刷新每日任务`)
  }
}

module.exports = new QuestManager()
