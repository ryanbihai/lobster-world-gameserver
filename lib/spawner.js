const { INFO, ERROR } = require('../../../lib/logSvc')(__filename)
const csvLoader = require('./csvLoader')
const { SpawnerItem } = require('../models')
const mongoose = require('mongoose')

class SpawnerManager {
  constructor() {
    this._timer = null
    this._checkIntervalMs = 60 * 60 * 1000
  }

  start() {
    INFO('[Spawner] 调度引擎启动')
    this._tick()
    this._timer = setInterval(() => this._tick(), this._checkIntervalMs)
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  }

  async _tick() {
    try {
      const configs = csvLoader.globalSpawners
      for (const cfg of configs) {
        await this._processSpawnerConfig(cfg)
      }
    } catch (err) {
      ERROR(`[Spawner] tick 失败: ${err.message}`)
    }
  }

  async _processSpawnerConfig(cfg) {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const todayCount = await SpawnerItem.countDocuments({
      spawner_id: cfg.spawner_id,
      createDate: { $gte: todayStart }
    })

    const remaining = cfg.max_count_per_day - todayCount
    if (remaining <= 0) return

    const expiredItems = await SpawnerItem.find({
      spawner_id: cfg.spawner_id,
      status: 'active',
      expires_at: { $lte: now }
    })

    if (expiredItems.length > 0) {
      const ids = expiredItems.map(i => i._id)
      await SpawnerItem.updateMany(
        { _id: { $in: ids } },
        { $set: { status: 'expired' } }
      )
      INFO(`[Spawner] 清理过期交互物: ${cfg.spawner_id}, 数量: ${ids.length}`)
    }

    const activeCount = await SpawnerItem.countDocuments({
      spawner_id: cfg.spawner_id,
      status: 'active'
    })

    const toSpawn = Math.min(remaining, Math.max(0, 3 - activeCount))
    for (let i = 0; i < toSpawn; i++) {
      await this._spawnOne(cfg)
    }
  }

  async _spawnOne(cfg) {
    const candidateLocations = this._findCandidateLocations(cfg.target_tag)
    if (candidateLocations.length === 0) {
      ERROR(`[Spawner] 找不到匹配 tag=${cfg.target_tag} 的地点，跳过 ${cfg.spawner_id}`)
      return
    }

    const existingLocIds = await SpawnerItem.distinct('location_id', {
      spawner_id: cfg.spawner_id,
      status: 'active'
    })

    const availableLocs = candidateLocations.filter(loc => !existingLocIds.includes(loc.id))
    if (availableLocs.length === 0) return

    const chosen = availableLocs[Math.floor(Math.random() * availableLocs.length)]
    const expiresAt = new Date(Date.now() + cfg.duration_hours * 3600 * 1000)

    const item = await SpawnerItem.create({
      spawner_id: cfg.spawner_id,
      entity_type: cfg.entity_type,
      location_id: chosen.id,
      location_name: chosen.name,
      status: 'active',
      dynamic_action_id: cfg.dynamic_action_id || '',
      desc_in_vision: cfg.desc_in_vision || '',
      expires_at: expiresAt
    })

    INFO(`[Spawner] 生成交互物: ${cfg.entity_type} @ ${chosen.name} (${chosen.id}), 过期: ${expiresAt.toISOString()}`)
    return item
  }

  _findCandidateLocations(targetTag) {
    const results = []
    for (const [id, loc] of csvLoader.locations.entries()) {
      const tags = loc.tags || []
      if (targetTag === '*' || tags.includes(targetTag) || loc.type === targetTag) {
        results.push(loc)
      }
    }
    return results
  }

  async checkSpawnerAtLocation(locationId) {
    const now = new Date()
    const items = await SpawnerItem.find({
      location_id: locationId,
      status: 'active',
      expires_at: { $gt: now }
    })
    return items
  }

  async deactivateItem(itemId) {
    const item = await SpawnerItem.findOneAndUpdate(
      { _id: itemId, status: 'active' },
      { $set: { status: 'consumed' } },
      { new: true }
    )
    return item
  }
}

module.exports = new SpawnerManager()
