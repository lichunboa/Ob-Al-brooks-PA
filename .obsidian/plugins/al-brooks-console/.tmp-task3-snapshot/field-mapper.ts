import type { NormalizedTag, TradeOutcome } from "./contracts";

export const FIELD_ALIASES = {
	pnl: ["pnl", "net_profit", "净利润/net_profit", "净利润"],
	ticker: ["ticker", "symbol", "品种/ticker", "品种"],
	outcome: ["outcome", "result", "结果/outcome", "结果"],
	date: ["date"],
	tags: ["tags"],
	fileClass: ["fileClass"],
} as const;

export function getFirstFieldValue(frontmatter: Record<string, any>, keys: readonly string[]) {
	for (const key of keys) {
		const value = frontmatter?.[key];
		if (value !== undefined) return value;
	}
	return undefined;
}

export function parseNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string") return undefined;
	const n = Number.parseFloat(value);
	return Number.isFinite(n) ? n : undefined;
}

export function normalizeTag(tag: string): NormalizedTag {
	// 统一：去掉开头 #，并使用 vault 里常见的路径式标签格式
	return tag.trim().replace(/^#/, "");
}

export function normalizeOutcome(value: unknown): TradeOutcome | undefined {
	if (typeof value !== "string") return undefined;
	const v = value.trim().toLowerCase();
	if (v === "win" || v === "w" || v === "止盈") return "win";
	if (v === "loss" || v === "l" || v === "止损") return "loss";
	if (v === "scratch" || v === "be" || v === "保本") return "scratch";
	if (v === "open" || v === "ongoing" || v === "进行中") return "open";
	return "unknown";
}
