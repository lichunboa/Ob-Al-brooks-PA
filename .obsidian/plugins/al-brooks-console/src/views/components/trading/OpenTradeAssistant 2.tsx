import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import type { StrategyIndex } from "../../../core/strategy-index";
import { V5_COLORS } from "../../../ui/tokens";
import { glassInsetStyle } from "../../../ui/styles/dashboardPrimitives";
import { normalize } from "../../../utils/string-utils";

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
    openTradeStrategy: StrategyCard | null;
    todayMarketCycle?: string;
    strategyIndex: StrategyIndex;
    onOpenFile: (path: string) => void;
    // 样式和事件处理器
    textButtonStyle: React.CSSProperties;
    buttonStyle: React.CSSProperties;
    onTextBtnMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onTextBtnMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onTextBtnFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
    onTextBtnBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;
    onBtnMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onBtnMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => void;
    onBtnFocus: (e: React.FocusEvent<HTMLButtonElement>) => void;
    onBtnBlur: (e: React.FocusEvent<HTMLButtonElement>) => void;
}

/**
 * 持仓交易助手组件
 * 显示进行中的交易信息、策略建议、入场/止损/风险/目标提示、信号验证
 */
export const OpenTradeAssistant: React.FC<OpenTradeAssistantProps> = ({
    openTrade,
    openTradeStrategy,
    todayMarketCycle,
    strategyIndex,
    onOpenFile,
    textButtonStyle,
    buttonStyle,
    onTextBtnMouseEnter,
    onTextBtnMouseLeave,
    onTextBtnFocus,
    onTextBtnBlur,
    onBtnMouseEnter,
    onBtnMouseLeave,
    onBtnFocus,
    onBtnBlur,
}) => {
    if (!openTrade) return null;

    return (
        <div>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                进行中交易助手
            </div>
            <div
                style={{
                    color: "var(--text-muted)",
                    fontSize: "0.9em",
                    marginBottom: "8px",
                }}
            >
                <button
                    type="button"
                    onClick={() => onOpenFile(openTrade.path)}
                    style={textButtonStyle}
                    onMouseEnter={onTextBtnMouseEnter}
                    onMouseLeave={onTextBtnMouseLeave}
                    onFocus={onTextBtnFocus}
                    onBlur={onTextBtnBlur}
                >
                    {openTrade.ticker ?? "未知"} • {openTrade.name}
                </button>
            </div>

            {openTradeStrategy ? (
                <div>
                    <div style={{ marginBottom: "8px" }}>
                        策略:{" "}
                        <button
                            type="button"
                            onClick={() => onOpenFile(openTradeStrategy.path)}
                            style={textButtonStyle}
                            onMouseEnter={onTextBtnMouseEnter}
                            onMouseLeave={onTextBtnMouseLeave}
                            onFocus={onTextBtnFocus}
                            onBlur={onTextBtnBlur}
                        >
                            {openTradeStrategy.canonicalName}
                        </button>
                    </div>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns:
                                "repeat(auto-fit, minmax(220px, 1fr))",
                            gap: "8px",
                        }}
                    >
                        {(openTradeStrategy.entryCriteria?.length ?? 0) > 0 && (
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
                                    {openTradeStrategy
                                        .entryCriteria!.slice(0, 3)
                                        .map((x, i) => (
                                            <li key={`entry-${i}`}>{x}</li>
                                        ))}
                                </ul>
                            </div>
                        )}
                        {(openTradeStrategy.stopLossRecommendation?.length ?? 0) >
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
                                        {openTradeStrategy
                                            .stopLossRecommendation!.slice(0, 3)
                                            .map((x, i) => (
                                                <li key={`stop-${i}`}>{x}</li>
                                            ))}
                                    </ul>
                                </div>
                            )}
                        {(openTradeStrategy.riskAlerts?.length ?? 0) > 0 && (
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
                                    {openTradeStrategy
                                        .riskAlerts!.slice(0, 3)
                                        .map((x, i) => (
                                            <li key={`risk-${i}`}>{x}</li>
                                        ))}
                                </ul>
                            </div>
                        )}
                        {(openTradeStrategy.takeProfitRecommendation?.length ??
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
                                        {openTradeStrategy
                                            .takeProfitRecommendation!.slice(0, 3)
                                            .map((x, i) => (
                                                <li key={`tp-${i}`}>{x}</li>
                                            ))}
                                    </ul>
                                </div>
                            )}
                    </div>

                    {(() => {
                        const curSignals = (openTrade.signalBarQuality ?? [])
                            .map((s) => String(s).trim())
                            .filter(Boolean);
                        const reqSignals = (
                            openTradeStrategy.signalBarQuality ?? []
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
                        openTrade.marketCycle ?? todayMarketCycle
                    )
                        ?.toString()
                        .trim();
                    const marketCycle = marketCycleRaw
                        ? marketCycleRaw.includes("(")
                            ? marketCycleRaw.split("(")[0].trim()
                            : marketCycleRaw
                        : undefined;
                    const setupCategory = openTrade.setupCategory
                        ?.toString()
                        .trim();
                    const setupKey = openTrade.setupKey?.toString().trim();
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
                                    <button
                                        key={`today-fallback-${s.path}`}
                                        type="button"
                                        onClick={() => onOpenFile(s.path)}
                                        style={buttonStyle}
                                        onMouseEnter={onBtnMouseEnter}
                                        onMouseLeave={onBtnMouseLeave}
                                        onFocus={onBtnFocus}
                                        onBlur={onBtnBlur}
                                    >
                                        {s.canonicalName}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })()
            )}
        </div>
    );
};
