# S4 策略匹配 — 状态 × Playbook

先确定状态，再决定允许哪些策略、升级条件和禁止条件。

---

## 入场 Playbook 一览（15 个）

### A 组：顺势入场（趋势/通道）

| ID | 名称 | 触发条件 | SL | TP | 风格 |
|----|------|---------|----|----|------|
| **T1** | H1/L1 after BO | BO 后第一次 PB | BO leg 底部 | MM 或 2R | Swing |
| **T2** | H2/L2 in Channel | 通道中第二次 PB | 信号 K 线对侧 | 前高/低或2R | Swing (60%) |
| **T3** | EMA PB (MAG) | 20+ 根在 EMA 外，首次回测 | EMA 对侧 2-3 根 | 前高/低 | Scalp→Swing |
| **T4** | Wedge PB | 三推+momentum减弱 | 最后一推极值外 | MM | Swing |
| **T5** | Buy/Sell The Close | 强趋势 K 线收盘入场 | 该 K 线低/高点 | Trail | Swing |
| **T6** | Channel 内 PB | 通道下 2/3 处回调 | Leg 底部 | 通道上沿 | Scalp/Swing |

**T1-T6 使用条件**：Daily 偏置 ≠ 反方向 + 5m/15m AI 方向一致 + 状态 = BO/TC/BC 顺势（T4/T6 也适用于 Broad Channel）

### B 组：反转入场（高门槛）

| ID | 名称 | 触发条件 | SL | TP | 风格 |
|----|------|---------|----|----|------|
| **R1** | MTR 5 条件 | Climax+TL BO+HL/LH+强K+多TF | 反转前极值外 | MM | Swing (40→60%) |
| **R2** | Climax Reversal | 末期最大K+Wedge+MM完成 | Climax极值外 | Climax起点 | Scalp 优先 |
| **R3** | Channel Line BO Fade | 通道线被 BO（末端） | BO 极值外 | 通道内回归 | Swing (70%) |

**R1-R3 全部必须满足**：5/5 反转条件 + Pressure 积累 + Daily 不强烈对立。**默认不做反转。**

### C 组：TR 入场

| ID | 名称 | 触发条件 | SL | TP | 风格 |
|----|------|---------|----|----|------|
| **TR1** | BLSHS | TR 下 1/3 买，上 1/3 卖 | TR 对侧外 | TR 中间/对侧 | Scalp |
| **TR2** | Failed BO Fade | BO 后反向 K 线 | BO 极值外 | TR 中间 | Scalp |
| **TR3** | 2nd Leg Trap | TR 中强 2nd leg → fade | 2nd leg极值外 | TR 中间 | Scalp |
| **TR4** | Daily TR Fade | Daily TR 中昨天大K→今天fade | 昨日极值外 | TR 中间 | Scalp/Swing |

**TR1-TR4 使用条件**：状态确认=TR + 价格在边缘1/3 + **TR 中禁止用止损单追 BO**
**TTR 过滤**：TR 高度 ≤ 3 根 K 线 = TTR → 不做，等 BO。只有 Broad TR（高度 > 3× avg bar + 多数 bar > scalp size）才用 TR1-TR4

### D 组：特殊

| ID | 名称 | 触发条件 | SL | TP | 风格 |
|----|------|---------|----|----|------|
| **S1** | HTF S/R Reversal | 1h/Daily在强S/R→5m找反转 | S/R对侧 | MM | Swing |
| **S2** | Micro Channel | Daily微通道→前日低/高外反转 | 信号K线对侧 | 前高/低 | Swing |

---

## 市场状态 → 允许的 Playbook

| 5m/15m 状态 | 允许 | 禁止 |
|------------|------|------|
| **强 BO** | T1, T5 | 所有逆势 |
| **紧密通道** | T2, T3, T5, T6 | **绝不逆势** |
| **宽幅通道** | T2, T3, T4, T6 + Scalp 逆势 | 逆势 Swing |
| **TR** | TR1, TR2, TR3, TR4 | 追 BO |
| **BC (高潮后)** | R1, R2, R3 + 等待 | 追原方向 |

---

## 风格 + 订单类型路由表

市场状态决定交易风格和订单类型，不是个人偏好：

