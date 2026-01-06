import * as React from "react";
import type { StrategyCard } from "../../core/strategy-index";
import { GlassCard } from "../../ui/components/DesignSystem";
import { V5_COLORS } from "../../ui/tokens";

interface Props {
    strategies: StrategyCard[];
    onOpenFile: (path: string) => void;
    perf?: Map<
        string,
        { total: number; wins: number; pnl: number; lastDateIso: string }
    >;
    showTitle?: boolean;
}

export const StrategyListV2: React.FC<Props> = ({
    strategies,
    onOpenFile,
    perf,
    showTitle = true,
}) => {
    // --- Logic Copy (Sorting/Filtering) ---
    const [searchTerm, setSearchTerm] = React.useState("");
    const [cycleFilter, setCycleFilter] = React.useState("All");

    const isActive = React.useCallback((statusRaw: unknown) => {
        const s = typeof statusRaw === "string" ? statusRaw.trim() : "";
        if (!s) return false;
        return s.includes("实战") || s.toLowerCase().includes("active");
    }, []);

    const cycles = React.useMemo(() => {
        const s = new Set<string>();
        strategies.forEach((st) => st.marketCycles.forEach((c) => s.add(c)));
        return Array.from(s).sort();
    }, [strategies]);

    const filtered = React.useMemo(() => {
        let out = strategies;
        if (cycleFilter !== "All") {
            out = out.filter((s) => s.marketCycles.includes(cycleFilter));
        }
        if (searchTerm.trim()) {
            const lower = searchTerm.toLowerCase();
            out = out.filter(
                (s) =>
                    s.name.toLowerCase().includes(lower) ||
                    s.canonicalName.toLowerCase().includes(lower)
            );
        }
        return out;
    }, [strategies, cycleFilter, searchTerm]);

    const grouped = React.useMemo(() => {
        const otherGroup = "📦 其他/未分类";
        // Reuse basic grouping logic
        const by = new Map<string, StrategyCard[]>();
        const order: string[] = [];

        // Sort
        const sorted = [...filtered].sort((a, b) => {
            // Active first
            const aActive = isActive((a as any).statusRaw) ? 1 : 0;
            const bActive = isActive((b as any).statusRaw) ? 1 : 0;
            if (bActive !== aActive) return bActive - aActive;
            return (a.canonicalName || a.name).localeCompare(b.canonicalName || b.name);
        });

        for (const s of sorted) {
            const g = s.marketCycles?.[0] || otherGroup; // Simplified grouping for V2 test
            if (!by.has(g)) {
                by.set(g, []);
                order.push(g);
            }
            by.get(g)!.push(s);
        }
        return { by, ordered: order };
    }, [filtered, isActive]);

    // --- Rendering ---
    return (
        <div style={{ padding: "0 0 20px 0" }}>
            {/* V2 Header */}
            <div style={{ marginBottom: "16px", padding: "10px", borderBottom: "1px dashed rgba(255,255,255,0.2)" }}>
                <h3 style={{ margin: 0, color: V5_COLORS.accent }}>🚀 策略仓库 V2 (New Design Test)</h3>
                <div style={{ fontSize: "0.8em", opacity: 0.7 }}>如果这个列表样式正确，我们将移除下方的旧版本。</div>
            </div>

            {/* Grid */}
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {grouped.ordered.map((group) => (
                    <div key={group}>
                        <div style={{
                            fontSize: "0.9em",
                            fontWeight: 700,
                            marginBottom: "12px",
                            opacity: 0.8,
                            paddingLeft: "4px"
                        }}>
                            {group} ({grouped.by.get(group)?.length})
                        </div>

                        <div style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                            gap: "16px"
                        }}>
                            {grouped.by.get(group)?.map((s) => {
                                const p = perf?.get(s.canonicalName) ?? ({ total: 0, wins: 0, pnl: 0 } as any);
                                const wr = p.total > 0 ? Math.round((p.wins / p.total) * 100) : 0;
                                const active = isActive((s as any).statusRaw);

                                return (
                                    <GlassCard
                                        key={s.path}
                                        hoverEffect={true}
                                        onClick={() => onOpenFile(s.path)}
                                        style={{
                                            // FORCE VISIBILITY STYLES
                                            position: "relative",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "12px",
                                            padding: "20px",
                                            // Force a distinct background to PROVE it's there.
                                            // Using a semi-transparent dark tint that works on light and dark.
                                            backgroundColor: "var(--background-secondary)",
                                            border: "1px solid var(--background-modifier-border)",
                                            borderRadius: "16px",
                                            minHeight: "120px",
                                        }}
                                    >
                                        {/* Header: Title + WR */}
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                            <div style={{ fontWeight: 600, fontSize: "1.1em", color: "var(--text-normal)" }}>
                                                {s.canonicalName || s.name}
                                            </div>
                                            {p.total > 0 && (
                                                <div style={{
                                                    fontWeight: 800,
                                                    color: wr >= 50 ? V5_COLORS.win : V5_COLORS.loss,
                                                    fontSize: "1.1em"
                                                }}>
                                                    {wr}%
                                                </div>
                                            )}
                                        </div>

                                        {/* Tags / Meta */}
                                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", fontSize: "0.85em" }}>
                                            {active && (
                                                <span style={{
                                                    padding: "2px 8px",
                                                    borderRadius: "4px",
                                                    background: "rgba(16, 185, 129, 0.2)",
                                                    color: "#10B981",
                                                    fontWeight: 600
                                                }}>
                                                    实战中
                                                </span>
                                            )}
                                            <span style={{ color: "var(--text-muted)" }}>
                                                使用 {p.total} 次
                                            </span>
                                            {s.riskReward && (
                                                <span style={{ color: "var(--text-muted)" }}>
                                                    R/R: {s.riskReward}
                                                </span>
                                            )}
                                        </div>
                                    </GlassCard>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
