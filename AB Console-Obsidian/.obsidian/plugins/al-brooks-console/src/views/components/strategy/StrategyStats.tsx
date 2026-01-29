import * as React from "react";
import type { StrategyStatsProps } from "../../../types";

/**
 * 策略统计组件 - 水平紧凑布局
 */
export const StrategyStats: React.FC<StrategyStatsProps> = ({
  total,
  activeCount,
  learningCount,
  totalUses,
  onFilter,
}) => {
  const stats = [
    { label: "总策略", value: total, key: "all", color: "var(--text-normal)" },
    { label: "实战", value: activeCount, key: "active", color: "#10b981" },
    { label: "学习", value: learningCount, key: "learning", color: "var(--text-muted)" },
    { label: "使用", value: totalUses, key: "uses", color: "var(--interactive-accent)" },
  ];

  return (
    <div style={{
      display: "flex",
      gap: "12px",
      alignItems: "center",
      flexWrap: "wrap",
    }}>
      {stats.map(stat => (
        <div
          key={stat.key}
          onClick={() => onFilter?.(stat.key)}
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "4px",
            cursor: "pointer",
            padding: "2px 0",
          }}
        >
          <span style={{
            fontSize: "1.1em",
            fontWeight: 700,
            color: stat.color,
          }}>
            {stat.value}
          </span>
          <span style={{
            fontSize: "0.8em",
            color: "var(--text-muted)",
          }}>
            {stat.label}
          </span>
        </div>
      ))}
    </div>
  );
};
