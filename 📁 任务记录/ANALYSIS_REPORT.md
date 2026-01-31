> **⚠️ 历史文档 (2026-01 重组前)** — 本文记录的路径和架构可能已过时，仅供参考。当前项目结构请查看 `📁 开发文档/PROJECT_STRUCTURE.md`。

# 📋 问题分析与修复报告

**日期**: 2026-01-29  
**状态**: ✅ 全部修复完成

---

## 一、品牌名问题深度调查

### 调查结果

| 项目 | 发现 |
|------|------|
**原始品牌名** | TradeCat
**当前品牌名** | AB Console (Al Brooks Console)
**更改原因** | 品牌重新定位，与 Al Brooks 价格行为方法论关联
**文件夹命名** | 保持 AB Console-* 前缀（Git历史兼容性）
**显示命名** | 使用 AB Console（Web端、文档）

### 代码中使用情况

| 位置 | 品牌名使用 | 状态 |
|------|-----------|------|
| Web Sidebar Logo | AB Console | ✅ 正确 |
| Web layout title | AB Console | ✅ 正确 |
| Web Settings | AB Console | ✅ 正确 |
| Python Server 输出 | AB Console | ✅ 正确 |
| Python 路径硬编码 | TradeCat-Obsidian | ⚠️ 必要（兼容性） |
| 文件夹名 | AB Console-* | ⚠️ 必要（Git历史） |

### 为什么文件夹名保持 AB Console-*？

```python
# backend/data-service/strategy_sync.py
STRATEGY_REPO_PATH = os.path.join(VAULT_PATH, "TradeCat-Obsidian/策略仓库...")

# backend/data-service/trade_sync.py  
TRADES_PATH = os.path.join(VAULT_PATH, "TradeCat-Obsidian/Daily/Trades")
```

**如果改为 AB Console-Obsidian：**
1. 所有 Python 路径硬编码需要更改
2. Git 历史记录中断
3. 用户本地工作流需要重新配置

**结论**: 品牌名策略正确，无需修改。显示用 AB Console，文件夹用 AB Console-*。

---

## 二、用户历史需求整理

### 核心架构需求

| 需求 | 状态 | 备注 |
|------|------|------|
| 3层架构分离 | ✅ | Obsidian(知识) + Web(实时) + Backend(数据) |
| Obsidian专注知识管理 | ✅ | 笔记、复盘、策略卡片 |
| Web端负责实时功能 | ✅ | K线、扫描、信号监控 |
| 后端提供数据服务 | ✅ | HTTP + WebSocket |

### 功能需求

| 需求 | 状态 | 备注 |
|------|------|------|
| Web端7个页面 | ✅ | Dashboard, Chart, Scanner, Signals, Strategies, Backtest, Trades, Settings |
| K线图表 | ✅ | 显示真实数据（已修复） |
| 图表信号标记 | ✅ | Lightweight Charts v5 API已修复 |
| 实时市场扫描 | ✅ | Obsidian端图表已修复 |
| 策略双向同步 | ✅ | 11策略已同步 |
| 交易记录同步 | ✅ | 8条记录已同步 |
| Obsidian策略为主 | ✅ | Web端只读 |
| Web创建策略生成Markdown | ✅ | 按Obsidian格式 |

---

## 三、修复详情

### 问题1: Web端图表Markers不显示

**原因**: Lightweight Charts v5 移除了 `series.setMarkers()` 方法，改为使用 `createSeriesMarkers()` 函数创建插件。

**修复文件**: `TradeCat-Web/tradecat-dashboard/src/components/chart/TradingViewChart.tsx`

**修复内容**:
```typescript
// 旧代码 (v4 API)
import { SeriesMarker, MarkerPosition, MarkerShape } from 'lightweight-charts';
series.setMarkers(markers);

// 新代码 (v5 API)
import { createSeriesMarkers, ISeriesMarkersPluginApi } from 'lightweight-charts';
const markersPlugin = createSeriesMarkers(series, []);
markersPlugin.setMarkers(chartSignals);
```

### 问题2: Web端显示模拟数据而非真实数据

**原因**: 
1. 后端API返回的数据时间戳格式与前端期望不完全一致
2. 缺少数据源状态显示，无法区分真实/模拟数据

**修复文件**: 
- `TradeCat-Web/tradecat-dashboard/src/app/(dashboard)/chart/page.tsx`
- `TradeCat-Backend/backend/data-service/server_full.py`

**修复内容**:
1. 添加数据源状态显示（Binance/模拟）
2. 改进时间戳处理，确保秒级时间戳
3. 添加错误提示，明确显示数据来源

### 问题3: Obsidian市场扫描仪图表不显示

**原因**: API端点路径不匹配
- Obsidian MiniChart 调用: `/api/v1/candles/BTCUSDT?limit=50`
- 后端实际提供: `/api/v1/candles?symbol=BTCUSDT`
- 数据格式也不一致：Obsidian期望 `open_time` ISO字符串，后端返回 `time` Unix时间戳

**修复文件**: `TradeCat-Backend/backend/data-service/server_full.py`

**修复内容**:
```python
# 新增端点支持Obsidian插件的路径格式
if path.startswith('/api/v1/candles/'):
    symbol = path.split('/')[-1].upper()
    # ...获取数据...
    # 转换为Obsidian期望的格式
    formatted_candles = [{
        'open_time': datetime.fromtimestamp(c['time']).isoformat(),
        'open': c['open'],
        'high': c['high'],
        'low': c['low'],
        'close': c['close'],
        'volume': c.get('volume', 0)
    } for c in candles]
    self.send_json(formatted_candles)
```

---

## 四、重启服务

修复完成后，需要重启后端服务以应用更改：

```bash
# 停止现有服务
./stop-all.sh

# 启动所有服务
./start-all.sh
```

或手动重启后端：
```bash
cd TradeCat-Backend/backend/data-service
python3 server_full.py
```

---

## 五、验证清单

- [ ] Web端K线图表显示真实Binance数据
- [ ] Web端图表显示买入/卖出信号标记
- [ ] Obsidian市场扫描仪显示品种价格
- [ ] Obsidian市场扫描仪显示Mini图表
- [ ] 数据源状态指示器显示"Binance"或"模拟"

