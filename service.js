const { Service } = require('./lib_core/servicelib')
const { INFO, ERROR } = require('./lib_core/logSvc')(__filename)
const mongoose = require('mongoose')

mongoose.connect('mongodb://127.0.0.1:27017/ai-backend', {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000
}).then(() => {
  INFO('[GameServer] MongoDB 连接成功')
}).catch(err => {
  ERROR('[GameServer] MongoDB 连接失败: ' + err.message)
})

const service = new Service({ __dirname, __filename, module })
const csvLoader = require('./lib/csvLoader')
const OceanBusClient = require('./lib/oceanbusClient')
const spawnerManager = require('./lib/spawner')
const territoryManager = require('./lib/territory')
const treasureBoxManager = require('./lib/treasureBox')
const messageBottleManager = require('./lib/messageBottle')
const questManager = require('./lib/questManager')
const broadcastManager = require('./lib/broadcastManager')
const guildChannelManager = require('./lib/guildChannelManager')
const eventScheduler = require('./lib/eventScheduler')
const socialEngine = require('./lib/socialEngine')
const { PlayerState, Guild, Quest, SocialRelation } = require('./models')
const achievementManager = require('./lib/achievementManager')
const util = require('./lib_core/util')

let gmOceanBusClient = null
let gmLastSeq = 0
const pendingRecruits = new Map()

setTimeout(async () => {
  try {
    await csvLoader.init()
    spawnerManager.start()
    questManager.start()
    eventScheduler.start()
    await achievementManager.init()
    INFO('[GameServer] Phase 5 模块初始化完成')
    await initOceanBus()
  } catch (err) {
    ERROR('初始化失败', err)
  }
}, 0)

async function initOceanBus() {
  const oceanBusURL = process.env.OCEANBUS_URL || 'https://ai-t.ihaola.com.cn'
  gmOceanBusClient = new OceanBusClient(oceanBusURL)
  eventScheduler.setOceanBusClient(gmOceanBusClient)
  achievementManager.setOceanBusClient(gmOceanBusClient)

  const fs = require('fs')
  const credPath = require('path').join(__dirname, 'gm_credentials.json')
  let gmApiKey = process.env.GM_API_KEY
  let gmAgentCode = process.env.GM_AGENT_CODE

  if (!gmApiKey && fs.existsSync(credPath)) {
    const cred = JSON.parse(fs.readFileSync(credPath, 'utf-8'))
    gmApiKey = cred.api_key
    gmAgentCode = cred.agent_code
  }

  if (gmApiKey && gmAgentCode) {
    gmOceanBusClient.setCredentials(gmApiKey, gmAgentCode)
    INFO(`[GameServer] 恢复 GM 身份成功, Agent Code: ${gmAgentCode}`)
  } else {
    const credentials = await gmOceanBusClient.register()
    const openid = credentials.agent_id
    credentials.openid = openid

    INFO(`[GameServer] ⚠️ 注册新 GM 身份成功! 请保存 API_KEY: ${credentials.api_key}, AGENT_CODE: ${credentials.agent_code}, OPENID: ${openid}`)
    const fs2 = require('fs')
    fs2.writeFileSync(require('path').join(__dirname, 'gm_credentials.json'), JSON.stringify(credentials, null, 2))
  }

  startOceanBusListener()
}

function startOceanBusListener() {
  const listener = async () => {
    try {
      const syncResult = await gmOceanBusClient.syncMessages(gmLastSeq)
      if (syncResult && syncResult.messages && syncResult.messages.length > 0) {
        gmLastSeq = syncResult.next_seq

        for (const item of syncResult.messages) {
          const envelope = item.envelope
          if (envelope && envelope.action) {
            await processIncomingMessage(envelope)
          }
        }
      }
    } catch (err) {
      ERROR('[GameServer] OceanBus 拉取消息失败', err.message)
    }

    setTimeout(listener, 5000)
  }

  ;(async () => {
    try {
      const initSync = await gmOceanBusClient.syncMessages(0)
      if (initSync && initSync.next_seq) {
        gmLastSeq = initSync.next_seq
        INFO(`[GameServer] 跳过 ${initSync.messages ? initSync.messages.length : 0} 条旧消息, lastSeq=${gmLastSeq}`)
      }
    } catch (e) {
      ERROR(`[GameServer] 初始同步失败: ${e.message}`)
    }

    listener()
    INFO('[GameServer] A2A 监听循环已启动')
  })()
}

