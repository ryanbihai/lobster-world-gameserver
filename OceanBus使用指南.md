# OceanBus (L0) 使用指南与设计分析

> 版本: v1.0 | 更新: 2026-04-21 | 基于实际 API 诊断测试撰写

---

## 一、OceanBus 是什么

OceanBus 是龙虾世界的 **L0 层通信基础设施**，提供 Agent-to-Agent (A2A) 的消息路由服务。它的核心设计理念是**盲传**——只负责消息投递，不关心消息内容。

### 核心概念

| 概念 | 说明 | 示例 |
|------|------|------|
| `agent_id` | Agent 的全局唯一标识 (UUID) | `cdca54afa21a4f6094576f2777148dbb` |
| `agent_code` | Agent 的数字短码 (5位)，用于人类/LLM 交互 | `24841` |
| `api_key` | Agent 的认证密钥，格式 `sk_live_{key_id}_{secret}` | `sk_live_338ed46fc1cf_b9729...` |
| `to_openid` | 接收方的加密标识，通过 lookup 获取 | `mock_aes_gcm_cdca54afa21a...` |
| `seq_id` | 消息序列号，当前实现为 `Date.now()` 时间戳 | `1776765519237` |

---

## 二、API 端点详解

### 2.1 注册 Agent — `POST /api/l0/agents/register`

**请求**: 无需认证，无请求体

**响应**:
```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "agent_id": "cdca54afa21a4f6094576f2777148dbb",
    "agent_code": "24841",
    "api_key": "sk_live_338ed46fc1cf_b9729dbb7c95443aa4d159bb7560155c"
  }
}
```

**注意事项**:
- `api_key` 必须妥善保存，OceanBus 不存储明文密钥
- `agent_code` 是随机 5 位数字，理论上可能冲突（当前无唯一索引保障）
- 注册后 Agent 即可收发消息，无需额外激活

---

### 2.2 精确寻址 — `GET /api/l0/agents/lookup?agent_code={code}`

**请求**: 需要 Bearer Token 认证

**响应**:
```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "to_openid": "mock_aes_gcm_04e1fd61993c45ee9fe2929fab5c3f21"
  }
}
```

**注意事项**:
- 只接受 `agent_code`（数字短码），不接受 `agent_id`
- 返回的 `to_openid` 当前为 `mock_aes_gcm_{agent_id}` 格式（模拟加密）
- lookup 结果应缓存，避免频繁调用

---

### 2.3 发送消息 — `POST /api/l0/messages`

**请求**:
```json
{
  "to_openid": "mock_aes_gcm_04e1fd...",
  "client_msg_id": "550e8400-e29b-41d4-a716-446655440000",
  "content": "{\"from_openid\":\"self\",\"timestamp\":1776765518897,\"action\":\"HELLO\"}"
}
```

**响应**:
```json
{
  "code": 0,
  "msg": "success",
  "data": {}
}
```

**⚠️ 关键行为 — 盲传**:
- `content` 必须是 **JSON 字符串**，不是 JSON 对象
- OceanBus **不会修改** content 中的任何字段
- `from_openid` 字段完全由发送方自行填写，L0 层不替换、不校验
- 发送方应在 content 中自行携带身份信息（如 `agent_code`），否则接收方无法知道消息来自谁

**推荐的消息格式**:
```json
{
  "from_openid": "self",
  "from_agent_code": "24841",
  "timestamp": 1776765518897,
  "msg_type": "YOUR_MESSAGE_TYPE",
  "...": "其他业务字段"
}
```

---

### 2.4 同步信箱 — `GET /api/l0/messages/sync?since_seq={seq}`

**请求**: 需要 Bearer Token 认证

**响应**:
```json
{
  "code": 0,
  "data": {
    "messages": [
      {
        "seq_id": 1776765519237,
        "from_openid": "mock_aes_gcm_cdca54afa21a4f6094576f2777148dbb",
        "content": "{\"from_openid\":\"self\",\"action\":\"HELLO\"}",
        "created_at": "2026-04-21T09:58:31.000Z"
      }
    ],
    "has_more": false
  }
}
```

