import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { MarketStateMachine } from "../../../core/market-state-machine";

/**
 * ReviewHintsPanel Props接口
 */
export interface ReviewHintsPanelProps {
    latestTrade: TradeRecord | null;
    reviewHints: Array<{ id: string; zh: string; en: string }>;
    todayMarketCycle?: string; // 新增:今日市场周期
}

/**
 * 复盘提示面板组件
 * 显示市场状态预测和最新交易的复盘提示
 */
export const ReviewHintsPanel: React.FC<ReviewHintsPanelProps> = ({
    latestTrade,
    reviewHints,
    todayMarketCycle,
}) => {
    const stateMachine = React.useMemo(() => new MarketStateMachine(), []);

    const guidance = React.useMemo(() => {
        if (!todayMarketCycle) return null;
        const state = stateMachine.inferState(todayMarketCycle);
        return stateMachine.generateGuidance(state);
    }, [todayMarketCycle, stateMachine]);

    // 如果既没有市场预测也没有复盘提示,不显示
    if (!guidance && (!latestTrade || reviewHints.length === 0)) {
        return null;
    }

    return (
        <div style={{ marginBottom: "16px" }}>
            {/* 市场状态预测 */}
            {guidance && (
                <GlassPanel style={{ marginBottom: "12px" }}>
                    <div style={{
                        fontWeight: 600,
                        marginBottom: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px"
                    }}>
                        <span>🔮</span>
                        <span>智能预测导航</span>
                        <span style={{
                            fontSize: "0.85em",
                            fontWeight: 400,
                            color: "var(--text-muted)"
                        }}>
                            {guidance.stateLabel}
                        </span>
                    </div>

                    {/* 预期行为 */}
                    <div style={{
                        padding: "8px 12px",
                        background: guidance.tone === "success"
                            ? "rgba(76, 175, 80, 0.1)"
                            : guidance.tone === "danger"
                                ? "rgba(244, 67, 54, 0.1)"
                                : "rgba(255, 152, 0, 0.1)",
                        borderRadius: "4px",
                        marginBottom: "12px",
                        fontSize: "0.95em"
                    }}>
                        {guidance.expectation}
                    </div>

                    {/* 警告 */}
                    {guidance.warnings.length > 0 && (
                        <div style={{ marginBottom: "12px" }}>
                            {guidance.warnings.map((w, i) => (
                                <div key={i} style={{
                                    color: "var(--text-error)",
                                    fontSize: "0.9em",
                                    marginBottom: "4px"
                                }}>
                                    {w}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 推荐策略 */}
                    {guidance.recommendedStrategies.length > 0 && (
                        <div style={{ marginBottom: "8px" }}>
                            <span style={{
                                fontSize: "0.9em",
                                color: "var(--text-muted)",
                                marginRight: "8px"
                            }}>
                                推荐策略:
                            </span>
                            {guidance.recommendedStrategies.map((s, i) => (
                                <span key={i} style={{
                                    display: "inline-block",
                                    padding: "2px 8px",
                                    background: "var(--interactive-accent)",
                                    color: "var(--text-on-accent)",
                                    borderRadius: "12px",
                                    fontSize: "0.85em",
                                    marginRight: "6px",
                                    marginBottom: "4px"
                                }}>
                                    {s}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* 关键位 */}
                    {guidance.keyLevels.length > 0 && (
                        <div style={{ fontSize: "0.9em", color: "var(--text-muted)" }}>
                            {guidance.keyLevels.map((level, i) => (
                                <div key={i} style={{ marginBottom: "2px" }}>
                                    {level.type === "support" ? "📍" : level.type === "resistance" ? "🔺" : "🧲"}
                                    {" "}{level.description}: {level.level}
                                </div>
                            ))}
                        </div>
                    )}
                </GlassPanel>
            )}

            {/* 复盘提示 (可折叠) */}
            {latestTrade && reviewHints.length > 0 && (
                <details>
                    <summary
                        style={{
                            cursor: "pointer",
                            color: "var(--text-muted)",
                            fontSize: "0.95em",
                            userSelect: "none",
                            marginBottom: "8px",
                        }}
                    >
                        扩展(不参与旧版对照):复盘提示
                    </summary>
                    <GlassPanel>
                        <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                            复盘提示
                            <span
                                style={{
                                    fontWeight: 400,
                                    marginLeft: "8px",
                                    color: "var(--text-muted)",
                                    fontSize: "0.85em",
                                }}
                            >
                                {latestTrade.name}
                            </span>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: "18px" }}>
                            {reviewHints.slice(0, 4).map((h) => (
                                <li key={h.id} style={{ marginBottom: "6px" }}>
                                    <div>{h.zh}</div>
                                    <div
                                        style={{
                                            color: "var(--text-muted)",
                                            fontSize: "0.85em",
                                        }}
                                    >
                                        {h.en}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </GlassPanel>
                </details>
            )}
        </div>
    );
};
