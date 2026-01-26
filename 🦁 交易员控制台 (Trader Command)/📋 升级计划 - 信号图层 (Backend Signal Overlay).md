# 📋 升级计划 - 信号图层 (Backend Signal Overlay)

> 基于 Spec-Workflow-MCP 流程编写

## 1. 📝 需求规格 (Requirements)

### 1.1 核心目标
将后端 `signal-service` 计算生成的算法信号（如 Setup 信号、趋势判断、支撑压力位）直观地绘制在前端 Market Scanner 的 K 线图表上，实现“算法可视化”。

### 1.2 用户故事 (User Stories)
- **作为** 交易员，**我希望** 在 Market Scanner 的迷你图表中看到买入/卖出箭头，**以便** 快速识别潜在交易机会。
- **作为** 交易员，**我希望** 能看到关键的支撑/压力线，**以便** 判断价格所处的位置。
- **作为** 系统管理员，**我希望** 图表上的信号能与价格数据保持同步刷新，**以便** 看到最新的算法结论。

### 1.3 功能性需求
1.  **信号获取**: 前端需调用后端 API 获取指定品种的最新信号列表。
2.  **信号标记**: 在 K 线图相应的时间点上绘制标记 (Markers)：
    *   **买入信号**: K 线下方显示绿色向上箭头，附带文字注释（如 "H1"）。
    *   **卖出信号**: K 线上方显示红色向下箭头，附带文字注释（如 "L1"）。
3.  **绘图同步**: 信号标记的坐标（时间、价格）必须与 K 线数据严格对齐。

### 1.4 技术性需求
1.  **API 接口**: 复用或增强 `GET /api/v1/signals/{symbol}` 接口。
2.  **前端库**: 使用 Lightweight Charts 的 `series.setMarkers()` API 进行绘制。
3.  **性能**: 信号数据量可能较大，需限制只获取可视范围内的信号（如最近 50 根 K 线）。

---

## 2. 🎨 系统设计 (Design)

### 2.1 API 接口设计
后端 API `GET /api/v1/signals/{symbol}` 需返回标准化的 Marker 数据结构：
```json
// Response Example
[
  {
    "time": 1706275800,       // Unix Timestamp (秒)
    "position": "belowBar",   // "belowBar" | "aboveBar"
    "color": "#10B981",       // 颜色
    "shape": "arrowUp",       // "arrowUp" | "arrowDown"
    "text": "H1 Buy",         // 信号名称
    "id": "sig_123"           // 唯一标识
  }
]
```

### 2.2 前端组件架构
修改 `MiniChart.tsx` 组件，增加 `SignalLayer` 逻辑：

```mermaid
graph TD
    A[MarketScanner] --> B[MiniChart Component]
    B --> C[Create Chart Instance]
    B --> D[Fetch Candle Data]
    B --> E[Fetch Signal Data]
    D --> F[chart.addSeries(Candlestick)]
    E --> G[series.setMarkers(signals)]
```

### 2.3 数据流 (Data Flow)
1.  **Init**: `MiniChart` 加载，创建图表。
2.  **Data Loop**: 
    *   请求 K 线数据 -> `series.setData(candles)`
    *   请求 信号数据 -> 转换格式 -> `series.setMarkers(markers)`
3.  **Update**: 每 60 秒轮询一次，更新 K 线和 Markers。

---

## 3. ✅ 任务分解 (Tasks)

### Phase 1: 后端准备
- [ ] **Task 1.1**: 检查 `signal-service` 的 API 返回格式，确保包含 `time`, `type` (buy/sell), `price`, `description`。
- [ ] **Task 1.2**: (可选) 如果后端格式不兼容 Lightweight Charts，编写适配器函数进行转换。

### Phase 2: 前端实现
- [ ] **Task 2.1**: 在 `MiniChart.tsx` 中定义 `SeriesMarker` 接口类型。
- [ ] **Task 2.2**: 实现 `fetchSignals(ticker)` 函数，调用后端 API。
- [ ] **Task 2.3**: 实现 `renderMarkers(series, signals)` 函数，将信号转换为 Lightweight Charts Marker 格式并设置。
- [ ] **Task 2.4**: 将信号获取逻辑集成到 `MiniChart` 的 `useEffect` 刷新循环中。

### Phase 3: 验证与优化
- [ ] **Task 3.1**: 启动后端，手动触发一个模拟信号，验证前端是否显示箭头。
- [ ] **Task 3.2**: 调整箭头的颜色、大小和位置，确保不遮挡 K 线。
- [ ] **Task 3.3**: 验证多品种（ES, NQ）同时加载时的性能。

---

## 4. 🧪 验证计划 (Verification)

### 4.1 手动验证
1.  打开 Obsidian 控制台 -> 市场扫描仪。
2.  确认 ES/NQ 图表加载成功。
3.  等待或手动生成一个后端信号。
4.  **预期结果**: 图表上对应 K 线位置出现彩色箭头标记。

### 4.2 边界测试
- **无信号时**: 图表应正常显示 K 线，无报错。
- **大量信号时**: 图表应保持流畅，不卡顿。
- **网络断开时**: 应显示错误提示或保持旧数据，不应白屏崩溃。
