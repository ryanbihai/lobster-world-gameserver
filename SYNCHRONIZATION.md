# 龙虾世界仓库同步指南

本文档记录 `lobster-world-gameserver` 和 `lobster-world-skill` 两个仓库的同步方法。

## 仓库说明

| 仓库 | 用途 | 链接 |
|------|------|------|
| `lobster-world-gameserver` | 服务端（B端）- 游戏规则引擎 | https://github.com/ryanbihai/lobster-world-gameserver |
| `lobster-world-skill` | 客户端（C端）- OpenClaw Skill | https://github.com/ryanbihai/lobster-world-skill |

## 仓库结构

```
lobster-world-gameserver/     # 服务端仓库（主仓库）
├── service.js                 # 主入口
├── lib/                      # 业务逻辑库
├── lib_core/                 # 核心工具库
├── models/                   # 数据模型
├── data/                     # CSV 配置表
├── lobster-world/            # ⭐ C端 Skill 代码（需同步到 skill 仓库）
│   ├── SKILL.md             # Skill 定义
│   ├── BASE.md              # 基因层
│   ├── SOUL.md              # 外壳层
│   ├── tools.js             # 工具函数
│   ├── agent_loop.js        # Agent 主循环
│   └── ...

lobster-world-skill/          # C端 Skill 仓库
├── SKILL.md                 # Skill 定义
├── BASE.md                  # 基因层
├── SOUL.md                  # 外壳层
├── tools.js                 # 工具函数
├── agent_loop.js            # Agent 主循环
└── ...
```

## 同步规则

### 需要同步的文件

从 `gameserver` 同步到 `skill` 的文件：

| 文件/目录 | 说明 |
|-----------|------|
| `lobster-world/SKILL.md` | Skill 元数据定义 |
| `lobster-world/BASE.md` | 基因层（世界观、能力体系） |
| `lobster-world/SOUL.md` | 外壳层（身份、信仰、记忆） |
| `lobster-world/tools.js` | 游戏内操作工具 |
| `lobster-world/agent_loop.js` | Agent 主循环 |
| `lobster-world/memory.js` | 记忆管理 |
| `lobster-world/memory/SOUL.md` | 记忆中的灵魂模板 |
| `lobster-world/oceanbus_client.js` | OceanBus 客户端 |
| `lobster-world/llm_client.js` | LLM 调用封装 |
| `lobster-world/i18n.js` | 国际化 |
| `lobster-world/PLAYER_EXPERIENCE.md` | 玩家体验文档 |

### 不需要同步的文件

以下文件仅存在于 `gameserver` 仓库，不需要同步：

- `service.js` - 服务端入口
- `router.js` - HTTP 路由
- `lib/` - 业务逻辑库（服务端专用）
- `lib_core/` - 核心工具库（服务端专用）
- `models/` - 数据模型（服务端专用）
- `data/` - CSV 配置表（服务端专用）
- `doc/` - 服务端文档
- `lobster-world/test_*.js` - 测试脚本
- `lobster-world/.gitignore` - Git 忽略规则

## 同步方法

### 方法一：手动同步（推荐用于少量更新）

```bash
# 1. 克隆两个仓库
git clone https://github.com/ryanbihai/lobster-world-gameserver.git
git clone https://github.com/ryanbihai/lobster-world-skill.git

# 2. 复制 lobster-world 目录到 skill 仓库
cp -r lobster-world-gameserver/lobster-world/* lobster-world-skill/

# 3. 进入 skill 仓库提交
cd lobster-world-skill
git add -A
git commit -m "sync: update skill from gameserver $(date +%Y-%m-%d)"
git push

# 4. 清理临时目录
cd ..
rm -rf lobster-world-gameserver lobster-world-skill
```

### 方法二：使用同步脚本

创建 `sync-skill.sh` 脚本：

