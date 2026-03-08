# Patrol 交易漏斗报告

更新日期: 2026-03-08

## 目的

这份报告回答两个问题:

1. 当前没有新成交单, 到底是市场没有机会, 还是系统自己挡掉了单。
2. 重启或中断后, 如何用统一入口快速判断 Patrol 是真的在巡逻, 还是只是进程还活着。

## 当前漏斗快照

以 `pa_crypto_control.py funnel` 的最近 48 小时统计为准:

- 无候选: 248
- 有预信号未到候选单: 192
- 候选单被 gate 拒绝: 15
- 候选单执行失败: 4
- 候选单待执行/未落执行结果: 0
- 已成交: 0

这说明当前“没有新成交”的原因是双重的:

1. 大部分轮次确实仍处于 `PASS-WAIT` 或 `pre_signal`。
2. 少数已经进入 `OPEN_ORDER` 候选的轮次, 仍会被 gate 或执行链挡住。

## 当前主要无单主题

最近统计出来的主题归因:

- 浅 PB 失效: 11
- 顶部失败未完成: 11
- first PB 未完成: 11
- P×R 不通过: 11
- gate 格式问题: 5

这意味着当前主问题不是单一 bug:

- 一部分确实是市场结构还没成熟。
- 另一部分是系统实现仍存在 parity gap, 尤其是 gate/格式链路。

## 最近关键候选单样本

### 1. `cycle_20260308_183903`

- 结果: `OPEN_ORDER BTCUSDT BUY`
- 实际执行: `VALIDATION_REJECTED`
- 关键问题:
  - Trader's Equation 是自然语言, gate 无法解析
  - 执行链没有把“候选单”稳定转换成“可执行单”

### 2. `cycle_20260308_193745`

- 结果: `OPEN_ORDER BTCUSDT SELL`
- 实际执行: `VALIDATION_REJECTED`
- 关键问题:
  - Equation 格式问题
  - 反转试探的盈亏比校验更严格
  - AI alignment 条件挡住执行

### 3. `cycle_20260308_194504`

- 结果: `OPEN_ORDER ETHUSDT SELL`
- 实际执行: `VALIDATION_REJECTED`
- 关键问题:
  - Equation 格式问题
  - 反转试探盈亏比不足

## 当前结论

到目前为止, “无单”不能简单归因成“市场没机会”。

更准确的结论是:

- 市场大部分时间确实还在等待结构完成。
- 但系统也确实在少数有候选单的地方, 因为 gate/格式/执行桥问题没有成交。
- 所以判断 Patrol 恢复程度, 不能只看 `有没有成交`, 还要看:
  - 有没有 `pre_signal`
  - 有没有 `OPEN_ORDER` 候选
  - 候选单是因市场数学被拒, 还是因格式链路被拒

## 当前建议的检查顺序

### 1. 先看状态

```bash
bash "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/scripts/start.sh" status
```

重点看:

- `overall_health`
- `cycle_fresh`
- `latest_cycle`
- `last_failure_reason`

### 2. 再看交易漏斗

```bash
python3 "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/pa_crypto_control.py" funnel
```

重点看:

- 候选单被 gate 拒绝数量
- 执行失败数量
- 主题归因是否在持续增加

### 3. 最后看具体 cycle

优先看最近包含 `OPEN_ORDER` 的 cycle:

- `cycle_20260308_183903`
- `cycle_20260308_193745`
- `cycle_20260308_194504`

## 当前仍未完成的验证

- 首笔新的自然自动成交
- 新架构下的 `S7-management` live 验证
- “开仓 -> 持仓管理 -> 平仓” 闭环与旧 Claude 版的实盘一致性

## 统一结论

截至 2026-03-08:

- Patrol 主循环已能持续产出新 cycle
- cycle / push / render 状态已经可审计
- “活着但 stale” 与“真的在正常巡逻”已经可以区分
- 但系统还没有稳定产生新的自然成交单
- 主要原因是:
  - 市场结构多数仍在等待
  - 少量候选单仍被 gate/执行链挡住
