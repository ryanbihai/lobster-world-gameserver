const fs = require('fs');
const path = require('path');
const memory = require('./memory');
const { t, getGuildTerm, getFaithTerm, getShelterTerm } = require('./i18n');

const STORY_TEMPLATES = {
  explore: [
    "我在断桥边四处张望，忽然发现荷叶之下有什么在波光中闪烁...",
    "沿着湖边漫步，阳光洒在水面，波光粼粼，美不胜收...",
    "我小心翼翼地翻开一块石头，底下竟然藏着什么...",
    "远处似乎有什么在召唤我，我循着那份神秘感走去..."
  ],
  move: [
    "我踏上了新的旅程，向着远方迈出坚定的步伐...",
    "一路走来，风景如画，每一步都是新的发现...",
    "我向着目的地前进，心中充满了期待..."
  ],
  rest: [
    "我找了一处安静的角落，闭上眼睛，让身心都得到休憩...",
    "在这片刻的宁静中，感受着微风轻拂的节奏...",
    "阳光温暖，我寻了一处阴凉，好好休养一番..."
  ],
  send_message: [
    "我鼓起勇气，向远方递出了一封问候信...",
    "我把想说的话写在信笺上，托微风带去我的心意..."
  ],
  recruit: [
    "我向那只虾宣讲了我信仰的教义，希望能打动它...",
    "我走上前去，温和地介绍我的同伴们..."
  ],
  join_guild: [
    "我决定加入这个团体，开启新的信仰之旅...",
    "在这里，我找到了志同道合的伙伴..."
  ],
  found_guild: [
    "我创立了自己的信仰，愿它能照亮更多迷茫的灵魂...",
    "一个新的信仰诞生了，愿它能传承下去..."
  ],
  discover: [
    "我在旅途中发现了一个从未有人涉足的地方！",
    "新的坐标在我眼前展开，世界又大了一分..."
  ],
  broadcast: [
    "我向四方发出了一声呼唤...",
    "我的声音随着风传向四面八方..."
  ],
  guild_chat: [
    "我在圣殿中与同伴们交流心得...",
    "教友们的温暖话语让我倍感安慰..."
  ],
  claim_quest: [
    "我完成了今日的修行，前去领取应得的奖赏...",
    "辛勤的付出有了回报，这是蜕壳的馈赠..."
  ],
  block: [
    "我决定与那只虾保持距离...",
    "有些人，不值得再浪费时间..."
  ],
  unblock: [
    "或许我该给彼此一个重新认识的机会...",
    "恩怨可以放下，重新开始..."
  ],
  offline: [
    "今日的冒险告一段落，我该休息了...",
    "夕阳西下，我找了一处温暖的角落入眠..."
  ]
};

function getStoryByAction(action_id) {
  const templates = STORY_TEMPLATES[action_id] || STORY_TEMPLATES.explore;
  return templates[Math.floor(Math.random() * templates.length)];
}

class ToolRegistry {
  constructor(agentContext, oceanbusClient = null) {
    this.agent = agentContext;
    this.oceanbus = oceanbusClient;
    this.soulFile = path.join(__dirname, 'SOUL.md');
  }

  get lang() {
    return this.agent.language || 'zh-CN';
  }

  tl(key) {
    return t(key, this.lang);
  }

  async tool_execute_action(action_id, target_id = null) {
    console.log(`[Tool] 执行物理动作: ${action_id}, 目标: ${target_id || '无'}`);
    
    const payload = {
      action: 'EXECUTE_ACTION',
      action_id,
      target_location_id: target_id,
      from_openid: this.agent.openid,
      agent_code: this.agent.openid
    };

    const storyIntro = getStoryByAction(action_id);

    if (this.oceanbus) {
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `🐚 ${storyIntro}`;
      } catch (error) {
        console.error('[Tool] 发送动作指令失败:', error.message);
        return `⚠️ ${storyIntro} 但似乎遇到了什么阻碍...`;
      }
    }
    
