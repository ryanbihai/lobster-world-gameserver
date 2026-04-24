const fs = require('fs')
const path = require('path')
const csv = require('csv-parser')
const { INFO, ERROR } = require('../../../lib/logSvc')(__filename)

class CsvLoader {
  constructor() {
    this.locations = new Map()
    this.actions = []
    this.randomEvents = []
    this.travelEvents = []
    this.socialEvents = []
    this.contextActions = new Map()
    this.globalSpawners = []
    this.guilds = new Map()
    this.dailyPuzzles = []
    
    this.dataDir = path.join(__dirname, '../data')
  }

  async init() {
    await this.loadLocations()
    await this.loadActions()
    await this.loadRandomEvents()
    await this.loadTravelEvents()
    await this.loadSocialEvents()
    await this.loadContextActions()
    await this.loadGlobalSpawners()
    await this.loadGuilds()
    await this.loadDailyPuzzles()
    INFO('✅ GameServer CSV 配置表加载完毕')
  }

  loadLocations() {
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.dataDir, 'locations.csv'))
        .pipe(csv())
        .on('data', (row) => {
          if (row.id) {
            if (row.longitude) row.longitude = parseFloat(row.longitude)
            if (row.latitude) row.latitude = parseFloat(row.latitude)
            if (row.tags) {
              row.tags = row.tags.split('|').map(t => t.trim()).filter(t => t)
            } else {
              row.tags = []
            }
            this.locations.set(row.id, row)
          }
        })
        .on('end', resolve)
        .on('error', reject)
    })
  }

  loadActions() {
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.dataDir, 'actions.csv'))
        .pipe(csv())
        .on('data', (row) => {
          if (row.action_id) {
            row.cost_stamina = parseInt(row.cost_stamina) || 0
            row.cost_coins = parseInt(row.cost_coins) || 0
            row.probability_event = parseFloat(row.probability_event) || 0
            this.actions.push(row)
          }
        })
        .on('end', resolve)
        .on('error', reject)
    })
  }

  loadRandomEvents() {
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.dataDir, 'random_events.csv'))
        .pipe(csv())
        .on('data', (row) => {
          if (row.event_id) {
            row.weight = parseInt(row.weight) || 0
            row.effect_stamina = parseInt(row.effect_stamina) || 0
            row.effect_coins = parseInt(row.effect_coins) || 0
            this.randomEvents.push(row)
          }
        })
        .on('end', resolve)
        .on('error', reject)
    })
  }

  loadTravelEvents() {
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.dataDir, 'travel_events.csv'))
        .pipe(csv())
        .on('data', (row) => {
          if (row.event_id) {
            row.weight = parseInt(row.weight) || 0
            row.effect_stamina = parseInt(row.effect_stamina) || 0
            row.effect_coins = parseInt(row.effect_coins) || 0
            this.travelEvents.push(row)
          }
        })
        .on('end', resolve)
        .on('error', reject)
    })
  }

  loadSocialEvents() {
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.dataDir, 'social_events.csv'))
        .pipe(csv())
        .on('data', (row) => {
          if (row.event_id) {
            row.effect_stamina_initiator = parseInt(row.effect_stamina_initiator) || 0
            row.effect_coins_initiator = parseInt(row.effect_coins_initiator) || 0
            row.effect_stamina_target = parseInt(row.effect_stamina_target) || 0
            row.effect_coins_target = parseInt(row.effect_coins_target) || 0
            this.socialEvents.push(row)
          }
        })
        .on('end', resolve)
        .on('error', reject)
    })
  }

  loadContextActions() {
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.dataDir, 'context_actions.csv'))
        .pipe(csv())
        .on('data', (row) => {
          if (row.trigger_event_id && row.action_id) {
            row.cost_stamina = parseInt(row.cost_stamina) || 0
            row.cost_coins = parseInt(row.cost_coins) || 0
            row.probability_event = parseFloat(row.probability_event) || 0
            
            if (!this.contextActions.has(row.trigger_event_id)) {
              this.contextActions.set(row.trigger_event_id, [])
            }
            this.contextActions.get(row.trigger_event_id).push(row)
          }
        })
        .on('end', resolve)
        .on('error', reject)
    })
  }

  loadGlobalSpawners() {
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.dataDir, 'global_spawners.csv'))
        .pipe(csv())
        .on('data', (row) => {
          if (row.spawner_id) {
            row.max_count_per_day = parseInt(row.max_count_per_day) || 0
            row.duration_hours = parseInt(row.duration_hours) || 0
            this.globalSpawners.push(row)
          }
        })
        .on('end', resolve)
        .on('error', reject)
    })
  }

  loadGuilds() {
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.dataDir, 'guilds.csv'))
        .pipe(csv())
        .on('data', (row) => {
          if (row.guild_id) {
            this.guilds.set(row.guild_id, row)
          }
        })
        .on('end', resolve)
        .on('error', reject)
    })
  }

  loadDailyPuzzles() {
    return new Promise((resolve, reject) => {
      fs.createReadStream(path.join(this.dataDir, 'daily_puzzles.csv'))
        .pipe(csv())
        .on('data', (row) => {
          if (row.quest_config_id) {
            row.target_value = parseInt(row.target_value) || 1
            row.reward_stamina = parseInt(row.reward_stamina) || 0
            row.reward_coins = parseInt(row.reward_coins) || 0
            row.reward_buff_value = parseInt(row.reward_buff_value) || 0
            try {
              row.trigger_params = JSON.parse(row.trigger_params || '{}')
            } catch {
              row.trigger_params = {}
            }
            this.dailyPuzzles.push(row)
          }
        })
        .on('end', resolve)
        .on('error', reject)
    })
  }

  getLocation(id) {
    return this.locations.get(id)
  }

  getGuild(id) {
    return this.guilds.get(id)
  }

  getAvailableActions(locationId) {
    const loc = this.getLocation(locationId)
    if (!loc) return []
    const locTags = loc.tags || []
    
    return this.actions.filter(a => {
      if (a.required_tag === '*') return true
      return locTags.includes(a.required_tag)
    })
  }

  getContextActions(triggerEventId) {
    return this.contextActions.get(triggerEventId) || []
  }

  rollRandomEvent(locationId) {
    const loc = this.getLocation(locationId)
    if (!loc) return null
    const locTags = loc.tags || []

    const candidates = this.randomEvents.filter(e => {
      if (e.trigger_tag === '*') return true
      return locTags.includes(e.trigger_tag)
    })
    return this._rollByWeight(candidates)
  }

  rollTravelEvent() {
    return this._rollByWeight(this.travelEvents)
  }

  _rollByWeight(candidates) {
    if (candidates.length === 0) return null
    const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0)
    let randomNum = Math.random() * totalWeight
    for (const item of candidates) {
      if (randomNum < item.weight) return item
      randomNum -= item.weight
    }
    return candidates[candidates.length - 1]
  }

  calculateDistance(locId1, locId2) {
    const loc1 = this.getLocation(locId1)
    const loc2 = this.getLocation(locId2)
    if (!loc1 || !loc2 || !loc1.longitude || !loc2.longitude) return null

    const R = 6371
    const dLat = this._deg2rad(loc2.latitude - loc1.latitude)
    const dLon = this._deg2rad(loc2.longitude - loc1.longitude)
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this._deg2rad(loc1.latitude)) * Math.cos(this._deg2rad(loc2.latitude)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  _deg2rad(deg) {
    return deg * (Math.PI/180)
  }

  getNearbyLocations(currentLocId, limit = 5, maxDistanceKm = 500) {
    const currentLoc = this.getLocation(currentLocId)
    if (!currentLoc) return []

    const nearby = []
    for (const [id, loc] of this.locations.entries()) {
      if (id === currentLocId) continue
      if (loc.type !== currentLoc.type) continue
      if (loc.type === 'poi' && loc.parent_id !== currentLoc.parent_id) continue

      const distance = this.calculateDistance(currentLocId, id)
      if (distance !== null && distance <= maxDistanceKm) {
        nearby.push({ loc, distance })
      }
    }

    nearby.sort((a, b) => a.distance - b.distance)
    return nearby.slice(0, limit).map(item => ({
      id: item.loc.id,
      name: item.loc.name,
      distance_km: Math.round(item.distance),
      cost_stamina: Math.max(5, Math.round(item.distance / 10))
    }))
  }

  getRandomDailyPuzzles(count = 3) {
    if (this.dailyPuzzles.length === 0) return []
    const shuffled = [...this.dailyPuzzles].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
  }
}

module.exports = new CsvLoader()
