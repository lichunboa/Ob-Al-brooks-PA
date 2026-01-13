/**
 * 市场状态机 (Market State Machine)
 * 
 * 功能:
 * 1. 从市场周期推断当前市场状态
 * 2. 生成预测性建议 (下一步该看什么)
 * 3. 提供策略推荐和警告
 */

/**
 * 市场状态类型
 */
export type MarketState =
    | "strong_trend_bull"    // 强多头趋势
    | "strong_trend_bear"    // 强空头趋势
    | "weak_trend_bull"      // 弱多头趋势
    | "weak_trend_bear"      // 弱空头趋势
    | "tight_range"          // 紧密区间
    | "broad_range"          // 宽幅区间
    | "breakout_bull"        // 多头突破
    | "breakout_bear"        // 空头突破
    | "unknown";             // 未知

/**
 * 关键位类型
 */
export interface KeyLevel {
    type: "support" | "resistance" | "magnet";
    level: string;
    description: string;
}

/**
 * 预测性建议
 */
export interface PredictiveGuidance {
    state: MarketState;
    stateLabel: string; // 中文标签

    // 预期行为
    expectation: string; // "预期: 等待H1/H2回调"

    // 警告
    warnings: string[]; // ["⚠️ 警告: 切勿逆势做空"]

    // 推荐策略
    recommendedStrategies: string[]; // ["H1/H2", "Wedge"]

    // 禁止策略
    forbiddenStrategies: string[]; // ["Counter-trend"]

    // 关键位
    keyLevels: KeyLevel[];

    // 色调 (用于UI显示)
    tone: "success" | "warning" | "danger" | "info";
}

/**
 * 市场状态映射表
 */
const STATE_MAP: Record<string, MarketState> = {
    // 强趋势
    "强多头趋势": "strong_trend_bull",
    "强牛市": "strong_trend_bull",
    "Strong Bull Trend": "strong_trend_bull",
    "强空头趋势": "strong_trend_bear",
    "强熊市": "strong_trend_bear",
    "Strong Bear Trend": "strong_trend_bear",

    // 弱趋势
    "弱多头趋势": "weak_trend_bull",
    "弱牛市": "weak_trend_bull",
    "Weak Bull Trend": "weak_trend_bull",
    "弱空头趋势": "weak_trend_bear",
    "弱熊市": "weak_trend_bear",
    "Weak Bear Trend": "weak_trend_bear",

    // 区间
    "紧密区间": "tight_range",
    "窄幅震荡": "tight_range",
    "Tight Range": "tight_range",
    "宽幅区间": "broad_range",
    "宽幅震荡": "broad_range",
    "Broad Range": "broad_range",
    "Trading Range": "broad_range",

    // 突破
    "多头突破": "breakout_bull",
    "向上突破": "breakout_bull",
    "Bull Breakout": "breakout_bull",
    "空头突破": "breakout_bear",
    "向下突破": "breakout_bear",
    "Bear Breakout": "breakout_bear",
};

/**
 * 状态标签映射
 */
const STATE_LABELS: Record<MarketState, string> = {
    strong_trend_bull: "🚀 强多头趋势",
    strong_trend_bear: "📉 强空头趋势",
    weak_trend_bull: "📈 弱多头趋势",
    weak_trend_bear: "📊 弱空头趋势",
    tight_range: "🔒 紧密区间",
    broad_range: "📏 宽幅区间",
    breakout_bull: "💥 多头突破",
    breakout_bear: "⚡ 空头突破",
    unknown: "❓ 未知状态",
};

/**
 * 市场状态机
 */