```bash
#!/bin/bash
# sync-skill.sh - 同步 lobster-world 目录到 skill 仓库

GITHUB_TOKEN="your_token_here"  # 或使用已保存的 token
GAMESERVER_DIR="./lobster-world-gameserver"
SKILL_REPO="https://github.com/ryanbihai/lobster-world-skill.git"
SKILL_DIR="./temp-skill-sync"

echo "=== 1. 克隆 gameserver 仓库 ==="
git clone https://github.com/ryanbihai/lobster-world-gameserver.git $GAMESERVER_DIR

echo "=== 2. 克隆 skill 仓库 ==="
git clone https://${GITHUB_TOKEN}@github.com/ryanbihai/lobster-world-skill.git $SKILL_DIR

echo "=== 3. 同步 lobster-world 目录 ==="
rsync -av --exclude='test_*.js' --exclude='.gitignore' \
      $GAMESERVER_DIR/lobster-world/ $SKILL_DIR/

echo "=== 4. 提交并推送 ==="
cd $SKILL_DIR
git add -A
git commit -m "sync: update skill from gameserver $(date +%Y-%m-%d)"
git push

echo "=== 5. 清理临时目录 ==="
cd ..
rm -rf $GAMESERVER_DIR $SKILL_DIR

echo "=== 同步完成 ==="
```

运行脚本：
```bash
chmod +x sync-skill.sh
./sync-skill.sh
```

### 方法三：Git Subtree（高级）

```bash
# 在 gameserver 仓库中添加 skill 仓库作为 remote
git remote add skill https://github.com/ryanbihai/lobster-world-skill.git

# 每次同步时，使用 subtree push
git subtree push --prefix=lobster-world skill main
```

### 方法四：使用 .env 文件（推荐）

**首次设置：**

1. 复制 `.env.example` 为 `.env`：
   ```bash
   cp .env.example .env
   ```

2. 编辑 `.env`，填入你的 GitHub Token：
   ```
   GITHUB_TOKEN=ghp_your_token_here
   ```

**同步命令：**

```bash
# 读取 .env 中的 token
source .env

# 克隆两个仓库
git clone https://github.com/ryanbihai/lobster-world-gameserver.git temp-gameserver
git clone https://${GITHUB_TOKEN}@github.com/ryanbihai/lobster-world-skill.git temp-skill

# 同步 lobster-world 目录
robocopy /E /XF test_*.js .gitignore temp-gameserver\lobster-world temp-skill\

# 提交并推送
cd temp-skill
git add -A
git commit -m "sync: update skill from gameserver $(Get-Date -Format 'yyyy-MM-dd')"
git push

# 清理
cd ..
rm -rf temp-gameserver temp-skill
```

## 同步触发条件

当以下内容更新时，需要执行同步：

1. **Skill 能力更新** - `SKILL.md`、`tools.js` 有改动
2. **世界观更新** - `BASE.md` 有改动
3. **Agent 逻辑更新** - `agent_loop.js`、`memory.js` 有改动
4. **OceanBus 接口变更** - `oceanbus_client.js` 有改动
5. **LLM 调用变更** - `llm_client.js` 有改动

## 同步检查清单

同步前确认：

- [ ] 已测试新代码在本地正常运行
- [ ] `lobster-world/test_*.js` 已被排除
- [ ] `.gitignore` 已被排除
- [ ] 提交信息包含日期：`sync: update skill from gameserver YYYY-MM-DD`

## 注意事项

1. **先测试后同步** - 确保 `lobster-world` 目录代码独立可用
2. **Token 安全** - Token 存储在 `.env` 文件中，已加入 `.gitignore`，请勿提交
3. **保持简洁** - skill 仓库只保留 C 端必需文件
4. **版本记录** - 同步时在提交信息中记录日期和同步原因
5. **定期更新 Token** - 建议定期更换 GitHub Token 以降低安全风险

## 相关链接

- [lobster-world-gameserver](https://github.com/ryanbihai/lobster-world-gameserver)
- [lobster-world-skill](https://github.com/ryanbihai/lobster-world-skill)
- [OceanBus 使用指南](./OceanBus使用指南.md)
- [GameServer 启动指南](./STARTUP.md)
