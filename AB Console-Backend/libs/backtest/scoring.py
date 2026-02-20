"""
评分系统 — 基于 Al Brooks 价格行为学校正版 (V2)

五维打分 (满分 100):
  1. 趋势强度 (0-20)  — 急速18/趋势15/区间-反转12/观望8
  2. 信号质量 (0-20)  — strength≥85:17 / 80-84:15 / 75-79:13 / 65-74:9
  3. 策略匹配 (0-25)  — strength≥85:22 / 80-84:19 / 75-79:16
  4. 盈亏比 (0-20)    — RR≥3:20 / ≥2:16 / ≥1.5:12 / ≥1:10
  5. 风险因素 (0-15)  — 当日亏损次数扣分

强制扣分项:
  A. 大周期背景 — 区分顺势/反转策略
     · 顺势策略逆大周期: -15（严格）
     · 反转策略逆大周期: -10（Al Brooks M40: MTR胜率40%，反转是合法策略）
     · 逆4h方向: -5（从-10降低，4h背景重要但不绝对）
  B. 盈亏比一票否决（< 0.1:1 → 归零）
  C. 进化记录（今日止损次数、策略历史胜率）

V2修改说明 (2026-02-19):
  - quality score: 80-84档从13→15，填补70-79得分空白
    理由：H2/L2基础强度82，顺势时应轻易通过（Al Brooks: H2=最高概率入场）
  - 反转策略逆大周期扣分-10而非-15（Al Brooks M40: MTR/双顶底是趋势末端合法反转）
  - 逆4h扣分-5而非-10（减少对高质量信号的额外惩罚）
"""

from .background import BackgroundContext