| 市场状态 | Swing | Scalp | 订单类型 | H1 有效？ | 备注 |
|---------|-------|-------|---------|----------|------|
| **强 BO / Spike** | ✅ 首选 | ✅ 顺势 Scalp | 止损单 | ✅ 默认 H1 | 不犹豫，PB 即入场 |
| **Tight Channel** | ✅ 首选 | ✅ 顺势 Scalp | 止损单 | ✅ PB < 2x avg | 任何顺势 PB 入场 |
| **Normal Channel** | ✅ | ✅ 顺势 Scalp | 止损单 | ⚠️ H2 更安全 | PB 1/3-1/2 用 H2 |
| **Broad Channel** | ⚠️ 谨慎 | ✅ 首选 | 止损单 | ❌ 等 H2 | 顺势 Scalp + 可逆势 Scalp |
| **TR** | ❌ | ✅ BLSHS | **限价单** | 边缘 H1 | **每次到边缘必评估** |
| **Consolidation/TTR** | ❌ | ✅ 等 BO | 限价单 | ❌ | TTR 内 Scalp BO 失败方向 |
| **BC/SC 后** | ❌ 等待 | ⚠️ 可 fade | — | — | 等 MG/EG 验证 |
| **多周期逆势** | ⚠️ P 下调 | ✅ 倾向 Scalp | 止损单 | — | 非禁止，概率调整 |

**⚠️ 路由表执行检查**：入场前必过 5 步自检 → 详见 [S5-evaluation.md](S5-evaluation.md)「入场前路由验证」

## pre_signal → candidate → executable 升级总表

> 这张表把 Brooks 语义直接映射到 Patrol 的执行阶段。核心原则：不是“看到结构就下单”，而是先看位置，再看信号，再看风格与订单类型。

| 环境 | `pre_signal` | `candidate` | `executable` | 默认订单类型 |
|------|--------------|-------------|--------------|-------------|
| **TR 边缘** | 只到边缘/只有第一次信号 | 边缘 + 二次信号/H2/L2 或清晰 signal bar，且已形成计划委托 | `candidate` 基础上再有明确 entry 价格与正 TE | **LIMIT** |
| **TR 中部** | 可记录观察 | 不升级 | 不执行 | — |
| **Broad Channel 逆势** | DB/DT/Wedge/MTR 第一次出现，只算反转试探 | 边缘 + H2/L2/HL/LH MTR + 已有计划 | `candidate` 基础上再有明确 entry 价格与正 TE | **LIMIT** |
| **Broad Channel 顺势恢复** | first PB / EMA PB / 恢复线索出现 | PB 完成 + 接受/跟进清晰，且计划已就绪 | `candidate` 基础上再有明确 stop trigger 价格 | **STOP_MARKET** |
| **强 BO / Tight Channel 逆势** | 只算反转试探 | 至少等第二次信号 + 接受 | 仍需明显接受与正 TE | **STOP_MARKET**（若最终允许） |
| **顺势趋势恢复** | 观察 pullback 质量 | PB 完成 + signal trigger + 计划就绪 | 有明确 trigger 价，且结构未失效 | **STOP_MARKET** |

### 三条强制规则

1. **TR = 限价单环境**
   - 只有在边缘 1/3 区域，且出现二次信号或清晰 signal bar，`pre_signal` 才能升级。
2. **Broad Channel = scalp more, swing less**
   - 逆势 fade 优先 `LIMIT`
   - 顺势恢复只有在接受与恢复信号都清晰时才允许 `STOP_MARKET`
3. **第一次反转只算试探**
   - 仅有 `wedge / MTR / DB / DT` 线索，不得直接升级成 swing 可执行单
   - 至少等 `H2/L2` 或 `HL/LH MTR`，再看是否升级

---

## 不属于 S4 的内容

- Daily 偏置 × 5m 方向叠加统一看 [S2-direction.md](S2-direction.md)
- Scalp / Swing 最终确认统一看 [S5-evaluation.md](S5-evaluation.md)
- 订单类型、风险和执行语义统一看 [S5-evaluation.md](S5-evaluation.md) + 对应 `S6-*`
- 持仓管理 playbook 统一看 [S7-management.md](S7-management.md)
- 运行态日志格式、Quick Scan 到 `S6` 的路由实现统一看运行说明与 runtime 映射

---

## 匹配完后去哪里

根据匹配结果，进入对应的入场执行文件：

| 匹配结果 | 下一步 |
|---------|--------|
| **T1-T6（顺势）** | → [S6-bo.md](S6-bo.md) / [S6-channel.md](S6-channel.md) — PB 质量 + 入场确认 + SL 验证 |
| **R1-R3（反转）** | → [S6-reversal.md](S6-reversal.md) — MTR 三部曲 + Climax + Channel Line Fade |
| **TR1-TR4 + S1-S2（TR/特殊）** | → [S6-tr.md](S6-tr.md) — BLSHS + Failed BO Fade + HTF S/R |
| **入场后管理** | → [S7-management.md](S7-management.md) — Premise + SL 移动 + 分批止盈 |

**所有入场都必须经过** → [S5-evaluation.md](S5-evaluation.md) — P×R 评估（S6 之后、下单之前）
