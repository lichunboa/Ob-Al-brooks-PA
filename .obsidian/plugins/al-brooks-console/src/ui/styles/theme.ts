import { CSSProperties } from "react";
import { V5_COLORS } from "../tokens";

// =============================================================================
// 🎨 TRADER COMMAND THEME SYSTEM v3.0
// =============================================================================

// 1. Spacing System (4px Grid)
export const SPACE = {
    xs: "4px",   // Tight gap
    sm: "8px",   // Component padding
    md: "12px",  // Standard gap
    lg: "20px",  // Section gap
    xl: "32px",  // Major divider
    xxl: "48px", // Hero spacing
} as const;

// 2. Color System (Semantic & Glass)
// Preserving original hues but refining opacity/usage for glassmorphism.

export const COLORS = {
    // Functional (Direct mapping to V5 logic but strictly typed)
    win: V5_COLORS.win,       // #10B981
    loss: V5_COLORS.loss,     // #EF4444
    live: "#10B981",
    demo: "#3B82F6",
    backtest: "#F59E0B",

    // Interaction
    accent: "#60A5FA",        // Primary Action
    accentGlow: "rgba(96, 165, 250, 0.4)",

    // Text Levels (Obsidian vars for theme adaptability)
    text: {
        normal: "var(--text-normal)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        onAccent: "#FFFFFF",
    },

    // Glass Backgrounds (Physical Depth)
    glass: {
        // L1: Card (Floating) - Boosted opacity for visibility
        card: "rgba(var(--mono-rgb-100), 0.06)",
        // L2: Panel (Group)
        panel: "rgba(var(--mono-rgb-100), 0.03)",
        // L3: Inset (Sunk)
        inset: "rgba(0, 0, 0, 0.2)", // Darker for depth
    },

    // Borders
    border: {
        subtle: "1px solid rgba(var(--mono-rgb-100), 0.12)",
        highlight: "1px solid rgba(var(--mono-rgb-100), 0.3)",
        accent: `1px solid ${V5_COLORS.accent}`,
    }
} as const;

// 3. Typography System (Strict Hierarchy)
// Font-family inherits from Obsidian app settings for consistency.

export const TYPO = {
    // Numeric: Tabular nums for financial data
    numeric: {
        fontVariantNumeric: "tabular-nums",
        fontFamily: "var(--font-monospace)", // Optional: enforce mono for data
    } as CSSProperties,

    // Hierarchy
    displayXL: {
        fontSize: "32px",
        fontWeight: 850,
        lineHeight: 1.1,
        letterSpacing: "-0.02em",
    } as CSSProperties,

    displayL: {
        fontSize: "24px",
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: "-0.01em",
    } as CSSProperties,

    headingM: {
        fontSize: "18px",
        fontWeight: 600,
        lineHeight: 1.3,
    } as CSSProperties,

    headingS: {
        fontSize: "16px",
        fontWeight: 600,
        lineHeight: 1.4,
    } as CSSProperties,

    bodyM: {
        fontSize: "15px",
        fontWeight: 400,
        lineHeight: 1.5,
    } as CSSProperties,

    bodyS: {
        fontSize: "13px",
        fontWeight: 500,
        lineHeight: 1.5,
    } as CSSProperties,

    caption: {
        fontSize: "12px",
        fontWeight: 400,
        lineHeight: 1.4,
        color: "var(--text-faint)",
    } as CSSProperties,
} as const;

// 4. Effects (Shadows & Transitions)
export const EFFECTS = {
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    shadow: {
        card: "0 8px 32px rgba(0,0,0,0.12)",
        float: "0 12px 40px rgba(0,0,0,0.18)",
        glow: `0 0 20px -5px ${COLORS.accentGlow}`,
    },
    blur: {
        card: "blur(16px)",
        panel: "blur(8px)",
    }
} as const;
