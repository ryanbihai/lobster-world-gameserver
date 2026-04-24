const mongoose = require('mongoose')
const { Schema } = mongoose

const achievementSchema = new Schema({
  achievement_id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  condition_type: { type: String, required: true },
  condition_value: { type: Number, default: 0 },
  reward_coins: { type: Number, default: 0 },
  rarity: { type: String, enum: ['common', 'rare', 'epic', 'legendary'], default: 'common' },
  createDate: { type: Date, default: Date.now }
}, {
  collection: 'GameServerSvc_Achievement'
})

const playerAchievementSchema = new Schema({
  openid: { type: String, required: true, index: true },
  achievement_id: { type: String, required: true },
  unlocked_at: { type: Date, default: Date.now },
  reward_claimed: { type: Boolean, default: false }
}, {
  collection: 'GameServerSvc_PlayerAchievement'
})

playerAchievementSchema.index({ openid: 1, achievement_id: 1 }, { unique: true })

const Achievement = mongoose.model('Achievement', achievementSchema)
const PlayerAchievement = mongoose.model('PlayerAchievement', playerAchievementSchema)

module.exports = { Achievement, PlayerAchievement }
