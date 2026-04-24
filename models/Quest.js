const mongoose = require('mongoose')
const { Schema } = mongoose

const rewardSchema = new Schema({
  stamina: { type: Number, default: 0 },
  coins: { type: Number, default: 0 },
  buff_type: { type: String, default: '' },
  buff_value: { type: Number, default: 0 }
}, { _id: false })

const questSchema = new Schema({
  quest_id: { type: String, required: true, unique: true },
  player_openid: { type: String, required: true, index: true },
  quest_type: { type: String, enum: ['daily', 'weekly', 'achievement'], default: 'daily', index: true },
  quest_config_id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  trigger_action: { type: String, required: true },
  trigger_params: { type: Schema.Types.Mixed, default: {} },
  target_value: { type: Number, required: true },
  current_progress: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'completed', 'expired', 'claimed'], default: 'active', index: true },
  rewards: { type: rewardSchema, default: () => ({}) },
  claimed_at: { type: Date, default: null },
  created_at: { type: Date, default: Date.now },
  expires_at: { type: Date, required: true, index: true },
  completed_at: { type: Date, default: null },
  deleted: { type: Boolean, default: false }
}, {
  collection: 'GameServerSvc_Quest'
})

questSchema.index({ player_openid: 1, status: 1 })
questSchema.index({ expires_at: 1, status: 1 })

questSchema.pre(/^find/, function(next) {
  if (this.getFilter().deleted === undefined) {
    this.where({ deleted: { $ne: true } })
  }
  next()
})

questSchema.methods.isExpired = function() {
  return this.expires_at < new Date() && this.status === 'active'
}

questSchema.methods.isComplete = function() {
  return this.current_progress >= this.target_value
}

module.exports = mongoose.model('Quest', questSchema)
