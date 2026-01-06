import * as React from "react";
import type { StrategyCard } from "../../core/strategy-index";
import {
    GlassCard,
    StatusBadge,
    HeadingS,
    Label,
    COLORS,
    SPACE,
    TYPO
} from "../../ui/components/DesignSystem";

interface Props {
    strategies: StrategyCard[];
    onOpenFile: (path: string) => void;
    perf?: Map<
        string,
        { total: number; wins: number; pnl: number; lastDateIso: string }
    >;
    showTitle?: boolean;
    showControls?: boolean;
}

export const StrategyListFinal: React.FC<Props> = ({
    strategies,
    onOpenFile,
    perf,
    showTitle = true,
    showControls = true,
}) => {
    const [searchTerm, setSearchTerm] = React.useState("");
    const [cycleFilter, setCycleFilter] = React.useState("All");

    // --- Helpers ---
    const hasCJK = React.useCallback((str: unknown) => {
        if (typeof str !== "string") return false;
        return /[\u4e00-\u9fff]/.test(str);
    }, []);

    const cycleToCn = React.useCallback(
        (raw: unknown) => {
            const s0 = typeof raw === "string" ? raw.trim() : "";
            if (!s0) return "";
            if (hasCJK(s0)) return s0;
            if (s0.includes("/") || (s0.includes("(") && s0.endsWith(")"))) return s0;

            const key = s0.toLowerCase();
            const map: Record<string, string> = {
                range: "交易区间/Range",
                "trading range": "交易区间/Trading Range",
                trend: "趋势/Trend",
                pullback: "回调/Pullback",
                reversal: "反转/Reversal",
                breakout: "突破/Breakout",
                spike: "急速/Spike",
            };
            return map[key] || `待补充/${s0}`;
        },
        [hasCJK]
    );

    const statusToCn = React.useCallback(
        (raw: unknown) => {
            const s0 = typeof raw === "string" ? raw.trim() : "";
            if (!s0) return "学习中/Learning";
            if (hasCJK(s0) || s0.includes("/")) return s0;

            const s = s0.toLowerCase();
            if (s.includes("active") || s.includes("实战")) return "实战中/Active";
            if (
                s.includes("valid") ||
                s.includes("verify") ||
                s.includes("test") ||
                s.includes("验证")
            )
                return "验证中/Validating";
            if (
                s.includes("learn") ||
                s.includes("study") ||
                s.includes("read") ||
                s.includes("学习")
            )
                return "学习中/Learning";
            return `待补充/${s0}`;
        },
        [hasCJK]
    );

    const getStatusTone = (statusRaw: unknown): "success" | "neutral" | "warn" | "loss" => {
        const s = typeof statusRaw === "string" ? statusRaw.trim().toLowerCase() : "";
        if (s.includes("active") || s.includes("实战")) return "success";
        if (s.includes("valid") || s.includes("verify") || s.includes("验证")) return "warn";
        return "neutral"; // Learning
    };

    const isActive = React.useCallback((statusRaw: unknown) => {
        const s = typeof statusRaw === "string" ? statusRaw.trim() : "";
        if (!s) return false;
        return s.includes("实战") || s.toLowerCase().includes("active");
    }, []);

    // --- Filtering & Sorting ---
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
                    s.canonicalName.toLowerCase().includes(lower) ||
                    s.setupCategories.some((c) => c.toLowerCase().includes(lower))
            );
        }
        return out;
    }, [strategies, cycleFilter, searchTerm]);

    const grouped = React.useMemo(() => {
        const otherGroup = "📦 其他/未分类";
        const getPrimaryCycle = (s: StrategyCard): string => {
            const first = s.marketCycles?.[0];
            if (typeof first !== "string") return otherGroup;
            const out = cycleToCn(first);
            return out.trim().length ? out : otherGroup;
        };
        const perfOf = (s: StrategyCard) =>
            perf?.get(s.canonicalName) ??
            perf?.get(s.name) ??
            ({ total: 0, wins: 0, pnl: 0, lastDateIso: "" } as const);

        const sorted = [...filtered].sort((a, b) => {
            const aActive = isActive((a as any).statusRaw) ? 1 : 0;
            const bActive = isActive((b as any).statusRaw) ? 1 : 0;
            if (bActive !== aActive) return bActive - aActive;

            const pa = perfOf(a);
            const pb = perfOf(b);
            if ((pb.lastDateIso || "") !== (pa.lastDateIso || ""))
                return (pb.lastDateIso || "").localeCompare(pa.lastDateIso || "");
            if ((pb.total || 0) !== (pa.total || 0))
                return (pb.total || 0) - (pa.total || 0);
            return (a.canonicalName || a.name).localeCompare(b.canonicalName || b.name);
        });

        const by = new Map<string, StrategyCard[]>();
        const order: string[] = [];
        for (const s of sorted) {
            const g = getPrimaryCycle(s);
            if (!by.has(g)) {
                by.set(g, []);
                order.push(g);
            }
            by.get(g)!.push(s);
        }
        const ordered = order.filter((x) => x !== otherGroup);
        if (by.has(otherGroup)) ordered.push(otherGroup);
        return { by, ordered, otherGroup };
    }, [filtered, perf, isActive, cycleToCn]);

    // Styles
    const inputStyle: React.CSSProperties = {
        background: "var(--background-modifier-form-field)",
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "8px",
        padding: "6px 12px",
        color: "var(--text-normal)",
        outline: "none",
        fontSize: "0.9em",
        minWidth: "140px",
    };

    return (
        <div style={{ marginBottom: SPACE.xl }}>
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: SPACE.lg,
                    paddingBottom: SPACE.sm,
                    borderBottom: showTitle ? "1px solid var(--background-modifier-border)" : "none",
                }}
            >
                {showTitle ? (
                    <div style={{ ...TYPO.headingM, color: "var(--text-normal)" }}>
                        🔮 策略仓库 (Strategy Playbook)
                    </div>
                ) : <div />}

                {showControls ? (
                    <div style={{ display: "flex", gap: SPACE.sm }}>
                        <select
                            value={cycleFilter}
                            onChange={(e) => setCycleFilter(e.target.value)}
                            style={inputStyle}
                        >
                            <option value="All">所有周期 (All Cycles)</option>
                            {cycles.map((c) => (
                                <option key={c} value={c}>
                                    {cycleToCn(c) || c}
                                </option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="🔍 搜索策略..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={inputStyle}
                        />
                    </div>
                ) : null}
            </div>

            {/* List */}
            {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: SPACE.xl, color: "var(--text-muted)" }}>
                    🤷‍♂️ 未找到匹配的策略 (No strategies found)
                </div>
            ) : (
                grouped.ordered.map((groupName) => {
                    const items = grouped.by.get(groupName) ?? [];
                    if (items.length === 0) return null;
                    return (
                        <div key={`group-${groupName}`} style={{ marginBottom: SPACE.lg }}>
                            <Label style={{ marginBottom: SPACE.sm, color: COLORS.accent, opacity: 0.9 }}>
                                {groupName} ({items.length})
                            </Label>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                                    gap: SPACE.md,
                                }}
                            >
                                {items.map((s) => {
                                    const p = perf?.get(s.canonicalName) ?? perf?.get(s.name) ?? { total: 0, wins: 0, pnl: 0, lastDateIso: "" };
                                    const wr = p.total > 0 ? Math.round((p.wins / p.total) * 100) : 0;
                                    const active = isActive((s as any).statusRaw);
                                    const statusLabel = statusToCn((s as any).statusRaw);
                                    const statusTone = getStatusTone((s as any).statusRaw);

                                    const lastDate = p.lastDateIso
                                        ? p.lastDateIso.slice(5, 10)
                                        : "";

                                    return (
                                        <GlassCard
                                            key={s.path}
                                            onClick={() => onOpenFile(s.path)}
                                            hoverEffect={true}
                                            style={{
                                                padding: SPACE.md,
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: SPACE.xs,
                                                // EXPLICT BORDERS FOR VISIBILITY
                                                border: active
                                                    ? `1px solid ${COLORS.win}`
                                                    : "1px solid var(--background-modifier-border)",
                                                background: active
                                                    ? "rgba(16, 185, 129, 0.05)"
                                                    : "var(--background-secondary)", // Fallback to secondary bg if glass is too subtle
                                                boxShadow: "var(--shadow-s)",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "flex-start",
                                                    justifyContent: "space-between",
                                                    gap: SPACE.sm,
                                                    marginBottom: "2px",
                                                }}
                                            >
                                                <HeadingS style={{
                                                    fontSize: "1.05em",
                                                    lineHeight: "1.3",
                                                    flex: "1",
                                                    wordBreak: "break-word"
                                                }}>
                                                    {s.canonicalName || s.name}
                                                </HeadingS>

                                                <div style={{
                                                    textAlign: "right",
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "flex-end",
                                                    minWidth: "60px"
                                                }}>
                                                    <span style={{
                                                        ...TYPO.numeric,
                                                        fontSize: "1.1em",
                                                        fontWeight: 700,
                                                        color: wr >= 50 ? COLORS.win : COLORS.loss,
                                                        opacity: p.total > 0 ? 1 : 0.3
                                                    }}>
                                                        {p.total > 0 ? `${wr}%` : "--"}
                                                    </span>
                                                    {p.total > 0 && (
                                                        <span style={{ ...TYPO.caption, fontSize: "0.75em" }}>
                                                            {p.total} 次
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "space-between",
                                                    marginTop: "auto",
                                                    paddingTop: SPACE.sm
                                                }}
                                            >
                                                <StatusBadge
                                                    label={statusLabel.split("/")[0]}
                                                    tone={statusTone}
                                                />

                                                {lastDate && (
                                                    <span style={{ ...TYPO.caption, color: "var(--text-faint)" }}>
                                                        📅 {lastDate}
                                                    </span>
                                                )}
                                            </div>

                                            {s.patternsObserved.length > 0 && (
                                                <div style={{ ...TYPO.caption, marginTop: "2px", display: "flex", gap: "6px", alignItems: "center" }}>
                                                    <span>📐 {s.patternsObserved.length} 形态</span>
                                                </div>
                                            )}
                                        </GlassCard>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
};
