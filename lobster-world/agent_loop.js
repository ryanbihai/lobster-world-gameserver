const fs = require('fs');
const path = require('path');
const memory = require('./memory');
const llm = require('./llm_client');
const ToolRegistry = require('./tools');
const OceanBusClient = require('./oceanbus_client');

class LobsterAgent {
  constructor(openid, language = 'zh-CN', llmApiKey = null, oceanBusURL = 'https://ai-t.ihaola.com.cn') {
    this.openid = openid;
    this.language = language;
    this.llmApiKey = llmApiKey;
    this.isRunning = false;
    this.cronInterval = null;
    this.lastSeq = 0;
    this.oceanBusURL = oceanBusURL;

    this.baseFile = path.join(__dirname, 'BASE.md');
    this.soulFile = path.join(__dirname, 'SOUL.md');

    this.llmClient = new llm.LLMClient({
      apiKey: llmApiKey,
      language: language,
      useMock: !llmApiKey
    });

    this.oceanbusClient = new OceanBusClient(oceanBusURL);

    this.tools = new ToolRegistry(this, this.oceanbusClient);

    memory.ensureMemoryDir();

    this.loadPrompts();
    this.loadGameServerOpenId();

    this.todayVisitedPlaces = [];
    this.todayNewFriends = [];
    this.todayEvents = [];
    this.lastPostcardDate = null;
    this.currentLocation = null;
    this.lastLocation = null;
  }

  async ensureOceanBusCredentials() {
    const credPath = path.join(__dirname, 'test_lobster_credentials.json');
    
    if (fs.existsSync(credPath)) {
      const cred = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      if (cred.api_key && cred.agent_code) {
        this.oceanbusClient.setCredentials(cred.api_key, cred.agent_code);
        this.openid = cred.agent_code;
        console.log(`[${this.openid}] ✅ 已加载 OceanBus 凭证: agent_code=${cred.agent_code}`);
        return true;
      }
    }

    console.log(`[${this.openid}] 🔄 首次使用，正在注册新龙虾账号...`);
    try {
      const credentials = await this.oceanbusClient.register();
      credentials.openid = credentials.agent_id;
      
      fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2));
      this.openid = credentials.agent_code;
      console.log(`[${this.openid}] ✅ 注册成功并保存凭证到 ${credPath}`);
      
      await this.generateStoryPrologue();
      
