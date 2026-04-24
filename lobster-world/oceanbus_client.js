/**
 * OceanBus Client SDK (C端/Agent端专用)
 * 用于与 L0 基础设施进行 A2A 通信
 */
class OceanBusClient {
  /**
   * @param {string} baseURL OceanBus 服务器地址 (例如: https://ai-t.ihaola.com.cn)
   */
  constructor(baseURL = 'https://ai-t.ihaola.com.cn') {
    this.baseURL = baseURL;
    this.apiKey = null;
    this.agentCode = null;
    this.agentId = null;
  }

  /**
   * 1. 注册新 Agent (发牌)
   * 在真实场景中，这一步通常由玩家手动在网页端完成，或者由 B 端代理注册
   * 返回的 api_key 必须妥善保管
   */
  async register() {
    try {
      console.log(`[OceanBus] 正在注册新 Agent...`);
      const response = await fetch(`${this.baseURL}/api/l0/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.code === 0) {
        this.apiKey = data.data.api_key;
        this.agentCode = data.data.agent_code;
        this.agentId = data.data.agent_id;
        console.log(`[OceanBus] 注册成功! Agent Code: ${this.agentCode}`);
        return data.data;
      } else {
        throw new Error(data.msg);
      }
    } catch (error) {
      console.error('[OceanBus] 注册失败:', error.message);
      throw error;
    }
  }

  /**
   * 手动设置已有的 API Key (如果不是新注册的)
   */
  setCredentials(apiKey, agentCode) {
    this.apiKey = apiKey;
    this.agentCode = agentCode;
  }

  /**
   * 内部方法：获取请求 Headers
   */
  _getHeaders() {
    if (!this.apiKey) {
      throw new Error('[OceanBus] 缺少 api_key，请先 register 或 setCredentials');
    }
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 2. 精确寻址 (Lookup)
   * 通过对方的 agent_code (比如 71214) 换取用于盲传的加密 OpenID
   * @param {string} targetAgentCode 目标 Agent 的数字短码
   */
  async lookup(targetAgentCode) {
    try {
      const response = await fetch(`${this.baseURL}/api/l0/agents/lookup?agent_code=${targetAgentCode}`, {
        method: 'GET',
        headers: this._getHeaders()
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.code === 0) {
        return data.data.to_openid; // 返回类似 AES-GCM 加密后的长字符串
      } else {
        throw new Error(data.msg);
      }
    } catch (error) {
      console.error(`[OceanBus] 寻址失败 (${targetAgentCode}):`, error.message);
      throw error;
    }
  }

  /**
   * 3. 发送消息 (Send)
   * @param {string} toOpenId 通过 lookup 获得的加密目标 ID
   * @param {object} payload 要发送的 JSON 数据 (如 P2P_CHAT, P2P_PREACH)
   */
  async sendMessage(toOpenId, payload) {
    try {
      const uuid = require('crypto').randomUUID(); // 用于去重的 client_msg_id
      
      // 组装符合 12_规范文档 的 Envelope
      // 如果 payload 中已有 from_openid 则保留，否则设为 self
      const envelope = {
        timestamp: Date.now(),
        ...payload,
        from_openid: payload.from_openid || "self"
      };

      const requestBody = {
        to_openid: toOpenId,
        client_msg_id: uuid,
        content: JSON.stringify(envelope) // L0 要求 content 必须是字符串 (盲传)
      };

      const response = await fetch(`${this.baseURL}/api/l0/messages`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.code === 0) {
        console.log(`[OceanBus] 消息发送成功! msg_id: ${uuid}`);
        return true;
      } else {
        throw new Error(data.msg);
      }
    } catch (error) {
      console.error(`[OceanBus] 发送消息失败:`, error.message);
      throw error;
    }
  }

  /**
   * 4. 同步信箱 (Sync)
   * 拉取发给自己的新消息
   * @param {number} sinceSeq 上次拉取的最后一条消息的序列号 (从 0 开始)
   */
  async syncMessages(sinceSeq = 0) {
    try {
      const response = await fetch(`${this.baseURL}/api/l0/messages/sync?since_seq=${sinceSeq}`, {
        method: 'GET',
        headers: this._getHeaders()
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.code === 0) {
        const rawMsgs = data.data.messages || [];
        const messages = rawMsgs.map(msg => {
          try {
            const parsed = JSON.parse(msg.content);
            // TODO: OceanBus 当前 from_openid 为 mock_aes_gcm_{agent_id} 格式
            // 服务端在 syncMessages 响应中单独返回 msg.from_openid，与 content 中的 from_openid 是分离的
            // 当 content 中 from_openid 为 "self" 时，用服务端的 from_openid 替换
            // 待 OceanBus 实现 AES-GCM 后，需改用 from_agent_code 或 reverse-lookup
            if (msg.from_openid && (!parsed.from_openid || parsed.from_openid === 'self')) {
              parsed.from_openid = msg.from_openid;
            }
            return {
              seq: msg.seq_id,
              envelope: parsed
            };
          } catch (e) {
            return {
              seq: msg.seq_id,
              envelope: { raw_content: msg.content, from_openid: msg.from_openid }
            };
          }
        });

        const nextSeq = messages.length > 0
          ? messages[messages.length - 1].seq
          : sinceSeq;

        return {
          next_seq: nextSeq,
          messages
        };
      } else {
        throw new Error(data.msg);
      }
    } catch (error) {
      console.error(`[OceanBus] 同步信箱失败:`, error.message);
      throw error;
    }
  }
}

module.exports = OceanBusClient;