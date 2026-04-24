const mongoose = require('mongoose')
const { Schema } = mongoose

const socialRelationSchema = new Schema({
  relation_id: { type: String, required: true, unique: true },
  from_openid: { type: String, required: true, index: true },
  to_openid: { type: String, required: true, index: true },
  relation_type: {
    type: String,
    enum: ['friend', 'enemy', 'mentor', 'rival', 'follower', 'block'],
    required: true
  },
  interaction_count: { type: Number, default: 1 },
  last_interaction: { type: Date, default: Date.now },
  notes: { type: String, default: '' },
  mutual: { type: Boolean, default: false },
  createDate: { type: Date, default: Date.now },
  updateDate: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false }
}, {
  collection: 'GameServerSvc_SocialRelation'
})

socialRelationSchema.index({ from_openid: 1, relation_type: 1 })
socialRelationSchema.index({ to_openid: 1, relation_type: 1 })
socialRelationSchema.index({ from_openid: 1, to_openid: 1 }, { unique: true })

socialRelationSchema.pre(/^find/, function(next) {
  if (this.getFilter().deleted === undefined) {
    this.where({ deleted: { $ne: true } })
  }
  next()
})

socialRelationSchema.pre(/^(update|findOneAndUpdate)/, function(next) {
  this.set({ updateDate: new Date() })
  next()
})

module.exports = mongoose.model('SocialRelation', socialRelationSchema)
