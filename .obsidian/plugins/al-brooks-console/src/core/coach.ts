
import type { TradeRecord } from "./contracts";
import type { TradeIndex } from "./trade-index";
import { moment } from "obsidian";

// --- Types ---

export interface CoachStats {
    total: number;
    completed: number;
    active: number;
    wins: number;
    losses: number;
    scratches: number;
    pnl: number;
    avgR: number;
    winRate: number;
    expectancyR: number;
}

export interface CoachFocusItem {
    kind: string;
    key: string;
    label: string;
    dimLabel?: string;
    stats: CoachStats;
    urgency: number;
    // Expanded fields for combined view
    score?: number;
    windows?: string[];
    lastSeen?: string;
    weekHitCount?: number;
    weekStreak?: number;
}

export interface CoachWindowPack {
    summary: CoachStats;
    focus: CoachFocusItem | null;
    top: Record<string, CoachFocusItem[]>; // kind -> top items
}

export interface CoachData {
    today: CoachWindowPack;
    week: CoachWindowPack;
    last30: CoachWindowPack;
    combined: {
        focus: CoachFocusItem | null;
        ranked: CoachFocusItem[];
        weights: Record<string, number>;
        weekly: {
            weeksBack: number;
            series: Array<{
                start: string;
                end: string;
                focus: CoachFocusItem | null;
                top3: CoachFocusItem[];
            }>;
        }
    };
}

// --- Helpers ---

const safeNum = (v: any): number => (typeof v === "number" && !Number.isNaN(v) ? v : Number(v) || 0);

const isDone = (t: TradeRecord) => !!(t.outcome || "").toString().trim();

const isWin = (t: TradeRecord) => {
    const s = (t.outcome || "").toString();
    return s === "Win" || s.includes("Win") || s.includes("止盈");
};

const isLoss = (t: TradeRecord) => {
    const s = (t.outcome || "").toString();
    return s === "Loss" || s.includes("Loss") || s.includes("止损");
};

const isScratch = (t: TradeRecord) => {
    const s = (t.outcome || "").toString();
    return s === "Scratch" || s.includes("Scratch") || s.includes("保本");
};

function summarize(items: TradeRecord[]): CoachStats {
    const out: CoachStats = {
        total: items.length,
        completed: 0,
        active: 0,
        wins: 0,
        losses: 0,
        scratches: 0,
        pnl: 0,
        avgR: 0,
        winRate: 0,
        expectancyR: 0,
    };

    if (items.length === 0) return out;

    let rSum = 0;
    let rCnt = 0;

    for (const t of items) {
        // PnL in dollars/currency
        const pnl = typeof t.pnl === "number" ? t.pnl : 0;
        out.pnl += pnl;

        if (isDone(t)) {
            out.completed += 1;
            if (isWin(t)) out.wins += 1;
            else if (isLoss(t)) out.losses += 1;
            else if (isScratch(t)) out.scratches += 1;
        } else {
            out.active += 1;
        }

        // R calc
        // Plugin TradeRecord might not have 'r', so we might need to rely on PnL or computed R
        // Assuming 'r' might be missing, we use pnl/initialRisk if available or 0.
        // For now, let's assume we can compute R or it's on the record.
        // If the plugin TradeRecord doesn't have 'r', we might need to Compute it.
        // Let's check TradeRecord definition... it usually has pnl.
        // We will do a best effort R calc here if missing.
        let r = (t as any).r; // Check if 'r' exists on the extended type
        if (typeof r !== "number") {
            // Fallback R calculation: PnL / InitialRisk
            const risk = (t as any).initialRisk; // Check for initialRisk
            if (typeof risk === 'number' && risk !== 0) {
                r = pnl / Math.abs(risk);
            }
        }

        if (typeof r === "number" && !Number.isNaN(r)) {
            rSum += r;
            rCnt += 1;
        }
    }

    out.avgR = rCnt > 0 ? rSum / rCnt : 0;
    out.winRate = out.completed > 0 ? Math.round((out.wins / out.completed) * 100) : 0;
    out.expectancyR = out.completed > 0 ? rSum / out.completed : 0;

    return out;
}

