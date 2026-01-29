import * as React from "react";

interface StatsCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon?: string;
  color?: string;
}

export const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  subValue,
  icon,
  color = "var(--interactive-accent)",
}) => {
  return (
    <div className="pa-card" style={{ minWidth: "120px", flex: "1 1 auto" }}>
      <div
        style={{
          fontSize: "0.85rem",
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        {icon && <span>{icon}</span>}
        {title}
      </div>

      <div
        style={{
          fontSize: "1.65rem",
          fontWeight: 700,
          color: color,
          lineHeight: "1.15",
          marginTop: "2px",
        }}
      >
        {value}
      </div>

      {subValue && (
        <div style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>
          {subValue}
        </div>
      )}
    </div>
  );
};
