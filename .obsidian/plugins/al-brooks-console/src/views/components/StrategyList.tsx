import * as React from "react";
import type { StrategyCard } from "../../core/strategy-index";

interface Props {
    strategies: StrategyCard[];
    onOpenFile: (path: string) => void;
}

export const StrategyList: React.FC<Props> = ({ strategies, onOpenFile }) => {
    const [searchTerm, setSearchTerm] = React.useState("");
    const [cycleFilter, setCycleFilter] = React.useState("All");

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

    // Styles (Temporary inline styles until CSS is properly integrated)
    const cardStyle: React.CSSProperties = {
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "8px",
        padding: "12px",
        background: "var(--background-secondary)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        cursor: "pointer",
        transition: "transform 0.1s ease, box-shadow 0.1s ease",
    };

    const tagStyle: React.CSSProperties = {
        fontSize: "0.75em",
        padding: "2px 6px",
        borderRadius: "4px",
        background: "var(--background-modifier-form-field)",
        color: "var(--text-muted)",
    };

    return (
        <div style={{ marginTop: "24px" }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                }}
            >
                <h3 style={{ margin: 0 }}>策略仓库 (Strategy Repository)</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                    <select
                        value={cycleFilter}
                        onChange={(e) => setCycleFilter(e.target.value)}
                        style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            border: "1px solid var(--background-modifier-border)",
                            background: "var(--background-primary)",
                        }}
                    >
                        <option value="All">所有周期</option>
                        {cycles.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                    <input
                        type="text"
                        placeholder="搜索策略..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            padding: "4px 8px",
                            borderRadius: "4px",
                            border: "1px solid var(--background-modifier-border)",
                            background: "var(--background-primary)",
                        }}
                    />
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: "12px",
                }}
            >
                {filtered.map((s) => (
                    <div
                        key={s.path}
                        style={cardStyle}
                        onClick={() => onOpenFile(s.path)}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow =
                                "0 4px 12px rgba(0,0,0,0.1)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "none";
                            e.currentTarget.style.boxShadow = "none";
                        }}
                    >
                        <div
                            style={{
                                fontWeight: 600,
                                color: "var(--text-accent)",
                                fontSize: "1.05em",
                            }}
                        >
                            {s.canonicalName || s.name}
                        </div>

                        {(s.marketCycles.length > 0 || s.setupCategories.length > 0) && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                                {s.marketCycles.map((c) => (
                                    <span key={c} style={tagStyle}>
                                        {c}
                                    </span>
                                ))}
                                {s.setupCategories.map((c) => (
                                    <span
                                        key={c}
                                        style={{ ...tagStyle, color: "var(--text-normal)" }}
                                    >
                                        {c}
                                    </span>
                                ))}
                            </div>
                        )}

                        {s.patternsObserved.length > 0 && (
                            <div style={{ fontSize: "0.85em", color: "var(--text-faint)" }}>
                                {s.patternsObserved.length} 个关联形态
                            </div>
                        )}
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div style={{ color: "var(--text-muted)", gridColumn: "1/-1" }}>
                        未找到匹配的策略。
                    </div>
                )}
            </div>
        </div>
    );
};
