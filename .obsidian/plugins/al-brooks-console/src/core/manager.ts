import type { TradeRecord } from "./contracts";
import {
  FIELD_ALIASES,
  normalizeAccountType,
  normalizeOutcome,
  parseNumber,
} from "./field-mapper";
import type { EnumPresets } from "./enum-presets";
import type { FixPlan, FixPlanFileUpdate } from "./inspector";

export interface StrategyNoteFrontmatter {
  path: string;
  frontmatter: Record<string, unknown>;
}

export interface ManagerApplyOptions {
  /** When true, apply deleteKeys from FixPlanFileUpdate. Defaults to false for safety. */
  deleteKeys?: boolean;
}

export interface ManagerApplyResult {
  applied: number;
  failed: number;
  errors: Array<{ path: string; message: string }>;
  /** Backup file contents for undo (path -> text). */
  backups: Record<string, string>;
}

function asNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function getFirstHit(
  frontmatter: Record<string, any>,
  keys: readonly string[]
) {
  for (const k of keys) {
    if (frontmatter?.[k] !== undefined)
      return { key: k, value: frontmatter[k] };
  }
  return undefined;
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v))
    return v
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean);
  if (typeof v === "string")
    return v
      .split(/[,，;；/|]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function buildFixPlan(fileUpdates: FixPlanFileUpdate[]): FixPlan {
  return {
    generatedAtIso: new Date().toISOString(),
    fileUpdates,
  };
}

/**
 * Trade notes batch normalization plan:
 * - Move values from alias keys to bilingual canonical keys when missing.
 * - Normalize account_type/outcome to canonical strings when possible.
 * - Normalize pnl/net_profit to a number when parseable.
 * - Optionally list alias keys for deletion (Manager applies only when explicitly enabled).
 */
export function buildTradeNormalizationPlan(
  trades: TradeRecord[],
  presets?: EnumPresets,
  options: { includeDeleteKeys?: boolean } = {}
): FixPlan {
  const fileUpdates: FixPlanFileUpdate[] = [];

  // Prefer the bilingual keys used by vault templates
  const canonicalKeys = {
    accountType: "账户类型/account_type",
    ticker: "品种/ticker",
    outcome: "结果/outcome",
    pnl: "净利润/net_profit",
  } as const;

  for (const t of trades) {
    const fm = (t.rawFrontmatter ?? {}) as Record<string, any>;
    const updates: Record<string, unknown> = {};
    const deleteKeys: string[] = [];

    const moveFirst = (aliases: readonly string[], canonicalKey: string) => {
      if (fm[canonicalKey] !== undefined) return;
      const hit = getFirstHit(fm, aliases);
      if (!hit) return;
      updates[canonicalKey] = hit.value;
      if (options.includeDeleteKeys && hit.key !== canonicalKey)
        deleteKeys.push(hit.key);
    };

    moveFirst(FIELD_ALIASES.accountType, canonicalKeys.accountType);
    moveFirst(FIELD_ALIASES.ticker, canonicalKeys.ticker);
    moveFirst(FIELD_ALIASES.outcome, canonicalKeys.outcome);
    moveFirst(FIELD_ALIASES.pnl, canonicalKeys.pnl);

    // Normalize values (prefer presets for CN/EN canonical text)
    const acctRaw =
      fm[canonicalKeys.accountType] ??
      getFirstHit(fm, FIELD_ALIASES.accountType)?.value;
    const acctStr = asNonEmptyString(acctRaw);
    if (acctStr) {
      const preset = presets?.normalize("account_type", acctStr);
      const normalized =
        preset ?? (normalizeAccountType(acctStr) ? preset ?? acctStr : acctStr);
      if (preset && preset !== acctStr)
        updates[canonicalKeys.accountType] = preset;
    }

    const outcomeRaw =
      fm[canonicalKeys.outcome] ??
      getFirstHit(fm, FIELD_ALIASES.outcome)?.value;
    const outcomeStr = asNonEmptyString(outcomeRaw);
    if (outcomeStr) {
      const preset = presets?.normalize("outcome", outcomeStr);
      if (preset && preset !== outcomeStr)
        updates[canonicalKeys.outcome] = preset;
      else {
        const out = normalizeOutcome(outcomeStr);
        if (out && out !== "unknown") {
          // Do not force overwrite when presets are absent; keep best-effort only.
        }
      }
    }

    const pnlRaw =
      fm[canonicalKeys.pnl] ?? getFirstHit(fm, FIELD_ALIASES.pnl)?.value;
    const pnlNum = parseNumber(pnlRaw);
    if (typeof pnlNum === "number" && Number.isFinite(pnlNum)) {
      if (fm[canonicalKeys.pnl] !== pnlNum) updates[canonicalKeys.pnl] = pnlNum;
    }

    // Enum normalization for common fields if presets exist
    if (presets) {
      const normalizeEnum = (
        fieldKey: string,
        canonicalKey: string,
        isMulti: boolean
      ) => {
        const raw = fm[canonicalKey];
        if (raw === undefined) return;
        if (isMulti) {
          const vals = toStringArray(raw);
          if (vals.length === 0) return;
          const normalized = vals.map(
            (v) => presets.normalize(fieldKey, v) ?? v
          );
          const changed = vals.some((v, i) => normalized[i] !== v);
          if (changed) updates[canonicalKey] = normalized;
          return;
        }
        const s = asNonEmptyString(raw);
        if (!s) return;
        const n = presets.normalize(fieldKey, s);
        if (n && n !== s) updates[canonicalKey] = n;
      };

      normalizeEnum("ticker", canonicalKeys.ticker, false);
      normalizeEnum("account_type", canonicalKeys.accountType, false);
      normalizeEnum("outcome", canonicalKeys.outcome, false);
    }

    if (Object.keys(updates).length > 0 || deleteKeys.length > 0) {
      fileUpdates.push({
        path: t.path,
        updates,
        deleteKeys: deleteKeys.length ? deleteKeys : undefined,
      });
    }
  }

  return buildFixPlan(fileUpdates);
}

/**
 * Strategy notes maintenance plan:
 * - Ensure key fields exist (minimal defaults) and normalize enum arrays using presets.
 * - Works on notes provided by the host (ConsoleView) to avoid duplicating index logic.
 */
export function buildStrategyMaintenancePlan(
  notes: StrategyNoteFrontmatter[],
  presets?: EnumPresets,
  options: { includeDeleteKeys?: boolean } = {}
): FixPlan {
  const fileUpdates: FixPlanFileUpdate[] = [];

  const canonicalKeys = {
    strategyName: "策略名称/strategy_name",
    marketCycle: "市场周期/market_cycle",
    setupCategory: "设置类别/setup_category",
    patternsObserved: "观察到的形态/patterns_observed",
  } as const;

  for (const n of notes) {
    const fm = (n.frontmatter ?? {}) as Record<string, any>;
    const updates: Record<string, unknown> = {};

    // Minimal defaults
    if (
      fm[canonicalKeys.strategyName] === undefined &&
      fm["strategy_name"] !== undefined
    ) {
      updates[canonicalKeys.strategyName] = fm["strategy_name"];
      if (options.includeDeleteKeys) {
        // deletion handled by Manager via deleteKeys if provided later
      }
    }
    if (fm[canonicalKeys.marketCycle] === undefined)
      updates[canonicalKeys.marketCycle] = Array.isArray(
        fm[canonicalKeys.marketCycle]
      )
        ? fm[canonicalKeys.marketCycle]
        : [];
    if (fm[canonicalKeys.patternsObserved] === undefined)
      updates[canonicalKeys.patternsObserved] = Array.isArray(
        fm[canonicalKeys.patternsObserved]
      )
        ? fm[canonicalKeys.patternsObserved]
        : [];

    if (presets) {
      const normalizeMulti = (fieldKey: string, key: string) => {
        const vals = toStringArray(fm[key] ?? updates[key]);
        if (vals.length === 0) return;
        const normalized = vals.map((v) => presets.normalize(fieldKey, v) ?? v);
        const changed = vals.some((v, i) => normalized[i] !== v);
        if (changed) updates[key] = normalized;
      };
      normalizeMulti("market_cycle", canonicalKeys.marketCycle);
      normalizeMulti("patterns_observed", canonicalKeys.patternsObserved);
    }

    if (Object.keys(updates).length > 0)
      fileUpdates.push({ path: n.path, updates });
  }

  return buildFixPlan(fileUpdates);
}

export interface FrontmatterFile {
  path: string;
  frontmatter: Record<string, unknown>;
}

export interface FrontmatterKeyStat {
  key: string;
  /** Number of files that contain this key. */
  files: number;
  /** Total number of values observed (arrays contribute multiple). */
  values: number;
  /** Top values for this key (value -> count), descending by count. */
  topValues: Array<{ value: string; count: number }>;
}

export interface FrontmatterStats {
  generatedAtIso: string;
  totalFiles: number;
  keys: FrontmatterKeyStat[];
}

function normalizeVal(v: unknown): string {
  if (v === undefined || v === null) return "null";
  if (typeof v === "string") {
    const s = v.trim();
    return s.length ? s : "Empty";
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);

  if (typeof v === "object") {
    const o = v as any;
    if (typeof o?.path === "string") return o.path;
    if (typeof o?.link?.path === "string") return o.link.path;
    if (typeof o?.file?.path === "string") return o.file.path;

    try {
      const s = o?.toString ? String(o.toString()).trim() : "";
      if (s && s !== "[object Object]") return s;
    } catch {
      // ignore
    }
    try {
      const s = JSON.stringify(o);
      return s && s !== "{}" ? s : "Object";
    } catch {
      return "Object";
    }
  }

  try {
    return String(v);
  } catch {
    return "Unknown";
  }
}

function extractValues(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => normalizeVal(x));
  return [normalizeVal(v)];
}

