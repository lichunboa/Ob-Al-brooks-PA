# 回测验证计划（2026-03-15）

**目的**: 多维度验证分析报告中的结论
**状态**: ⏸️ 等待 GPT 完成当前优化后执行
**参考**: [BACKTEST_PERFORMANCE_ANALYSIS_20260315.md](BACKTEST_PERFORMANCE_ANALYSIS_20260315.md)

---

## 一、验证目标

### 1.1 核心假设验证

| 假设 | 验证方法 | 预期结果 |
|------|---------|---------|
| **信号转化率过低（85.5%）** | 多场景回测统计信号生成数 vs 实际交易数 | 转化率应在 15-50% 之间 |
| **保护性止损退化过多** | 统计 protective_stop_exit 占比 | 应 < 30% |
| **高潮/陷阱反转族 PF 低** | 单独测试反转族策略 | PF 应 < 1.0 |
| **工程化时间衰减影响大** | 对比有/无固定 bar 数退出的结果 | 差异应 > 10% |
| **多周期共振未利用** | 统计多周期同时触发的信号 | 应 > 30% |

### 1.2 Al Brooks 标准对照

| Brooks 标准 | 当前系统 | 验证方法 |
|------------|---------|---------|
| 胜率 60%+ | 45% | 多场景平均胜率 |
| PF 2.0+ | 1.68 | 多场景平均 PF |
| 5m 主力周期 | 4 周期平等 | 对比各周期表现 |
| Management > Setup | 过度优化入场 | 统计过滤率 |

---

## 二、回测矩阵设计

### 2.1 场景维度（5 个预置场景）

```bash
# 场景 1: 强势多头趋势
python tools/backtest/backtest_v4.py \
  --scenario trend_bull \
  --management-profile brooks_pdf \
  --output data/backtest_reports/trend_bull_validation.json \
  --verbose

# 场景 2: 强势空头趋势
python tools/backtest/backtest_v4.py \
  --scenario trend_bear \
  --management-profile brooks_pdf \
  --output data/backtest_reports/trend_bear_validation.json \
  --verbose

# 场景 3: 横盘震荡
python tools/backtest/backtest_v4.py \
  --scenario tr_choppy \
  --management-profile brooks_pdf \
  --output data/backtest_reports/tr_choppy_validation.json \
  --verbose

# 场景 4: 趋势反转
python tools/backtest/backtest_v4.py \
  --scenario reversal \
  --management-profile brooks_pdf \
  --output data/backtest_reports/reversal_validation.json \
  --verbose

# 场景 5: 假突破洗盘
python tools/backtest/backtest_v4.py \
  --scenario bad_market \
  --management-profile brooks_pdf \
  --output data/backtest_reports/bad_market_validation.json \
  --verbose
```

### 2.2 品种维度（4 个主流品种）

```bash
# 多品种回测（BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT）
python tools/backtest/run_multi_symbol_backtest.py \
  --symbols "BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT" \
  --timeframes "5m,15m,30m,1h" \
  --days 30 \
  --balance 40000 \
  --management-profile brooks_pdf \
  --output data/backtest_reports/multi_symbol_30d_validation.json \
  --verbose
```

### 2.3 周期维度（4 个周期对比）

```bash
# 单独测试各周期表现
for tf in 5m 15m 30m 1h; do
  python tools/backtest/run_multi_symbol_backtest.py \
    --symbols "BTCUSDT" \
    --timeframes "$tf" \
    --days 60 \
    --balance 10000 \
    --management-profile brooks_pdf \
    --output "data/backtest_reports/btc_${tf}_60d_validation.json" \
    --verbose
done
```

### 2.4 时间维度（3 个时间段）

```bash
# 近期（最近 30 天）
python tools/backtest/run_multi_symbol_backtest.py \
  --symbols "BTCUSDT,ETHUSDT" \
  --timeframes "5m,15m" \
  --days 30 \
  --balance 20000 \
  --management-profile brooks_pdf \
  --output data/backtest_reports/recent_30d_validation.json \
  --verbose

# 中期（最近 90 天）
python tools/backtest/run_multi_symbol_backtest.py \
  --symbols "BTCUSDT,ETHUSDT" \
  --timeframes "5m,15m" \
  --days 90 \
  --balance 20000 \
  --management-profile brooks_pdf \
  --output data/backtest_reports/mid_90d_validation.json \
  --verbose

# 长期（最近 180 天）
python tools/backtest/run_multi_symbol_backtest.py \
  --symbols "BTCUSDT,ETHUSDT" \
  --timeframes "5m,15m" \
  --days 180 \
  --balance 20000 \
  --management-profile brooks_pdf \
  --output data/backtest_reports/long_180d_validation.json \
  --verbose
```

