# C5 Step 5 Dynamic Timing

> 来源锚点：
> - `SKILL.md Step 5`
> - `12B/14B/15B/15D/18F`
> - `22A/22D/39A/39D`

## 定时目标

Step 5 不是固定轮询器，而是：

- 在机会接近时加快
- 在持仓需要管理时保持紧
- 在明确无机会时放慢
- 在 stale / anti-lazy 时强制刷新

## 高优先级快扫条件

这些情况应优先落到更快的 bucket：

- fresh `BC/SC`
- `pre_signal` 接近触发
- `TR edge` 附近
- `momentum` 连续、可能形成 follow-through
- 已有持仓且正在接近管理节点
- breakout 刚出现，需要看 follow-through

## 放慢条件

- 所有品种都进入多轮 `watching`
- 没有持仓、没有 pre_signal、没有 fresh setup
- 当前只是中部 TR 噪音

## 代码责任

代码只负责：

- 把 agent 给出的 `next_scan_seconds` 收敛到有限 bucket
- 保证不会因为异常卡死

代码不应该：

- 用隐藏的固定值长期压成 `120s`
- 用自己的一套经验覆盖 Step 5

## 运行期解释

系统必须同时输出：

- `agent suggested next_scan`
- `runtime normalized next_scan`
- `why normalized`

否则无法判断是 agent 真想快扫，还是代码把它改坏了。
