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

  // Phase 1: Explicit Pattern Matching (Highest Priority)
  // If patterns are provided, we prioritize cards that match these patterns.
  // We keep them at the top of the results.
  for (const p of patterns) {
    const card = index.byPattern(p);
    if (!card) continue;
    if (seen.has(card.path)) continue;
    seen.add(card.path);
    results.push(card);
    if (results.length >= limit) return results;
  }

  // Phase 2: Context/Setup Scoring (Fallback)
  // If we haven't hit the limit yet, we search for cards based on Market Cycle and Setup.
  // We score them to bubble the most relevant ones to the top.
  const wantSetup = input.setupCategory?.trim();
  const wantCycle = input.marketCycle?.trim();

  if (!wantSetup && !wantCycle) return results;

  const wantSetupKey = wantSetup ? normalizeKey(wantSetup) : undefined;
  const wantCycleKey = wantCycle ? normalizeKey(wantCycle) : undefined;

  const candidates: { card: StrategyCard; score: number }[] = [];

  for (const card of index.list()) {
    if (seen.has(card.path)) continue;

    let score = 0;

    // Weight: Market Cycle hits are worth 2 points
    if (wantCycleKey && card.marketCycles && card.marketCycles.some(c => {
      const ck = normalizeKey(String(c));
      return ck.includes(wantCycleKey) || wantCycleKey.includes(ck);
    })) {
      score += 2;
    }

    // Weight: Setup hits are worth 1 point
    if (wantSetupKey && card.setupCategories && card.setupCategories.some(c => {
      const ck = normalizeKey(String(c));
      return ck.includes(wantSetupKey) || wantSetupKey.includes(ck);
    })) {
      score += 1;
    }

    if (score > 0) {
      candidates.push({ card, score });
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Fill remaining slots
  for (const cand of candidates) {
    if (results.length >= limit) break;
    seen.add(cand.card.path);
    results.push(cand.card);
  }

  return results;
}
