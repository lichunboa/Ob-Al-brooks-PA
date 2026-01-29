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
// SRS 卡片信息（用于学习进度关联）
interface SRSCardInfo {
    title: string;
    interval: number; // 间隔天数，越大表示掌握越好
    ease: number;
}

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
    // V3: SRS 学习进度关联
    srsCards?: SRSCardInfo[];
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
    srsCards = [], // V3: SRS 学习进度关联
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

    // V3引擎：动态策略推荐（替代硬编码）+ 历史表现加权 + SRS掌握度
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

        // 计算每个策略的历史表现 + SRS掌握度 并排序
        const withPerformance = dirFiltered.map(s => {
            // 优先使用 strategy，然后 canonicalName，最后 name
            const displayName = (s as any).strategy || (s as any).canonicalName || (s as any).name || "未命名";
            const strategyName = displayName.toLowerCase();
            if (!strategyName || strategyName === "未命名") {
                return { name: displayName, path: s.path, winRate: 0, tradeCount: 0, srsScore: 0 };
            }

            // 历史表现评分
            const relatedTrades = recentTrades.filter(t =>
                t.strategyName?.toLowerCase().includes(strategyName) ||
                strategyName.includes(t.strategyName?.toLowerCase() || "")
            );
            const wins = relatedTrades.filter(t => (t.netProfit ?? 0) > 0 || t.outcome === "win").length;
            const winRate = relatedTrades.length > 0 ? wins / relatedTrades.length : 0;

            // V3: SRS 掌握度评分 (-10 到 +10)
            // interval > 7天 表示掌握良好 (+5~+10)
            // interval < 3天 表示经常忘记 (-5~-10)
            let srsScore = 0;
            if (srsCards.length > 0) {
                const relatedSrsCards = srsCards.filter(card =>
                    card.title.toLowerCase().includes(strategyName) ||
                    strategyName.includes(card.title.toLowerCase())
                );
                if (relatedSrsCards.length > 0) {
                    const avgInterval = relatedSrsCards.reduce((sum, c) => sum + c.interval, 0) / relatedSrsCards.length;
                    if (avgInterval >= 14) srsScore = 10;       // 掌握很好
                    else if (avgInterval >= 7) srsScore = 5;    // 掌握良好
                    else if (avgInterval >= 3) srsScore = 0;    // 一般
                    else if (avgInterval >= 1) srsScore = -5;   // 需要复习
                    else srsScore = -10;                        // 经常忘记
                }
            }

            // 获取关联形态用于知识链接
            const patterns = (s as any).patterns || (s as any).patternsObserved || [];
            return {
                name: displayName,
                path: s.path,
                winRate: Math.round(winRate * 100),
                tradeCount: relatedTrades.length,
                srsScore,
                patterns: Array.isArray(patterns) ? patterns : [patterns]
            };
        });

        // 综合排序：有历史记录的优先，胜率高的优先，SRS掌握好的优先
        withPerformance.sort((a, b) => {
            // 1. 有历史记录的优先
            if (a.tradeCount > 0 && b.tradeCount === 0) return -1;
            if (a.tradeCount === 0 && b.tradeCount > 0) return 1;
            // 2. 胜率排序（权重 70%）
            const winRateDiff = (b.winRate - a.winRate) * 0.7;
            // 3. SRS掌握度排序（权重 30%）
            const srsDiff = (b.srsScore - a.srsScore) * 0.3;
            return winRateDiff + srsDiff;
        });

        return withPerformance.slice(0, 5);
    }, [activeMetadata, latestTrade, todayMarketCycle, strategies, recentTrades, srsCards]);

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


                    {/* 推荐策略和关联形态已移除 - 智能预测导航已提供更精准的信息 */}
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
