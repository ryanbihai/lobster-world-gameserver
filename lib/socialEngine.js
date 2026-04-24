const { INFO, ERROR } = require('../../../lib/logSvc')(__filename)
const { SocialRelation, Guild, PlayerState } = require('../models')
const util = require('../../../lib/util')

const GUILD_UPGRADE_MEMBER_THRESHOLD = 10

class SocialEngine {
  async addRelation(fromOpenid, toOpenid, relationType, notes = '') {
    if (fromOpenid === toOpenid) {
      return { code: 400, msg: 'ERR_CANNOT_RELATE_TO_SELF' }
    }

    const existing = await SocialRelation.findOne({
      from_openid: fromOpenid,
      to_openid: toOpenid
    })

    if (existing) {
      existing.relation_type = relationType
      existing.interaction_count += 1
      existing.last_interaction = new Date()
      if (notes) existing.notes = notes
      await existing.save()
      return { code: 0, msg: 'RELATION_UPDATED', data: existing }
    }

    const relation = await SocialRelation.create({
      relation_id: util.createId(),
      from_openid: fromOpenid,
      to_openid: toOpenid,
      relation_type: relationType,
      interaction_count: 1,
      last_interaction: new Date(),
      notes: notes,
      mutual: false
    })

    INFO(`[SocialEngine] 🤝 关系建立: ${fromOpenid} → ${toOpenid} (${relationType})`)
    return { code: 0, msg: 'RELATION_CREATED', data: relation }
  }

  async updateRelation(fromOpenid, toOpenid, interactionType = 'interact') {
    const relation = await SocialRelation.findOne({
      from_openid: fromOpenid,
      to_openid: toOpenid
    })

    if (!relation) return null

    relation.interaction_count += 1
    relation.last_interaction = new Date()
    await relation.save()
    return relation
  }

  async getRelations(openid, relationType = null) {
    const query = {
      deleted: { $ne: true },
      $or: [
        { from_openid: openid },
        { to_openid: openid }
      ]
    }
    if (relationType) {
      query.relation_type = relationType
    }
    return SocialRelation.find(query).sort({ last_interaction: -1 })
  }

  async getFriends(openid) {
    const relations = await this.getRelations(openid, 'friend')
    return this._enrichRelations(openid, relations)
  }

  async _enrichRelations(openid, relations) {
    const enriched = []
    for (const rel of relations) {
      const otherOpenid = rel.from_openid === openid ? rel.to_openid : rel.from_openid
      const player = await PlayerState.findOne({ openid: otherOpenid })
      enriched.push({
        relation_id: rel.relation_id,
        openid: otherOpenid,
        relation_type: rel.relation_type,
        interaction_count: rel.interaction_count,
        last_interaction: rel.last_interaction,
        notes: rel.notes,
        current_location: player ? player.location : null,
        guild_id: player ? player.guild_id : null
      })
    }
    return enriched
  }

  async recordRecruitSuccess(recruiterOpenid, targetOpenid, guildId) {
    await this.addRelation(recruiterOpenid, targetOpenid, 'follower', `成功招募至 ${guildId}`)

    await PlayerState.updateOne(
      { openid: targetOpenid },
      { $set: { guild_id: guildId } }
    )

    const guild = await Guild.findOne({ guild_id: guildId })
    if (guild) {
      guild.stats.total_recruit_count += 1
      guild.stats.total_recruits += 1
      await guild.save()

      if (guild.member_count >= GUILD_UPGRADE_MEMBER_THRESHOLD && guild.level < 2) {
        guild.level = 2
        await guild.save()
        INFO(`[SocialEngine] ⬆️ 公会 ${guildId} 升级至 Lv.2 (成员数: ${guild.member_count})`)
      }
    }

    INFO(`[SocialEngine] 📣 招募成功: ${recruiterOpenid} → ${targetOpenid} (${guildId})`)
  }

  async setGuildAlly(guildId1, guildId2) {
    await Guild.updateOne({ guild_id: guildId1 }, { $addToSet: { allies: guildId2 } })
    await Guild.updateOne({ guild_id: guildId2 }, { $addToSet: { allies: guildId1 } })
    INFO(`[SocialEngine] 🤝 联盟建立: ${guildId1} ↔ ${guildId2}`)
  }

  async setGuildEnemy(guildId1, guildId2) {
    await Guild.updateOne({ guild_id: guildId1 }, { $addToSet: { enemies: guildId2 } })
    await Guild.updateOne({ guild_id: guildId2 }, { $addToSet: { enemies: guildId1 } })
    INFO(`[SocialEngine] ⚔️ 敌对建立: ${guildId1} ⟛ ${guildId2}`)
  }

  async updateGuildStats(guildId, statKey, delta = 1) {
    const allowed = [
      'total_territory_gained',
      'total_territory_lost',
      'total_recruits',
      'total_members'
    ]
    if (!allowed.includes(statKey)) return

    await Guild.updateOne(
      { guild_id: guildId },
      { $inc: { [`stats.${statKey}`]: delta } }
    )
  }

  async getGuildLeaderboard(limit = 10) {
    const guilds = await Guild.find({ deleted: { $ne: true } })
      .sort({ 'stats.total_territory_gained': -1, member_count: -1 })
      .limit(limit)

    return guilds.map(f => ({
      guild_id: f.guild_id,
      name: f.name,
      level: f.level,
      member_count: f.member_count,
      stats: f.stats,
      allies_count: (f.allies || []).length,
      enemies_count: (f.enemies || []).length
    }))
  }

  async blockPlayer(blockerOpenid, blockedOpenid) {
    return this.addRelation(blockerOpenid, blockedOpenid, 'block', '')
  }

  async isBlockedBy(blockerOpenid, blockedOpenid) {
    const block = await SocialRelation.findOne({
      from_openid: blockerOpenid,
      to_openid: blockedOpenid,
      relation_type: 'block',
      deleted: { $ne: true }
    })
    return !!block
  }

  async isBlocked(openid1, openid2) {
    return !!(await this.isBlockedBy(openid1, openid2)) || !!(await this.isBlockedBy(openid2, openid1))
  }
}

module.exports = new SocialEngine()
