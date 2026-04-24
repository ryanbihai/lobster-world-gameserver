const { INFO } = require('../../../lib/logSvc')(__filename)
const csvLoader = require('./csvLoader')
const { Territory } = require('../models')

const ADVOCATE_INFLUENCE_GAIN = 10
const TAKEOVER_THRESHOLD = 50

class TerritoryManager {
  async addInfluence(openid, locationId, guildId) {
    if (!guildId) return null

    let territory = await Territory.findOne({ location_id: locationId })
    if (!territory) {
      territory = await Territory.create({
        location_id: locationId,
        owner_guild: '',
        influences: {}
      })
    }

    if (!territory.influences) territory.influences = {}
    if (!territory.influences[guildId]) territory.influences[guildId] = 0

    territory.influences[guildId] += ADVOCATE_INFLUENCE_GAIN
    territory.markModified('influences')
    const totalInfluence = territory.influences[guildId]

    const takeoverResult = this._checkTerritoryTakeover(territory)

    await territory.save()

    return {
      location_id: locationId,
      guild_id: guildId,
      influence_gain: ADVOCATE_INFLUENCE_GAIN,
      total_influence: totalInfluence,
      takeover: takeoverResult
    }
  }

  _checkTerritoryTakeover(territory) {
    const influences = territory.influences
    if (!influences) return null

    let dominantGuild = null
    let dominantScore = 0

    for (const [guildId, score] of Object.entries(influences)) {
      if (score > dominantScore) {
        dominantScore = score
        dominantGuild = guildId
      }
    }

    if (dominantScore < TAKEOVER_THRESHOLD) return null

    const previousOwner = territory.owner_guild

    if (previousOwner && previousOwner !== dominantGuild) {
      territory.owner_guild = dominantGuild
      territory.influences[previousOwner] = 0
      territory.markModified('influences')
      INFO(`[Territory] 🏰 地标易主! ${territory.location_id}: ${previousOwner} → ${dominantGuild} (影响力: ${dominantScore})`)
      return {
        previous_owner: previousOwner,
        new_owner: dominantGuild,
        score: dominantScore
      }
    }

    if (!previousOwner) {
      territory.owner_guild = dominantGuild
      INFO(`[Territory] 🏰 地标被占领! ${territory.location_id} → ${dominantGuild} (影响力: ${dominantScore})`)
      return {
        previous_owner: null,
        new_owner: dominantGuild,
        score: dominantScore
      }
    }

    return null
  }

  async getTerritoryOwner(locationId) {
    const territory = await Territory.findOne({ location_id: locationId })
    return territory ? territory.owner_guild : null
  }

  async getTerritoryInfo(locationId) {
    const territory = await Territory.findOne({ location_id: locationId })
    const loc = csvLoader.getLocation(locationId)
    return {
      location_id: locationId,
      location_name: loc ? loc.name : '',
      owner_guild: territory ? territory.owner_guild : null,
      influences: territory ? territory.influences : {}
    }
  }

  async getAllTerritories() {
    const territories = await Territory.find({})
    const result = []
    for (const t of territories) {
      const loc = csvLoader.getLocation(t.location_id)
      result.push({
        location_id: t.location_id,
        location_name: loc ? loc.name : '',
        owner_guild: t.owner_guild,
        influences: t.influences
      })
    }
    return result
  }
}

module.exports = new TerritoryManager()
