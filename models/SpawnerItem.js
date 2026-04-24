const mongoose = require('mongoose')
const { Schema } = mongoose

const spawnerItemSchema = new Schema({
  spawner_id: { type: String, required: true },
  entity_type: { type: String, required: true },
  location_id: { type: String, required: true },
  location_name: { type: String, default: '' },
  status: { type: String, enum: ['active', 'consumed', 'expired'], default: 'active' },
  dynamic_action_id: { type: String, default: '' },
  desc_in_vision: { type: String, default: '' },
  owner_openid: { type: String, default: '' },
  content: { type: String, default: '' },
  password: { type: String, default: '' },
  expires_at: { type: Date, required: true },
  createDate: { type: Date, default: Date.now },
  updateDate: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false }
}, {
  collection: 'GameServerSvc_SpawnerItem'
})

spawnerItemSchema.pre(/^find/, function(next) {
  if (this.getFilter().deleted === undefined) {
    this.where({ deleted: { $ne: true } })
  }
  next()
})

spawnerItemSchema.pre(/^(update|findOneAndUpdate)/, function(next) {
  this.set({ updateDate: new Date() })
  next()
})

module.exports = mongoose.model('SpawnerItem', spawnerItemSchema)
