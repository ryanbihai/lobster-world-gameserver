const { INFO, ERROR } = require('../../../lib/logSvc')(__filename)
const { SpawnerItem } = require('../models')
const csvLoader = require('./csvLoader')

const BOTTLE_DURATION_HOURS = 72

class MessageBottleManager {
  async buryBottle(openid, locationId, content) {
    if (!content || content.trim().length === 0) {
      return { code: 400, msg: 'ERR_EMPTY_CONTENT' }
    }

    const loc = csvLoader.getLocation(locationId)
    if (!loc) {
      return { code: 400, msg: 'ERR_INVALID_LOCATION' }
    }

    const existingBottles = await SpawnerItem.countDocuments({
      entity_type: 'message_bottle',
      location_id: locationId,
      status: 'active',
      owner_openid: openid
    })

    if (existingBottles >= 3) {
      return { code: 400, msg: 'ERR_BOTTLE_LIMIT_REACHED' }
    }

    const expiresAt = new Date(Date.now() + BOTTLE_DURATION_HOURS * 3600 * 1000)

    const bottle = await SpawnerItem.create({
      spawner_id: 'manual_bottle',
      entity_type: 'message_bottle',
      location_id: locationId,
      location_name: loc.name || '',
      status: 'active',
      dynamic_action_id: 'dig_bottle',
      desc_in_vision: '沙地上微微露出一个瓶口，似乎有人在这里埋了什么东西',
      owner_openid: openid,
      content: content.trim(),
      expires_at: expiresAt
    })

    INFO(`[MessageBottle] 🏺 ${openid} 在 ${locationId} 埋设了漂流瓶`)
    return {
      code: 0,
      msg: 'BOTTLE_BURIED',
      data: {
        bottle_id: bottle._id,
        location_id: locationId,
        expires_at: expiresAt.toISOString()
      }
    }
  }

  async digBottle(openid, locationId) {
    const now = new Date()
    const bottle = await SpawnerItem.findOne({
      entity_type: 'message_bottle',
      location_id: locationId,
      status: 'active',
      expires_at: { $gt: now },
      owner_openid: { $ne: openid }
    }).sort({ createDate: -1 })

    if (!bottle) {
      return { code: 404, msg: 'ERR_NO_BOTTLE', data: { hint: '这里没有别人埋的漂流瓶' } }
    }

    bottle.status = 'consumed'
    await bottle.save()

    INFO(`[MessageBottle] 📨 ${openid} 在 ${locationId} 挖到了 ${bottle.owner_openid} 的漂流瓶`)
    return {
      code: 0,
      msg: 'BOTTLE_DUG',
      data: {
        bottle_id: bottle._id,
        content: bottle.content,
        from: bottle.owner_openid,
        buried_at: bottle.createDate.toISOString()
      }
    }
  }

  async checkBottlesAt(locationId) {
    const now = new Date()
    const count = await SpawnerItem.countDocuments({
      entity_type: 'message_bottle',
      location_id: locationId,
      status: 'active',
      expires_at: { $gt: now }
    })
    return count
  }
}

module.exports = new MessageBottleManager()
