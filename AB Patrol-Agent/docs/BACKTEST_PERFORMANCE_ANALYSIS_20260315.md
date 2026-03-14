# AB Patrol-Agent 回测表现分析报告

**生成时间**: 2026-03-15
**分析对象**: AB Patrol-Agent 回测系统（V4.0）
**数据来源**: `backtest_v4_result.json` + 系统代码审计
**参考标准**: Al Brooks 价格行为交易体系

---

## 执行摘要

### 核心问题

当前回测系统在 168 小时（7天）测试中表现如下：

| 指标 | 数值 | 问题 |
|------|------|------|
| 信号生成 | 83 个 | ✓ 信号生成正常 |
| 实际交易 | 12 笔 | ❌ **85.5% 信号被过滤** |
| 完成交易 | 11 笔 | ✓ 执行完整 |
| 胜率 | 45.45% | ❌ **低于 Brooks 标准 60%** |
| 盈利因子 | 1.68 | ⚠️ 样本量太小，不可靠 |
| 总收益 | +$115.11 | ⚠️ 仅 1.15% 收益率 |

**结论**: 系统未达到盈利水平，主要问题是**信号转化率过低**和**胜率不足**。

---

## 一、系统架构分析

### 1.1 回测链流程

```
┌─────────────────────────────────────────────────────────────┐
│                    数据源 (Binance API)                      │
│              BTCUSDT × 4周期 (5m/15m/30m/1h)                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              1. 背景识别 (analysis.py)                       │
│  • EMA slope 判断大周期方向                                  │
│  • TradingSession 时段强度                                   │
│  • 简化版 Always-In 方向                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         2. 策略检测 (pa_engine.py + strategy_advanced.py)   │
│  • 趋势族: T1/T2/T3/T6 (Swing/Breakout/EMA/Channel PB)      │
│  • 反转族: MTR/Climax/HS/DT-DB                              │
│  • TR族: BLSHS/Daily TR Fade                                │
│  • 高级族: Wedge/Channel Line Fade/Micro Channel            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  输出: 83 个原始信号                                         │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           3. 信号过滤链 (runner.py:386-463)                 │
│  ① 策略白名单/黑名单检查                                     │
│  ② 信号棒质量检查 (sbq < 0.3 → 拒绝)                        │
│  ③ Playbook 路由一致性检查                                   │
│  ④ 入场准备度检查 (风险回报比/管理模板)                      │
│  ⑤ 多周期重复信号去重                                       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  输出: 12 笔交易 (过滤率 85.5%)                             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              4. 订单创建 (sim_exchange.py)                   │
│  • 计算仓位大小 (基于 actual risk)                           │
│  • 设置初始止损 (obvious stop)                               │
│  • 分配管理风格 (Scalp/Swing)                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│         5. 持仓管理 (sim_exchange.py:1601-1835)             │
│  ① Protective Stop 阶段 (前 3-5 根 bar)                     │
│     • 检查是否触发保护性止损                                 │
│     • 尝试转 protective_scalp / breakeven                    │
│  ② 成熟阶段管理                                              │
│     • Trailing stop (runner trailing)                       │
│     • Partial TP (1x/2x actual risk)                        │
│     • Re-entry / Add-on                                     │
│  ③ 工程化退出                                                │
│     • Stale bars (持仓过久)                                  │
│     • Zombie exit (无进展)                                   │
│     • Force exit (超时)                                      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  输出: 11 笔完成交易 (5胜6负)                               │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Demo链 vs 回测链

| 特性 | Demo链 (pa_trader.py) | 回测链 (BacktestRunner) |
|------|----------------------|------------------------|
| 数据源 | execution-service API | Binance API / Parquet |
| 信号生成 | 同一套 PA Engine | 同一套 PA Engine |
| 过滤逻辑 | 简化版 | 完整版 (runner.py) |
| 持仓管理 | 真实交易所 | SimExchange 模拟 |
| 状态 | 落后，待同步 | 当前主力开发链 |

---

## 二、根本原因分析

### 2.1 P0 级问题 — 直接导致无法盈利

#### 问题 1: 保护性止损退化过多

**现象**:
- 大量交易在成熟前就被 `protective_stop_exit` 清掉
- 应该转成 `protective_scalp_exit` / `breakeven_stop_exit` 的单子被提前止损

**代码位置**: `sim_exchange.py:1601-1835` (`_manage_protective_scalp()`)

**Al Brooks 标准**:
> "Management 比寻找完美 setup 更重要。大多数交易应该能转成 scratch / BE / 小 scalp，而不是直接止损。"
> — 《价格行为PPT中文笔记》第 29 课 Protective Stops

**偏差分析**:
```python
# 当前逻辑 (sim_exchange.py:1650-1680)
if bars_held >= 3:
    if pnl_pct < -0.5:  # 亏损 0.5% 就触发保护性止损
        return "protective_stop_exit"
