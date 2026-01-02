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
    <div
      style={{
        background: `rgba(var(--mono-rgb-100), 0.05)`, // Default obsidian card bg
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        minWidth: "120px",
        flex: "1 1 auto", // Responsive flex
      }}
    >
      <div
        style={{
          fontSize: "0.85rem",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
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
          fontSize: "1.8rem",
          fontWeight: "700",
          color: color,
          lineHeight: "1.2",
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
