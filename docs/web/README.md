# AB Console - Web Dashboard 文档

> 更新于 2026-01-31

## 概述

Web Dashboard 位于 `AB Console-Backend/web/`，提供实时交易界面。

- **技术栈**: Next.js 14 + React 18 + TypeScript + Tailwind CSS + Lightweight Charts v5
- **端口**: 3000
- **API 依赖**: `http://localhost:8088` (后端 API Service)

## 页面

| 路径 | 功能 |
|------|------|
| `/` | 首页 |
| `/chart` | K 线图表 |
| `/scanner` | 市场扫描 |
| `/signals` | 信号监控 |
| `/strategies` | 策略管理 |
| `/trades` | 交易记录 |

## 启动

```bash
cd "AB Console-Backend/web"
npm install          # 首次安装依赖
npm run dev          # 启动开发服务器 (端口 3000)
```

或通过一键启动脚本自动启动：

```bash
bash "📁 启动工具/🚀 一键启动.command"
```

## 配置

环境变量: `AB Console-Backend/web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8088
NEXT_PUBLIC_WS_URL=ws://localhost:8088
```
