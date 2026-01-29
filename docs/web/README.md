# Web Dashboard 文档

## 简介

AB Console Web Dashboard 是基于 Next.js 14 的实时交易工作台，用于替代 Obsidian 中的重型图表功能。

## 项目结构

```
tradecat-dashboard/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (dashboard)/        # 仪表板路由组
│   │   │   ├── chart/          # K线图表页
│   │   │   ├── scanner/        # 市场扫描页
│   │   │   ├── signals/        # 信号监控页
│   │   │   ├── strategies/     # 策略管理页
│   │   │   ├── backtest/       # 策略回测页
│   │   │   └── settings/       # 设置页
│   │   ├── layout.tsx          # 根布局
│   │   └── globals.css         # 全局样式
│   ├── components/
│   │   ├── chart/              # 图表组件
│   │   ├── layout/             # 布局组件
│   │   └── ui/                 # UI 基础组件
│   ├── hooks/                  # 自定义 Hooks
│   ├── lib/                    # 工具库
│   ├── stores/                 # 状态管理
│   └── types/                  # TypeScript 类型
├── public/                     # 静态资源
├── Dockerfile                  # Docker 配置
├── docker-compose.yml          # Docker Compose
└── package.json
```

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js | 14.2.x |
| 语言 | TypeScript | 5.x |
| 样式 | Tailwind CSS | 3.x |
| 图表 | Lightweight Charts | 5.1.x |
| 图标 | Lucide React | latest |
| HTTP | Fetch API | Native |

## 开发

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
cd tradecat-dashboard
npm install
```

### 环境变量

创建 `.env.local` 文件：

```bash
# 本地开发配置
NEXT_PUBLIC_API_URL=http://localhost:8088
NEXT_PUBLIC_WS_URL=ws://localhost:8088
```

### 启动开发服务器

```bash
npm run dev

# 访问 http://localhost:3000
```

### Docker 开发

```bash
# 启动开发容器（热更新）
docker-compose --profile dev up dashboard-dev
```

## 页面说明

### K线图表 (`/chart`)

- 显示指定品种的 K线图表
- 支持多时间框架切换
- 显示策略信号（列表形式）
- 从后端 API 获取实时数据

**待完善:**
- [ ] 图表上的信号标记
- [ ] WebSocket 实时推送
- [ ] 更多技术指标

### 市场扫描 (`/scanner`)

- 多品种实时监控
- 价格变动提醒

**状态:** 占位页面，待开发

### 信号监控 (`/signals`)

- 实时信号推送
- 信号历史记录

**状态:** 占位页面，待开发

## API 集成

### 后端 API 地址

```typescript
const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088';
```

### 获取 K线数据

```typescript
fetch(`${apiUrl}/api/v1/candles?symbol=BTCUSDT&interval=5m&limit=100`)
  .then(res => res.json())
  .then(data => {
    // data.candles: Candle[]
    // data.source: 'binance' | 'mock'
  });
```

### 获取策略信号

```typescript
fetch(`${apiUrl}/api/v1/signals/analyze?symbol=BTCUSDT&interval=5m`)
  .then(res => res.json())
  .then(data => {
    // data.signals: Signal[]
  });
```

## 组件说明

### TradingViewChart

基于 Lightweight Charts 的 K线图表组件。

```typescript
interface TradingViewChartProps {
  symbol: string;           // 交易品种
  interval: TimeFrame;      // 时间框架
  candles: Candle[];        // K线数据
  signals?: ChartSignal[];  // 信号标记
  onTimeFrameChange?: (tf: TimeFrame) => void;
}
```

### 布局组件

- `Sidebar`: 侧边栏导航
- `Header`: 顶部状态栏
- `BackendControl`: 后端服务控制面板

## 部署

### Vercel（推荐）

```bash
# 安装 Vercel CLI
npm i -g vercel

# 部署
vercel --prod
```

### Docker

```bash
# 构建镜像
docker build -t tradecat-dashboard .

# 运行
docker run -p 3000:3000 tradecat-dashboard
```

### 静态导出

```bash
# 配置 next.config.mjs 中设置 output: 'export'
npm run build

# 导出到 dist 目录
```

## 开发计划

### Phase 1: 基础功能 ✅
- [x] 项目框架搭建
- [x] K线图表显示
- [x] 后端 API 集成
- [x] 基础布局

### Phase 2: 核心功能 🟡
- [ ] 图表信号标记
- [ ] WebSocket 实时推送
- [ ] 市场扫描仪
- [ ] 信号监控面板

### Phase 3: 高级功能 ❌
- [ ] 策略管理
- [ ] 策略回测
- [ ] 用户设置
- [ ] 移动端适配

## 常见问题

### Q: 图表不显示？
A: 检查后端服务是否运行，查看浏览器控制台网络请求。

### Q: 数据不是最新的？
A: 检查后端是否能连接到 Binance API，或是否使用了模拟数据。

---

*详见开发指南: [开发指南.md](./开发指南.md)*
*详见部署指南: [部署指南.md](./部署指南.md)*
