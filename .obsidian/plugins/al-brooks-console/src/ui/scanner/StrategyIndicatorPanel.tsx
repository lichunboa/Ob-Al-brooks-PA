import * as React from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Activity, Bell, BellOff, BookOpen } from "lucide-react";

/**
 * 策略指标监控面板 Props
 */
export interface StrategyIndicatorPanelProps {
    apiHost: string;
    symbol: string;
    symbolName: string;
}

/**
 * Al Brooks 策略模式定义
 * 直接映射策略仓库中的策略卡片
 */
interface AlBrooksPattern {
    id: string;
    name: string;
    category: string;           // 策略分类
    description: string;        // 一句话描述
    alBrooksTerms: string[];    // Al Brooks 术语
    indicatorTables: string[];  // 用于检测的后端指标表
    condition: (data: Record<string, any>) => PatternMatch | null;
    riskLevel: "低" | "中" | "高";
    direction: "做多" | "做空" | "双向";
    link?: string;              // 链接到策略卡片
}

interface PatternMatch {
    triggered: boolean;
    signal: "做多" | "做空" | "观望";
    strength: number;      // 1-10
    details: string;
    rawData?: any;
}

// ============================================================
// Al Brooks 策略模式定义 - 基于策略仓库
// ============================================================
const AL_BROOKS_PATTERNS: AlBrooksPattern[] = [
    // ---------- 趋势反转类 ----------
    {
        id: "double_top_bottom",
        name: "双重顶底",
        category: "趋势反转",
        description: "价格两次测试同一支撑/阻力位失败后,捕捉反转机会",
        alBrooksTerms: ["Double Top/Bottom", "Failed Breakout"],
        indicatorTables: ["K线形态扫描器.py", "全量支撑阻力扫描器.py"],
        riskLevel: "低",
        direction: "双向",
        condition: (data) => {
            // 检测吞没形态或反转K线在支撑/阻力位
            const patterns = data["形态类型"] || "";
            const hasReversal = patterns.includes("吞没") || patterns.includes("锤子") || patterns.includes("倒锤");
            if (hasReversal) {
                return {
                    triggered: true,
                    signal: patterns.includes("吞没形态") ? "做多" : "观望",
                    strength: Math.min(10, (data["强度"] || 1) * 2),
                    details: `检测到反转形态: ${patterns}`,
                };
            }
            return null;
        },
    },
    {
        id: "wedge_top_bottom",
        name: "楔形顶底",
        category: "趋势反转",
        description: "三推收敛结构,两次突破极值失败,预示高概率反转",
        alBrooksTerms: ["Wedge Top/Bottom", "Three Pushes"],
        indicatorTables: ["趋势云反转扫描器.py", "K线形态扫描器.py"],
        riskLevel: "低",
        direction: "双向",
        condition: (data) => {
            // 趋势云反转信号
            const signal = data["信号"];
            if (signal && signal !== "观望" && signal !== "无") {
                const direction = data["方向"];
                return {
                    triggered: true,
                    signal: direction === "看涨" ? "做多" : direction === "看跌" ? "做空" : "观望",
                    strength: 7,
                    details: `趋势反转信号: ${signal}, 方向: ${direction}`,
                };
            }
            return null;
        },
    },

    // ---------- 趋势回调类 ----------
    {
        id: "high1_low1",
        name: "高1/低1 入场",
        category: "趋势回调",
        description: "强趋势中首次逆势尝试失败后,等待顺势恢复入场",
        alBrooksTerms: ["High 1", "Low 1", "First Counter-trend Failure"],
        indicatorTables: ["MACD柱状扫描器.py", "SuperTrend.py"],
        riskLevel: "高",
        direction: "双向",
        condition: (data) => {
            // SuperTrend 方向变化 或 MACD 金叉/死叉
            const macdSignal = data["信号"];
            if (macdSignal === "金叉") {
                return {
                    triggered: true,
                    signal: "做多",
                    strength: 6,
                    details: "MACD 金叉 - 高1入场时机",
                };
            }
            if (macdSignal === "死叉") {
                return {
                    triggered: true,
                    signal: "做空",
                    strength: 6,
                    details: "MACD 死叉 - 低1入场时机",
                };
            }
            return null;
        },
    },
    {
        id: "ema20_gap",
        name: "20均线缺口",
        category: "趋势回调",
        description: "强趋势中首次回测均线,寻找入场机会",
        alBrooksTerms: ["First EMA Gap", "20 EMA Pullback"],
        indicatorTables: ["智能RSI扫描器.py"],
        riskLevel: "中",
        direction: "双向",
        condition: (data) => {
            // RSI 中性区附近 + 背离
            const position = data["位置"];
            const divergence = data["背离"];
            if (divergence && divergence !== "无背离") {
                return {
                    triggered: true,
                    signal: divergence === "底背离" ? "做多" : divergence === "顶背离" ? "做空" : "观望",
                    strength: 8,
                    details: `RSI ${divergence} - 可能的均线回测入场`,
                };
            }
            return null;
        },
    },

    // ---------- 突破类 ----------
    {
        id: "range_breakout",
        name: "区间突破回调",
        category: "突破模式",
        description: "区间突破后回调至突破位,确认后入场",
        alBrooksTerms: ["Breakout Pullback", "Range Breakout"],
        indicatorTables: ["布林带扫描器.py", "全量支撑阻力扫描器.py"],
        riskLevel: "中",
        direction: "双向",
        condition: (data) => {
            // 布林带突破
            const signal = data["信号"];
            if (signal && (signal.includes("突破上轨") || signal.includes("突破下轨"))) {
                return {
                    triggered: true,
                    signal: signal.includes("上轨") ? "做多" : "做空",
                    strength: 6,
                    details: `布林带${signal} - 区间突破信号`,
                };
            }
            return null;
        },
    },
    {
        id: "failed_breakout",
        name: "失败突破",
        category: "反转",
        description: "突破失败后反向入场,捕捉反转",
        alBrooksTerms: ["Failed Breakout", "Bull/Bear Trap"],
        indicatorTables: ["K线形态扫描器.py"],
        riskLevel: "中",
        direction: "双向",
        condition: (data) => {
            // 检测孕线或内包K线 (犹豫信号)
            const patterns = data["形态类型"] || "";
            if (patterns.includes("孕线") || patterns.includes("十字孕线")) {
                return {
                    triggered: true,
                    signal: "观望",
                    strength: 4,
                    details: `${patterns} - 可能的突破失败信号,等待确认`,
                };
            }
            return null;
        },
    },

    // ---------- K线形态类 ----------
    {
        id: "reversal_bar",
        name: "反转K线信号",
        category: "K线形态",
        description: "强反转K线出现,可能预示趋势变化",
        alBrooksTerms: ["Reversal Bar", "Signal Bar"],
        indicatorTables: ["K线形态扫描器.py"],
        riskLevel: "中",
        direction: "双向",
        condition: (data) => {
            const patterns = data["形态类型"] || "";
            const strength = data["强度"] || 0;

            // 吞没形态是强信号
            if (patterns.includes("吞没") && strength >= 2) {
                return {
                    triggered: true,
                    signal: "观望",
                    strength: 7,
                    details: `吞没形态 (强度: ${strength}) - 等待确认方向`,
                };
            }

            // 十字星是犹豫信号
            if (patterns.includes("十字星") && strength >= 3) {
                return {
                    triggered: true,
                    signal: "观望",
                    strength: 5,
                    details: `十字星形态 - 市场犹豫,可能反转`,
                };
            }

            // 长蜡烛是动能信号
            if (patterns.includes("长蜡烛") && strength >= 4) {
                return {
                    triggered: true,
                    signal: "观望",
                    strength: 6,
                    details: `长蜡烛 (强度: ${strength}) - 强动能`,
                };
            }

            return null;
        },
    },

    // ---------- 资金流向类 ----------
    {
        id: "big_money",
        name: "大资金操盘",
        category: "资金流向",
        description: "检测大资金入场信号",
        alBrooksTerms: ["Climax", "Exhaustion"],
        indicatorTables: ["大资金操盘扫描器.py", "主动买卖比扫描器.py"],
        riskLevel: "中",
        direction: "双向",
        condition: (data) => {
            const signal = data["信号"];
            if (signal === "买入" || signal === "卖出") {
                return {
                    triggered: true,
                    signal: signal === "买入" ? "做多" : "做空",
                    strength: 8,
                    details: `大资金${signal}信号`,
                };
            }
            return null;
        },
    },
];

