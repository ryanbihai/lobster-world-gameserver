const mongoose = require('mongoose')
const { Schema } = mongoose

const buffSchema = new Schema({
  buff_type: { type: String, required: true },
  buff_value: { type: Number, default: 0 },
  source: { type: String, default: '' },
  expires_at: { type: Date, default: null }
}, { _id: false })

const playerStateSchema = new Schema({
  id: { type: String, required: true, unique: true },
  openid: { type: String, required: true },
  agent_code: { type: String, default: '' },
  region_id: { type: String, default: 'CN' },
  timezone: { type: String, default: 'UTC' },
  location: { type: String, default: 'CN:3301:hangzhou:xihu' },
  guild_id: { type: String, default: '' },
  stamina: { type: Number, default: 100 },
  coins: { type: Number, default: 100 },
  guild_influence: { type: Schema.Types.Mixed, default: {} },
  active_buffs: [buffSchema],
  total_distance: { type: Number, default: 0 },
  consecutive_lucky: { type: Number, default: 0 },
  action_counter: { type: Schema.Types.Mixed, default: {} },
  visited_locations: [{ type: String }],
  lastActionTime: { type: Date, default: null },
  createDate: { type: Date, default: Date.now },
  updateDate: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false }
}, {
  collection: 'GameServerSvc_PlayerState'
})

playerStateSchema.pre(/^find/, function(next) {
  if (this.getFilter().deleted === undefined) {
    this.where({ deleted: { $ne: true } })
  }
  next()
})

playerStateSchema.pre(/^(update|findOneAndUpdate)/, function(next) {
  this.set({ updateDate: new Date() })
  next()
})

module.exports = mongoose.model('PlayerState', playerStateSchema)
