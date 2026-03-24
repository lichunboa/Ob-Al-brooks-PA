# H1/L1 多时间周期统一性审计

更新时间：2026-03-17

## 一、这份审计回答什么问题

用户提出的核心质疑是对的：

- 我们最近是不是开始围绕 `5m` 的个别坏样本修补；
- 现在的 `H1/L1` 是否已经出现对 `5m` 或 `15m` 的隐性特调；
- 如果 Brooks 理论是通用的，为什么 `15m` 表现明显好于 `5m`；
- `5m` 出现的问题，按理说 `15m`、`1h` 也应该以某种形式出现，为什么当前没有同步暴露。

这份审计不再继续讨论某一根 `signal bar`，而是专门检查：

1. 理论层是否统一；
2. 多周期背景映射是否统一；
3. 回测管理节奏是否统一；
4. 冷却/风控节奏是否统一；
5. 当前 `5m/15m/1h` 的差异，究竟是 Brooks 本身的差异，还是系统实现造成的差异。

---

## 二、先说结论

### 结论 1：当前 **没有** 在 `H1/L1 detector` 本体里写两套 `5m/15m` 规则

`H1/L1` 的 detector 模板在：

- [h1_l1_template.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/h1_l1_template.py)
- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)

当前没有发现“`5m` 用一套 `H1/L1`，`15m` 再用另一套 `H1/L1`”这种显式分叉。

### 结论 2：但系统在 **理论层之外**，确实存在 3 层会把 `5m/15m/1h` 做成不同行为的“隐性分叉”

这 3 层分别是：

1. 更高一级背景映射；
2. 回测管理节奏缩放；
3. 冷却/执行节奏缩放。

也就是说：

- `H1/L1` 理论层现在更接近通用；
- 但进入“背景确认 -> 路由 -> 管理 -> 回测验证”以后，
- 同一个 `H1/L1` 在 `5m`、`15m`、`1h` 不是简单缩小版。

### 结论 3：当前最大的统一性问题，不是 `H1/L1` 本体，而是 **多周期语义没有完全统一**

这意味着：

- 最近如果继续围绕 `5m` 个案修 detector 或 target，
- 很容易继续打补丁；
- 真正更值得先收束的，是“多周期背景/节奏层是否统一”。

---

## 三、代码里已经存在的隐性分叉

## 3.1 signal-service 的更高周期映射

位置：

