# Al Brooks 开盘策略参考手册

> 来源: 48A-48K 系列课程提炼 | 适用: 5min ES 及加密市场

---

## 1. 一天三部分理论

| 阶段 | 时段 (ES) | 特征 | Swing机会 |
|------|-----------|------|-----------|
| **开盘** | 头2小时 (B1-B24) | 波动大, 易出趋势, 90%有swing机会 | 90% |
| **中段** | 中间2小时 | Sideway为主, 测试S/R, 寻找变化信号 | 50% |
| **收盘** | 最后2小时 | BTC/STC趋势, 避免channel, 时间=额外风险 | 80% |

**核心统计**: 只有10%是Strong Trend Day全天单行道; 90%的日子经历多个market cycle。

**B18法则**: B1包含HOD/LOD概率20%, B7=50%, B12=70%, B18=90%。突破B1-18范围的方向暗示全天基调。

---

## 2. 开盘反转策略 (Opening Reversal)

| 要素 | 规则 |
|------|------|
| **识别条件** | 开盘BO后出现DT/DB或Wedge Top/Bottom于S/R处; 80%遇minor reversal, 50%遇major reversal |
| **入场点** | Second entry reversal bar的stop order (突破信号K线极值1 tick) |
| **止损** | 信号K线的对侧极值 (reversal bar的H或L) |
| **目标** | Minor: scalp 0.5-1R; Major: swing至对侧range或MM |
| **放弃条件** | BO的FT持续3+根strong trend bar且无PB迹象 |

**BO幅度与反转力度关系**:

| 首次BO幅度 (占ADR%) | 反转后预期 |
|---------------------|-----------|
| 25%-50% | 反方向大趋势可能性高 |
| 50%-100% | 反转后更可能进入TR |

**开盘反转于S/R处**: 经常成为全天的HOD或LOD。

---

## 3. BOM (Breakout Mode) 开盘

| 要素 | 规则 |
|------|------|
| **识别条件** | 头10根bar形成Open TR: 先涨破B1 H形成new H再回落, 或先跌破B1 L形成new L再反弹; TR > 10 bar; 0.3 ADR < TR range < 0.5 ADR |
| **入场点** | 突破new H用buy stop; 跌破new L用sell stop |
| **止损** | 多头: new L; 空头: new H |
| **目标** | TR range的MM (测量移动) |
| **放弃条件** | TR range > 0.5 ADR (可能是TR day, fade BO); bar数不足10根(可信度下降); 进入BOM前出现超过1根trend bar |

**B16-20 BO**: 很多人front run B18 range BO, 关注此区间的突破/反转信号。

---

## 4. 开盘高低突破 (Failed BO of Yesterday's H/L)

| 要素 | 规则 |
|------|------|
| **识别条件** | 价格突破HOY/LOY后形成DT/DB或Wedge Top/Bottom |
| **入场点** | Second entry reversal, stop order |
| **止损** | 突破后的极值点 |
| **目标** | 回踩Open价格或EMA |
| **放弃条件** | Reversal变成bull/bear flag, 突破继续 -- 此时反转失败, 应跟随原突破方向 |

---

## 5. 缺口开盘处理 (Gap Openings)

| 缺口类型 | 4种常见走势 (占80%) | 仅20%情况 |
|----------|---------------------|-----------|
| **Gap Up** | DB near EMA / Wedge Bottom near EMA / DT / Wedge Top | Strong bull trend持续 |
| **Gap Down** | DT near EMA / Wedge Top near EMA / DB / Wedge Bottom | Strong bear trend持续 |

**Early Flags (缺口后的旗形)**:
- Gap Up + DB at MA = 继续做多信号
- Gap Up + Wedge PB at MA = 继续做多信号
- Gap Down + DT at MA = 继续做空信号
- Gap Down + Wedge Top at MA = 继续做空信号

**开局连续trend bar定基调**: Gap后出现连续bull bar, 减少bear trend day概率; 反之亦然。

---

## 6. 开盘陷阱识别 (Bull & Bear Traps)

| 要素 | 规则 |
|------|------|
| **识别条件** | 最后2小时的BO无FT; 或SMPB(Small PB)后的首次回调 |
| **Bull Trap** | 尾盘BO up但无FT -- 均线+颈线+随机性三重确认失败 |
| **Bear Trap** | 尾盘SMPB后首次PB形成买入机会 |
| **Open Magnet** | 最后1小时价格倾向回归Open价格 |
| **放弃条件** | BO后出现strong FT bar, 陷阱假设不成立 |

**80%法则**: Trend中80%的reversal会失败; TR中80%的BO会失败。

---

## 7. 加密市场适配 (24小时市场)

| 传统市场概念 | 加密市场等效 |
|-------------|-------------|
| Open (9:30 EST) | UTC 00:00 日K线开盘 / 重大新闻发布时刻 |
| 头2小时 | UTC 00:00-02:00 或大新闻后2小时 |
| B18法则 | 日K线开盘后前18根5min bar (UTC 00:00-01:30) |
| HOY/LOY | 前一日UTC日K线的H/L |
| Gap Opening | 亚洲/伦敦/美盘交接时的跳空 |
| 最后2小时 | UTC 22:00-00:00 (日K线收盘前) |
| EMA参考 | 20 EMA在5min图同样适用 |
| BTC/STC | 重大宏观数据发布前30min的尾盘趋势 |

**亚洲盘流动性陷阱** (来自ROSE): 亚洲时段range上下方的trapped trader提供流动性燃料, 伦敦/美盘开盘突破时形成MM。

**实操建议**: 加密市场无真正"收盘", 但UTC 00:00换日线和每周一00:00换周线是关键时刻, 适用开盘策略全部逻辑。
