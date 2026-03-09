# S0-S7 -> C / Q / 运行说明 迁移映射

这份表回答两个问题：

1. 每类知识现在应该放在哪里
2. 当前 Patrol 主链一步一步怎么走，哪里仍需继续优化

---

## 一、知识层职责矩阵

| 层 | 负责什么 | 不负责什么 |
|---|---|---|
| `SKILL` | Step 0-5、阶段切换、状态机、何时读哪些知识块 | 理论长解释、API/命令、推送模板、执行细节 |
| `S0-S7` | 可执行交易规则、playbook、评估、管理 | 理论课程背景、运行维护、shell/webhook 示例 |
| `C0-C5` | Al Brooks 理论规范层 | 直接下单、命令、端口 |
| `Q1-Q6` | 原话锚点、纪律纠偏、反恐惧/反完美主义 | 新交易规则、执行细节 |
| 运行说明 | 命令、端口、API、消息模板、图表与守护进程 | 交易理论与 playbook |

---

## 二、S0-S7 各文件当前定位

| 文件 | 主职责 | 应移去 C/Q 的内容 |
|---|---|---|
| `S0-daily-bias` | Daily 偏置与背景概率 | 多周期理论背景的长解释 |
| `S1-reading` | 读盘框架与 debate | 课程背景、非执行性长理论 |
| `S2-direction` | AI 方向与多周期方向整合 | 纯理论性方向哲学 |
| `S3-market-state` | 市场状态判定 | 课程背景、原话长摘录 |
| `S3b-key-levels` | 关键位、磁体、S/R | 超出执行需要的理论说明 |
| `S4-strategy-match` | 市场状态 × playbook × 升级条件 | 太长的理论解释 |
| `S5-evaluation` | P/R、TE、风格、订单类型一致性 | 课程背景、实现细节 |
| `S6-*` | playbook 触发、无效条件、执行语义 | 课程背景、非执行性理论 |
| `S7-management` | premise、strength、保护、减仓、trail、退出 | API 说明、运行实现 |

### 逐文件迁移清单

| 文件 | 继续留在 `S` 的内容 | 迁到 `C` 的内容 | 迁到 `Q` 的内容 | 迁到运行说明的内容 |
|---|---|---|---|---|
| `S0-daily-bias` | Daily 偏置判定、过期条件、与 intraday 的衔接 | 大级别趋势/交易区间理论背景 | 避免对 Daily 偏置过度僵化的提醒 | 无 |
| `S1-reading` | 80+20 读盘法、TBTL / Always In / signal bar 读法 | 读盘哲学、课程式长解释 | 反过度分析、反完美主义提醒 | 无 |
| `S2-direction` | 多周期方向整合、优先级、方向切换条件 | 方向理论、趋势与回调的课程背景 | 不要因单根 K 线乱切方向的提醒 | 无 |
| `S3-market-state` | Trend / Channel / TR / BO / Climax / MTR 判定 | 市场周期理论、状态转换背景 | 反主观臆测、状态未明时保持观察 | 无 |
| `S3b-key-levels` | 关键位、磁体、上下沿、EMA/SR 的执行用途 | 支撑阻力与磁体的长理论 | 关键位前不要冲动追单 | 无 |
| `S4-strategy-match` | 状态到 playbook 的映射、升级条件、无效条件 | 各策略为何成立的理论背景 | 不要把观察级别误认成可执行级别 | 无 |
| `S5-evaluation` | P/R、Trader's Equation、风格与订单类型一致性 | 概率、风险、scalp/swing 的理论框架 | 接受不完美但要有 edge 的纪律提醒 | 仓位计算、执行桥实现细节 |
| `S6-common` | 所有 playbook 共享的事件、无效条件、执行语义 | 通用形态理论 | 执行纪律与等确认提醒 | 无 |
| `S6-bo` | BO/TC 顺势 playbook | 突破与接受的理论背景 | 不要在失败突破里当成真突破做 | 无 |
| `S6-channel` | Channel/Broad Channel playbook | Channel 结构和 wedge/micro channel 理论 | 不要在通道中部追单 | 无 |
| `S6-tr` | TR 边缘 fade/limit 相关 playbook | TR、二次陷阱、边缘限价单理论 | 中部无优势时保持等待 | 无 |
| `S6-reversal` | wedge/MTR/DB/DT/反转试探与升级条件 | 反转统计、反转 vs 继续 的理论背景 | 40% 反转只够 scalp 时不要幻想 swing | 无 |
| `S7-management` | premise、strength、保护、减仓、trail、退出计划 | 管理理念、盈利保护/失败退出理论 | 持仓后别因为恐惧乱动仓位 | 真实 API、状态写回、推送实现 |

---

## 三、当前 Patrol 主链

1. 读取运行态、缓存、账户、持仓、挂单、K 线与结构化指标
2. 按当前 phase 读取 `C + SKILL章节 + S + Q`
3. `Phase A` 做全品种快扫
4. 需要深看的品种进入 `pre_signal -> candidate -> executable`
5. 生成 `planned_trade`，补齐风格、升级条件、订单类型
6. 走执行安全层
7. 发到 Binance demo / 记录 `LOG_ONLY`
8. 成交后进入 `S7-management`
9. 写 cycle / journal / TG / Web
10. 按 Step 5 决定下一次扫描

---

## 四、当前仍不通顺的地方

- `S7-management` 还缺新架构下真实成交仓位的 live 验证
- `pre_signal -> candidate -> executable` 仍在继续按 Brooks 逻辑收紧
- `Step 5` 已大幅贴近原 skill，但还不是最终版
- 某些 `S6` 升级条件仍有代码参与，需要继续回交给 agent

---

## 五、维护原则

- 调理论：优先改 `C`
- 调交易规则：优先改 `S`
- 调纪律与纠偏：改 `Q`
- 调流程和路由：改 `SKILL`
- 调端口/API/命令/消息格式/图表/守护进程：改运行说明和 runtime

## 六、维护顺序建议

1. 先判断问题属于 `理论偏差`、`规则偏差`、`纪律偏差` 还是 `运行实现`
2. 理论偏差先回看 Obsidian Al Brooks 知识库，再回写 `C`
3. 规则偏差先改 `S0-S7`，不要直接在代码里补新门槛
4. 纪律偏差再补 `Q`
5. 只有当 `S/C/Q` 都说不清楚时，才回头改 `SKILL`
