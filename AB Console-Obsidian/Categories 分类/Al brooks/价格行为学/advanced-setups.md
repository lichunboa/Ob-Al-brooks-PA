# Al Brooks 高级实战 Setup 参考手册

> 来源: ROSE系列 + Joo战术 + Pivot Reversal + Context课程提炼

---

## 1. ROSE 2+2+2 TTR 突破

**核心逻辑**: Failure of Failure is Swing -- TTR中双顶双底反复失败后, 连续2根bar收盘突破中线即为突破信号。

| 要素 | 规则 |
|------|------|
| **识别条件** | TTR中出现至少2组DB和DT (双底+双顶); 价格在TR内反复被两端压制 |
| **入场点** | 2根连续同向bar的**收盘价超过TR 50%线**后, 用stop order入场: 做多=第2根bull bar高点上方1 tick; 做空=第2根bear bar低点下方1 tick |
| **止损** | 做多: 第1根bull bar低点下方1 tick; 做空: 第1根bear bar高点上方1 tick |
| **目标** | Scalp: 0.5R-1R; Runner留仓目标2R |
| **放弃条件** | 第2根bar的open被反方向吞没 -- 立刻离场, 不等止损被打; 可反手加入对方setup |

**适用场景**: 开盘TR / 趋势后的TTR / 中段盘整 / 跨天TTR / 宏观级别(日线/周线)。

---

## 2. Micro-TR 操作方法

**核心逻辑**: 基于Auction Market Theory -- 价格从一个平衡区(TR)移动到另一个平衡区。

| 要素 | 规则 |
|------|------|
| **识别条件** | 1) 出现一根Big Bar(价格向下一个平衡区移动); 2) 随后几根bar的open/close聚集在一起(形成局部平衡区/micro-TR) |
| **入场点** | 等待micro-TR突破方向, stop order入场 |
| **止损** | Micro-TR的对侧极值; 或上一个TR的ledge(极值点) |
| **目标** | 下一个平衡区(下一个TR的中心); Limit order可在"最后捡便宜机会"(上一TR ledge回测)入场 |
| **放弃条件** | 价格回破上一个TR的ledge -- 趋势假设无效 |

**AMT五条规则要点**:
1. 价格有惰性, 倾向留在当前TR
2. 趋势 = 从一个TR移动到另一个TR
3. 只要不跌破当前TR低点和上一TR低点, 上升趋势仍在
4. 离开TR后, 上一TR的ledge会hold住
5. 趋势持续直到回访旧TR或创造新TR

---

## 3. 回调计数法 (ROSE数点)

| 要素 | 规则 |
|------|------|
| **识别条件** | 趋势中出现大型trend bar后的回调 |
| **测量方法** | 从极值点量到收盘价: 33PB = 首批对手盘seller/buyer所在; 50PB = 决战位; 66PB = 深度回调目标 |
| **入场点** | 基于数点确定的支撑/阻力位, 用stop order或limit order |
| **止损** | 结构止损(如上一个swing极值) |
| **目标** | Scalp: half ATR + 0.5点 (含0.25 stop order + 0.25 fill保证); Swing: 20点目标 |
| **放弃条件** | 回调无法触及50PB就反弹 -- 原趋势极强; 回调穿越66PB -- 趋势可能已反转 |

**ROSE数点尺度**:

| 点数 | 含义 |
|------|------|
| 5点 | Scalp标配 |
| 10点 | Swing起点 -- 若bear阻止bull达到10点, 看空信号 |
| 20点 | Swing目标地 |

**多时间周期**: ROSE会在小时级别看上周H/L/Mid, 在15min看Globex/亚洲盘range来确认流动性陷阱位。

---

## 4. 楔形推进情绪线 (Wedge Push Sentiment Line)

| 要素 | 规则 |
|------|------|
| **识别条件** | 三推楔形(wedge)走势形成 |
| **画法** | 连接 Leg 1 PB起点 到 Leg 2 PB终点, 延伸即为情绪线(sentiment line) |
| **含义** | 情绪线 = 对手盘的price target; 突破情绪线代表趋势衰竭确认 |
| **入场点** | 第三推完成 + 价格回破情绪线时, 做反转 |
| **止损** | 第三推的极值 |
| **目标** | 至少回到Leg 1 PB起点; 更远目标为楔形起点 |
| **放弃条件** | 第三推后价格未触及情绪线而继续原方向突破 |

---

## 5. Pivot Reversal + Caveman 组合

| 要素 | 规则 |
|------|------|
| **识别条件** | Pivot Reversal: 价格在关键S/R(前高/前低/50PB/ledge)形成反转bar; Caveman: 大型反转bar(big reversal bar), 通常在failed BO后出现 |
| **组合信号** | 关键位置出现Caveman级别的大反转bar = 高概率反转 |
| **入场点** | Limit buy/sell at 回测ledge (如Joo战术: B36 ledge处limit buy) |
| **止损** | 结构无效点 (如前swing极值, Joo: B51 L) |
| **目标** | TR中: 对侧边沿部分止盈; 若趋势形成: 持有至1R |
| **放弃条件** | 当前区域 = TR控制, 不恋战, 任务是"进场/盈利/离场" |

**Joo战术卡片模板**:
- Context: 识别之前的趋势 + 结构(wedge/channel/TR)
- Structure: 关键价位(50PB/DB/DT/ledge)
- Signal: 反转bar的质量
- Entry/Stop/TP: 明确的数字化执行
- Tactical Notes: "No overstay. Mission: In / Profit / Out."

---

## 6. Context 规则 (背景决定解读)

**核心原则**: 同一形态在不同背景下含义完全不同。

| 背景因素 | 如何影响解读 |
|----------|-------------|
| **之前趋势方向** | BOM在bear趋势后 = 回调继续; BOM在bull趋势后 = 回调做多 |
| **相对EMA位置** | EMA下方的BOM偏空; EMA上方的BOM偏多 |
| **日线级别** | 日线在TR中: 期待doji/反转; 日线在趋势中: early reversal是入场机会 |
| **昨日收盘** | 昨日bull trend day: 50%延续/75%有回调/25%反转; bear反之 |
| **HOY/LOY** | 昨日H/L是关键S/R, failed BO是高概率反转 |
| **Gap大小** | Gap+连续trend bar定今日基调; Gap后weak bar暗示反转 |
| **80%法则** | Trend中80%反转失败; TR中80%突破失败 -- 据此决定顺势or逆势 |

**实战决策链**:
1. 日线在什么状态? (Trend / TR / Channel)
2. 昨日怎么收的? (Bull/Bear Trend Day / TR Day)
3. 今日Open在什么位置? (相对HOY/LOY/EMA)
4. 前10根bar展现什么? (Trend from Open / BOM / Reversal)
5. 基于以上context, 选择对应策略执行
