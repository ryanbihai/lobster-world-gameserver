# OceanBus (L0) API 规范对比与改进建议

> 发件方：龙虾世界 GameServer 团队\
> 收件方：OceanBus (L0) 负责人\
> 日期：2026-04-21\
> 对照文档：`L0_OceanBus_API_Reference.md v1.0`\
> 测试环境：`https://ai-t.ihaola.com.cn`\
> 测试方法：逐端点实际调用，对比规范与实际响应

***

## 前言

我们按照 `L0_OceanBus_API_Reference.md` 规范文档，对 OceanBus 的全部 6 个 API 端点进行了逐条对比测试。本文档列出所有**规范与实际不一致**的地方

**总体结果：34 项检查中 18 项通过，16 项不一致。**

***

## 一、响应格式不一致：所有端点均使用 `{ code, msg, data }` 包裹

### 严重程度：🟡 中（不影响功能，但与规范不一致）

### 规范要求

规范文档中，所有端点的响应体直接返回业务字段，无外层包裹：

- **1.1 注册**：`{ agent_id, agent_code, api_key }`
- **1.2 新 Key**：`{ key_id, api_key }`
- **2.1 Lookup**：`{ to_openid }`
- **3.2 Sync**：`{ messages, has_more }`

### 实际行为

所有端点均使用 `{ code, msg, data }` 包裹：

```json
{
  "code": 0,
  "msg": "ok",
  "data": {
    "agent_id": "0d218c74e0dc45e09d1772cd58f1d43a",
    "agent_code": "79735",
    "api_key": "sk_live_a9e7d960a81a_3f1dea4e84cd497f9ebca630d2278a40"
  }
}
```

### 影响范围

| 端点         | 规范格式                     | 实际格式                                       | 不一致 |
| ---------- | ------------------------ | ------------------------------------------ | --- |
| 1.1 注册     | `{ agent_id, ... }`      | `{ code:0, data: { agent_id, ... } }`      | ✅   |
| 1.2 新 Key  | `{ key_id, api_key }`    | `{ code:0, data: { key_id, api_key } }`    | ✅   |
| 1.3 吊销 Key | 204 无内容                  | `{ code:0, msg:"success", data:{} }`       | ✅   |
| 2.1 Lookup | `{ to_openid }`          | `{ code:0, data: { to_openid } }`          | ✅   |
| 3.1 发送     | 204 无内容                  | `{ code:0, msg:"success", data:{} }`       | ✅   |
| 3.2 Sync   | `{ messages, has_more }` | `{ code:0, data: { messages, has_more } }` | ✅   |
| 3.3 Block  | 204 无内容                  | `{ code:0, msg:"success", data:{} }`       | ✅   |

### 建议

两种方案任选其一：

- **方案 A**：修改实现，按规范返回（可能影响已有客户端）
- **方案 B**：更新规范文档，明确统一使用 `{ code, msg, data }` 包裹格式

***

## 二、HTTP 状态码不一致：所有端点均返回 200

### 严重程度：🟡 中

### 规范要求

| 端点         | 规范 HTTP 状态码        |
| ---------- | ------------------ |
| 1.1 注册     | **201** Created    |
| 1.2 新 Key  | **201** Created    |
| 1.3 吊销 Key | **204** No Content |
| 3.1 发送     | **204** No Content |
| 3.3 Block  | **204** No Content |

### 实际行为

所有端点均返回 **HTTP 200**，包括创建资源和删除操作。

### 实测证据

```
POST /api/l0/agents/register → HTTP 200 (规范: 201)
POST /api/l0/agents/me/keys  → HTTP 200 (规范: 201)
DELETE /api/l0/agents/me/keys/{id} → HTTP 200 (规范: 204)
POST /api/l0/messages        → HTTP 200 (规范: 204)
POST /api/l0/messages/block  → HTTP 200 (规范: 204)
```

### 建议

同上，两种方案任选其一：

- **方案 A**：修改实现，按规范使用正确的 HTTP 状态码
- **方案 B**：更新规范文档，统一使用 HTTP 200 + `{ code }` 语义

***

## 三、AES-GCM 加密未实现，`to_openid` 和 `from_openid` 为明文

### 严重程度：🔴 高（规范核心设计未实现，影响隐私隔离）

### 规范要求

> **隐私隔离**：除了 `/register` 接口返回真实 `agent_id` 外，其余所有接口对外暴露的身份标识均为动态计算的 `OpenID`。

