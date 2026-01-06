import * as React from "react";
import type { TradeIndex, TradeIndexStatus } from "../core/trade-index";
import { computeTradeStatsByAccountType } from "../core/stats";
import type { TradeRecord, AccountType } from "../core/contracts";
import type { StrategyIndex } from "../core/strategy-index";
import {
    normalizeMarketCycleForAnalytics,
    computeTuitionAnalysis,
    computeDailyAgg,
    computeStrategyAttribution,
    identifyStrategyForAnalytics,
    computeContextAnalysis,
    computeErrorAnalysis,
    filterTradesByScope,
    type AnalyticsScope,
    type DailyAgg,
} from "../core/analytics";
import {
    computeHubSuggestion,
    computeMindsetFromRecentLive,
    computeRMultiplesFromPnl,
    computeRecentLiveTradesAsc,
    computeTopStrategiesFromTrades,
} from "../core/hub-analytics";
import { parseCoverRef } from "../core/cover-parser";
import {
    computeOpenTradePrimaryStrategy,
    computeTodayStrategyPicks,
    computeTradeBasedStrategyPicks,
} from "../core/console-state";
import { buildReviewHints } from "../core/review-hints";
import type { EnumPresets } from "../core/enum-presets";
import { createEnumPresetsFromFrontmatter } from "../core/enum-presets";

import {
    buildFixPlan,
    buildInspectorIssues,
    type FixPlan,
} from "../core/inspector";

import {
    buildFrontmatterInventory,
    type FrontmatterFile,
    type FrontmatterInventory,
    type ManagerApplyResult,
    type StrategyNoteFrontmatter,
} from "../core/manager";
import type { IntegrationCapability } from "../integrations/contracts";
import type { AlBrooksConsoleSettings } from "../settings";
import type { CourseSnapshot } from "../core/course";
import { type MemorySnapshot } from "../core/memory";
import { TRADE_TAG } from "../core/field-mapper";

import type { App, Component, TFile } from "obsidian";
import type { TodayContext } from "../core/today-context";
import { type PluginIntegrationRegistry } from "../integrations/PluginIntegrationRegistry";

// --- Local Helpers ---

function toLocalDateIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function getLastLocalDateIsos(days: number): string[] {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < Math.max(1, days); i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        out.push(toLocalDateIso(d));
    }
    return out;
}

// --- Types ---

export type PaTagSnapshot = {
    files: number;
    tagMap: Record<string, number>;
};

export type SchemaIssueItem = {
    path: string;
    name: string;
    key: string;
    type: string;
    val?: string;
};

export type GalleryItem = {
    tradePath: string;
    tradeName: string;
    accountType: AccountType;
    pnl: number;
    coverPath: string;
    url?: string;
};

export interface DashboardDataProps {
    index: TradeIndex;
    strategyIndex: StrategyIndex;
    todayContext?: TodayContext;
    loadStrategyNotes?: () => Promise<StrategyNoteFrontmatter[]>;
    loadPaTagSnapshot?: () => Promise<PaTagSnapshot>;
    loadAllFrontmatterFiles?: () => Promise<FrontmatterFile[]>;
    applyFixPlan?: (
        plan: FixPlan,
        options: { deleteKeys: boolean }
    ) => Promise<ManagerApplyResult>;
    settings: AlBrooksConsoleSettings;
    subscribeSettings?: (
        fn: (settings: AlBrooksConsoleSettings) => void
    ) => () => void;
    loadCourse?: (settings: AlBrooksConsoleSettings) => Promise<CourseSnapshot>;
    loadMemory?: (settings: AlBrooksConsoleSettings) => Promise<MemorySnapshot>;
    integrations?: PluginIntegrationRegistry;

    // Added for derived logic
    resolveLink?: (linkText: string, fromPath: string) => string | undefined;
    getResourceUrl?: (path: string) => string | undefined;
    enumPresets?: EnumPresets;
}

