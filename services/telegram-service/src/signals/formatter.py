"""
信号模板格式化器
生成完整的信号推送消息
"""
from typing import Dict, Optional, Any, Callable
from datetime import datetime
import time

# i18n 支持 - 延迟导入避免循环依赖
_t_func: Optional[Callable] = None

def _get_t():
    """获取翻译函数"""
    global _t_func
    if _t_func is None:
        try:
            from libs.common.i18n import I18N
            _t_func = lambda key, lang=None: I18N.gettext(key, lang=lang) or key
        except Exception:
            _t_func = lambda key, lang=None: key
    return _t_func

def _t(key: str, lang: str = None) -> str:
    """翻译函数"""
    return _get_t()(key, lang)


def strength_bar(value: float, max_val: float = 100) -> str:
    """生成强度条"""
    if value is None:
        return "░░░░░░░░░░"
    pct = min(max(value / max_val, 0), 1)
    filled = int(pct * 10)
    return "█" * filled + "░" * (10 - filled)


def fmt_price(val: Any) -> str:
    """格式化价格"""
    if val is None:
        return "-"
    try:
        v = float(val)
        if v >= 1000:
            return f"${v:,.0f}"
        elif v >= 1:
            return f"${v:.2f}"
        else:
            return f"${v:.4f}"
    except Exception:
        return str(val)


def fmt_pct(val: Any, with_sign: bool = True) -> str:
    """格式化百分比"""
    if val is None:
        return "-"
    try:
        v = float(val)
        if with_sign and v > 0:
            return f"+{v:.2f}%"
        return f"{v:.2f}%"
    except Exception:
        return str(val)


def fmt_vol(val: Any) -> str:
    """格式化成交额"""
    if val is None:
        return "-"
    try:
        v = float(val)
        if v >= 1e9:
            return f"${v/1e9:.2f}B"
        elif v >= 1e6:
            return f"${v/1e6:.1f}M"
        elif v >= 1e3:
            return f"${v/1e3:.0f}K"
        return f"${v:.0f}"
    except Exception:
        return str(val)


def fmt_num(val: Any, decimals: int = 2) -> str:
    """格式化数字"""
    if val is None:
        return "-"
    try:
        v = float(val)
        if decimals == 0:
            return f"{v:,.0f}"
        return f"{v:.{decimals}f}"
    except Exception:
        return str(val)


def fmt_change(prev: Any, curr: Any) -> str:
    """格式化变化百分比"""
    if prev is None or curr is None:
        return ""
    try:
        p, c = float(prev), float(curr)
        if p == 0:
            return ""
        pct = (c - p) / abs(p) * 100
        if pct > 0:
            return f"(+{pct:.1f}%)"
        return f"({pct:.1f}%)"
    except Exception:
        return ""


def fmt_arrow(prev: Any, curr: Any) -> str:
    """格式化前值箭头"""
    if prev is None:
        return str(curr) if curr is not None else "-"
    return f"{prev} ⏩ {curr}"