export class MarketStateMachine {
    /**
     * 从市场周期推断状态
     */
    inferState(marketCycle: string | undefined): MarketState {
        if (!marketCycle) return "unknown";

        const normalized = marketCycle.trim();

        // 精确匹配
        if (STATE_MAP[normalized]) {
            return STATE_MAP[normalized];
        }

        // 模糊匹配
        const lower = normalized.toLowerCase();

        // 强趋势
        if (lower.includes("强") && (lower.includes("多") || lower.includes("牛") || lower.includes("bull"))) {
            return "strong_trend_bull";
        }
        if (lower.includes("强") && (lower.includes("空") || lower.includes("熊") || lower.includes("bear"))) {
            return "strong_trend_bear";
        }

        // 弱趋势
        if (lower.includes("弱") && (lower.includes("多") || lower.includes("牛") || lower.includes("bull"))) {
            return "weak_trend_bull";
        }
        if (lower.includes("弱") && (lower.includes("空") || lower.includes("熊") || lower.includes("bear"))) {
            return "weak_trend_bear";
        }

        // 区间
        if (lower.includes("紧密") || lower.includes("窄") || lower.includes("tight")) {
            return "tight_range";
        }
        if (lower.includes("区间") || lower.includes("震荡") || lower.includes("range")) {
            return "broad_range";
        }

        // 突破
        if (lower.includes("突破")) {
            if (lower.includes("多") || lower.includes("牛") || lower.includes("向上") || lower.includes("bull")) {
                return "breakout_bull";
            }
            if (lower.includes("空") || lower.includes("熊") || lower.includes("向下") || lower.includes("bear")) {
                return "breakout_bear";
            }
        }

        return "unknown";
    }

