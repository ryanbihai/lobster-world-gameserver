const { INFO, ERROR } = require('../../../lib/logSvc')(__filename)
const { Guild, PlayerState } = require('../models')

class GuildChannelManager {
  constructor() {
    this._onlineByGuild = new Map()
    this._pendingMessages = new Map()
  }

  registerPlayer(openid, guildId) {
    if (!guildId) return
    if (!this._onlineByGuild.has(guildId)) {
      this._onlineByGuild.set(guildId, new Set())
    }
    this._onlineByGuild.get(guildId).add(openid)
    INFO(`[GuildChannel] 玩家 ${openid} (${guildId}) 上线`)
  }

  unregisterPlayer(openid, guildId) {
    if (!guildId) return
    const guild = this._onlineByGuild.get(guildId)
    if (guild) {
      guild.delete(openid)
      if (guild.size === 0) {
        this._onlineByGuild.delete(guildId)
      }
    }
  }

  async sendGuildMessage(senderOpenid, content) {
    if (!content || content.trim().length === 0) {
      return { code: 400, msg: 'ERR_EMPTY_CONTENT' }
    }

    const player = await PlayerState.findOne({ openid: senderOpenid })
    if (!player) {
      return { code: 404, msg: 'ERR_PLAYER_NOT_FOUND' }
    }

    if (!player.guild_id) {
      return { code: 400, msg: 'ERR_NOT_IN_GUILD' }
    }

    const guild = await Guild.findOne({ guild_id: player.guild_id })
    if (!guild) {
      return { code: 400, msg: 'ERR_GUILD_NOT_FOUND' }
    }

    const guildId = player.guild_id
    const onlineMembers = this._onlineByGuild.get(guildId) || new Set()
    const memberCount = onlineMembers.size

    this._pendingMessages.set(`${guildId}_${Date.now()}`, {
      guild_id: guildId,
      sender_openid: senderOpenid,
      sender_name: senderOpenid.substring(0, 8),
      content: content.trim(),
      timestamp: new Date().toISOString(),
      recipient_count: memberCount
    })

    INFO(`[GuildChannel] 📨 ${senderOpenid} 在 ${guildId} 发公会消息: "${content.substring(0, 30)}..."`)

    return {
      code: 0,
      msg: 'GUILD_MESSAGE_SENT',
      data: {
        guild_id: guildId,
        guild_name: guild.name,
        recipient_count: memberCount
      }
    }
  }

  getPendingMessages(guildId) {
    const pending = []
    for (const [key, msg] of this._pendingMessages.entries()) {
      if (msg.guild_id === guildId) {
        pending.push(msg)
        this._pendingMessages.delete(key)
      }
    }
    return pending
  }

  async getGuildMembers(guildId) {
    const players = await PlayerState.find({
      guild_id: guildId,
      deleted: { $ne: true }
    })
    return players.map(p => ({
      openid: p.openid,
      stamina: p.stamina,
      coins: p.coins,
      location: p.location
    }))
  }

  async announceToGuild(guildId, content, authorOpenid = 'SYSTEM') {
    const announcement = {
      guild_id: guildId,
      sender_openid: authorOpenid,
      sender_name: authorOpenid === 'SYSTEM' ? '系统公告' : authorOpenid.substring(0, 8),
      content: content,
      timestamp: new Date().toISOString(),
      recipient_count: (this._onlineByGuild.get(guildId) || new Set()).size
    }
    this._pendingMessages.set(`${guildId}_announce_${Date.now()}`, announcement)

    await Guild.updateOne(
      { guild_id: guildId },
      {
        $push: {
          announcements: {
            content: content,
            timestamp: new Date(),
            author_openid: authorOpenid
          }
        }
      }
    )

    INFO(`[GuildChannel] 📢 公会 ${guildId} 公告: ${content}`)
    return announcement
  }

  async incrementMemberCount(guildId) {
    await Guild.updateOne(
      { guild_id: guildId },
      { $inc: { member_count: 1 } }
    )
  }

  async decrementMemberCount(guildId) {
    await Guild.updateOne(
      { guild_id: guildId },
      { $inc: { member_count: -1 } }
    )
  }
}

module.exports = new GuildChannelManager()
