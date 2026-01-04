import * as React from "react";
import type { StrategyCard } from "../../core/strategy-index";

interface Props {
  strategies: StrategyCard[];
  onOpenFile: (path: string) => void;
  /** Optional perf stats keyed by canonical strategy name (computed from trades). */
  perf?: Map<string, { total: number; wins: number; pnl: number; lastDateIso: string }>;
  showTitle?: boolean;
}

export const StrategyList: React.FC<Props> = ({
  strategies,
  onOpenFile,
  perf,
  showTitle = true,
}) => {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [cycleFilter, setCycleFilter] = React.useState("All");

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
      if (s.includes("valid") || s.includes("verify") || s.includes("test") || s.includes("验证"))
        return "验证中/Validating";
      if (s.includes("learn") || s.includes("study") || s.includes("read") || s.includes("学习"))
        return "学习中/Learning";
      return `待补充/${s0}`;
    },
    [hasCJK]
  );

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
      if ((pb.total || 0) !== (pa.total || 0)) return (pb.total || 0) - (pa.total || 0);
      if ((pb.pnl || 0) !== (pa.pnl || 0)) return (pb.pnl || 0) - (pa.pnl || 0);
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

  return (
    <div className="pa-dashboard">
      <div
        className="pa-card-header"
        style={{ marginBottom: "20px", borderBottom: "none" }}
      >
        {showTitle ? (
          <h3 className="pa-card-title">策略仓库 (Strategy Repository)</h3>
        ) : null}
        <div style={{ display: "flex", gap: "8px" }}>
          <select
            value={cycleFilter}
            onChange={(e) => setCycleFilter(e.target.value)}
            className="pa-input"
          >
            <option value="All">所有周期</option>
            {cycles.map((c) => (
              <option key={c} value={c}>
                {cycleToCn(c) || c}
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

      {filtered.length === 0 ? (
        <div className="pa-text-muted">未找到匹配的策略。</div>
      ) : (
        grouped.ordered.map((groupName) => {
          const items = grouped.by.get(groupName) ?? [];
          if (items.length === 0) return null;
          return (
            <div key={`group-${groupName}`} style={{ marginBottom: "14px" }}>
              <div
                style={{
                  fontSize: "0.85em",
                  opacity: 0.75,
                  fontWeight: 700,
                  marginBottom: "8px",
                }}
              >
                {groupName} ({items.length})
              </div>

              <div className="pa-strategy-grid">
                {items.map((s) => {
                  const p =
                    perf?.get(s.canonicalName) ??
                    perf?.get(s.name) ??
                    ({ total: 0, wins: 0, pnl: 0, lastDateIso: "" } as const);
                  const wr = p.total > 0 ? Math.round((p.wins / p.total) * 100) : 0;
                  const active = isActive((s as any).statusRaw);
                  const statusLabel = statusToCn((s as any).statusRaw);
                  const lastDate = p.lastDateIso ? p.lastDateIso.slice(0, 10) : "";

                  return (
                    <div
                      key={s.path}
                      className="pa-card pa-strategy-item"
                      onClick={() => onOpenFile(s.path)}
                    >
                      <div className="pa-strategy-title">
                        {s.canonicalName || s.name}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                          flexWrap: "wrap",
                          marginBottom: "6px",
                          color: "var(--text-muted)",
                          fontSize: "0.85em",
                        }}
                      >
                        <span>{statusLabel}</span>
                        <span
                          style={{
                            fontFamily: "var(--font-monospace)",
                            fontVariantNumeric: "tabular-nums",
                            whiteSpace: "nowrap",
                          }}
                        >
                          <span
                            style={{
                              color:
                                wr > 50
                                  ? "var(--text-success)"
                                  : "var(--text-warning)",
                              fontWeight: 800,
                            }}
                          >
                            {wr}%
                          </span>{" "}
                          <span style={{ opacity: 0.7 }}>({p.total})</span>
                          {lastDate ? (
                            <>
                              <span style={{ opacity: 0.6 }}> · </span>
                              <span style={{ opacity: 0.85 }}>最近 {lastDate}</span>
                            </>
                          ) : null}
                        </span>
                      </div>

                      {(s.riskReward || p.total > 0) && (
                        <div
                          className="pa-text-faint"
                          style={{ fontSize: "0.78em", marginBottom: "6px" }}
                        >
                          {s.riskReward ? (
                            <span style={{ marginRight: "10px" }}>
                              📊 R/R: <strong>{s.riskReward}</strong>
                            </span>
                          ) : null}
                          {p.total > 0 ? (
                            <span>
                              🔢 使用: <strong>{p.total}次</strong>
                            </span>
                          ) : null}
                        </div>
                      )}

                      {(s.marketCycles.length > 0 || s.setupCategories.length > 0) && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            marginBottom: "4px",
                          }}
                        >
                          {s.marketCycles.map((c) => (
                            <span key={c} className="pa-tag">
                              {cycleToCn(c) || c}
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
                        <div
                          className="pa-text-faint"
                          style={{ fontSize: "0.85em" }}
                        >
                          {s.patternsObserved.length} 个关联形态
                        </div>
                      )}
                    </div>
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
