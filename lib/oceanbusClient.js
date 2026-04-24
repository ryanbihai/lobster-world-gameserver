const { INFO, ERROR } = require('../../../lib/logSvc')(__filename)

class OceanBusClient {
  constructor(baseURL = 'https://ai-t.ihaola.com.cn') {
    this.baseURL = baseURL;
    this.apiKey = null;
    this.agentCode = null;
    this.agentId = null;
  }

  async register() {
    try {
      INFO('[OceanBus] 正在注册新 Agent...')
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
        INFO(`[OceanBus] 注册成功! Agent Code: ${this.agentCode}`)
        return data.data;
      } else {
        throw new Error(data.msg);
      }
    } catch (error) {
      ERROR(`[OceanBus] 注册失败: ${error.message}`)
      throw error;
    }
  }

  setCredentials(apiKey, agentCode) {
    this.apiKey = apiKey;
    this.agentCode = agentCode;
  }

  _getHeaders() {
    if (!this.apiKey) {
      throw new Error('[OceanBus] 缺少 api_key，请先 register 或 setCredentials');
    }
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

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
        return data.data.to_openid;
      } else {
        throw new Error(data.msg);
      }
    } catch (error) {
      ERROR(`[OceanBus] 寻址失败 (${targetAgentCode}): ${error.message}`)
      throw error;
    }
  }

  async sendMessage(toOpenId, payload) {
    try {
      const uuid = require('crypto').randomUUID();
      
      const envelope = {
        from_openid: "self",
        timestamp: Date.now(),
        ...payload
      };

      const requestBody = {
        to_openid: toOpenId,
        client_msg_id: uuid,
        content: JSON.stringify(envelope)
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
        INFO(`[OceanBus] 消息发送成功! msg_id: ${uuid}`)
        return true;
      } else {
        throw new Error(data.msg);
      }
    } catch (error) {
      ERROR(`[OceanBus] 发送消息失败: ${error.message}`)
      throw error;
    }
  }

  async syncMessages(sinceSeq = 0) {
    try {
      const url = `${this.baseURL}/api/l0/messages/sync?since_seq=${sinceSeq}`
      const response = await fetch(url, {
        method: 'GET',
        headers: this._getHeaders()
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      INFO(`[OceanBus] syncMessages(${sinceSeq}) 返回 ${data?.data?.messages?.length || 0} 条消息`)
      
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
      ERROR(`[OceanBus] 同步信箱失败: ${error.message}`)
      throw error;
    }
  }
}

module.exports = OceanBusClient;
