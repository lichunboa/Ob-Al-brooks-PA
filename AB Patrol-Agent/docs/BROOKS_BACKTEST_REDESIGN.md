# Al Brooks 回测系统重构设计

> 目标：胜率 ≥85%，日均交易 ≥50，盈利因子 ≥1.5
> 原则：100% 遵循 Al Brooks 交易哲学，不做任何"优化"

## 当前问题诊断

### 1. 止损逻辑完全错误 ❌
**问题**：使用固定 ATR 倍数或百分比
**Brooks 原则**：止损必须在结构位外侧
- Bull: 止损在最近 major higher low 下方
- Bear: 止损在最近 major lower high 上方
- TR: 止损在 TR 边界外侧

### 2. H2/L2 定义错误 ❌
**问题**：任何第二次触及 EMA 的 K 线
**Brooks 定义**：反转失败后的第二次顺势机会
- 必须有 "failed reversal attempt" 前置条件
- L1 失败 → H1 成功（同一博弈）

### 3. "看衰突破"和"第二腿陷阱"混淆 ❌
**看衰突破**：BO 后 2-3 根无 FT → 立即 fade
**第二腿陷阱**：BO 后有 FT，然后 double top/bottom → 等第二腿失败

### 4. Trader's Equation 用错 ❌
**问题**：固定 P=0.4, R=2.0
**Brooks 原则**：P 取决于市场状态
- 强趋势 H2: P=60%, R=1.5
- 弱趋势 H2: P=30%, R=1.5 → 不做
- TR 边缘: P=60%, R=1.0

---

## 新架构设计

### 文件夹结构

```
AB Patrol-Agent/
├── indicators/                    # 纯计算层（无交易逻辑）
│   ├── __init__.py
│   ├── ema.py                    # EMA20 计算
│   ├── structure.py              # HL/LH/HH/LL 识别
│   ├── support_resistance.py    # S/R 位置
│   ├── patterns.py               # DT/DB/Wedge/Inside Bar
│   ├── measured_move.py          # MM 目标计算
│   └── pressure.py               # 买卖压力
│
├── backtest/                      # 回测引擎
│   ├── __init__.py
│   ├── engine.py                 # 主引擎
│   ├── market_state.py           # 市场状态判断（BO/Channel/TR）
│   ├── signal_generator.py       # 信号生成
│   ├── position_manager.py       # 持仓管理
│   ├── stop_calculator.py        # 止损计算（结构位）
│   ├── trader_equation.py        # P×R 评估
│   └── models.py                 # 数据模型
│
├── strategies/                    # 10+ 策略实现
│   ├── __init__.py
│   ├── h1_l1.py                  # 第一次回调
│   ├── h2_l2.py                  # 第二次回调
│   ├── ema_pb.py                 # EMA 回调
│   ├── double_top_bottom.py     # 双顶底
│   ├── wedge.py                  # 楔形
│   ├── failed_breakout.py       # 看衰突破
│   ├── second_leg_trap.py       # 第二腿陷阱
│   ├── buy_the_close.py         # 收线追进
│   ├── mag_setup.py             # MAG 20/20
│   └── blshs.py                 # TR 边缘 Scalp
│
└── reports/backtest/             # 回测报告
    └── v2_brooks_pure/           # 新版本报告
```

---

## 核心模块设计

### 1. indicators/ — 纯计算层

#### indicators/ema.py
```python
def calculate_ema(candles: list[Candle], period: int = 20) -> list[float]:
    """计算 EMA，返回每根 K 线的 EMA 值"""

def ema_distance(price: float, ema: float) -> float:
    """价格与 EMA 的距离（百分比）"""

def count_bars_above_ema(candles: list[Candle], ema_values: list[float]) -> int:
    """连续多少根 K 线在 EMA 上方"""

def is_20_gap_bar(candles: list[Candle], ema_values: list[float]) -> bool:
    """是否是 20 Gap Bar（20+ 根未触及 EMA）"""
```

#### indicators/structure.py
```python
def identify_swing_points(candles: list[Candle], lookback: int = 5) -> list[SwingPoint]:
    """识别 swing high/low（结构位）"""

def is_higher_high(current: SwingPoint, previous: SwingPoint) -> bool:
    """是否形成 Higher High"""

def is_higher_low(current: SwingPoint, previous: SwingPoint) -> bool:
    """是否形成 Higher Low"""

def find_major_swing_low(swing_points: list[SwingPoint], current_idx: int) -> SwingPoint:
    """找到最近的 major higher low（止损用）"""
```

