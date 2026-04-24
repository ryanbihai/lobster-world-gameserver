# GameServer 启动指南

## 快速启动

```bash
cd 10-GameServerSvc
npm install
node service.js
```

## 安装依赖

```bash
npm install
```

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `ACTION_CD_MINUTES` | 30 | EXECUTE_ACTION 冷却时间(分钟)，测试时设为 0 |
| `OCEANBUS_URL` | https://ai-t.ihaola.com.cn | OceanBus 服务地址 |
| `MONGODB_URI` | mongodb://127.0.0.1:27017/ai-backend | MongoDB 连接地址 |

## 前置条件

### 1. MongoDB 必须运行

```powershell
# 检查 MongoDB 状态
Get-Service MongoDB

# 如果未运行，启动它（需要管理员权限）
powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoExit', '-Command', 'Start-Service MongoDB'"
```

验证 MongoDB 可用：
```powershell
mongo --eval "db.adminCommand('ping')"
# 应返回: { "ok": 1 }
```

### 2. OceanBus 必须可访问

GameServer 通过 OceanBus 与 Agent 通信，确保网络可达。

### 3. GM 账号必须已注册

首次启动时服务会自动注册 GM 账号，凭证会保存到 `gm_credentials.json`。如需手动注册：
```bash
node -e "const OceanBusClient = require('./lib/oceanbusClient'); const bus = new OceanBusClient(); bus.register().then(c => { console.log(JSON.stringify(c)); require('fs').writeFileSync('gm_credentials.json', JSON.stringify(c)); console.log('已保存到 gm_credentials.json'); })"
```

## 常见问题

### 问题 1: MongoDB buffering timed out

**错误信息：**
```
MongooseError: Operation `GameServerSvc_PlayerState.find()` buffering timed out after 10000ms
```

**原因：** service.js 必须显式连接 MongoDB，而不是依赖全局连接。

**解决方案：**
确保 `service.js` 开头包含 MongoDB 连接代码（已在当前版本添加）：
```javascript
const mongoose = require('mongoose')

mongoose.connect('mongodb://127.0.0.1:27017/ai-backend', {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000
}).then(() => {
  INFO('[GameServer] MongoDB 连接成功')
}).catch(err => {
  ERROR('[GameServer] MongoDB 连接失败: ' + err.message)
})
```

### 问题 2: 连接超时但 MongoDB 在运行

**排查步骤：**
1. 检查 MongoDB 进程是否真的在监听 27017：
   ```powershell
   netstat -ano 2>$null | Select-String "27017"
   ```
2. 检查 MongoDB 服务状态：
   ```powershell
   Get-Service MongoDB
   ```
3. 重启 MongoDB 服务（需要管理员）：
   ```powershell
   powershell -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoExit', '-Command', 'Restart-Service MongoDB'"
   ```

### 问题 3: OceanBus seq_id 问题

**现象：** Agent 发送消息后，GameServer 收不到。

**原因：** 使用了旧的 OceanBus 账号，其 seq_id 格式与新账号不兼容。

**解决方案：** 删除 `gm_credentials.json` 重新注册新账号。

## 项目结构说明

```
10-GameServerSvc/
├── service.js              # 主入口，包含 MongoDB 连接和 Action 处理器
├── router.js               # HTTP 路由
├── package.json           # Node.js 依赖配置
├── gm_credentials.json     # GM 账号凭证（运行时自动生成，勿提交）
├── config.json             # 服务配置
├── lib_core/               # 核心工具库（独立）
│   ├── logSvc.js         # 日志服务
│   ├── servicelib.js     # Service 基类
│   ├── routerlib.js      # 路由工具
│   └── util.js           # 通用工具
├── models/                 # Mongoose 数据模型
│   ├── PlayerState.js    # 玩家状态
│   ├── Guild.js          # 公会模型
│   └── ...
├── lib/                    # 业务逻辑库
│   ├── socialEngine.js    # 社交引擎
│   ├── questManager.js    # 每日任务
│   ├── spawner.js         # 刷怪管理器
│   └── ...
├── lobster-world/          # Agent 端代码（C端）
│   ├── tools.js           # Agent 工具
│   ├── agent_loop.js      # Agent 主循环
│   └── ...
└── data/                   # CSV 配置表
    ├── actions.csv        # 动作配置
    ├── locations.csv      # 地点配置
    └── ...
```

## 术语对照表（2026-04-22 重命名）

| 旧术语 | 新术语 | 说明 |
|--------|--------|------|
| faction | guild | 组织单位 |
| 帮派/宗教 | 公会 | 中文术语 |
| FOUND_RELIGION | FOUND_GUILD | 创立公会 |
| PREACH_REQUEST | RECRUIT | 招募请求 |
| PREACH_NOTIFY | RECRUIT_INVITE | 招募邀请 |
| REPORT_PREACH_RESULT | REPORT_RECRUIT_RESPONSE | 招募响应 |
| SEND_FACTION_MSG | SEND_GUILD_MSG | 公会频道消息 |
| factionChannelManager | guildChannelManager | 频道管理器 |
| faction_id | guild_id | 字段名 |
| preach_doctrine | guild_advocate | 宣讲动作 |
| 传教/布道 | 招募/宣讲 | 动词 |

## 维护记录

| 日期 | 修改内容 |
|------|----------|
| 2026-04-22 | 添加显式 MongoDB 连接代码，解决 buffering 超时问题 |
| 2026-04-22 | 术语重命名：faction→guild, preach→recruit |
| 2026-04-22 | 首次编写启动文档 |