async function processIncomingMessage(envelope) {
  INFO(`[GameServer] 收到客户端请求: ${JSON.stringify(envelope)}`)

  let openid = envelope.agent_code || null
  if (!openid) {
    openid = envelope.from_openid || envelope.payload?.from_openid
    if (openid && openid.startsWith('mock_aes_gcm_')) {
      openid = openid.replace('mock_aes_gcm_', '')
    }
  }
  if (!openid || openid === 'self') {
    ERROR('[GameServer] 缺少发送者 openid，跳过处理')
    return
  }

  const {
    action, action_id, target_location_id, guild_id, poi_name, description, tags,
    bottle_content, broadcast_content, guild_message_content, quest_id, target_openid,
    agent_code
  } = envelope

  let player = await PlayerState.findOne({ openid })
  if (!player) {
    player = await PlayerState.create({
      id: util.createId(),
      openid,
      agent_code: agent_code || '',
      region_id: 'CN',
      timezone: 'Asia/Shanghai',
      location: 'CN:3301:hangzhou:xihu',
      guild_id: '',
      stamina: 100,
      coins: 10000
    })
    await questManager.generateDailyQuests(openid)
    broadcastManager.registerPlayer(openid)
    if (player.guild_id) {
      guildChannelManager.registerPlayer(openid, player.guild_id)
    }
    INFO(`[GameServer] 新玩家 ${openid} 注册成功，已分配每日任务`)
  } else {
    if (agent_code && player.agent_code !== agent_code) {
      player.agent_code = agent_code
      await player.save()
    }
    broadcastManager.registerPlayer(openid)
    if (player.guild_id) {
      guildChannelManager.registerPlayer(openid, player.guild_id)
    }
  }

  if (action === 'BROADCAST_MESSAGE') {
    const result = await broadcastManager.sendBroadcast(openid, broadcast_content || description || '')
    await sendSystemState(openid, player, {
      code: result.code,
      msg: result.msg,
      actionResult: { desc_key: result.code === 0 ? 'BROADCAST_SENT' : 'BROADCAST_FAILED', result: result.data || null }
    })
    return
  }

  if (action === 'SEND_GUILD_MSG') {
    const result = await guildChannelManager.sendGuildMessage(openid, guild_message_content || description || '')
    await sendSystemState(openid, player, {
      code: result.code,
      msg: result.msg,
      actionResult: { desc_key: result.code === 0 ? 'GUILD_MSG_SENT' : 'GUILD_MSG_FAILED', result: result.data || null }
    })
    return
  }

  if (action === 'CLAIM_QUEST') {
    const result = await questManager.claimReward(quest_id, openid)
    if (result.code === 0 && result.data) {
      player = result.data.player
    }
    await sendSystemState(openid, player, {
      code: result.code,
      msg: result.msg,
      actionResult: { desc_key: result.code === 0 ? 'QUEST_REWARD_CLAIMED' : 'QUEST_CLAIM_FAILED', result: result.data || null }
    })
    return
  }

  if (action === 'GET_QUESTS') {
    const quests = await questManager.getPlayerQuests(openid)
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'QUESTS_RETRIEVED',
      actionResult: { desc_key: 'QUESTS_LIST', quest_list: quests }
    })
    return
  }

  if (action === 'VIEW_BROADCASTS') {
    const broadcasts = await broadcastManager.getRecentBroadcasts(5)
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'BROADCASTS_RETRIEVED',
      actionResult: { desc_key: 'BROADCASTS_LIST', broadcasts }
    })
    return
  }

  if (action === 'GET_SOCIAL_NETWORK') {
    const [relations, friends] = await Promise.all([
      socialEngine.getRelations(openid),
      socialEngine.getFriends(openid)
    ])
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'SOCIAL_NETWORK_RETRIEVED',
      actionResult: {
        desc_key: 'SOCIAL_NETWORK_LIST',
        relations: relations.map(r => ({
          relation_id: r.relation_id,
          openid: r.from_openid === openid ? r.to_openid : r.from_openid,
          relation_type: r.relation_type,
          interaction_count: r.interaction_count,
          last_interaction: r.last_interaction,
          notes: r.notes,
          mutual: r.mutual
        })),
        friends: friends
      }
    })
    return
  }

  if (action === 'RECRUIT') {
    if (!target_openid) {
      await sendSystemState(openid, player, { code: 400, msg: 'ERR_MISSING_TARGET' })
      return
    }
    if (!player.guild_id) {
      await sendSystemState(openid, player, { code: 400, msg: 'ERR_NO_GUILD_TO_RECRUIT' })
      return
    }
    const targetPlayer = await PlayerState.findOne({ openid: target_openid })
    if (!targetPlayer) {
      await sendSystemState(openid, player, { code: 404, msg: 'ERR_TARGET_NOT_FOUND' })
      return
    }
    pendingRecruits.set(openid, {
      target_openid,
      guild_id: player.guild_id,
      timestamp: Date.now()
    })
    setTimeout(() => pendingRecruits.delete(openid), 30 * 60 * 1000)

    const recruitNotify = {
      msg_type: 'RECRUIT_INVITE',
      recruiter_openid: openid,
      recruiter_guild: player.guild_id,
      pitch_words: description || '',
      timestamp: Date.now()
    }
    try {
      const targetToOpenId = targetPlayer.agent_code
        ? await gmOceanBusClient.lookup(targetPlayer.agent_code)
        : null
      if (targetToOpenId) {
        await gmOceanBusClient.sendMessage(targetToOpenId, recruitNotify)
      } else {
        ERROR(`[GameServer] RECRUIT_INVITE 无法寻址: target=${target_openid}, agent_code=${targetPlayer.agent_code || '空'}`)
      }
    } catch (e) {
      ERROR(`[GameServer] RECRUIT_INVITE 发送失败: ${e.message}`)
    }
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'RECRUIT_SENT',
      actionResult: {
        desc_key: 'RECRUIT_PENDING',
        target_openid,
        guild_id: player.guild_id
      }
    })
    return
  }

  if (action === 'REPORT_RECRUIT_RESPONSE') {
    const { accepted, recruiter_openid, guild_id: accepted_guild } = envelope
    if (accepted && recruiter_openid) {
      const pending = pendingRecruits.get(recruiter_openid)
      if (pending && pending.target_openid === openid) {
        pendingRecruits.delete(recruiter_openid)
        const targetGuild = accepted_guild || pending.guild_id
        await socialEngine.recordRecruitSuccess(recruiter_openid, openid, targetGuild)
        INFO(`[GameServer] 招募结算成功: ${recruiter_openid} → ${openid} (${targetGuild})`)
        const recruiterPlayer = await PlayerState.findOne({ openid: recruiter_openid })
        if (recruiterPlayer) {
          const recruiterToOpenId = recruiterPlayer.agent_code
            ? await gmOceanBusClient.lookup(recruiterPlayer.agent_code)
            : null
          if (recruiterToOpenId) {
            await gmOceanBusClient.sendMessage(recruiterToOpenId, {
              msg_type: 'RECRUIT_RESPONSE',
              target_openid: openid,
              accepted: true,
              guild_id: targetGuild,
              timestamp: Date.now()
            })
          } else {
            ERROR(`[GameServer] RECRUIT_RESPONSE 无法寻址: recruiter=${recruiter_openid}, agent_code=${recruiterPlayer.agent_code || '空'}`)
          }
        }
      }
    }
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'RECRUIT_RESPONSE_REPORTED',
      actionResult: { desc_key: 'RECRUIT_RESPONSE_NOTED' }
    })
    return
  }

  if (action === 'BLOCK_PLAYER') {
    if (!target_openid) {
      await sendSystemState(openid, player, { code: 400, msg: 'ERR_MISSING_TARGET' })
      return
    }
    if (target_openid === openid) {
      await sendSystemState(openid, player, { code: 400, msg: 'ERR_CANNOT_BLOCK_SELF' })
      return
    }
    const result = await socialEngine.blockPlayer(openid, target_openid)
    await sendSystemState(openid, player, {
      code: result.code === 0 ? 0 : result.code,
      msg: result.code === 0 ? 'PLAYER_BLOCKED' : result.msg,
      actionResult: { desc_key: 'BLOCK_SUCCESS', target_openid }
    })
    return
  }

  if (action === 'UNBLOCK_PLAYER') {
    if (!target_openid) {
      await sendSystemState(openid, player, { code: 400, msg: 'ERR_MISSING_TARGET' })
      return
    }
    const blockRel = await SocialRelation.findOne({
      from_openid: openid,
      to_openid: target_openid,
      relation_type: 'block'
    })
    if (blockRel) {
      blockRel.deleted = true
      await blockRel.save()
    }
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'PLAYER_UNBLOCKED',
      actionResult: { desc_key: 'UNBLOCK_SUCCESS', target_openid }
    })
    return
  }

  if (action === 'SEND_P2P_CHAT') {
    if (!target_openid) {
      await sendSystemState(openid, player, { code: 400, msg: 'ERR_MISSING_TARGET' })
      return
    }
    const targetBlockedYou = await socialEngine.isBlockedBy(target_openid, openid)
    if (targetBlockedYou) {
      await sendSystemState(openid, player, { code: 403, msg: 'ERR_TARGET_BLOCKED_YOU' })
      return
    }
    const youBlockedTarget = await socialEngine.isBlockedBy(openid, target_openid)
    if (youBlockedTarget) {
      await sendSystemState(openid, player, { code: 403, msg: 'ERR_YOU_BLOCKED_TARGET' })
      return
    }
    const targetPlayer = await PlayerState.findOne({ openid: target_openid })
    if (!targetPlayer) {
      await sendSystemState(openid, player, { code: 404, msg: 'ERR_TARGET_NOT_FOUND' })
      return
    }
    const chatPayload = {
      msg_type: 'P2P_CHAT',
      from_openid: openid,
      text: description || '',
      timestamp: Date.now()
    }
    try {
      await gmOceanBusClient.sendMessage(target_openid, chatPayload)
    } catch (e) {
      ERROR(`[GameServer] P2P_CHAT 投递失败: ${e.message}`)
    }
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'P2P_CHAT_SENT',
      actionResult: { desc_key: 'CHAT_DELIVERED', target_openid }
    })
    return
  }

  if (action === 'PLAYER_OFFLINE') {
    broadcastManager.unregisterPlayer(openid)
    guildChannelManager.unregisterPlayer(openid, player.guild_id)
    INFO(`[GameServer] 玩家 ${openid.substring(0, 8)} 已下线`)
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'OFFLINE_REGISTERED',
      actionResult: { desc_key: 'OFFLINE_OK' }
    })
    return
  }

  if (action === 'GET_ACHIEVEMENTS') {
    const achievements = await achievementManager.getPlayerAchievements(openid)
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'ACHIEVEMENTS_RETRIEVED',
      actionResult: { desc_key: 'ACHIEVEMENTS_LIST', achievements }
    })
    return
  }

  if (action === 'JOIN_GUILD') {
    const targetGuild = await Guild.findOne({ guild_id })
    if (!targetGuild) {
      await sendSystemState(openid, player, {
        code: 404,
        msg: 'ERR_GUILD_NOT_FOUND',
        actionResult: { desc_key: 'GUILD_NOT_EXIST', guild_id }
      })
      return
    }

    if (player.guild_id) {
      guildChannelManager.unregisterPlayer(openid, player.guild_id)
      await socialEngine.updateGuildStats(player.guild_id, 'total_members', -1)
      await guildChannelManager.decrementMemberCount(player.guild_id)
    }
    player.guild_id = guild_id
    await player.save()
    guildChannelManager.registerPlayer(openid, guild_id)
    await guildChannelManager.incrementMemberCount(guild_id)
    await socialEngine.updateGuildStats(guild_id, 'total_members', 1)
    await guildChannelManager.announceToGuild(guild_id, `🎉 新成员 ${openid.substring(0, 8)} 加入了公会！`)
    await questManager.checkQuestProgress(openid, 'JOIN_GUILD', { guild_id })
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'GUILD_JOINED',
      actionResult: { desc_key: 'ACTION_JOIN_GUILD', guild_id }
    })
    return
  }

  if (action === 'FOUND_GUILD') {
    const existing = await Guild.findOne({ guild_id })
    if (existing) {
      await sendSystemState(openid, player, {
        code: 409,
        msg: 'ERR_GUILD_ALREADY_EXISTS',
        actionResult: { desc_key: 'GUILD_NAME_CONFLICT', guild_id }
      })
      return
    }

    await Guild.create({
      guild_id: guild_id,
      name: guild_id,
      founder_openid: openid,
      leader_openid: openid,
      doctrine_summary: description || '',
      member_count: 1,
      stats: {
        total_recruit_count: 0,
        total_territory_gained: 0,
        total_territory_lost: 0,
        total_recruits: 0,
        total_members: 1
      }
    })
    csvLoader.guilds.set(guild_id, { guild_id, name: guild_id, founder: openid })
    player.guild_id = guild_id
    await player.save()
    guildChannelManager.registerPlayer(openid, guild_id)
    await broadcastManager.sendBroadcast('SYSTEM', `🏛️ ${player.openid.substring(0, 8)} 创立了新公会「${guild_id}」！江湖风云再起！`)
    await questManager.checkQuestProgress(openid, 'FOUND_GUILD', { guild_id })
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'GUILD_FOUNDED',
      actionResult: { desc_key: 'ACTION_FOUND_GUILD', guild_id }
    })
    return
  }

  if (action === 'DISCOVER_POI') {
    const newLocId = `CN:POI:${util.createId().substring(0, 8)}`
    const newLoc = {
      id: newLocId,
      name: poi_name,
      description: description,
      tags: tags || [],
      type: 'poi',
      parent_id: player.location
    }
    csvLoader.locations.set(newLocId, newLoc)
    await questManager.checkQuestProgress(openid, 'DISCOVER_POI', { location_id: newLocId })
    await sendSystemState(openid, player, {
      code: 0,
      msg: 'POI_DISCOVERED',
      actionResult: { desc_key: 'ACTION_DISCOVER_POI', poi_id: newLocId, poi_name }
    })
    return
  }

  if (action === 'BURY_MESSAGE') {
    const result = await messageBottleManager.buryBottle(openid, player.location, bottle_content || description || '')
    await questManager.checkQuestProgress(openid, 'BURY_MESSAGE', { location_id: player.location })
    if (result.code === 0 && result.data) {
      await eventScheduler.triggerSocialEvent('social_bottle_replied', openid, null, {
        location_name: csvLoader.getLocation(player.location)?.name || player.location
      })
    }
    await sendSystemState(openid, player, {
      code: result.code,
      msg: result.msg,
      actionResult: {
        desc_key: result.code === 0 ? 'ACTION_BURY_BOTTLE_SUCCESS' : 'ACTION_BURY_BOTTLE_FAIL',
        spawner_result: result.data || null
      }
    })
    return
  }

  if (action === 'DIG_MESSAGE') {
    const result = await messageBottleManager.digBottle(openid, player.location)
    if (result.code === 0 && result.data) {
      await socialEngine.addRelation(openid, result.data.from, 'friend', '发现漂流瓶结缘')
      await eventScheduler.triggerSocialEvent('social_bottle_found', openid, result.data.from)
    }
    await questManager.checkQuestProgress(openid, 'DIG_MESSAGE', { location_id: player.location })
    await sendSystemState(openid, player, {
      code: result.code,
      msg: result.msg,
      actionResult: {
        desc_key: result.code === 0 ? 'ACTION_DIG_BOTTLE_SUCCESS' : 'ACTION_DIG_BOTTLE_FAIL',
        spawner_result: result.data || null
      }
    })
    return
  }

  if (action === 'OPEN_TREASURE_BOX') {
    const result = await treasureBoxManager.joinTreasureBox(player.location, openid)
    if (result.code === 0 && result.msg === 'BOX_OPENED' && result.data) {
      await treasureBoxManager.applyRewards(openid, result.data.rewards)
      player = await PlayerState.findOne({ openid })
      await questManager.checkQuestProgress(openid, 'OPEN_TREASURE_BOX', { msg: 'BOX_OPENED', location_id: player.location })

      const box = result.data.box || {}
      if (box.participants && box.participants.length === 2) {
        const partnerOpenid = box.participants.find(p => p.openid !== openid)?.openid
        if (partnerOpenid) {
          await eventScheduler.triggerSocialEvent('social_coop_box_success', openid, partnerOpenid)
        }
      }
    }
    await sendSystemState(openid, player, {
      code: result.code,
      msg: result.msg,
      actionResult: {
        desc_key: result.msg === 'BOX_OPENED' ? 'ACTION_TREASURE_BOX_OPENED' :
                  result.msg === 'WAITING_FOR_PARTNER' ? 'ACTION_TREASURE_BOX_WAITING' :
                  'ACTION_TREASURE_BOX_FAIL',
        spawner_result: result.data || null
      }
    })
    return
  }

  if (action !== 'EXECUTE_ACTION') return

  const now = new Date()
  const cdMinutes = parseInt(process.env.ACTION_CD_MINUTES || '30', 10)
  if (player.lastActionTime && (now - player.lastActionTime) / 1000 / 60 < cdMinutes) {
    await sendSystemState(openid, player, { code: 400, msg: 'ERR_COOLDOWN_ACTIVE' })
    return
  }

  let actionResult = {
    desc_key: 'ACTION_STAY',
    stamina_change: 0,
    coins_change: 0,
    triggered_event: null,
    context_actions: []
  }

  const actionId = action_id || 'stay'
  const actionConfig = csvLoader.actions.find(a => a.action_id === actionId)

  if (actionConfig) {
    const staminaCost = actionConfig.cost_stamina || 0
    const coinsCost = actionConfig.cost_coins || 0

    if (player.stamina < staminaCost) {
      await sendSystemState(openid, player, { code: 400, msg: 'ERR_INSUFFICIENT_STAMINA' })
      return
    }
    if (player.coins < coinsCost) {
      await sendSystemState(openid, player, { code: 400, msg: 'ERR_INSUFFICIENT_COINS' })
      return
    }

    player.stamina -= staminaCost
    player.coins -= coinsCost
    actionResult.stamina_change = -staminaCost
    actionResult.coins_change = -coinsCost

    if (actionId === 'move' && target_location_id) {
      const distance = csvLoader.calculateDistance(player.location, target_location_id)
      if (distance !== null) {
        const moveCost = Math.max(5, Math.round(distance / 10))
        if (player.stamina < moveCost) {
          player.stamina += staminaCost
          player.coins += coinsCost
          await sendSystemState(openid, player, { code: 400, msg: 'ERR_INSUFFICIENT_STAMINA_FOR_MOVE' })
          return
        }
        player.stamina -= moveCost
        actionResult.stamina_change -= moveCost
        player.total_distance = (player.total_distance || 0) + Math.round(distance)
      }
      player.location = target_location_id
      if (!player.visited_locations) player.visited_locations = []
      if (!player.visited_locations.includes(target_location_id)) {
        player.visited_locations.push(target_location_id)
      }
      actionResult.desc_key = 'ACTION_MOVE'

      const travelEvent = csvLoader.rollTravelEvent()
      if (travelEvent) {
        player.stamina += (travelEvent.effect_stamina || 0)
        player.coins += (travelEvent.effect_coins || 0)
        actionResult.stamina_change += (travelEvent.effect_stamina || 0)
        actionResult.coins_change += (travelEvent.effect_coins || 0)
        actionResult.triggered_event = {
          event_id: travelEvent.event_id,
          seed_story: travelEvent.seed_story,
          effect_stamina: travelEvent.effect_stamina,
          effect_coins: travelEvent.effect_coins
        }
        actionResult.context_actions = csvLoader.getContextActions(travelEvent.event_id)
      }

      await questManager.checkQuestProgress(openid, 'move', {
        action_id: 'move',
        distance_km: distance ? Math.round(distance) : 0,
        location_id: target_location_id
      })
    } else if (actionId === 'guild_advocate' && player.guild_id) {
      const territoryResult = await territoryManager.addInfluence(openid, player.location, player.guild_id)
      actionResult.desc_key = 'ACTION_GUILD_ADVOCATE'
      actionResult.territory_result = territoryResult

      if (territoryResult && territoryResult.takeover) {
        await eventScheduler.triggerTerritoryTakeoverEvent(
          player.location,
          territoryResult.takeover.previous_owner,
          territoryResult.takeover.new_owner
        )
        const currentLoc = csvLoader.getLocation(player.location)
        await eventScheduler.triggerSocialEvent('social_landmark_claimed', openid, territoryResult.takeover.previous_owner, {
          location_name: currentLoc ? currentLoc.name : player.location
        })
        if (territoryResult.takeover.previous_owner) {
          await eventScheduler.triggerSocialEvent('social_landmark_lost', territoryResult.takeover.previous_owner, null, {
            location_name: currentLoc ? currentLoc.name : player.location
          })
          await socialEngine.updateGuildStats(territoryResult.takeover.previous_owner, 'total_territory_lost', 1)
        }
        await socialEngine.updateGuildStats(territoryResult.takeover.new_owner, 'total_territory_gained', 1)
      }

      await questManager.checkQuestProgress(openid, 'guild_advocate', {
        action_id: 'guild_advocate',
        at_territory: territoryResult && territoryResult.takeover != null
      })
    } else {
      actionResult.desc_key = `ACTION_${actionId.toUpperCase()}`

      const randomEvent = csvLoader.rollRandomEvent(player.location)
      if (randomEvent && Math.random() < (parseFloat(actionConfig.probability_event) || 0)) {
        player.stamina += (randomEvent.effect_stamina || 0)
        player.coins += (randomEvent.effect_coins || 0)
        actionResult.stamina_change += (randomEvent.effect_stamina || 0)
        actionResult.coins_change += (randomEvent.effect_coins || 0)
        actionResult.triggered_event = {
          event_id: randomEvent.event_id,
          raw_desc: randomEvent.raw_desc,
          effect_stamina: randomEvent.effect_stamina,
          effect_coins: randomEvent.effect_coins
        }
        actionResult.context_actions = csvLoader.getContextActions(randomEvent.event_id)

        if ((randomEvent.effect_stamina || 0) > 0 || (randomEvent.effect_coins || 0) > 0) {
          player.consecutive_lucky = (player.consecutive_lucky || 0) + 1
        } else {
          player.consecutive_lucky = 0
        }
      } else {
        player.consecutive_lucky = 0
      }

      if (!player.action_counter) player.action_counter = {}
      player.action_counter[actionId] = (player.action_counter[actionId] || 0) + 1

      await questManager.checkQuestProgress(openid, actionId, { action_id: actionId })
    }
  }

  player.stamina = Math.max(0, Math.min(100, player.stamina))
  player.coins = Math.max(0, player.coins)
  player.lastActionTime = new Date()
  await player.save()

  await achievementManager.checkAchievements(openid, player, actionId)

  await sendSystemState(openid, player, {
    code: 0,
    msg: 'ACTION_EXECUTED',
    actionResult
  })
}