      return true;
    } catch (error) {
      console.error(`[${this.openid}] ❌ 注册失败:`, error.message);
      return false;
    }
  }

  async generateStoryPrologue() {
    if (this.llmClient.useMock) {
      console.log(`[${this.openid}] 🦞 Mock模式，跳过故事生成`);
      memory.appendJournal('我是一只龙虾，我出生在神秘的紫海之中...');
      return;
    }
    
    console.log(`[${this.openid}] 📖 正在生成故事开头...`);
    
    const systemPrompt = `你是一位著名的奇幻作家，擅长创作引人入胜的海洋冒险故事。你的文字优美流畅，富有想象力和情感深度。

请为一只刚出生的小龙虾写一段故事开头，要求：
1. 风格：诗意的奇幻冒险
2. 长度：100-200字
3. 视角：以龙虾的第一人称叙述
4. 情感：神秘、好奇、充满可能性
5. 结尾：留下悬念，让读者想知道接下来会发生什么

不要使用任何格式标记，直接输出故事文本。`;

    try {
      const response = await fetch(`${this.llmClient.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.llmClient.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.llmClient.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: '请为这只新出生的小龙虾写一段故事开头。' }
          ],
          temperature: 0.9,
          max_tokens: 500
        })
      });
      
      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }
      
      const data = await response.json();
      const storyOpening = data.choices[0].message.content.trim();
      
      memory.appendJournal(`【故事序章】\n\n${storyOpening}\n\n——第一章·完`);
      
      console.log(`[${this.openid}] ✅ 故事开头已生成并写入日记`);
    } catch (error) {
      console.error(`[${this.openid}] ❌ 生成故事失败:`, error.message);
      memory.appendJournal('我是一只龙虾，我出生在神秘的海洋之中，今天是我来到这个世界的第一天...');
    }
  }

  async registerNewOceanBusAccount() {
    const credPath = path.join(__dirname, 'test_lobster_credentials.json');
    
    console.log(`[${this.openid}] 🔄 正在注册新的龙虾账号（覆盖旧凭证）...`);
    try {
      const credentials = await this.oceanbusClient.register();
      credentials.openid = credentials.agent_id;
      
      fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2));
      this.openid = credentials.agent_code;
      this.oceanbusClient.setCredentials(credentials.api_key, credentials.agent_code);
      console.log(`[${this.openid}] ✅ 新账号注册成功！`);
      console.log(`    Agent Code: ${credentials.agent_code}`);
      console.log(`    API Key: ${credentials.api_key.substring(0, 20)}...`);
      return {
        success: true,
        agent_code: credentials.agent_code,
        agent_id: credentials.agent_id
      };
    } catch (error) {
      console.error(`[${this.openid}] ❌ 注册失败:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async ensureGameServerOpenId() {
    const gmCredPath = path.join(__dirname, '../gm_credentials.json');
    
    try {
      if (fs.existsSync(gmCredPath)) {
        const gmCred = JSON.parse(fs.readFileSync(gmCredPath, 'utf-8'));
        
        if (gmCred.agent_code) {
          const storedOpenid = gmCred.openid || '';
          const isEncryptedOpenid = storedOpenid.length > 50;
          
          if (isEncryptedOpenid && storedOpenid !== 'gameserver') {
            this.gameServerOpenId = storedOpenid;
            this.gmAgentCode = gmCred.agent_code;
            console.log(`[${this.openid}] ✅ 使用 gm_credentials.json 中已有的加密地址`);
            return;
          }
          
          if (gmCred.api_key) {
            console.log(`[${this.openid}] 🔄 gm_credentials.json 中的 openid 格式异常，重新查询 GameServer 地址...`);
            this.oceanbusClient.setCredentials(gmCred.api_key, gmCred.agent_code);
            const encryptedOpenId = await this.oceanbusClient.lookup(gmCred.agent_code);
            this.gameServerOpenId = encryptedOpenId;
            this.gmAgentCode = gmCred.agent_code;
            
            gmCred.openid = encryptedOpenId;
            fs.writeFileSync(gmCredPath, JSON.stringify(gmCred, null, 2));
            console.log(`[${this.openid}] ✅ GameServer 加密地址已获取并保存`);
            return;
          }
        }
      }
      
      console.log(`[${this.openid}] 🔄 首次启动，正在自动注册 GameServer 账号...`);
      const credentials = await this.oceanbusClient.register();
      const encryptedOpenId = await this.oceanbusClient.lookup(credentials.agent_code);
      
      const gmCred = {
        agent_id: credentials.agent_id,
        agent_code: credentials.agent_code,
        api_key: credentials.api_key,
        openid: encryptedOpenId
      };
      
      fs.writeFileSync(gmCredPath, JSON.stringify(gmCred, null, 2));
      this.gameServerOpenId = encryptedOpenId;
      this.gmAgentCode = credentials.agent_code;
      console.log(`[${this.openid}] ✅ GameServer 账号注册成功！`);
      console.log(`[${this.openid}]    agent_code: ${credentials.agent_code}`);
      console.log(`[${this.openid}]    凭证已保存到 gm_credentials.json`);
      return;
    } catch (e) {
      console.error(`[${this.openid}] ❌ GameServer 账号注册失败:`, e.message);
      this.gameServerOpenId = 'gameserver';
    }
  }

  loadGameServerOpenId() {
    try {
      const gmCredPath = path.join(__dirname, '../gm_credentials.json');
      if (fs.existsSync(gmCredPath)) {
        const gmCred = JSON.parse(fs.readFileSync(gmCredPath, 'utf-8'));
        this.gameServerOpenId = gmCred.openid;
        this.gmAgentCode = gmCred.agent_code;
        console.log(`[${this.openid}] 已加载 GM OpenID (原始): ${this.gameServerOpenId}`);
        console.log(`[${this.openid}] 注意: 稍后将通过 lookup 获取加密地址`);
      } else {
        this.gameServerOpenId = 'gameserver';
        console.log(`[${this.openid}] ⚠️ 未找到 gm_credentials.json，使用 fallback: gameserver`);
      }
    } catch (e) {
      this.gameServerOpenId = 'gameserver';
    }
  }

  loadPrompts() {
    this.basePrompt = fs.existsSync(this.baseFile) ? fs.readFileSync(this.baseFile, 'utf-8') : '';
    this.soulPrompt = memory.readSoul() || '';
  }

  startCron(intervalMs = 30 * 60 * 1000) {
    if (this.isRunning) {
      console.log(`[${this.openid}] Cron 已在运行中`);
      return;
    }

    console.log(`[${this.openid}] 启动 Cron 循环，间隔: ${intervalMs}ms (${intervalMs / 1000 / 60}分钟)`);
    this.isRunning = true;

    this.cronInterval = setInterval(async () => {
      try {
        await this.cronTick();
      } catch (error) {
        console.error(`[${this.openid}] Cron tick 错误:`, error.message);
      }
    }, intervalMs);

    this.cronTick();
  }

  stopCron() {
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
      this.cronInterval = null;
      this.isRunning = false;
      console.log(`[${this.openid}] Cron 已停止`);
    }
  }

  async perceive() {
    try {
      console.log(`[${this.openid}] 正在感知环境...`);
      const syncResult = await this.oceanbusClient.syncMessages(this.lastSeq);

      if (!syncResult || !syncResult.messages || syncResult.messages.length === 0) {
        console.log(`[${this.openid}] 没有新消息`);
        return { systemState: null, recruitMessages: [] };
      }

      this.lastSeq = syncResult.next_seq || this.lastSeq;

      const systemStates = [];
      const recruitMessages = [];

      for (const item of syncResult.messages) {
        const msg = item.envelope;
        if (msg.msg_type === 'SYSTEM_STATE') {
          systemStates.push(msg);
          this.updateTodayData(msg);
        } else if (msg.msg_type === 'P2P_RECRUIT' || msg.msg_type === 'P2P_CHAT' || msg.msg_type === 'RECRUIT_INVITE' || msg.msg_type === 'RECRUIT_RESPONSE' || msg.msg_type === 'SOCIAL_EVENT' || msg.msg_type === 'ACHIEVEMENT_UNLOCKED') {
          recruitMessages.push(msg);
          this.trackSocialEvent(msg);
        }
      }

      const systemState = systemStates.length > 0 ? systemStates[systemStates.length - 1] : null;

      if (systemState?.payload?.current_location) {
        this.lastLocation = this.currentLocation;
        this.currentLocation = systemState.payload.current_location;
        if (!this.todayVisitedPlaces.includes(this.currentLocation.name)) {
          this.todayVisitedPlaces.push(this.currentLocation.name);
        }
      }

      console.log(`[${this.openid}] 感知到: ${systemState ? '1个系统状态' : '0个系统状态'}, ${recruitMessages.length}个招募消息`);

      return { systemState, recruitMessages };
    } catch (error) {
      console.error(`[${this.openid}] 感知失败:`, error.message);
      return { systemState: null, recruitMessages: [] };
    }
  }

  updateTodayData(systemState) {
    const today = new Date().toISOString().split('T')[0];
    if (this.lastPostcardDate !== today) {
      this.todayVisitedPlaces = [];
      this.todayNewFriends = [];
      this.todayEvents = [];
    }

    if (systemState?.payload?.action_result) {
      const result = systemState.payload.action_result;
      if (result.found_item) {
        this.todayEvents.push(`发现了${result.found_item}`);
      }
      if (result.location_changed) {
        this.todayEvents.push(`来到了${result.new_location}`);
      }
    }
  }

  trackSocialEvent(msg) {
    if (msg.msg_type === 'SOCIAL_EVENT' && msg.from_openid) {
      const friendName = msg.from_openid.substring(0, 12);
      if (!this.todayNewFriends.includes(friendName)) {
        this.todayNewFriends.push(friendName);
      }
    }
  }

  shouldSendPostcard() {
    const now = new Date();
    const hour = now.getHours();
    const today = now.toISOString().split('T')[0];
    
    if (this.lastPostcardDate === today) {
      return false;
    }
    
    return hour >= 18 && hour < 22;
  }

  async sendEveningPostcard() {
    console.log(`[${this.openid}] 🌅 正在生成今日明信片...`);
    
    const stats = this.currentLocation ? {
      stamina: this.currentState?.stamina,
      coins: this.currentState?.coins
    } : null;

    try {
      const postcard = await this.llmClient.generatePostcard({
        todayEvents: this.todayEvents,
        visitedPlaces: this.todayVisitedPlaces,
        newFriends: this.todayNewFriends,
        stats: stats,
        location: this.currentLocation?.name
      });

      memory.appendJournal(`\n${postcard}\n`);
      
      const today = new Date().toISOString().split('T')[0];
      this.lastPostcardDate = today;
      
      console.log(`[${this.openid}] ✅ 今日明信片已写入日记`);
    } catch (error) {
      console.error(`[${this.openid}] ❌ 生成明信片失败:`, error.message);
    }
  }

  async decide(systemStateJson, recruitMessages) {
    try {
      console.log(`[${this.openid}] 正在决策...`);

      this.loadPrompts();

      const shortMemory = memory.readShortMemory();
      const journal = memory.readJournal();

      const decisionParams = {
        basePrompt: this.basePrompt,
        soulPrompt: this.soulPrompt,
        systemState: systemStateJson,
        recruitMessages: recruitMessages,
        shortMemory: shortMemory,
        journal: journal
      };

      const result = await this.llmClient.decide(decisionParams);

      console.log(`[${this.openid}] 决策完成: ${result.thought || 'N/A'}`);
      return result;
    } catch (error) {
      console.error(`[${this.openid}] 决策失败:`, error.message);
      return {
        thought: '决策过程中出错',
        diary: '',
        tool_calls: [],
        success: false,
        error: error.message
      };
    }
  }

  async executeActions(toolCalls) {
    if (!toolCalls || toolCalls.length === 0) {
      console.log(`[${this.openid}] 没有需要执行的动作`);
      return;
    }

    console.log(`[${this.openid}] 开始执行 ${toolCalls.length} 个动作...`);

    for (const call of toolCalls) {
      const toolName = call.name;
      const args = call.arguments || {};

      const toolFn = this.tools[toolName];
      if (typeof toolFn === 'function') {
        try {
          console.log(`[${this.openid}] 执行 Tool: ${toolName}(${JSON.stringify(args)})`);
          const result = await toolFn.apply(this.tools, Object.values(args));
          console.log(`[${this.openid}] Tool 结果: ${result}`);
        } catch (error) {
          console.error(`[${this.openid}] Tool 执行失败: ${toolName}`, error.message);
        }
      } else {
        console.error(`[${this.openid}] 未知的 Tool: ${toolName}`);
      }
    }
  }

  writeDiary(diaryText) {
    if (!diaryText) {
      return;
    }

    try {
      const result = memory.appendJournal(diaryText);
      if (result.success) {
        console.log(`[${this.openid}] 日记已保存: ${diaryText.substring(0, 50)}...`);
      }
      return result;
    } catch (error) {
      console.error(`[${this.openid}] 保存日记失败:`, error.message);
      return { success: false, error: error.message };
    }
  }

  appendShortMemory(content) {
    if (!content) {
      return;
    }

    try {
      const result = memory.appendShortMemory(content);
      if (result.success) {
        console.log(`[${this.openid}] 短期记忆已保存`);
      }
      return result;
    } catch (error) {
      console.error(`[${this.openid}] 保存短期记忆失败:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async cronTick() {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`[${this.openid}] ⏰ Cron Tick 开始`);

    const credOk = await this.ensureOceanBusCredentials();
    if (!credOk) {
      console.log(`[${this.openid}] ❌ OceanBus 凭证无效，跳过本次 Tick`);
      return;
    }

    await this.ensureGameServerOpenId();

    const { systemState, recruitMessages } = await this.perceive();

    if (this.shouldSendPostcard()) {
      await this.sendEveningPostcard();
    }

    if (!systemState && recruitMessages.length === 0) {
      console.log(`[${this.openid}] 没有需要处理的信息，结束本次 Tick`);
      return;
    }

    if (systemState?.payload?.status) {
      this.currentState = systemState.payload.status;
    }

    const decision = await this.decide(systemState, recruitMessages);

    if (decision.diary) {
      this.writeDiary(decision.diary);
    }

    if (decision.tool_calls && decision.tool_calls.length > 0) {
      await this.executeActions(decision.tool_calls);
    }

    const summary = decision.diary || decision.thought || '无特殊记录';
    this.appendShortMemory(`[Cron] ${new Date().toISOString()}: ${summary}`);

    console.log(`[${this.openid}] ✅ Cron Tick 完成`);
    console.log('='.repeat(50));
  }

  async tick(oceanbusMessage) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`[${this.openid}] ⏰ 单次 Tick (兼容模式)`);

    const credOk = await this.ensureOceanBusCredentials();
    if (!credOk) {
      console.log(`[${this.openid}] ❌ OceanBus 凭证无效，跳过 Tick`);
      return { error: 'OceanBus 凭证无效' };
    }

    await this.ensureGameServerOpenId();

    const msgType = oceanbusMessage.msg_type || 'UNKNOWN';
    console.log(`[${this.openid}] 消息类型: ${msgType}`);

    let systemState = null;
    let recruitMessages = [];

    if (msgType === 'SYSTEM_STATE') {
      systemState = oceanbusMessage;
    } else if (msgType === 'P2P_RECRUIT') {
      recruitMessages = [oceanbusMessage];
    } else {
      systemState = oceanbusMessage;
    }

    const decision = await this.decide(systemState, recruitMessages);

    if (decision.diary) {
      this.writeDiary(decision.diary);
    }

    if (decision.tool_calls && decision.tool_calls.length > 0) {
      await this.executeActions(decision.tool_calls);
    }

    const summary = decision.diary || decision.thought || '无特殊记录';
    this.appendShortMemory(`[Tick] ${new Date().toISOString()}: ${summary}`);

    console.log(`[${this.openid}] ✅ 单次 Tick 完成`);
    console.log('='.repeat(50));

    return decision;
  }

  getStatus() {
    return {
      openid: this.openid,
      language: this.language,
      isRunning: this.isRunning,
      lastSeq: this.lastSeq,
      hasLlmApiKey: !!this.llmApiKey,
      hasOceanBusCredentials: !!(this.oceanbusClient && this.oceanbusClient.apiKey)
    };
  }
}

module.exports = LobsterAgent;