#### indicators/support_resistance.py
```python
def find_nearest_support(price: float, swing_points: list[SwingPoint]) -> SRLevel:
    """找到最近的支撑位"""

def find_nearest_resistance(price: float, swing_points: list[SwingPoint]) -> SRLevel:
    """找到最近的阻力位"""

def identify_tr_boundaries(candles: list[Candle], lookback: int = 20) -> TRBoundary:
    """识别 TR 边界"""
```

#### indicators/patterns.py
```python
def detect_double_top(swing_points: list[SwingPoint]) -> DoubleTop | None:
    """检测双顶（两个高点在 2% 范围内）"""

def detect_wedge(swing_points: list[SwingPoint]) -> Wedge | None:
    """检测楔形（三推 + 收敛）"""

def detect_inside_bar(candles: list[Candle], idx: int) -> bool:
    """检测 inside bar"""
```

#### indicators/measured_move.py
```python
def calculate_mm_target(
    entry_price: float,
    direction: str,
    basis_type: str,  # "leg_height" | "tr_height" | "bo_height"
    basis_value: float
) -> float:
    """计算 MM 目标价"""
```

---

### 2. backtest/market_state.py — 市场状态判断

```python
class MarketState(Enum):
    BREAKOUT = "BO"           # 突破中
    TIGHT_CHANNEL = "TC"      # 紧密通道
    BROAD_CHANNEL = "BC"      # 宽幅通道
    TRADING_RANGE = "TR"      # 交易区间
    CLIMAX = "CLIMAX"         # 高潮

class MarketStateDetector:
    def detect(self, candles: list[Candle], ema_values: list[float]) -> MarketState:
        """
        判断当前市场状态

        BO: 连续 3+ 大趋势 K 线 + gap
        TC: PB < 2× avg bar, 1-3 bar
        BC: PB > 50%, 5+ bar
        TR: 上下边界清晰，K 线重叠多
        """

    def detect_ai_direction(self, candles: list[Candle], ema_values: list[float]) -> str:
        """
        判断 Always-In 方向

        AIL: HH+HL, 阳线实体 > 阴线, EMA 向上
        AIS: LH+LL, 阴线实体 > 阳线, EMA 向下
        NEUTRAL: 不确定 = TR
        """
```

---

### 3. strategies/ — 信号生成

每个策略文件独立实现一个 setup：

```python
# strategies/h2_l2.py
class H2L2Strategy:
    def detect_signal(
        self,
        candles: list[Candle],
        ema_values: list[float],
        market_state: MarketState,
        ai_direction: str
    ) -> Signal | None:
        """
        检测 H2/L2 信号

        条件：
        1. 必须有 failed reversal attempt（L1 失败 → H1）
        2. 第二次回调（两根阴线后的阳线）
        3. 市场状态 = Channel
        4. AI 方向 = 顺势
        """

        # 1. 检查是否有 failed reversal
        if not self._has_failed_reversal(candles[-10:]):
            return None

        # 2. 检查是否是第二次回调
        if not self._is_second_pullback(candles[-5:]):
            return None

        # 3. 检查市场状态
        if market_state not in [MarketState.TIGHT_CHANNEL, MarketState.BROAD_CHANNEL]:
            return None

        # 4. 检查 AI 方向
        if ai_direction != "AIL":  # 假设做多
            return None

        return Signal(
            type="高2",
            direction="LONG",
            entry_price=candles[-1].close,
            confidence=0.6,  # 强趋势 H2
            reason="Failed L1 + Second pullback in Bull Channel"
        )
```

---

### 4. backtest/stop_calculator.py — 止损计算