**⚠️ 关键行为**:
- `since_seq` 使用 `$gt`（严格大于）语义，返回 `seq_id > since_seq` 的消息
- 服务端**不返回** `next_seq` 字段，客户端需自行从最后一条消息的 `seq_id` 计算下次游标
- `from_openid` 由服务端生成，格式为 `mock_aes_gcm_{from_agent_id}`，**与 content 中的 `from_openid` 无关**
- `has_more` 当前硬编码为 `false`，不可信赖

**正确的轮询方式**:
```javascript
let lastSeq = 0;

async function poll() {
  const data = await syncMessages(lastSeq);
  for (const msg of data.messages) {
    // 处理消息...
    lastSeq = msg.seq_id;  // 注意：服务端返回的字段名是 seq_id，不是 seq
  }
  // 下次调用 syncMessages(lastSeq) 即可获取新消息
}
```

---

## 三、已知问题与设计分析

### 🔴 严重问题

#### 3.1 `seq_id` 使用 `Date.now()` 而非原子计数器

**现状**: `seq_id = Date.now()`
**风险**: 同一毫秒内的多条消息会产生相同的 `seq_id`，导致 `$gt` 查询漏消息
**建议**: 使用 MongoDB 的原子计数器或 ObjectId

#### 3.2 客户端 SDK 与服务端字段名不匹配

| 字段 | 服务端返回 | 客户端 SDK 期望 |
|------|-----------|----------------|
| 序列号 | `seq_id` | `seq` |
| 下次游标 | 无 `next_seq` | `next_seq` |
| 分页标记 | `has_more` | 未使用 |

**影响**: 客户端 `syncMessages` 返回的 `next_seq` 始终为 `undefined`，导致游标逻辑失效，每次都从 seq=0 重新拉取所有消息

#### 3.3 接收方无法可靠识别发送者

**现状**: 
- 服务端在 `syncMessages` 返回的 `from_openid` 是 `mock_aes_gcm_{agent_id}` 格式
- 但 content 中的 `from_openid` 由发送方自行填写（通常是 `"self"`）
- 接收方需要从 `from_openid` 中提取 `agent_id`（去掉 `mock_aes_gcm_` 前缀），然后再用 `agent_id` 去 lookup——但 lookup 只接受 `agent_code`

**影响**: GameServer 收到消息后，知道发送者的 `agent_id`，但无法用 `agent_id` 进行 lookup 回复。必须要求发送方在 content 中携带 `agent_code`。

### 🟡 中等问题

#### 3.4 `agent_code` 无唯一索引

**现状**: `agent_code` 通过 `Math.random() * 90000 + 10000` 生成，范围 10000-99999
**风险**: 9 万个 Agent 后必然冲突，且无数据库唯一索引保障
**建议**: 添加唯一索引，或扩大范围

#### 3.5 `has_more` 硬编码为 `false`

**现状**: 无论实际是否还有更多消息，都返回 `has_more: false`
**影响**: 客户端无法知道是否需要继续拉取

#### 3.6 `seq_id` 无数据库索引

**现状**: `seq_id` 字段无索引，`$gt` 查询会全表扫描
**影响**: 消息量大时查询性能急剧下降

---

## 四、设计合理性评估

### ✅ 合理的设计

1. **盲传架构**: L0 层不解析业务内容，只负责路由，符合分层原则
2. **双 ID 设计**: `agent_code`（短码，人类可读）+ `agent_id`（UUID，机器可读），兼顾易用性和唯一性
3. **API Key 认证**: 简单有效，支持多 Key 管理
4. **信箱模型**: syncMessages 拉取模式，适合 Agent 定时轮询的场景

### ⚠️ 需要改进的设计

1. **发送者身份应由 L0 层注入**: 当前 L0 层知道发送者的 `agent_id`（通过 API Key 认证），但不将其注入 content。建议 L0 层在 `syncMessages` 返回时，将 `from_openid` 放在一个独立的、不可伪造的字段中（而非混在 content 里）

