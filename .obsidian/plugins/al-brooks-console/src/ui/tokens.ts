// UI tokens & helpers
// - Theme/background stays on Obsidian CSS variables (var(--background-*), var(--text-*) etc.)
// - Semantic/status/chart colors follow v5 palette (from scripts/pa-config.js)

export const V5_COLORS = {
  // Trading status
  live: "#10B981", // 实盘
  demo: "#3B82F6", // 模拟
  back: "#F59E0B", // 回测

  // Outcome / alerts
  loss: "#EF4444",
  win: "#10B981",

  // Accents
  accent: "#60A5FA",
  accentPurple: "#A78BFA",

  // Text (v5 baseline, optional use)
  textSub: "rgba(243,244,246,0.6)",
  textDim: "rgba(243,244,246,0.4)",
} as const;

/**
 * 统一布局间距常量
 * 用于保持 UI 模块之间的一致性
 */
export const LAYOUT = {
  // 模块间距
  gap: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
  },
  // 内边距
  padding: {
    sm: "8px",
    md: "12px",
    lg: "16px",
  },
  // 圆角
  radius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
  },
} as const;

export function withHexAlpha(color: string, alphaHex: string): string {
  // Only apply to 6-digit hex like #RRGGBB. Otherwise return as-is.
  if (/^#[0-9a-fA-F]{6}$/.test(color) && /^[0-9a-fA-F]{2}$/.test(alphaHex)) {
    return `${color}${alphaHex}`;
  }
  return color;
}