class SignalFormatter:
    """信号格式化器"""

    def __init__(self):
        self.last_trigger: Dict[str, float] = {}  # {rule_symbol_tf: timestamp}

    def format_signal(
        self,
        symbol: str,
        direction: str,
        rule_name: str,
        timeframe: str,
        strength: int,
        curr_data: Dict[str, Dict[str, Any]],
        prev_data: Optional[Dict[str, Dict[str, Any]]] = None,
        rule_message: str = "",
        lang: str = None
    ) -> str:
        """
        格式化完整信号消息
        
        Args:
            symbol: 交易对
            direction: BUY/SELL/ALERT
            rule_name: 规则名称
            timeframe: 周期
            strength: 强度 0-100
            curr_data: 当前数据 {table: {field: value}}
            prev_data: 前值数据 {table: {field: value}}
            rule_message: 规则消息
            lang: 语言代码
        """
        t = lambda k: _t(k, lang)
        icon = {"BUY": "🟢", "SELL": "🔴", "ALERT": "⚠️"}.get(direction, "📊")

        # 获取各表数据
        basic = curr_data.get("基础数据同步器.py", {})
        basic_prev = (prev_data or {}).get("基础数据同步器.py", {})
        futures = curr_data.get("期货情绪聚合表.py", {})
        futures_prev = (prev_data or {}).get("期货情绪聚合表.py", {})
        rsi = curr_data.get("智能RSI扫描器.py", {})
        rsi_prev = (prev_data or {}).get("智能RSI扫描器.py", {})
        kdj = curr_data.get("KDJ随机指标扫描器.py", {})
        curr_data.get("MACD柱状扫描器.py", {})
        (prev_data or {}).get("MACD柱状扫描器.py", {})
        boll = curr_data.get("布林带扫描器.py", {})
        obv = curr_data.get("OBV能量潮扫描器.py", {})
        obv_prev = (prev_data or {}).get("OBV能量潮扫描器.py", {})
        cvd = curr_data.get("CVD信号排行榜.py", {})
        vol_ratio = curr_data.get("成交量比率扫描器.py", {})
        vol_ratio_prev = (prev_data or {}).get("成交量比率扫描器.py", {})
        sr = curr_data.get("全量支撑阻力扫描器.py", {})
        st = curr_data.get("SuperTrend.py", {})
        st_prev = (prev_data or {}).get("SuperTrend.py", {})
        precise = curr_data.get("超级精准趋势扫描器.py", {})
        curr_data.get("Ichimoku.py", {})
        smc = curr_data.get("大资金操盘扫描器.py", {})
        pattern = curr_data.get("K线形态扫描器.py", {})
        atr = curr_data.get("ATR波幅扫描器.py", {})
        atr_prev = (prev_data or {}).get("ATR波幅扫描器.py", {})
        liquidity = curr_data.get("流动性扫描器.py", {})
        scalp = curr_data.get("剥头皮信号扫描器.py", {})

        # 构建消息
        lines = [f"{icon} {direction} {symbol}", ""]

        # 💰 行情
        price = basic.get("当前价格") or basic.get("收盘价")
        price_prev = basic_prev.get("当前价格") or basic_prev.get("收盘价")
        lines.append(t("signal.section.market"))
        lines.append(f"├ {t('signal.field.price')}: {fmt_price(price_prev)} ⏩ {fmt_price(price)} {fmt_change(price_prev, price)}")
        lines.append(f"├ {t('signal.field.amplitude')}: {fmt_pct(basic.get('振幅'), False)}")

        ratio = basic.get("主动买卖比")
        ratio_prev = basic_prev.get("主动买卖比")
        ratio_label = t("signal.label.buy_dominant") if (ratio or 1) > 1.1 else (t("signal.label.sell_dominant") if (ratio or 1) < 0.9 else t("signal.label.balanced"))
        lines.append(f"├ {t('signal.field.buy_sell_ratio')}: {fmt_num(ratio_prev)} ⏩ {fmt_num(ratio)} {fmt_change(ratio_prev, ratio)} {ratio_label}")
        lines.append(f"├ {t('signal.field.volume')}: {fmt_vol(basic.get('成交额'))}")
        lines.append(f"├ {t('signal.field.net_inflow')}: {fmt_vol(basic.get('资金流向'))}")
        lines.append(f"└ {t('signal.field.trade_count')}: {fmt_num(basic.get('交易次数'), 0)}")
        lines.append("")

        # 📊 合约
        if futures:
            lines.append(t("signal.section.futures"))
            lines.append(f"├ {t('signal.field.position')}: {fmt_vol(futures.get('持仓金额'))} ({fmt_pct(futures.get('持仓变动%'))})")

            big_ratio = futures.get("大户多空比")
            big_prev = futures_prev.get("大户多空比")
            lines.append(f"├ {t('signal.field.big_ls')}: {fmt_num(big_prev)} ⏩ {fmt_num(big_ratio)} {fmt_change(big_prev, big_ratio)}")

            all_ratio = futures.get("全体多空比")
            all_prev = futures_prev.get("全体多空比")
            lines.append(f"├ {t('signal.field.all_ls')}: {fmt_num(all_prev)} ⏩ {fmt_num(all_ratio)} {fmt_change(all_prev, all_ratio)}")

            taker = futures.get("主动成交多空比")
            taker_prev = futures_prev.get("主动成交多空比")
            lines.append(f"├ {t('signal.field.taker_ls')}: {fmt_num(taker_prev)} ⏩ {fmt_num(taker)} {fmt_change(taker_prev, taker)}")

            lines.append(f"├ {t('signal.field.sentiment_diff')}: {fmt_num(futures.get('情绪差值'))}")
            lines.append(f"├ {t('signal.field.risk_score')}: {strength_bar(futures.get('风险分'))} {fmt_num(futures.get('风险分'), 0)}")
            lines.append(f"├ {t('signal.field.oi_streak')}: {futures.get('OI连续根数')}{t('signal.field.bars')}")
            lines.append(f"└ {t('signal.field.sentiment_momentum')}: {t('signal.field.big')}{fmt_num(futures.get('大户情绪动量'))} {t('signal.field.taker')}{fmt_num(futures.get('主动情绪动量'))}")
            lines.append("")

        # 📉 动量
        lines.append(t("signal.section.momentum"))
        adx = curr_data.get("ADX.py", {})
        adx_val = adx.get("ADX")
        di_label = "+DI>-DI" if (adx.get("正向DI") or 0) > (adx.get("负向DI") or 0) else "-DI>+DI"
        lines.append(f"├ ADX: {strength_bar(adx_val, 50)} {fmt_num(adx_val)} {di_label}")

        cci = curr_data.get("CCI.py", {})
        lines.append(f"├ CCI: {fmt_num(cci.get('CCI'))}")

        wr = curr_data.get("WilliamsR.py", {})
        lines.append(f"├ WR: {fmt_num(wr.get('WilliamsR'))}")

        mfi = curr_data.get("MFI资金流量扫描器.py", {})
        lines.append(f"├ MFI: {strength_bar(mfi.get('MFI值'))} {fmt_num(mfi.get('MFI值'))}")

        lines.append(f"├ KDJ: J={fmt_num(kdj.get('J值'))} K={fmt_num(kdj.get('K值'))} D={fmt_num(kdj.get('D值'))}")

        if rsi:
            rsi7 = rsi.get("RSI7")
            rsi7_prev = rsi_prev.get("RSI7")
            lines.append(f"├ RSI7: {fmt_num(rsi7_prev)} ⏩ {fmt_num(rsi7)} {fmt_change(rsi7_prev, rsi7)}")
            lines.append(f"├ {t('signal.field.rsi_position')}: {rsi.get('位置', '-')}")
            lines.append(f"└ {t('signal.field.rsi_divergence')}: {rsi.get('背离', t('signal.label.none'))}")
        lines.append("")

        # 📊 量价
        lines.append(t("signal.section.volume"))
        obv_val = obv.get("OBV值")
        obv_prev_val = obv_prev.get("OBV值")
        lines.append(f"├ OBV: {fmt_num(obv_prev_val)} ⏩ {fmt_num(obv_val)} {fmt_change(obv_prev_val, obv_val)}")
        lines.append(f"├ CVD: {fmt_num(cvd.get('CVD值'))}")

        vr = vol_ratio.get("量比")
        vr_prev = vol_ratio_prev.get("量比")
        vr_label = t("signal.label.high_volume") if (vr or 0) > 1.5 else (t("signal.label.low_volume") if (vr or 0) < 0.7 else "")
        lines.append(f"├ {t('signal.field.vol_ratio')}: {fmt_num(vr_prev)} ⏩ {fmt_num(vr)} {fmt_change(vr_prev, vr)} {vr_label}")

        ha = curr_data.get("多空信号扫描器.py", {})
        bull = ha.get("多头比例") or 50
        lines.append(f"└ {t('signal.field.bull_bear_power')}: {t('signal.field.bull') if bull > 50 else t('signal.field.bear')}{strength_bar(bull if bull > 50 else 100-bull)} {fmt_num(bull, 0)}%")
        lines.append("")

        # 📍 关键位
        lines.append(t("signal.section.key_levels"))
        lines.append(f"├ {t('signal.field.support')}: {fmt_price(sr.get('支撑位'))} ({t('signal.field.distance')}{fmt_pct(sr.get('距支撑百分比'), False)})")
        lines.append(f"├ {t('signal.field.resistance')}: {fmt_price(sr.get('阻力位'))} ({t('signal.field.distance')}{fmt_pct(sr.get('距阻力百分比'), False)})")
        lines.append(f"└ Boll%b: {fmt_num(boll.get('百分比b'))}")
        lines.append("")

        # 📈 趋势
        lines.append(t("signal.section.trend"))
        st_dir = st.get("方向")
        st_prev_dir = st_prev.get("方向")
        lines.append(f"├ SuperTrend: {st_prev_dir} ⏩ {st_dir}" if st_prev_dir != st_dir else f"├ SuperTrend: {st_dir}")

        lines.append(f"├ {t('signal.field.precise_trend')}: {precise.get('趋势方向')} {strength_bar(precise.get('趋势强度'))} {fmt_num(precise.get('趋势强度'), 0)}")
        lines.append(f"└ {t('signal.field.volume_bias')}: {precise.get('量能偏向', '-')}")
        lines.append("")

        # 🏦 智能资金
        if smc:
            lines.append(t("signal.section.smart_money"))
            lines.append(f"├ {t('signal.field.bias')}: {smc.get('偏向', '-')}")
            ob_up = smc.get("订单块上沿")
            ob_down = smc.get("订单块下沿")
            if ob_up and ob_down:
                lines.append(f"├ {t('signal.field.order_block')}: {fmt_price(ob_down)}-{fmt_price(ob_up)}")
            lines.append(f"├ {t('signal.field.gap')}: {smc.get('缺口类型', '-')}")
            lines.append(f"├ {t('signal.field.structure')}: {smc.get('结构事件', '-')}")
            lines.append(f"└ {t('signal.field.score')}: {strength_bar(smc.get('评分'))} {fmt_num(smc.get('评分'), 0)}")
            lines.append("")

        # 🕯️ K线形态
        if pattern and pattern.get("形态类型"):
            lines.append(t("signal.section.pattern"))
            lines.append(f"├ {t('signal.field.pattern_type')}: {pattern.get('形态类型', '-')}")
            lines.append(f"├ {t('signal.field.pattern_count')}: {pattern.get('检测数量', 0)}{t('signal.field.count_unit')}")
            lines.append(f"└ {t('signal.field.strength')}: {strength_bar(pattern.get('强度'))} {fmt_num(pattern.get('强度'), 0)}")
            lines.append("")

        # ⚡ 波动
        lines.append(t("signal.section.volatility"))
        atr_pct = atr.get("ATR百分比")
        atr_pct_prev = atr_prev.get("ATR百分比")
        lines.append(f"├ {t('signal.field.atr_pct')}: {fmt_pct(atr_pct_prev, False)} ⏩ {fmt_pct(atr_pct, False)} {fmt_change(atr_pct_prev, atr_pct)}")
        lines.append(f"├ {t('signal.field.volatility')}: {atr.get('波动分类', '-')}")
        lines.append(f"└ {t('signal.field.liquidity')}: {strength_bar(liquidity.get('流动性得分'))} {fmt_num(liquidity.get('流动性得分'), 0)}")
        lines.append("")

        # 🎯 剥头皮
        if scalp:
            lines.append(t("signal.section.scalp"))
            lines.append(f"├ {t('signal.field.scalp_signal')}: {scalp.get('剥头皮信号', '-')}")
            lines.append(f"└ RSI: {fmt_num(scalp.get('RSI'))}")
            lines.append("")

        # 📌 信号详情
        lines.append(f"📌 {rule_name}")
        lines.append(f"├ {t('signal.field.timeframe')}: {timeframe}")
        lines.append(f"├ {t('signal.field.strength')}: {strength_bar(strength)} {strength}")
        if rule_message:
            lines.append(f"└ 📝 {rule_message}")
        lines.append("")

        # 时间
        now = datetime.now()
        lines.append(f"⏰ {now.strftime('%Y-%m-%d %H:%M')}")

        # 上次触发
        key = f"{rule_name}_{symbol}_{timeframe}"
        last = self.last_trigger.get(key)
        if last:
            delta = int(time.time() - last)
            hours = delta // 3600
            mins = (delta % 3600) // 60
            lines.append(f"🔄 {t('signal.field.last_trigger')}: {hours}h{mins}m{t('signal.field.ago')}")

        self.last_trigger[key] = time.time()

        return "\n".join(lines)

    def format_simple(
        self,
        symbol: str,
        direction: str,
        rule_name: str,
        timeframe: str,
        strength: int,
        price: float,
        message: str,
        lang: str = None
    ) -> str:
        """简化版信号格式"""
        t = lambda k: _t(k, lang)
        icon = {"BUY": "🟢", "SELL": "🔴", "ALERT": "⚠️"}.get(direction, "📊")

        return f"""
{icon} {direction} | {symbol}

📌 {rule_name}
⏱ {t('signal.simple.timeframe')}: {timeframe}
💰 {t('signal.simple.price')}: {fmt_price(price)}
📊 {t('signal.simple.strength')}: {strength_bar(strength)} {strength}%

💬 {message}
"""


# 单例
_formatter: Optional[SignalFormatter] = None

def get_formatter() -> SignalFormatter:
    global _formatter
    if _formatter is None:
        _formatter = SignalFormatter()
    return _formatter
