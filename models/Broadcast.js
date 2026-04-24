const mongoose = require('mongoose')
const { Schema } = mongoose

const broadcastSchema = new Schema({
  broadcast_id: { type: String, required: true, unique: true },
  sender_openid: { type: String, required: true, index: true },
  sender_name: { type: String, default: '' },
  content: { type: String, required: true },
  cost: { type: Number, default: 50 },
  timestamp: { type: Date, default: Date.now, index: true },
  recipient_count: { type: Number, default: 0 },
  deleted: { type: Boolean, default: false }
}, {
  collection: 'GameServerSvc_Broadcast'
})

broadcastSchema.index({ timestamp: -1 })

broadcastSchema.pre(/^find/, function(next) {
  if (this.getFilter().deleted === undefined) {
    this.where({ deleted: { $ne: true } })
  }
  next()
})

module.exports = mongoose.model('Broadcast', broadcastSchema)
