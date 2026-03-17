# H1/L1 普适性与 Brooks 对齐审计

更新时间：2026-03-17

## 一、这份审计回答什么问题

这份审计专门回答 3 个问题：

1. 当前 `H1/L1` 里有没有按某个品种、某段行情、某个时间周期写死的优化；
2. 现在保留的 `H1/L1` 优化里，哪些仍然符合 Al Brooks，哪些只是工程化标签；
3. 当前可以安全复用到其他策略族的公用模块，究竟有哪些。

## 二、先说结论

### 结论 1：当前核心 `H1/L1` 路径里，没有按 `BTC/ETH/BNB/SOL` 写分支

本轮检查范围：

- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [h1_l1_template.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/h1_l1_template.py)
- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)
- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)
- [h1_l1_targets.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/h1_l1_targets.py)

当前没有发现：

- `if symbol == "BTCUSDT"` 这类核心交易逻辑分支；
- `if symbol in {...}` 的 H1/L1 特调；
- 针对某个年份、某段日期的硬编码。

也就是说，当前保留的 H1/L1 改动，不是“按品种修”，而是公用模块级改动。

### 结论 2：当前也没有“5m 一套理论、15m 一套理论”

当前已经统一成：

- `5m`：结构=`15m`，主背景=`1h`，锚定=`1d`
- `15m`：结构=`1h`，主背景=`4h`，锚定=`1d`
- `1h`：结构=`4h`，主背景=`1d`，锚定=`1d`

也就是说，现在不是“每个周期各写一套 H1/L1”，而是：

- 一套 H1/L1 理论模板；
- 多周期角色分开建模。

这和 Brooks 的多周期语境是一致的。

### 结论 3：仍有工程化层，但它们现在更像“标签”而不是“另一个理论”

当前仍然保留的工程化标签，主要是：

- `strong / medium / weak` 背景层级
- `scalp_only / no_trade / fade_candidate`
- `rescue / close-test / swing` 预期层级

这些东西本身不是 Brooks 原文术语，但它们现在承载的是 Brooks 原文里的真实区别：

- 强 continuation
- 弱 continuation
- broad range / weak trend / endless pullback
- first-entry 只期待救援或 close-test
- 真正可以期待 continuation swing

所以：

- 它们可以保留；
- 但只能当“Brooks 语义标签”；
- 不能再长成某个周期或某个品种的特调规则。

## 三、哪些地方已经符合 Brooks

### 3.1 STOP trigger

当前 `H1/L1` 已经不再用 close confirmation 假装 stop 触发，而是真正：

- `signal bar`
- 外一跳 `STOP`
- 市场真实突破后才入场

这和：

- [H1/H2 文本页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- ![H1/H2 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)

是一致的。

### 3.2 多周期背景角色

Brooks 不是只看“上一层周期”，而是：

- 看结构周期；
- 看主背景周期；
- 再看更大的锚定磁体。

当前统一后的 `TimeframeRoles`，比过去 signal-service 和 runner 各自维护一套 higher timeframe 更接近 Brooks。

### 3.3 actual risk / first-entry 管理

当前已经保留并稳定的公用模块有：

- `STOP trigger`
- `actual risk`
- `valid previous entry`
- `rescue / close-test / swing` 目标层级
- `fade / scalp / no-trade` 的弱 setup 分流
- `first-entry rescue` 的管理骨架

这些都已经开始具备复用到 `H2/L2`、突破回调和 gap 族的条件。

## 四、哪些地方仍然带工程近似

### 4.1 TF_SCALE

位置：

- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)

它仍然会影响：

- stale/timeout/zombie 节奏
- protective 管理速度
- trailing 节奏

这层不是 Brooks 原文直接给出的，而是工程化执行节奏层。

当前它没有被证实一定错，但它属于“需要持续审”的层，不该被误当成理论本体。

### 4.2 cooldown multiplier

信号冷却节奏同样属于工程层，不是 Brooks 理论层。

当前统一背景后，这一层暂时还没有继续动。

### 4.3 strong / medium / weak 的阈值边界

这套标签本身是合理的，但边界仍然可能继续收。

要点是：

- 以后只能按 Brooks 语义继续收；
- 不能按某个品种或某个回测窗口继续堆 if/else。

## 五、当前没有发现的坏模式

这轮明确没有发现：

1. `BTC/ETH/BNB/SOL` 的核心 H1/L1 特调；
2. 某个 5m 场景专属的 magic number；
3. 只对 15m 生效、只对 5m 生效的两套 detector 理论。

所以当前系统的主要风险，不是“品种特调”，而是：

- 工程节奏层；
- H1/L1 的 first-entry 预期层级是否已经足够稳定。

## 六、下一步建议

下一步可以安全推进的方向是：

1. 继续验证 `rescue / close-test / swing` 这套预期层级；
2. 用更多 `5m / 15m / 1h` 压力回测确认它不是窗口偶然；
3. 在这套模块稳定后，再复制给：
   - `H2/L2`
   - `突破回调`
   - `20均线缺口 / 第一均线缺口 / MAG`

而不该再回到：

- 按某个窗口加过滤；
- 按某个品种修阈值；
- 按某个周期再写一套理论。