export const useDashboardData = ({
    index,
    strategyIndex,
    todayContext,
    loadStrategyNotes,
    loadPaTagSnapshot,
    loadAllFrontmatterFiles,
    applyFixPlan,
    settings: initialSettings,
    subscribeSettings,
    loadCourse,
    loadMemory,
    integrations,
    resolveLink,
    getResourceUrl,
    enumPresets,
}: DashboardDataProps) => {
    // --- State: Core Data ---
    const [trades, setTrades] = React.useState(index.getAll());
    const [strategies, setStrategies] = React.useState<any[]>(
        () => strategyIndex && (strategyIndex.list ? strategyIndex.list() : [])
    );
    const [status, setStatus] = React.useState<TradeIndexStatus>(() =>
        index.getStatus ? index.getStatus() : { phase: "ready" }
    );
    const [todayMarketCycle, setTodayMarketCycle] = React.useState<
        string | undefined
    >(() => todayContext?.getTodayMarketCycle());

    // --- State: UI Scope (Data related) ---
    const [analyticsScope, setAnalyticsScope] =
        React.useState<AnalyticsScope>("Live");
    const [galleryScope, setGalleryScope] = React.useState<AnalyticsScope>("All");
    const [showFixPlan, setShowFixPlan] = React.useState(false);
    const [activePage, setActivePage] = React.useState<"trading" | "analytics" | "learn" | "manage">("trading");


    // --- State: Inspector & Manager ---
    const [paTagSnapshot, setPaTagSnapshot] = React.useState<PaTagSnapshot>();
    const [schemaIssues, setSchemaIssues] = React.useState<SchemaIssueItem[]>([]);
    const [schemaScanNote, setSchemaScanNote] = React.useState<
        string | undefined
    >(undefined);
    const [managerPlan, setManagerPlan] = React.useState<FixPlan | undefined>(
        undefined
    );
    const [managerResult, setManagerResult] = React.useState<
        ManagerApplyResult | undefined
    >(undefined);
    const [managerBusy, setManagerBusy] = React.useState(false);
    const [managerDeleteKeys, setManagerDeleteKeys] = React.useState(false);
    const [managerBackups, setManagerBackups] = React.useState<
        Record<string, string> | undefined
    >(undefined);
    const [managerTradeInventory, setManagerTradeInventory] = React.useState<
        FrontmatterInventory | undefined
    >(undefined);
    const [managerTradeInventoryFiles, setManagerTradeInventoryFiles] =
        React.useState<FrontmatterFile[] | undefined>(undefined);
    const [managerStrategyInventory, setManagerStrategyInventory] =
        React.useState<FrontmatterInventory | undefined>(undefined);
    const [managerStrategyInventoryFiles, setManagerStrategyInventoryFiles] =
        React.useState<FrontmatterFile[] | undefined>(undefined);
    const [managerSearch, setManagerSearch] = React.useState("");
    const [managerScope, setManagerScope] = React.useState<"trade" | "strategy">(
        "trade"
    );
    const [managerInspectorKey, setManagerInspectorKey] = React.useState<
        string | undefined
    >(undefined);
    const [managerInspectorTab, setManagerInspectorTab] = React.useState<
        "vals" | "files"
    >("vals");
    const [managerInspectorFileFilter, setManagerInspectorFileFilter] =
        React.useState<{ paths: string[]; label?: string } | undefined>(undefined);

    // --- State: Settings & Async Loaders ---
    const [settings, setSettings] =
        React.useState<AlBrooksConsoleSettings>(initialSettings);
    const settingsKey = `${settings.courseRecommendationWindow}|${settings.srsDueThresholdDays}|${settings.srsRandomQuizCount}`;

    const [course, setCourse] = React.useState<CourseSnapshot | undefined>(
        undefined
    );
    const [courseBusy, setCourseBusy] = React.useState(false);
    const [courseError, setCourseError] = React.useState<string | undefined>(
        undefined
    );

    const [memory, setMemory] = React.useState<MemorySnapshot | undefined>(
        undefined
    );
    const [memoryBusy, setMemoryBusy] = React.useState(false);
    const [memoryError, setMemoryError] = React.useState<string | undefined>(
        undefined
    );
    const [memoryIgnoreFocus, setMemoryIgnoreFocus] = React.useState(false);
    const [memoryShakeIndex, setMemoryShakeIndex] = React.useState(0);

    // --- Effects ---

    // 1. Schema & PA Snapshot Scan
    React.useEffect(() => {
        let cancelled = false;

        const isEmpty = (v: unknown): boolean => {
            if (v === undefined || v === null) return true;
            if (Array.isArray(v)) return v.filter((x) => !isEmpty(x)).length === 0;
            const s = String(v).trim();
            if (!s) return true;
            if (s === "Empty") return true;
            if (s.toLowerCase() === "null") return true;
            if (s.toLowerCase().includes("unknown")) return true;
            return false;
        };

        const pickVal = (fm: Record<string, any>, keys: string[]) => {
            for (const k of keys) {
                if (Object.prototype.hasOwnProperty.call(fm, k)) return fm[k];
            }
            return undefined;
        };

        const run = async () => {
            const notes: string[] = [];

            // Trade Issues
            const tradeIssues: SchemaIssueItem[] = [];
            for (const t of trades) {
                const isCompleted =
                    t.outcome === "win" ||
                    t.outcome === "loss" ||
                    t.outcome === "scratch";
                if (!isCompleted) continue;

                if (isEmpty(t.ticker)) {
                    tradeIssues.push({
                        path: t.path,
                        name: t.name,
                        key: "品种/ticker",
                        type: "❌ 缺少必填",
                    });
                }
                if (isEmpty(t.timeframe)) {
                    tradeIssues.push({
                        path: t.path,
                        name: t.name,
                        key: "时间周期/timeframe",
                        type: "❌ 缺少必填",
                    });
                }
                if (isEmpty(t.direction)) {
                    tradeIssues.push({
                        path: t.path,
                        name: t.name,
                        key: "方向/direction",
                        type: "❌ 缺少必填",
                    });
                }

                const hasPatterns =
                    Array.isArray(t.patternsObserved) &&
                    t.patternsObserved.filter((p) => !isEmpty(p)).length > 0;
                const hasStrategy =
                    !isEmpty(t.strategyName) ||
                    !isEmpty(t.setupKey) ||
                    !isEmpty(t.setupCategory);
                if (!hasPatterns && !hasStrategy) {
                    tradeIssues.push({
                        path: t.path,
                        name: t.name,
                        key: "观察到的形态/patterns_observed",
                        type: "❌ 缺少必填(二选一)",
                    });
                }
            }

            // Strategy Issues
            let strategyIssues: SchemaIssueItem[] = [];
            if (loadStrategyNotes) {
                try {
                    const strategyNotes = await loadStrategyNotes();
                    strategyIssues = strategyNotes.flatMap((n) => {
                        const fm = (n.frontmatter ?? {}) as Record<string, any>;
                        const out: SchemaIssueItem[] = [];
                        const name =
                            n.path.split("/").pop()?.replace(/\.md$/i, "") ?? n.path;
                        const strategy = pickVal(fm, [
                            "策略名称/strategy_name",
                            "strategy_name",
                            "策略名称",
                        ]);
                        const patterns = pickVal(fm, [
                            "观察到的形态/patterns_observed",
                            "patterns_observed",
                            "观察到的形态",
                        ]);
                        if (isEmpty(strategy)) {
                            out.push({
                                path: n.path,
                                name,
                                key: "策略名称/strategy_name",
                                type: "❌ 缺少必填",
                                val: "",
                            });
                        }
                        if (isEmpty(patterns)) {
                            out.push({
                                path: n.path,
                                name,
                                key: "观察到的形态/patterns_observed",
                                type: "❌ 缺少必填",
                                val: "",
                            });
                        }
                        return out;
                    });
                } catch (e) {
                    notes.push(
                        `策略扫描失败：${e instanceof Error ? e.message : String(e)}`
                    );
                }
            } else {
                notes.push("策略扫描不可用：将仅基于交易索引进行 Schema 检查");
            }

            // PA Tag Snapshot
            let paSnap: PaTagSnapshot | undefined = undefined;
            if (loadPaTagSnapshot) {
                try {
                    paSnap = await loadPaTagSnapshot();
                } catch (e) {
                    notes.push(
                        `#PA 标签扫描失败：${e instanceof Error ? e.message : String(e)}`
                    );
                }
            } else {
                notes.push("#PA 标签扫描不可用：将不显示全库标签全景");
            }

            if (cancelled) return;
            setPaTagSnapshot(paSnap);
            setSchemaIssues([...tradeIssues, ...strategyIssues]);
            setSchemaScanNote(notes.length ? notes.join("；") : undefined);
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [trades, loadStrategyNotes, loadPaTagSnapshot]);

    // 2. Subscriptions
    React.useEffect(() => {
        setSettings(initialSettings);
    }, [initialSettings]);

    React.useEffect(() => {
        if (!subscribeSettings) return;
        return subscribeSettings((s) => setSettings(s));
    }, [subscribeSettings]);

    React.useEffect(() => {
        const onUpdate = () => setTrades(index.getAll());
        const unsubscribe = index.onChanged(onUpdate);
        onUpdate();
        return unsubscribe;
    }, [index]);

    React.useEffect(() => {
        if (!strategyIndex) return;
        const update = () => {
            try {
                const list = strategyIndex.list ? strategyIndex.list() : [];
                setStrategies(list);
            } catch (e) {
                console.warn("[al-brooks-console] strategyIndex.list() failed", e);
                setStrategies([]);
            }
        };
        update();
        const unsubscribe = strategyIndex.onChanged
            ? strategyIndex.onChanged(update)
            : undefined;
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [strategyIndex]);

    React.useEffect(() => {
        if (!todayContext?.onChanged) return;
        const onUpdate = () =>
            setTodayMarketCycle(todayContext.getTodayMarketCycle());
        const unsubscribe = todayContext.onChanged(onUpdate);
        onUpdate();
        return unsubscribe;
    }, [todayContext]);

    React.useEffect(() => {
        if (!index.onStatusChanged) return;
        const onStatus = () =>
            setStatus(index.getStatus ? index.getStatus() : { phase: "ready" });
        const unsubscribe = index.onStatusChanged(onStatus);
        onStatus();
        return unsubscribe;
    }, [index]);

    // RELOAD Course & Memory
    const reloadCourse = React.useCallback(async () => {
        if (!loadCourse) return;
        setCourseBusy(true);
        setCourseError(undefined);
        try {
            const next = await loadCourse(settings);
            setCourse(next);
        } catch (e) {
            console.warn("[al-brooks-console] loadCourse failed", e);
            setCourseError(e instanceof Error ? e.message : String(e));
        } finally {
            setCourseBusy(false);
        }
    }, [loadCourse, settings]);

    const reloadMemory = React.useCallback(async () => {
        if (!loadMemory) return;
        setMemoryIgnoreFocus(false);
        setMemoryShakeIndex(0);
        setMemoryBusy(true);
        setMemoryError(undefined);
        try {
            const next = await loadMemory(settings);
            setMemory(next);
        } catch (e) {
            setMemoryError(e instanceof Error ? e.message : String(e));
        } finally {
            setMemoryBusy(false);
        }
    }, [loadMemory, settings]);

    React.useEffect(() => {
        void reloadCourse();
    }, [reloadCourse, settingsKey]);

    React.useEffect(() => {
        void reloadMemory();
    }, [reloadMemory, settingsKey]);

    const onRebuild = React.useCallback(async () => {
        if (!index.rebuild) return;
        try {
            await index.rebuild();
        } catch (e) {
            console.warn("[al-brooks-console] Rebuild failed", e);
        }
    }, [index]);

    // --- Computed Data ---

    // 1. Core Summary
    const summary = React.useMemo(
        () => computeTradeStatsByAccountType(trades),
        [trades]
    );

    const liveCyclePerf = React.useMemo(() => {
        const normalizeCycle = (raw: unknown): string => {
            let s = String(raw ?? "").trim();
            if (!s) return "Unknown";
            if (s.includes("/")) {
                const parts = s.split("/");
                const cand = String(parts[1] ?? parts[0] ?? "").trim();
                if (cand) s = cand;
            }
            return normalizeMarketCycleForAnalytics(s) ?? "Unknown";
        };

        const byCycle = new Map<string, number>();
        for (const t of trades) {
            if (t.accountType !== "Live") continue;
            const cycle = normalizeCycle(t.marketCycle ?? "Unknown");
            const pnl =
                typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
            byCycle.set(cycle, (byCycle.get(cycle) ?? 0) + pnl);
        }

        return [...byCycle.entries()]
            .map(([name, pnl]) => ({ name, pnl }))
            .sort((a, b) => b.pnl - a.pnl);
    }, [trades]);

    const last30TradesDesc = React.useMemo(() => {
        const sorted = [...trades].sort((a, b) => {
            const da = a.dateIso ?? "";
            const db = b.dateIso ?? "";
            if (da !== db) return da < db ? 1 : -1;
            const ma = typeof a.mtime === "number" ? a.mtime : 0;
            const mb = typeof b.mtime === "number" ? b.mtime : 0;
            return mb - ma;
        });
        return sorted.slice(0, 30);
    }, [trades]);

    const tuition = React.useMemo(() => {
        const res = computeTuitionAnalysis(trades);
        return {
            tuitionR: res.tuitionR,
            rows: res.rows.map((r) => ({ tag: r.error, costR: r.costR })),
        };
    }, [trades]);

    const strategyPerf = React.useMemo(() => {
        const perf = new Map<
            string,
            { total: number; wins: number; pnl: number; lastDateIso: string }
        >();

        const resolveCanonical = (t: TradeRecord): string | null => {
            const raw =
                typeof t.strategyName === "string" ? t.strategyName.trim() : "";
            if (raw && raw !== "Unknown") {
                const looked = strategyIndex.lookup
                    ? strategyIndex.lookup(raw)
                    : undefined;
                return looked?.canonicalName || raw;
            }
            const pats = (t.patternsObserved ?? [])
                .map((p) => String(p).trim())
                .filter(Boolean);
            for (const p of pats) {
                const card = strategyIndex.byPattern
                    ? strategyIndex.byPattern(p)
                    : undefined;
                if (card?.canonicalName) return card.canonicalName;
            }
            return null;
        };

        for (const t of trades) {
            const canonical = resolveCanonical(t);
            if (!canonical) continue;
            const p = perf.get(canonical) ?? {
                total: 0,
                wins: 0,
                pnl: 0,
                lastDateIso: "",
            };
            p.total += 1;
            if (typeof t.pnl === "number" && Number.isFinite(t.pnl) && t.pnl > 0)
                p.wins += 1;
            if (typeof t.pnl === "number" && Number.isFinite(t.pnl)) p.pnl += t.pnl;
            if (t.dateIso && (!p.lastDateIso || t.dateIso > p.lastDateIso))
                p.lastDateIso = t.dateIso;
            perf.set(canonical, p);
        }

        return perf;
    }, [trades, strategyIndex]);

    const strategyStats = React.useMemo(() => {
        const isActive = (statusRaw: unknown) => {
            const s = typeof statusRaw === "string" ? statusRaw.trim() : "";
            if (!s) return false;
            return s.includes("实战") || s.toLowerCase().includes("active");
        };

        const total = strategies.length;
        const activeCount = strategies.filter((s) =>
            isActive((s as any).statusRaw)
        ).length;
        const learningCount = Math.max(0, total - activeCount);
        let totalUses = 0;
        strategyPerf.forEach((p) => (totalUses += p.total));
        return { total, activeCount, learningCount, totalUses };
    }, [strategies, strategyPerf]);

    const playbookPerfRows = React.useMemo(() => {
        const safePct = (wins: number, total: number) =>
            total > 0 ? Math.round((wins / total) * 100) : 0;

        const rows = [...strategyPerf.entries()]
            .map(([canonical, p]) => {
                const card = strategyIndex?.byName
                    ? strategyIndex.byName(canonical)
                    : undefined;
                return {
                    canonical,
                    path: card?.path,
                    total: p.total,
                    wins: p.wins,
                    pnl: p.pnl,
                    winRate: safePct(p.wins, p.total),
                };
            })
            .sort((a, b) => (b.pnl || 0) - (a.pnl || 0));

        return rows;
    }, [strategyPerf, strategyIndex]);

    // 2. Extra Derived Data (Added in Phase 2)

    const latestTrade = trades.length > 0 ? trades[0] : undefined;

    const todayIso = React.useMemo(() => toLocalDateIso(new Date()), []);
    const todayTrades = React.useMemo(
        () => trades.filter((t) => t.dateIso === todayIso),
        [trades, todayIso]
    );

    const todayKpi = React.useMemo(() => {
        const total = todayTrades.length;
        let wins = 0;
        let losses = 0;
        let netR = 0;

        for (const t of todayTrades) {
            const pnl =
                typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
            netR += pnl;

            const outcome = (t.outcome ?? "").toString().trim().toLowerCase();
            if (outcome === "win") {
                wins += 1;
            } else if (outcome === "loss") {
                losses += 1;
            } else if (!outcome || outcome === "unknown") {
                if (pnl > 0) wins += 1;
                else if (pnl < 0) losses += 1;
            }
        }

        const winRatePct = total > 0 ? Math.round((wins / total) * 100) : 0;

        return {
            total,
            wins,
            losses,
            winRatePct,
            netR,
        };
    }, [todayTrades]);

    const reviewHints = React.useMemo(() => {
        if (!latestTrade) return [];
        return buildReviewHints(latestTrade);
    }, [latestTrade]);

    const analyticsTrades = React.useMemo(
        () => filterTradesByScope(trades, analyticsScope),
        [trades, analyticsScope]
    );

    const contextAnalysis = React.useMemo(() => {
        return computeContextAnalysis(analyticsTrades).slice(0, 8);
    }, [analyticsTrades]);

    const errorAnalysis = React.useMemo(() => {
        return computeErrorAnalysis(analyticsTrades).slice(0, 5);
    }, [analyticsTrades]);

    const analyticsDaily = React.useMemo(
        () => computeDailyAgg(analyticsTrades, 90),
        [analyticsTrades]
    );

    const analyticsDailyByDate = React.useMemo(() => {
        const m = new Map<string, DailyAgg>();
        for (const d of analyticsDaily) m.set(d.dateIso, d);
        return m;
    }, [analyticsDaily]);

    const calendarDays = 35;
    const calendarDateIsos = React.useMemo(
        () => getLastLocalDateIsos(calendarDays),
        []
    );
    const calendarCells = React.useMemo(() => {
        return calendarDateIsos.map(
            (dateIso) =>
                analyticsDailyByDate.get(dateIso) ?? { dateIso, netR: 0, count: 0 }
        );
    }, [calendarDateIsos, analyticsDailyByDate]);

    const calendarMaxAbs = React.useMemo(() => {
        let max = 0;
        for (const c of calendarCells) max = Math.max(max, Math.abs(c.netR));
        return max;
    }, [calendarCells]);

    const strategyAttribution = React.useMemo(() => {
        return computeStrategyAttribution(analyticsTrades, strategyIndex, 8);
    }, [analyticsTrades, strategyIndex]);

    const analyticsRecentLiveTradesAsc = React.useMemo(() => {
        return computeRecentLiveTradesAsc(trades, 30);
    }, [trades]);

    const analyticsRMultiples = React.useMemo(() => {
        return computeRMultiplesFromPnl(analyticsRecentLiveTradesAsc);
    }, [analyticsRecentLiveTradesAsc]);

    const analyticsMind = React.useMemo(() => {
        return computeMindsetFromRecentLive(analyticsRecentLiveTradesAsc, 10);
    }, [analyticsRecentLiveTradesAsc]);

    const analyticsTopStrats = React.useMemo(() => {
        return computeTopStrategiesFromTrades(trades, 5, strategyIndex);
    }, [trades, strategyIndex]);

    const analyticsSuggestion = React.useMemo(() => {
        const top = tuition.rows[0];
        const pct =
            top && tuition.tuitionR > 0
                ? Math.round((top.costR / tuition.tuitionR) * 100)
                : undefined;
        return computeHubSuggestion({
            topStrategies: analyticsTopStrats,
            mindset: analyticsMind,
            live: summary.Live,
            backtest: summary.Backtest,
            topTuitionError: top
                ? { name: top.tag, costR: top.costR, pct }
                : undefined,
        });
    }, [
        analyticsTopStrats,
        analyticsMind,
        summary.Live,
        summary.Backtest,
        tuition,
    ]);

    const strategyLab = React.useMemo(() => {
        const tradesAsc = [...trades].sort((a, b) =>
            a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0
        );

        const curves: Record<AccountType, number[]> = {
            Live: [0],
            Demo: [0],
            Backtest: [0],
        };
        const cum: Record<AccountType, number> = {
            Live: 0,
            Demo: 0,
            Backtest: 0,
        };

        const stats = new Map<string, { win: number; total: number }>();

        for (const t of tradesAsc) {
            const pnl =
                typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
            const acct = (t.accountType ?? "Live") as AccountType;

            cum[acct] += pnl;
            curves[acct].push(cum[acct]);

            const key =
                identifyStrategyForAnalytics(t, strategyIndex).name ?? "Unknown";

            const prev = stats.get(key) ?? { win: 0, total: 0 };
            prev.total += 1;
            if (pnl > 0) prev.win += 1;
            stats.set(key, prev);
        }

        const topSetups = [...stats.entries()]
            .map(([name, v]) => ({
                name,
                total: v.total,
                wr: v.total > 0 ? Math.round((v.win / v.total) * 100) : 0,
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        const mostUsed = topSetups[0]?.name ?? "无";
        const keepIn = cum.Live < 0 ? "回测" : "实盘";

        return {
            curves,
            cum,
            topSetups,
            suggestion: `当前最常用的策略是 ${mostUsed}。建议在 ${keepIn} 中继续保持执行一致性。`,
        };
    }, [trades]);

    const gallery = React.useMemo((): {
        items: GalleryItem[];
        scopeTotal: number;
        candidateCount: number;
    } => {
        if (!getResourceUrl) return { items: [], scopeTotal: 0, candidateCount: 0 };
        const out: GalleryItem[] = [];
        const isImage = (p: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(p);

        const candidates =
            galleryScope === "All"
                ? trades
                : trades.filter(
                    (t) => ((t.accountType ?? "Live") as AccountType) === galleryScope
                );

        const candidatesSorted = [...candidates].sort((a, b) => {
            const da = String((a as any).dateIso ?? "");
            const db = String((b as any).dateIso ?? "");
            if (da === db) return 0;
            return da < db ? 1 : -1;
        });

        for (const t of candidatesSorted.slice(0, 20)) {
            const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
            const rawCover =
                (t as any).cover ?? (fm as any)["cover"] ?? (fm as any)["封面/cover"];
            const ref = parseCoverRef(rawCover);

            let resolved = "";
            let url: string | undefined = undefined;
            if (ref) {
                let target = String(ref.target ?? "").trim();
                if (target) {
                    if (/^https?:\/\//i.test(target)) {
                        resolved = target;
                        url = target;
                    } else {
                        resolved = resolveLink
                            ? resolveLink(target, t.path) ?? target
                            : target;
                        if (resolved && isImage(resolved)) {
                            url = getResourceUrl(resolved);
                        } else {
                            resolved = "";
                            url = undefined;
                        }
                    }
                }
            }

            const acct = (t.accountType ?? "Live") as AccountType;
            const pnl =
                typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;

            out.push({
                tradePath: t.path,
                tradeName: t.name,
                accountType: acct,
                pnl,
                coverPath: resolved,
                url,
            });
        }

        return {
            items: out,
            scopeTotal: candidatesSorted.length,
            candidateCount: Math.min(20, candidatesSorted.length),
        };
    }, [trades, resolveLink, getResourceUrl, galleryScope]);

    const gallerySearchHref = React.useMemo(() => {
        return `obsidian://search?query=${encodeURIComponent(`tag:#${TRADE_TAG}`)}`;
    }, []);

    const inspectorIssues = React.useMemo(() => {
        return buildInspectorIssues(trades, enumPresets, strategyIndex);
    }, [trades, enumPresets, strategyIndex]);

    const fixPlanText = React.useMemo(() => {
        if (!showFixPlan || !enumPresets) return undefined;
        const plan = buildFixPlan(trades, enumPresets);
        return JSON.stringify(plan, null, 2);
    }, [showFixPlan, trades, enumPresets]);

    const managerPlanText = React.useMemo(() => {
        if (!managerPlan) return undefined;
        return JSON.stringify(managerPlan, null, 2);
    }, [managerPlan]);

    const openTrade = React.useMemo(() => {
        return trades.find((t) => {
            const pnlMissing = typeof t.pnl !== "number" || !Number.isFinite(t.pnl);
            if (!pnlMissing) return false;
            return (
                t.outcome === "open" ||
                t.outcome === undefined ||
                t.outcome === "unknown"
            );
        });
    }, [trades]);

    const todayStrategyPicks = React.useMemo(() => {
        return computeTodayStrategyPicks({
            todayMarketCycle,
            strategyIndex,
            limit: 6,
        });
    }, [strategyIndex, todayMarketCycle]);

    const openTradeStrategy = React.useMemo(() => {
        return computeOpenTradePrimaryStrategy({
            openTrade,
            todayMarketCycle,
            strategyIndex,
        });
    }, [openTrade, strategyIndex, todayMarketCycle]);

    const strategyPicks = React.useMemo(() => {
        return computeTradeBasedStrategyPicks({
            trade: latestTrade,
            todayMarketCycle,
            strategyIndex,
            limit: 6,
        });
    }, [latestTrade, strategyIndex, todayMarketCycle]);

    const statusText = React.useMemo(() => {
        switch (status.phase) {
            case "building": {
                const p = typeof status.processed === "number" ? status.processed : 0;
                const t = typeof status.total === "number" ? status.total : 0;
                return t > 0 ? `索引：构建中… ${p}/${t}` : "索引：构建中…";
            }
            case "ready": {
                return typeof status.lastBuildMs === "number"
                    ? `索引：就绪（${status.lastBuildMs}ms）`
                    : "索引：就绪";
            }
            case "error":
                return `索引：错误${status.message ? ` — ${status.message}` : ""}`;
            default:
                return "索引：空闲";
        }
    }, [status]);

    // --- Actions ---

    const can = React.useCallback(
        (capabilityId: IntegrationCapability) =>
            Boolean(integrations?.isCapabilityAvailable(capabilityId)),
        [integrations]
    );

    const cycleMap: Record<string, string> = {
        "Strong Trend": "强趋势",
        "Weak Trend": "弱趋势",
        "Trading Range": "交易区间",
        "Breakout Mode": "突破模式",
        Breakout: "突破",
        Channel: "通道",
        "Broad Channel": "宽通道",
        "Tight Channel": "窄通道",
    };

    const scanManagerInventory = React.useCallback(async () => {
        // v5 对齐：默认扫描全库 frontmatter（不只 trades/strategies）。
        if (loadAllFrontmatterFiles) {
            const files = await loadAllFrontmatterFiles();
            const inv = buildFrontmatterInventory(files);
            setManagerTradeInventoryFiles(files);
            setManagerTradeInventory(inv);

            // 仅保留一个“全库”入口；策略区块不再单独展示。
            setManagerStrategyInventoryFiles(undefined);
            setManagerStrategyInventory(undefined);
            return;
        }

        // 回退：若宿主未提供全库扫描，则维持旧逻辑（trade index + strategy notes）。
        const tradeFiles: FrontmatterFile[] = trades.map((t) => ({
            path: t.path,
            frontmatter: (t.rawFrontmatter ?? {}) as Record<string, unknown>,
        }));
        const tradeInv = buildFrontmatterInventory(tradeFiles);
        setManagerTradeInventoryFiles(tradeFiles);
        setManagerTradeInventory(tradeInv);

        const strategyFiles: FrontmatterFile[] = [];
        if (loadStrategyNotes) {
            const notes = await loadStrategyNotes();
            for (const n of notes) {
                strategyFiles.push({
                    path: n.path,
                    frontmatter: (n.frontmatter ?? {}) as Record<string, unknown>,
                });
            }
        }
        const strategyInv = buildFrontmatterInventory(strategyFiles);
        setManagerStrategyInventoryFiles(strategyFiles);
        setManagerStrategyInventory(strategyInv);
    }, [loadAllFrontmatterFiles, loadStrategyNotes, trades]);

    const managerTradeFilesByPath = React.useMemo(() => {
        const map = new Map<string, FrontmatterFile>();
        for (const f of managerTradeInventoryFiles ?? []) map.set(f.path, f);
        return map;
    }, [managerTradeInventoryFiles]);

    const managerStrategyFilesByPath = React.useMemo(() => {
        const map = new Map<string, FrontmatterFile>();
        for (const f of managerStrategyInventoryFiles ?? []) map.set(f.path, f);
        return map;
    }, [managerStrategyInventoryFiles]);

    const selectManagerTradeFiles = React.useCallback(
        (paths: string[]) =>
            paths
                .map((p) => managerTradeFilesByPath.get(p))
                .filter((x): x is FrontmatterFile => Boolean(x)),
        [managerTradeFilesByPath]
    );

    const selectManagerStrategyFiles = React.useCallback(
        (paths: string[]) =>
            paths
                .map((p) => managerStrategyFilesByPath.get(p))
                .filter((x): x is FrontmatterFile => Boolean(x)),
        [managerStrategyFilesByPath]
    );

    const runManagerPlan = React.useCallback(
        async (
            plan: FixPlan,
            options: {
                closeInspector?: boolean;
                forceDeleteKeys?: boolean;
                refreshInventory?: boolean;
            } = {}
        ) => {
            setManagerPlan(plan);
            setManagerResult(undefined);

            if (!applyFixPlan) {
                window.alert(
                    "写入能力不可用：applyFixPlan 未注入（可能是 ConsoleView 未正确挂载）"
                );
                return;
            }

            setManagerBusy(true);
            try {
                const res = await applyFixPlan(plan, {
                    deleteKeys: options.forceDeleteKeys ? true : managerDeleteKeys,
                });
                setManagerResult(res);
                setManagerBackups(res.backups);

                if (res.failed > 0) {
                    const first = res.errors?.[0];
                    window.alert(
                        `部分操作失败：${res.failed} 个文件。` +
                        (first ? `\n示例：${first.path}\n${first.message}` : "")
                    );
                } else if (res.applied === 0) {
                    window.alert(
                        "未修改任何文件：可能是未匹配到目标、目标已存在（被跳过）、或文件 frontmatter 不可解析。"
                    );
                }

                if (options.closeInspector) {
                    setManagerInspectorKey(undefined);
                    setManagerInspectorTab("vals");
                    setManagerInspectorFileFilter(undefined);
                }
                if (options.refreshInventory) {
                    await scanManagerInventory();
                }
            } finally {
                setManagerBusy(false);
            }
        },
        [
            applyFixPlan,
            managerDeleteKeys,
            scanManagerInventory,
            setManagerBackups,
            setManagerInspectorFileFilter,
            setManagerInspectorKey,
            setManagerInspectorTab,
        ]
    );

    return {
        // Data
        trades,
        strategies,
        status,
        todayMarketCycle,
        settings,

        // UI Scope & Layout
        analyticsScope, setAnalyticsScope,
        galleryScope, setGalleryScope,
        showFixPlan, setShowFixPlan,
        activePage, setActivePage,
        statusText,

        // Core Metrics
        summary,
        liveCyclePerf,
        last30TradesDesc,
        tuition,
        strategyPerf,
        strategyStats,
        playbookPerfRows,
        todayKpi,
        latestTrade,
        todayTrades,
        reviewHints,
        analyticsTrades,
        contextAnalysis,
        errorAnalysis,
        analyticsDaily,
        analyticsDailyByDate,
        calendarCells,
        calendarDays,
        calendarMaxAbs,
        strategyAttribution,
        analyticsRMultiples,
        analyticsRecentLiveTradesAsc,
        analyticsMind,
        analyticsTopStrats,
        analyticsSuggestion,
        strategyLab,

        // Gallery
        gallery,
        gallerySearchHref,

        // Course & Memory
        course, setCourse,
        courseBusy, setCourseBusy,
        courseError, setCourseError,
        reloadCourse,
        memory, setMemory,
        memoryBusy, setMemoryBusy,
        memoryError, setMemoryError,
        memoryIgnoreFocus, setMemoryIgnoreFocus,
        memoryShakeIndex, setMemoryShakeIndex,
        reloadMemory,

        // Schema & Updates
        schemaIssues,
        schemaScanNote,
        paTagSnapshot,
        inspectorIssues,
        fixPlanText,
        managerPlanText,

        // Open/Picks
        openTrade,
        todayStrategyPicks,
        openTradeStrategy,
        strategyPicks,

        // Manager
        managerPlan, setManagerPlan,
        managerResult, setManagerResult,
        managerBusy, setManagerBusy,
        managerDeleteKeys, setManagerDeleteKeys,
        managerBackups, setManagerBackups,
        managerTradeInventory,
        managerTradeInventoryFiles,
        managerStrategyInventory,
        managerStrategyInventoryFiles,
        managerSearch, setManagerSearch,
        managerScope, setManagerScope,
        managerInspectorKey, setManagerInspectorKey,
        managerInspectorTab, setManagerInspectorTab,
        managerInspectorFileFilter, setManagerInspectorFileFilter,
        scanManagerInventory,
        runManagerPlan,
        selectManagerTradeFiles,
        selectManagerStrategyFiles,

        // Integrations / Misc
        can,
        cycleMap,
        onRebuild,
    };
};
