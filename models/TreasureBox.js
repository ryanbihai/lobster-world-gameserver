const mongoose = require('mongoose')
const { Schema } = mongoose

const participantSchema = new Schema({
  openid: { type: String, required: true },
  password: { type: String, required: true },
  joined_at: { type: Date, default: Date.now }
}, { _id: false })

const treasureBoxSchema = new Schema({
  spawner_item_id: { type: Schema.Types.ObjectId, ref: 'SpawnerItem' },
  location_id: { type: String, required: true },
  location_name: { type: String, default: '' },
  status: { type: String, enum: ['waiting_first', 'waiting_second', 'opened', 'expired'], default: 'waiting_first' },
  participants: [participantSchema],
  rewards: {
    stamina: { type: Number, default: 0 },
    coins: { type: Number, default: 0 }
  },
  expires_at: { type: Date, required: true },
  createDate: { type: Date, default: Date.now },
  updateDate: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false }
}, {
  collection: 'GameServerSvc_TreasureBox'
})

treasureBoxSchema.pre(/^find/, function(next) {
  if (this.getFilter().deleted === undefined) {
    this.where({ deleted: { $ne: true } })
  }
  next()
})

treasureBoxSchema.pre(/^(update|findOneAndUpdate)/, function(next) {
  this.set({ updateDate: new Date() })
  next()
})

module.exports = mongoose.model('TreasureBox', treasureBoxSchema)
