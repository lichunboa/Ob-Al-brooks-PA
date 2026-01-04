import type { CSSProperties } from "react";

export const SPACE = {
  xs: "6px",
  sm: "8px",
  md: "10px",
  lg: "12px",
  xl: "14px",
  xxl: "16px",
} as const;

export const buttonStyle: CSSProperties = {
  marginLeft: "8px",
  padding: "4px 9px",
  fontSize: "0.8em",
  border: "1px solid var(--background-modifier-border)",
  borderRadius: "6px",
  background: "var(--background-primary)",
  color: "var(--text-normal)",
  cursor: "pointer",
  outline: "none",
  transition:
    "background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
};

export const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  opacity: 0.5,
  cursor: "not-allowed",
};

export const buttonSmStyle: CSSProperties = {
  ...buttonStyle,
  padding: "5px 9px",
};

export const buttonSmDisabledStyle: CSSProperties = {
  ...disabledButtonStyle,
  padding: "5px 9px",
};

export const tabButtonStyle: CSSProperties = {
  padding: "5px 9px",
  fontSize: "0.85em",
  border: "1px solid var(--background-modifier-border)",
  borderRadius: "999px",
  background: "var(--background-primary)",
  color: "var(--text-muted)",
  cursor: "pointer",
  outline: "none",
  transition:
    "background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
};

export const activeTabButtonStyle: CSSProperties = {
  ...tabButtonStyle,
  background: "var(--interactive-accent)",
  borderColor: "var(--interactive-accent)",
  color: "var(--text-on-accent)",
  fontWeight: 800,
};

export const selectStyle: CSSProperties = {
  padding: "4px 8px",
  fontSize: "0.85em",
  border: "1px solid var(--background-modifier-border)",
  borderRadius: "6px",
  background: "var(--background-primary)",
  color: "var(--text-normal)",
};

export const textButtonStyle: CSSProperties = {
  padding: "2px 4px",
  border: "none",
  background: "transparent",
  color: "var(--text-accent)",
  cursor: "pointer",
  textAlign: "left",
  borderRadius: "6px",
  outline: "none",
  transition: "background-color 180ms ease, box-shadow 180ms ease",
};

export const textButtonSemiboldStyle: CSSProperties = {
  ...textButtonStyle,
  fontWeight: 600,
};

export const textButtonStrongStyle: CSSProperties = {
  ...textButtonStyle,
  fontWeight: 700,
};

export const textButtonNoWrapStyle: CSSProperties = {
  ...textButtonStyle,
  whiteSpace: "nowrap",
};

export const cardStyle: CSSProperties = {
  border: "1px solid var(--background-modifier-border)",
  borderRadius: "10px",
  padding: SPACE.lg,
  background: "var(--background-primary)",
};

export const cardTightStyle: CSSProperties = {
  ...cardStyle,
  padding: SPACE.md,
};

export const cardSubtleStyle: CSSProperties = {
  ...cardStyle,
  background: "rgba(var(--mono-rgb-100), 0.03)",
};

export const cardSubtleTightStyle: CSSProperties = {
  ...cardSubtleStyle,
  padding: SPACE.md,
};
