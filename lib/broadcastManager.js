const { INFO, ERROR } = require('../../../lib/logSvc')(__filename)
const { Broadcast, PlayerState } = require('../models')
const util = require('../../../lib/util')

const BROADCAST_COST = 50
const MAX_CONTENT_LENGTH = 200
const RECENT_LIMIT = 10

class BroadcastManager {
  constructor() {
    this._onlinePlayers = new Set()
    this._pendingDeliveries = []
  }

  registerPlayer(openid) {
    this._onlinePlayers.add(openid)
  }

  unregisterPlayer(openid) {
    this._onlinePlayers.delete(openid)
  }

  async sendBroadcast(senderOpenid, content) {
    if (!content || content.trim().length === 0) {
      return { code: 400, msg: 'ERR_EMPTY_CONTENT' }
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return { code: 400, msg: 'ERR_CONTENT_TOO_LONG', data: { max_length: MAX_CONTENT_LENGTH } }
    }

    const isSystem = senderOpenid === 'SYSTEM'

    if (!isSystem) {
      const player = await PlayerState.findOne({ openid: senderOpenid })
      if (!player) {
        return { code: 404, msg: 'ERR_PLAYER_NOT_FOUND' }
      }

      if (player.coins < BROADCAST_COST) {
        return { code: 400, msg: 'ERR_INSUFFICIENT_COINS', data: { required: BROADCAST_COST, current: player.coins } }
      }

      player.coins -= BROADCAST_COST
      await player.save()
    }

    const totalPlayers = await PlayerState.countDocuments({ deleted: { $ne: true } })

    const broadcast = await Broadcast.create({
      broadcast_id: util.createId(),
      sender_openid: senderOpenid,
      sender_name: isSystem ? 'SYSTEM' : senderOpenid.substring(0, 8),
      content: content.trim(),
      cost: isSystem ? 0 : BROADCAST_COST,
      timestamp: new Date(),
      recipient_count: this._onlinePlayers.size
    })

    this._pendingDeliveries.push({
      broadcast_id: broadcast.broadcast_id,
      sender_openid: senderOpenid,
      sender_name: broadcast.sender_name,
      content: broadcast.content,
      timestamp: broadcast.timestamp.toISOString(),
      cost: broadcast.cost
    })

    INFO(`[BroadcastManager] 🏺 ${senderOpenid} 广播: "${content.substring(0, 30)}...", 花费: ${BROADCAST_COST}虾币`)

    return {
      code: 0,
      msg: 'BROADCAST_SENT',
      data: {
        broadcast_id: broadcast.broadcast_id,
        cost: BROADCAST_COST,
        recipient_count: this._onlinePlayers.size,
        total_players: totalPlayers
      }
    }
  }

  getPendingDeliveries() {
    return this._pendingDeliveries.splice(0)
  }

  async getRecentBroadcasts(limit = RECENT_LIMIT) {
    const broadcasts = await Broadcast.find({})
      .sort({ timestamp: -1 })
      .limit(limit)

    return broadcasts.map(b => ({
      broadcast_id: b.broadcast_id,
      sender_openid: b.sender_openid,
      sender_name: b.sender_name,
      content: b.content,
      timestamp: b.timestamp.toISOString(),
      cost: b.cost
    }))
  }

  async getBroadcastsForPlayer(openid) {
    this.registerPlayer(openid)
    const recent = await this.getRecentBroadcasts(5)
    const pending = this.getPendingDeliveries()

    return [...recent, ...pending].slice(0, 5)
  }
}

module.exports = new BroadcastManager()
