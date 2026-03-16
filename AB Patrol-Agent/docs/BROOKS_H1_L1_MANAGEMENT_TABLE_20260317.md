# H1/L1 入场后管理表（当前代码口径）

## 目的

把当前 `H1/L1` 从入场触发到离场的执行细节，用 Al Brooks 语境翻成一张表，方便后续继续对齐课程、百科与 `Ali Flash Cards`。

## 主要依据

- `阿布10种最佳价格行为交易模式` 第 4-5 页：`L1/L2`、`H1/H2`
- 百科幻灯片-3 第 0160 页：`Disappointed Bulls: Buy More Lower`
- 百科幻灯片-3 第 0163 / 0168 页：`Exit around Breakeven`
- 进阶篇第 0479 页：`1x Actual Risk`
- `Ali Flash Cards` 第 16 页：`Market Tests Back to Valid Previous Entry`
- `Ali Flash Cards` 第 73 页：`Fade Weak L1`
- `Ali Flash Cards` 第 588 页：`Failed High Probability Signal`

## 当前执行表

| 步骤 | 当前代码怎么做 | Brooks 语境翻译 | 当前对齐度 |
| --- | --- | --- | --- |
| 背景 | 先读 `market_state / higher_market_state / route_style / playbook_id` | 先判断是趋势恢复、TR、弱趋势、高潮后回调，还是已经退化成区间 | 部分对齐 |
| setup | `setup_valid / setup_clear_trend_leg / setup_first_pullback_shape` 决定是否是像样的 first pullback | 先有清晰趋势腿，再等第一次像样回调，而不是 endless PB | 部分对齐 |
| signal bar | 用 `trend_bar / reversal_bar / inside_bar / ema_recovery_bar / outside_follow_bar` 放行 | 不是任何回调棒都能做 signal bar，要看位置、实体、尾巴、收盘 | 部分对齐 |
| 入场类型 | `entry_type=\"STOP\"`，`entry_trigger = signal bar 外一跳` | 做多在 signal bar 高点上方一跳挂 `BUY STOP`；做空镜像 | 已对齐 |
| 初始止损 | detector 已给 `stop_plan`，执行层按 `actual risk` 管 | 止损应在 signal bar / swing / major HL-LH 外侧，围绕真实触发价算风险 | 部分对齐 |
| 实际风险 | `initial_risk = entry_price 到 stop_loss` | 不是只看 signal bar 高低点，而是看真实进场后会亏多少 | 已对齐 |
| 第一目标 | `first_target`、`first_target_type` 已进入 trade | first entry 先看 `highest close / lowest close / prior high-low / breakout point` | 部分对齐 |
| tp1/tp2 | `_apply_brooks_management()` 用 `tp1_r / tp2_r` 管 | 不是死拿整仓，先兑现一部分，再看有没有资格留 runner | 部分对齐 |
| first entry 管理 | `H1/L1` 带 `first_entry_signal=True`，并有 `allow_be_after_first_target / prefer_partial_over_full_swing` | first buy / first sell 优先 partial、保本，而不是天然按大 swing 管 | 已部分落地 |
| BE | 第一目标后优先移到 `BE`；弱背景更早保护 | `Disappointed Bulls/Bears` 常常先保本或小利退出 | 部分对齐 |
| runner | 只在 `allow_small_runner=True` 时留小 runner，并用 `runner_handoff_stop` 接管 | 背景真强时才留少量 runner，否则 first entry 更偏 scalp | 部分对齐 |
| 提前离场 | `failed follow-through / return to range / major channel break` 会触发保护性处理 | follow-through 差、回到区间、通道破坏时，不该继续硬拿 | 部分对齐 |
| protective_scalp | `first_entry_be / channel_to_tr / tr_scalp_protect / reversal_protect / breakout_protect` | first entry 一旦走弱，应更像 scratch、BE、小 scalp | 部分对齐 |
| second entry 交接 | `handoff_to_h2_l2_if_failed=True` | H1/L1 失败后，经常自然演化成 H2/L2 | 已有意图，执行仍待加强 |

## 当前最需要继续收的地方

1. `setup_valid=False` 的 `H1/L1` 不能再继续落进 `brooks_swing / brooks_s1_htf_sr_reversal`。
2. `first_target` 已经进入执行层，但 `highest close / lowest close` 的优先级还可以继续细化。
3. `first_entry -> lower buy / higher sell rescue` 目前只有管理意图，还没完整变成动作链。
4. `20均线缺口 / 第一均线缺口 / MAG` 还没有彻底从 `H1/L1` 主模板里分离。
