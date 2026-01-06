import * as React from "react";
import type { StrategyStatsProps } from "./types";

const StatCard: React.FC<{
  label: string;
  value: number | string;
  onClick?: () => void;
  style?: React.CSSProperties;
}> = ({ label, value, onClick, style }) => (
  <button className="pa-stat-card" onClick={onClick} aria-label={label} style={style}>
    <div className="pa-stat-value">{value}</div>
    <div className="pa-stat-label">{label}</div>
  </button>
);

export const StrategyStats: React.FC<StrategyStatsProps & { activeFilter?: string }> = ({
  total,
  activeCount,
  learningCount,
  totalUses,
  onFilter,
  activeFilter = "all",
}) => {
  const getStyle = (key: string): React.CSSProperties | undefined => {
    if (activeFilter === key) {
      return {
        borderColor: "var(--interactive-accent)",
        background: "rgba(var(--interactive-accent-rgb), 0.1)",
      };
    }
    return undefined;
  };

  return (
    <div className="pa-strategy-stats" role="region" aria-label="策略统计">
      <StatCard
        label="总策略"
        value={total}
        onClick={() => onFilter?.("all")}
        style={getStyle("all")}
      />
      <StatCard
        label="实战中"
        value={activeCount}
        onClick={() => onFilter?.("active")}
        style={getStyle("active")}
      />
      <StatCard
        label="学习中"
        value={learningCount}
        onClick={() => onFilter?.("learning")}
        style={getStyle("learning")}
      />
      <StatCard
        label="使用次数"
        value={totalUses}
        onClick={() => onFilter?.("uses")}
        style={getStyle("uses")}
      />
    </div>
  );
};