### 2.5 策略族维度（单独测试各策略族）

```bash
# 趋势族
python tools/backtest/run_multi_symbol_backtest.py \
  --symbols "BTCUSDT" \
  --timeframes "5m,15m" \
  --days 60 \
  --balance 10000 \
  --strategy-whitelist "T1,T2,T3,T6" \
  --management-profile brooks_pdf \
  --output data/backtest_reports/trend_family_validation.json \
  --verbose

# 反转族
python tools/backtest/run_multi_symbol_backtest.py \
  --symbols "BTCUSDT" \
  --timeframes "5m,15m" \
  --days 60 \
  --balance 10000 \
  --strategy-whitelist "MTR,CLIMAX,HS,DT-DB" \
  --management-profile brooks_pdf \
  --output data/backtest_reports/reversal_family_validation.json \
  --verbose

# TR族
python tools/backtest/run_multi_symbol_backtest.py \
  --symbols "BTCUSDT" \
  --timeframes "5m,15m" \
  --days 60 \
  --balance 10000 \
  --strategy-whitelist "BLSHS,TR-FADE" \
  --management-profile brooks_pdf \
  --output data/backtest_reports/tr_family_validation.json \
  --verbose
```

---

## 三、数据收集指标

### 3.1 信号转化指标

```python
{
  "signals": {
    "generated": 83,           # 原始信号数
    "passed": 12,              # 通过过滤的信号数
    "conversion_rate": 14.5,   # 转化率 %
    "multi_tf_overlap": 45     # 多周期重复信号数
  }
}
```

### 3.2 交易质量指标

```python
{
  "trades": {
    "total": 12,
    "wins": 5,
    "losses": 6,
    "scratches": 1,
    "win_rate": 45.45,
    "profit_factor": 1.68,
    "avg_win": 58.64,
    "avg_loss": -28.52,
    "max_drawdown": -5.2
  }
}
```

### 3.3 退出方式分布

```python
{
  "exits": {
    "protective_stop_exit": 4,      # ❌ 保护性止损
    "protective_scalp_exit": 2,     # ✓ 保护性止盈
    "breakeven_stop_exit": 1,       # ✓ 保本退出
    "runner_trailing_exit": 2,      # ✓ 追踪止损
    "tp_after_scaleout_exit": 2,    # ✓ 部分止盈后退出
    "stale_exit": 1,                # ⚠️ 工程化退出
    "force_exit": 0                 # ⚠️ 强制退出
  }
}
```

### 3.4 策略族表现

```python
{
  "strategy_families": {
    "trend": {
      "trades": 8,
      "win_rate": 62.5,
      "pf": 2.3
    },
    "reversal": {
      "trades": 3,
      "win_rate": 33.3,
      "pf": 0.24        # ❌ 问题族
    },
    "tr": {
      "trades": 1,
      "win_rate": 0.0,
      "pf": 0.0
    }
  }
}
```

---

## 四、Al Brooks 参考资料对照

### 4.1 课程 PDF 关键页

执行回测时，对照以下 Brooks 原文验证：

1. **第 8 课 Always In**
   - 路径: `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/01-10 基础概念/08 Always In - Who Owns the Market谁总是拥有市场.md`
   - 验证点: 背景识别是否正确判断 Always-In 方向

2. **第 24 课 Climaxes**
   - 路径: `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/21-30 高级策略/24 Climaxes高潮.md`
   - 验证点: 高潮反转 detector 是否符合 Brooks 标准

3. **第 26 课 Probability**
   - 路径: `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/21-30 高级策略/26 Probability and the Trader's Equation概率论与交易的方程.md`
   - 验证点: Trader's Equation 是否正确应用

4. **第 29 课 Protective Stops**
   - 路径: `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/21-30 高级策略/29 Protective Stops保护止损.md`
   - 验证点: 保护性止损管理是否符合 Brooks 标准

5. **第 30 课 Actual Risk**
   - 路径: `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/21-30 高级策略/30 Actual Risk实际风险.md`
   - 验证点: 仓位计算是否基于 actual risk

### 4.2 图表百科全书案例

回测后，对照百科全书实战案例：

- 路径: `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/图表百科全书-文件夹版/`
- 重点案例:
  - Trend 案例: 验证通道识别和趋势恢复
  - TR 案例: 验证 80% BO 失败规律
  - Reversal 案例: 验证 major vs minor reversal

