import * as React from "react";
import type { App, TFile } from "obsidian";
import type { TradeRecord } from "../../../core/contracts";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { MarketStateMachine } from "../../../core/market-state-machine";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";

/**
 * ReviewHintsPanel Props接口
 */
export interface ReviewHintsPanelProps {
    latestTrade: TradeRecord | null;
    reviewHints: Array<{ id: string; zh: string; en: string }>;
    todayMarketCycle?: string; // 新增:今日市场周期
    app?: App; // 用于文件操作
}

/**
 * 复盘提示面板组件
 * 显示市场状态预测和最新交易的复盘提示
 */
export const ReviewHintsPanel: React.FC<ReviewHintsPanelProps> = ({
    latestTrade,
    reviewHints,
    todayMarketCycle,
    app,
}) => {
    const stateMachine = React.useMemo(() => new MarketStateMachine(), []);
    const [actionRunning, setActionRunning] = React.useState<string | null>(null);

    const guidance = React.useMemo(() => {
        if (!todayMarketCycle) return null;
        const state = stateMachine.inferState(todayMarketCycle);
        return stateMachine.generateGuidance(state);
    }, [todayMarketCycle, stateMachine]);

    // 如果既没有市场预测也没有复盘提示,不显示
    if (!guidance && (!latestTrade || reviewHints.length === 0)) {
        return null;
    }

    const handleHintAction = async (hintId: string) => {
        if (!app || !latestTrade || actionRunning) return;

        setActionRunning(hintId);
        try {
            const file = app.vault.getAbstractFileByPath(latestTrade.path);
            if (!file) throw new Error("File not found");

            // Define known actions
            if (hintId === "setup_missing") {
                // For setup category, we could use a modal, but for simplicity let's use a standard prompt or just direct link.
                // Ideally this should use an enum picker, but InteractiveButton typically just triggers functions.
                // Let's implement a simple text prompt for now as a fallback if no complex UI is available here.
                // A better UX would be to open the file properties, but we can't easily do that programmatically reliably across Obsidian versions.
                // Best approach: Open the file and maybe prompt user?
                // Or, reusing the 'input' modal logic from Dashboard if passed down. 
                // Since we don't have promptText prop here, we fall back to just opening the file so user can fill it.
                // Wait, "OpenTradeAssistant" has "smart guidance". 
                // If the user wants to "fill unfilled attributes", simply clicking to open the file is a good start,
                // but ideally providing a quick fill like in the ExecutionFillPanel would be better.
                // However, reproducing the Enum picker here is complex.
                // Let's just Open the file for now and show a Notice.
                await app.workspace.getLeaf(false).openFile(file as TFile);
                new (require('obsidian')).Notice("请在文档属性中补充 Setups/Setup Category");
            }
            else if (hintId === "cycle_missing") {
                await app.workspace.getLeaf(false).openFile(file as TFile);
                new (require('obsidian')).Notice("请在文档属性中补充 Market Cycle");
            }
            else if (hintId === "tf_missing") {
                await app.workspace.getLeaf(false).openFile(file as TFile);
                new (require('obsidian')).Notice("请在文档属性中补充 Timeframe");
            }
        } catch (e) {
            console.error(e);
            new (require('obsidian')).Notice("操作失败");
        } finally {
            setActionRunning(null);
        }
    };

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


        </div>
    );
};
