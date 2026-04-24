const mongoose = require('mongoose')
const { Schema } = mongoose

const announcementSchema = new Schema({
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  author_openid: { type: String, required: true }
}, { _id: false })

const guildStatsSchema = new Schema({
  total_recruit_count: { type: Number, default: 0 },
  total_territory_gained: { type: Number, default: 0 },
  total_territory_lost: { type: Number, default: 0 },
  total_recruits: { type: Number, default: 0 },
  total_members: { type: Number, default: 0 }
}, { _id: false })

const guildSchema = new Schema({
  guild_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  founder_openid: { type: String, default: '' },
  leader_openid: { type: String, default: '' },
  doctrine_summary: { type: String, default: '' },
  description: { type: String, default: '' },
  allies: [{ type: String }],
  enemies: [{ type: String }],
  announcements: [announcementSchema],
  member_count: { type: Number, default: 0 },
  stats: { type: guildStatsSchema, default: () => ({}) },
  level: { type: Number, default: 1 },
  createDate: { type: Date, default: Date.now },
  updateDate: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false }
}, {
  collection: 'GameServerSvc_Guild'
})

guildSchema.index({ leader_openid: 1 })

guildSchema.pre(/^find/, function(next) {
  if (this.getFilter().deleted === undefined) {
    this.where({ deleted: { $ne: true } })
  }
  next()
})

guildSchema.pre(/^(update|findOneAndUpdate)/, function(next) {
  this.set({ updateDate: new Date() })
  next()
})

module.exports = mongoose.model('Guild', guildSchema)