/**
 * Read-only inventory of frontmatter keys/values.
 * Useful for aligning legacy Manager's keyMap/valMap scan in a safe incremental step.
 */
export function buildFrontmatterStats(
  files: FrontmatterFile[],
  options: { topKeys?: number; topValuesPerKey?: number } = {}
): FrontmatterStats {
  const topKeys = options.topKeys ?? 30;
  const topValuesPerKey = options.topValuesPerKey ?? 3;

  const perKey = new Map<
    string,
    { files: number; values: number; valueCounts: Map<string, number> }
  >();

  for (const f of files) {
    const fm = (f.frontmatter ?? {}) as Record<string, unknown>;
    const keys = Object.keys(fm);
    for (const k of keys) {
      const entry = perKey.get(k) ?? {
        files: 0,
        values: 0,
        valueCounts: new Map<string, number>(),
      };
      entry.files += 1;
      const vals = extractValues((fm as any)[k]);
      for (const val of vals) {
        entry.values += 1;
        entry.valueCounts.set(val, (entry.valueCounts.get(val) ?? 0) + 1);
      }
      perKey.set(k, entry);
    }
  }

  const keys: FrontmatterKeyStat[] = [...perKey.entries()]
    .map(([key, v]) => {
      const topValues = [...v.valueCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, topValuesPerKey)
        .map(([value, count]) => ({ value, count }));
      return {
        key,
        files: v.files,
        values: v.values,
        topValues,
      };
    })
    .sort((a, b) => b.files - a.files)
    .slice(0, topKeys);

  return {
    generatedAtIso: new Date().toISOString(),
    totalFiles: files.length,
    keys,
  };
}

