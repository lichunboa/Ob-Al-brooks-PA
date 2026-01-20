import * as React from "react";
import type { App, TFile } from "obsidian";
import type { TradeRecord } from "../../../core/contracts";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { MarketStateMachine } from "../../../core/market-state-machine";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { buildSmartAlerts, type SmartAlert, type StrategyNote } from "../../../core/smart-alert-engine";
import type { MemorySnapshot } from "../../../core/memory";

/**
 * ReviewHintsPanel Props接口
 */
export interface ReviewHintsPanelProps {
    latestTrade: TradeRecord | null;
    activeMetadata?: { cycle?: string; direction?: string } | null;
    reviewHints: Array<{ id: string; zh: string; en: string }>;
    todayMarketCycle?: string;
    app?: App;
    strategies?: StrategyNote[];
    openFile?: (path: string) => void;
    runCommand?: (id: string) => void;
    // 智能预警增强
    memory?: MemorySnapshot | null;
    recentTrades?: TradeRecord[];
    activeTags?: string[]; // 当前笔记标签
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
    memory,
    recentTrades = [],
    activeTags = [],
}) => {
    const stateMachine = React.useMemo(() => new MarketStateMachine(), []);
    const [actionRunning, setActionRunning] = React.useState<string | null>(null);

    const guidance = React.useMemo(() => {
        let cycle, direction;

        if (activeMetadata) {
            cycle = activeMetadata.cycle;
            direction = activeMetadata.direction;
        } else {
            cycle = latestTrade?.marketCycle || todayMarketCycle;
            direction = latestTrade?.direction;
        }

        console.log(`[ReviewHintsPanel] Guidance Input. Source: ${activeMetadata ? "ActiveFile" : "History/Plan"}. Cycle: "${cycle}", Direction: "${direction}"`);

        return stateMachine.generateGuidance(
            stateMachine.inferState(cycle, direction)
        );
    }, [todayMarketCycle, latestTrade?.marketCycle, latestTrade?.direction, activeMetadata, stateMachine]);

    // V3引擎：动态策略推荐（替代硬编码）+ 历史表现加权
    const dynamicStrategies = React.useMemo(() => {
        const cycle = activeMetadata?.cycle || latestTrade?.marketCycle || todayMarketCycle;
        const direction = activeMetadata?.direction || latestTrade?.direction;

        if (!cycle || strategies.length === 0) return [];

        // 从策略仓库中匹配符合当前市场周期的策略
        const matched = strategies.filter(s => {
            if (!s.marketCycles) return false;
            const cycles = Array.isArray(s.marketCycles) ? s.marketCycles : [s.marketCycles];
            const normalizedCycle = cycle.toString().toLowerCase();
            return cycles.some(c => normalizedCycle.includes(c.toString().toLowerCase()));
        });

        // 按方向过滤（如果有方向信息）
        const dirFiltered = direction
            ? matched.filter(s => !s.direction || s.direction.toString().toLowerCase().includes(direction.toString().toLowerCase()))
            : matched;

        // 计算每个策略的历史表现并排序
        const withPerformance = dirFiltered.map(s => {
            const strategyName = (s.strategy || "").toLowerCase();
            if (!strategyName) {
                return { name: s.strategy || "未命名", path: s.path, winRate: 0, tradeCount: 0 };
            }
            const relatedTrades = recentTrades.filter(t =>
                t.strategyName?.toLowerCase().includes(strategyName) ||
                strategyName.includes(t.strategyName?.toLowerCase() || "")
            );
            const wins = relatedTrades.filter(t => (t.netProfit ?? 0) > 0 || t.outcome === "win").length;
            const winRate = relatedTrades.length > 0 ? wins / relatedTrades.length : 0;
            return {
                name: s.strategy || "未命名",
                path: s.path,
                winRate: Math.round(winRate * 100),
                tradeCount: relatedTrades.length
            };
        });

        // 按胜率排序（有历史记录的优先，胜率高的优先）
        withPerformance.sort((a, b) => {
            if (a.tradeCount > 0 && b.tradeCount === 0) return -1;
            if (a.tradeCount === 0 && b.tradeCount > 0) return 1;
            return b.winRate - a.winRate;
        });

        return withPerformance.slice(0, 5);
    }, [activeMetadata, latestTrade, todayMarketCycle, strategies, recentTrades]);

    // 智能预警引擎
    const smartAlerts = React.useMemo(() => {
        const marketState = stateMachine.inferState(
            activeMetadata?.cycle || latestTrade?.marketCycle || todayMarketCycle,
            activeMetadata?.direction || latestTrade?.direction
        );

        return buildSmartAlerts({
            marketState,
            marketCycle: activeMetadata?.cycle || latestTrade?.marketCycle || todayMarketCycle,
            direction: activeMetadata?.direction || latestTrade?.direction,
            recentTrades,
            strategies: strategies as StrategyNote[],
            memory: memory || undefined,
            activeTags,
        });
    }, [activeMetadata, latestTrade, todayMarketCycle, recentTrades, strategies, memory, activeTags, stateMachine]);

    // 智能学习分析：根据最近交易分析薄弱点
    const smartLearning = React.useMemo(() => {
        if (!recentTrades || recentTrades.length < 3) return null;

        // 分析失败的交易模式
        const lossTrades = recentTrades.filter(t =>
            t.outcome === 'loss' || (t.netProfit ?? 0) < 0
        );

        if (lossTrades.length === 0) return null;

        // 统计失败原因（使用 setup 或 marketCycle 作为分析维度）
        const errorCounts: Record<string, number> = {};
        lossTrades.forEach(t => {
            // 使用策略名或市场周期作为分析维度
            const category = t.setupKey || t.strategyName || t.marketCycle || 'Unknown';
            errorCounts[category] = (errorCounts[category] || 0) + 1;
        });

        // 找到最常见的错误
        const sortedErrors = Object.entries(errorCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2);

        // 获取焦点文件
        const focusFile = memory?.focusFile;

        return {
            weakPoints: sortedErrors.map(([error, count]) => ({
                error,
                count,
                suggestion: `复习 "${error}" 相关概念`
            })),
            focusCard: focusFile ? {
                title: focusFile.name?.replace('.md', '') || '当前焦点',
                path: focusFile.path
            } : null
        };
    }, [recentTrades, memory]);

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
            {/* 智能预警 */}
            {smartAlerts.length > 0 && (
                <GlassPanel style={{ marginBottom: "12px", padding: "10px 12px" }}>
                    <div style={{
                        fontWeight: 600,
                        marginBottom: "8px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "0.9em"
                    }}>
                        <span>🚨</span>
                        <span>智能预警</span>
                        <span style={{
                            fontSize: "0.8em",
                            fontWeight: 400,
                            color: "var(--text-muted)",
                            background: "var(--background-modifier-form-field)",
                            padding: "1px 6px",
                            borderRadius: "8px"
                        }}>
                            {smartAlerts.length}
                        </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        {smartAlerts.slice(0, 5).map((alert, i) => (
                            <div
                                key={`alert-${i}`}
                                style={{
                                    padding: "6px 10px",
                                    borderRadius: "6px",
                                    fontSize: "0.85em",
                                    background: alert.type === 'warning'
                                        ? "rgba(239, 68, 68, 0.1)"
                                        : alert.type === 'learn'
                                            ? "rgba(59, 130, 246, 0.1)"
                                            : alert.type === 'strategy'
                                                ? "rgba(34, 197, 94, 0.1)"
                                                : "var(--background-modifier-form-field)",
                                    borderLeft: `3px solid ${alert.type === 'warning' ? 'var(--text-error)'
                                        : alert.type === 'learn' ? 'var(--text-accent)'
                                            : alert.type === 'strategy' ? 'var(--text-success)'
                                                : 'var(--text-muted)'
                                        }`,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px"
                                }}
                            >
                                <div style={{ fontWeight: 500 }}>{alert.message}</div>
                                {alert.detail && (
                                    <div style={{ fontSize: "0.9em", color: "var(--text-muted)" }}>
                                        {alert.detail}
                                    </div>
                                )}
                                {alert.action && openFile && alert.action.path && (
                                    <InteractiveButton
                                        interaction="text"
                                        onClick={async () => {
                                            // 先打开文件
                                            await openFile(alert.action!.path!);
                                            // 如果是学习类型，延迟后触发该笔记的 SRS 复习
                                            if (alert.type === 'learn' && runCommand) {
                                                setTimeout(() => {
                                                    runCommand('obsidian-spaced-repetition:srs-review-flashcards-in-note');
                                                }, 500);
                                            }
                                        }}
                                        style={{
                                            fontSize: "0.85em",
                                            color: "var(--interactive-accent)",
                                            padding: "2px 0",
                                            marginTop: "2px"
                                        }}
                                    >
                                        → {alert.action.label}
                                    </InteractiveButton>
                                )}
                                {alert.action && alert.action.command && runCommand && (
                                    <InteractiveButton
                                        interaction="text"
                                        onClick={() => runCommand(alert.action!.command!)}
                                        style={{
                                            fontSize: "0.85em",
                                            color: "var(--interactive-accent)",
                                            padding: "2px 0",
                                            marginTop: "2px"
                                        }}
                                    >
                                        → {alert.action.label}
                                    </InteractiveButton>
                                )}
                            </div>
                        ))}
                    </div>
                </GlassPanel>
            )}

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

                    {/* 推荐策略 (V3引擎 - 动态匹配) */}
                    {dynamicStrategies.length > 0 && (
                        <div style={{ marginBottom: "8px" }}>
                            <span style={{
                                fontSize: "0.9em",
                                color: "var(--text-muted)",
                                marginRight: "8px"
                            }}>
                                📊 推荐策略 ({dynamicStrategies.length}):
                            </span>
                            {dynamicStrategies.map((s, i) => (
                                <InteractiveButton
                                    key={i}
                                    interaction="lift"
                                    onClick={() => openFile?.(s.path)}
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: "4px",
                                        padding: "2px 8px",
                                        background: s.tradeCount > 0 && s.winRate >= 50 ? "rgba(16, 185, 129, 0.2)" : "var(--interactive-accent)",
                                        color: s.tradeCount > 0 && s.winRate >= 50 ? "#10B981" : "var(--text-on-accent)",
                                        borderRadius: "12px",
                                        fontSize: "0.85em",
                                        marginRight: "6px",
                                        marginBottom: "4px",
                                        border: s.tradeCount > 0 && s.winRate >= 50 ? "1px solid #10B981" : "none",
                                        cursor: "pointer"
                                    }}
                                    title={s.tradeCount > 0 ? `胜率: ${s.winRate}% (${s.tradeCount}次)` : `打开策略: ${s.name}`}
                                >
                                    {s.name}
                                    {s.tradeCount > 0 && (
                                        <span style={{
                                            fontSize: "0.8em",
                                            fontWeight: 600,
                                            opacity: 0.9
                                        }}>
                                            {s.winRate}%
                                        </span>
                                    )}
                                    ↗
                                </InteractiveButton>
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

                    {/* 智能学习建议 */}
                    {smartLearning && smartLearning.weakPoints.length > 0 && (
                        <div style={{
                            marginTop: "10px",
                            paddingTop: "10px",
                            borderTop: "1px solid var(--background-modifier-border)",
                            fontSize: "0.85em"
                        }}>
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                marginBottom: "6px",
                                color: "var(--text-muted)"
                            }}>
                                <span>📚</span>
                                <span>学习建议</span>
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                {smartLearning.weakPoints.map((wp, i) => (
                                    <span
                                        key={i}
                                        style={{
                                            padding: "2px 8px",
                                            background: "rgba(239, 68, 68, 0.1)",
                                            color: "var(--text-error)",
                                            borderRadius: "8px",
                                            fontSize: "0.9em"
                                        }}
                                    >
                                        {wp.error} ({wp.count}次失败)
                                    </span>
                                ))}
                            </div>
                            {smartLearning.focusCard && openFile && (
                                <div style={{ marginTop: "6px" }}>
                                    <InteractiveButton
                                        interaction="text"
                                        onClick={() => openFile(smartLearning.focusCard!.path)}
                                        style={{ fontSize: "0.9em", color: "var(--interactive-accent)" }}
                                    >
                                        🎯 当前焦点: {smartLearning.focusCard.title}
                                    </InteractiveButton>
                                </div>
                            )}
                        </div>
                    )}
                </GlassPanel>
            )}


        </div>
    );
};
