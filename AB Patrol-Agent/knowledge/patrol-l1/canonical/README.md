# Canonical Rulebook

这组文件是 `AB Patrol-Agent` 在升级期使用的 **Al Brooks 规范层**。

目标不是替代 `SKILL.md + S0-S7`，而是把完整 Obsidian 知识库里的核心理论整理成：

- 可引用
- 可审计
- 可回放
- 可映射到代码责任

的上层 authority。

## 关系

- **最高理论 authority**：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks`
- **规范层**：
  - `AB Patrol-Agent/knowledge/patrol-l1/canonical/*.md`
- **可执行子集**：
  - `AB Patrol-Agent/knowledge/patrol-l1/SKILL.md`
  - `AB Patrol-Agent/knowledge/patrol-l1/references/S0-S7`

规则优先级：

1. Obsidian Al Brooks 知识库
2. Canonical Rulebook
3. `SKILL.md + S0-S7`
4. 代码中的执行安全逻辑

代码不允许发明新的交易理论。如果 `SKILL/S` 与 canonical 不一致，应优先回写 `SKILL/S`，而不是偷偷在代码里加阈值。

## 文件说明

- `C0-foundations.md`
  - Al Brooks 核心前提、80% 规则、context 优先、概率与不确定性
- `C1-market-cycle-and-state.md`
  - trend / channel / TR / BO / climax / MTR / wedge / state switch
- `C2-triggers-and-reversal-taxonomy.md`
  - H1/H2/L1/L2、DB/DT、wedge、trap、first/second entry、MTR
- `C3-style-equation-and-order-planning.md`
  - scalp / swing / 反转试探、Trader's Equation、planned trade、limit/stop/market
- `C4-management-and-exit-operations.md`
  - premise、partial close、move SL/TP、trail、cancel pending、加仓/减仓
- `C5-step5-dynamic-timing.md`
  - Step 5 动态扫描优先级、快扫与慢扫、何时拉长间隔

## 升级期约束

- 升级期默认 **观察模式**，保留采集、分析、推送、回放、Binance demo 验证能力。
- 自动交易恢复前，必须完成：
  - canonical -> `SKILL/S` 对账
  - 代码硬规则矩阵清理
  - 至少一条 `OPEN_ORDER -> S7-management -> EXIT` demo 闭环