class ScoringEngine:
    """评分引擎"""

    def score_signal(self, signal, background: BackgroundContext,
                     daily_losses: dict, strategy_history: dict) -> tuple[int, list[str]]:
        """
        对信号打分

        Args:
            signal: PA 信号（需要 .direction, .strength, .signal_type, .cycle,
                           .price, .stop_loss, .take_profit 属性）
            background: 大周期背景
            daily_losses: {symbol: 今日止损次数}
            strategy_history: {strategy_name: {"trades": N, "wins": N}}

        Returns:
            (总分, 扣分原因列表)
        """
        reasons = []

        # === 五维打分 ===
        trend_score = self._score_trend(signal)
        quality_score = self._score_quality(signal)
        match_score = self._score_match(signal)
        rr_score, rr_ratio = self._score_rr(signal)
        risk_score = self._score_risk(signal, daily_losses)

        base_total = trend_score + quality_score + match_score + rr_score + risk_score

        # === B. 盈亏比一票否决 ===
        if rr_ratio < 0.1:
            reasons.append(f"盈亏比{rr_ratio:.1f}:1 < 0.1:1 → 总分归零")
            return 0, reasons

        # === A. 大周期背景扣分 ===
        # Al Brooks: 反转策略（双重顶底/楔形/看衰突破）是趋势末端的合法反转
        # 顺势策略逆势: -15（严格）；反转策略逆势: -10（Al Brooks M40 MTR胜率40%）
        _REVERSAL_STRATS = {
            "双重顶", "双重底", "楔形顶", "楔形底",
            "看衰突破", "末端旗形", "急速通道",
        }
        is_reversal = signal.signal_type in _REVERSAL_STRATS

        bg_deduction = 0
        if signal.direction == "BUY" and "空头" in background.background:
            if is_reversal:
                bg_deduction = 10
                reasons.append("反转策略逆大周期做多(空头背景) -10")
            else:
                bg_deduction = 15
                reasons.append("逆大周期做多(空头背景) -15")
        elif signal.direction == "SELL" and "多头" in background.background:
            if is_reversal:
                bg_deduction = 10
                reasons.append("反转策略逆大周期做空(多头背景) -10")
            else:
                bg_deduction = 15
                reasons.append("逆大周期做空(多头背景) -15")

        # Al Brooks: 4h背景重要但不绝对，高质量信号应有空间（-5而非-10）
        if signal.direction == "BUY" and background.h4_trend == "空头":
            bg_deduction += 5
            reasons.append("逆4h方向做多 -5")
        elif signal.direction == "SELL" and background.h4_trend == "多头":
            bg_deduction += 5
            reasons.append("逆4h方向做空 -5")

        # Al Brooks: CycleIdentifier 已做策略许可矩阵过滤
        # 只在震荡背景中惩罚纯趋势策略，中性背景不再惩罚
        trend_strategies = {"收线追进", "高1", "低1", "20均线缺口", "突破回调"}
        if "震荡" in background.background and signal.signal_type in trend_strategies:
            bg_deduction += 10
            reasons.append(f"震荡背景使用趋势策略({signal.signal_type}) -10")

        # Al Brooks: H1/L1 是合理的趋势回调策略，不再硬扣分
        # 改为仅在不利市场状态下轻微扣分（已被上面的背景扣分覆盖）

        # === C. 进化记录扣分 ===
        evo_deduction = 0
        symbol_losses = daily_losses.get(signal.symbol, 0)
        if symbol_losses >= 2:
            evo_deduction += 15
            reasons.append(f"{signal.symbol}今日已止损{symbol_losses}次 -15")
        elif symbol_losses == 1:
            evo_deduction += 5
            reasons.append(f"{signal.symbol}今日已止损1次 -5")

        strat_key = signal.signal_type
        strat_stats = strategy_history.get(strat_key, {})
        strat_trades = strat_stats.get("trades", 0)
        strat_wins = strat_stats.get("wins", 0)
        if strat_trades >= 5:
            win_rate = strat_wins / strat_trades * 100
            if win_rate < 30:
                evo_deduction += 10
                reasons.append(f"策略{strat_key}近{strat_trades}笔胜率{win_rate:.0f}% -10")

        final_score = max(0, base_total - bg_deduction - evo_deduction)
        return final_score, reasons

    def _score_trend(self, signal) -> int:
        """趋势强度打分 (0-20)
        Al Brooks: CycleIdentifier 已通过策略许可矩阵过滤
        如果信号到达这里，说明策略在当前市场状态下是被允许的

        V3: 反转策略提升到15（原来12）
        理由: Al Brooks MTR/末端旗形/楔形 是专门识别趋势末端的高概率策略
        它们的存在本身就是在最正确的时机（趋势末端），不应得分低于趋势策略
        Al Brooks M40: MTR胜率40%但RR极佳，是完整交易策略的一部分
        """
        cycle = getattr(signal, "cycle", "")
        if "急速" in cycle:
            return 18
        elif "趋势" in cycle:
            return 15
        elif "区间" in cycle:
            return 12  # 区间策略被 CycleIdentifier 许可, 不过度惩罚
        elif "反转" in cycle:
            return 15  # V3: 12→15，Al Brooks反转策略是趋势末端专项策略
        return 8  # 观望状态给基础分

    def _score_quality(self, signal) -> int:
        """信号质量打分 (0-20)
        V2: 80-84档从13→15，区分普通(75-79)vs良好(80-84)vs优秀(85+)
        理由: H2/L2基础强度=82，在顺势背景中应得到更好的质量评分
        """
        s = signal.strength
        if s >= 85:
            return 17
        elif s >= 80:
            return 15  # V2: 80-84档从13提升到15
        elif s >= 75:
            return 13
        elif s >= 65:
            return 9
        return 5

    def _score_match(self, signal) -> int:
        """策略匹配度打分 (0-25)"""
        s = signal.strength
        if s >= 85:
            return 22
        elif s >= 80:
            return 19
        elif s >= 75:
            return 16
        return 12

    def _score_rr(self, signal) -> tuple[int, float]:
        """盈亏比打分 (0-20)"""
        risk = abs(signal.price - signal.stop_loss)
        reward = abs(signal.take_profit - signal.price)
        if risk == 0:
            return 0, 0.0
        rr = reward / risk
        if rr >= 3.0:
            return 20, rr
        elif rr >= 2.0:
            return 16, rr
        elif rr >= 1.5:
            return 12, rr
        elif rr >= 1.0:
            return 10, rr
        elif rr >= 0.5:
            return 6, rr
        elif rr >= 0.2:
            return 3, rr
        return 1, rr

    def _score_risk(self, signal, daily_losses: dict) -> int:
        """风险因素打分 (0-15)"""
        score = 15
        total_losses = sum(daily_losses.values())
        if total_losses >= 3:
            score -= 10
        elif total_losses >= 2:
            score -= 5
        return max(0, score)
