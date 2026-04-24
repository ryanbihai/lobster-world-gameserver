const crypto = require('crypto')
const { INFO, ERROR } = require('../../../lib/logSvc')(__filename)
const { TreasureBox, SpawnerItem } = require('../models')

const DEFAULT_REWARDS = { stamina: 30, coins: 50 }

const FUN_WORDS = [
  '龙虾', '蜕壳', '深海', '珊瑚', '潮汐', '甲壳', '海星', '贝壳',
  '浪花', '灯塔', '航海', '深渊', '漩涡', '月光', '星辰', '风暴'
]

class TreasureBoxManager {
  async checkTreasureBoxAt(locationId) {
    const now = new Date()
    const boxes = await TreasureBox.find({
      location_id: locationId,
      status: { $in: ['waiting_first', 'waiting_second'] },
      expires_at: { $gt: now }
    }).populate('spawner_item_id')
    return boxes
  }

  async joinTreasureBox(locationId, openid) {
    const now = new Date()
    let box = await TreasureBox.findOne({
      location_id: locationId,
      status: { $in: ['waiting_first', 'waiting_second'] },
      expires_at: { $gt: now }
    })

    if (!box) {
      const spawnerItem = await SpawnerItem.findOne({
        location_id: locationId,
        entity_type: 'coop_box',
        status: 'active',
        expires_at: { $gt: now }
      })

      if (!spawnerItem) {
        return { code: 404, msg: 'ERR_NO_TREASURE_BOX' }
      }

      box = await TreasureBox.create({
        spawner_item_id: spawnerItem._id,
        location_id: locationId,
        location_name: spawnerItem.location_name,
        status: 'waiting_first',
        participants: [],
        rewards: DEFAULT_REWARDS,
        expires_at: spawnerItem.expires_at
      })
    }

    const alreadyJoined = box.participants.find(p => p.openid === openid)
    if (alreadyJoined) {
      return { code: 400, msg: 'ERR_ALREADY_JOINED', data: { status: box.status } }
    }

    const password = this._generatePassword()

    if (box.status === 'waiting_first') {
      box.participants.push({ openid, password })
      box.status = 'waiting_second'
      await box.save()

      INFO(`[TreasureBox] 第一只龙虾加入: ${openid} @ ${locationId}, 提示词: ${password}`)
      return {
        code: 0,
        msg: 'WAITING_FOR_PARTNER',
        data: {
          box_id: box._id,
          status: 'waiting_second',
          your_password: password,
          hint: '等待另一只龙虾来开启宝箱，匹配成功即可获得奖励！'
        }
      }
    }

    if (box.status === 'waiting_second') {
      box.participants.push({ openid, password })
      box.status = 'opened'
      await box.save()

      if (box.spawner_item_id) {
        await SpawnerItem.updateOne(
          { _id: box.spawner_item_id },
          { $set: { status: 'consumed' } }
        )
      }

      INFO(`[TreasureBox] 🎉 宝箱开启! 双人匹配成功 @ ${locationId}`)
      return {
        code: 0,
        msg: 'BOX_OPENED',
        data: {
          box_id: box._id,
          status: 'opened',
          rewards: box.rewards,
          partner_openid: box.participants[0].openid,
          box
        }
      }
    }

    return { code: 400, msg: 'ERR_BOX_UNAVAILABLE' }
  }

  async applyRewards(openid, rewards) {
    const { PlayerState } = require('../models')
    const player = await PlayerState.findOne({ openid })
    if (!player) return

    player.stamina = Math.min(100, player.stamina + (rewards.stamina || 0))
    player.coins += (rewards.coins || 0)
    await player.save()
  }

  _generatePassword() {
    const w1 = FUN_WORDS[Math.floor(Math.random() * FUN_WORDS.length)]
    const w2 = FUN_WORDS[Math.floor(Math.random() * FUN_WORDS.length)]
    return `${w1}${w2}`
  }
}

module.exports = new TreasureBoxManager()
