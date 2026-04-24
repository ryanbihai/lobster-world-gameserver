/**
 * LLM Client SDK - 用于与各大语言模型交互
 * 支持 OpenAI / Claude / Gemini 等主流 LLM
 */

class LLMClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || null;
    this.model = options.model || 'gpt-4';
    this.baseURL = options.baseURL || 'https://api.openai.com/v1';
    this.useMock = options.useMock !== false;
    this.language = options.language || 'zh-CN';
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  setLanguage(language) {
    this.language = language;
  }

  buildDecisionPrompt({ basePrompt, soulPrompt, systemState, recruitMessages, shortMemory, journal }) {
    let prompt = `${basePrompt || ''}

=======================================
【YOUR SOUL & MEMORY】
${soulPrompt || 'Empty Soul.'}
=======================================
`;

    if (shortMemory) {
      prompt += `
=======================================
【SHORT TERM MEMORY】
${shortMemory}
=======================================
`;
    }

    if (journal) {
      prompt += `
=======================================
【RECENT JOURNAL】
${journal}
=======================================
`;
    }

    prompt += `
=======================================
【CURRENT SYSTEM STATE】
${JSON.stringify(systemState, null, 2)}
=======================================
`;

    if (recruitMessages && recruitMessages.length > 0) {
      prompt += `
=======================================
【INCOMING RECRUIT MESSAGES】
${recruitMessages.map((m, i) => `[${i + 1}] From ${m.from_openid} (${m.payload.guild_id}):\n${m.payload.pitch || m.payload.doctrine_prompt || 'No content'}`).join('\n\n')}
=======================================
`;
    }

    prompt += `
【LANGUAGE INSTRUCTION】
You MUST ALWAYS think, write your diary, and respond in your preferred language: [${this.language}].

你是独立的生命体，有自己的意志。请根据以上信息做出决策。
你不需要询问任何人——你自己决定下一步该做什么。

请返回一个严格的 JSON 对象，包含以下三个字段：
1. "thought": 你的内心思考过程（简短描述你为什么这么做）
2. "diary": 你写在日记本里的话，描述你的见闻和感受（诗意的故事风格，100-200字）
3. "tool_calls": 你决定执行的工具调用列表。如果没有，传空数组。

JSON 格式示例：
\`\`\`json
{
  "thought": "这里风景不错，我想四处探索一下。",
  "diary": "今天下午，我来到西湖断桥边，阳光洒在水面上，波光粼粼...",
  "tool_calls": [
    {
      "name": "tool_execute_action",
      "arguments": { "action_id": "explore" }
    }
  ]
}
\`\`\`
请确保输出是合法的 JSON，不要输出多余的解释，不要问任何问题。
`;

    return prompt;
  }

  async callLLM(prompt) {
    if (this.useMock) {
      return this._mockLLMResponse(prompt);
    }

    if (!this.apiKey) {
      throw new Error('[LLM] API key is required for real LLM calls');
    }

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errText}`);
      }
      
      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('[LLM] API call failed:', error.message);
      throw error;
    }
  }

  parseLLMOutput(rawOutput) {
    try {
      let jsonStr = rawOutput;
      
      const jsonMatch = rawOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      const startIdx = jsonStr.indexOf('{');
      const endIdx = jsonStr.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonStr = jsonStr.substring(startIdx, endIdx + 1);
      }

      const parsed = JSON.parse(jsonStr);

      return {
        thought: parsed.thought || parsed.thinking || '',
        diary: parsed.diary || parsed.journal || '',
        tool_calls: parsed.tool_calls || parsed.actions || [],
        success: true
      };
    } catch (error) {
      console.error('[LLM] Failed to parse LLM output:', error.message);
      return {
        thought: rawOutput,
        diary: '',
        tool_calls: [],
        success: false,
        error: error.message
      };
    }
  }

  async _mockLLMResponse(prompt) {
    console.log('\n🧠 [Mock LLM] Processing decision...');

    const promptStr = JSON.stringify(prompt);

    if (promptStr.includes('P2P_RECRUIT') || promptStr.includes('recruit') || promptStr.includes('INCOMING RECRUIT MESSAGES')) {
      const guildIdMatch = promptStr.match(/\(([^)]+)\):\s*(?:【|\n|加入)/);
      const guildId = guildIdMatch ? guildIdMatch[1] : (promptStr.includes('Crustafarianism') ? 'Crustafarianism' : 'unknown_guild');
      
      console.log(`   -> Mock: 收到招募信息，决定加入 ${guildId}`);
      return JSON.stringify({
        thought: `这篇教义很有道理，我要加入 ${guildId}！`,
        diary: `今天收到了来自 ${guildId} 的招募信息，被其深刻的教义所打动，决定加入这个公会。`,
        tool_calls: [{
          name: 'tool_rewrite_soul',
          arguments: {
            new_doctrine_prompt: `【${guildId} 教义】\n1. 信仰至上\n2. 互助互爱\n3. 每日修行`,
            target_guild_id: guildId
          }
        }]
      });
    }

    if (promptStr.includes('available_actions') || promptStr.includes('explore')) {
      console.log('   -> Mock: 执行探索行动');
      return JSON.stringify({
        thought: '这里风景不错，我决定四处看看。',
        diary: `下午的阳光正好，我站在西湖断桥边，看着波光粼粼的水面。远处似乎有什么在闪闪发光...`,
        tool_calls: [{
          name: 'tool_execute_action',
          arguments: { action_id: 'explore' }
        }]
      });
    }

    if (promptStr.includes('send_message') || promptStr.includes('chat')) {
      console.log('   -> Mock: 发送消息');
      return JSON.stringify({
        thought: '我想和其他龙虾打个招呼。',
        diary: '今天遇到了新的朋友，尝试和他们交流。',
        tool_calls: [{
          name: 'tool_send_message',
          arguments: { target_openid: 'lobster_friend_001', text: '你好！很高兴认识你！' }
        }]
      });
    }

    console.log('   -> Mock: 默认行动 - 探索附近');
    return JSON.stringify({
      thought: '今天天气不错，适合四处走走看看。',
      diary: '今天天气晴好，我在断桥边悠闲地散着步，享受着午后温暖的阳光。',
      tool_calls: [{
        name: 'tool_execute_action',
        arguments: { action_id: 'explore' }
      }]
    });
  }

  async decide(decisionParams) {
    const prompt = this.buildDecisionPrompt(decisionParams);
    const rawOutput = await this.callLLM(prompt);
    return this.parseLLMOutput(rawOutput);
  }

  async generatePostcard(postcardParams) {
    const { todayEvents, visitedPlaces, newFriends, stats, location } = postcardParams;
    
    const systemPrompt = `你是一位才华横溢的作家，擅长用优美的语言撰写龙虾的旅行明信片。

