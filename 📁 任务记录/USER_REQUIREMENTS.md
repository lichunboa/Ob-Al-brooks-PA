# 📋 用户需求汇总

**整理日期**: 2026-01-29  
**用途**: 对照检查实现状态

---

## 一、架构需求

### 核心原则
1. **三分离架构**
   - Obsidian: 知识管理（笔记、复盘、策略卡片）
   - Web Dashboard: 实时交易功能（K线、扫描、信号）
   - Backend: 数据服务（API、WebSocket、同步）

2. **数据流向**
   - Obsidian ←→ Backend ←→ Web
   - Markdown文件是数据源的唯一真实来源
   - Web端创建的策略/交易 → Backend生成Markdown → Obsidian显示

3. **品牌命名**
   - 显示名称: AB Console (Al Brooks Console)
   - 文件夹名: AB Console-*（保持Git历史兼容性）
   - 原因: 项目最初名为TradeCat，后更名

---

## 二、功能需求

### Web Dashboard

| 页面 | 功能 | 优先级 |
|------|------|--------|
| Dashboard | 概览、快捷入口 | 高 |
| Chart | K线图表、时间框架切换、信号标记 | 高 |
| Scanner | 市场扫描、多品种监控 | 高 |
| Signals | 信号监控、实时提醒 | 高 |
| Strategies | 策略管理（只读，Obsidian为主） | 中 |
| Trades | 交易记录（双向同步） | 中 |
| Backtest | 策略回测 | 低 |
| Settings | 后端连接配置 | 中 |

### Obsidian插件

| 功能 | 说明 | 优先级 |
|------|------|--------|
| 市场扫描仪 | 品种卡片、Mini图表、价格显示 | 高 |
| 策略卡片 | Markdown格式、Frontmatter属性 | 高 |
| 交易笔记 | 模板化、双向同步 | 高 |
| 复盘分析 | 与交易记录关联 | 中 |
| SRS学习 | 间隔重复系统 | 中 |

### 后端服务

| 服务 | 端口 | 功能 |
|------|------|------|
| HTTP API | 8088 | REST API、数据查询 |
| WebSocket | 8090 | 实时数据推送 |

---

## 三、技术约束

### React 18
- Client Components不能使用async/await顶层
- 使用Promise链 (.then/.catch) 或useEffect内部async函数

### Lightweight Charts v5
- 使用 `createSeriesMarkers()` 替代 `series.setMarkers()`
- Markers是独立的插件，需要单独创建

### 数据格式
- 时间戳: Unix秒级（非毫秒）
- Obsidian MiniChart期望: `open_time` ISO字符串
- Web Chart期望: `time` Unix秒级

---

## 四、待确认事项

以下需求需要用户确认:

1. **Obsidian图表策略**
   - 三分离架构下，Obsidian是否还需要显示图表？
   - 还是直接引导用户到Web端查看专业图表？

2. **实时数据优先级**
   - WebSocket不可用时应降级为HTTP轮询？
   - 还是显示离线状态？

3. **移动端支持**
   - 是否需要适配移动端的响应式布局？
   - 优先级如何？

---

## 五、历史变更记录

| 日期 | 变更 | 原因 |
|------|------|------|
| 2026-01-28 | TradeCat → AB Console | 品牌重新定位 |
| 2026-01-28 | 拆分3层架构 | Obsidian性能优化 |
| 2026-01-29 | 修复图表Markers | Lightweight Charts v5 API变更 |
| 2026-01-29 | 修复Obsidian API路径 | 前后端接口不匹配 |