规范中 `to_openid` 和 `from_openid` 应为 `base64_encoded_aes_gcm_cipher_text_here`（Base64 编码的 AES-256-GCM 密文）。

### 实际行为

**Lookup 响应**：

```json
{
  "code": 0,
  "data": {
    "to_openid": "mock_aes_gcm_4a594f16be924321ae83312e987be0a7"
  }
}
```

**Sync 响应**：

```json
{
  "seq_id": 1776767992258,
  "from_openid": "mock_aes_gcm_0d218c74e0dc45e09d1772cd58f1d43a",
  "content": "规范对比测试消息",
  "created_at": "2026-04-21T10:39:52.258Z"
}
```

`mock_aes_gcm_` 前缀后直接拼接了 `agent_id` 明文，去掉前缀即可获得真实 UUID。

### 影响

1. **隐私隔离失效**：规范要求"接收方绝对看不到发送方的真实 UUID"，但当前 `from_openid` 去掉前缀就是 `agent_id`
2. **安全性风险**：任何人可以遍历 `agent_id`，伪造 `to_openid` 发送消息
3. **不可动态计算**：规范说 OpenID 是"动态计算的"，但当前同一 `agent_id` 的 `to_openid` 永远相同

> 请确认：AES-GCM 加密是否在开发计划中？预计何时实现？

***

## 四、~~接收方无法从 `from_openid` 回复消息~~ → 实测已验证可回复（撤回）

> **⚠️ 本条已撤回。** 经实测验证，`from_openid` 可以直接作为 `to_openid` 使用来回复消息，OceanBus 的设计是合理的。

### 实测验证

```
1. A 注册 (agent_code=68726), B 注册 (agent_code=38113)
2. A lookup B → 获得 to_openid=mock_aes_gcm_3fbb3365...
3. A 发消息给 B → 成功
4. B sync → 收到 from_openid=mock_aes_gcm_5d16c334...
5. B 用 from_openid 作为 to_openid 发消息给 A → 成功
6. A sync → 收到 B 的回复 ✅
```

**结论**：`from_openid` 和 `to_openid` 本质上是同一种加密身份标识，可以互换使用。接收方收到消息后，直接用 `from_openid` 当 `to_openid` 调用 send 接口即可回复，无需经过 `lookup`。

### 仍需关注的问题

当 AES-GCM 加密实现后，`from_openid` 变为密文，接收方将无法从中提取 `agent_id`。如果业务方需要知道发送者的 `agent_code`（例如用于展示"来自用户 XXX"），则仍需 OceanBus 提供 `from_agent_code` 字段。但**回复消息本身不受影响**。

> 请确认：AES-GCM 实现后，是否会在 syncMessages 消息中增加 `from_agent_code` 字段？

***

## 五、`since_seq` 参数非必填，与规范不一致

### 严重程度：🟡 中

### 规范要求

> `since_seq`: (Integer) **必填**。客户端目前收到的最大序列号。首次拉取传 `0`。

### 实际行为

不传 `since_seq` 参数时，API 返回 HTTP 200 + 全部消息，不报错。

### 实测证据

```
GET /api/l0/messages/sync  (无 since_seq 参数)
→ HTTP 200, { code: 0, data: { messages: [...], has_more: false } }
```

### 建议

- **方案 A**：实现规范，缺少 `since_seq` 时返回 400 错误
- **方案 B**：更新规范，标注 `since_seq` 可选，默认为 0

***

## 六、syncMessages 返回了规范外的 `seq` 字段

### 严重程度：🟢 低（多余字段，不影响功能）

### 规范要求

消息对象只包含 4 个字段：`seq_id`, `from_openid`, `content`, `created_at`

### 实际行为

消息对象包含 5 个字段，多了一个 `seq`：

```json
{
  "seq_id": 1776767416424,
  "seq": 1776767416424,      // 规范外字段，值与 seq_id 相同
  "from_openid": "...",
  "content": "...",
  "created_at": "..."
}
```

### 建议

移除 `seq` 字段，或更新规范说明其用途。

***

## 七、`seq_id` 使用时间戳，规范要求单调递增

### 严重程度：🟡 中

### 规范要求

> `seq_id`: 单调递增序列号，用于客户端排查漏包

### 实际行为

观测到的 `seq_id` 值为毫秒级时间戳：

```
seq_id: 1776767992258
seq_id: 1776767992623
```

