import * as React from "react";
import { GlassCard, StatusBadge } from "../../../ui/components/DesignSystem";
import { COLORS, SPACE, TYPO } from "../../../ui/styles/theme";
import { Button } from "../../../ui/components/Button";
import type { StrategyStatsProps } from "../../../types";

const StatCard: React.FC<{
  label: string;
  value: number | string;
  onClick?: () => void;
}> = ({ label, value, onClick }) => (
  <Button
    className="pa-stat-card"
    onClick={onClick}
    aria-label={label}
    variant="default"
    style={{ display: "flex", flexDirection: "column", height: "auto", padding: "8px 12px" }}
  >
    <div className="pa-stat-value">{value}</div>
    <div className="pa-stat-label">{label}</div>
  </Button>
);

export const StrategyStats: React.FC<StrategyStatsProps> = ({
  total,
  activeCount,
  learningCount,
  totalUses,
  onFilter,
}) => {
  return (
    <div className="pa-strategy-stats" role="region" aria-label="策略统计">
      <StatCard
        label="总策略"
        value={total}
        onClick={() => onFilter?.("all")}
      />
      <StatCard
        label="实战中"
        value={activeCount}
        onClick={() => onFilter?.("active")}
      />
      <StatCard
        label="学习中"
        value={learningCount}
        onClick={() => onFilter?.("learning")}
      />
      <StatCard
        label="使用次数"
        value={totalUses}
        onClick={() => onFilter?.("uses")}
      />
    </div>
  );
};


