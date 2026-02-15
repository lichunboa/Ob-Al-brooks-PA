# V3.1 四大修复计划

## 背景

V3.0 上线后发现 4 个问题需要修复。

---

## 阶段 1: 修复止损单问题

### 问题根因
- `executor.py:471` — 市价单成交后 ccxt 返回 `average=None, price=None` → `entry_price=0` → 自动保护性止损不生效
- `position_patrol.py:61` — 巡检用 `get_open_orders()` → 底层 `fetch_open_orders` → 币安 Demo 不返回 STOP_MARKET → 误判裸仓
- `position_patrol.py:72` — `_sl_placed` 是内存 dict，重启后丢失 → 重复补单

### 修复方案

**文件 1**: `execution-service/src/executor.py`

1. **entry_price 兜底**（第 471 行附近）：市价单成交后如果 `average/price` 为空，用 `fetch_ticker` 获取当前价
```python
entry_price = float(order.get('average') or order.get('price') or 0)
if entry_price <= 0:
    try:
        ticker = self.exchange.fetch_ticker(symbol)
        entry_price = float(ticker.get('last', 0))
        logger.warning(f"entry_price 兜底: 使用 ticker.last={entry_price}")
    except Exception: pass
```

2. **新增 `_verify_stop_order` 方法**：下完止损单后用 `fetch_order(order_id)` 精确验证
```python
def _verify_stop_order(self, order_id, symbol) -> bool:
    try:
        order = self.exchange.fetch_order(order_id, symbol)
        return order.get('status') in ('open', 'new', 'NEW')
    except: return False
```

**文件 2**: `execution-service/src/position_patrol.py`

3. **巡检改用 `fetch_orders` 补充查询**（`patrol()` 方法第 62 行后）：
```python
# stop_map 为空时，Demo 模式兜底：查最近订单中的 STOP_MARKET
if not stop_map:
    for sym in [p.symbol for p in positions]:
        ccxt_sym = self._to_ccxt_symbol(sym)
        try:
            recent = self.executor.exchange.fetch_orders(ccxt_sym, limit=20)
            for o in recent:
                if o.get('type') == 'stop_market' and o.get('status') in ('open','new','NEW'):
                    stop_map.setdefault(sym, []).append(...)
        except: pass
```

4. **`_sl_placed` 持久化到文件**：
```python
SL_PLACED_FILE = Path("~/.openclaw/workspace/sl_placed.json").expanduser()
# __init__ 中加载，_fix_naked_position 中保存
```

---

## 阶段 2: 威科夫信号适配

### 问题根因
- `signal-service/src/__main__.py:179-184` — `trend_reversal` 和 `breakout` 是死代码（无引擎生成）
- SQLite 引擎 60+ 种信号全走 `strength>=70 → trader` 或丢弃
- PG 引擎的 `price_surge/dump`, `taker_*` 没路由给威科夫

### 修复方案

**文件**: `signal-service/src/__main__.py` — 重写 `determine_route_targets`（第 158-202 行）

**设计原则**（长期维护友好）：
- 用 **category 分类映射** 而非硬编码 signal_type 列表
- 新增 SQLite 规则自动归类，不需要每次改路由代码
- 威科夫和量化双路由，不减少 trader 信号量

```python
def determine_route_targets(ev):
    targets = []
    source = getattr(ev, 'source', 'unknown')
    signal_type = getattr(ev, 'signal_type', '')
    entry_trigger = getattr(ev, 'entry_trigger', 0.0) or 0.0
    category = getattr(ev, 'category', '')

    # 1. PA Engine → al-brooks（不变）
    if source == 'pa_engine' or source == 'pa' or entry_trigger > 0:
        targets.append('al-brooks')
        return targets

    # 2. 威科夫相关信号（供求/成交量/结构/情绪）
    WYCKOFF_PG_TYPES = {
        'volume_spike', 'price_surge', 'price_dump',
        'oi_surge', 'oi_dump',
        'top_trader_extreme_long', 'top_trader_extreme_short',
        'taker_buy_dominance', 'taker_sell_dominance',
        'taker_ratio_flip_long', 'taker_ratio_flip_short',
    }
    # SQLite 规则中与威科夫相关的 category
    WYCKOFF_SQLITE_CATEGORIES = {'volume', 'futures', 'pattern', 'core'}

    is_wyckoff = signal_type in WYCKOFF_PG_TYPES
    if not is_wyckoff and source == 'sqlite' and category in WYCKOFF_SQLITE_CATEGORIES:
        is_wyckoff = True

    if is_wyckoff:
        targets.append('wyckoff')
        if ev.strength >= 70:
            targets.append('trader')  # 高强度双路由
        return targets

    # 3. 其他量化信号（强度>=70）→ trader（不变）
    if ev.strength >= 70:
        targets.append('trader')
        return targets

    return targets
```

