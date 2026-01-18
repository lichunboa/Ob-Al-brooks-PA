import * as React from "react";
import type { StrategyCard } from "../../../core/strategy-index";
import {
    GlassCard,
    StatusBadge,
    HeadingM,
    Label
} from "../../../ui/components/DesignSystem";
import { COLORS, SPACE, TYPO } from "../../../ui/styles/theme";

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

export const StrategyList: React.FC<Props> = ({
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

            {/* List - 使用折叠分组 */}
            {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: SPACE.md, color: "var(--text-muted)", fontSize: "0.9em" }}>
                    🤷‍♂️ 未找到匹配的策略
                </div>
            ) : (
                grouped.ordered.map((groupName) => {
                    const items = grouped.by.get(groupName) ?? [];
                    if (items.length === 0) return null;

                    // 有活跃策略的分组默认展开
                    const hasActive = items.some(s => isActive((s as any).statusRaw));

                    return (
                        <details
                            key={`group-${groupName}`}
                            open={hasActive}
                            style={{
                                marginBottom: "6px",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "6px",
                                background: "rgba(var(--mono-rgb-100), 0.02)",
                            }}
                        >
                            <summary style={{
                                cursor: "pointer",
                                padding: "8px 10px",
                                fontWeight: 600,
                                fontSize: "0.85em",
                                listStyle: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                color: COLORS.accent,
                            }}>
                                <span>{groupName}</span>
                                <span style={{
                                    fontSize: "0.85em",
                                    color: "var(--text-muted)",
                                    fontWeight: 400,
                                    background: "var(--background-modifier-border)",
                                    padding: "1px 6px",
                                    borderRadius: "4px"
                                }}>
                                    {items.length}
                                </span>
                            </summary>

                            {/* 策略列表 */}
                            <div style={{
                                padding: "6px 8px 8px",
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                            }}>
                                {items.map((s) => {
                                    const p = perf?.get(s.canonicalName) ?? perf?.get(s.name) ?? { total: 0, wins: 0, pnl: 0, lastDateIso: "" };
                                    const wr = p.total > 0 ? Math.round((p.wins / p.total) * 100) : 0;
                                    const active = isActive((s as any).statusRaw);

                                    return (
                                        <div
                                            key={s.path}
                                            onClick={() => onOpenFile(s.path)}
                                            style={{
                                                padding: "10px 12px",
                                                background: active
                                                    ? "rgba(16, 185, 129, 0.08)"
                                                    : "var(--background-primary)",
                                                borderRadius: "8px",
                                                border: active
                                                    ? `1px solid ${COLORS.win}`
                                                    : "1px solid var(--background-modifier-border)",
                                                cursor: "pointer",
                                                transition: "all 0.15s ease",
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!active) {
                                                    e.currentTarget.style.background = "rgba(var(--interactive-accent-rgb), 0.08)";
                                                    e.currentTarget.style.borderColor = "var(--interactive-accent)";
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!active) {
                                                    e.currentTarget.style.background = "var(--background-primary)";
                                                    e.currentTarget.style.borderColor = "var(--background-modifier-border)";
                                                }
                                            }}
                                        >
                                            {/* 第一行：名称 + 状态 */}
                                            <div style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px",
                                                marginBottom: (p.total > 0 || s.riskReward) ? "6px" : 0
                                            }}>
                                                <span style={{
                                                    fontWeight: 600,
                                                    color: active ? COLORS.win : "var(--text-normal)",
                                                    fontSize: "0.9em",
                                                }}>
                                                    {s.canonicalName || s.name}
                                                </span>
                                                <span style={{
                                                    fontSize: "0.7em",
                                                    padding: "2px 6px",
                                                    borderRadius: "4px",
                                                    background: active ? COLORS.win : "var(--text-accent)",
                                                    color: "white",
                                                    fontWeight: 600,
                                                    whiteSpace: "nowrap",
                                                }}>
                                                    {active ? "实战中" : "学习中"}
                                                </span>
                                            </div>

                                            {/* 第二行：指标信息 */}
                                            {(p.total > 0 || s.riskReward) && (
                                                <div style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "12px",
                                                    fontSize: "0.8em",
                                                    color: "var(--text-muted)",
                                                }}>
                                                    {s.riskReward && (
                                                        <span>📊 R/R: <b>{s.riskReward}</b></span>
                                                    )}
                                                    {p.total > 0 && (
                                                        <>
                                                            <span>
                                                                ✓ 胜率: <b style={{ color: wr >= 50 ? COLORS.win : COLORS.loss }}>{wr}%</b>
                                                            </span>
                                                            <span>📅 使用: <b>{p.total}次</b></span>
                                                            {p.lastDateIso && (
                                                                <span>● 最近: {p.lastDateIso.slice(0, 10)}</span>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </details>
                    );
                })
            )}
        </div>
    );
};