    /**
     * 生成预测性建议
     */
    generateGuidance(
        state: MarketState,
        context?: {
            alwaysIn?: string; // 总是方向
            dayType?: string; // 日内类型
        }
    ): PredictiveGuidance {
        const stateLabel = STATE_LABELS[state];

        switch (state) {
            case "strong_trend_bull":
                return {
                    state,
                    stateLabel,
                    expectation: "预期: 等待H1/H2回调入场,或突破新高后的旗形继续",
                    warnings: [
                        "⚠️ 警告: 切勿逆势做空",
                        "⚠️ 警告: 避免在顶部追多 (等待回调)",
                        "⚠️ 警告: 不要过早止盈 (趋势可能持续)"
                    ],
                    recommendedStrategies: ["H1/H2", "Wedge", "Flag", "MTR"],
                    forbiddenStrategies: ["Counter-trend", "Reversal", "Fade"],
                    keyLevels: [
                        { type: "support", level: "昨日高点 (HOD)", description: "回调支撑位" },
                        { type: "support", level: "EMA20", description: "趋势支撑" },
                        { type: "magnet", level: "整数关口", description: "可能的目标位" }
                    ],
                    tone: "success"
                };

            case "strong_trend_bear":
                return {
                    state,
                    stateLabel,
                    expectation: "预期: 等待L1/L2反弹入场,或跌破新低后的旗形继续",
                    warnings: [
                        "⚠️ 警告: 切勿逆势做多",
                        "⚠️ 警告: 避免在底部追空 (等待反弹)",
                        "⚠️ 警告: 不要过早止盈 (趋势可能持续)"
                    ],
                    recommendedStrategies: ["L1/L2", "Wedge", "Flag", "MTR"],
                    forbiddenStrategies: ["Counter-trend", "Reversal", "Fade"],
                    keyLevels: [
                        { type: "resistance", level: "昨日低点 (LOD)", description: "反弹阻力位" },
                        { type: "resistance", level: "EMA20", description: "趋势阻力" },
                        { type: "magnet", level: "整数关口", description: "可能的目标位" }
                    ],
                    tone: "danger"
                };

            case "weak_trend_bull":
                return {
                    state,
                    stateLabel,
                    expectation: "预期: 趋势较弱,可能转为区间。等待更强信号或回调",
                    warnings: [
                        "⚠️ 警告: 趋势不强,避免重仓",
                        "⚠️ 警告: 随时准备转为区间交易思维",
                        "⚠️ 警告: 止盈目标不宜过高"
                    ],
                    recommendedStrategies: ["H1/H2", "Scalp", "Quick Exit"],
                    forbiddenStrategies: ["Swing", "Position"],
                    keyLevels: [
                        { type: "support", level: "近期低点", description: "关键支撑" },
                        { type: "resistance", level: "近期高点", description: "突破目标" }
                    ],
                    tone: "warning"
                };

            case "weak_trend_bear":
                return {
                    state,
                    stateLabel,
                    expectation: "预期: 趋势较弱,可能转为区间。等待更强信号或反弹",
                    warnings: [
                        "⚠️ 警告: 趋势不强,避免重仓",
                        "⚠️ 警告: 随时准备转为区间交易思维",
                        "⚠️ 警告: 止盈目标不宜过高"
                    ],
                    recommendedStrategies: ["L1/L2", "Scalp", "Quick Exit"],
                    forbiddenStrategies: ["Swing", "Position"],
                    keyLevels: [
                        { type: "resistance", level: "近期高点", description: "关键阻力" },
                        { type: "support", level: "近期低点", description: "突破目标" }
                    ],
                    tone: "warning"
                };

            case "tight_range":
                return {
                    state,
                    stateLabel,
                    expectation: "预期: 等待突破或在区间边界交易。避免在中间位置交易",
                    warnings: [
                        "⚠️ 警告: 趋势交易者应观望,等待突破",
                        "⚠️ 警告: 假突破频繁,止损要紧",
                        "⚠️ 警告: 避免频繁交易 (手续费侵蚀利润)"
                    ],
                    recommendedStrategies: ["Range Fade", "Breakout (谨慎)", "Scalp"],
                    forbiddenStrategies: ["Trend Following", "Swing"],
                    keyLevels: [
                        { type: "resistance", level: "区间上沿", description: "卖出区域" },
                        { type: "support", level: "区间下沿", description: "买入区域" }
                    ],
                    tone: "info"
                };

            case "broad_range":
                return {
                    state,
                    stateLabel,
                    expectation: "预期: 在区间边界交易,或等待突破。可以做小趋势",
                    warnings: [
                        "⚠️ 警告: 不要在区间中间追单",
                        "⚠️ 警告: 突破可能是假突破,需要确认",
                        "⚠️ 警告: 止盈目标设在对侧边界"
                    ],
                    recommendedStrategies: ["Range Fade", "Mini Trend", "Scalp"],
                    forbiddenStrategies: ["Large Position", "Swing"],
                    keyLevels: [
                        { type: "resistance", level: "区间上沿", description: "卖出区域" },
                        { type: "support", level: "区间下沿", description: "买入区域" },
                        { type: "magnet", level: "区间中线", description: "磁力点" }
                    ],
                    tone: "info"
                };

            case "breakout_bull":
                return {
                    state,
                    stateLabel,
                    expectation: "预期: 突破后回测支撑,或旗形继续。避免追高",
                    warnings: [
                        "⚠️ 警告: 假突破风险高,等待确认",
                        "⚠️ 警告: 不要在突破K追多,等回测",
                        "⚠️ 警告: 止损放在突破点下方"
                    ],
                    recommendedStrategies: ["Pullback", "Flag", "Breakout Retest"],
                    forbiddenStrategies: ["Chase", "Counter-trend"],
                    keyLevels: [
                        { type: "support", level: "突破点", description: "回测支撑" },
                        { type: "magnet", level: "测量目标", description: "突破后目标位" }
                    ],
                    tone: "success"
                };

            case "breakout_bear":
                return {
                    state,
                    stateLabel,
                    expectation: "预期: 突破后回测阻力,或旗形继续。避免追空",
                    warnings: [
                        "⚠️ 警告: 假突破风险高,等待确认",
                        "⚠️ 警告: 不要在突破K追空,等回测",
                        "⚠️ 警告: 止损放在突破点上方"
                    ],
                    recommendedStrategies: ["Pullback", "Flag", "Breakout Retest"],
                    forbiddenStrategies: ["Chase", "Counter-trend"],
                    keyLevels: [
                        { type: "resistance", level: "突破点", description: "回测阻力" },
                        { type: "magnet", level: "测量目标", description: "突破后目标位" }
                    ],
                    tone: "danger"
                };

            case "unknown":
            default:
                return {
                    state: "unknown",
                    stateLabel: "❓ 未知状态",
                    expectation: "建议: 先观察市场,确定市场状态后再交易",
                    warnings: [
                        "⚠️ 警告: 市场状态不明,建议观望",
                        "⚠️ 警告: 如果必须交易,使用小仓位"
                    ],
                    recommendedStrategies: [],
                    forbiddenStrategies: [],
                    keyLevels: [],
                    tone: "warning"
                };
        }
    }
}
