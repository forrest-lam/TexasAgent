# TexasAgent 🃏

一个全栈德州扑克游戏，内置 AI 对手和 LLM 实时策略顾问。

## 功能特性

### 游戏模式

- **单人模式** — 本地运行，无需联网，与 AI 对手即时对战
- **多人在线** — 基于 Socket.IO 的实时多人房间，支持 2-9 人，可添加 AI 机器人补位

### AI 系统

**规则引擎 (Rule-Based)**：基于手牌强度、底池赔率、位置等因素进行数学决策，提供三种性格：

| 性格 | 风格 |
|------|------|
| Conservative | 紧被动，低诈唬率，高弃牌阈值 |
| Aggressive | 松激进，高诈唬率，低弃牌阈值 |
| Balanced | 介于两者之间的均衡打法 |

**LLM 引擎**：调用 OpenAI 兼容 API 驱动 AI 决策，API 不可用时自动降级为规则引擎。

### LLM 策略顾问

为人类玩家提供实时策略建议：

- 发送完整牌局上下文（手牌、公共牌、位置、底池赔率、筹码深度）
- 集成**玩家行为画像**系统——按阶段追踪对手历史行为（VPIP、PFR、翻后激进度、弃牌率等）
- 识别对手风格（tight/loose × passive/aggressive / maniac / rock）并给出针对性剥削建议
- 追踪对手 tilt 状态（连败检测）
- 支持 OpenAI、DeepSeek 等任意兼容 API

### 其他特性

- **动画** — Framer Motion 驱动的筹码飞行、发牌翻牌、加注特效等动画
- **音效** — 基于 Web Audio API 的纯代码音效（发牌/过牌/跟注/加注/弃牌/全下/赢牌），支持开关和音量调节
- **国际化** — 中文 / English 双语切换
- **完整德扑规则** — preflop → flop → turn → river → showdown，支持边池、全部操作、10 种牌型评估

## 技术栈

| 层 | 技术 |
|----|------|
| 客户端 | React 18 + TypeScript + Vite + Tailwind CSS + Zustand |
| 服务端 | Express + Socket.IO + TypeScript |
| 共享层 | Monorepo (npm workspaces)，类型定义与游戏逻辑复用 |
| UI 组件 | Radix UI + shadcn/ui + Framer Motion + Lucide Icons |

## 项目结构

```
TexasAgent/
├── client/                  # React 客户端
│   └── src/
│       ├── components/      # UI 组件（牌桌、玩家、控制面板）
│       ├── pages/           # 页面（大厅、游戏）
│       ├── services/        # LLM 顾问、本地游戏引擎、玩家记忆、音效
│       ├── stores/          # Zustand 状态管理
│       └── i18n/            # 国际化
├── server/                  # Node.js 服务端
│   └── src/
│       ├── ai/              # AI 引擎（规则/LLM）+ 性格系统
│       ├── game-controller  # 游戏流程控制
│       └── room-manager     # 房间管理
└── shared/                  # 共享类型、牌组、手牌评估、规则
```

## 快速开始

### 前置要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
git clone https://github.com/forrest-lam/TexasAgent.git
cd TexasAgent
npm install
```

### 配置 LLM（可选）

复制环境变量文件并填入你的 API Key：

```bash
cp client/.env.example client/.env
```

```env
VITE_LLM_API_KEY=sk-your-api-key
VITE_LLM_API_BASE_URL=https://api.openai.com/v1
VITE_LLM_MODEL=gpt-4o-mini
```

> 支持任何 OpenAI 兼容 API（DeepSeek、Ollama 等），不配置也可正常游戏，仅 LLM 顾问和 LLM AI 引擎不可用。

### 启动

```bash
# 同时启动客户端和服务端
npm run dev

# 或分别启动
npm run dev:client   # http://localhost:5173
npm run dev:server   # http://localhost:3001
```

单人模式只需启动客户端，多人在线需要同时启动服务端。

## License

[MIT](LICENSE)