// ============================================================
// 组件实现
// ============================================================

interface PatternAlert {
    pattern: AlBrooksPattern;
    match: PatternMatch;
    timestamp: string;
}

export const StrategyIndicatorPanel: React.FC<StrategyIndicatorPanelProps> = ({
    apiHost,
    symbol,
    symbolName,
}) => {
    const [alerts, setAlerts] = React.useState<PatternAlert[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [muted, setMuted] = React.useState(false);

    // 获取指标数据并检测 Al Brooks 模式
    const checkPatterns = React.useCallback(async () => {
        const newAlerts: PatternAlert[] = [];

        for (const pattern of AL_BROOKS_PATTERNS) {
            for (const table of pattern.indicatorTables) {
                try {
                    const res = await fetch(
                        `${apiHost}/api/v1/indicators/table/${encodeURIComponent(table)}?symbol=${symbol}&limit=1`
                    );
                    if (!res.ok) continue;

                    const data = await res.json();
                    if (data && data.length > 0) {
                        const latest = data[0];
                        const match = pattern.condition(latest);
                        if (match && match.triggered) {
                            newAlerts.push({
                                pattern,
                                match,
                                timestamp: latest?.["数据时间"] || new Date().toISOString(),
                            });
                            break; // 一个策略只需要一个信号
                        }
                    }
                } catch (e) {
                    // 静默失败
                }
            }
        }

        // 按强度排序
        newAlerts.sort((a, b) => b.match.strength - a.match.strength);
        setAlerts(newAlerts.slice(0, 5)); // 最多显示5个
        setLoading(false);
    }, [apiHost, symbol]);

    // 初始加载和定时刷新
    React.useEffect(() => {
        checkPatterns();
        const interval = setInterval(checkPatterns, 300000); // 5分钟检查一次（基于5分钟K线级别）
        return () => clearInterval(interval);
    }, [checkPatterns]);

    // 获取信号颜色
    const getSignalColor = (signal: string) => {
        switch (signal) {
            case "做多": return "#22c55e";
            case "做空": return "#ef4444";
            default: return "#f59e0b";
        }
    };

    // 获取风险等级颜色
    const getRiskColor = (risk: string) => {
        switch (risk) {
            case "低": return "#22c55e";
            case "中": return "#f59e0b";
            case "高": return "#ef4444";
            default: return "#6b7280";
        }
    };

    return (
        <div style={{
            background: "var(--background-secondary)",
            borderRadius: "8px",
            padding: "12px",
            marginTop: "8px",
        }}>
            {/* 标题栏 */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px",
            }}>
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "0.85em",
                    fontWeight: 600,
                }}>
                    <BookOpen size={14} color="#3b82f6" />
                    Al Brooks 策略监控
                </div>
                <button
                    onClick={() => setMuted(!muted)}
                    style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px",
                        borderRadius: "4px",
                        color: muted ? "var(--text-faint)" : "var(--text-muted)",
                    }}
                    title={muted ? "启用提醒" : "静音提醒"}
                >
                    {muted ? <BellOff size={14} /> : <Bell size={14} />}
                </button>
            </div>

            {/* 提醒列表 */}
            {loading ? (
                <div style={{ fontSize: "0.75em", color: "var(--text-muted)", textAlign: "center" }}>
                    检测 Al Brooks 形态中...
                </div>
            ) : alerts.length === 0 ? (
                <div style={{
                    fontSize: "0.75em",
                    color: "var(--text-faint)",
                    textAlign: "center",
                    padding: "8px",
                }}>
                    ✅ 暂无触发的 Al Brooks 形态
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {alerts.map((alert, idx) => (
                        <div
                            key={`${alert.pattern.id}-${idx}`}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "4px",
                                padding: "10px 12px",
                                background: `${getSignalColor(alert.match.signal)}10`,
                                borderRadius: "6px",
                                borderLeft: `3px solid ${getSignalColor(alert.match.signal)}`,
                            }}
                        >
                            {/* 第一行: 策略名称 + 信号 */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{
                                    fontSize: "0.85em",
                                    fontWeight: 600,
                                    color: "var(--text-normal)",
                                }}>
                                    {alert.pattern.name}
                                </div>
                                <div style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                }}>
                                    <span style={{
                                        fontSize: "0.7em",
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        background: getSignalColor(alert.match.signal),
                                        color: "white",
                                        fontWeight: 600,
                                    }}>
                                        {alert.match.signal}
                                    </span>
                                    <span style={{
                                        fontSize: "0.65em",
                                        color: getRiskColor(alert.pattern.riskLevel),
                                    }}>
                                        风险{alert.pattern.riskLevel}
                                    </span>
                                </div>
                            </div>

                            {/* 第二行: 详情 */}
                            <div style={{
                                fontSize: "0.7em",
                                color: "var(--text-muted)",
                                lineHeight: 1.3,
                            }}>
                                {alert.match.details}
                            </div>

                            {/* 第三行: Al Brooks 术语 */}
                            <div style={{
                                fontSize: "0.65em",
                                color: "var(--text-faint)",
                                fontStyle: "italic",
                            }}>
                                {alert.pattern.alBrooksTerms.join(" / ")}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