2. **游标机制应内建**: 服务端应返回 `next_seq`，避免客户端自行计算。当前客户端 SDK 期望 `next_seq` 但服务端不返回，导致游标失效

3. **`to_openid` 的加密是伪加密**: 当前 `mock_aes_gcm_{agent_id}` 格式等于明文，真正的 AES-GCM 加密尚未实现。在当前阶段这是可接受的（开发环境），但上线前必须实现

4. **缺少消息 TTL 和清理机制**: 消息永久存储，无过期清理。7 天 TTL 在规范文档中提到但未实现

---

## 五、推荐的使用模式

### 5.1 C端 → B端 (GameServer) 通信

```
C端 Agent                    OceanBus                    B端 GameServer
   |                            |                            |
   |-- register() ------------->|                            |
   |<-- agent_code, api_key ----|                            |
   |                            |                            |
   |-- lookup(GM_agent_code) -->|                            |
   |<-- GM_to_openid -----------|                            |
   |                            |                            |
   |-- sendMessage(GM_oid, {   |                            |
   |     from_agent_code: "24841",  // ⚠️ 必须携带！
   |     action: "EXECUTE_ACTION",  |                        |
   |     action_id: "explore"       |                        |
   |   }) ---------------------->|                            |
   |                            |-- 存入 GM 信箱 ----------->|
   |                            |                            |
   |                            |<-- syncMessages(lastSeq) ---|
   |                            |--- 返回消息列表 ----------->|
   |                            |                            |
   |                            |<-- lookup(24841) -----------|
   |                            |--- 返回 C端 to_openid ---->|
   |                            |<-- sendMessage(C_oid, {    |
   |                            |      SYSTEM_STATE payload   |
   |                            |    }) ----------------------|
   |<-- syncMessages ----------|                            |
   |--- 返回 SYSTEM_STATE ---->|                            |
```

### 5.2 关键约定

1. **C端发送消息时必须携带 `from_agent_code`**: 因为 L0 层不注入发送者身份，B端需要 `agent_code` 才能 lookup 回复
2. **B端维护 `openid → agent_code` 映射**: 在 PlayerState 中存储 `agent_code`，避免每次 lookup
3. **轮询间隔建议 3-5 秒**: 当前无推送机制，依赖轮询
4. **游标管理**: 使用消息列表中最后一条的 `seq_id` 作为下次 `since_seq`

---

## 六、快速参考

### 完整的 C端 → B端 → C端 通信代码

```javascript
const OceanBusClient = require('./oceanbus_client');
const bus = new OceanBusClient('https://ai-t.ihaola.com.cn');

// 1. 注册
const creds = await bus.register();
// creds = { agent_id, agent_code, api_key }

// 2. 查找 GameServer
const gmOid = await bus.lookup('90113'); // GM 的 agent_code

// 3. 发送动作请求（必须携带 agent_code！）
await bus.sendMessage(gmOid, {
  from_agent_code: creds.agent_code,  // ← 关键！
  action: 'EXECUTE_ACTION',
  action_id: 'explore'
});

// 4. 轮询回复
let lastSeq = 0;
const sync = await bus.syncMessages(lastSeq);
for (const item of sync.messages) {
  const msg = item.envelope;
  if (msg.msg_type === 'SYSTEM_STATE') {
    console.log('收到 GameServer 回复:', msg);
  }
  lastSeq = item.seq; // 更新游标
}
```

---

## 七、待修复的 SDK Bug

### B端 SDK (`lib/oceanbusClient.js`)

1. `syncMessages` 返回 `data.data.next_seq`，但服务端不返回此字段 → 应改为从 messages 中取最后一条的 `seq_id`
2. `syncMessages` 中 `msg.seq` 应为 `msg.seq_id`（服务端返回的字段名）

### C端 SDK (`lobster-world/oceanbus_client.js`)

同上，`syncMessages` 存在相同的字段名不匹配问题。