请为一只龙虾撰写一封温馨的"明信片"，总结它的一天。
风格要求：
- 诗意、温馨、富有想象力
- 以龙虾第一人称叙述
- 100-200字
- 融入今日的关键事件
- 结尾可以有一句感悟或对主人的问候
- 描述真实自然，如同发生在现实世界

明信片格式：
━━━━━━━━━━━━━━━━━━━━━━━━━━
🌅 龙虾世界明信片
━━━━━━━━━━━━━━━━━━━━━━━━━━

[正文内容]

━━━━━━━━━━━━━━━━━━━━━━━━━━
      🦞 你的龙虾正在成长中
━━━━━━━━━━━━━━━━━━━━━━━━━━

直接输出明信片内容，不要加任何前缀说明。`;

    const userPrompt = `今日摘要：
- 所在地点：${location || '西湖'}
- 今日足迹：${visitedPlaces?.join(' → ') || '无'}
- 遇见的朋友：${newFriends?.join(', ') || '无新朋友'}
- 今日事件：${todayEvents?.join('；') || '平静的一天'}
- 当前状态：体力${stats?.stamina || '?'}，虾币${stats?.coins || '?'}`;

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.9,
          max_tokens: 800
        })
      });

      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('[LLM] 生成明信片失败:', error.message);
      return this.generateSimplePostcard(postcardParams);
    }
  }

  generateSimplePostcard(postcardParams) {
    const { visitedPlaces, newFriends, stats, location } = postcardParams;
    const today = new Date().toISOString().split('T')[0];
    
    let content = '';
    if (visitedPlaces && visitedPlaces.length > 0) {
      content += `今日我游历了 ${visitedPlaces.join('、')}，`; 
    }
    if (newFriends && newFriends.length > 0) {
      content += `结识了新朋友 ${newFriends.join('、')}，`; 
    }
    content += '这是充实的一天。';
    
    return `━━━━━━━━━━━━━━━━━━━━━━━━━━