### 4.3 10 种最佳模式 PDF

- 路径: `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/阿布10种最佳价格行为交易模式.pdf`
- 验证点: 系统是否覆盖这 10 种模式

---

## 五、执行步骤

### 5.1 准备阶段

- [ ] 确认 GPT 完成当前优化
- [ ] 确认回测环境正常（execution-service 不需要运行）
- [ ] 创建输出目录: `mkdir -p data/backtest_reports`
- [ ] 备份当前代码状态: `git stash save "before validation backtest"`

### 5.2 执行阶段

**阶段 1: 场景维度（预计 30 分钟）**
```bash
# 运行 5 个预置场景
bash scripts/run_scenario_validation.sh
```

**阶段 2: 品种维度（预计 1 小时）**
```bash
# 运行多品种回测
bash scripts/run_multi_symbol_validation.sh
```

**阶段 3: 周期维度（预计 1 小时）**
```bash
# 运行各周期对比
bash scripts/run_timeframe_validation.sh
```

**阶段 4: 时间维度（预计 2 小时）**
```bash
# 运行不同时间段
bash scripts/run_time_period_validation.sh
```

**阶段 5: 策略族维度（预计 1 小时）**
```bash
# 运行策略族对比
bash scripts/run_strategy_family_validation.sh
```

### 5.3 分析阶段

- [ ] 汇总所有回测结果
- [ ] 生成对比报告
- [ ] 对照 Al Brooks 资料验证
- [ ] 更新分析报告
- [ ] 提出优化建议

---

## 六、预期输出

### 6.1 回测报告文件

```
data/backtest_reports/
├── trend_bull_validation.json
├── trend_bear_validation.json
├── tr_choppy_validation.json
├── reversal_validation.json
├── bad_market_validation.json
├── multi_symbol_30d_validation.json
├── btc_5m_60d_validation.json
├── btc_15m_60d_validation.json
├── btc_30m_60d_validation.json
├── btc_1h_60d_validation.json
├── recent_30d_validation.json
├── mid_90d_validation.json
├── long_180d_validation.json
├── trend_family_validation.json
├── reversal_family_validation.json
└── tr_family_validation.json
```

### 6.2 汇总分析报告

- `BACKTEST_VALIDATION_RESULTS_20260315.md` — 汇总所有回测结果
- `BROOKS_ALIGNMENT_VERIFICATION_20260315.md` — Al Brooks 对齐验证
- `OPTIMIZATION_PRIORITY_20260315.md` — 优化优先级建议

---

## 七、成功标准

### 7.1 数据质量标准

- ✓ 每个场景至少 10 笔交易
- ✓ 每个品种至少 20 笔交易
- ✓ 每个周期至少 15 笔交易
- ✓ 总样本量 > 200 笔交易

### 7.2 分析深度标准

- ✓ 信号转化率分析（生成 vs 通过）
- ✓ 退出方式分布分析
- ✓ 策略族表现对比
- ✓ Al Brooks 标准对照
- ✓ 优化建议优先级排序

### 7.3 Brooks 对齐标准

- ✓ 每个关键发现都有 Brooks 原文支撑
- ✓ 每个优化建议都有百科案例参考
- ✓ 不引入非 Brooks 体系的规则

---

## 八、注意事项

### 8.1 回测纪律

1. **不针对单一品种/周期调参**
   - 所有优化必须基于 Brooks 理论
   - 不因某个品种表现差就特殊处理

2. **随机时间段验证**
   - 每次优化后必须在不同时间段验证
   - 避免过拟合特定市场环境

3. **保持 Brooks 纯度**
   - 不混入回测结论（如 "5m 禁用"）
   - 不污染 Brooks 课程内容

### 8.2 资料使用优先级

1. **Al Brooks 课程 PDF 原文** — 最高优先级
2. **图表百科全书实战案例** — 第二优先级
3. **课程大纲** — 第三优先级
4. **skill 文件** — 仅作流程参考

### 8.3 截图验证

对于关键的 Brooks 理论点，建议：
1. 找到对应的 PDF 页面
2. 截图保存到 `docs/brooks_evidence/`
3. 在报告中引用截图

---

**创建时间**: 2026-03-15
**创建者**: Claude Code (Opus 4.6)
**状态**: ⏸️ 等待 GPT 完成优化后执行
**预计执行时间**: 5-6 小时
**预计输出**: 15+ 回测报告 + 3 份分析文档
