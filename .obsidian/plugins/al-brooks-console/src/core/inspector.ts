import type { TradeRecord } from "./contracts";
import type { EnumPresets } from "./enum-presets";

export type IssueSeverity = "error" | "warn";

export interface InspectorIssue {
	id: string;
	severity: IssueSeverity;
	path: string;
	title: string;
	detail?: string;
}

export interface FixPlanFileUpdate {
	path: string;
	updates: Record<string, unknown>;
	/** Optional legacy keys to remove (Manager may apply this only when explicitly enabled). */
	deleteKeys?: string[];
}

export interface FixPlan {
	generatedAtIso: string;
	fileUpdates: FixPlanFileUpdate[];
}

const TRADE_FIELD_ALIASES = {
	accountType: ["account_type", "账户类型/account_type", "账户/account_type", "accountType"],
	ticker: ["ticker", "品种/ticker"],
	timeframe: ["timeframe", "时间周期/timeframe"],
	direction: ["direction", "方向/direction"],
	marketCycle: ["market_cycle", "市场周期/market_cycle"],
	setupCategory: ["setup_category", "设置类别/setup_category"],
	patternsObserved: ["patterns_observed", "观察到的形态/patterns_observed"],
	probability: ["probability", "概率/probability"],
	outcome: ["outcome", "结果/outcome"],
	executionQuality: ["execution_quality", "执行评价/execution_quality"],
	strategyName: ["strategy_name", "策略名称/strategy_name"],
} as const;

function getFirstFieldValue(frontmatter: Record<string, any>, keys: readonly string[]) {
	for (const key of keys) {
		const value = frontmatter?.[key];
		if (value !== undefined) return { key, value };
	}
	return undefined;
}

function asStrings(v: unknown): string[] {
	if (typeof v === "string") {
		return v
			.split(/[,，;；/|]/g)
			.map((s) => s.trim())
			.filter(Boolean);
	}
	if (Array.isArray(v)) {
		return v.filter((x) => typeof x === "string").map((s) => (s as string).trim()).filter(Boolean);
	}
	return [];
}

function issueId(path: string, kind: string): string {
	return `${kind}:${path}`;
}

export function buildInspectorIssues(trades: TradeRecord[], presets?: EnumPresets): InspectorIssue[] {
	const issues: InspectorIssue[] = [];

	for (const t of trades) {
		const fm = (t.rawFrontmatter ?? {}) as Record<string, any>;

		if (!t.dateIso) {
			issues.push({
				id: issueId(t.path, "missing-date"),
				severity: "error",
				path: t.path,
				title: "缺少日期 (dateIso)",
			});
		}

		if (!t.accountType) {
			issues.push({
				id: issueId(t.path, "missing-account"),
				severity: "error",
				path: t.path,
				title: "缺少账户类型 (account_type)",
			});
		}

		if (!t.ticker) {
			issues.push({
				id: issueId(t.path, "missing-ticker"),
				severity: "warn",
				path: t.path,
				title: "缺少品种 (ticker)",
			});
		}

		if (!t.outcome || t.outcome === "unknown") {
			issues.push({
				id: issueId(t.path, "missing-outcome"),
				severity: "warn",
				path: t.path,
				title: "结果(outcome) 未明确",
			});
		}

		const isCompleted = t.outcome === "win" || t.outcome === "loss" || t.outcome === "scratch";
		if (isCompleted && (typeof t.pnl !== "number" || !Number.isFinite(t.pnl))) {
			issues.push({
				id: issueId(t.path, "missing-pnl"),
				severity: "warn",
				path: t.path,
				title: "已结束交易缺少净利润 (net_profit/pnl)",
			});
		}

		if (presets) {
			const checkEnum = (fieldKey: string, raw: unknown) => {
				const values = asStrings(raw);
				if (values.length === 0) return;
				for (const v of values) {
					const canonical = presets.normalize(fieldKey, v);
					if (!canonical) {
						issues.push({
							id: `${fieldKey}:${t.path}:${v}`,
							severity: "warn",
							path: t.path,
							title: `非法枚举值：${fieldKey}`,
							detail: v,
						});
					}
				}
			};

			checkEnum("account_type", getFirstFieldValue(fm, TRADE_FIELD_ALIASES.accountType)?.value);
			checkEnum("ticker", getFirstFieldValue(fm, TRADE_FIELD_ALIASES.ticker)?.value);
			checkEnum("timeframe", getFirstFieldValue(fm, TRADE_FIELD_ALIASES.timeframe)?.value);
			checkEnum("direction", getFirstFieldValue(fm, TRADE_FIELD_ALIASES.direction)?.value);
			checkEnum("market_cycle", getFirstFieldValue(fm, TRADE_FIELD_ALIASES.marketCycle)?.value);
			checkEnum("setup_category", getFirstFieldValue(fm, TRADE_FIELD_ALIASES.setupCategory)?.value);
			checkEnum("patterns_observed", getFirstFieldValue(fm, TRADE_FIELD_ALIASES.patternsObserved)?.value);
			checkEnum("probability", getFirstFieldValue(fm, TRADE_FIELD_ALIASES.probability)?.value);
			checkEnum("outcome", getFirstFieldValue(fm, TRADE_FIELD_ALIASES.outcome)?.value);
			checkEnum("execution_quality", getFirstFieldValue(fm, TRADE_FIELD_ALIASES.executionQuality)?.value);
			checkEnum("strategy_name", getFirstFieldValue(fm, TRADE_FIELD_ALIASES.strategyName)?.value);
		}
	}

	return issues;
}

