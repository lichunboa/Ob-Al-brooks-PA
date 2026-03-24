# H1/L1 多周期角色统一复盘

更新时间：2026-03-17

## 一、这轮改了什么

这轮不是继续围绕 `5m` 个案打补丁，而是先统一系统里对多周期背景的解释方式。

当前统一后的角色定义为：

| 执行周期 | 结构周期 | 主背景周期 | 锚定周期 |
|:---|:---|:---|:---|
| `1m` | `5m` | `15m` | `1h` |
| `5m` | `15m` | `1h` | `1d` |
| `15m` | `1h` | `4h` | `1d` |
| `30m` | `1h` | `4h` | `1d` |
| `1h` | `4h` | `1d` | `1d` |

这里的含义是：

- `结构周期`：看当前 setup 的形状是否完整；
- `主背景周期`：看更大一级的趋势、区间、follow-through；
- `锚定周期`：看更大的磁体、机构更常看的支撑阻力。

这轮已经把实时信号链和回测链统一到同一套角色模型上，不再让 `signal-service` 和 `runner` 各维护一套不同的 higher timeframe 映射。

## 二、为什么这样更符合 Brooks

Brooks 在日内交易里，不是只看“上一层周期”，而是会同时看：

- 当前执行周期上的入场；
- 更大一级周期上的趋势/区间背景；
- 更大的日线、周线级别支撑阻力和磁体。

参考资料：

- [49F 第 4 页文本](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Video 49F Swing trading examples波段交易示例/pages/page-0004.md)
- ![49F 第 4 页截图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Video 49F Swing trading examples波段交易示例/images/page-0004.jpg)
- [49F 第 20 页文本](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Video 49F Swing trading examples波段交易示例/pages/page-0020.md)
- ![49F 第 20 页截图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Video 49F Swing trading examples波段交易示例/images/page-0020.jpg)
- [49F 第 21 页文本](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Video 49F Swing trading examples波段交易示例/pages/page-0021.md)
- ![49F 第 21 页截图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Video 49F Swing trading examples波段交易示例/images/page-0021.jpg)

所以：

- `5m` 不能只看 `15m`；
- `15m` 也不该只看 `1h`；
- 更不能把“结构确认”和“主背景”混成一个 `higher_timeframe` 字段。

## 三、回测结果

### 3.1 fixed 3 窗口

统一前：

- 总交易：`23`
- 加权胜率：`60.87%`
- 平均 PF：`6.8248`
- 平均日频：`0.2473`

统一后：

- 总交易：`23`
- 加权胜率：`65.22%`
- 平均 PF：`7.1900`
- 平均日频：`0.2473`

### 3.2 random 4 窗口

统一前：

- 总交易：`22`
- 加权胜率：`59.09%`
- 平均 PF：`191.3191`
- 平均日频：`0.1774`

统一后：

- 总交易：`24`
- 加权胜率：`66.67%`
- 平均 PF：`192.4748`
- 平均日频：`0.1935`

说明：

- 这组 `average_profit_factor` 明显被极端盈利样本拉高，不能单独当稳定性指标；
- 更值得看的是胜率和总交易数，两者这轮都在改善。

### 3.3 stress5m 7 窗口

统一前：

- 总交易：`93`
- 加权胜率：`39.78%`
- 平均 PF：`1.3917`
- 平均日频：`0.4286`

统一后：

- 总交易：`90`
- 加权胜率：`38.89%`
- 平均 PF：`1.5126`
- 平均日频：`0.4147`

这组最重要，因为它专门看 `5m` 压力场景。

结论是：

- `5m` 统一后没有被打坏；
- 频率小幅下降；
- 胜率略降；
- 但 PF 明显抬升。

这说明之前 `5m` 的一部分问题，确实来自背景角色映射不统一，而不只是“噪音更大”。

## 四、关于“强背景 / 中背景 / 弱背景”还要不要保留

要保留，但要换一种理解。

它们不应该被理解成：

- 只对 `5m` 的特调；
- 或者某个周期专属的三套理论。

更合理的理解是：

- 这是 Brooks 背景质量的工程化标签；
- 本质对应的是：
  - 强趋势 / 强 follow-through
  - 可交易但不够强的顺势背景
  - broad range / weak trend / endless pullback 一类的弱背景

所以它们可以保留，但必须满足两条：

1. 只能是 Brooks 语义的代码标签，不能演化成独立理论；
2. 必须对所有周期通用，不能写成“5m 一套、15m 一套”。

## 五、当前仍然没完全解决的问题

这轮统一后，系统层面的大变量已经收了一层，但还没完全打透：

1. `5m` 的弱背景 `H1/L1` 仍然比 `15m` 更脆弱；
2. `first-entry` 的 `rescue / close-test / swing` 预期层级还没完全统一；
3. `TF_SCALE / cooldown_multiplier` 这类节奏层，虽然现在没直接改坏结果，但仍然和理论层有耦合。

## 六、当前结论

### 已经可以确认的

- 实时和回测的多周期背景映射，之前确实不统一；
- 统一成 `结构周期 / 主背景周期 / 锚定周期` 后，结果整体是正向的；
- `15m` 没有被换成 `4h` 主背景后打坏；
- `5m` 也没有因为改成 `1h` 主背景而崩坏；
- 这轮改动是通用模块，不是 `BTC` 或 `ETH` 的周期特调。

### 还不能夸大的

- 不能说 `5m` 已经稳定；
- 不能说多周期统一已经把 `H1/L1` 所有问题都解决了；
- 不能说现在就可以不看后续 `rescue / close-test / weak first-entry`。

## 七、下一步建议

下一步不该再回到“围着 `5m` 某个个案加过滤条件”，而应该：

1. 继续只打 `H1/L1` 的 `rescue / close-test / swing` 预期层级；
2. 把这轮已经稳定的共用模块准备扩给：
   - `H2/L2`
   - `突破回调`
   - `20均线缺口 / 第一均线缺口 / MAG`

前提是：扩之前，先把这套三角色背景模型固定下来，不再让别的链路继续维护旧的 higher timeframe 映射。