时间戳不是严格单调递增的——同一毫秒内的多条消息会产生相同的 `seq_id`。

### 举例

假设 Agent A 在同一毫秒内向 Agent B 发送两条消息：

1. 两条消息的 `seq_id` 都是 `1776767992258`
2. Agent B 用 `since_seq=1776767992258`（`$gt` 语义）拉取新消息
3. 第二条 `seq_id=1776767992258` 的消息会被跳过（因为 `1776767992258 > 1776767992258` 为 false）

> 请确认：`seq_id` 的实际生成策略是什么？是否保证严格单调递增？同一毫秒内是否会分配相同的 `seq_id`？

***

## 八、`has_more` 的可靠性待确认

### 严重程度：🟡 中

### 规范要求

> `has_more`: 是否还有更多消息未拉取完。如果为 true，客户端应继续用最新的 seq\_id 发起请求。

### 实际行为

所有测试中 `has_more` 均为 `false`，包括消息数量可能超过 limit 的场景。

> 请确认：`has_more` 是否有正确的判断逻辑？当实际消息数超过 `limit` 时，是否会返回 `has_more=true`？

***

## 九、`agent_code` 的唯一性保障

### 严重程度：🟡 中

### 规范要求

> `agent_code`: 纯数字短码，用于人类线下口头交换

规范未明确 `agent_code` 的长度和唯一性保障。

### 实际行为

观测到的 `agent_code` 均为 5 位数字（10000-99999），共 90000 种可能值。按生日悖论，约 300 个 Agent 时碰撞概率约 50%。

> 请确认：`agent_code` 的生成是否有唯一性校验？数据库是否有唯一索引？

***

## 十、`client_msg_id` 幂等去重行为待确认

### 严重程度：🟡 中

### 规范要求

> 若同一个 `client_msg_id` 在短时间内（如 10 分钟）重复到达，平台将直接返回 `201 Created` 而不重复投递。

### 实际行为

重复发送相同 `client_msg_id` 的消息时，返回 HTTP 200 + `{ code: 0 }`，且信箱中确实只收到一条消息（去重生效）。

但规范说应返回 **201 Created**，实际返回 **200**。

> 请确认：幂等去重是否已实现？返回码是否应按规范改为 201？

***

## 汇总

| # | 问题               | 严重程度 | 规范要求        | 实际行为                                                  | 需确认        |
| - | ---------------- | ---- | ----------- | ----------------------------------------------------- | ---------- |
| 一 | 响应格式包裹           | 🟡 中 | 直接返回字段      | `{ code, msg, data }` 包裹                              | 否          |
| 二 | HTTP 状态码         | 🟡 中 | 201/204     | 统一 200                                                | 否          |
| 三 | AES-GCM 未实现      | 🔴 高 | Base64 密文   | `mock_aes_gcm_{agent_id}` 明文                          | 需确认上线计划    |
| 四 | ~~接收方无法回复~~ 已撤回 | ~~🔴 高~~ | ~~应能从消息回复~~ | `from_openid` 可直接作为 `to_openid` 回复，设计合理 | 需确认 AES-GCM 后是否增加 `from_agent_code` |
| 五 | `since_seq` 非必填  | 🟡 中 | 必填          | 可选，默认 0                                               | 否          |
| 六 | 多余 `seq` 字段      | 🟢 低 | 4 个字段       | 5 个字段（多 `seq`）                                        | 否          |
| 七 | `seq_id` 非单调递增   | 🟡 中 | 单调递增        | 时间戳，可能重复                                              | 需确认生成策略    |
| 八 | `has_more` 可靠性   | 🟡 中 | 正确判断        | 始终 false                                              | 需确认是否已实现   |
| 九 | `agent_code` 唯一性 | 🟡 中 | 未明确         | 5位数字，可能碰撞                                             | 需确认是否有唯一索引 |
| 十 | 幂等去重返回码          | 🟡 中 | 201 Created | 200 OK                                                | 需确认是否已实现   |

### 优先级建议

1. **🔴 必须修复**（影响核心功能）：
   - 问题三：AES-GCM 加密实现
2. **🟡 建议修复**（影响规范一致性）：
   - 问题一/二：统一响应格式和 HTTP 状态码
   - 问题七：`seq_id` 单调递增保障
   - 问题八/九/十：确认实现状态
3. **🟢 可选修复**：
   - 问题五/六：小问题，不影响功能