**对其他 bot 的影响**：
- al-brooks: **零影响**（第 1 步已 return）
- trader: **不减少信号**（高强度威科夫信号双路由给 trader）
- wyckoff: **大幅增加**（从 1 种 → 全部供求/结构/情绪类）

### 关于 `core` category
`core` 里包含 `futures_extreme`、`volume_anomaly`、`smc`、`sr`（支撑阻力）、`macd` — 其中 futures_extreme、volume_anomaly、smc 都是威科夫核心分析内容。把整个 core 给威科夫是合理的，因为这些是多指标共振信号，质量高。

---

## 阶段 3: 降低 volume_spike 阈值

**文件**: `signal-service/src/engines/pg_engine.py` 第 707 行

```python
# 改前
(self.rules.check_volume_spike, [curr_candle, prev_candle, 5.0]),
# 改后
(self.rules.check_volume_spike, [curr_candle, prev_candle, 2.5]),
```

后续有数据后再微调。

---

## 阶段 4: VPVR 可视化集成

### 现状
- vis-service 已在本地 `services-preview/vis-service/`，端口 8087
- 已有 `/kline-envelope` 页面（K线包络图）和 `/render` API
- 已有 VPVR 模板注册（vpvr-ridge 等）
- Web Dashboard 已有侧边栏导航

### 实施步骤

**1. 启动脚本添加 vis-service**
**文件**: `start-core-services.sh`
- 在 telegram-service 之前添加 `start_service "vis-service"` (vis-service 在 services-preview 目录，需调整路径)
- 或新建独立启动命令

**2. Web 代理配置**
**文件**: `web/next.config.mjs` — `rewrites()` 添加:
```javascript
{ source: '/api/vis/:path*', destination: 'http://localhost:8087/:path*' },
```

**3. 新增 VPVR 页面**
**文件**: `web/src/app/(dashboard)/vpvr/page.tsx`（新建）
- iframe 嵌入 vis-service 的 kline-envelope 页面
- 添加品种选择器和 VPVR 模板选择

**4. 侧边栏添加入口**
**文件**: `web/src/components/layout/Sidebar.tsx`
```typescript
{ href: '/vpvr', label: 'VPVR 分析', icon: BarChart3 },
```

---

## 修改文件清单

| 阶段 | 文件 | 改动类型 |
|------|------|---------|
| 1 | `execution-service/src/executor.py` | 修改: entry_price 兜底 + _verify_stop_order |
| 1 | `execution-service/src/position_patrol.py` | 修改: fetch_orders 补充 + _sl_placed 持久化 |
| 2 | `signal-service/src/__main__.py` | 修改: determine_route_targets 重写 |
| 3 | `signal-service/src/engines/pg_engine.py` | 修改: 阈值 5.0→2.5 |
| 4 | `start-core-services.sh` | 修改: 添加 vis-service 启动 |
| 4 | `web/next.config.mjs` | 修改: 添加 vis 代理 |
| 4 | `web/src/app/(dashboard)/vpvr/page.tsx` | 新建: VPVR 页面 |
| 4 | `web/src/components/layout/Sidebar.tsx` | 修改: 添加导航 |

## 验证方案

1. **止损单**: 重启 execution-service → 检查日志无 entry_price=0 → 下测试单验证止损单存在
2. **威科夫信号**: 重启 signal-service → 监控日志看威科夫是否收到信号
3. **volume_spike**: 检查日志确认 2.5x 阈值生效
4. **VPVR**: 启动 vis-service → 访问 Web `/vpvr` → 确认页面正常渲染
5. **Build**: `cd web && npm run build` 通过