/**
 * Build a FixPlan that renames a frontmatter key across a set of files.
 *
 * Behavior mirrors legacy Manager semantics:
 * - If target key already exists and overwrite=false, skip.
 * - Copy old value to new key.
 * - List old key in deleteKeys when oldKey!=newKey (deletion is applied only when Manager enables deleteKeys).
 */
export function buildRenameKeyPlan(
  files: FrontmatterFile[],
  oldKey: string,
  newKey: string,
  options: { overwrite?: boolean } = {}
): FixPlan {
  const from = (oldKey ?? "").trim();
  const to = (newKey ?? "").trim();
  if (!from || !to) return buildFixPlan([]);

  const fileUpdates: FixPlanFileUpdate[] = [];
  for (const f of files) {
    const fm = (f.frontmatter ?? {}) as Record<string, any>;
    if (fm[from] === undefined) continue;
    if (!options.overwrite && fm[to] !== undefined && to !== from) continue;

    const updates: Record<string, unknown> = { [to]: fm[from] };
    const deleteKeys = to !== from ? [from] : undefined;
    fileUpdates.push({ path: f.path, updates, deleteKeys });
  }

  return buildFixPlan(fileUpdates);
}

/** Build a FixPlan that deletes a frontmatter key across a set of files. */
export function buildDeleteKeyPlan(
  files: FrontmatterFile[],
  key: string
): FixPlan {
  const k = (key ?? "").trim();
  if (!k) return buildFixPlan([]);

  const fileUpdates: FixPlanFileUpdate[] = [];
  for (const f of files) {
    const fm = (f.frontmatter ?? {}) as Record<string, any>;
    if (fm[k] === undefined) continue;
    fileUpdates.push({ path: f.path, updates: {}, deleteKeys: [k] });
  }

  return buildFixPlan(fileUpdates);
}
