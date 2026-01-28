# 🦞 Moltbot-Feishu Bridge

将 [Moltbot](https://molt.bot) 接入飞书，让你在手机上随时随地和 AI 助理对话。

## 功能特点

- ✅ **飞书私聊** - 在飞书中直接与 Moltbot 对话
- ✅ **消息卡片** - 优雅的"正在思考..."加载状态
- ✅ **会话记忆** - 保持对话上下文
- ✅ **消息去重** - 自动处理飞书重试机制
- ✅ **长连接** - 无需公网域名，使用飞书 WebSocket 长连接

## 架构

```
┌─────────────┐      ┌──────────────────────────────────────┐
│   飞书App   │ ←──→ │              云服务器                 │
│  (手机/电脑) │      │  ┌───────────┐    ┌────────────────┐  │
└─────────────┘      │  │ 桥接服务   │ ←→ │ Moltbot Gateway │  │
       ↑             │  │ (Node.js)  │    │   (端口18789)   │  │
       │             │  └───────────┘    └────────────────┘  │
   飞书长连接         └──────────────────────────────────────┘
                                              ↓
                                    ┌─────────────────┐
                                    │   LLM API       │
                                    │ (DeepSeek等)    │
                                    └─────────────────┘
```

## 快速开始

### 前置要求

- 云服务器（阿里云/腾讯云等，2核2G即可）
- Node.js 18+
- 飞书开放平台账号
- LLM API Key（DeepSeek / MiniMax 等）

### 第一步：安装 Moltbot

```bash
# 安装 Node.js 22（如果没有）
curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo -E bash -
sudo yum install -y nodejs  # 或 apt install nodejs

# 配置 Git（解决依赖问题）
git config --global url."https://github.com/".insteadOf git@github.com:

# 安装 Moltbot
sudo npm i -g clawdbot@latest

# 初始化
clawdbot onboard
```

### 第二步：配置 Moltbot

1. 复制配置模板：
```bash
cp moltbot-config/clawdbot.json.example ~/.clawdbot/clawdbot.json
cp moltbot-config/.env.example ~/.clawdbot/.env
```

2. 编辑 `~/.clawdbot/.env`，填入你的 API Key：
```bash
DEEPSEEK_API_KEY=sk-your-api-key
```

3. 编辑 `~/.clawdbot/clawdbot.json`：
   - 修改 `gateway.auth.token` 为一个随机字符串
   - 根据需要调整模型配置

4. 设置权限：
```bash
chmod 600 ~/.clawdbot/.env
```

### 第三步：部署飞书桥接服务

1. 复制桥接服务代码：
```bash
cp -r feishu-bridge ~/feishu-bridge
cd ~/feishu-bridge
```

2. 安装依赖：
```bash
npm install
```

3. 配置环境变量：
```bash
cp .env.example .env
# 编辑 .env，填入飞书凭证和 Moltbot token
chmod 600 .env
```

### 第四步：配置 Systemd 服务

```bash
# 创建服务目录
mkdir -p ~/.config/systemd/user

# 复制服务文件
cp systemd/moltbot.service ~/.config/systemd/user/
cp systemd/feishu-bridge.service ~/.config/systemd/user/

# 根据你的用户名修改服务文件中的路径

# 重载并启动
systemctl --user daemon-reload
systemctl --user enable clawdbot feishu-bridge
systemctl --user start clawdbot
systemctl --user start feishu-bridge

# 启用开机自启（需要 linger）
sudo loginctl enable-linger $USER
```

### 第五步：配置飞书应用

1. 登录 [飞书开放平台](https://open.feishu.cn)
2. 创建企业自建应用
3. 添加「机器人」能力
4. 配置权限：
   - `im:message`
   - `im:message:send_as_bot`
   - `im:chat:readonly`
5. 在「事件订阅」中启用「使用长连接接收事件」
6. 添加事件：`im.message.receive_v1`
7. 发布应用

详细步骤请参考 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## 目录结构

```
moltbot-feishu-bridge/
├── README.md                    # 本文件
├── LICENSE                      # MIT 开源协议
├── .gitignore
├── feishu-bridge/
│   ├── index.js                 # 飞书桥接服务核心代码
│   ├── package.json             # 依赖配置
│   └── .env.example             # 环境变量模板
├── moltbot-config/
│   ├── clawdbot.json.example    # Moltbot 配置模板
│   └── .env.example             # API Key 模板
├── systemd/
│   ├── moltbot.service          # Moltbot systemd 服务
│   └── feishu-bridge.service    # 桥接服务 systemd 服务
└── docs/
    └── DEPLOYMENT.md            # 详细部署文档
```

## 常见问题

### 飞书消息重复回复

这是因为飞书的消息重试机制。本项目已实现消息去重，如果仍有问题，请检查服务是否正常运行。

### "使用长连接"无法保存

需要先启动桥接服务，建立 WebSocket 连接后，再在飞书开放平台保存配置。

### 回复只有"正在思考..."

检查 Moltbot 服务是否正常：
```bash
systemctl --user status clawdbot
journalctl --user -u clawdbot -f
```

## 相关资源

- [Moltbot 官网](https://molt.bot)
- [Moltbot GitHub](https://github.com/moltbot/moltbot)
- [飞书开放平台](https://open.feishu.cn)
- [DeepSeek API](https://platform.deepseek.com)

## License

MIT
