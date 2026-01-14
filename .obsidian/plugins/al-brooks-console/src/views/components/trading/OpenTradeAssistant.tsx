import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import type { StrategyIndex } from "../../../core/strategy-index";
import { V5_COLORS } from "../../../ui/tokens";
import { glassInsetStyle } from "../../../ui/styles/dashboardPrimitives";
import { normalize } from "../../../utils/string-utils";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { matchStrategies } from "../../../core/strategy-matcher";
import { matchStrategiesV2 } from "../../../core/strategy-matcher-v2";
import { recommendNextAttribute } from "../../../core/strategy-recommender";

/**
 * 策略卡片数据接口
 */
export interface StrategyCard {
    path: string;
    canonicalName: string;
    entryCriteria?: string[];
    stopLossRecommendation?: string[];
    riskAlerts?: string[];
    takeProfitRecommendation?: string[];
    signalBarQuality?: string[];
    marketCycles: string[];
    setupCategories: string[];
}

/**
 * OpenTradeAssistant组件Props
 */
export interface OpenTradeAssistantProps {
    openTrade: TradeRecord | null;
    todayMarketCycle?: string;
    strategyIndex: StrategyIndex;
    onOpenFile: (path: string) => void;
    openTrades?: TradeRecord[]; // 所有未平仓交易
    trades?: TradeRecord[]; // 所有交易(用于历史表现)
    // 样式和事件处理器
    textButtonStyle: React.CSSProperties;
    buttonStyle: React.CSSProperties;
    // Obsidian App实例(用于更新frontmatter)
    app: any;
}

/**
 * 字段映射: 推荐引擎字段名 -> frontmatter字段名
 */
const FIELD_MAPPING: Record<string, string> = {
    marketCycle: "市场周期/market_cycle",
    direction: "方向/direction",
    setupCategory: "设置类别/setup_category",
    patterns: "观察到的形态/patterns_observed",
    signalBarQuality: "信号K/signal_bar_quality",
};

/**
 * 数组类型字段(需要特殊处理)
 */
const ARRAY_FIELDS = new Set(["patterns", "signalBarQuality"]);

/**
 * 持仓交易助手组件
 * 显示进行中的交易信息、策略建议、入场/止损/风险/目标提示、信号验证
 */