export function buildFixPlan(trades: TradeRecord[], presets: EnumPresets): FixPlan {
	const fileUpdates: FixPlanFileUpdate[] = [];

	for (const t of trades) {
		const fm = (t.rawFrontmatter ?? {}) as Record<string, any>;
		const updates: Record<string, unknown> = {};

		const normalizeEnumField = (fieldKey: string, keys: readonly string[], isMulti: boolean) => {
			const hit = getFirstFieldValue(fm, keys);
			if (!hit) return;

			if (isMulti) {
				const rawValues = asStrings(hit.value);
				if (rawValues.length === 0) return;
				const normalized = rawValues
					.map((v) => presets.normalize(fieldKey, v) ?? v)
					.filter(Boolean);
				// 仅当出现“同义值→canonical”的替换时才提出更新
				const changed = rawValues.some((v, i) => (presets.normalize(fieldKey, v) ?? v) !== rawValues[i]);
				if (changed) updates[hit.key] = normalized;
				return;
			}

			const raw = typeof hit.value === "string" ? hit.value.trim() : undefined;
			if (!raw) return;
			const canonical = presets.normalize(fieldKey, raw);
			if (canonical && canonical !== raw) updates[hit.key] = canonical;
		};

		normalizeEnumField("account_type", TRADE_FIELD_ALIASES.accountType, false);
		normalizeEnumField("ticker", TRADE_FIELD_ALIASES.ticker, false);
		normalizeEnumField("timeframe", TRADE_FIELD_ALIASES.timeframe, false);
		normalizeEnumField("direction", TRADE_FIELD_ALIASES.direction, false);
		normalizeEnumField("setup_category", TRADE_FIELD_ALIASES.setupCategory, false);
		normalizeEnumField("probability", TRADE_FIELD_ALIASES.probability, false);
		normalizeEnumField("outcome", TRADE_FIELD_ALIASES.outcome, false);
		normalizeEnumField("execution_quality", TRADE_FIELD_ALIASES.executionQuality, false);
		normalizeEnumField("strategy_name", TRADE_FIELD_ALIASES.strategyName, false);
		normalizeEnumField("market_cycle", TRADE_FIELD_ALIASES.marketCycle, true);
		normalizeEnumField("patterns_observed", TRADE_FIELD_ALIASES.patternsObserved, true);

		if (Object.keys(updates).length > 0) fileUpdates.push({ path: t.path, updates });
	}

	return {
		generatedAtIso: new Date().toISOString(),
		fileUpdates,
	};
}