- [pa_engine.py:2359](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py#L2359)

当前映射：

```python
{
    "1m": "15m",
    "5m": "1h",
    "15m": "4h",
    "30m": "4h",
    "1h": "1d",
}
```

这不是“上一层周期”线性映射，而是：

- `1m -> 15m`
- `5m -> 1h`
- `15m -> 4h`

这本身就会导致：

- `5m` 的 `H1/L1` 在 signal-service 里，是拿 `1h` 当更大背景；
- `15m` 的 `H1/L1` 则拿 `4h` 当更大背景。

如果 Brooks 语义想保持“同一模板 + 更高一级背景只是辅助”，这套映射就值得重新审。

## 3.2 backtest runner 的更高结构映射

位置：

- [runner.py:711](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L711)

当前映射：

```python
{
    "1m": "5m",
    "5m": "15m",
    "15m": "1h",
    "30m": "1h",
    "1h": "4h",
}
```

这和 signal-service **不一致**。

也就是说：

- 实时信号引擎里，`5m` 看的是 `1h`
- 回测 runner 里，`5m` 看的是 `15m`

这是当前最值得重视的统一性问题之一。

因为同一个 `H1/L1`：

- 在“真实链”上下文里是 `5m + 1h`
- 在“回测链”上下文里是 `5m + 15m`

这会直接影响：

- `higher_follow_through`
- `higher_market_state`
- `setup_valid`
- `management_style`

从而让我们很难判断：

- 到底是 `H1/L1` 本体不好；
- 还是多周期背景上下文根本不是同一个东西。

## 3.3 runner 的过滤周期映射

位置：

- [runner.py:90](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L90)

当前 `TF_FILTER_MAP`：

```python
{
    "1m":  {"quality": "5m",  "trend": "15m", "counter": "1h"},
    "5m":  {"quality": "5m",  "trend": "15m", "counter": "1h"},
    "15m": {"quality": "15m", "trend": "1h",  "counter": "4h"},
    "30m": {"quality": "30m", "trend": "1h",  "counter": "4h"},
    "1h":  {"quality": "1h",  "trend": "4h",  "counter": "1d"},
}
```

这意味着 `5m` 的信号质量、趋势确认、逆势过滤，已经不是简单 “本周期 + 上一层” 的结构，而是人为分成：

- quality 看 `5m`
- trend 看 `15m`
- counter 看 `1h`

这套设计不一定错，但它显然不是“所有周期完全同一模板”的纯理论层。

## 3.4 sim_exchange 的周期缩放因子

位置：

- [sim_exchange.py:19](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L19)

当前：

```python
TF_SCALE = {"1m": 0.2, "5m": 1, "15m": 3, "30m": 6, "1h": 12}
```

它直接影响：

- 无推进 bars 的容忍度
- protective 管理节奏
- trailing 节奏
- timeout / stale / zombie 的触发速度

也就是说，哪怕 detector 完全相同：

- `5m` 的 `H1/L1`
- `15m` 的 `H1/L1`

在持仓后管理速度上，也不是同比例自然长大，而是被这套工程化缩放重新解释。

## 3.5 signal-service 的冷却倍数

位置：

- [pa_engine.py:2131](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py#L2131)

当前：

```python
"1m":  cooldown_multiplier = 0.5
"5m":  cooldown_multiplier = 1.0
"15m": cooldown_multiplier = 2.0
"30m": cooldown_multiplier = 3.0
"1h":  cooldown_multiplier = 4.0
```

并且还有 `_dynamic_cooldown_multiplier()` 的二次调整。

这层会影响：

- 同策略在不同周期的重复触发密度
- 同背景下的重试频率
- `H1/L1 -> H2/L2` 的自然演化节奏

---

## 四、这说明什么

### 4.1 不是 `5m` 理论不同

Brooks 理论本身没有要求：

- `5m` 一套 `H1/L1`
- `15m` 再一套 `H1/L1`

所以当前差异，不该理解为“5m 不适用 Brooks”。

### 4.2 也不是简单的“5m 噪音大”

`5m` 噪音确实更大，但如果系统实现完全统一，`5m` 和 `15m` 的差异应该主要表现为：

- follow-through 更弱
- cost 更敏感
- target 更近

而不是：

- 上一级背景引用不同
- runner 的结构确认不同
- 冷却/管理节奏不同

当前更像是：

`5m` 的问题 = Brooks 通用问题 + 系统多周期层未统一

### 4.3 用户“我们是不是走进牛角尖”的判断是合理的

因为最近几轮如果只盯：

- `signal bar`
- `rescue target`
- `close-test target`

就会默认“理论层已经统一，只剩局部细节”。

但这份审计表明：

- 理论层本身在收敛；
- 更大的差异，其实来自理论层外面的多周期上下文和节奏层。

所以继续只打 `H1/L1` 某个小模块，确实有牛角尖风险。

---

## 五、对 `5m/15m/1h` 的更合理解释

如果用当前系统语言翻译，更像是：

1. `H1/L1` 本体基本在往统一模板收敛；
2. 但 `5m` 进来后，系统给它配的：
   - higher context
   - trend filter
   - counter filter
   - cooldown
   - management timing
   并不等于 `15m` 的同比例缩小版；
3. 所以当前 `5m` 不佳，不能直接推导成 `H1/L1` 理论不对；
4. 更不能继续围绕个别 `5m` 症状写更细的局部规则。

---

## 六、现在最应该先统一什么

优先级建议如下：

### 6.1 第一优先：统一多周期背景映射

至少要先回答并定死一件事：

- `H1/L1` 的“更大一级背景”到底应该怎么取？

当前代码里存在两套：

- signal-service：`5m -> 1h`
- runner：`5m -> 15m`

这一点不统一，后面所有 `H1/L1` 细节优化都会被污染。

### 6.2 第二优先：统一“理论层”和“节奏层”的边界

要明确分开：

1. 理论层  
   `setup / signal bar / STOP trigger / actual risk / target family`

2. 节奏层  
   `cooldown / max_holding_bars / protective timing / timeout / TF_SCALE`

现在这两层还缠得太近。

### 6.3 第三优先：在统一完上面两层后，再继续打 `H1/L1` 细节

也就是：

- outside bar
- weak signal bar
- rescue
- fade
- close-test

这些都应该放在“多周期层已经统一”的前提下继续做。

---

## 七、当前阶段不建议做什么

在完成“多周期统一性审计”前，不建议继续：

1. 围绕 `ETH 5m` 再加更细的 `no-trade` 规则；
2. 围绕 `BTC 5m` 再加更细的 `rescue_target` 规则；
3. 直接把当前 `H1/L1` 模块扩到 `H2/L2`、突破回调、gap 族。

因为这会把“未统一的多周期语义”一起扩散出去。

---

## 八、当前最可靠的结论

1. 当前没有发现 `H1/L1 detector` 本体按 `5m/15m` 写两套理论。
2. 但系统确实存在多周期层的隐性分叉。
3. 这比继续修某个 `H1/L1` 局部规则更值得优先处理。
4. 用户对“是不是已经钻进牛角尖”的担心，是合理的。
5. 下一步最值得做的，不是继续优化 `H1/L1` 个案，而是先统一多周期背景与节奏层。

---

## 九、下一步建议

下一轮不要直接继续写 `H1/L1` 规则，建议先做 3 件事：

1. 统一 signal-service 与 runner 的 higher timeframe 映射；
2. 审查 `TF_FILTER_MAP / TF_SCALE / cooldown_multiplier` 是否需要按“理论层外置”重构；
3. 在统一后，再重跑：
   - `H1/L1 fixed/random`
   - `5m` 扩展样本
   - `15m` 稳定样本

只有这样，后面把模块扩到：

- `H2/L2`
- 突破回调
- `20均线缺口 / 第一均线缺口 / MAG`

才不会把错的多周期语义带过去。
