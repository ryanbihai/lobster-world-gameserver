const mongoose = require('mongoose')
const { Schema } = mongoose

const territorySchema = new Schema({
  location_id: { type: String, required: true, unique: true },
  owner_guild: { type: String, default: '' },
  influences: { type: Schema.Types.Mixed, default: {} },
  createDate: { type: Date, default: Date.now },
  updateDate: { type: Date, default: Date.now },
  deleted: { type: Boolean, default: false }
}, {
  collection: 'GameServerSvc_Territory'
})

territorySchema.pre(/^find/, function(next) {
  if (this.getFilter().deleted === undefined) {
    this.where({ deleted: { $ne: true } })
  }
  next()
})

territorySchema.pre(/^(update|findOneAndUpdate)/, function(next) {
  this.set({ updateDate: new Date() })
  next()
})

module.exports = mongoose.model('Territory', territorySchema)
