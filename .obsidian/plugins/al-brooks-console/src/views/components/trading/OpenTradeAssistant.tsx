import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import type { StrategyIndex } from "../../../core/strategy-index";
import type { EnumPresets } from "../../../core/enum-presets";
import { V5_COLORS } from "../../../ui/tokens";
import { glassInsetStyle } from "../../../ui/styles/dashboardPrimitives";
import { Button } from "../../../ui/components/Button";
import { normalize } from "../../../utils/string-utils";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { matchStrategies } from "../../../core/strategy-matcher";
import { matchStrategiesV2 } from "../../../core/strategy-matcher-v2";
import { recommendNextAttribute } from "../../../core/strategy-recommender";
import { ExecutionFillPanel } from "./ExecutionFillPanel";

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
    riskReward?: string;
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
    enumPresets?: EnumPresets;
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
    enumPresets,
}) => {
    // 当前选中的持仓路径 (使用路径而非索引，避免列表重排时跳单)
    const [selectedTradePath, setSelectedTradePath] = React.useState<string | null>(null);

    // 初始化或重置选中项
    React.useEffect(() => {
        // 如果没有选中项，或者当前选中项不在列表中，默认选中第一个
        const currentExists = openTrades.some(t => t.path === selectedTradePath);
        if (!currentExists && openTrades.length > 0) {
            setSelectedTradePath(openTrades[0].path);
        }
    }, [openTrades, selectedTradePath]);

    // 当前显示的交易 (优先使用 selectedTradePath 查找)
    const currentTrade = React.useMemo(() => {
        if (openTrades.length > 0) {
            return openTrades.find(t => t.path === selectedTradePath) ?? openTrades[0];
        }
        return openTrade;
    }, [openTrades, selectedTradePath, openTrade]);

    // 基于currentTrade动态计算策略 (使用V2引擎)
    const currentStrategy = React.useMemo(() => {
        if (!currentTrade) return undefined;

        const patterns = (currentTrade.patternsObserved ?? [])
            .map((p) => String(p).trim())
            .filter(Boolean);
        const setupCategory = (currentTrade.setupCategory ?? currentTrade.setupKey)?.toString().trim();
        const marketCycle = currentTrade.marketCycle?.toString().trim();

        const results = matchStrategiesV2(strategyIndex, {
            marketCycle,
            setupCategory,
            patterns,
            direction: currentTrade.direction as "Long" | "Short" | undefined,
            timeframe: currentTrade.timeframe,
            includeHistoricalPerf: true,
            limit: 3,
        }, trades);

        // 如果已经有填写的策略名，尝试匹配那个
        if (currentTrade.strategyName) {
            const explicit = results.find(r => r.card.canonicalName === currentTrade.strategyName);
            if (explicit) return explicit.card;
        }

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
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "6px",
                    marginBottom: "12px"
                }}>
                    {openTrades.map((trade, idx) => {
                        // 账户类型标签和颜色
                        const accountType = trade.accountType?.toString().toLowerCase() || "";
                        const isLive = accountType.includes("live") || accountType.includes("实盘");
                        const isDemo = accountType.includes("demo") || accountType.includes("模拟");
                        const isBacktest = accountType.includes("backtest") || accountType.includes("回测");
                        const accountLabel = isLive ? "🟢" : isDemo ? "🔵" : isBacktest ? "⚪" : "";

                        return (
                            <Button
                                key={trade.path}
                                onClick={() => setSelectedTradePath(trade.path)}
                                variant="small"
                                style={{
                                    padding: "6px 12px",
                                    minWidth: "140px",
                                    justifyContent: "center",
                                    background: trade.path === currentTrade.path
                                        ? "var(--interactive-accent)"
                                        : "var(--background-modifier-border)",
                                    color: trade.path === currentTrade.path
                                        ? "var(--text-on-accent)"
                                        : "var(--text-muted)",
                                    border: "none",
                                    borderRadius: "12px",
                                    fontSize: "0.85em",
                                    fontWeight: trade.path === currentTrade.path ? 600 : 400,
                                    transition: "all 0.2s",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px"
                                }}
                            >
                                {accountLabel && <span>{accountLabel}</span>}
                                <span>{trade.direction === "Long" ? "📈" : trade.direction === "Short" ? "📉" : "➡️"}</span>
                                <span>{trade.ticker || "未知"}</span>
                                <span style={{ opacity: 0.7, fontSize: "0.9em" }}>#{idx + 1}</span>
                            </Button>
                        );
                    })}
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
                const marketCycle = currentTrade.marketCycle?.toString().trim();

                return (
                    <div style={{ marginBottom: "12px" }}>
                        <div
                            style={{
                                color: "var(--text-muted)",
                                fontSize: "0.85em",
                                marginBottom: "6px",
                            }}
                        >
                            市场周期: <strong style={{ color: "var(--text-normal)" }}>{marketCycle ?? "—"}</strong>
                        </div>

                        {marketCycle && (() => {
                            const patterns = (currentTrade.patternsObserved ?? [])
                                .map((p) => String(p).trim())
                                .filter(Boolean);
                            const setupCategory = (currentTrade.setupCategory ?? currentTrade.setupKey)?.toString().trim();

                            // 使用V2引擎 - 考虑方向、时间周期、历史表现
                            const results = matchStrategiesV2(strategyIndex, {
                                marketCycle,
                                setupCategory,
                                patterns,
                                direction: currentTrade.direction as "Long" | "Short" | undefined,
                                timeframe: currentTrade.timeframe,
                                includeHistoricalPerf: true,
                                limit: 20, // 显示所有匹配的策略
                            }, trades);

                            if (results.length === 0) return null;

                            // 计算总评分用于百分比
                            const totalScore = results.reduce((sum, r) => sum + r.score, 0);
                            const maxScore = Math.max(...results.map(r => r.score));

                            return (
                                <div>
                                    <div style={{
                                        fontWeight: 600,
                                        marginBottom: "8px",
                                        fontSize: "0.9em",
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px"
                                    }}>
                                        <span>📊 策略推荐</span>
                                        <span style={{
                                            fontSize: "0.8em",
                                            color: "var(--text-muted)",
                                            fontWeight: 400
                                        }}>({results.length}个匹配)</span>
                                    </div>

                                    {/* 两列网格布局 */}
                                    <div style={{
                                        display: "grid",
                                        gridTemplateColumns: "1fr 1fr",
                                        gap: "6px"
                                    }}>
                                        {results.map((r) => {
                                            // 计算百分比
                                            const percentage = totalScore > 0
                                                ? Math.round((r.score / totalScore) * 100)
                                                : 0;

                                            // 根据评分确定视觉层级
                                            const isTop = r.score === maxScore;
                                            const isHigh = percentage >= 15;

                                            // 计算该策略的历史表现
                                            const strategyTrades = trades.filter(t => {
                                                const tName = t.strategyName?.toLowerCase() || "";
                                                const sName = r.card.canonicalName.toLowerCase();
                                                return tName.includes(sName) || sName.includes(tName);
                                            });
                                            const wins = strategyTrades.filter(t => {
                                                const pnl = typeof t.pnl === "number" ? t.pnl : 0;
                                                return pnl > 0;
                                            }).length;
                                            const winRate = strategyTrades.length > 0
                                                ? Math.round((wins / strategyTrades.length) * 100)
                                                : null;

                                            return (
                                                <div
                                                    key={`cycle-pick-${r.card.path}`}
                                                    onClick={() => onOpenFile(r.card.path)}
                                                    style={{
                                                        padding: "10px 12px",
                                                        background: isTop
                                                            ? "rgba(16, 185, 129, 0.08)"
                                                            : "var(--background-primary)",
                                                        borderRadius: "8px",
                                                        cursor: "pointer",
                                                        transition: "all 0.15s ease",
                                                        border: isTop
                                                            ? "1px solid #10B981"
                                                            : "1px solid var(--background-modifier-border)",
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!isTop) {
                                                            e.currentTarget.style.background = "rgba(96, 165, 250, 0.08)";
                                                            e.currentTarget.style.borderColor = "#60A5FA";
                                                        }
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        if (!isTop) {
                                                            e.currentTarget.style.background = "var(--background-primary)";
                                                            e.currentTarget.style.borderColor = "var(--background-modifier-border)";
                                                        }
                                                    }}
                                                >
                                                    {/* 第一行：名称 + 匹配度 */}
                                                    <div style={{
                                                        display: "flex",
                                                        justifyContent: "space-between",
                                                        alignItems: "center",
                                                        marginBottom: (r.card.riskReward || winRate !== null) ? "4px" : 0
                                                    }}>
                                                        <span style={{
                                                            fontSize: "0.9em",
                                                            fontWeight: 600,
                                                            color: isTop ? "#10B981" : "var(--text-normal)",
                                                            flex: 1,
                                                            overflow: "hidden",
                                                            textOverflow: "ellipsis",
                                                            whiteSpace: "nowrap",
                                                        }}>
                                                            {r.card.canonicalName}
                                                        </span>
                                                        <span style={{
                                                            fontSize: "0.75em",
                                                            fontWeight: 600,
                                                            padding: "2px 6px",
                                                            borderRadius: "4px",
                                                            background: "#60A5FA",
                                                            color: "white",
                                                            marginLeft: "6px",
                                                            flexShrink: 0,
                                                        }}>
                                                            {percentage}%
                                                        </span>
                                                    </div>

                                                    {/* 第二行：R/R、胜率、使用次数 */}
                                                    {(r.card.riskReward || strategyTrades.length > 0) && (
                                                        <div style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "12px",
                                                            fontSize: "0.8em",
                                                            color: "var(--text-muted)",
                                                            marginTop: "4px",
                                                        }}>
                                                            {r.card.riskReward && (
                                                                <span>📊 R/R: <b style={{ color: "var(--text-normal)" }}>{r.card.riskReward}</b></span>
                                                            )}
                                                            {strategyTrades.length > 0 && (
                                                                <>
                                                                    <span style={{
                                                                        color: winRate !== null && winRate >= 50 ? "#10B981" : "#EF4444"
                                                                    }}>
                                                                        ✓ 胜率: <b>{winRate ?? 0}%</b>
                                                                    </span>
                                                                    <span>📅 使用: <b style={{ color: "var(--text-normal)" }}>{strategyTrades.length}次</b></span>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                );
            })()}

            {/* 智能引导推荐 - 紧凑两列布局 */}
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

                if (!recommendation || recommendation.recommendations.length === 0) {
                    return null;
                }

                return (
                    <div style={{
                        marginBottom: "12px",
                        padding: "10px",
                        background: "rgba(var(--interactive-accent-rgb), 0.08)",
                        borderRadius: "8px",
                        border: "1px solid rgba(var(--interactive-accent-rgb), 0.2)",
                    }}>
                        <div style={{
                            fontSize: "0.85em",
                            marginBottom: "6px",
                            fontWeight: 600,
                            color: "var(--text-accent)",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                        }}>
                            <span>💡 建议完善</span>
                            <span style={{
                                fontWeight: 400,
                                color: "var(--text-muted)",
                                fontSize: "0.9em"
                            }}>
                                {recommendation.nextAttributeLabel} ({recommendation.filteredCount}策略)
                            </span>
                        </div>
                        {/* 两列网格 */}
                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "4px"
                        }}>
                            {recommendation.recommendations.slice(0, 6).map(rec => (
                                <Button
                                    key={rec.value}
                                    onClick={() => handleFillAttribute(rec.attribute, rec.value)}
                                    variant="default"
                                    style={{
                                        padding: "6px 8px",
                                        background: "var(--background-primary)",
                                        borderRadius: "4px",
                                        border: "1px solid var(--background-modifier-border)",
                                        fontSize: "0.8em",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                    }}
                                >
                                    <span style={{
                                        fontWeight: 500,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                        flex: 1,
                                    }}>{rec.value}</span>
                                    <span style={{
                                        padding: "1px 4px",
                                        background: "var(--interactive-accent)",
                                        color: "var(--text-on-accent)",
                                        borderRadius: "3px",
                                        fontSize: "0.85em",
                                        fontWeight: 600,
                                        marginLeft: "4px",
                                        flexShrink: 0,
                                    }}>
                                        {rec.percentage}%
                                    </span>
                                </Button>
                            ))}
                        </div>
                    </div>
                );
            })()}

            {/* 交易执行填写面板 - 使用 currentTrade (支持多标签切换和实时更新) */}
            {currentTrade && (
                <ExecutionFillPanel
                    trade={currentTrade}
                    app={app}
                    enumPresets={enumPresets}
                    suggestedStrategyName={currentStrategy?.canonicalName}
                />
            )}

            {currentStrategy ? (
                <div>
                    <div style={{
                        marginBottom: "8px",
                        fontSize: "0.85em",
                        color: "var(--text-muted)"
                    }}>
                        策略:{" "}
                        <InteractiveButton
                            interaction="text"
                            onClick={() => onOpenFile(currentStrategy.path)}
                            style={{ fontWeight: 600 }}
                        >
                            {currentStrategy.canonicalName}
                        </InteractiveButton>
                    </div>

                    {/* 2x2 紧凑卡片网格 */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "6px",
                        }}
                    >
                        {(currentStrategy.entryCriteria?.length ?? 0) > 0 && (
                            <div style={{
                                background: "rgba(var(--interactive-accent-rgb), 0.08)",
                                borderRadius: "6px",
                                padding: "8px",
                                border: "1px solid rgba(var(--interactive-accent-rgb), 0.15)",
                            }}>
                                <div style={{
                                    fontWeight: 600,
                                    marginBottom: "4px",
                                    fontSize: "0.8em",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    color: "var(--text-accent)",
                                }}>
                                    <span>🚪</span>
                                    <span>入场</span>
                                </div>
                                <ul style={{
                                    margin: 0,
                                    paddingLeft: "14px",
                                    fontSize: "0.8em",
                                    color: "var(--text-muted)"
                                }}>
                                    {currentStrategy.entryCriteria!.slice(0, 2).map((x, i) => (
                                        <li key={`entry-${i}`} style={{ marginBottom: "2px" }}>{x}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {(currentStrategy.stopLossRecommendation?.length ?? 0) > 0 && (
                            <div style={{
                                background: "rgba(239, 68, 68, 0.08)",
                                borderRadius: "6px",
                                padding: "8px",
                                border: "1px solid rgba(239, 68, 68, 0.15)",
                            }}>
                                <div style={{
                                    fontWeight: 600,
                                    marginBottom: "4px",
                                    fontSize: "0.8em",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    color: V5_COLORS.loss,
                                }}>
                                    <span>🛑</span>
                                    <span>止损</span>
                                </div>
                                <ul style={{
                                    margin: 0,
                                    paddingLeft: "14px",
                                    fontSize: "0.8em",
                                    color: "var(--text-muted)"
                                }}>
                                    {currentStrategy.stopLossRecommendation!.slice(0, 2).map((x, i) => (
                                        <li key={`stop-${i}`} style={{ marginBottom: "2px" }}>{x}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {(currentStrategy.riskAlerts?.length ?? 0) > 0 && (
                            <div style={{
                                background: "rgba(245, 158, 11, 0.08)",
                                borderRadius: "6px",
                                padding: "8px",
                                border: "1px solid rgba(245, 158, 11, 0.15)",
                            }}>
                                <div style={{
                                    fontWeight: 600,
                                    marginBottom: "4px",
                                    fontSize: "0.8em",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    color: V5_COLORS.back,
                                }}>
                                    <span>⚠️</span>
                                    <span>风险</span>
                                </div>
                                <ul style={{
                                    margin: 0,
                                    paddingLeft: "14px",
                                    fontSize: "0.8em",
                                    color: "var(--text-muted)"
                                }}>
                                    {currentStrategy.riskAlerts!.slice(0, 2).map((x, i) => (
                                        <li key={`risk-${i}`} style={{ marginBottom: "2px" }}>{x}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {(currentStrategy.takeProfitRecommendation?.length ?? 0) > 0 && (
                            <div style={{
                                background: "rgba(16, 185, 129, 0.08)",
                                borderRadius: "6px",
                                padding: "8px",
                                border: "1px solid rgba(16, 185, 129, 0.15)",
                            }}>
                                <div style={{
                                    fontWeight: 600,
                                    marginBottom: "4px",
                                    fontSize: "0.8em",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "4px",
                                    color: V5_COLORS.win,
                                }}>
                                    <span>🎯</span>
                                    <span>目标</span>
                                </div>
                                <ul style={{
                                    margin: 0,
                                    paddingLeft: "14px",
                                    fontSize: "0.8em",
                                    color: "var(--text-muted)"
                                }}>
                                    {currentStrategy.takeProfitRecommendation!.slice(0, 2).map((x, i) => (
                                        <li key={`tp-${i}`} style={{ marginBottom: "2px" }}>{x}</li>
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
                <div
                    style={{
                        color: "var(--text-faint)",
                        fontSize: "0.9em",
                        padding: "12px",
                        textAlign: "center"
                    }}
                >
                    未找到匹配策略。请在上方"策略推荐"中选择或手动填写。
                </div>
            )}
        </div>
    );
};