```python
class StopCalculator:
    def calculate_stop(
        self,
        signal: Signal,
        candles: list[Candle],
        swing_points: list[SwingPoint],
        market_state: MarketState
    ) -> float:
        """
        计算止损位置（必须在结构位外侧）

        Brooks 原则：
        - Bull: 止损在最近 major higher low 下方
        - Bear: 止损在最近 major lower high 上方
        - TR: 止损在 TR 边界外侧
        """

        if signal.direction == "LONG":
            # 找到最近的 major higher low
            major_hl = self._find_major_higher_low(swing_points)
            stop = major_hl.price - (major_hl.price * 0.001)  # 0.1% buffer

        elif signal.direction == "SHORT":
            # 找到最近的 major lower high
            major_lh = self._find_major_lower_high(swing_points)
            stop = major_lh.price + (major_lh.price * 0.001)

        # 验证止损距离
        stop_distance = abs(signal.entry_price - stop) / signal.entry_price

        if stop_distance < 0.002:  # < 0.2%
            # 止损太紧，不做
            return None

        if stop_distance > 0.02:  # > 2%
            # 止损太宽，降低仓位
            pass

        return stop
```

---

### 5. backtest/trader_equation.py — P×R 评估

```python
class TraderEquation:
    def evaluate(
        self,
        signal: Signal,
        stop_price: float,
        target_price: float,
        market_state: MarketState
    ) -> bool:
        """
        评估 P×R > (1-P)

        P 估算：
        - 强趋势 H2: 60%
        - 弱趋势 H2: 30%
        - TR 边缘: 60%
        - MTR: 40%

        R 计算：
        - R = (target - entry) / (entry - stop)
        """

        # 计算 R
        entry = signal.entry_price
        risk = abs(entry - stop_price)
        reward = abs(target_price - entry)
        R = reward / risk

        # 估算 P
        P = self._estimate_probability(signal, market_state)

        # 评估
        te_value = P * R
        te_threshold = 1 - P

        if te_value > te_threshold:
            return True
        else:
            return False

    def _estimate_probability(self, signal: Signal, market_state: MarketState) -> float:
        """
        根据信号类型和市场状态估算概率
        """

        if signal.type in ["高2", "低2"]:
            if market_state == MarketState.TIGHT_CHANNEL:
                return 0.6  # 强趋势
            elif market_state == MarketState.BROAD_CHANNEL:
                return 0.4  # 弱趋势
            else:
                return 0.3  # TR 中不做

        elif signal.type in ["双重顶", "双重底"]:
            if market_state == MarketState.TRADING_RANGE:
                return 0.6  # TR 边缘
            else:
                return 0.4  # 趋势中反转

        # ... 其他策略
```

---

### 6. backtest/position_manager.py — 持仓管理

```python
class PositionManager:
    def check_premise(
        self,
        position: Position,
        candles: list[Candle],
        market_state: MarketState,
        ai_direction: str
    ) -> PremiseCheckResult:
        """
        Premise Check（6 项检查）

        1. AI 方向是否反转
        2. 市场状态是否改变
        3. 信号 K 线是否被否定
        4. FT 质量如何
        5. TP 路径是否受阻
        6. 风险指标是否正常
        """

        # 1. AI 方向检查
        if position.direction == "LONG" and ai_direction == "AIS":
            return PremiseCheckResult(
                passed=False,
                action="CLOSE_POSITION",
                reason="AI direction reversed"
            )

        # 2. 市场状态检查
        if position.entry_state == MarketState.TIGHT_CHANNEL and market_state == MarketState.TRADING_RANGE:
            return PremiseCheckResult(
                passed=False,
                action="PARTIAL_CLOSE",
                reason="Market state changed to TR"
            )

        # ... 其他检查

        return PremiseCheckResult(passed=True)

    def check_strength(
        self,
        position: Position,
        candles: list[Candle],
        indicators: dict
    ) -> StrengthLevel:
        """
        Strength Check（7 项增强信号）

        1. Gap 保持打开
        2. 新 Major HL/LH 形成
        3. EMA 反弹干净
        4. Micro gap 未关闭
        5. PB 浅且有序
        6. 对手方形成楔形
        7. 多 TF 同向
        """

        strength_count = 0

        # 1. Gap 检查
        if indicators['open_gaps'] > indicators['filled_gaps']:
            strength_count += 1

        # 2. 新结构位
        if self._has_new_major_swing(position, indicators['swing_points']):
            strength_count += 1

        # ... 其他检查

        if strength_count >= 4:
            return StrengthLevel.HIGH
        elif strength_count >= 2:
            return StrengthLevel.MEDIUM
        else:
            return StrengthLevel.LOW
```

---

## 回测流程

