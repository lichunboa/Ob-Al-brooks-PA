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

    return (
        <div className="pa-dashboard" >
            <div className="pa-card-header" style={{ marginBottom: "20px", borderBottom: "none" }}>
                <h3 className="pa-card-title">策略仓库 (Strategy Repository)</h3>
                <div style={{ display: "flex", gap: "8px" }}>
                    <select
                        value={cycleFilter}
                        onChange={(e) => setCycleFilter(e.target.value)}
                        className="pa-input"
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
                        className="pa-input"
                    />
                </div>
            </div>

            <div className="pa-strategy-grid">
                {filtered.map((s) => (
                    <div
                        key={s.path}
                        className="pa-card pa-strategy-item"
                        onClick={() => onOpenFile(s.path)}
                    >
                        <div className="pa-strategy-title">
                            {s.canonicalName || s.name}
                        </div>

                        {(s.marketCycles.length > 0 || s.setupCategories.length > 0) && (
                            <div style={{ display: "flex", flexWrap: "wrap", marginBottom: "4px" }}>
                                {s.marketCycles.map((c) => (
                                    <span key={c} className="pa-tag">
                                        {c}
                                    </span>
                                ))}
                                {s.setupCategories.map((c) => (
                                    <span
                                        key={c}
                                        className="pa-tag"
                                        style={{ color: "var(--text-normal)" }}
                                    >
                                        {c}
                                    </span>
                                ))}
                            </div>
                        )}

                        {s.patternsObserved.length > 0 && (
                            <div className="pa-text-faint" style={{ fontSize: "0.85em" }}>
                                {s.patternsObserved.length} 个关联形态
                            </div>
                        )}
                    </div>
                ))}
                {filtered.length === 0 && (
                    <div className="pa-text-muted" style={{ gridColumn: "1/-1" }}>
                        未找到匹配的策略。
                    </div>
                )}
            </div>
        </div >
    );
};