export const OpenTradeAssistant: React.FC<OpenTradeAssistantProps> = ({
    openTrade,
    todayMarketCycle,
    strategyIndex,
    onOpenFile,
    openTrades = [],
    trades = [],
    textButtonStyle,
    buttonStyle,
    app,
}) => {
    // 当前选中的持仓索引
    const [selectedIndex, setSelectedIndex] = React.useState(0);

    // 当前显示的交易 (优先使用openTrades)
    const currentTrade = openTrades.length > 0 ? openTrades[selectedIndex] : openTrade;

    // 重置索引当持仓数量变化时
    React.useEffect(() => {
        if (selectedIndex >= openTrades.length && openTrades.length > 0) {
            setSelectedIndex(0);
        }
    }, [openTrades.length, selectedIndex]);

    // 基于currentTrade动态计算策略 (使用V2引擎)
    const currentStrategy = React.useMemo(() => {
        if (!currentTrade) return undefined;

        const patterns = (currentTrade.patternsObserved ?? [])
            .map((p) => String(p).trim())
            .filter(Boolean);
        const setupCategory = (currentTrade.setupCategory ?? currentTrade.setupKey)?.trim();
        const marketCycle = currentTrade.marketCycle?.trim();

        const results = matchStrategiesV2(strategyIndex, {
            marketCycle,
            setupCategory,
            patterns,
            direction: currentTrade.direction as "Long" | "Short" | undefined,
            timeframe: currentTrade.timeframe,
            includeHistoricalPerf: true,
            limit: 3,
        }, trades);

        return results[0]?.card;
    }, [currentTrade, strategyIndex, trades]);

    /**
     * 处理点击推荐值,自动填写到frontmatter
     */
    const handleFillAttribute = React.useCallback(async (attribute: string, value: string) => {
        if (!currentTrade?.path || !app) return;

        try {
            const file = app.vault.getAbstractFileByPath(currentTrade.path);
            if (!file) {
                console.error('[AutoFill] File not found:', currentTrade.path);
                return;
            }

            const fieldName = FIELD_MAPPING[attribute];
            if (!fieldName) {
                console.error('[AutoFill] Unknown attribute:', attribute);
                return;
            }

            await app.fileManager.processFrontMatter(file, (fm: any) => {
                if (ARRAY_FIELDS.has(attribute)) {
                    // 数组字段:添加到数组中
                    if (!fm[fieldName]) {
                        fm[fieldName] = [value];
                    } else if (Array.isArray(fm[fieldName]) && !fm[fieldName].includes(value)) {
                        fm[fieldName].push(value);
                    }
                } else {
                    // 单值字段:直接赋值
                    fm[fieldName] = value;
                }
            });

            console.log('[AutoFill] Successfully filled:', fieldName, '=', value);
        } catch (error) {
            console.error('[AutoFill] Failed to update frontmatter:', error);
        }
    }, [currentTrade, app]);

    if (!currentTrade) return null;

    return (
        <div>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                进行中交易助手
            </div>

            {/* 多持仓选择器 */}
            {openTrades.length > 1 && (
                <div style={{
                    display: "flex",
                    gap: "6px",
                    marginBottom: "12px",
                    flexWrap: "wrap"
                }}>
                    {openTrades.map((trade, idx) => (
                        <button
                            key={`${trade.path}-${idx}`}
                            onClick={() => setSelectedIndex(idx)}
                            style={{
                                padding: "6px 12px",
                                background: idx === selectedIndex
                                    ? "var(--interactive-accent)"
                                    : "var(--background-modifier-border)",
                                color: idx === selectedIndex
                                    ? "var(--text-on-accent)"
                                    : "var(--text-muted)",
                                border: "none",
                                borderRadius: "12px",
                                cursor: "pointer",
                                fontSize: "0.85em",
                                fontWeight: idx === selectedIndex ? 600 : 400,
                                transition: "all 0.2s",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px"
                            }}
                        >
                            <span>{trade.direction === "Long" ? "📈" : trade.direction === "Short" ? "📉" : "➡️"}</span>
                            <span>{trade.ticker || "未知"}</span>
                            <span style={{ opacity: 0.7, fontSize: "0.9em" }}>#{idx + 1}</span>
                        </button>
                    ))}
                </div>
            )}

            <div
                style={{
                    color: "var(--text-muted)",
                    fontSize: "0.9em",
                    marginBottom: "8px",
                }}
            >
                <InteractiveButton
                    interaction="text"
                    onClick={() => onOpenFile(currentTrade.path)}
                >
                    {currentTrade.ticker ?? "未知"} • {currentTrade.name}
                </InteractiveButton>
            </div>

            {/* 市场周期和策略推荐 - 基于currentTrade */}
            {(() => {
                // 只使用currentTrade的marketCycle,不回退到todayMarketCycle
                const marketCycle = currentTrade.marketCycle?.trim();

                return (
                    <div style={{ marginBottom: "12px" }}>
                        <div
                            style={{
                                color: "var(--text-muted)",
                                fontSize: "0.9em",
                                marginBottom: "10px",
                            }}
                        >
                            市场周期: {marketCycle ?? "—"}
                        </div>

                        {marketCycle && (() => {
                            // 使用V2引擎 - 考虑方向、时间周期、历史表现
                            const results = matchStrategiesV2(strategyIndex, {
                                marketCycle,
                                direction: currentTrade.direction as "Long" | "Short" | undefined,
                                timeframe: currentTrade.timeframe,
                                includeHistoricalPerf: true,
                                limit: 20, // 显示所有匹配的策略
                            }, trades);

                            if (results.length === 0) return null;

                            return (
                                <div>
                                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                                        周期 → 策略推荐
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: "18px" }}>
                                        {results.map((r) => (
                                            <li
                                                key={`cycle-pick-${r.card.path}`}
                                                style={{ marginBottom: "6px" }}
                                            >
                                                <InteractiveButton
                                                    interaction="text"
                                                    onClick={() => onOpenFile(r.card.path)}
                                                >
                                                    {r.card.canonicalName}
                                                </InteractiveButton>
                                                {r.score > 0 && (
                                                    <span style={{
                                                        marginLeft: "8px",
                                                        fontSize: "0.85em",
                                                        color: "var(--text-faint)"
                                                    }}>
                                                        {r.reason}
                                                    </span>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            );
                        })()}
                    </div>
                );
            })()}

            {/* 智能引导推荐 - 独立显示 */}
            {(() => {
                const recommendation = recommendNextAttribute(strategyIndex, {
                    marketCycle: currentTrade.marketCycle,
                    alwaysIn: (currentTrade as any).alwaysIn || (currentTrade as any)["总是方向/always_in"],
                    setupCategory: currentTrade.setupCategory,
                    patterns: currentTrade.patternsObserved,
                    signalBarQuality: (currentTrade as any).signalBarQuality || (currentTrade as any)["信号K/signal_bar_quality"],
                    direction: currentTrade.direction,
                    timeframe: currentTrade.timeframe,
                });

                // 调试日志
                console.log('[SmartGuidance] Recommendation:', recommendation);
                console.log('[SmartGuidance] CurrentTrade:', {
                    marketCycle: currentTrade.marketCycle,
                    alwaysIn: (currentTrade as any).alwaysIn,
                    setupCategory: currentTrade.setupCategory,
                    patterns: currentTrade.patternsObserved,
                    direction: currentTrade.direction,
                });
                console.log('[SmartGuidance] StrategyIndex total:', strategyIndex.list().length);

                // 调试:查看策略卡片的direction字段
                if (strategyIndex.list().length > 0) {
                    const firstStrategy = strategyIndex.list()[0];
                    console.log('[SmartGuidance] First strategy sample:', {
                        name: (firstStrategy as any).name,
                        direction: (firstStrategy as any).direction,
                        marketCycles: (firstStrategy as any).marketCycles,
                        setupCategories: (firstStrategy as any).setupCategories,
                    });
                }

                if (!recommendation || recommendation.recommendations.length === 0) {
                    console.log('[SmartGuidance] No recommendations available');
                    return null;
                }

                return (
                    <div style={{
                        marginBottom: "12px",
                        padding: "12px",
                        background: "var(--background-secondary)",
                        borderRadius: "8px",
                        border: "1px solid var(--background-modifier-border)",
                    }}>
                        <div style={{
                            fontSize: "12px",
                            marginBottom: "8px",
                            fontWeight: 600,
                            color: "var(--text-accent)"
                        }}>
                            💡 建议下一步填写: {recommendation.nextAttributeLabel}
                        </div>
                        <div style={{
                            fontSize: "11px",
                            opacity: 0.8,
                            marginBottom: "8px",
                            color: "var(--text-muted)"
                        }}>
                            基于{recommendation.filteredCount}个策略推荐:
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {recommendation.recommendations.map(rec => (
                                <button
                                    key={rec.value}
                                    onClick={() => handleFillAttribute(rec.attribute, rec.value)}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = "var(--interactive-hover)";
                                        e.currentTarget.style.borderColor = "var(--interactive-accent)";
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = "var(--background-primary)";
                                        e.currentTarget.style.borderColor = "var(--background-modifier-border)";
                                    }}
                                    style={{
                                        padding: "8px",
                                        background: "var(--background-primary)",
                                        borderRadius: "6px",
                                        border: "1px solid var(--background-modifier-border)",
                                        fontSize: "12px",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        cursor: "pointer",
                                        transition: "all 0.2s",
                                        width: "100%",
                                        textAlign: "left",
                                    }}
                                >
                                    <span style={{ fontWeight: 500 }}>{rec.value}</span>
                                    <span style={{
                                        fontSize: "11px",
                                        color: "var(--text-muted)",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px"
                                    }}>
                                        <span>{rec.count}个策略</span>
                                        <span style={{
                                            padding: "2px 6px",
                                            background: "var(--interactive-accent)",
                                            color: "var(--text-on-accent)",
                                            borderRadius: "4px",
                                            fontWeight: 600
                                        }}>
                                            {rec.percentage}%
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                );
            })()}


            {currentStrategy ? (
                <div>
                    <div style={{ marginBottom: "8px" }}>
                        策略:{" "}
                        <InteractiveButton
                            interaction="text"
                            onClick={() => onOpenFile(currentStrategy.path)}
                        >
                            {currentStrategy.canonicalName}
                        </InteractiveButton>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns:
                                "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: "8px",
                        }}
                    >
                        {(currentStrategy.entryCriteria?.length ?? 0) > 0 && (
                            <div>
                                <div
                                    style={{
                                        fontWeight: 800,
                                        marginBottom: "4px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        color: "var(--text-accent)",
                                    }}
                                >
                                    <span style={{ fontSize: "1.05em", lineHeight: 1 }}>
                                        🚪
                                    </span>
                                    入场
                                </div>
                                <ul style={{ margin: 0, paddingLeft: "18px" }}>
                                    {currentStrategy
                                        .entryCriteria!.slice(0, 3)
                                        .map((x, i) => (
                                            <li key={`entry-${i}`}>{x}</li>
                                        ))}
                                </ul>
                            </div>
                        )}
                        {(currentStrategy.stopLossRecommendation?.length ?? 0) >
                            0 && (
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 800,
                                            marginBottom: "4px",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "6px",
                                            color: V5_COLORS.loss,
                                        }}
                                    >
                                        <span style={{ fontSize: "1.05em", lineHeight: 1 }}>
                                            🛑
                                        </span>
                                        止损
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: "18px" }}>
                                        {currentStrategy
                                            .stopLossRecommendation!.slice(0, 3)
                                            .map((x, i) => (
                                                <li key={`stop-${i}`}>{x}</li>
                                            ))}
                                    </ul>
                                </div>
                            )}
                        {(currentStrategy.riskAlerts?.length ?? 0) > 0 && (
                            <div>
                                <div
                                    style={{
                                        fontWeight: 800,
                                        marginBottom: "4px",
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        color: V5_COLORS.back,
                                    }}
                                >
                                    <span style={{ fontSize: "1.05em", lineHeight: 1 }}>
                                        ⚠️
                                    </span>
                                    风险
                                </div>
                                <ul style={{ margin: 0, paddingLeft: "18px" }}>
                                    {currentStrategy
                                        .riskAlerts!.slice(0, 3)
                                        .map((x, i) => (
                                            <li key={`risk-${i}`}>{x}</li>
                                        ))}
                                </ul>
                            </div>
                        )}
                        {(currentStrategy.takeProfitRecommendation?.length ??
                            0) > 0 && (
                                <div>
                                    <div
                                        style={{
                                            fontWeight: 800,
                                            marginBottom: "4px",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: "6px",
                                            color: "var(--text-accent)",
                                        }}
                                    >
                                        <span style={{ fontSize: "1.05em", lineHeight: 1 }}>
                                            🎯
                                        </span>
                                        目标
                                    </div>
                                    <ul style={{ margin: 0, paddingLeft: "18px" }}>
                                        {currentStrategy
                                            .takeProfitRecommendation!.slice(0, 3)
                                            .map((x, i) => (
                                                <li key={`tp-${i}`}>{x}</li>
                                            ))}
                                    </ul>
                                </div>
                            )}
                    </div>

                    {(() => {
                        const curSignals = (currentTrade.signalBarQuality ?? [])
                            .map((s) => String(s).trim())
                            .filter(Boolean);
                        const reqSignals = (
                            currentStrategy.signalBarQuality ?? []
                        )
                            .map((s) => String(s).trim())
                            .filter(Boolean);

                        const hasSignalInfo =
                            curSignals.length > 0 || reqSignals.length > 0;
                        if (!hasSignalInfo) return null;

                        const norm = normalize; // 使用 utils/string-utils.ts
                        const signalMatch =
                            curSignals.length > 0 && reqSignals.length > 0
                                ? reqSignals.some((r) =>
                                    curSignals.some((c) => {
                                        const rn = norm(r);
                                        const cn = norm(c);
                                        return rn.includes(cn) || cn.includes(rn);
                                    })
                                )
                                : null;

                        return (
                            <div
                                style={{
                                    ...glassInsetStyle,
                                    marginTop: "10px",
                                }}
                            >
                                <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                                    🔍 信号K验证
                                </div>

                                {curSignals.length > 0 ? (
                                    <div
                                        style={{
                                            color: "var(--text-muted)",
                                            fontSize: "0.9em",
                                            marginBottom: "6px",
                                        }}
                                    >
                                        当前：
                                        <span style={{ color: "var(--text-accent)" }}>
                                            {curSignals.join(" / ")}
                                        </span>
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            color: "var(--text-muted)",
                                            fontSize: "0.9em",
                                            marginBottom: "6px",
                                        }}
                                    >
                                        当前：—
                                    </div>
                                )}

                                {reqSignals.length > 0 ? (
                                    <div
                                        style={{
                                            color: "var(--text-muted)",
                                            fontSize: "0.9em",
                                            marginBottom: "6px",
                                        }}
                                    >
                                        建议：{reqSignals.join(" / ")}
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            color: "var(--text-muted)",
                                            fontSize: "0.9em",
                                            marginBottom: "6px",
                                        }}
                                    >
                                        建议：未在策略卡中定义
                                    </div>
                                )}

                                {signalMatch === null ? null : (
                                    <div
                                        style={{
                                            color: "var(--text-muted)",
                                            fontSize: "0.9em",
                                        }}
                                    >
                                        匹配：
                                        <span
                                            style={{
                                                marginLeft: "6px",
                                                color: signalMatch
                                                    ? V5_COLORS.win
                                                    : V5_COLORS.back,
                                                fontWeight: 700,
                                            }}
                                        >
                                            {signalMatch ? "✅" : "⚠️"}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            ) : (
                (() => {
                    const marketCycleRaw = (
                        currentTrade.marketCycle ?? todayMarketCycle
                    )
                        ?.toString()
                        .trim();
                    const marketCycle = marketCycleRaw
                        ? marketCycleRaw.includes("(")
                            ? marketCycleRaw.split("(")[0].trim()
                            : marketCycleRaw
                        : undefined;
                    const setupCategory = currentTrade.setupCategory
                        ?.toString()
                        .trim();
                    const setupKey = currentTrade.setupKey?.toString().trim();
                    const hasHints = Boolean(marketCycle || setupCategory);

                    if (!hasHints) {
                        return (
                            <div
                                style={{
                                    color: "var(--text-faint)",
                                    fontSize: "0.9em",
                                }}
                            >
                                未找到匹配策略。
                            </div>
                        );
                    }

                    const norm = (s: string) => s.toLowerCase();
                    const wantCycleKey = marketCycle
                        ? norm(marketCycle)
                        : undefined;
                    const wantSetupKey =
                        setupCategory || setupKey
                            ? norm(String(setupCategory || setupKey))
                            : undefined;

                    const scored = strategyIndex
                        .list()
                        .map((card) => {
                            let score = 0;
                            if (
                                wantCycleKey &&
                                card.marketCycles.some((c) => {
                                    const ck = norm(String(c));
                                    return (
                                        ck.includes(wantCycleKey) ||
                                        wantCycleKey.includes(ck)
                                    );
                                })
                            ) {
                                score += 2;
                            }
                            if (
                                wantSetupKey &&
                                card.setupCategories.some((c) => {
                                    const ck = norm(String(c));
                                    return (
                                        ck.includes(wantSetupKey) ||
                                        wantSetupKey.includes(ck)
                                    );
                                })
                            ) {
                                score += 1;
                            }
                            return { card, score };
                        })
                        .filter((x) => x.score > 0)
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 3)
                        .map((x) => x.card);

                    if (scored.length === 0) {
                        return (
                            <div
                                style={{
                                    color: "var(--text-faint)",
                                    fontSize: "0.9em",
                                }}
                            >
                                未找到匹配策略。
                            </div>
                        );
                    }

                    return (
                        <div>
                            <div
                                style={{
                                    color: "var(--text-muted)",
                                    fontSize: "0.9em",
                                    marginBottom: "8px",
                                }}
                            >
                                💡 基于当前市场背景（{marketCycle ?? "未知"}
                                ）的策略建议：
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: "8px",
                                }}
                            >
                                {scored.map((s) => (
                                    <InteractiveButton
                                        key={`today-fallback-${s.path}`}
                                        onClick={() => onOpenFile(s.path)}
                                    >
                                        {s.canonicalName}
                                    </InteractiveButton>
                                ))}
                            </div>
                        </div>
                    );
                })()
            )}
        </div>
    );
};
