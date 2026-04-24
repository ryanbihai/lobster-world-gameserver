const fs = require('fs')
const path = require('path')
const csv = require('csv-parser')
const { INFO, ERROR } = require('../../../lib/logSvc')(__filename)
const { Achievement, PlayerAchievement } = require('../models')
const csvLoader = require('./csvLoader')

class AchievementManager {
  constructor() {
    this.achievements = []
    this._oceanBusClient = null
  }

  setOceanBusClient(client) {
    this._oceanBusClient = client
  }

  async init() {
    await this._loadAchievementsFromCSV()
    await this._seedAchievements()
    INFO(`[AchievementManager] 成就系统初始化完成，共 ${this.achievements.length} 个成就`)
  }

  async _loadAchievementsFromCSV() {
    const dataPath = path.join(__dirname, '../data/achievements.csv')
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(dataPath)) {
        INFO('[AchievementManager] achievements.csv 不存在，跳过加载')
        resolve()
        return
      }
      fs.createReadStream(dataPath)
        .pipe(csv())
        .on('data', (row) => {
          if (row.id) {
            this.achievements.push({
              achievement_id: row.id,
              name: row.name,
              description: row.description,
              condition_type: row.condition_type,
              condition_value: parseInt(row.condition_value) || 0,
              reward_coins: parseInt(row.reward_coins) || 0,
              rarity: row.rarity || 'common'
            })
          }
        })
        .on('end', resolve)
        .on('error', reject)
    })
  }

  async _seedAchievements() {
    for (const ach of this.achievements) {
      await Achievement.findOneAndUpdate(
        { achievement_id: ach.achievement_id },
        ach,
        { upsert: true, new: true }
      )
    }
  }

  async checkAchievements(openid, player, trigger) {
    const unlocked = []
    for (const ach of this.achievements) {
      const existing = await PlayerAchievement.findOne({ openid, achievement_id: ach.achievement_id })
      if (existing) continue

      let met = false
      switch (ach.condition_type) {
        case 'total_distance':
          met = (player.total_distance || 0) >= ach.condition_value
          break
        case 'check_in_city':
          met = this._checkCityPOIs(player, ach.condition_value)
          break
        case 'consecutive_lucky':
          met = (player.consecutive_lucky || 0) >= ach.condition_value
          break
        case 'action_count_buy_coffee':
          met = (player.action_counter?.buy_coffee || 0) >= ach.condition_value
          break
        case 'tag_interaction_historical':
          met = (player.action_counter?.historical || 0) >= ach.condition_value
          break
        default:
          break
      }

      if (met) {
        await PlayerAchievement.create({
          openid,
          achievement_id: ach.achievement_id,
          unlocked_at: new Date()
        })
        if (ach.reward_coins > 0) {
          player.coins = (player.coins || 0) + ach.reward_coins
          await player.save()
        }
        unlocked.push(ach)
        INFO(`[AchievementManager] 🎖️ 玩家 ${openid.substring(0, 8)} 解锁成就: ${ach.name} (${ach.achievement_id})`)
        await this._notifyAchievement(openid, ach)
      }
    }
    return unlocked
  }

  _checkCityPOIs(player, city) {
    const visited = player.visited_locations || []
    const allPOIs = []
    for (const [, loc] of csvLoader.locations.entries()) {
      if (loc.type === 'poi' && (loc.city === city || loc.name?.includes('杭州'))) {
        allPOIs.push(loc.id)
      }
    }
    return allPOIs.length > 0 && allPOIs.every(id => visited.includes(id))
  }

  async _notifyAchievement(openid, ach) {
    if (!this._oceanBusClient) return
    try {
      await this._oceanBusClient.sendMessage(openid, {
        msg_type: 'ACHIEVEMENT_UNLOCKED',
        achievement: {
          id: ach.achievement_id,
          name: ach.name,
          description: ach.description,
          reward_coins: ach.reward_coins,
          rarity: ach.rarity
        },
        timestamp: Date.now()
      })
    } catch (e) {
      ERROR(`[AchievementManager] 成就通知失败 (${openid}): ${e.message}`)
    }
  }

  async getPlayerAchievements(openid) {
    const unlocked = await PlayerAchievement.find({ openid })
    const unlockedIds = new Set(unlocked.map(u => u.achievement_id))
    return {
      unlocked: unlocked.map(u => {
        const ach = this.achievements.find(a => a.achievement_id === u.achievement_id)
        return ach ? { ...ach, unlocked_at: u.unlocked_at } : null
      }).filter(Boolean),
      locked: this.achievements.filter(a => !unlockedIds.has(a.achievement_id))
    }
  }
}

module.exports = new AchievementManager()