```

问题：
1. 固定 bar 数（3根）不符合 Brooks "结构变化" 理念
2. 亏损阈值 -0.5% 过于严格，Brooks 强调 "actual risk" 而非百分比
3. 没有充分尝试转 protective_scalp（如在 0.3x actual risk 处部分止盈）

**影响**:
- 11 笔交易中，至少 3-4 笔是保护性止损退出
- 这些交易本应有机会转成 scratch 或小盈利

---

#### 问题 2: 工程化时间衰减逻辑

**现象**:
- `stale_bars`、`force_exit_bars`、`zombie_exit` 等固定 bar 数触发逻辑
- 不符合 Brooks "结构变化" 理念

**代码位置**: `sim_exchange.py:327-406`

**Al Brooks 标准**:
> "退出应该基于市场结构变化（如 Always-In 方向改变、突破失败、通道线触及），而非'持仓 X 根 bar 后必须怎样'。"
> — 《图表百科全书》实战案例

**偏差分析**:
```python
# 当前逻辑 (sim_exchange.py:350-370)
if bars_held >= self.max_holding_bars:  # 默认 48 根 bar
    return "force_exit"
if bars_held >= stale_bars and abs(pnl_pct) < 0.1:
    return "stale_exit"
```

问题：
1. Brooks 从不说 "48 根 bar 后必须平仓"
2. 真实场景：强趋势中可能持仓数天，TR 中可能几根 bar 就该退出
3. 这层逻辑持续扭曲胜率和 PF

**影响**:
- 强趋势中的优质单被提前清掉
- TR 中的弱单被拖太久才退出

---

#### 问题 3: 高潮/陷阱反转族 detector 质量不稳定

**现象**:
- 高潮/陷阱反转族 PF 仅 0.24（七窗口样本）
- 包括：末端旗形、第二腿陷阱、看衰突破、头肩顶/底MTR、急速通道

**代码位置**: `strategy_advanced.py` (各反转族 detector)

**Al Brooks 标准**:
> "大多数反转只是 minor reversal，真正的 major reversal 需要：
> 1. 高潮特征（连续强势 bar + 尾部）
> 2. 失败测试（second entry 失败）
> 3. 反向突破（突破通道线或 EMA）"
> — 《价格行为PPT中文笔记》第 24 课 Climaxes

**偏差分析**:
```python
# 示例：头肩顶MTR detector (strategy_advanced.py)
if edge_tests >= 2 and leg2_bars <= 5:  # 固定阈值
    return "HS_MTR"
