import type { CSSProperties } from "react";

// Glass effect primitives based on Obsidian theme variables
// "White, Black, Gray" distinction maps to Obsidian's layer system

export const GLASS_EFFECT: CSSProperties = {
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)", // Safari support
  border: "1px solid var(--background-modifier-border)",
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
};

// Level 1: The "White" (Light Mode) or "Black" (Dark Mode) - Main Content
// Uses --background-primary with slight transparency
// Level 1: The "1st Level" - Base Frame (White/Black tint)
// Provides a subtle glass foundation for the main application area
export const glassCardStyle: CSSProperties = {
  ...GLASS_EFFECT,
  background: "rgba(var(--mono-rgb-100), 0.03)", // Slightly more visible tint
  borderRadius: "16px",
  padding: "20px",
  boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.1)", // Deeper shadow for "lifted" feel
};

// Level 2: The "2nd Level" - Inner Grouping (Gray tint)
// Uses --background-secondary to distinguish functional areas within the base frame
export const glassPanelStyle: CSSProperties = {
  ...GLASS_EFFECT,
  background: "var(--background-secondary)",
  borderRadius: "12px",
  padding: "20px",
  border: "1px solid rgba(var(--mono-rgb-100), 0.05)",
};

// Level 3: High Contrast / Header
// Uses --background-modifier-form-field or similar for input-like contrast
export const glassInsetStyle: CSSProperties = {
  background: "var(--background-modifier-form-field)",
  borderRadius: "8px",
  padding: "12px",
  border: "1px solid var(--background-modifier-border-focus)",
};

// Status Indicators (Glassy)
export const glassStatusStyle = (colorVar: string): CSSProperties => ({
  background: `rgba(var(--${colorVar}), 0.1)`,
  color: `rgb(var(--${colorVar}))`,
  border: `1px solid rgba(var(--${colorVar}), 0.2)`,
  padding: "4px 8px",
  borderRadius: "999px",
  fontSize: "0.85em",
  fontWeight: 600,
});