const DIM_DEFS = [
    { kind: "setupKey", label: "设置/Setup" },
    { kind: "marketCycleKey", label: "周期/Cycle" },
    { kind: "strategyKey", label: "策略/Strategy" },
    { kind: "tickerKey", label: "品种/Ticker" },
    { kind: "tfKey", label: "周期/TF" },
    { kind: "dirKey", label: "方向/Dir" },
];

function computeDim(items: TradeRecord[], kind: string, indexLabels?: Record<string, string>): CoachFocusItem[] {
    const groups = new Map<string, TradeRecord[]>();
    for (const t of items) {
        // TradeRecord uses specific keys. We need to map 'kind' to the TradeRecord property.
        // The 'kind' names from v5 (setupKey, marketCycleKey) match the properties we expect to be populated
        // on the TradeRecord if we enriched it, OR we need to map them.
        // In the plugin index, these keys might not be directly on the object.
        // Let's assume we can access them dynamically or mapped.
        // A safer way is to check the 'contracts.ts' for property names.
        // However, looking at pa-core.js, these keys like 'marketCycleKey' seem to be added during enrichment.
        // The Plugin TradeRecord has: setupKey, marketCycle, strategyName...
        // We should normalize access details.

        let val: any = (t as any)[kind];
        // If the key doesn't exist directly (e.g. strategyKey might be derived from strategyName), fallback
        if (!val) {
            if (kind === 'marketCycleKey') val = t.marketCycle;
            if (kind === 'strategyKey') val = t.strategyName;
            if (kind === 'tickerKey') val = t.ticker;
            if (kind === 'tfKey') val = t.timeframe;
            if (kind === 'dirKey') val = t.direction;
            if (kind === 'setupKey') val = t.setupKey; // This one is on TradeRecord
        }

        const k = String(val || "unknown").trim() || "unknown";
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(t);
    }

    const rows: CoachFocusItem[] = [];
    for (const [k, g] of groups) {
        if (k === 'unknown' || k === 'undefined') continue;

        const s = summarize(g);
        const minCompleted = 2;
        const weight = Math.min(1, s.completed / 8);
        const penalty = s.completed >= minCompleted ? Math.max(0, -s.expectancyR) : 0;
        const urgency = penalty * (0.5 + 0.5 * weight);

        rows.push({
            kind,
            key: k,
            label: indexLabels?.[k] || k, // Ideally lookup pretty label
            stats: s,
            urgency,
        });
    }

    rows.sort((a, b) => (b.urgency || 0) - (a.urgency || 0));
    return rows;
}

function pickFocus(rows: CoachFocusItem[]): CoachFocusItem | null {
    if (rows.length === 0) return null;
    // Rows are already sorted by urgency locally, but here we pick best across dimensions?
    // Wait, pickFocus in v5 iterates DIMS.
    return rows.length > 0 ? rows[0] : null;
}

function buildPack(items: TradeRecord[]): CoachWindowPack {
    const summary = summarize(items);
    const topDims: Record<string, CoachFocusItem[]> = {};
    let allCandidates: CoachFocusItem[] = [];

    for (const def of DIM_DEFS) {
        const rows = computeDim(items, def.kind).slice(0, 3);
        topDims[def.kind] = rows;
        if (rows.length > 0) {
            // Add dimension label to items
            rows.forEach(r => r.dimLabel = def.label);
            allCandidates.push(...rows);
        }
    }

    // Pick global focus for this pack
    allCandidates.sort((a, b) => b.urgency - a.urgency);
    const focus = allCandidates.length > 0 ? allCandidates[0] : null;

    return { summary, focus, top: topDims };
}

// --- Main Build Function ---

