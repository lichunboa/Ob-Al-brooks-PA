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
     * @param marketCycle 市场周期字符串
     * @param direction 交易方向 (Long/Short) - 用于消除歧义
     */
    inferState(marketCycle: string | undefined, direction?: string): MarketState {
        if (!marketCycle) return "unknown";

        const normalized = marketCycle.trim();
        const dir = direction?.toLowerCase().trim() || "";

        // Robust Matching: Use includes instead of strict equality to handle "不做 (Long)" or "做多 (Long)" formats
        const isBull = dir.includes("long") || dir.includes("buy") || dir.includes("bull") || dir.includes("做多") || dir.includes("看涨") || dir.includes("多");
        const isBear = dir.includes("short") || dir.includes("sell") || dir.includes("bear") || dir.includes("做空") || dir.includes("看跌") || dir.includes("空");

        console.log(`[MarketStateMachine] Inferring state from cycle: "${normalized}", direction: "${dir}" (isBull: ${isBull}, isBear: ${isBear})`);

        // 精确匹配
        if (STATE_MAP[normalized]) {
            return STATE_MAP[normalized];
        }

        // 模糊匹配
        const lower = normalized.toLowerCase();

        // 强趋势 (Generic handling with direction)
        if (lower.includes("强") || lower.includes("strong")) {
            if (lower.includes("多") || lower.includes("牛") || lower.includes("bull") || isBull) {
                return "strong_trend_bull";
            }
            if (lower.includes("空") || lower.includes("熊") || lower.includes("bear") || isBear) {
                return "strong_trend_bear";
            }
            // If explicit strong trend but unknown direction, assume Breakout Mode or just Unknown?
            // Better to default to 'unknown' or a generic strong trend guidance?
            // We'll stick to unknown if we can't tell bull/bear, but usually direction is known.
        }

        // 弱趋势 / Channel
        if (lower.includes("弱") || lower.includes("weak") || lower.includes("channel") || lower.includes("通道")) {
            if (lower.includes("多") || lower.includes("牛") || lower.includes("bull") || isBull) {
                return "weak_trend_bull";
            }
            if (lower.includes("空") || lower.includes("熊") || lower.includes("bear") || isBear) {
                return "weak_trend_bear";
            }
        }

        // 紧密区间
        if (lower.includes("紧密") || lower.includes("窄") || lower.includes("tight")) {
            return "tight_range";
        }

        // 宽幅区间
        if (lower.includes("区间") || lower.includes("震荡") || lower.includes("range")) {
            return "broad_range";
        }

        // 突破 (Breakout)
        if (lower.includes("突破") || lower.includes("breakout") || lower.includes("spike")) {
            if (lower.includes("多") || lower.includes("牛") || lower.includes("向上") || lower.includes("bull") || isBull) {
                return "breakout_bull";
            }
            if (lower.includes("空") || lower.includes("熊") || lower.includes("向下") || lower.includes("bear") || isBear) {
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
                    expectation: "强势多头: K线重叠少,阳线实体大。预期会出现测量移动(MM)或高潮(Climax)。",
                    warnings: [
                        "⚠️ 警告: 80%的反转尝试会失败,切勿摸顶",
                        "⚠️ 警告: 第一次回调通常会有更低的高点(LH)供二次入场",
                        "⚠️ 警告: 只有连续的一系列强阴线才能改变Always In状态"
                    ],
                    recommendedStrategies: ["高1 (H1)", "高2 (H2)", "高2做多", "微型楔形", "缺口回调"],
                    forbiddenStrategies: ["逆势剥头皮", "楔形顶做空"],
                    keyLevels: [
                        { type: "support", level: "EMA20 (动态支撑)", description: "首次触及必买" },
                        { type: "support", level: "Gap (缺口)", description: "突破缺口支撑" },
                        { type: "magnet", level: "Measured Move (MM)", description: "上涨目标位" }
                    ],
                    tone: "success"
                };

            case "strong_trend_bear":
                return {
                    state,
                    stateLabel,
                    expectation: "强势空头: 持续创新低,阴线连续。预期会达到下方磁力点或出现抛售高潮。",
                    warnings: [
                        "⚠️ 警告: 80%的反转尝试会失败,切勿抄底",
                        "⚠️ 警告: 第一次反弹通常会有更高低点(HL)供二次做空",
                        "⚠️ 警告: 不要被单根大阳线欺骗,等待跟随确认"
                    ],
                    recommendedStrategies: ["低1 (L1)", "低2 (L2)", "低2做空", "微型楔形", "熊旗"],
                    forbiddenStrategies: ["逆势剥头皮", "楔形底做多"],
                    keyLevels: [
                        { type: "resistance", level: "EMA20 (动态阻力)", description: "首次触及必空" },
                        { type: "resistance", level: "Breakout Point", description: "突破点回测" },
                        { type: "magnet", level: "Measured Move (MM)", description: "下跌目标位" }
                    ],
                    tone: "danger"
                };

            case "weak_trend_bull": // Broad Bull Channel
                return {
                    state,
                    stateLabel,
                    expectation: "通道式上涨: 深度回调(Deep Pullback)常见。双向交易皆可,但顺势胜率更高。",
                    warnings: [
                        "⚠️ 警告: 回调可能很深(测试EMA或更高低点)",
                        "⚠️ 警告: 通道线超买区只止盈(Take Profit),不反手",
                        "⚠️ 警告: 留意变异为宽幅震荡(Trading Range)"
                    ],
                    recommendedStrategies: ["牛通道做多", "楔形底", "高2 (H2)", "三角形"],
                    forbiddenStrategies: ["追高", "突破模式"],
                    keyLevels: [
                        { type: "support", level: "Trendline (趋势线)", description: "通道下沿" },
                        { type: "resistance", level: "Channel Top", description: "通道上沿(部分止盈)" }
                    ],
                    tone: "warning"
                };

            case "weak_trend_bear": // Broad Bear Channel
                return {
                    state,
                    stateLabel,
                    expectation: "通道式下跌: 反弹强劲,K线重叠增多。可做空反弹,也可谨慎做多更低低点。",
                    warnings: [
                        "⚠️ 警告: 反弹可能测试EMA上方",
                        "⚠️ 警告: 75%的通道最终会向反方向突破(变为区间)",
                        "⚠️ 警告: 在通道下沿谨慎追空,等待L1/L2"
                    ],
                    recommendedStrategies: ["熊通道做空", "楔形顶", "低2 (L2)", "旗形"],
                    forbiddenStrategies: ["追空", "突破模式"],
                    keyLevels: [
                        { type: "resistance", level: "Trendline (趋势线)", description: "通道上沿" },
                        { type: "support", level: "Channel Bottom", description: "通道下沿(部分止盈)" }
                    ],
                    tone: "warning"
                };

            case "tight_range": // Tight Trading Range (TTR)
                return {
                    state,
                    stateLabel,
                    expectation: "磁力吸附: 价格围绕EMA纠缠。突破尝试多失败。Limit Order市场。",
                    warnings: [
                        "⚠️ 警告: 属于突破模式(Breakout Mode),等待明确突破",
                        "⚠️ 警告: 不要在此状态下使用Stop Order入场(易被止损)",
                        "⚠️ 警告: 大多数突破会失败并反向运动"
                    ],
                    recommendedStrategies: ["看衰突破", "剥头皮", "限价入场"],
                    forbiddenStrategies: ["趋势波段", "突破入场"],
                    keyLevels: [
                        { type: "resistance", level: "Range Top", description: "假突破卖点" },
                        { type: "support", level: "Range Bottom", description: "假突破买点" }
                    ],
                    tone: "info"
                };

            case "broad_range": // Trading Range
                return {
                    state,
                    stateLabel,
                    expectation: "高抛低吸: Buy Low, Sell High, Scalp. 趋势不连续,缺乏动能。",
                    warnings: [
                        "⚠️ 警告: 区间中部的信号大多是陷阱",
                        "⚠️ 警告: 在高位看到大阳线是卖出机会(真空效应)",
                        "⚠️ 警告: 第二段腿(Second Leg)是常见的获利目标"
                    ],
                    recommendedStrategies: ["高抛低吸", "双顶双底", "楔形", "末端旗形"],
                    forbiddenStrategies: ["追突破", "持有波段"],
                    keyLevels: [
                        { type: "resistance", level: "Resistance Zone", description: "上方阻力区" },
                        { type: "support", level: "Support Zone", description: "下方支撑区" },
                        { type: "magnet", level: "Midpoint", description: "中点磁力(仅参考)" }
                    ],
                    tone: "info"
                };

            case "breakout_bull":
                return {
                    state,
                    stateLabel,
                    expectation: "多头突破: 出现惊喜棒(Surprise Bar),突破重要阻力。可能开启新趋势。",
                    warnings: [
                        "⚠️ 警告: 突破K线必须收在高位(Close on High)",
                        "⚠️ 警告: 如果突破后立即出现跟随阳线,胜率大增",
                        "⚠️ 警告: 小仓位追涨,预留加仓空间应对回调"
                    ],
                    recommendedStrategies: ["突破做多", "缺口做多", "极速与通道"],
                    forbiddenStrategies: ["看衰突破", "摸顶"],
                    keyLevels: [
                        { type: "support", level: "Breakout Point", description: "突破缺口" },
                        { type: "magnet", level: "Measured Move", description: "测量目标(基于突破幅度)" }
                    ],
                    tone: "success"
                };

            case "breakout_bear":
                return {
                    state,
                    stateLabel,
                    expectation: "空头突破: 出现恐慌抛售,跌破重要支撑。多头止损盘涌出。",
                    warnings: [
                        "⚠️ 警告: 突破K线必须收在低位(Close on Low)",
                        "⚠️ 警告: 留意是否出现更低低点(LL)确认趋势",
                        "⚠️ 警告: 任何反弹(Pullback)都是首次做空机会"
                    ],
                    recommendedStrategies: ["突破做空", "缺口做空", "极速与通道"],
                    forbiddenStrategies: ["看衰突破", "抄底"],
                    keyLevels: [
                        { type: "resistance", level: "Breakout Point", description: "突破缺口" },
                        { type: "magnet", level: "Measured Move", description: "测量目标" }
                    ],
                    tone: "danger"
                };

            case "unknown":
            default:
                return {
                    state: "unknown",
                    stateLabel: "❓ 市场状态未定义/不明确",
                    expectation: "无法判断: 缺少明确市场周期或方向。\n建议: 请完善文档属性中的'市场周期'和'方向'。",
                    warnings: [
                        "⚠️ 核心原则: 如果看不清,就假设是区间震荡(Trading Range)",
                        "⚠️ 观察重点: EMA斜率,是否创新高/新低,重叠程度",
                    ],
                    recommendedStrategies: ["等待明朗", "限价剥头皮"],
                    forbiddenStrategies: ["重仓", "激进入场"],
                    keyLevels: [],
                    tone: "warning"
                };
        }
    }
}
