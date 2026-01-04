import type { StrategyCard, StrategyIndex } from "./strategy-index";

export interface StrategyMatchInput {
  marketCycle?: string;
  setupCategory?: string;
  patterns?: string[];
  limit?: number;
}

function normalizeKey(v: string): string {
  const base = v.includes("(") ? v.split("(")[0].trim() : v.trim();
  return base.toLowerCase();
}

export function matchStrategies(
  index: StrategyIndex,
  input: StrategyMatchInput
): StrategyCard[] {
  const limit = Math.min(6, Math.max(1, input.limit ?? 6));
  const patterns = (input.patterns ?? []).map((p) => p.trim()).filter(Boolean);
  const results: StrategyCard[] = [];
  const seen = new Set<string>();

  for (const p of patterns) {
    const card = index.byPattern(p);
    if (!card) continue;
    if (seen.has(card.path)) continue;
    seen.add(card.path);
    results.push(card);
    if (results.length >= limit) return results;
  }

  const wantSetup = input.setupCategory?.trim();
  const wantCycle = input.marketCycle?.trim();
  if (!wantSetup && !wantCycle) return results;

  const wantSetupKey = wantSetup ? normalizeKey(wantSetup) : undefined;
  const wantCycleKey = wantCycle ? normalizeKey(wantCycle) : undefined;

  for (const card of index.list()) {
    if (results.length >= limit) break;
    if (seen.has(card.path)) continue;

    const setupHit =
      wantSetupKey &&
      card.setupCategories.some(
        (c) =>
          normalizeKey(c).includes(wantSetupKey) ||
          wantSetupKey.includes(normalizeKey(c))
      );
    const cycleHit =
      wantCycleKey &&
      card.marketCycles.some(
        (c) =>
          normalizeKey(c).includes(wantCycleKey) ||
          wantCycleKey.includes(normalizeKey(c))
      );

    if (setupHit || cycleHit) {
      seen.add(card.path);
      results.push(card);
    }
  }

  return results;
}
