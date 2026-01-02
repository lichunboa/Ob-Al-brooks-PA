import type { AccountType, TradeRecord } from "./contracts";
import type { StrategyIndex } from "./strategy-index";

export type AnalyticsScope = AccountType | "All";

export interface DailyAgg {
	dateIso: string;
	netR: number;
	count: number;
}

export interface EquityPoint {
	dateIso: string;
	equityR: number;
}

export interface StrategyAttributionRow {
	strategyName: string;
	strategyPath?: string;
	count: number;
	netR: number;
}

const STRATEGY_FIELD_ALIASES = ["策略名称/strategy_name", "strategy_name", "strategyName", "strategy"] as const;

function toString(v: unknown): string | undefined {
	if (typeof v !== "string") return undefined;
	const s = v.trim();
	return s.length ? s : undefined;
}

export function filterTradesByScope(trades: TradeRecord[], scope: AnalyticsScope): TradeRecord[] {
	if (scope === "All") return trades;
	return trades.filter((t) => t.accountType === scope);
}

export function computeDailyAgg(trades: TradeRecord[], days: number): DailyAgg[] {
	const byDate = new Map<string, { netR: number; count: number }>();
	for (const t of trades) {
		const dateIso = t.dateIso;
		if (!dateIso) continue;
		const prev = byDate.get(dateIso) ?? { netR: 0, count: 0 };
		const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
		prev.netR += pnl;
		prev.count += 1;
		byDate.set(dateIso, prev);
	}

	const keys = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
	return keys.slice(0, Math.max(1, days)).map((k) => {
		const v = byDate.get(k)!;
		return { dateIso: k, netR: v.netR, count: v.count };
	});
}

export function computeEquityCurve(dailyDesc: DailyAgg[]): EquityPoint[] {
	const asc = [...dailyDesc].sort((a, b) => (a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0));
	let equity = 0;
	return asc.map((d) => {
		equity += d.netR;
		return { dateIso: d.dateIso, equityR: equity };
	});
}

export function computeStrategyAttribution(
	trades: TradeRecord[],
	strategyIndex: StrategyIndex,
	limit: number
): StrategyAttributionRow[] {
	const by = new Map<string, { netR: number; count: number }>();

	for (const t of trades) {
		const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
		let name: string | undefined;
		for (const key of STRATEGY_FIELD_ALIASES) {
			name = toString((fm as any)[key]);
			if (name) break;
		}
		if (!name) continue;

		const prev = by.get(name) ?? { netR: 0, count: 0 };
		const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
		prev.netR += pnl;
		prev.count += 1;
		by.set(name, prev);
	}

	const rows: StrategyAttributionRow[] = [];
	for (const [strategyName, v] of by.entries()) {
		const card = strategyIndex.lookup(strategyName) ?? strategyIndex.byName(strategyName);
		rows.push({
			strategyName,
			strategyPath: card?.path,
			netR: v.netR,
			count: v.count,
		});
	}

	rows.sort((a, b) => Math.abs(b.netR) - Math.abs(a.netR));
	return rows.slice(0, Math.min(20, Math.max(1, limit)));
}