```python
# backtest/engine.py
class BrooksBacktestEngine:
    def run(self, symbol: str, timeframe: str, start_date: str, end_date: str):
        """
        运行回测

        流程：
        1. 加载 K 线数据
        2. 计算所有指标（EMA/SR/Patterns/MM）
        3. 逐根 K 线遍历：
           a. 判断市场状态
           b. 判断 AI 方向
           c. 检查持仓（Premise + Strength）
           d. 扫描所有策略生成信号
           e. 评估 P×R
           f. 计算止损（结构位）
           g. 执行交易
        4. 生成报告
        """

        # 1. 加载数据
        candles = self.load_candles(symbol, timeframe, start_date, end_date)

        # 2. 计算指标
        ema_values = calculate_ema(candles)
        swing_points = identify_swing_points(candles)

        # 3. 逐根遍历
        for i in range(100, len(candles)):  # 前 100 根用于初始化
            current_candles = candles[:i+1]

            # a. 判断市场状态
            market_state = self.state_detector.detect(current_candles, ema_values[:i+1])
            ai_direction = self.state_detector.detect_ai_direction(current_candles, ema_values[:i+1])

            # b. 检查持仓
            for position in self.open_positions:
                premise_result = self.position_manager.check_premise(
                    position, current_candles, market_state, ai_direction
                )

                if not premise_result.passed:
                    self.close_position(position, premise_result.reason)
                    continue

                strength = self.position_manager.check_strength(position, current_candles, indicators)

                # 根据 strength 调整管理
                if strength == StrengthLevel.LOW:
                    self.tighten_stop(position)

            # c. 扫描信号
            for strategy in self.strategies:
                signal = strategy.detect_signal(
                    current_candles,
                    ema_values[:i+1],
                    market_state,
                    ai_direction
                )

                if signal is None:
                    continue

                # d. 计算止损
                stop_price = self.stop_calculator.calculate_stop(
                    signal, current_candles, swing_points, market_state
                )

                if stop_price is None:
                    continue  # 止损太紧，不做

                # e. 计算目标
                target_price = self.calculate_target(signal, swing_points)

                # f. 评估 P×R
                if not self.trader_equation.evaluate(signal, stop_price, target_price, market_state):
                    continue  # TE 不达标

                # g. 执行交易
                self.open_position(signal, stop_price, target_price)

        # 4. 生成报告
        return self.generate_report()
```

---

## 关键差异对比

| 维度 | 旧系统 | 新系统（Brooks Pure） |
|------|--------|---------------------|
| **止损** | 固定 ATR 倍数 | 结构位外侧（major HL/LH） |
| **H2/L2** | 第二次触及 EMA | 反转失败后的第二次机会 |
| **P 估算** | 固定 0.4 | 根据市场状态动态（0.3-0.6） |
| **R 计算** | 固定 2.0 | 根据 MM 和 S/R 动态 |
| **持仓管理** | 固定 TP/SL | Premise + Strength Check |
| **信号过滤** | 后置路由 | 前置生成（只生成该状态允许的） |

---

## 实施步骤

1. **清理 indicators/batch**
   - 删除所有非 Brooks 语义的计算
   - 重写 EMA/SR/Patterns/MM 模块

2. **实现 10+ 策略**
   - H1/L1, H2/L2, EMA PB
   - DT/DB, Wedge
   - Failed BO, 2nd Leg Trap
   - Buy The Close, MAG, BLSHS

3. **实现止损计算**
   - 结构位识别
   - Major vs Minor swing
   - TR 边界识别

4. **实现持仓管理**
   - Premise Check（6 项）
   - Strength Check（7 项）
   - 动态 SL/TP 调整

5. **运行回测**
   - 4 品种 × 3 周期
   - 验证目标：胜率 85%+，日均 50+，PF 1.5+

---

## 预期结果

如果严格遵循 Brooks 原则：

- **胜率**：60-70%（不是 85%，Brooks 说最好的 setup 也只有 60%）
- **日均交易**：50+（3 品种 × 3 周期 = 每天数十个候选）
- **盈利因子**：1.5-2.0（P×R > 1-P 保证）

**注意**：85% 胜率不现实。Brooks 说：
> "The best setups have only 60% probability. If you think you have 85%, you're either lying or not taking enough trades."

合理目标应该是：
- 胜率：55-65%
- 日均交易：30-50
- 盈利因子：1.5-2.5
