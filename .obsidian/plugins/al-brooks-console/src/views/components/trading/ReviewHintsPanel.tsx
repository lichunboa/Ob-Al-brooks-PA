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
    activeMetadata?: { cycle?: string; direction?: string } | null; // NEW
    reviewHints: Array<{ id: string; zh: string; en: string }>;
    todayMarketCycle?: string; // 新增:今日市场周期
    app?: App; // 用于文件操作
    strategies?: any[]; // StrategyNoteFrontmatter[]
    openFile?: (path: string) => void;
    runCommand?: (id: string) => void;
}

/**
 * 复盘提示面板组件
 * 显示市场状态预测和最新交易的复盘提示
 */
export const ReviewHintsPanel: React.FC<ReviewHintsPanelProps> = ({
    latestTrade,
    activeMetadata,
    reviewHints,
    todayMarketCycle,
    app,
    strategies = [],
    openFile,
    runCommand,
}) => {
    const stateMachine = React.useMemo(() => new MarketStateMachine(), []);
    const [actionRunning, setActionRunning] = React.useState<string | null>(null);

    const guidance = React.useMemo(() => {
        // Fix: Do NOT mix contexts. If activeMetadata is present (even partially), use it exclusively for the source of truth.
        let cycle, direction;

        if (activeMetadata) {
            cycle = activeMetadata.cycle || todayMarketCycle; // Fallback to today only if active is partial? No, if active is open, it implies "Current Focus".
            // Actually, if activeMetadata is detecting a file, we should rely on IT.
            // If direction is empty in file, it means "Unknown/Neutral".
            cycle = activeMetadata.cycle;
            direction = activeMetadata.direction;
        } else {
            // Fallback to Latest Trade or Today's Plan
            cycle = latestTrade?.marketCycle || todayMarketCycle;
            direction = latestTrade?.direction;
        }

        // Debug Log
        console.log(`[ReviewHintsPanel] Guidance Input. Source: ${activeMetadata ? "ActiveFile" : "History/Plan"}. Cycle: "${cycle}", Direction: "${direction}"`);

        // Pass both cycle and direction to inferState
        return stateMachine.generateGuidance(
            stateMachine.inferState(cycle, direction)
        );
    }, [todayMarketCycle, latestTrade?.marketCycle, latestTrade?.direction, activeMetadata, stateMachine]);

    // 如果既没有市场预测(unknown且无guidance? impossible, always guidance) 也没有复盘提示
    // modified: If unknown AND no trade hints, we prefer to Show the "Unknown" state widget to prompt user.
    if (!guidance && (!latestTrade || reviewHints.length === 0)) {
        return null;
    }

    // Helper: Find strategy note by name/alias
    const findStrategy = (name: string) => {
        if (!strategies || strategies.length === 0) return null;
        const target = String(name).toLowerCase().trim();
        return strategies.find(s => {
            if (s.strategy && s.strategy.toLowerCase() === target) return true;
            if (s.aliases && s.aliases.some((a: string) => a.toLowerCase() === target)) return true;
            // Fuzzy/Partial match for "H1/H2" if strategy is just "H1" or "H2"?
            // Or if text says "H1/H2" and we have separate "H1" and "H2" notes?
            // Complex. For now, strict name/alias match.
            return false;
        });
    };

    const handleHintAction = async (hintId: string) => {
        if (!app || !latestTrade || actionRunning) return;

        setActionRunning(hintId);
        try {
            const file = app.vault.getAbstractFileByPath(latestTrade.path);
            if (!file) throw new Error("File not found");

            // Define known actions
            if (["setup_missing", "cycle_missing", "tf_missing"].includes(hintId)) {
                await app.workspace.getLeaf(false).openFile(file as TFile);
                new (require('obsidian')).Notice(`请在文档属性中补充 ${hintId.split('_')[0]}`);
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
                <GlassPanel style={{ marginBottom: "12px", borderLeft: guidance.state === 'unknown' ? '4px solid var(--text-muted)' : undefined }}>
                    <div style={{
                        fontWeight: 600,
                        marginBottom: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        justifyContent: "space-between"
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                        {/* Unknown State CTA */}
                        {guidance.state === 'unknown' && (
                            <InteractiveButton
                                interaction="lift"
                                style={{ fontSize: '0.8em', padding: '2px 8px' }}
                                onClick={() => {
                                    // Open Daily Note to set cycle
                                    if (runCommand) runCommand("daily-notes");
                                    else new (require('obsidian')).Notice("请打开每日笔记设置 Market Cycle");
                                }}
                            >
                                ✏️ 设置
                            </InteractiveButton>
                        )}
                    </div>

                    {/* 预期行为 */}
                    {guidance.expectation && (
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
                    )}

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

                    {/* 推荐策略 (Smart Linked) */}
                    {guidance.recommendedStrategies.length > 0 && (
                        <div style={{ marginBottom: "8px" }}>
                            <span style={{
                                fontSize: "0.9em",
                                color: "var(--text-muted)",
                                marginRight: "8px"
                            }}>
                                推荐策略:
                            </span>
                            {guidance.recommendedStrategies.map((sName, i) => {
                                // Try to find strategy note
                                const matched = findStrategy(sName);
                                if (matched && openFile) {
                                    return (
                                        <InteractiveButton
                                            key={i}
                                            interaction="lift"
                                            onClick={() => openFile(matched.path)}
                                            style={{
                                                display: "inline-block",
                                                padding: "2px 8px",
                                                background: "var(--interactive-accent)",
                                                color: "var(--text-on-accent)",
                                                borderRadius: "12px",
                                                fontSize: "0.85em",
                                                marginRight: "6px",
                                                marginBottom: "4px",
                                                border: "none",
                                                cursor: "pointer"
                                            }}
                                            title={`打开策略: ${matched.strategy}`}
                                        >
                                            {sName} ↗
                                        </InteractiveButton>
                                    );
                                }
                                // Fallback static
                                return (
                                    <span key={i} style={{
                                        display: "inline-block",
                                        padding: "2px 8px",
                                        background: "var(--background-secondary)", // Neutral background for unlinked
                                        color: "var(--text-normal)",
                                        borderRadius: "12px",
                                        fontSize: "0.85em",
                                        marginRight: "6px",
                                        marginBottom: "4px",
                                        border: "1px solid var(--background-modifier-border)"
                                    }}>
                                        {sName}
                                    </span>
                                );
                            })}
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
