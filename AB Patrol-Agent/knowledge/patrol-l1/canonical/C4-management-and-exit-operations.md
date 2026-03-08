# C4 Management and Exit Operations

> 来源锚点：
> - `33 Taking Profits`
> - `36A Management is after entering trade`
> - `39D Trail stops`
> - `41D Stop management; How to sell`
> - `47D Entering with limit orders; Taking Profits`
> - `S7-management.md`

## 管理优先级

1. `Premise` 还成立吗
2. 当前 trade 应该继续当 `scalp` 还是转成 `swing`
3. 是否需要减仓、移损、移 TP、trail
4. 是否需要撤掉旧挂单
5. 是否允许加仓

## 系统必须支持的动作语义

- `OPEN_ORDER`
- `CLOSE_POSITION`
- `MODIFY_STOP_LOSS`
- `MODIFY_TAKE_PROFIT`
- `PARTIAL_CLOSE`
- `CANCEL_ALL_ORDERS`

这些动作的理论语义：

- `PARTIAL_CLOSE`
  - TP1/TP2
  - forced de-risk
  - context weakened
- `MODIFY_STOP_LOSS`
  - breakeven
  - trail under HL / above LH
  - tighten after climax / exhaustion / major target
- `MODIFY_TAKE_PROFIT`
  - measured move 更新
  - 目标区前移
  - 从 scalp 目标切换到 swing 目标
- `CANCEL_ALL_ORDERS`
  - thesis 失效
  - planned trade 过期
  - setup 退化回 watch

## 加仓与减仓

允许但必须明确：

- 为什么加仓
- 加仓后总风险是否仍在计划内
- 是 `trend add-on`、`scale in` 还是 `re-entry`

不允许：

- 因为浮亏而盲目摊平
- 用“加仓”掩盖 thesis 失效

## 提前计划退出

agent 输出管理计划时，必须能够回答：

- 什么条件触发 `partial close`
- 什么条件触发 `move stop`
- 什么条件触发 `move TP`
- 什么条件触发 `cancel pending`
- 什么条件触发 `full exit`
