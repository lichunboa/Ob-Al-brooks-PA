# Patrol 交易漏斗报告

更新日期: 2026-03-09

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

## 2026-03-09 已确认并修复的执行阻塞

昨天 `0` 成交里, 有两条已经确认属于系统问题, 而不是市场没有机会:

### 1. Canonical refs 被 gate 误判为非法

`runtime` 现在会合法输出 canonical 文件, 例如:

- `C3-style-equation-and-order-planning.md`

但旧版 `patrol_trade.py` 只允许旧的 `S*` 文件名, 会把这些 canonical refs 误判成非法并拒单。

现已修复为:

- 直接从 `knowledge/patrol-l1/references`
- `knowledge/patrol-l1/references/quotes`
- `knowledge/patrol-l1/canonical`

动态发现合法 refs, 不再靠过时的硬编码白名单。

### 2. Trader's Equation 在进 gate 前仍可能残留自然语言

典型样本:

- `cycle_20260308_183903`
- `cycle_20260308_131235`
- `cycle_20260308_193745`

这些 cycle 里, `OPEN_ORDER.equation` 被写成中文解释句, 而不是:

- `P=55% R=2.5 PxR=1.38`

导致 gate 在 `Equation` 和 `SL/TP` 两步同时失败。

现已修复为:

- `runtime` 在 `validate_trade_gate()` 前再做一次 equation 规范化
- 如果已有 `evaluation / entry_idea / thesis`, 会优先重建成 gate-ready 格式
- 不再依赖“模型这次刚好输出得很规整”

### 3. 修复后的直接验证

已用带 canonical refs 的样本做过直接 gate 验证:

- `Refs: ['S4-strategy-match.md', 'C3-style-equation-and-order-planning.md'] ✓`
- `Equation: P=56% R=2.00 PxR=1.12 ✓`
- Binance demo 下单成功

这说明当前最明显的“低级阻塞”已经被打通。

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
