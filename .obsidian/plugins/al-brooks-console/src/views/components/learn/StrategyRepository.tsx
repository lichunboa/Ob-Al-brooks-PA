import * as React from "react";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { StrategyStats } from "../strategy/StrategyStats";
import { StrategyList } from "../strategy/StrategyList";
import { calculateMastery, getMasteryColor, getMasteryLabel } from "../../../utils/strategy-mastery-utils";

import { matchStrategies } from "../../../core/strategy-matcher";
import type { StrategyIndex } from "../../../core/strategy-index";

/**
 * StrategyRepository Props接口
 */
export interface StrategyRepositoryProps {
    // 数据Props
    strategyStats: any;
    strategyIndex: StrategyIndex;
    strategies: any[];
    strategyPerf: any;
    playbookPerfRows: any[];
    todayMarketCycle: string;

    // 函数Props
    openFile: (path: string) => void;
    isActive: (statusRaw: string) => boolean;

    // 样式Props
    textButtonStyle: React.CSSProperties;
    textButtonNoWrapStyle: React.CSSProperties;

    // 常量Props
    V5_COLORS: any;
}

/**
 * 策略仓库组件
 * 显示策略统计、今日推荐、策略列表和作战手册表现
 */
export const StrategyRepository: React.FC<StrategyRepositoryProps> = ({
    strategyStats,
    strategyIndex,
    strategies,
    strategyPerf,
    playbookPerfRows,
    todayMarketCycle,
    openFile,
    isActive,
    textButtonStyle,
    textButtonNoWrapStyle,
    V5_COLORS,
}) => {
    return (
        <div
            style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "10px",
                padding: "12px",
                marginBottom: "16px",
                background: "var(--background-primary)",
            }}
        >
            <div style={{ fontWeight: 600, marginBottom: "10px" }}>
                策略仓库
                <span style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                    {" "}
                    （作战手册/Playbook）
                </span>
            </div>

            <div style={{ marginBottom: "10px" }}>
                <StrategyStats
                    total={strategyStats.total}
                    activeCount={strategyStats.activeCount}
                    learningCount={strategyStats.learningCount}
                    totalUses={strategyStats.totalUses}
                    onFilter={(f: string) => {
                        // TODO: wire filtering state to StrategyList (future task)
                        console.log("策略过滤：", f);
                    }}
                />
            </div>

            {(() => {
                const cycle = (todayMarketCycle ?? "").trim();
                if (!cycle) {
                    return (
                        <div
                            style={{
                                margin: "-6px 0 10px 0",
                                padding: "10px 12px",
                                background: "rgba(var(--mono-rgb-100), 0.03)",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "8px",
                                color: "var(--text-faint)",
                                fontSize: "0.9em",
                            }}
                        >
                            今日市场周期未设置（可在 今日/Today 里补充）。
                        </div>
                    );
                }

                const picks = matchStrategies(strategyIndex, {
                    marketCycle: cycle,
                    limit: 6,
                }).filter((s) => isActive((s as any).statusRaw));

                return (
                    <div
                        style={{
                            margin: "-6px 0 10px 0",
                            padding: "10px 12px",
                            background: "rgba(var(--mono-rgb-100), 0.03)",
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: "8px",
                        }}
                    >
                        <div
                            style={{
                                fontWeight: 600,
                                fontSize: "0.85em",
                                marginBottom: 8,
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                            }}
                        >
                            <span>🌊</span>
                            <span>今日市场周期:</span>
                            <span style={{ color: "var(--text-accent)", fontWeight: 700 }}>
                                {cycle}
                            </span>
                        </div>
                        {picks.length > 0 ? (
                            <>
                                <div style={{
                                    fontSize: "0.8em",
                                    color: "var(--text-muted)",
                                    marginBottom: "6px"
                                }}>
                                    推荐优先关注 ({picks.length})
                                </div>
                                {/* 两列网格 */}
                                <div style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "4px"
                                }}>
                                    {picks.map((s) => (
                                        <div
                                            key={`pb-pick-${s.path}`}
                                            onClick={() => openFile(s.path)}
                                            style={{
                                                padding: "6px 8px",
                                                background: "var(--background-primary)",
                                                borderRadius: "4px",
                                                border: "1px solid var(--background-modifier-border)",
                                                fontSize: "0.8em",
                                                cursor: "pointer",
                                                transition: "all 0.15s ease",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.background = "rgba(var(--interactive-accent-rgb), 0.1)";
                                                e.currentTarget.style.borderColor = "var(--interactive-accent)";
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.background = "var(--background-primary)";
                                                e.currentTarget.style.borderColor = "var(--background-modifier-border)";
                                            }}
                                        >
                                            {String(s.canonicalName || s.name)}
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div style={{ fontSize: "0.85em", color: "var(--text-faint)" }}>
                                暂无匹配的实战策略
                            </div>
                        )}
                    </div>
                );
            })()}
            {/* 策略掌握度概览 */}
            {(() => {
                // 获取实战策略的掌握度
                const activeStrategies = strategies.filter(s => isActive(s.statusRaw || ''));
                if (activeStrategies.length === 0) return null;

                const masteryData = activeStrategies.slice(0, 8).map(s => {
                    const perf = strategyPerf?.get(s.canonicalName || s.name);
                    return calculateMastery({
                        strategyName: s.canonicalName || s.name,
                        winRate: perf ? Math.round((perf.wins / (perf.total || 1)) * 100) : 0,
                        tradeCount: perf?.total || 0,
                        avgR: perf?.avgR || 0,
                    });
                }).sort((a, b) => a.masteryScore - b.masteryScore);

                return (
                    <div style={{
                        margin: "10px 0",
                        padding: "10px 12px",
                        background: "rgba(var(--mono-rgb-100), 0.02)",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                    }}>
                        <div style={{
                            fontSize: "0.85em",
                            fontWeight: 600,
                            marginBottom: "8px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                        }}>
                            <span>📊</span>
                            <span>策略掌握度</span>
                            <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
                                （点击复习薄弱策略）
                            </span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {masteryData.map(m => (
                                <div
                                    key={m.strategyName}
                                    onClick={() => {
                                        const s = activeStrategies.find(x => (x.canonicalName || x.name) === m.strategyName);
                                        if (s?.path) openFile(s.path);
                                    }}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                        cursor: "pointer",
                                        padding: "4px 6px",
                                        borderRadius: "4px",
                                        transition: "background 0.15s",
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = "rgba(128,128,128,0.1)"}
                                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                >
                                    <div style={{
                                        width: "90px",
                                        fontSize: "0.8em",
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap"
                                    }}>
                                        {m.strategyName}
                                    </div>
                                    <div style={{
                                        flex: 1,
                                        height: "8px",
                                        background: "rgba(128,128,128,0.2)",
                                        borderRadius: "4px",
                                        overflow: "hidden",
                                    }}>
                                        <div style={{
                                            width: `${m.masteryScore}%`,
                                            height: "100%",
                                            background: getMasteryColor(m.masteryScore),
                                            borderRadius: "4px",
                                            transition: "width 0.3s ease",
                                        }} />
                                    </div>
                                    <div style={{
                                        width: "45px",
                                        fontSize: "0.75em",
                                        color: getMasteryColor(m.masteryScore),
                                        fontWeight: 600,
                                        textAlign: "right",
                                    }}>
                                        {m.masteryScore}%
                                    </div>
                                    <div style={{
                                        fontSize: "0.7em",
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        background: `${getMasteryColor(m.masteryScore)}22`,
                                        color: getMasteryColor(m.masteryScore),
                                        fontWeight: 600,
                                    }}>
                                        {getMasteryLabel(m.level)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })()}

            <div style={{ marginTop: "10px" }}>
                <StrategyList
                    strategies={strategies}
                    onOpenFile={openFile}
                    perf={strategyPerf}
                    showTitle={false}
                    showControls={false}
                />
            </div>

            <div
                style={{
                    marginTop: "16px",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--background-modifier-border)",
                }}
            >
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {(() => {
                        const quickPath =
                            "策略仓库 (Strategy Repository)/太妃方案/太妃方案.md";
                        return (
                            <InteractiveButton
                                interaction="text"
                                onClick={() => openFile(quickPath)}
                                style={{
                                    padding: "4px 10px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--background-modifier-border)",
                                    background: "rgba(var(--mono-rgb-100), 0.03)",
                                    color: "var(--text-accent)",
                                    fontSize: "0.85em",
                                    fontWeight: 700,
                                }}
                            >
                                📚 作战手册（Brooks Playbook）
                            </InteractiveButton>
                        );
                    })()}

                    <span
                        style={{
                            padding: "4px 10px",
                            borderRadius: "6px",
                            border: "1px solid var(--background-modifier-border)",
                            background: "rgba(var(--mono-rgb-100), 0.03)",
                            color: "var(--text-muted)",
                            fontSize: "0.85em",
                            fontWeight: 700,
                        }}
                    >
                        📖 Al Brooks经典（即将推出）
                    </span>
                </div>
            </div>
        </div>
    );
};
