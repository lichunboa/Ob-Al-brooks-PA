## 高1/低1 第一轮模板化实现复盘

### 1. 本轮改动范围

本轮只改了：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py`

改动目标是把 `高1/低1` 往更接近 Al Brooks 的模板化流程推进：

- `signal bar` 与 `entry trigger` 分离
- `STOP` 触发语义改为 `signal bar 外一跳`
- 初始止损类型显式化
- 目标位从固定 `2R` 改成“前期极值优先，风险倍数回退”
- `signal bar` 从单一评分拆成类型学字段

### 2. 主要依据

本轮主要参考：

- `LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0004.md`
- `LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md`
- `LLM可读版/百科幻灯片-8/pages/page-0223.md`
- `LLM可读版/百科幻灯片-8/pages/page-0451.md`
- `LLM可读版/百科幻灯片-8/pages/page-0752.md`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md`

对应图像入口：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0004.jpg`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/images/page-0223.jpg`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/images/page-0451.jpg`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/images/page-0752.jpg`

### 3. 回测结果

结果文件：

- `/tmp/h1l1_template_fixed_20260316.json`
- `/tmp/h1l1_template_random_20260316.json`

对照基线：

- `/tmp/metricfix_baseline_fixed_20260315.json`
- `/tmp/metricfix_baseline_random_20260315.json`

#### 3.1 固定 3 窗口

- 基线：交易 `645`，加权胜率 `28.37%`，场景平均 PF `0.8402`，平均日频 `6.94`
- 当前：交易 `642`，加权胜率 `27.88%`，场景平均 PF `0.7955`，平均日频 `6.90`

逐窗口：

- `BTCUSDT 15m 2022-01-24~2022-02-23`：`PF 0.9356 -> 0.8018`
- `BTCUSDT 5m 2024-08-10~2024-09-09`：`PF 0.8793 -> 0.8918`
- `ETHUSDT 15m 2024-05-15~2024-06-14`：`PF 0.7055 -> 0.6928`

#### 3.2 随机 4 窗口

- 基线：交易 `800`，加权胜率 `27.88%`，场景平均 PF `0.9759`，平均日频 `6.45`
- 当前：交易 `791`，加权胜率 `27.81%`，场景平均 PF `0.9280`，平均日频 `6.38`

逐窗口：

- `BTCUSDT 5m 2024-08-10~2024-09-09`：`PF 0.8793 -> 0.8918`
- `ETHUSDT 15m 2024-05-15~2024-06-14`：`PF 0.7055 -> 0.6928`
- `BNBUSDT 15m 2023-10-01~2023-10-31`：`PF 0.9907 -> 0.8877`
- `SOLUSDT 15m 2025-08-01~2025-08-31`：`PF 1.3281 -> 1.2396`

### 4. 策略层观察

#### 4.1 高1

当前结果：

- 固定窗口：`30` 笔，胜率 `33.33%`，PF `1.3696`
- 随机窗口：`27` 笔，胜率 `29.63%`，PF `1.0938`

基线结果：

- 固定窗口：`34` 笔，胜率 `35.29%`，PF `1.6934`
- 随机窗口：`32` 笔，胜率 `28.12%`，PF `2.2758`

判断：

- `高1` 并没有因为 `STOP` 语义而整体变强
- 固定窗口和随机窗口的 PF 都低于基线
- 说明本轮 `高1` 的触发放宽收益，抵不过质量损失

#### 4.2 低1

当前结果：

- 固定窗口：`19` 笔，胜率 `10.53%`，PF `0.5875`
- 随机窗口：`25` 笔，胜率 `12.00%`，PF `0.4081`

基线结果：

- 固定窗口：`20` 笔，胜率 `40.00%`，PF `2.8062`
- 随机窗口：`31` 笔，胜率 `22.58%`，PF `0.4645`

判断：

- `低1` 是本轮最明显的负优化来源
- `SELL` 方向在本轮模板化后，质量损失远大于结构收益

### 5. 为什么会变差

当前判断不是 `STOP` 理念错了，而是本轮把多个环节一起动了，导致前端被整体带偏。

#### 5.1 触发条件放宽过度

本轮把 `H1/L1` 从“收盘突破前一根极值”改成了“高低点触碰即算”，这本身更接近 Brooks 的 stop 触发语义；但同时又把 `signal bar` 阈值放低到了：

- 趋势 `0.48`
- 急速 `0.50`
- 区间 `0.52`

再叠加 `swing_tolerance` 容差放宽，实际上引入了不少原本不该进场的弱 `H1/L1`。

#### 5.2 `price`、`entry_trigger`、`目标位` 一起改，变量耦合过多

本轮同时改了：

- 参考价
- 触发价
- 止损类型
- 目标位层级

导致我们无法把“到底是 `STOP` 更好，还是目标位/止损位带坏了结果”单独拆出来。

#### 5.3 `高1/低1` 仍被共用模板拉平

虽然这次已经开始拆模板，但实际上仍把下列逻辑写得过于共用：

- `高1`
- `低1`
- 急速 `高1/低1`
- 区间 `高1/低1`

而从结果看，`BUY` 与 `SELL` 的质量明显不对称，说明这组逻辑不能继续完全共用。

### 6. 当前结论

这轮代码实现不能直接保留为当前最优版本。

能保留的是认知，不是当前这版实现：

- `H1/L1` 需要 `STOP` 触发语义，这个方向仍然成立
- `signal bar` 不能只靠单一分数表达，这个方向也成立
- 但本轮实现把触发、止损、目标、阈值一起改了，导致整体变差

### 7. 下一轮建议

下一轮不要再整组一起改，只做更小的三步：

1. 只保留 `entry_trigger = signal bar 外一跳`  
   不同时改 `price` 与目标位层级

2. 先把 `高1` 和 `低1` 分开  
   至少不要再强行共用完全同一套阈值

3. 目标位单独二次改  
   不要在同一轮里把 `STOP` 语义和结构目标层级一起上

### 8. 当前代码状态

本轮代码改动尚未提交。

当前工作树里主要候选改动仍在：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py`

在下一轮确认最小修正方案之前，不建议直接合并。
