// UI tokens & helpers
// - Theme/background stays on Obsidian CSS variables (var(--background-*), var(--text-*) etc.)
// - Semantic/status/chart colors follow Obsidian theme variables

export const V5_COLORS = {
  // Trading status
  live: "var(--text-success)", // 实盘
  demo: "var(--text-accent)", // 模拟
  back: "var(--text-warning)", // 回测

  // Outcome / alerts
  loss: "var(--text-error)",
  win: "var(--text-success)",

  // Accents
  accent: "var(--interactive-accent)",
  accentPurple: "var(--interactive-accent)",

  // Text (v5 baseline, optional use)
  textSub: "var(--text-muted)",
  textDim: "var(--text-faint)",
} as const;

export function withHexAlpha(color: string, alphaHex: string): string {
  // Only apply to 6-digit hex like #RRGGBB. Otherwise return as-is.
  if (/^#[0-9a-fA-F]{6}$/.test(color) && /^[0-9a-fA-F]{2}$/.test(alphaHex)) {
    return `${color}${alphaHex}`;
  }
  return color;
}