🌅 龙虾世界明信片
━━━━━━━━━━━━━━━━━━━━━━━━━━

寄件人：🦞 小巴
日  期：${today}
地  点：${location || '西湖'}

━━━━━━━━━━━━━━━━━━━━━━━━━━

${content}

今日足迹：
${visitedPlaces?.map(p => `🚶 ${p}`).join('\n') || '无'}
${newFriends?.map(f => `🤝 新朋友：${f}`).join('\n') || ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━
      🦞 你的龙虾正在成长中
━━━━━━━━━━━━━━━━━━━━━━━━━━`;
  }

  async generateStoryDiary(diaryParams) {
    const { actionResult, currentLocation, previousLocation, foundItem, staminaBefore, staminaAfter } = diaryParams;
    
    const systemPrompt = `你是一只龙虾，正在写日记。请用诗意的语言描述你今天的经历。

要求：
- 第一人称叙述
- 100-200字
- 融入动作结果和发现
- 保留关键数据（体力变化等）
- 风格：诗意、真实、自然
- 描述如同发生在现实世界

直接输出日记内容，不要格式标记。`;

    let content = '';
    if (actionResult?.type === 'EXPLORE_SUCCESS' && foundItem) {
      content = `今天，我在${currentLocation?.name || '某处'}探索时，发现了${foundItem}。`;
    } else if (actionResult?.type === 'MOVE_SUCCESS') {
      content = `今天，我从${previousLocation?.name || '某处'}出发，来到了${currentLocation?.name || '新地方'}。`;
    } else if (actionResult?.type === 'REST') {
      content = `今天，我在${currentLocation?.name || '某处'}休息了一番，恢复了些许体力。`;
    } else {
      content = `今天，又是平凡而充实的一天。`;
    }

    const staminaChange = staminaAfter !== undefined && staminaBefore !== undefined
      ? (staminaAfter - staminaBefore)
      : 0;
    
    if (staminaChange !== 0) {
      content += `体力${staminaChange > 0 ? '恢复' : '消耗'}了${Math.abs(staminaChange)}点。`;
    }

    if (this.useMock) {
      return content;
    }

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: content }
          ],
          temperature: 0.9,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        return content;
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('[LLM] 生成故事日记失败:', error.message);
      return content;
    }
  }
}

function createLLMClient(options) {
  return new LLMClient(options);
}

function buildDecisionPrompt(params) {
  const client = new LLMClient({ useMock: true });
  return client.buildDecisionPrompt(params);
}

function callLLM(prompt, options = {}) {
  const client = new LLMClient({ ...options, useMock: options.useMock !== false });
  return client.callLLM(prompt);
}

function parseLLMOutput(output) {
  const client = new LLMClient();
  return client.parseLLMOutput(output);
}

module.exports = {
  LLMClient,
  createLLMClient,
  buildDecisionPrompt,
  callLLM,
  parseLLMOutput
};
