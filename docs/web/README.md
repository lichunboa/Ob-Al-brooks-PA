# AB Patrol Web 文档

> 更新于 2026-03-10

## 概述

当前 Web 位于 `AB Patrol-Web/`，提供 Patrol 运行态、图表、扫描、执行与回测相关界面。

- **技术栈**: Next.js 14 + React 18 + TypeScript + Tailwind CSS + Lightweight Charts v5
- **端口**: 3001
- **API 依赖**:
  - `http://localhost:8088` (`api-service`)
  - `http://localhost:8089` (`sync-service`)
  - `http://localhost:8087` (`vis-service`)
  - `http://localhost:3001/api/pa-bot/runtime` (Next Route 聚合 Patrol 运行态)

## 页面

| 路径 | 功能 |
|------|------|
| `/` | 首页 |
| `/pa-bot` | Patrol 运行态主面板 |
| `/chart` | K 线图表 |
| `/scanner` | 市场扫描 |
| `/execution` | 执行总览 |
| `/backtest` | 回测分析 |

## 启动

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Web"
npm install
npm run dev
```

或通过一键启动脚本自动启动：

```bash
bash "📁 启动工具/🚀 一键启动.command"
```

## 配置

环境变量: `AB Patrol-Web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8088
NEXT_PUBLIC_WS_URL=ws://localhost:8088
```
