# C1 Market Cycle and State

> 来源锚点：
> - `12A/12B/12C`
> - `14A/14B/14C/14D/14E`
> - `15A-15H`
> - `16A-16F`
> - `18A-18F`
> - `22A/22D`
> - `24A-24E`

## 市场周期

必须持续判断：

- `Strong BO`
- `Tight Channel`
- `Broad Channel`
- `TR`
- `Breakout Mode`
- `Climax / Final Flag / Wedge`
- `MTR attempt`

## 状态切换原则

- `TR -> BO`：
  - 需要信号条 + follow-through，不是只靠一根突破条
- `BO -> Channel`：
  - breakout 成功后，更多时候会进入 channel
- `Channel -> TR`：
  - 当 pullback 变深、重叠增加、follow-through 下降时，优先按 TR 处理
- `Trend/Channel -> MTR`：
  - 需要 climax + wedge/DB/DT/head-and-shoulders 等 reversal 证据
- `MTR -> new trend`：
  - 只有在 reversal 被接受后才成立；否则多半只是 minor reversal

## 不能做的简化

- 不能因为看到 `wedge` 就直接判定 reversal
- 不能因为出现单个 `H2/L2` 就忽略更大 context
- 不能长期沿用旧 thesis，而不允许 `old thesis -> failed -> new thesis`

## 系统责任

agent 要输出：

- `market_state`
- `market_state_detail`
- `state transition`
- `为何还是 minor reversal`
- `为何已经升级为 reversal`

代码不应该用隐藏权重强行覆盖这些判断。