export function buildCoachFocus(
    trades: TradeRecord[],
    todayIso: string
): CoachData {
    const weekStart = moment(todayIso).startOf("isoWeek").format("YYYY-MM-DD");
    const weekEnd = moment(todayIso).endOf("isoWeek").format("YYYY-MM-DD");
    const last30Start = moment(todayIso).subtract(29, "days").format("YYYY-MM-DD");

    const windowed = {
        today: trades.filter(t => t.dateIso === todayIso),
        week: trades.filter(t => t.dateIso >= weekStart && t.dateIso <= weekEnd),
        last30: trades.filter(t => t.dateIso >= last30Start && t.dateIso <= todayIso),
    };

    const todayPack = buildPack(windowed.today);
    const weekPack = buildPack(windowed.week);
    const last30Pack = buildPack(windowed.last30);

    // --- Weekly Series (for consistency bonus) ---
    const weeklySeries = [];
    const base = moment(todayIso).startOf("isoWeek");
    for (let i = 0; i < 8; i++) {
        const start = base.clone().subtract(i, "weeks");
        const end = start.clone().endOf("isoWeek");
        const s = start.format("YYYY-MM-DD");
        const e = end.format("YYYY-MM-DD");

        const items = trades.filter(t => t.dateIso >= s && t.dateIso <= e);
        const pack = buildPack(items);

        // We only need focus and top3 candidates for calculating stripes
        const allCands: CoachFocusItem[] = [];
        Object.values(pack.top).forEach(rows => allCands.push(...rows));
        allCands.sort((a, b) => b.urgency - a.urgency);
        const top3 = allCands.slice(0, 3);

        weeklySeries.push({
            start: s,
            end: e,
            focus: pack.focus,
            top3: top3 // simplified
        });
    }

    // --- Combined ---
    const weights: Record<string, number> = { today: 0.8, week: 1.0, last30: 1.25 };
    const byKey = new Map<string, CoachFocusItem>();

    const idOf = (row: CoachFocusItem) => `${row.kind}:${row.key}`;

    // Calculate weekly hits
    const weeklyTopIdSets = weeklySeries.map(w => {
        return new Set(w.top3.map(idOf));
    });

    const weekHits = new Map<string, number>();
    for (const set of weeklyTopIdSets) {
        for (const id of set) diffMapCount(weekHits, id);
    }

    function diffMapCount(m: Map<string, number>, k: string) {
        m.set(k, (m.get(k) || 0) + 1);
    }

    const weekStreakOf = (id: string) => {
        let n = 0;
        for (const set of weeklyTopIdSets) {
            if (set.has(id)) n++;
            else break;
        }
        return n;
    };

    const addRow = (windowName: string, row: CoachFocusItem) => {
        const k = idOf(row);
        const w = weights[windowName] || 1;
        const base = row.urgency;
        const score = base * w;

        let agg = byKey.get(k);
        if (!agg) {
            agg = {
                ...row,
                score: 0,
                windows: [],
                lastSeen: windowName,
                weekHitCount: weekHits.get(k) || 0,
                weekStreak: weekStreakOf(k) || 0,
            };
            byKey.set(k, agg);
        }

        agg.score = (agg.score || 0) + score;
        if (base > 0 && agg.windows) agg.windows.push(windowName);

        // Prefer stats from larger window
        const rank = (n: string) => (n === "last30" ? 3 : n === "week" ? 2 : 1);
        if (rank(windowName) >= rank(agg.lastSeen || "")) {
            agg.lastSeen = windowName;
            agg.stats = row.stats;
            agg.urgency = row.urgency;
        }
    };

    // Feed combine
    const packsRaw = { today: todayPack, week: weekPack, last30: last30Pack };
    for (const [wName, p] of Object.entries(packsRaw)) {
        Object.values(p.top).flat().forEach(r => addRow(wName, r));
    }

    // Apply Bonuses
    const list = Array.from(byKey.values());
    for (const agg of list) {
        const n = agg.windows?.length || 0;
        const persistence = n >= 2 ? 1 + 0.25 * (n - 1) : 1;

        const hit = agg.weekHitCount || 0;
        const streak = agg.weekStreak || 0;
        const hitBonus = hit >= 2 ? 1 + 0.2 * (Math.min(hit, 5) - 1) : 1;
        const streakBonus = streak >= 2 ? 1 + 0.35 * (Math.min(streak, 5) - 1) : 1;
        const weeklyBonus = Math.min(2.2, hitBonus * streakBonus);

        agg.score = (agg.score || 0) * persistence * weeklyBonus;
    }

    list.sort((a, b) => (b.score || 0) - (a.score || 0));

    return {
        today: todayPack,
        week: weekPack,
        last30: last30Pack,
        combined: {
            focus: list.length > 0 ? list[0] : null,
            ranked: list.slice(0, 12),
            weights,
            weekly: {
                weeksBack: weeklySeries.length,
                series: weeklySeries
            }
        }
    };
}