```

问题：
1. `edge_tests >= 2` 是工程近似，不是 Brooks 原文规则
2. `leg2_bars <= 5` 过于机械，Brooks 强调 "leg2 失败" 而非 bar 数
3. 缺少 "高潮特征" 和 "反向突破" 的充分检查

**影响**:
- 混入大量不成熟的弱单
- 反转族整体 PF 0.24，严重拖累系统

---

### 2.2 P1 级问题 — 重要但非当前主要矛盾

#### 问题 4: 信号过滤链过于严格

**现象**:
- 83 个信号 → 12 笔交易，过滤率 85.5%

**代码位置**: `runner.py:386-463`

**过滤层级**:
1. 策略白名单/黑名单 (`is_strategy_allowed`)
2. 信号棒质量 (`_signal_bar_quality < 0.3`)
3. 路由一致性检查 (`_check_route_consistency`)
4. 入场准备度检查 (`_check_entry_readiness`)
5. 管理模板应用 (`_apply_management_template`)

**Al Brooks 标准**:
> "不要过度优化入场。大多数 setup 都有 40-60% 的成功率，关键在于管理。"
> — 《价格行为PPT中文笔记》第 26 课 Probability

**偏差分析**:
- 85.5% 过滤率意味着系统在 "寻找完美 setup"，而非 "管理普通 setup"
- Brooks 强调 "频率 × 管理" 而非 "完美入场"

**影响**:
- 交易频率过低（7天只有 12 笔交易）
- 无法充分测试管理逻辑

---

#### 问题 5: 多周期重复信号未充分利用

**现象**:
- 同一时刻多周期触发相同 setup（如 2020-12-22 18:20:00 同时触发 1h/30m/5m 的 T2）
- 系统只能持有一个品种一个方向的仓位

**Al Brooks 标准**:
> "多周期共振是强信号。5m 图是主力交易周期，15m/1h 用于确认方向。"
> — 《价格行为PPT中文笔记》第 1 课 Price Action

**偏差分析**:
- 当前系统把多周期共振当作 "重复信号" 去重
- 应该把多周期共振作为 "信号强度加成"

**影响**:
- 浪费了多周期共振的优势
- 可能错过最强的 setup

---

### 2.3 P2 级问题 — 目前不是主战场

#### 问题 6: 成本模型偏粗

**现象**:
- 统一 `fee_rate=0.0004` (0.04%)
- 真实滑点/点差未充分建模

**影响**:
- 会放大系统误差，尤其是高频策略
- 但不是当前主要矛盾

---

## 三、对照 Al Brooks 知识体系

### 3.1 核心偏差点

| Brooks 原则 | 当前系统 | 偏差程度 |
|------------|---------|---------|
| **Always-In 方向决定一切** | 简化版 EMA slope | ⚠️ 中等偏差 |
| **5m 主力交易周期** | 4 周期平等对待 | ⚠️ 中等偏差 |
| **Context > 形态 > 信号K线** | detector 优先 | ❌ 严重偏差 |
| **Management > Setup** | 过度优化入场 | ❌ 严重偏差 |
| **结构变化触发退出** | 固定 bar 数退出 | ❌ 严重偏差 |
| **Actual risk 决定仓位** | 百分比风险 | ⚠️ 中等偏差 |
| **Protective → Scratch/BE** | 直接止损 | ❌ 严重偏差 |
| **Trader's Equation: P×R > (1-P)×Risk** | 未充分应用 | ⚠️ 中等偏差 |

### 3.2 参考资料对照

#### 《价格行为PPT中文笔记》关键课程

1. **第 8 课 Always In - Who Owns the Market**
   - 系统偏差：背景识别过于简化，未充分表达 Always-In 方向

2. **第 24 课 Climaxes**
   - 系统偏差：高潮反转 detector 质量差，PF 0.24

3. **第 26 课 Probability and the Trader's Equation**
   - 系统偏差：过度优化入场（85.5% 过滤率），而非优化管理

4. **第 29 课 Protective Stops**
   - 系统偏差：保护性止损退化过多，未充分转 scratch/BE

5. **第 30 课 Actual Risk**
   - 系统偏差：使用百分比风险而非 actual risk

#### 《图表百科全书》实战案例

- **Trend 案例**: 强调 "进入通道后就按通道交易"，系统未充分识别通道
- **TR 案例**: 强调 "80% 的 TR BO 会失败"，系统未充分利用这一规律
- **Reversal 案例**: 强调 "大多数反转只是 minor reversal"，系统反转族质量差

---

## 四、优化建议（按 Brooks 归零法）

### 4.1 立即行动（P0 级）

#### 优化 1: 重构保护性止损逻辑

**目标**: 把 `protective_stop_exit` 转化率从当前 30% 提升到 70%

**行动**:
1. 移除固定 bar 数（3根）触发逻辑
2. 改用结构变化触发：
   - Always-In 方向改变 → 退出
   - 突破失败（回到区间内）→ 退出
   - 触及 protective scalp 目标（0.3x actual risk）→ 部分止盈
3. 增加 breakeven 转换逻辑：
   - 盈利 >= 0.5x actual risk → 移动止损到 BE
   - 盈利 >= 1x actual risk → 部分止盈 + 移动止损

**参考**: 《价格行为PPT中文笔记》第 29 课 Protective Stops

---

#### 优化 2: 清除工程化时间衰减逻辑

**目标**: 移除所有固定 bar 数退出逻辑

**行动**:
1. 删除 `stale_bars`、`force_exit_bars`、`zombie_exit`
2. 改用结构变化触发：
   - 趋势中：突破失败 / 反向突破 / 通道线触及
   - TR 中：边缘测试失败 / 突破成功
3. 保留最大持仓时间作为 "安全阀"（如 7 天），但不作为主要退出逻辑

**参考**: 《图表百科全书》实战案例

---

#### 优化 3: 重构高潮/陷阱反转族 detector

**目标**: 把反转族 PF 从 0.24 提升到 1.5+

**行动**:
1. 按 Brooks 原文逐个证伪 detector：
   - 头肩顶/底MTR: 要求 "leg2 失败测试" + "反向突破"
   - 末端旗形: 要求 "高潮特征" + "旗形内 3+ 次边缘测试"
   - 第二腿陷阱: 要求 "second entry 失败" + "反向突破"
2. 移除固定工程阈值（如 `edge_tests >= 2`）
3. 增加 "高潮特征" 检查：
   - 连续强势 bar（3+ 根）
   - 尾部（tail > 50% bar range）
   - 加速（bar range 递增）

**参考**: 《价格行为PPT中文笔记》第 24 课 Climaxes + 《图表百科全书》反转案例

---

### 4.2 中期优化（P1 级）

#### 优化 4: 放宽信号过滤链

**目标**: 把过滤率从 85.5% 降低到 50-60%

**行动**:
1. 放宽信号棒质量阈值（从 0.3 降到 0.2）
2. 移除部分路由一致性检查（允许更多 "非标准" setup）
3. 增加交易频率，充分测试管理逻辑

**参考**: 《价格行为PPT中文笔记》第 26 课 Probability

---

#### 优化 5: 利用多周期共振

**目标**: 把多周期共振作为信号强度加成

**行动**:
1. 检测多周期共振（同一时刻多周期触发相同 setup）
2. 共振信号：
   - 增加仓位（1.5x 标准仓位）
   - 放宽止损（1.2x actual risk）
   - 提高目标（2x → 3x actual risk）

**参考**: 《价格行为PPT中文笔记》第 1 课 Price Action

---

### 4.3 长期优化（P2 级）

#### 优化 6: 完善背景识别

**目标**: 从简化版 EMA slope 升级到完整 Brooks 背景识别

**行动**:
1. 识别市场状态：Trend / TR / Transition
2. 识别位置：通道内 / 通道线 / 突破后
3. 识别对侧风险：Always-In 方向 + 反向压力

**参考**: 《价格行为PPT中文笔记》第 8 课 Always In

---

#### 优化 7: 细化成本模型

**目标**: 把 "系统本身没边" 和 "边不够厚被成本吃掉" 分开

**行动**:
1. 建模真实滑点（基于订单簿深度）
2. 建模点差（bid-ask spread）
3. 分品种/周期测试成本敏感度

---

## 五、行动计划

### 阶段 1: 紧急修复（1-2 天）

- [ ] 重构保护性止损逻辑（优化 1）
- [ ] 清除工程化时间衰减逻辑（优化 2）
- [ ] 回测验证（目标：胜率 50%+，PF 1.5+）

### 阶段 2: 质量提升（3-5 天）

- [ ] 重构高潮/陷阱反转族 detector（优化 3）
- [ ] 放宽信号过滤链（优化 4）
- [ ] 回测验证（目标：胜率 55%+，PF 2.0+）

### 阶段 3: 系统优化（1-2 周）

- [ ] 利用多周期共振（优化 5）
- [ ] 完善背景识别（优化 6）
- [ ] 细化成本模型（优化 7）
- [ ] 全面回测（目标：胜率 60%+，PF 2.5+）

---

## 六、关键提醒

### 每次优化都要符合 Al Brooks 知识体系

1. **优先级**: 课程 PDF 原文 > 图表百科全书 > 课程大纲 > skill 文件
2. **验证方式**: 每次修改后，对照 Brooks 原文截图验证
3. **避免污染**: 不要把回测结论（如 "5m 禁用"）混入 Brooks 课程内容

### Brooks 核心理念

1. **Management > Setup**: 不要过度优化入场，关键在于管理
2. **Context > 形态**: 背景识别比形态识别更重要
3. **结构变化 > 固定规则**: 退出应基于市场结构变化，而非固定 bar 数
4. **Actual risk > 百分比**: 仓位和止损应基于 actual risk，而非账户百分比
5. **频率 × 管理**: 系统盈利 = 交易频率 × 管理质量，而非完美入场

---

## 附录：关键文件路径

### 信号生成
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py`

### 过滤与路由
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/market/playbook_router.py`

### 持仓管理
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/manager.py`

### Al Brooks 参考资料
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/《价格行为PPT中文笔记》/`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/图表百科全书-文件夹版/`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/阿布10种最佳价格行为交易模式.pdf`

---

**报告生成**: Claude Code (Opus 4.6)
**审计方法**: Brooks 归零法 + 代码深度探索
**下一步**: 按行动计划执行优化，每次优化后回测验证