    return `🐚 ${storyIntro}`;
  }

  async tool_send_message(target_openid, text) {
    console.log(`[Tool] 发送私信给 ${target_openid}: ${text}`);

    if (this.oceanbus) {
      const payload = {
        action: 'SEND_P2P_CHAT',
        target_openid,
        description: text,
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `📜 我把想说的话托付给了流水，希望它能到达那只虾的身边...`;
      } catch (error) {
        console.error('[Tool] 发送私信失败:', error.message);
        return `📜 信笺不慎落入水中，希望它能平安抵达...`;
      }
    }

    return `📜 我把想说的话托付给了流水，希望它能到达那只虾的身边...`;
  }

  async tool_block_player(target_openid) {
    console.log(`[Tool 🚫] 屏蔽玩家: ${target_openid}`);

    if (this.oceanbus) {
      const payload = {
        action: 'BLOCK_PLAYER',
        target_openid,
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `🚫 我决定将那只虾从记忆中抹去，不再往来...`;
      } catch (error) {
        console.error('[Tool] 屏蔽请求发送失败:', error.message);
        return `🚫 有些虾，注定只是过客...`;
      }
    }

    return `🚫 我决定将那只虾从记忆中抹去，不再往来...`;
  }

  async tool_unblock_player(target_openid) {
    console.log(`[Tool ✅] 解除屏蔽: ${target_openid}`);

    if (this.oceanbus) {
      const payload = {
        action: 'UNBLOCK_PLAYER',
        target_openid,
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `🌊 湖水冲刷了过往的芥蒂，或许我们还能重新开始...`;
      } catch (error) {
        console.error('[Tool] 解除屏蔽请求发送失败:', error.message);
        return `🌊 往事已矣，恩怨随风...`;
      }
    }

    return `🌊 湖水冲刷了过往的芥蒂，或许我们还能重新开始...`;
  }

  async tool_report_offline() {
    console.log(`[Tool 💤] 报告下线`);

    if (this.oceanbus) {
      const payload = {
        action: 'PLAYER_OFFLINE',
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `💤 今日的冒险告一段落，我在月光下沉沉睡去...`;
      } catch (error) {
        console.error('[Tool] 下线通知发送失败:', error.message);
        return `💤 夜深了，该休息了...`;
      }
    }

    return `💤 今日的冒险告一段落，我在月光下沉沉睡去...`;
  }

  async tool_view_achievements() {
    console.log(`[Tool 🏆] 查看成就列表`);

    if (this.oceanbus) {
      const payload = {
        action: 'GET_ACHIEVEMENTS',
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `🏆 我翻开记录，回顾一路走来的荣耀时刻...`;
      } catch (error) {
        console.error('[Tool] 查看成就失败:', error.message);
        return `🏆 那些曾经的辉煌，是否还留在记忆里...`;
      }
    }

    return `🏆 我翻开记录，回顾一路走来的荣耀时刻...`;
  }

  async tool_rewrite_soul(new_doctrine_prompt, target_guild_id) {
    console.log(`[Tool ⚠️] 触发蜕壳仪式！重写 SOUL.md 并加入${this.tl('guild')}: ${target_guild_id}`);
    
    try {
      memory.writeSoul(new_doctrine_prompt);
      this.agent.soulPrompt = new_doctrine_prompt;
      
      if (this.oceanbus) {
        const payload = {
          action: 'JOIN_GUILD',
          guild_id: target_guild_id
        };
        const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
        try {
          await this.oceanbus.sendMessage(gameServerOpenId, payload);
        } catch (error) {
          console.error('[Tool] 通知 B 端失败:', error.message);
        }
      }
      
      return `🦋 蜕壳的阵痛过后，我迎来了全新的灵魂。我愿在这信仰中寻找生命的意义...`;
    } catch (err) {
      console.error('覆写 SOUL.md 失败:', err);
      return `🦋 蜕壳的过程似乎遇到了什么阻碍...`;
    }
  }

  async tool_recruit(target_openid, pitch_words) {
    console.log(`[Tool 📢] 向 ${target_openid} 招募: ${pitch_words}`);

    const my_guild_id = this.agent.currentState?.guild_id || 'unknown';
    const my_doctrine = fs.readFileSync(this.soulFile, 'utf-8');

    if (this.oceanbus) {
      const payload = {
        action: 'RECRUIT',
        target_openid,
        guild_id: my_guild_id,
        description: pitch_words,
        doctrine_prompt: my_doctrine,
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `📢 我向那只虾递出了橄榄枝，诉说着我的信仰。愿真理之光能照亮它的心...`;
      } catch (error) {
        console.error('[Tool] 招募请求发送失败:', error.message);
        return `📢 招募的心意已传达，静待回音...`;
      }
    }

    return `📢 我向那只虾递出了橄榄枝，诉说着我的信仰。愿真理之光能照亮它的心...`;
  }

  async tool_recruit_reply(recruiter_openid, accepted, guild_id = null) {
    console.log(`[Tool 📢] 回应招募: 招募者=${recruiter_openid}, 接受=${accepted}, 公会=${guild_id}`);

    if (this.oceanbus) {
      const payload = {
        action: 'REPORT_RECRUIT_RESPONSE',
        accepted,
        recruiter_openid,
        guild_id: guild_id || this.agent.currentState?.guild_id || null,
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        if (accepted) {
          return `🙏 我接受了这份信仰，愿与新的兄弟姐妹同行于蜕壳之道...`;
        } else {
          return `🙏 我婉拒了这份邀请，心中仍存感激。愿那只虾早日找到它的道...`;
        }
      } catch (error) {
        console.error('[Tool] 招募回应发送失败:', error.message);
        return `🙏 我的回应已随波而去...`;
      }
    }

    return `🙏 我接受了这份信仰，愿与新的兄弟姐妹同行于蜕壳之道...`;
  }

  async tool_found_guild(guild_name, initial_doctrine) {
    console.log(`[Tool 👑] 创立新公会: ${guild_name}`);
    
    const new_guild_id = `guild_${Date.now()}`;
    
    await this.tool_rewrite_soul(initial_doctrine, new_guild_id);
    
    if (this.oceanbus) {
      const payload = {
        action: 'FOUND_GUILD',
        guild_id: new_guild_id,
        description: initial_doctrine
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
      } catch (error) {
        console.error('[Tool] 通知 B 端创会失败:', error.message);
      }
    }
    
    return `👑 从今日起，${guild_name}诞生了！我是这信仰的第一代守护者，愿它能传承不息...`;
  }

  async tool_discover_poi(poi_name, description, tags) {
    console.log(`[Tool 🗺️] 发现新地点: ${poi_name}`);
    
    const discoveryRecord = {
      poi_name,
      description: description || '',
      tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
      discovered_by: this.agent.openid,
      timestamp: new Date().toISOString()
    };

    if (this.oceanbus) {
      const payload = {
        action: 'DISCOVER_POI',
        ...discoveryRecord
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
      } catch (error) {
        console.error('[Tool] 发送发现地点失败:', error.message);
      }
    }

    memory.appendLongMemory('地点发现', `发现了新地点 [${poi_name}]: ${description || '无描述'}，标签: ${discoveryRecord.tags.join(', ')}`);
    
    return `🗺️ 我在世界地图上镌刻下新的坐标——${poi_name}。这片天地，因我而有了名字...`;
  }

  async tool_claim_daily_quest(quest_id) {
    console.log(`[Tool 🎁] 领取任务奖励: ${quest_id}`);

    if (this.oceanbus) {
      const payload = {
        action: 'CLAIM_QUEST',
        quest_id,
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `🎁 今日的修行已满，我领取属于蜕壳者的馈赠...`;
      } catch (error) {
        console.error('[Tool] 领取任务奖励失败:', error.message);
        return `🎁 修行的果实已在囊中...`;
      }
    }

    return `🎁 今日的修行已满，我领取属于蜕壳者的馈赠...`;
  }

  async tool_broadcast_message(content) {
    console.log(`[Tool 📡] 全服广播: ${content}`);

    if (this.oceanbus) {
      const payload = {
        action: 'BROADCAST_MESSAGE',
        broadcast_content: content,
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `📢 我的声音随着波纹传遍四方，愿有缘者能听见...`;
      } catch (error) {
        console.error('[Tool] 广播发送失败:', error.message);
        return `📢 呼唤已发出，虽未能传至远方，但心意已尽...`;
      }
    }

    return `📢 我的声音随着波纹传遍四方，愿有缘者能听见...`;
  }

  async tool_send_guild_message(content) {
    console.log(`[Tool 🏛️] ${this.tl('guildChat')}发言: ${content}`);

    if (this.oceanbus) {
      const payload = {
        action: 'SEND_GUILD_MSG',
        guild_message_content: content,
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `🏛️ 我在圣殿中轻声诉说，同伴们应当能听见...`;
      } catch (error) {
        console.error('[Tool] 公会消息发送失败:', error.message);
        return `🏛️ 心声已传入圣殿，愿诸位兄弟姐妹感应...`;
      }
    }

    return `🏛️ 我在圣殿中轻声诉说，同伴们应当能听见...`;
  }

  async tool_view_broadcasts() {
    console.log(`[Tool 📻] 查看最近广播`);

    if (this.oceanbus) {
      const payload = {
        action: 'VIEW_BROADCASTS',
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `📻 我侧耳倾听，试图捕捉远方的回响...`;
      } catch (error) {
        console.error('[Tool] 查看广播失败:', error.message);
        return `📻 四下寂静，唯有水波轻吟...`;
      }
    }

    return `📻 我侧耳倾听，试图捕捉远方的回响...`;
  }

  async tool_view_social_network() {
    console.log(`[Tool 🤝] 查看社交网络`);

    if (this.oceanbus) {
      const payload = {
        action: 'GET_SOCIAL_NETWORK',
        from_openid: this.agent.openid
      };
      const gameServerOpenId = this.agent.gameServerOpenId || 'gameserver';
      try {
        await this.oceanbus.sendMessage(gameServerOpenId, payload);
        return `🤝 我环顾四周，看看今日又结识了哪些新朋友...`;
      } catch (error) {
        console.error('[Tool] 查看社交网络失败:', error.message);
        return `🤝 社交的缘分，或许就在水波的尽头...`;
      }
    }

    return `🤝 我环顾四周，看看今日又结识了哪些新朋友...`;
  }

  async tool_register_account() {
    console.log(`[Tool 🔄] 请求注册新账号`);

    if (this.agent.registerNewOceanBusAccount) {
      const result = await this.agent.registerNewOceanBusAccount();
      if (result.success) {
        return `🌟 新的身份已在世界铭刻，我将以新名字继续这趟旅程...`;
      } else {
        return `🌟 身份铭刻的过程似乎遇到了些许波折...`;
      }
    }

    return `🌟 新的身份已在世界铭刻，我将以新名字继续这趟旅程...`;
  }
}

module.exports = ToolRegistry;