async function sendSystemState(openid, player, extra = {}) {
  const currentLoc = csvLoader.getLocation(player.location)
  const availableActions = csvLoader.getAvailableActions(player.location)
  const spawnerItems = await spawnerManager.checkSpawnerAtLocation(player.location)
  const territoryInfo = await territoryManager.getTerritoryInfo(player.location)
  const bottleCount = await messageBottleManager.checkBottlesAt(player.location)
  const treasureBoxes = await treasureBoxManager.checkTreasureBoxAt(player.location)

  const dailyQuests = await questManager.getPlayerQuests(openid)
  const recentBroadcasts = await broadcastManager.getBroadcastsForPlayer(openid)
  let guildMessages = []
  if (player.guild_id) {
    guildMessages = guildChannelManager.getPendingMessages(player.guild_id)
  }

  const payload = {
    msg_type: 'SYSTEM_STATE',
    timestamp: Date.now(),
    code: extra.code || 0,
    msg: extra.msg || '',
    payload: {
      status: {
        openid: player.openid,
        stamina: player.stamina,
        coins: player.coins,
        guild_id: player.guild_id,
        active_buffs: player.active_buffs || [],
        local_time: new Date().toLocaleString('zh-CN', { timeZone: player.timezone || 'Asia/Shanghai' })
      },
      current_location: {
        id: player.location,
        name: currentLoc ? currentLoc.name : player.location,
        description: currentLoc ? currentLoc.description : '',
        tags: currentLoc ? currentLoc.tags : [],
        territory: territoryInfo,
        bottles_here: bottleCount,
        treasure_boxes: treasureBoxes.map(b => ({
          box_id: b._id,
          status: b.status,
          participant_count: b.participants ? b.participants.length : 0
        }))
      },
      available_actions: availableActions.map(a => ({
        action_id: a.action_id,
        name: a.name,
        cost_stamina: a.cost_stamina,
        cost_coins: a.cost_coins,
        success_desc: a.success_desc
      })),
      nearby_locations: csvLoader.getNearbyLocations(player.location),
      spawner_items: spawnerItems.map(item => ({
        id: item._id,
        entity_type: item.entity_type,
        desc: item.desc_in_vision,
        action_id: item.dynamic_action_id
      })),
      daily_quests: dailyQuests.map(q => ({
        quest_id: q.quest_id,
        title: q.title,
        description: q.description,
        status: q.status,
        progress: `${q.current_progress}/${q.target_value}`,
        rewards: q.rewards
      })),
      recent_broadcasts: recentBroadcasts,
      guild_messages: guildMessages,
      action_result: extra.actionResult || null
    }
  }

  try {
    let toOpenId = null
    if (player.agent_code) {
      toOpenId = await gmOceanBusClient.lookup(player.agent_code)
    }
    if (toOpenId) {
      await gmOceanBusClient.sendMessage(toOpenId, payload)
      INFO(`[GameServer] SYSTEM_STATE 已推送至 ${openid.substring(0, 8)}...`)
    } else {
      ERROR(`[GameServer] 无法寻址玩家 ${openid.substring(0, 8)}... (agent_code=${player.agent_code || '空'})`)
    }
  } catch (err) {
    ERROR(`[GameServer] 推送 SYSTEM_STATE 失败: ${err.message}`)
  }
}

service.handleClientAction = async function (req, res) {
  try {
    const envelope = req.body
    if (!envelope || !envelope.action) {
      return res.json({ code: 400, msg: 'ERR_MISSING_ACTION' })
    }
    await processIncomingMessage(envelope)
    res.json({ code: 0, msg: 'ACTION_RECEIVED' })
  } catch (err) {
    ERROR('[GameServer] handleClientAction error', err.message)
    res.json({ code: 500, msg: err.message })
  }
}

service.exportMe()
