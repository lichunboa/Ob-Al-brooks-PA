# AB Console Dashboard

交易员控制台 Web 端 - Al Brooks 价格行为交易系统

## 技术栈

- **框架**: Next.js 14 (App Router)
- **语言**: TypeScript 5.x
- **样式**: Tailwind CSS
- **图表**: Lightweight Charts
- **状态管理**: Zustand
- **实时通信**: Socket.io Client
- **部署**: Docker

## 快速开始

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
```

### Docker 开发（推荐）

```bash
# 使用 docker-compose 启动开发环境
docker-compose --profile dev up dashboard-dev

# 访问 http://localhost:3000
# 代码修改会自动热更新
```

### Docker 生产部署

```bash
# 构建并启动生产版本
docker-compose up -d dashboard

# 或者单独构建
docker build -t ab-console-dashboard .
docker run -p 3000:3000 ab-console-dashboard
```

## 项目结构

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # 仪表板布局组
│   │   ├── layout.tsx      # 主布局
│   │   ├── page.tsx        # 首页
│   │   ├── chart/          # K线图表页
│   │   ├── scanner/        # 市场扫描页
│   │   ├── signals/        # 信号监控页
│   │   ├── strategies/     # 策略管理页
│   │   ├── backtest/       # 策略回测页
│   │   └── settings/       # 设置页
│   ├── layout.tsx          # 根布局
│   └── globals.css         # 全局样式
├── components/             # React 组件
│   ├── chart/              # 图表组件
│   ├── scanner/            # 扫描仪组件
│   ├── signals/            # 信号组件
│   ├── layout/             # 布局组件
│   └── ui/                 # UI 基础组件
├── hooks/                  # 自定义 Hooks
├── lib/                    # 工具库
│   ├── ws.ts               # WebSocket 客户端
│   └── utils.ts            # 工具函数
├── stores/                 # Zustand 状态管理
├── types/                  # TypeScript 类型
└── ...
```

## 环境变量

复制 `.env.example` 到 `.env.local` 并修改：

```bash
# API 配置
NEXT_PUBLIC_API_URL=http://localhost:8080      # 后端 HTTP API
NEXT_PUBLIC_WS_URL=ws://localhost:8088         # WebSocket 服务
```

## 后端依赖

Web Dashboard 需要以下后端服务：

1. **HTTP API** (`http://localhost:8080`): 历史数据查询
2. **WebSocket** (`ws://localhost:8088`): 实时数据推送

详见 `backend/core/` 项目。

## 迁移状态

从 Obsidian 插件迁移的进度：

| 功能 | 状态 | 备注 |
|------|------|------|
| K线图表 | 🟡 进行中 | 基础框架完成，待接入 WebSocket |
| 市场扫描 | ⚪ 待开始 | 占位页面已创建 |
| 信号监控 | ⚪ 待开始 | 占位页面已创建 |
| 策略管理 | ⚪ 待开始 | 占位页面已创建 |
| 策略回测 | ⚪ 待开始 | 占位页面已创建 |

## 开发规范

- 使用 TypeScript 严格模式
- 组件使用函数组件 + Hooks
- 状态管理使用 Zustand
- WebSocket 使用单例模式封装
- 样式使用 Tailwind CSS

## License

Private - 仅供内部使用
