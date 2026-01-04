import * as React from "react";
import {
  ItemView,
  WorkspaceLeaf,
  TFile,
  MarkdownRenderer,
  Component,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import { createRoot, Root } from "react-dom/client";
import type { TradeIndex, TradeIndexStatus } from "../core/trade-index";
import { computeTradeStatsByAccountType } from "../core/stats";
import { buildReviewHints } from "../core/review-hints";
import type { AccountType, TradeRecord } from "../core/contracts";
import type { StrategyIndex } from "../core/strategy-index";
import { matchStrategies } from "../core/strategy-matcher";
import { StatsCard } from "./components/StatsCard";
import { StrategyStats } from "./components";
import { TradeList } from "./components/TradeList";
import { StrategyList } from "./components/StrategyList";
import { ContextWidget, ErrorWidget } from "./components/AnalyticsWidgets";
import {
  computeDailyAgg,
  computeEquityCurve,
  computeStrategyAttribution,
  computeContextAnalysis,
  computeErrorAnalysis,
  filterTradesByScope,
  type AnalyticsScope,
  type DailyAgg,
} from "../core/analytics";
import { parseCoverRef } from "../core/cover-parser";
import {
  computeOpenTradePrimaryStrategy,
  computeTodayStrategyPicks,
  computeTradeBasedStrategyPicks,
} from "../core/console-state";
import type { EnumPresets } from "../core/enum-presets";
import { createEnumPresetsFromFrontmatter } from "../core/enum-presets";
import {
  buildFixPlan,
  buildInspectorIssues,
  type FixPlan,
} from "../core/inspector";
import {
  buildStrategyMaintenancePlan,
  buildTradeNormalizationPlan,
  type ManagerApplyResult,
  type StrategyNoteFrontmatter,
} from "../core/manager";
import type { IntegrationCapability } from "../integrations/contracts";
import type { PluginIntegrationRegistry } from "../integrations/PluginIntegrationRegistry";
import type { TodayContext } from "../core/today-context";
import { normalizeTag } from "../core/field-mapper";
import type { AlBrooksConsoleSettings } from "../settings";
import {
  buildCourseSnapshot,
  parseSyllabusJsonFromMarkdown,
  simpleCourseId,
  type CourseSnapshot,
} from "../core/course";
import { buildMemorySnapshot, type MemorySnapshot } from "../core/memory";
import { TRADE_TAG } from "../core/field-mapper";

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

function getDayOfMonth(dateIso: string): string {
  const parts = dateIso.split("-");
  const d = parts[2] ?? "";
  return d.startsWith("0") ? d.slice(1) : d;
}

function getYearMonth(dateIso: string | undefined): string | undefined {
  if (!dateIso) return undefined;
  const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}`;
}

function sumPnlR(trades: TradeRecord[]): number {
  let sum = 0;
  for (const t of trades) {
    if (typeof t.pnl === "number" && Number.isFinite(t.pnl)) sum += t.pnl;
  }
  return sum;
}

function getRColorByAccountType(accountType: AccountType): string {
  switch (accountType) {
    case "Live":
      return "var(--text-success)";
    case "Demo":
      return "var(--text-warning)";
    case "Backtest":
      return "var(--text-accent)";
  }
}

function computeWindowRByAccountType(
  trades: TradeRecord[],
  windowSize: number
): Record<AccountType, number> {
  const by: Record<AccountType, TradeRecord[]> = {
    Live: [],
    Demo: [],
    Backtest: [],
  };
  for (const t of trades.slice(0, windowSize)) {
    const at = t.accountType;
    if (at === "Live" || at === "Demo" || at === "Backtest") by[at].push(t);
  }
  return {
    Live: sumPnlR(by.Live),
    Demo: sumPnlR(by.Demo),
    Backtest: sumPnlR(by.Backtest),
  };
}

export const VIEW_TYPE_CONSOLE = "al-brooks-console-view";

type PaTagSnapshot = {
  files: number;
  tagMap: Record<string, number>;
};

type SchemaIssueItem = {
  path: string;
  name: string;
  key: string;
  type: string;
  val?: string;
};

interface Props {
  index: TradeIndex;
  strategyIndex: StrategyIndex;
  todayContext?: TodayContext;
  resolveLink?: (linkText: string, fromPath: string) => string | undefined;
  getResourceUrl?: (path: string) => string | undefined;
  enumPresets?: EnumPresets;
  loadStrategyNotes?: () => Promise<StrategyNoteFrontmatter[]>;
  loadPaTagSnapshot?: () => Promise<PaTagSnapshot>;
  applyFixPlan?: (
    plan: FixPlan,
    options?: { deleteKeys?: boolean }
  ) => Promise<ManagerApplyResult>;
  restoreFiles?: (
    backups: Record<string, string>
  ) => Promise<ManagerApplyResult>;
  settings: AlBrooksConsoleSettings;
  subscribeSettings?: (
    listener: (settings: AlBrooksConsoleSettings) => void
  ) => () => void;
  loadCourse?: (settings: AlBrooksConsoleSettings) => Promise<CourseSnapshot>;
  loadMemory?: (settings: AlBrooksConsoleSettings) => Promise<MemorySnapshot>;
  openFile: (path: string) => void;
  runCommand?: (commandId: string) => void;
  integrations?: PluginIntegrationRegistry;
  version: string;
}

class ConsoleErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown) {
    console.warn("[al-brooks-console] Dashboard render error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "16px",
            fontFamily: "var(--font-interface)",
            maxWidth: "1200px",
            margin: "0 auto",
          }}
        >
          <h2
            style={{
              borderBottom: "1px solid var(--background-modifier-border)",
              paddingBottom: "10px",
              marginBottom: "12px",
            }}
          >
            🦁 交易员控制台
          </h2>
          <div style={{ color: "var(--text-error)", marginBottom: "8px" }}>
            控制台渲染失败：{this.state.message ?? "未知错误"}
          </div>
          <div style={{ color: "var(--text-muted)" }}>
            建议重新打开视图后，在顶部使用“重建索引”。
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const MarkdownBlock: React.FC<{ markdown: string; sourcePath?: string }> = ({
  markdown,
  sourcePath = "",
}) => {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = "";

    const component = new Component();
    void MarkdownRenderer.renderMarkdown(markdown, el, sourcePath, component);
    return () => component.unload();
  }, [markdown, sourcePath]);

  return <div ref={ref} />;
};

const ConsoleComponent: React.FC<Props> = ({
  index,
  strategyIndex,
  todayContext,
  resolveLink,
  getResourceUrl,
  enumPresets,
  loadStrategyNotes,
  loadPaTagSnapshot,
  applyFixPlan,
  restoreFiles,
  settings: initialSettings,
  subscribeSettings,
  loadCourse,
  loadMemory,
  openFile,
  runCommand,
  integrations,
  version,
}) => {
  const [trades, setTrades] = React.useState(index.getAll());
  const [strategies, setStrategies] = React.useState<any[]>(() =>
    strategyIndex && (strategyIndex.list ? strategyIndex.list() : [])
  );
  const [status, setStatus] = React.useState<TradeIndexStatus>(() =>
    index.getStatus ? index.getStatus() : { phase: "ready" }
  );
  const [todayMarketCycle, setTodayMarketCycle] = React.useState<
    string | undefined
  >(() => todayContext?.getTodayMarketCycle());
  const [analyticsScope, setAnalyticsScope] =
    React.useState<AnalyticsScope>("Live");
  const [showFixPlan, setShowFixPlan] = React.useState(false);
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

  React.useEffect(() => {
    let cancelled = false;

    const isEmpty = (v: unknown): boolean => {
      if (v === undefined || v === null) return true;
      if (Array.isArray(v)) return v.filter((x) => !isEmpty(x)).length === 0;
      const s = String(v).trim();
      if (!s) return true;
      if (s === "Empty") return true;
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

      // --- Minimal-burden Schema issues (Trade) ---
      const tradeIssues: SchemaIssueItem[] = [];
      for (const t of trades) {
        const isCompleted =
          t.outcome === "win" || t.outcome === "loss" || t.outcome === "scratch";
        if (!isCompleted) continue;

        if (!t.ticker) {
          tradeIssues.push({
            path: t.path,
            name: t.name,
            key: "品种/ticker",
            type: "❌ 缺少必填",
          });
        }
        if (!t.timeframe) {
          tradeIssues.push({
            path: t.path,
            name: t.name,
            key: "时间周期/timeframe",
            type: "❌ 缺少必填",
          });
        }
        if (!t.direction) {
          tradeIssues.push({
            path: t.path,
            name: t.name,
            key: "方向/direction",
            type: "❌ 缺少必填",
          });
        }

        // “形态/策略”二选一：至少有一个即可
        const hasPatterns =
          Array.isArray(t.patternsObserved) && t.patternsObserved.length > 0;
        const hasStrategy =
          typeof t.strategyName === "string" && t.strategyName.trim().length > 0;
        if (!hasPatterns && !hasStrategy) {
          tradeIssues.push({
            path: t.path,
            name: t.name,
            key: "观察到的形态/patterns_observed",
            type: "❌ 缺少必填(二选一)",
          });
        }
      }

      // --- Minimal-burden Schema issues (Strategy) ---
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

      // --- PA tag snapshot (Tag panorama KPIs) ---
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

  const canOpenTodayNote = Boolean(todayContext?.openTodayNote);
  const onOpenTodayNote = React.useCallback(async () => {
    try {
      await todayContext?.openTodayNote?.();
    } catch (e) {
      console.warn("[al-brooks-console] openTodayNote failed", e);
    }
  }, [todayContext]);
  const [managerArmed, setManagerArmed] = React.useState(false);
  const [managerDeleteKeys, setManagerDeleteKeys] = React.useState(false);
  const [managerBackups, setManagerBackups] = React.useState<
    Record<string, string> | undefined
  >(undefined);

  const [settings, setSettings] =
    React.useState<AlBrooksConsoleSettings>(initialSettings);
  const settingsKey = `${settings.courseRecommendationWindow}|${settings.srsDueThresholdDays}|${settings.srsRandomQuizCount}`;

  React.useEffect(() => {
    setSettings(initialSettings);
  }, [initialSettings]);

  React.useEffect(() => {
    if (!subscribeSettings) return;
    return subscribeSettings((s) => setSettings(s));
  }, [subscribeSettings]);

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

  const summary = React.useMemo(
    () => computeTradeStatsByAccountType(trades),
    [trades]
  );
  const all = summary.All;

  const accountTargetMonth = React.useMemo(() => {
    const liveDesc = [...trades]
      .filter((t) => t.accountType === "Live")
      .sort((a, b) => (a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0));
    const ym = getYearMonth(liveDesc[0]?.dateIso);
    if (ym) return ym;
    return toLocalDateIso(new Date()).slice(0, 7);
  }, [trades]);

  const accountDaysInMonth = React.useMemo(() => {
    const m = accountTargetMonth.match(/^(\d{4})-(\d{2})$/);
    if (!m) return 30;
    const year = Number(m[1]);
    const monthIdx = Number(m[2]) - 1;
    const days = new Date(year, monthIdx + 1, 0).getDate();
    return Number.isFinite(days) && days > 0 ? days : 30;
  }, [accountTargetMonth]);

  const accountDailyMap = React.useMemo(() => {
    const byDay = new Map<number, number>();
    for (const t of trades) {
      if (t.accountType !== "Live") continue;
      const ym = getYearMonth(t.dateIso);
      if (ym !== accountTargetMonth) continue;
      const dayStr = (t.dateIso ?? "").split("-")[2];
      const day = dayStr ? Number(dayStr) : NaN;
      if (!Number.isFinite(day)) continue;
      const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
      byDay.set(day, (byDay.get(day) ?? 0) + pnl);
    }
    return byDay;
  }, [trades, accountTargetMonth]);

  const liveCyclePerf = React.useMemo(() => {
    const normalizeCycle = (raw: string): string => {
      const s = String(raw ?? "").trim();
      if (!s) return "Unknown";
      if (s.includes("/")) {
        const parts = s.split("/");
        const cand = String(parts[1] ?? parts[0] ?? "Unknown").trim();
        return cand.length > 0 ? cand : "Unknown";
      }
      if (s.includes("(")) {
        const rawLeft = s.split("(")[0];
        const cand = String(rawLeft ?? "Unknown").trim();
        return cand.length > 0 ? cand : "Unknown";
      }
      return s;
    };

    const byCycle = new Map<string, number>();
    for (const t of trades) {
      if (t.accountType !== "Live") continue;
      const cycle = normalizeCycle(t.marketCycle ?? "Unknown");
      const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
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

  const last30MaxAbsR = React.useMemo(() => {
    let maxAbs = 0;
    for (const t of last30TradesDesc) {
      const r = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
      maxAbs = Math.max(maxAbs, Math.abs(r));
    }
    return maxAbs > 0 ? maxAbs : 1;
  }, [last30TradesDesc]);

  const liveMind = React.useMemo(() => {
    const ERROR_FIELD_ALIASES = [
      "mistake_tags",
      "错误/mistake_tags",
      "mistakes",
      "errors",
    ] as const;

    const getMistakeTags = (t: TradeRecord): string[] => {
      const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
      for (const key of ERROR_FIELD_ALIASES) {
        const v = (fm as any)[key];
        if (Array.isArray(v)) {
          const tags = v
            .filter((x) => typeof x === "string")
            .map((x) => (x as string).trim())
            .filter(Boolean);
          if (tags.length > 0) return tags;
        } else if (typeof v === "string" && v.trim()) {
          return [v.trim()];
        }
      }
      return [];
    };

    const recentLive = last30TradesDesc
      .filter((t) => t.accountType === "Live")
      .slice(0, 7);

    let tilt = 0;
    let fomo = 0;
    for (const t of recentLive) {
      const tags = getMistakeTags(t);
      const s = tags.join(" ");
      if (s.includes("Tilt") || s.includes("上头")) tilt += 1;
      if (s.includes("FOMO") || s.includes("追单")) fomo += 1;
    }

    const risk = tilt + fomo;
    const status =
      risk === 0 ? "🛡️ 状态极佳" : risk < 3 ? "⚠️ 有点起伏" : "🔥 极度危险";
    const color =
      risk === 0
        ? "var(--text-success)"
        : risk < 3
        ? "var(--text-warning)"
        : "var(--text-error)";

    return { tilt, fomo, risk, status, color };
  }, [last30TradesDesc]);

  const tuition = React.useMemo(() => {
    const ERROR_FIELD_ALIASES = [
      "mistake_tags",
      "错误/mistake_tags",
      "mistakes",
      "errors",
    ] as const;

    const getMistakeTags = (t: TradeRecord): string[] => {
      const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
      for (const key of ERROR_FIELD_ALIASES) {
        const v = (fm as any)[key];
        if (Array.isArray(v)) {
          const tags = v
            .filter((x) => typeof x === "string")
            .map((x) => (x as string).trim())
            .filter(Boolean);
          if (tags.length > 0) return tags;
        } else if (typeof v === "string" && v.trim()) {
          return [v.trim()];
        }
      }
      return [];
    };

    let tuitionR = 0;
    const by = new Map<string, number>();

    for (const t of trades) {
      if (t.accountType !== "Live") continue;
      const r = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
      if (r >= 0) continue;
      const tags = getMistakeTags(t);
      if (tags.length === 0) continue;

      const cost = Math.abs(r);
      tuitionR += cost;
      const share = cost / tags.length;
      for (const tag of tags) {
        by.set(tag, (by.get(tag) ?? 0) + share);
      }
    }

    const rows = [...by.entries()]
      .map(([tag, costR]) => ({ tag, costR }))
      .sort((a, b) => b.costR - a.costR);

    return { tuitionR, rows };
  }, [trades]);

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
    return () => {};
  }, [strategyIndex]);

  const strategyStats = React.useMemo(() => {
    const total = strategies.length;
    const activeCount = strategies.filter((s) => s.status === "active")
      .length;
    const learningCount = strategies.filter((s) => s.status === "learning")
      .length;
    const totalUses = strategies.reduce((acc, s) => acc + (s.uses || 0), 0);
    return { total, activeCount, learningCount, totalUses };
  }, [strategies]);

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

  const onRebuild = React.useCallback(async () => {
    if (!index.rebuild) return;
    try {
      await index.rebuild();
    } catch (e) {
      console.warn("[al-brooks-console] Rebuild failed", e);
    }
  }, [index]);

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

  const buttonStyle: React.CSSProperties = {
    marginLeft: "8px",
    padding: "4px 8px",
    fontSize: "0.8em",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "6px",
    background: "var(--background-primary)",
    color: "var(--text-normal)",
    cursor: "pointer",
    outline: "none",
    transition:
      "background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease",
  };

  const disabledButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    opacity: 0.5,
    cursor: "not-allowed",
  };

  const selectStyle: React.CSSProperties = {
    padding: "4px 8px",
    fontSize: "0.85em",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "6px",
    background: "var(--background-primary)",
    color: "var(--text-normal)",
  };

  const textButtonStyle: React.CSSProperties = {
    padding: "2px 4px",
    border: "none",
    background: "transparent",
    color: "var(--text-accent)",
    cursor: "pointer",
    textAlign: "left",
    borderRadius: "6px",
    outline: "none",
    transition: "background-color 180ms ease, box-shadow 180ms ease",
  };

  const onBtnMouseEnter = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (e.currentTarget.disabled) return;
      e.currentTarget.style.background = "var(--background-modifier-hover)";
      e.currentTarget.style.borderColor = "var(--interactive-accent)";
    },
    []
  );

  const onBtnMouseLeave = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = "var(--background-primary)";
      e.currentTarget.style.borderColor = "var(--background-modifier-border)";
    },
    []
  );

  const onBtnFocus = React.useCallback((e: React.FocusEvent<HTMLButtonElement>) => {
    if (e.currentTarget.disabled) return;
    e.currentTarget.style.boxShadow = "0 0 0 2px var(--interactive-accent)";
  }, []);

  const onBtnBlur = React.useCallback((e: React.FocusEvent<HTMLButtonElement>) => {
    e.currentTarget.style.boxShadow = "none";
  }, []);

  const onTextBtnMouseEnter = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (e.currentTarget.disabled) return;
      e.currentTarget.style.background = "var(--background-modifier-hover)";
    },
    []
  );

  const onTextBtnMouseLeave = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = "transparent";
    },
    []
  );

  const onTextBtnFocus = React.useCallback((e: React.FocusEvent<HTMLButtonElement>) => {
    if (e.currentTarget.disabled) return;
    e.currentTarget.style.boxShadow = "0 0 0 2px var(--interactive-accent)";
  }, []);

  const onTextBtnBlur = React.useCallback((e: React.FocusEvent<HTMLButtonElement>) => {
    e.currentTarget.style.boxShadow = "none";
  }, []);

  const onMiniCellMouseEnter = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (e.currentTarget.disabled) return;
      e.currentTarget.style.borderColor = "var(--interactive-accent)";
    },
    []
  );

  const onMiniCellMouseLeave = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.borderColor = "var(--background-modifier-border)";
    },
    []
  );

  const onMiniCellFocus = React.useCallback(
    (e: React.FocusEvent<HTMLButtonElement>) => {
      if (e.currentTarget.disabled) return;
      e.currentTarget.style.boxShadow = "0 0 0 2px var(--interactive-accent)";
    },
    []
  );

  const onMiniCellBlur = React.useCallback(
    (e: React.FocusEvent<HTMLButtonElement>) => {
      e.currentTarget.style.boxShadow = "none";
    },
    []
  );

  const onCoverMouseEnter = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.borderColor = "var(--interactive-accent)";
      e.currentTarget.style.background = "rgba(var(--mono-rgb-100), 0.06)";
    },
    []
  );

  const onCoverMouseLeave = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.borderColor = "var(--background-modifier-border)";
      e.currentTarget.style.background = "rgba(var(--mono-rgb-100), 0.03)";
    },
    []
  );

  const onCoverFocus = React.useCallback(
    (e: React.FocusEvent<HTMLButtonElement>) => {
      e.currentTarget.style.boxShadow = "0 0 0 2px var(--interactive-accent)";
    },
    []
  );

  const onCoverBlur = React.useCallback(
    (e: React.FocusEvent<HTMLButtonElement>) => {
      e.currentTarget.style.boxShadow = "none";
    },
    []
  );

  const action = React.useCallback(
    async (capabilityId: IntegrationCapability) => {
      if (!integrations) return;
      try {
        await integrations.run(capabilityId);
      } catch (e) {
        console.warn(
          "[al-brooks-console] Integration action failed",
          capabilityId,
          e
        );
      }
    },
    [integrations]
  );

  const can = React.useCallback(
    (capabilityId: IntegrationCapability) =>
      Boolean(integrations?.isCapabilityAvailable(capabilityId)),
    [integrations]
  );

  const canCreateTrade =
    can("quickadd:new-live-trade") ||
    can("quickadd:new-demo-trade") ||
    can("quickadd:new-backtest");

  const reloadCourse = React.useCallback(async () => {
    if (!loadCourse) return;
    setCourseBusy(true);
    setCourseError(undefined);
    try {
      const next = await loadCourse(settings);
      setCourse(next);
    } catch (e) {
      setCourseError(e instanceof Error ? e.message : String(e));
    } finally {
      setCourseBusy(false);
    }
  }, [loadCourse, settingsKey]);

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
  }, [loadMemory, settingsKey]);

  const hardRefreshMemory = React.useCallback(async () => {
    // Align with legacy semantics: reset local state + best-effort trigger DV refresh + reload snapshot.
    if (can("dataview:force-refresh")) {
      void action("dataview:force-refresh");
    }
    await reloadMemory();
  }, [action, can, reloadMemory]);

  React.useEffect(() => {
    void reloadCourse();
  }, [reloadCourse]);

  React.useEffect(() => {
    void reloadMemory();
  }, [reloadMemory]);

  const latestTrade = trades.length > 0 ? trades[0] : undefined;
  const todayIso = React.useMemo(() => toLocalDateIso(new Date()), []);
  const todayTrades = React.useMemo(
    () => trades.filter((t) => t.dateIso === todayIso),
    [trades, todayIso]
  );
  const todaySummary = React.useMemo(
    () => computeTradeStatsByAccountType(todayTrades),
    [todayTrades]
  );
  const todayLatestTrade = todayTrades.length > 0 ? todayTrades[0] : undefined;
  const rLast10 = React.useMemo(
    () => computeWindowRByAccountType(trades, 10),
    [trades]
  );
  const rLast30 = React.useMemo(
    () => computeWindowRByAccountType(trades, 30),
    [trades]
  );
  const r10MaxAbs = React.useMemo(
    () =>
      Math.max(
        Math.abs(rLast10.Live),
        Math.abs(rLast10.Demo),
        Math.abs(rLast10.Backtest),
        0
      ),
    [rLast10]
  );
  const r30MaxAbs = React.useMemo(
    () =>
      Math.max(
        Math.abs(rLast30.Live),
        Math.abs(rLast30.Demo),
        Math.abs(rLast30.Backtest),
        0
      ),
    [rLast30]
  );
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
    return computeErrorAnalysis(analyticsTrades).slice(0, 8);
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

  const equitySeries = React.useMemo(() => {
    const dateIsosAsc = [...calendarDateIsos].reverse();
    const filled: DailyAgg[] = dateIsosAsc.map(
      (dateIso) =>
        analyticsDailyByDate.get(dateIso) ?? { dateIso, netR: 0, count: 0 }
    );
    return computeEquityCurve(filled);
  }, [calendarDateIsos, analyticsDailyByDate]);

  const strategyAttribution = React.useMemo(() => {
    return computeStrategyAttribution(analyticsTrades, strategyIndex, 8);
  }, [analyticsTrades, strategyIndex]);

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
      const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
      const acct = (t.accountType ?? "Live") as AccountType;

      // 资金曲线：按账户分别累加（口径与 v5.0 接近：只在该账户出现时 push 一点）
      cum[acct] += pnl;
      curves[acct].push(cum[acct]);

      // 策略排行：策略名优先；没有则回退到 setupCategory
      let key = (t.strategyName ?? "").toString().trim();
      if (!key || key.toLowerCase() === "unknown") {
        const rawSetup = (t.setupCategory ?? "").toString().trim();
        key = rawSetup ? rawSetup.split("(")[0].trim() : "Unknown";
      }
      if (!key) key = "Unknown";

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

  type GalleryItem = {
    tradePath: string;
    tradeName: string;
    accountType: AccountType;
    pnl: number;
    coverPath: string;
    url?: string;
  };

  const galleryItems = React.useMemo((): GalleryItem[] => {
    if (!getResourceUrl) return [];
    const out: GalleryItem[] = [];
    const seen = new Set<string>();
    const isImage = (p: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(p);

    // v5.0 口径：从最近交易里取前 20 个候选，最终只展示 4 张。
    for (const t of trades.slice(0, 20)) {
      // 优先使用索引层规范字段（SSOT）；frontmatter 仅作回退。
      const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
      const rawCover =
        (t as any).cover ?? (fm as any)["cover"] ?? (fm as any)["封面/cover"];
      const ref = parseCoverRef(rawCover);
      if (!ref) continue;

      let target = ref.target;
      // 解析 markdown link 的 target 可能带引号/空格
      target = String(target).trim();
      if (!target) continue;

      // 支持外链封面（http/https），否则按 Obsidian linkpath 解析到 vault path。
      let resolved = "";
      let url: string | undefined = undefined;

      if (/^https?:\/\//i.test(target)) {
        resolved = target;
        url = target;
      } else {
        resolved = resolveLink ? resolveLink(target, t.path) ?? target : target;
        if (!resolved || !isImage(resolved)) continue;
        url = getResourceUrl(resolved);
      }

      if (!resolved || !isImage(resolved)) continue;
      if (seen.has(resolved)) continue;
      seen.add(resolved);

      const acct = (t.accountType ?? "Live") as AccountType;
      const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;

      out.push({
        tradePath: t.path,
        tradeName: t.name,
        accountType: acct,
        pnl,
        coverPath: resolved,
        url,
      });

      if (out.length >= 4) break;
    }

    return out;
  }, [trades, resolveLink, getResourceUrl]);

  const gallerySearchHref = React.useMemo(() => {
    return `obsidian://search?query=${encodeURIComponent(`tag:#${TRADE_TAG}`)}`;
  }, []);

  const inspectorIssues = React.useMemo(() => {
    return buildInspectorIssues(trades, enumPresets);
  }, [trades, enumPresets]);

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

  const TrendRow: React.FC<{
    label: string;
    value: number;
    ratio: number;
    color: string;
  }> = ({ label, value, ratio, color }) => {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "8px",
        }}
      >
        <div
          style={{
            width: "70px",
            color: "var(--text-muted)",
            fontSize: "0.85em",
          }}
        >
          {label}
        </div>
        <div
          style={{
            flex: "1 1 auto",
            display: "flex",
            height: "10px",
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "999px",
            overflow: "hidden",
            background: "rgba(var(--mono-rgb-100), 0.03)",
          }}
        >
          <div style={{ flex: "1 1 0", position: "relative" }}>
            {ratio < 0 && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  height: "100%",
                  width: "100%",
                  background: color,
                  opacity: 0.55,
                  transform: `scaleX(${Math.min(1, Math.abs(ratio))})`,
                  transformOrigin: "right",
                }}
              />
            )}
          </div>
          <div style={{ flex: "1 1 0", position: "relative" }}>
            {ratio > 0 && (
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  background: color,
                  opacity: 0.55,
                  transform: `scaleX(${Math.min(1, Math.abs(ratio))})`,
                  transformOrigin: "left",
                }}
              />
            )}
          </div>
        </div>
        <div style={{ width: "68px", textAlign: "right", fontSize: "0.9em" }}>
          <span
            style={{
              color: value >= 0 ? "var(--text-success)" : "var(--text-error)",
              fontWeight: 600,
            }}
          >
            {value >= 0 ? "+" : ""}
            {value.toFixed(1)}R
          </span>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        padding: "16px",
        fontFamily: "var(--font-interface)",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <h2
        style={{
          borderBottom: "1px solid var(--background-modifier-border)",
          paddingBottom: "10px",
          marginBottom: "20px",
        }}
      >
        🦁 交易员控制台{" "}
        <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>
          （Dashboard）
        </span>{" "}
        <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>
          v{version}
        </span>
        <span
          style={{
            fontSize: "0.8em",
            color: "var(--text-muted)",
            marginLeft: "10px",
          }}
        >
          {statusText}
        </span>
        {integrations && (
          <span style={{ marginLeft: "10px" }}>
            <button
              type="button"
              disabled={!can("quickadd:new-live-trade")}
              onClick={() => action("quickadd:new-live-trade")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("quickadd:new-live-trade")
                  ? buttonStyle
                  : disabledButtonStyle
              }
            >
              新建实盘
            </button>
            <button
              type="button"
              disabled={!can("quickadd:new-demo-trade")}
              onClick={() => action("quickadd:new-demo-trade")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("quickadd:new-demo-trade")
                  ? buttonStyle
                  : disabledButtonStyle
              }
            >
              新建模拟
            </button>
            <button
              type="button"
              disabled={!can("quickadd:new-backtest")}
              onClick={() => action("quickadd:new-backtest")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("quickadd:new-backtest") ? buttonStyle : disabledButtonStyle
              }
            >
              新建回测
            </button>
            <button
              type="button"
              disabled={!can("srs:review-flashcards")}
              onClick={() => action("srs:review-flashcards")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("srs:review-flashcards") ? buttonStyle : disabledButtonStyle
              }
            >
              ⚡️ 开始复习
            </button>
            <button
              type="button"
              disabled={!can("dataview:force-refresh")}
              onClick={() => action("dataview:force-refresh")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("dataview:force-refresh")
                  ? buttonStyle
                  : disabledButtonStyle
              }
            >
              刷新 DV
            </button>
            <button
              type="button"
              disabled={!can("tasks:open")}
              onClick={() => action("tasks:open")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={can("tasks:open") ? buttonStyle : disabledButtonStyle}
            >
              任务
            </button>
            <button
              type="button"
              disabled={!can("metadata-menu:open")}
              onClick={() => action("metadata-menu:open")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("metadata-menu:open") ? buttonStyle : disabledButtonStyle
              }
            >
              元数据
            </button>
          </span>
        )}
        {index.rebuild && (
          <button
            type="button"
            onClick={onRebuild}
            onMouseEnter={onBtnMouseEnter}
            onMouseLeave={onBtnMouseLeave}
            onFocus={onBtnFocus}
            onBlur={onBtnBlur}
            style={{ ...buttonStyle, marginLeft: "12px" }}
          >
            重建索引
          </button>
        )}
      </h2>

      <div
        style={{
          margin: "12px 0 10px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--background-modifier-border)",
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>⚔️ 交易中心</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
          Trading Hub
        </div>
      </div>

      {latestTrade && reviewHints.length > 0 && (
        <details style={{ marginBottom: "16px" }}>
          <summary
            style={{
              cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: "0.95em",
              userSelect: "none",
              marginBottom: "8px",
            }}
          >
            扩展（不参与旧版对照）：复盘提示
          </summary>
          <div
            style={{
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "12px",
              background: "var(--background-primary)",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
              复盘提示
              <span
                style={{
                  fontWeight: 400,
                  marginLeft: "8px",
                  color: "var(--text-muted)",
                  fontSize: "0.85em",
                }}
              >
                {latestTrade.name}
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              {reviewHints.slice(0, 4).map((h) => (
                <li key={h.id} style={{ marginBottom: "6px" }}>
                  <div>{h.zh}</div>
                  <div
                    style={{ color: "var(--text-muted)", fontSize: "0.85em" }}
                  >
                    {h.en}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: "8px" }}>今日</div>

        {!todayMarketCycle && (
          <div style={{ marginBottom: "12px" }}>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.9em",
                marginBottom: "10px",
              }}
            >
              创建今日日记，并设置市场周期以获取策略推荐（旧版同位置）。
            </div>
            <button
              type="button"
              disabled={!canOpenTodayNote}
              onClick={onOpenTodayNote}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={canOpenTodayNote ? buttonStyle : disabledButtonStyle}
            >
              打开/创建今日日记（设置市场周期）
            </button>
          </div>
        )}

        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9em",
            marginBottom: "10px",
          }}
        >
          市场周期：{todayMarketCycle ?? "—"}
        </div>

        {todayStrategyPicks.length > 0 && (
          <div style={{ marginBottom: "12px" }}>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
              周期 → 策略推荐
            </div>
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              {todayStrategyPicks.map((s) => (
                <li key={`today-pick-${s.path}`} style={{ marginBottom: "6px" }}>
                  <button
                    type="button"
                    onClick={() => openFile(s.path)}
                    style={textButtonStyle}
                    onMouseEnter={onTextBtnMouseEnter}
                    onMouseLeave={onTextBtnMouseLeave}
                    onFocus={onTextBtnFocus}
                    onBlur={onTextBtnBlur}
                  >
                    {s.canonicalName}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {openTrade && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
              进行中交易助手
            </div>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "0.9em",
                marginBottom: "8px",
              }}
            >
              <button
                type="button"
                onClick={() => openFile(openTrade.path)}
                style={textButtonStyle}
                onMouseEnter={onTextBtnMouseEnter}
                onMouseLeave={onTextBtnMouseLeave}
                onFocus={onTextBtnFocus}
                onBlur={onTextBtnBlur}
              >
                {openTrade.ticker ?? "未知"} • {openTrade.name}
              </button>
            </div>

            {openTradeStrategy ? (
              <div>
                <div style={{ marginBottom: "8px" }}>
                  策略:{" "}
                  <button
                    type="button"
                    onClick={() => openFile(openTradeStrategy.path)}
                    style={textButtonStyle}
                    onMouseEnter={onTextBtnMouseEnter}
                    onMouseLeave={onTextBtnMouseLeave}
                    onFocus={onTextBtnFocus}
                    onBlur={onTextBtnBlur}
                  >
                    {openTradeStrategy.canonicalName}
                  </button>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr",
                    gap: "8px",
                  }}
                >
                  {(openTradeStrategy.entryCriteria?.length ?? 0) > 0 && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                        入场
                      </div>
                      <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {openTradeStrategy
                          .entryCriteria!.slice(0, 3)
                          .map((x, i) => (
                            <li key={`entry-${i}`}>{x}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                  {(openTradeStrategy.stopLossRecommendation?.length ?? 0) > 0 && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                        止损
                      </div>
                      <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {openTradeStrategy
                          .stopLossRecommendation!.slice(0, 3)
                          .map((x, i) => (
                            <li key={`stop-${i}`}>{x}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                  {(openTradeStrategy.riskAlerts?.length ?? 0) > 0 && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                        风险
                      </div>
                      <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {openTradeStrategy.riskAlerts!.slice(0, 3).map((x, i) => (
                          <li key={`risk-${i}`}>{x}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(openTradeStrategy.takeProfitRecommendation?.length ?? 0) > 0 && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                        目标
                      </div>
                      <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {openTradeStrategy
                          .takeProfitRecommendation!.slice(0, 3)
                          .map((x, i) => (
                            <li key={`tp-${i}`}>{x}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>

                {(() => {
                  const curSignals = (openTrade.signalBarQuality ?? [])
                    .map((s) => String(s).trim())
                    .filter(Boolean);
                  const reqSignals = (openTradeStrategy.signalBarQuality ?? [])
                    .map((s) => String(s).trim())
                    .filter(Boolean);

                  const hasSignalInfo = curSignals.length > 0 || reqSignals.length > 0;
                  if (!hasSignalInfo) return null;

                  const norm = (s: string) => s.toLowerCase();
                  const signalMatch =
                    curSignals.length > 0 && reqSignals.length > 0
                      ? reqSignals.some((r) =>
                          curSignals.some((c) => {
                            const rn = norm(r);
                            const cn = norm(c);
                            return rn.includes(cn) || cn.includes(rn);
                          })
                        )
                      : null;

                  return (
                    <div
                      style={{
                        marginTop: "10px",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "10px",
                        padding: "10px",
                        background: "rgba(var(--mono-rgb-100), 0.03)",
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                        🔍 信号K验证
                      </div>

                      {curSignals.length > 0 ? (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                            marginBottom: "6px",
                          }}
                        >
                          当前：<span style={{ color: "var(--text-accent)" }}>{curSignals.join(" / ")}</span>
                        </div>
                      ) : (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                            marginBottom: "6px",
                          }}
                        >
                          当前：—
                        </div>
                      )}

                      {reqSignals.length > 0 ? (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                            marginBottom: "6px",
                          }}
                        >
                          建议：{reqSignals.join(" / ")}
                        </div>
                      ) : (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                            marginBottom: "6px",
                          }}
                        >
                          建议：未在策略卡中定义
                        </div>
                      )}

                      {signalMatch === null ? null : (
                        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                          匹配：
                          <span
                            style={{
                              marginLeft: "6px",
                              color: signalMatch
                                ? "var(--text-success)"
                                : "var(--text-warning)",
                              fontWeight: 700,
                            }}
                          >
                            {signalMatch ? "✅" : "⚠️"}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : (
              (() => {
                const marketCycle = (openTrade.marketCycle ?? todayMarketCycle)
                  ?.toString()
                  .trim();
                const setupCategory = openTrade.setupCategory
                  ?.toString()
                  .trim();
                const hasHints = Boolean(marketCycle || setupCategory);

                if (!hasHints) {
                  return (
                    <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                      未找到匹配策略。
                    </div>
                  );
                }

                const norm = (s: string) => s.toLowerCase();
                const wantCycleKey = marketCycle ? norm(marketCycle) : undefined;
                const wantSetupKey = setupCategory
                  ? norm(setupCategory)
                  : undefined;

                const scored = strategyIndex
                  .list()
                  .map((card) => {
                    let score = 0;
                    if (
                      wantCycleKey &&
                      card.marketCycles.some((c) => {
                        const ck = norm(String(c));
                        return ck.includes(wantCycleKey) || wantCycleKey.includes(ck);
                      })
                    ) {
                      score += 2;
                    }
                    if (
                      wantSetupKey &&
                      card.setupCategories.some((c) => {
                        const ck = norm(String(c));
                        return ck.includes(wantSetupKey) || wantSetupKey.includes(ck);
                      })
                    ) {
                      score += 1;
                    }
                    return { card, score };
                  })
                  .filter((x) => x.score > 0)
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                  .map((x) => x.card);

                if (scored.length === 0) {
                  return (
                    <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                      未找到匹配策略。
                    </div>
                  );
                }

                return (
                  <div>
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.9em",
                        marginBottom: "8px",
                      }}
                    >
                      💡 基于当前市场背景（{marketCycle ?? "未知"}）的策略建议：
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {scored.map((s) => (
                        <button
                          key={`today-fallback-${s.path}`}
                          type="button"
                          onClick={() => openFile(s.path)}
                          style={buttonStyle}
                          onMouseEnter={onBtnMouseEnter}
                          onMouseLeave={onBtnMouseLeave}
                          onFocus={onBtnFocus}
                          onBlur={onBtnBlur}
                        >
                          {s.canonicalName}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            marginBottom: "12px",
          }}
        >
          {(
            [
              {
                t: "总交易",
                v: String(todaySummary.All.countTotal),
                c: "var(--text-normal)",
              },
              {
                t: "获胜",
                v: String(todaySummary.All.countWins),
                c: "var(--text-success)",
              },
              {
                t: "亏损",
                v: String(todaySummary.All.countLosses),
                c: "var(--text-error)",
              },
              {
                t: "胜率",
                v: `${todaySummary.All.winRatePct}%`,
                c:
                  todaySummary.All.winRatePct >= 50
                    ? "var(--text-success)"
                    : "var(--text-warning)",
              },
              {
                t: "净利润",
                v: `${todaySummary.All.netProfit >= 0 ? "+" : ""}${todaySummary.All.netProfit.toFixed(1)}R`,
                c:
                  todaySummary.All.netProfit >= 0
                    ? "var(--text-success)"
                    : "var(--text-error)",
              },
            ] as const
          ).map((x) => (
            <div
              key={`today-m-${x.t}`}
              style={{
                flex: "1 1 160px",
                minWidth: "160px",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "12px",
                padding: "12px",
                background: "rgba(var(--mono-rgb-100), 0.03)",
              }}
            >
              <div style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
                {x.t}
              </div>
              <div style={{ marginTop: "6px", fontWeight: 800, fontSize: "1.2rem", color: x.c }}>
                {x.v}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "6px" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>
            最近交易记录
          </div>
          {todayTrades.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: "18px" }}>
              {todayTrades.slice(0, 5).map((t) => {
                const dir = (t.direction ?? "").toString().trim();
                const dirIcon =
                  dir === "多" || dir.toLowerCase() === "long"
                    ? "📈"
                    : dir === "空" || dir.toLowerCase() === "short"
                      ? "📉"
                      : "➡️";
                const tf = (t.timeframe ?? "").toString().trim();
                const strategy = (t.strategyName ?? "").toString().trim();

                const outcome = t.outcome;
                const outcomeLabel =
                  outcome === "win"
                    ? "Win"
                    : outcome === "loss"
                      ? "Loss"
                      : outcome === "scratch"
                        ? "Scratch"
                        : outcome === "open" || outcome === "unknown" || outcome === undefined
                          ? "进行中"
                          : String(outcome);
                const outcomeColor =
                  outcome === "win"
                    ? "var(--text-success)"
                    : outcome === "loss"
                      ? "var(--text-error)"
                      : outcome === "scratch"
                        ? "var(--text-warning)"
                        : "var(--text-muted)";

                const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : undefined;
                const pnlColor =
                  pnl === undefined
                    ? "var(--text-muted)"
                    : pnl >= 0
                      ? "var(--text-success)"
                      : "var(--text-error)";

                const entry =
                  (t.rawFrontmatter?.["entry"] as unknown as string | undefined) ??
                  (t.rawFrontmatter?.["入场"] as unknown as string | undefined);
                const stop =
                  (t.rawFrontmatter?.["stop"] as unknown as string | undefined) ??
                  (t.rawFrontmatter?.["止损"] as unknown as string | undefined);

                return (
                  <li key={t.path} style={{ marginBottom: "10px" }}>
                    <button
                      type="button"
                      onClick={() => openFile(t.path)}
                      style={textButtonStyle}
                      onMouseEnter={onTextBtnMouseEnter}
                      onMouseLeave={onTextBtnMouseLeave}
                      onFocus={onTextBtnFocus}
                      onBlur={onTextBtnBlur}
                    >
                      {dirIcon} {t.ticker ?? "未知"}
                      {tf ? ` ${tf}` : ""}
                      {strategy ? ` - ${strategy}` : ""}
                    </button>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "10px",
                        marginTop: "4px",
                        color: "var(--text-muted)",
                        fontSize: "0.85em",
                      }}
                    >
                      <span
                        style={{
                          padding: "1px 6px",
                          borderRadius: "6px",
                          border: "1px solid var(--background-modifier-border)",
                          color: outcomeColor,
                        }}
                      >
                        {outcomeLabel}
                      </span>
                      {entry ? <span>入场: {String(entry)}</span> : null}
                      {stop ? <span>止损: {String(stop)}</span> : null}
                      {pnl !== undefined ? (
                        <span style={{ color: pnlColor, fontWeight: 700 }}>
                          PnL: {pnl >= 0 ? "+" : ""}
                          {pnl.toFixed(1)}R
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div style={{ color: "var(--text-faint)", padding: "4px 0" }}>
              今日暂无交易记录
            </div>
          )}
        </div>

        <div style={{ marginBottom: "12px" }}>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>快捷入口</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <button
              type="button"
              disabled={!can("quickadd:new-live-trade")}
              onClick={() => action("quickadd:new-live-trade")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("quickadd:new-live-trade")
                  ? buttonStyle
                  : disabledButtonStyle
              }
            >
              新建实盘
            </button>
            <button
              type="button"
              disabled={!can("quickadd:new-demo-trade")}
              onClick={() => action("quickadd:new-demo-trade")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("quickadd:new-demo-trade")
                  ? buttonStyle
                  : disabledButtonStyle
              }
            >
              新建模拟
            </button>
            <button
              type="button"
              disabled={!can("quickadd:new-backtest")}
              onClick={() => action("quickadd:new-backtest")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("quickadd:new-backtest") ? buttonStyle : disabledButtonStyle
              }
            >
              新建回测
            </button>
            {!can("quickadd:new-live-trade") &&
              !can("quickadd:new-demo-trade") &&
              !can("quickadd:new-backtest") && (
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.85em",
                    alignSelf: "center",
                  }}
                >
                  QuickAdd 不可用
                </span>
              )}
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: "8px" }}>
            近期 R 趋势
          </div>

          <div
            style={{
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "10px",
            }}
          >
            <div style={{ flex: "1 1 220px", minWidth: "220px" }}>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  fontSize: "0.75em",
                  marginBottom: "6px",
                  color: "var(--text-muted)",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ color: getRColorByAccountType("Live") }}>● 实盘</span>
                <span style={{ color: getRColorByAccountType("Demo") }}>● 模拟</span>
                <span style={{ color: getRColorByAccountType("Backtest") }}>● 回测</span>
              </div>

              {last30TradesDesc.length === 0 ? (
                <div style={{ color: "var(--text-faint)", fontSize: "0.85em" }}>
                  暂无交易数据
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: "4px",
                    height: "70px",
                    borderBottom: "1px solid var(--background-modifier-border)",
                    paddingBottom: "6px",
                  }}
                >
                  {last30TradesDesc
                    .slice()
                    .reverse()
                    .map((t) => {
                      const r =
                        typeof t.pnl === "number" && Number.isFinite(t.pnl)
                          ? t.pnl
                          : 0;
                      const h = Math.max(
                        4,
                        Math.round((Math.abs(r) / last30MaxAbsR) * 56)
                      );
                      const color =
                        r >= 0
                          ? getRColorByAccountType(t.accountType ?? "Live")
                          : "var(--text-error)";
                      const title = `${t.name}\n${t.accountType ?? "—"}\nR: ${r.toFixed(2)}`;
                      return (
                        <div
                          key={t.path}
                          title={title}
                          style={{
                            width: "6px",
                            height: `${h}px`,
                            background: color,
                            borderRadius: "2px",
                            opacity: r >= 0 ? 1 : 0.7,
                          }}
                        />
                      );
                    })}
                </div>
              )}
            </div>

            <div
              style={{
                flex: "1 1 180px",
                minWidth: "180px",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "10px",
                padding: "10px",
                background: "rgba(var(--mono-rgb-100), 0.03)",
              }}
            >
              <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: "6px" }}>
                🧠 实盘心态
              </div>
              <div style={{ fontSize: "1.2em", fontWeight: 900, color: liveMind.color }}>
                {liveMind.status}
              </div>
              <div style={{ color: "var(--text-faint)", fontSize: "0.85em", marginTop: "6px" }}>
                近期错误：追单(FOMO) {liveMind.fomo} | 上头(Tilt) {liveMind.tilt}
              </div>
            </div>
          </div>

          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "0.85em",
              marginBottom: "8px",
            }}
          >
            最近 10 笔
          </div>
          {(["Live", "Demo", "Backtest"] as const).map((at) => (
            <TrendRow
              key={`r10-${at}`}
              label={at === "Live" ? "实盘" : at === "Demo" ? "模拟" : "回测"}
              value={rLast10[at]}
              ratio={r10MaxAbs > 0 ? rLast10[at] / r10MaxAbs : 0}
              color={getRColorByAccountType(at)}
            />
          ))}
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "0.85em",
              margin: "10px 0 8px",
            }}
          >
            最近 30 笔
          </div>
          {(["Live", "Demo", "Backtest"] as const).map((at) => (
            <TrendRow
              key={`r30-${at}`}
              label={at === "Live" ? "实盘" : at === "Demo" ? "模拟" : "回测"}
              value={rLast30[at]}
              ratio={r30MaxAbs > 0 ? rLast30[at] / r30MaxAbs : 0}
              color={getRColorByAccountType(at)}
            />
          ))}
        </div>

        <div style={{ marginTop: "14px" }}>
          <button
            type="button"
            disabled={!canCreateTrade}
            onClick={() => {
              if (can("quickadd:new-live-trade")) return action("quickadd:new-live-trade");
              if (can("quickadd:new-demo-trade")) return action("quickadd:new-demo-trade");
              if (can("quickadd:new-backtest")) return action("quickadd:new-backtest");
            }}
            onMouseEnter={(e) => {
              if (e.currentTarget.disabled) return;
              e.currentTarget.style.filter = "brightness(1.02)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "none";
            }}
            style={
              canCreateTrade
                ? {
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid var(--background-modifier-border)",
                    background: "var(--interactive-accent)",
                    color: "var(--text-on-accent)",
                    fontWeight: 800,
                    cursor: "pointer",
                  }
                : {
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid var(--background-modifier-border)",
                    background: "var(--background-primary)",
                    color: "var(--text-faint)",
                    fontWeight: 800,
                    opacity: 0.6,
                    cursor: "not-allowed",
                  }
            }
          >
            创建新交易笔记（图表分析 → 形态识别 → 策略匹配）
          </button>
          {!canCreateTrade && (
            <div
              style={{
                marginTop: "6px",
                color: "var(--text-faint)",
                fontSize: "0.9em",
              }}
            >
              （占位符）点击一下用单笔交易模版
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          margin: "18px 0 10px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--background-modifier-border)",
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>📊 数据中心</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
          Analytics Hub
        </div>
      </div>

      {/* Stats Row */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <StatsCard title="总笔数" value={all.countTotal} icon="📊" />
        <StatsCard
          title="累计盈亏"
          value={`${all.netProfit > 0 ? "+" : ""}${all.netProfit.toFixed(1)}R`}
          color={
            all.netProfit >= 0 ? "var(--text-success)" : "var(--text-error)"
          }
          icon="💰"
        />
        <StatsCard
          title="胜率"
          value={`${all.winRatePct}%`}
          color={
            all.winRatePct > 50 ? "var(--text-success)" : "var(--text-warning)"
          }
          icon="🎯"
        />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <StatsCard
          title="实盘"
          value={`${summary.Live.countTotal} 笔`}
          subValue={`${
            summary.Live.winRatePct
          }% • ${summary.Live.netProfit.toFixed(1)}R`}
          icon="🟢"
        />
        <StatsCard
          title="模拟"
          value={`${summary.Demo.countTotal} 笔`}
          subValue={`${
            summary.Demo.winRatePct
          }% • ${summary.Demo.netProfit.toFixed(1)}R`}
          icon="🟡"
        />
        <StatsCard
          title="回测"
          value={`${summary.Backtest.countTotal} 笔`}
          subValue={`${
            summary.Backtest.winRatePct
          }% • ${summary.Backtest.netProfit.toFixed(1)}R`}
          icon="🔵"
        />
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: "12px" }}>
          💼 账户资金概览 <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>(Account)</span>
        </div>

        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
          <div
            style={{
              flex: "1.5 1 360px",
              minWidth: "320px",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "12px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px" }}>
              <div style={{ fontWeight: 900, fontSize: "1.1em", color: "var(--text-success)" }}>
                🟢 实盘账户
              </div>
              <div
                style={{
                  fontSize: "0.8em",
                  color: "var(--text-muted)",
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "999px",
                  padding: "2px 8px",
                  background: "var(--background-primary)",
                }}
              >
                Live
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "6px" }}>
              <div
                style={{
                  fontSize: "2.2em",
                  fontWeight: 900,
                  lineHeight: 1,
                  color:
                    summary.Live.netProfit >= 0
                      ? "var(--text-success)"
                      : "var(--text-error)",
                }}
              >
                {summary.Live.netProfit > 0 ? "+" : ""}
                {summary.Live.netProfit.toFixed(1)}
              </div>
              <div style={{ color: "var(--text-faint)", fontSize: "0.95em" }}>R</div>
            </div>
            <div style={{ display: "flex", gap: "14px", marginTop: "10px", color: "var(--text-muted)", fontSize: "0.9em", flexWrap: "wrap" }}>
              <div>📦 {summary.Live.countTotal} 笔交易</div>
              <div>🎯 {summary.Live.winRatePct}% 胜率</div>
            </div>
          </div>

          <div style={{ flex: "1 1 260px", minWidth: "260px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {([
              {
                title: "模拟盘",
                icon: "🔵",
                stats: summary.Demo,
              },
              {
                title: "复盘回测",
                icon: "🟠",
                stats: summary.Backtest,
              },
            ] as const).map((card) => (
              <div
                key={card.title}
                style={{
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "10px",
                  padding: "12px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px" }}>
                  <div style={{ fontWeight: 800, color: "var(--text-muted)" }}>
                    {card.icon} {card.title}
                  </div>
                  <div style={{ fontSize: "0.8em", color: "var(--text-faint)" }}>
                    {card.stats.countTotal} 笔
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginTop: "6px" }}>
                  <div
                    style={{
                      fontSize: "1.6em",
                      fontWeight: 900,
                      color:
                        card.stats.netProfit >= 0
                          ? "var(--text-success)"
                          : "var(--text-error)",
                    }}
                  >
                    {card.stats.netProfit > 0 ? "+" : ""}
                    {card.stats.netProfit.toFixed(1)}
                  </div>
                  <div style={{ color: "var(--text-faint)", fontSize: "0.95em" }}>R</div>
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.9em", marginTop: "4px" }}>
                  胜率：{card.stats.winRatePct}%
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ paddingTop: "12px", borderTop: "1px solid var(--background-modifier-border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, color: "var(--text-muted)" }}>
              📅 盈亏日历 ({accountTargetMonth})
            </div>
            <div style={{ fontSize: "0.8em", color: "var(--text-faint)" }}>Live Account Only</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
            {Array.from({ length: accountDaysInMonth }, (_, i) => i + 1).map((day) => {
              const pnl = accountDailyMap.get(day);
              const hasTrade = pnl !== undefined;
              const color =
                !hasTrade
                  ? "var(--text-faint)"
                  : pnl! > 0
                  ? "var(--text-success)"
                  : pnl! < 0
                  ? "var(--text-error)"
                  : "var(--text-muted)";
              const bg =
                !hasTrade
                  ? "rgba(var(--mono-rgb-100), 0.02)"
                  : pnl! > 0
                  ? "rgba(var(--color-green-rgb), 0.12)"
                  : pnl! < 0
                  ? "rgba(var(--color-red-rgb), 0.12)"
                  : "rgba(var(--mono-rgb-100), 0.06)";

              return (
                <div
                  key={`${accountTargetMonth}-${day}`}
                  title={`${accountTargetMonth}-${String(day).padStart(2, "0")} PnL: ${hasTrade ? pnl!.toFixed(2) : "0"}`}
                  style={{
                    aspectRatio: "1",
                    background: bg,
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "8px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "2px",
                  }}
                >
                  <div style={{ fontSize: "0.75em", color: "var(--text-faint)" }}>{day}</div>
                  {hasTrade ? (
                    <div style={{ fontSize: "0.85em", fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
                      {pnl! > 0 ? "+" : ""}
                      {pnl!.toFixed(0)}
                    </div>
                  ) : (
                    <div style={{ fontSize: "0.85em", fontWeight: 700, color: "var(--text-faint)", opacity: 0.4 }}>—</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: "10px" }}>
          🌪️ 不同市场环境表现 <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>(Live PnL)</span>
        </div>
        {liveCyclePerf.length === 0 ? (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            暂无数据
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {liveCyclePerf.map((cy) => {
              const color =
                cy.pnl > 0
                  ? "var(--text-success)"
                  : cy.pnl < 0
                  ? "var(--text-error)"
                  : "var(--text-muted)";
              return (
                <div
                  key={cy.name}
                  style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    minWidth: "120px",
                    flex: "1 1 180px",
                    background: "rgba(var(--mono-rgb-100), 0.03)",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
                    {cy.name}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      color,
                      fontVariantNumeric: "tabular-nums",
                      marginTop: "2px",
                    }}
                  >
                    {cy.pnl > 0 ? "+" : ""}
                    {cy.pnl.toFixed(1)}R
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: "10px" }}>
          💸 错误的代价 <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>(学费统计)</span>
        </div>
        {tuition.tuitionR <= 0 ? (
          <div style={{ color: "var(--text-success)", fontWeight: 700 }}>
            🎉 完美！近期实盘没有因纪律问题亏损。
          </div>
        ) : (
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.9em", marginBottom: "10px" }}>
              因执行错误共计亏损：
              <span style={{ color: "var(--text-error)", fontWeight: 900, marginLeft: "6px" }}>
                -{tuition.tuitionR.toFixed(1)}R
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {tuition.rows.slice(0, 12).map((row) => {
                const pct = Math.round((row.costR / tuition.tuitionR) * 100);
                return (
                  <div
                    key={row.tag}
                    style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "0.9em" }}
                  >
                    <div style={{ width: "110px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.tag}>
                      {row.tag}
                    </div>
                    <div
                      style={{
                        flex: "1 1 auto",
                        background: "rgba(var(--mono-rgb-100), 0.03)",
                        height: "6px",
                        borderRadius: "999px",
                        overflow: "hidden",
                        border: "1px solid var(--background-modifier-border)",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: "var(--text-error)",
                        }}
                      />
                    </div>
                    <div style={{ width: "70px", textAlign: "right", color: "var(--text-error)", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                      -{row.costR.toFixed(1)}R
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            marginBottom: "8px",
          }}
        >
          <div style={{ fontWeight: 600 }}>数据分析</div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "var(--text-muted)",
              fontSize: "0.9em",
            }}
          >
            范围
            <select
              value={analyticsScope}
              onChange={(e) =>
                setAnalyticsScope(e.target.value as AnalyticsScope)
              }
              style={selectStyle}
            >
              <option value="Live">实盘</option>
              <option value="Demo">模拟</option>
              <option value="Backtest">回测</option>
              <option value="All">全部</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
          <div style={{ flex: "1 1 320px", minWidth: "320px" }}>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
              日历（最近 {calendarDays} 天）
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: "6px",
              }}
            >
              {calendarCells.map((c) => {
                const absRatio =
                  calendarMaxAbs > 0
                    ? Math.min(1, Math.abs(c.netR) / calendarMaxAbs)
                    : 0;
                const alpha = c.count > 0 ? 0.12 + 0.55 * absRatio : 0.04;
                const bg =
                  c.netR > 0
                    ? `rgba(var(--color-green-rgb), ${alpha})`
                    : c.netR < 0
                    ? `rgba(var(--color-red-rgb), ${alpha})`
                    : `rgba(var(--mono-rgb-100), 0.05)`;
                return (
                  <div
                    key={`cal-${c.dateIso}`}
                    title={`${c.dateIso} • ${c.count} 笔 • ${
                      c.netR >= 0 ? "+" : ""
                    }${c.netR.toFixed(1)}R`}
                    style={{
                      border: "1px solid var(--background-modifier-border)",
                      borderRadius: "6px",
                      padding: "6px",
                      background: bg,
                      minHeight: "40px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{ fontSize: "0.85em", color: "var(--text-muted)" }}
                    >
                      {getDayOfMonth(c.dateIso)}
                    </div>
                    <div
                      style={{
                        fontSize: "0.85em",
                        fontWeight: 600,
                        color:
                          c.netR > 0
                            ? "var(--text-success)"
                            : c.netR < 0
                            ? "var(--text-error)"
                            : "var(--text-faint)",
                        textAlign: "right",
                      }}
                    >
                      {c.count > 0
                        ? `${c.netR >= 0 ? "+" : ""}${c.netR.toFixed(1)}R`
                        : "—"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ flex: "1 1 360px", minWidth: "360px" }}>
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
              权益曲线
            </div>
            {equitySeries.length > 1 ? (
              (() => {
                const w = 520;
                const h = 160;
                const pad = 14;
                const ys = equitySeries.map((p) => p.equityR);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                const span = Math.max(1e-6, maxY - minY);
                const xStep =
                  (w - pad * 2) / Math.max(1, equitySeries.length - 1);
                const points = equitySeries
                  .map((p, i) => {
                    const x = pad + i * xStep;
                    const y =
                      pad + (1 - (p.equityR - minY) / span) * (h - pad * 2);
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(" ");

                const last = equitySeries[equitySeries.length - 1];
                return (
                  <div>
                    <svg
                      viewBox={`0 0 ${w} ${h}`}
                      width="100%"
                      height="160"
                      style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        background: `rgba(var(--mono-rgb-100), 0.03)`,
                      }}
                    >
                      <polyline
                        points={points}
                        fill="none"
                        stroke="var(--text-accent)"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div
                      style={{
                        marginTop: "6px",
                        color: "var(--text-muted)",
                        fontSize: "0.9em",
                      }}
                    >
                      最新：{" "}
                      <span
                        style={{
                          color:
                            last.equityR >= 0
                              ? "var(--text-success)"
                              : "var(--text-error)",
                          fontWeight: 600,
                        }}
                      >
                        {last.equityR >= 0 ? "+" : ""}
                        {last.equityR.toFixed(1)}R
                      </span>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                数据不足。
              </div>
            )}

            <div style={{ fontWeight: 600, margin: "14px 0 8px" }}>
              策略归因（Top）
            </div>
            {strategyAttribution.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: "18px" }}>
                {strategyAttribution.map((r) => (
                  <li
                    key={`attr-${r.strategyName}`}
                    style={{ marginBottom: "6px" }}
                  >
                    {r.strategyPath ? (
                      <button
                        type="button"
                        onClick={() => openFile(r.strategyPath!)}
                        style={textButtonStyle}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                      >
                        {r.strategyName}
                      </button>
                    ) : (
                      <span>{r.strategyName}</span>
                    )}
                    <span
                      style={{
                        color: "var(--text-muted)",
                        marginLeft: "8px",
                        fontSize: "0.9em",
                      }}
                    >
                      {r.count} 笔 •{" "}
                      <span
                        style={{
                          color:
                            r.netR >= 0
                              ? "var(--text-success)"
                              : "var(--text-error)",
                          fontWeight: 600,
                        }}
                      >
                        {r.netR >= 0 ? "+" : ""}
                        {r.netR.toFixed(1)}R
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                未找到策略归因数据。
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            marginTop: "12px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          <ContextWidget data={contextAnalysis} />
          <ErrorWidget data={errorAnalysis} />
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: "12px",
            marginBottom: "12px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: "1.05em" }}>
            🧬 资金增长曲线{" "}
            <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>
              (Capital Growth)
            </span>
          </div>

          <div style={{ fontSize: "0.85em", color: "var(--text-muted)", display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <span style={{ color: getRColorByAccountType("Live") }}>
              ● 实盘 {strategyLab.cum.Live >= 0 ? "+" : ""}
              {strategyLab.cum.Live.toFixed(1)}R
            </span>
            <span style={{ color: getRColorByAccountType("Demo") }}>
              ● 模拟 {strategyLab.cum.Demo >= 0 ? "+" : ""}
              {strategyLab.cum.Demo.toFixed(1)}R
            </span>
            <span style={{ color: getRColorByAccountType("Backtest") }}>
              ● 回测 {strategyLab.cum.Backtest >= 0 ? "+" : ""}
              {strategyLab.cum.Backtest.toFixed(1)}R
            </span>
          </div>
        </div>

        {(() => {
          const w = 520;
          const h = 150;
          const pad = 14;
          const allValues = [
            ...strategyLab.curves.Live,
            ...strategyLab.curves.Demo,
            ...strategyLab.curves.Backtest,
          ];
          const maxVal = Math.max(...allValues, 5);
          const minVal = Math.min(...allValues, -5);
          const range = Math.max(1e-6, maxVal - minVal);
          const zeroY = pad + (1 - (0 - minVal) / range) * (h - pad * 2);

          const getPoints = (data: number[]) => {
            if (data.length < 2) return "";
            const xStep = (w - pad * 2) / Math.max(1, data.length - 1);
            return data
              .map((val, i) => {
                const x = pad + i * xStep;
                const y = pad + (1 - (val - minVal) / range) * (h - pad * 2);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              })
              .join(" ");
          };

          const ptsLive = getPoints(strategyLab.curves.Live);
          const ptsDemo = getPoints(strategyLab.curves.Demo);
          const ptsBack = getPoints(strategyLab.curves.Backtest);

          return (
            <svg
              viewBox={`0 0 ${w} ${h}`}
              width="100%"
              height="150"
              style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                background: `rgba(var(--mono-rgb-100), 0.03)`,
              }}
            >
              <line
                x1={0}
                y1={zeroY}
                x2={w}
                y2={zeroY}
                stroke="rgba(var(--mono-rgb-100), 0.18)"
                strokeDasharray="4"
              />

              {ptsBack && (
                <polyline
                  points={ptsBack}
                  fill="none"
                  stroke={getRColorByAccountType("Backtest")}
                  strokeWidth="1.6"
                  opacity={0.65}
                  strokeDasharray="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {ptsDemo && (
                <polyline
                  points={ptsDemo}
                  fill="none"
                  stroke={getRColorByAccountType("Demo")}
                  strokeWidth="1.8"
                  opacity={0.8}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {ptsLive && (
                <polyline
                  points={ptsLive}
                  fill="none"
                  stroke={getRColorByAccountType("Live")}
                  strokeWidth="2.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
            </svg>
          );
        })()}

        <div
          style={{
            marginTop: "14px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          <div>
            <div style={{ fontSize: "0.85em", opacity: 0.7, marginBottom: "8px" }}>
              📊 热门策略表现{" "}
              <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.9em" }}>
                (Top Setups)
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {strategyLab.topSetups.length > 0 ? (
                strategyLab.topSetups.map((s) => (
                  <div
                    key={`topsetup-${s.name}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "10px",
                      fontSize: "0.9em",
                      background: "rgba(var(--mono-rgb-100), 0.03)",
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--background-modifier-border)",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.name}
                    </span>
                    <span style={{ color: "var(--text-muted)", flex: "0 0 auto" }}>
                      <span style={{ color: s.wr > 50 ? "var(--text-success)" : "var(--text-warning)", fontWeight: 800 }}>
                        {s.wr}%
                      </span>{" "}
                      <span style={{ opacity: 0.6 }}>({s.total})</span>
                    </span>
                  </div>
                ))
              ) : (
                <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                  数据不足。
                </div>
              )}
            </div>
          </div>

          <div>
            <div style={{ fontSize: "0.85em", opacity: 0.7, marginBottom: "8px" }}>
              💡 系统建议
            </div>
            <div style={{ fontSize: "0.9em", opacity: 0.85, lineHeight: 1.6 }}>
              {strategyLab.suggestion}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          margin: "18px 0 10px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--background-modifier-border)",
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>📚 学习模块</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
          Learning
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <div style={{ fontWeight: 600 }}>记忆 / SRS</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              disabled={!can("srs:review-flashcards")}
              onClick={() => action("srs:review-flashcards")}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                can("srs:review-flashcards") ? buttonStyle : disabledButtonStyle
              }
            >
              复习
            </button>
            <button
              type="button"
              onClick={reloadMemory}
              disabled={!loadMemory || memoryBusy}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                !loadMemory || memoryBusy
                  ? { ...disabledButtonStyle, padding: "6px 10px" }
                  : { ...buttonStyle, padding: "6px 10px" }
              }
            >
              刷新
            </button>
            <button
              type="button"
              onClick={hardRefreshMemory}
              disabled={!loadMemory || memoryBusy}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={
                !loadMemory || memoryBusy
                  ? { ...disabledButtonStyle, padding: "6px 10px" }
                  : { ...buttonStyle, padding: "6px 10px" }
              }
            >
              强制刷新
            </button>
          </div>
        </div>

        {!can("srs:review-flashcards") && (
          <div
            style={{
              color: "var(--text-faint)",
              fontSize: "0.9em",
              marginBottom: "8px",
            }}
          >
            SRS 插件不可用（适配器已降级）。统计仍会从 #flashcards 笔记计算。
          </div>
        )}

        {memoryError ? (
          <div style={{ color: "var(--text-error)", fontSize: "0.9em" }}>
            {memoryError}
          </div>
        ) : memoryBusy ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
            加载中…
          </div>
        ) : memory ? (
          <div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                color: "var(--text-muted)",
                fontSize: "0.9em",
                marginBottom: "10px",
              }}
            >
              <div>
                总计：<strong>{memory.total}</strong>
              </div>
              <div>
                到期（≤{settings.srsDueThresholdDays}天）：{" "}
                <strong>{memory.due}</strong>
              </div>
              <div>
                掌握度：<strong>{memory.masteryPct}%</strong>
              </div>
              <div>
                负载（7天）：<strong>{memory.load7d}</strong>
              </div>
              <div>
                状态：<strong>{memory.status}</strong>
              </div>
            </div>

            {(() => {
              const pTotal = Math.max(1, memory.total);
              const sBase = (memory.cnt?.sNorm ?? 0) + (memory.cnt?.sRev ?? 0) * 2;
              const mMulti = (memory.cnt?.mNorm ?? 0) + (memory.cnt?.mRev ?? 0) * 2;
              const cloze = memory.cnt?.cloze ?? 0;

              const seg = (n: number) => `${Math.max(0, (n / pTotal) * 100)}%`;

              return (
                <>
                  <div
                    style={{
                      height: "8px",
                      width: "100%",
                      borderRadius: "4px",
                      overflow: "hidden",
                      background: "var(--background-modifier-border)",
                      display: "flex",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: seg(memory.cnt?.sNorm ?? 0),
                        background: "var(--text-muted)",
                        opacity: 0.5,
                      }}
                    />
                    <div
                      style={{
                        width: seg((memory.cnt?.sRev ?? 0) * 2),
                        background: "var(--text-muted)",
                        opacity: 0.35,
                      }}
                    />
                    <div
                      style={{
                        width: seg(memory.cnt?.mNorm ?? 0),
                        background: "var(--text-accent)",
                        opacity: 0.55,
                      }}
                    />
                    <div
                      style={{
                        width: seg((memory.cnt?.mRev ?? 0) * 2),
                        background: "var(--text-accent)",
                        opacity: 0.35,
                      }}
                    />
                    <div
                      style={{
                        width: seg(memory.cnt?.cloze ?? 0),
                        background: "var(--text-accent)",
                        opacity: 0.85,
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: "10px",
                      marginBottom: "10px",
                    }}
                  >
                    <div
                      style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        padding: "10px",
                        textAlign: "center",
                        background: "rgba(var(--mono-rgb-100), 0.02)",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.75em",
                          fontWeight: 700,
                          marginBottom: "4px",
                        }}
                      >
                        基础
                      </div>
                      <div style={{ fontWeight: 800 }}>{sBase}</div>
                    </div>

                    <div
                      style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        padding: "10px",
                        textAlign: "center",
                        background: "rgba(var(--mono-rgb-100), 0.02)",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.75em",
                          fontWeight: 700,
                          marginBottom: "4px",
                        }}
                      >
                        多选
                      </div>
                      <div style={{ fontWeight: 800 }}>{mMulti}</div>
                    </div>

                    <div
                      style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        padding: "10px",
                        textAlign: "center",
                        background: "rgba(var(--mono-rgb-100), 0.02)",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.75em",
                          fontWeight: 700,
                          marginBottom: "4px",
                        }}
                      >
                        填空
                      </div>
                      <div style={{ fontWeight: 800 }}>{cloze}</div>
                    </div>
                  </div>
                </>
              );
            })()}

            {(() => {
              const series = memory.loadNext7;
              const max = Math.max(3, ...series.map((x) => x.count || 0));
              return (
                <div
                  style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "10px",
                    padding: "10px",
                    background: "rgba(var(--mono-rgb-100), 0.02)",
                    marginBottom: "10px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: "10px",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: "0.9em" }}>
                      未来 7 天负载
                    </div>
                    <div style={{ color: "var(--text-faint)", fontSize: "0.85em" }}>
                      +1…+7
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      gap: "10px",
                      height: "120px",
                    }}
                  >
                    {series.map((x, idx) => {
                      const h = Math.max(
                        4,
                        Math.round((Math.max(0, x.count || 0) / max) * 100)
                      );
                      const has = (x.count || 0) > 0;
                      return (
                        <div
                          key={`mem-load-${x.dateIso}-${idx}`}
                          style={{
                            flex: "1 1 0",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <div
                            style={{
                              width: "8px",
                              height: `${h}%`,
                              minHeight: "4px",
                              borderRadius: "4px",
                              background: has
                                ? "var(--text-accent)"
                                : "var(--background-modifier-border)",
                              opacity: has ? 0.85 : 0.6,
                            }}
                          />
                          <div
                            style={{
                              fontSize: "0.75em",
                              color: "var(--text-faint)",
                              lineHeight: 1,
                            }}
                          >
                            +{idx + 1}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {(() => {
              const canRecommendFocus =
                !memoryIgnoreFocus && memory.due > 0 && Boolean(memory.focusFile);

              const focusRec =
                canRecommendFocus && memory.focusFile
                  ? {
                      type: "Focus" as const,
                      title: memory.focusFile.name.replace(/\.md$/i, ""),
                      path: memory.focusFile.path,
                      desc: `到期: ${memory.focusFile.due} | 易度: ${memory.focusFile.avgEase}`,
                    }
                  : null;

              const courseRec = course?.hybridRec
                ? (() => {
                    const rec = course.hybridRec;
                    const title = String(rec.data.t || rec.data.q || "推荐");
                    const path = String((rec.data as any).path || "");
                    const desc = rec.type === "New" ? "新主题" : "闪卡测验";
                    return { type: rec.type, title, path, desc } as const;
                  })()
                : null;

              const quiz =
                memory.quizPool.length > 0
                  ? memory.quizPool[
                      Math.max(0, memoryShakeIndex) % memory.quizPool.length
                    ]
                  : null;
              const randomRec = quiz
                ? {
                    type: "Shake" as const,
                    title: String(quiz.q || quiz.file),
                    path: String(quiz.path),
                    desc: "🎲 随机抽取",
                  }
                : null;

              const rec = focusRec ?? courseRec ?? randomRec;
              if (!rec) return null;

              const label =
                rec.type === "Focus"
                  ? "🔥 优先复习"
                  : rec.type === "New"
                    ? "🚀 推荐"
                    : rec.type === "Review"
                      ? "🔄 推荐"
                      : "🎲 随机抽取";

              const onShake = () => {
                setMemoryIgnoreFocus(true);
                if (memory.quizPool.length > 0) {
                  const next = Math.floor(Math.random() * memory.quizPool.length);
                  setMemoryShakeIndex(next);
                } else {
                  setMemoryShakeIndex((x) => x + 1);
                }
              };

              return (
                <div
                  style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "10px",
                    padding: "10px",
                    background: "rgba(var(--mono-rgb-100), 0.03)",
                    marginBottom: "10px",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "12px",
                  }}
                >
                  <div style={{ flex: "1 1 auto" }}>
                    <div
                      style={{
                        fontSize: "0.85em",
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        marginBottom: "6px",
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ marginBottom: "6px" }}>
                      <button
                        type="button"
                        onClick={() => openFile(String(rec.path))}
                        style={{ ...textButtonStyle, fontWeight: 700 }}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                      >
                        {String(rec.title)}
                      </button>
                    </div>
                    <div style={{ color: "var(--text-faint)", fontSize: "0.85em" }}>
                      {rec.desc}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onShake}
                    onMouseEnter={onBtnMouseEnter}
                    onMouseLeave={onBtnMouseLeave}
                    onFocus={onBtnFocus}
                    onBlur={onBtnBlur}
                    style={{ ...buttonStyle, padding: "6px 10px" }}
                    title="摇一摇换题（跳过优先）"
                  >
                    🎲
                  </button>
                </div>
              );
            })()}

            {memory.focusFile ? (
              <div
                style={{
                  marginBottom: "10px",
                  color: "var(--text-muted)",
                  fontSize: "0.9em",
                }}
              >
                焦点：{" "}
                <button
                  type="button"
                  onClick={() => openFile(memory.focusFile!.path)}
                  style={{ ...textButtonStyle, fontWeight: 600 }}
                  onMouseEnter={onTextBtnMouseEnter}
                  onMouseLeave={onTextBtnMouseLeave}
                  onFocus={onTextBtnFocus}
                  onBlur={onTextBtnBlur}
                >
                  {memory.focusFile.name.replace(/\.md$/i, "")}
                </button>
                <span style={{ marginLeft: "8px", color: "var(--text-faint)" }}>
                  到期: {memory.focusFile.due} | 易度: {memory.focusFile.avgEase}
                </span>
              </div>
            ) : (
              <div
                style={{
                  marginBottom: "10px",
                  color: "var(--text-faint)",
                  fontSize: "0.9em",
                }}
              >
                暂无焦点卡片。
              </div>
            )}

            {memory.quizPool.length > 0 ? (
              <div>
                <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                  随机抽题（{settings.srsRandomQuizCount}）
                </div>
                <ul style={{ margin: 0, paddingLeft: "18px" }}>
                  {memory.quizPool.map((q, idx) => (
                    <li key={`q-${idx}`} style={{ marginBottom: "6px" }}>
                      <button
                        type="button"
                        onClick={() => openFile(q.path)}
                        style={textButtonStyle}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                      >
                        {q.q || q.file}
                      </button>
                      <span
                        style={{
                          marginLeft: "8px",
                          color: "var(--text-faint)",
                          fontSize: "0.85em",
                        }}
                      >
                        {q.file}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                在 #flashcards 笔记中未找到可抽取题库。
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            记忆数据不可用。
          </div>
        )}
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <div style={{ fontWeight: 600 }}>
            课程{" "}
            <span
              style={{
                fontWeight: 500,
                color: "var(--text-muted)",
                fontSize: "0.85em",
              }}
            >
              (Course)
            </span>
          </div>
          <button
            type="button"
            onClick={reloadCourse}
            disabled={!loadCourse || courseBusy}
            onMouseEnter={onBtnMouseEnter}
            onMouseLeave={onBtnMouseLeave}
            onFocus={onBtnFocus}
            onBlur={onBtnBlur}
            style={
              !loadCourse || courseBusy
                ? { ...disabledButtonStyle, padding: "6px 10px" }
                : { ...buttonStyle, padding: "6px 10px" }
            }
          >

            刷新
          </button>
        </div>

        {courseError ? (
          <div style={{ color: "var(--text-error)", fontSize: "0.9em" }}>
            {courseError}
          </div>
        ) : courseBusy ? (
          <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
            加载中…
          </div>
        ) : course && course.syllabus.length > 0 ? (
          <div>
            {course.hybridRec
              ? (() => {
                  const rec = course.hybridRec;
                  const sid = simpleCourseId(rec.data.id);
                  const link =
                    course.linksById[rec.data.id] || course.linksById[sid];
                  const prefix =
                    rec.type === "New" ? "🚀 继续学习" : "🔄 建议复习";
                  return (
                    <div
                      style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        padding: "10px",
                        background: "rgba(var(--mono-rgb-100), 0.03)",
                        marginBottom: "10px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "10px",
                        }}
                      >
                        <div>
                          {link ? (
                            <button
                              type="button"
                              onClick={() => openFile(link.path)}
                              style={{ ...textButtonStyle, fontWeight: 600 }}
                              onMouseEnter={onTextBtnMouseEnter}
                              onMouseLeave={onTextBtnMouseLeave}
                              onFocus={onTextBtnFocus}
                              onBlur={onTextBtnBlur}
                            >
                              {prefix}: {String(rec.data.t ?? rec.data.id)}
                            </button>
                          ) : (
                            <span style={{ color: "var(--text-faint)" }}>
                              {prefix}: {String(rec.data.t ?? rec.data.id)}
                              （笔记未创建）
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontFamily: "var(--font-monospace)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {rec.data.id}
                        </div>
                      </div>
                      <div
                        style={{
                          marginTop: "6px",
                          color: "var(--text-muted)",
                          fontSize: "0.85em",
                          display: "flex",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          章节: <strong>{String(rec.data.p ?? "—")}</strong>
                        </span>
                        <span>
                          进度:{" "}
                          <strong>
                            {course.progress.doneCount}/
                            {course.progress.totalCount}
                          </strong>
                        </span>
                        <span>
                          笔记: <strong>{link ? "已创建" : "未创建"}</strong>
                        </span>
                      </div>
                    </div>
                  );
                })()
              : null}

            {course.upNext.length > 0 && (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "0.9em",
                  marginBottom: "8px",
                }}
              >
                接下来（窗口={settings.courseRecommendationWindow}）：{" "}
                {course.upNext.map((x, idx) => {
                  const label = String(x.item.id);
                  if (x.link) {
                    return (
                      <React.Fragment key={`up-${x.item.id}`}>
                        {idx > 0 ? ", " : ""}
                        <button
                          type="button"
                          onClick={() => openFile(x.link!.path)}
                          style={textButtonStyle}
                          onMouseEnter={onTextBtnMouseEnter}
                          onMouseLeave={onTextBtnMouseLeave}
                          onFocus={onTextBtnFocus}
                          onBlur={onTextBtnBlur}
                        >
                          {label}
                        </button>
                      </React.Fragment>
                    );
                  }
                  return (
                    <React.Fragment key={`up-${x.item.id}`}>
                      {idx > 0 ? ", " : ""}
                      <span style={{ color: "var(--text-faint)" }}>
                        {label}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            )}

            <details>
              <summary
                style={{
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  fontSize: "0.9em",
                  userSelect: "none",
                }}
              >
                展开课程矩阵
              </summary>
              <div
                style={{
                  marginTop: "12px",
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "20px",
                }}
              >
                {course.phases.map((ph) => (
                  <div key={`ph-${ph.phase}`} style={{ marginBottom: "12px" }}>
                    <div
                      style={{
                        fontSize: "0.85em",
                        color: "var(--text-muted)",
                        marginBottom: "6px",
                        borderBottom:
                          "1px solid var(--background-modifier-border)",
                        paddingBottom: "4px",
                      }}
                    >
                      {ph.phase}
                    </div>
                    <div
                      style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}
                    >
                      {ph.items.map((c) => {
                        const bg = c.isDone
                          ? "var(--text-success)"
                          : c.hasNote
                          ? "var(--text-accent)"
                          : "rgba(var(--mono-rgb-100), 0.06)";
                        const fg = c.isDone
                          ? "var(--background-primary)"
                          : c.hasNote
                          ? "var(--background-primary)"
                          : "var(--text-faint)";
                        const title = `${c.item.id}: ${String(c.item.t ?? "")}`;
                        return (
                          <button
                            key={`c-${ph.phase}-${c.item.id}`}
                            type="button"
                            disabled={!c.link}
                            onClick={() => c.link && openFile(c.link.path)}
                            title={title}
                            onMouseEnter={onMiniCellMouseEnter}
                            onMouseLeave={onMiniCellMouseLeave}
                            onFocus={onMiniCellFocus}
                            onBlur={onMiniCellBlur}
                            style={{
                              width: "26px",
                              height: "26px",
                              borderRadius: "6px",
                              flexShrink: 0,
                              padding: 0,
                              border:
                                "1px solid var(--background-modifier-border)",
                              background: bg,
                              cursor: c.link ? "pointer" : "default",
                              opacity: c.link ? 1 : 0.75,
                              outline: "none",
                              transition:
                                "border-color 180ms ease, box-shadow 180ms ease",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: "100%",
                                height: "100%",
                                color: fg,
                                fontSize: "0.65em",
                                fontWeight: 700,
                                letterSpacing: "-0.3px",
                              }}
                            >
                              {c.shortId}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        ) : (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            课程数据不可用。请检查 PA_Syllabus_Data.md 与 #PA/Course 相关笔记。
          </div>
        )}
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: "10px" }}>
          策略仓库
          <span style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
            {" "}(Playbook)
          </span>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <StrategyStats
            total={strategyStats.total}
            activeCount={strategyStats.activeCount}
            learningCount={strategyStats.learningCount}
            totalUses={strategyStats.totalUses}
            onFilter={(f: string) => {
              // TODO: wire filtering state to StrategyList (future task)
              console.log("策略过滤：", f);
            }}
          />
        </div>

        <div style={{ marginTop: "10px" }}>
          <StrategyList
            strategies={strategies}
            onOpenFile={openFile}
            showTitle={false}
          />
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: "10px" }}>
          🖼️ 最新复盘 <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>(Charts)</span>
        </div>
        {!getResourceUrl ? (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            Gallery unavailable.
          </div>
        ) : galleryItems.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {galleryItems.map((it) => (
              <button
                key={`gal-${it.coverPath}`}
                type="button"
                onClick={() => openFile(it.tradePath)}
                title={`${it.tradeName} • ${it.coverPath}`}
                onMouseEnter={onCoverMouseEnter}
                onMouseLeave={onCoverMouseLeave}
                onFocus={onCoverFocus}
                onBlur={onCoverBlur}
                style={{
                  padding: 0,
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  overflow: "hidden",
                  background: `rgba(var(--mono-rgb-100), 0.03)`,
                  cursor: "pointer",
                  outline: "none",
                  transition: "background-color 180ms ease, border-color 180ms ease",
                  position: "relative",
                  aspectRatio: "16 / 9",
                }}
              >
                {it.url ? (
                  <>
                    <img
                      src={it.url}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />

                    <div
                      style={{
                        position: "absolute",
                        top: "6px",
                        right: "6px",
                        background: "rgba(var(--mono-rgb-100), 0.12)",
                        border: "1px solid var(--background-modifier-border)",
                        color:
                          it.accountType === "Live"
                            ? "var(--text-success)"
                            : it.accountType === "Backtest"
                            ? "var(--text-warning)"
                            : "var(--text-accent)",
                        fontSize: "0.72em",
                        fontWeight: 900,
                        padding: "2px 8px",
                        borderRadius: "999px",
                        backdropFilter: "blur(6px)",
                      }}
                    >
                      {it.accountType === "Live"
                        ? "实盘"
                        : it.accountType === "Backtest"
                        ? "回测"
                        : "模拟"}
                    </div>

                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        padding: "16px 10px 8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                        gap: "10px",
                        background:
                          "linear-gradient(rgba(var(--mono-rgb-0), 0), rgba(var(--mono-rgb-0), 0.9))",
                      }}
                    >
                      <div
                        style={{
                          color: "var(--text-on-accent)",
                          fontSize: "0.85em",
                          fontWeight: 800,
                          textAlign: "left",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          flex: "1 1 auto",
                        }}
                      >
                        {it.tradeName}
                      </div>
                      <div
                        style={{
                          color: it.pnl >= 0 ? "var(--text-success)" : "var(--text-error)",
                          fontWeight: 900,
                          fontSize: "0.95em",
                          flex: "0 0 auto",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {it.pnl > 0 ? "+" : ""}
                        {it.pnl.toFixed(1)}
                      </div>
                    </div>
                  </>
                ) : (
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-faint)",
                      fontSize: "0.85em",
                    }}
                  >
                    —
                  </div>
                )}
              </button>
            ))}
          </div>

        ) : (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            暂无封面图片。请在 Frontmatter 添加 cover: [[图片]] 或 图片路径。
          </div>
        )}

        <div
          style={{
            textAlign: "center",
            marginTop: "12px",
            paddingTop: "8px",
            borderTop: "1px solid var(--background-modifier-border)",
          }}
        >
          <a
            href={gallerySearchHref}
            style={{
              color: "var(--text-accent)",
              textDecoration: "none",
              fontSize: "0.85em",
              fontWeight: 700,
            }}
          >
            📂 查看所有图表
          </a>
        </div>
      </div>

      <div
        style={{
          margin: "18px 0 10px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--background-modifier-border)",
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>📉 管理模块</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
          Management
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "10px",
            padding: "10px",
            background: "rgba(var(--mono-rgb-100), 0.03)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>
            🔎 Inspector
          </div>
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            数据治理与巡检（已在下方区块实现）
          </div>
        </div>

        <div
          style={{
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "10px",
            padding: "10px",
            background: "rgba(var(--mono-rgb-100), 0.03)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>
            🧩 Schema
          </div>
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
              v5.0 的 `pa-view-schema` 已并入下方“检查器/Schema 监控”（KPIs / 异常修复台 / 标签全景 / Top 分布）。
          </div>
        </div>

        <div
          style={{
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "10px",
            padding: "10px",
            background: "rgba(var(--mono-rgb-100), 0.03)",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: "6px" }}>
            🛡️ Manager
          </div>
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            属性管理（已在下方“管理器”区块实现）
          </div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <div style={{ fontWeight: 600 }}>检查器 / 字段规则（Schema）监控</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setShowFixPlan((v) => !v)}
              disabled={!enumPresets}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={enumPresets ? { ...buttonStyle, padding: "6px 10px" } : { ...disabledButtonStyle, padding: "6px 10px" }}
              title={
                !enumPresets
                  ? "枚举预设不可用"
                  : "切换修复方案预览"
              }
            >
              {showFixPlan ? "隐藏修复方案" : "显示修复方案"}
            </button>
          </div>
        </div>

        <div
          style={{
            color: "var(--text-faint)",
            fontSize: "0.9em",
            marginBottom: "10px",
          }}
        >
          只读：仅报告问题；修复方案（FixPlan）仅预览（不会写入 vault）。
          <span style={{ marginLeft: "8px" }}>
            枚举预设：{enumPresets ? "已加载" : "不可用"}
          </span>
        </div>

        {(() => {
          const issueCount = schemaIssues.length;
          const healthScore = Math.max(0, 100 - issueCount * 5);
          const healthColor =
            healthScore > 90
              ? "var(--text-accent)"
              : healthScore > 60
              ? "var(--text-warning)"
              : "var(--text-error)";
          const files = paTagSnapshot?.files ?? 0;
          const tags = paTagSnapshot ? Object.keys(paTagSnapshot.tagMap).length : 0;

          const topTags = paTagSnapshot
            ? Object.entries(paTagSnapshot.tagMap)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 60)
            : [];

          const topN = (getter: (t: TradeRecord) => string | undefined) => {
            const map = new Map<string, number>();
            for (const t of trades) {
              const v = (getter(t) ?? "Unknown").trim();
              if (!v) continue;
              map.set(v, (map.get(v) ?? 0) + 1);
            }
            return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
          };

          const distTicker = topN((t) => t.ticker);
          const distSetup = topN((t) => t.setupCategory);
          const distExec = topN((t) => t.executionQuality);

          return (
            <div style={{ marginBottom: "12px" }}>
              <div
                style={{
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "10px",
                }}
              >
                <div style={{ color: healthColor, fontWeight: 700 }}>
                  系统健康度：{healthScore}
                </div>
                <div style={{ color: issueCount > 0 ? "var(--text-error)" : "var(--text-muted)" }}>
                  待修异常：{issueCount}
                </div>
                <div style={{ color: "var(--text-muted)" }}>标签总数：{tags}</div>
                <div style={{ color: "var(--text-muted)" }}>笔记档案：{files}</div>
              </div>

              {schemaScanNote ? (
                <div
                  style={{
                    color: "var(--text-faint)",
                    fontSize: "0.85em",
                    marginBottom: "10px",
                  }}
                >
                  {schemaScanNote}
                </div>
              ) : null}

              <div
                style={{
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  padding: "10px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                  marginBottom: "10px",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>
                  🚑 异常修复台（Fix Station）
                </div>

                {schemaIssues.length === 0 ? (
                  <div style={{ color: "var(--text-accent)", fontSize: "0.9em" }}>
                    ✅ 系统非常健康（All Clear）
                  </div>
                ) : (
                  <div
                    style={{
                      maxHeight: "200px",
                      overflow: "auto",
                      border: "1px solid var(--background-modifier-border)",
                      borderRadius: "8px",
                      background: "var(--background-primary)",
                    }}
                  >
                    {schemaIssues.slice(0, 50).map((item, idx) => (
                      <button
                        key={`${item.path}:${item.key}:${idx}`}
                        type="button"
                        onClick={() => openFile(item.path)}
                        title={item.path}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "8px 10px",
                          border: "none",
                          borderBottom:
                            "1px solid var(--background-modifier-border)",
                          background: "transparent",
                          cursor: "pointer",
                          outline: "none",
                          transition:
                            "background-color 180ms ease, box-shadow 180ms ease",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            alignItems: "baseline",
                          }}
                        >
                          <div
                            style={{
                              flex: "1 1 auto",
                              minWidth: 0,
                            }}
                          >
                            <div style={{ fontWeight: 600 }}>{item.name}</div>
                            <div
                              style={{
                                color: "var(--text-faint)",
                                fontSize: "0.85em",
                              }}
                            >
                              {item.key}
                            </div>
                          </div>
                          <div
                            style={{
                              color: "var(--text-error)",
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.type}
                          </div>
                        </div>
                      </button>
                    ))}
                    {schemaIssues.length > 50 ? (
                      <div
                        style={{
                          padding: "8px 10px",
                          color: "var(--text-faint)",
                          fontSize: "0.85em",
                        }}
                      >
                        仅显示前 50 条异常。
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div
                style={{
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  padding: "10px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                  marginBottom: "10px",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>
                  🏷️ 标签全景（Tag System）
                </div>
                {!paTagSnapshot ? (
                  <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                    标签扫描不可用。
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {topTags.map(([tag, count]) => (
                      <span
                        key={tag}
                        style={{
                          padding: "2px 8px",
                          borderRadius: "999px",
                          border:
                            "1px solid var(--background-modifier-border)",
                          background: "var(--background-primary)",
                          fontSize: "0.85em",
                          color: "var(--text-muted)",
                        }}
                      >
                        #{tag} ({count})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div
                style={{
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  padding: "10px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "6px" }}>
                  📊 Top 分布（Ticker / Setup / Exec）
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "10px",
                  }}
                >
                  {[{ title: "Ticker", data: distTicker }, { title: "Setup", data: distSetup }, { title: "Exec", data: distExec }].map(
                    (col) => (
                      <div
                        key={col.title}
                        style={{
                          border:
                            "1px solid var(--background-modifier-border)",
                          borderRadius: "8px",
                          padding: "8px",
                          background: "var(--background-primary)",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            marginBottom: "6px",
                            color: "var(--text-muted)",
                          }}
                        >
                          {col.title}
                        </div>
                        {col.data.length === 0 ? (
                          <div
                            style={{
                              color: "var(--text-faint)",
                              fontSize: "0.85em",
                            }}
                          >
                            无数据
                          </div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {col.data.map(([k, v]) => (
                              <div
                                key={k}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: "10px",
                                  fontSize: "0.9em",
                                }}
                              >
                                <div
                                  style={{
                                    color: "var(--text-normal)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={k}
                                >
                                  {k}
                                </div>
                                <div style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                                  {v}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {(() => {
          const errorCount = inspectorIssues.filter(
            (i) => i.severity === "error"
          ).length;
          const warnCount = inspectorIssues.filter(
            (i) => i.severity === "warn"
          ).length;
          return (
            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "10px",
              }}
            >
              <div style={{ color: "var(--text-error)" }}>
                错误：{errorCount}
              </div>
              <div style={{ color: "var(--text-warning)" }}>
                警告：{warnCount}
              </div>
              <div style={{ color: "var(--text-muted)" }}>
                总计：{inspectorIssues.length}
              </div>
            </div>
          );
        })()}

        {inspectorIssues.length === 0 ? (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            未发现问题。
          </div>
        ) : (
          <div
            style={{
              maxHeight: "240px",
              overflow: "auto",
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "8px",
            }}
          >
            {inspectorIssues.slice(0, 50).map((issue) => (
              <button
                key={issue.id}
                type="button"
                onClick={() => openFile(issue.path)}
                title={issue.path}
                onMouseEnter={onTextBtnMouseEnter}
                onMouseLeave={onTextBtnMouseLeave}
                onFocus={onTextBtnFocus}
                onBlur={onTextBtnBlur}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  border: "none",
                  borderBottom: "1px solid var(--background-modifier-border)",
                  background: "transparent",
                  cursor: "pointer",
                  outline: "none",
                  transition:
                    "background-color 180ms ease, box-shadow 180ms ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    alignItems: "baseline",
                  }}
                >
                  <div
                    style={{
                      width: "60px",
                      color:
                        issue.severity === "error"
                          ? "var(--text-error)"
                          : "var(--text-warning)",
                      fontWeight: 600,
                    }}
                  >
                    {issue.severity === "error"
                      ? "错误"
                      : issue.severity === "warn"
                      ? "警告"
                      : "—"}
                  </div>
                  <div style={{ flex: "1 1 auto" }}>
                    <div style={{ fontWeight: 600 }}>{issue.title}</div>
                    <div
                      style={{ color: "var(--text-faint)", fontSize: "0.85em" }}
                    >
                      {issue.path}
                      {issue.detail ? ` — ${issue.detail}` : ""}
                    </div>
                  </div>
                </div>
              </button>
            ))}
            {inspectorIssues.length > 50 ? (
              <div
                style={{
                  padding: "8px 10px",
                  color: "var(--text-faint)",
                  fontSize: "0.85em",
                }}
              >
                仅显示前 50 条问题。
              </div>
            ) : null}
          </div>
        )}

        {showFixPlan ? (
          enumPresets ? (
            <div style={{ marginTop: "10px" }}>
              <div style={{ fontWeight: 600, marginBottom: "6px" }}>
                修复方案（预览）
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "10px",
                  border: "1px solid var(--background-modifier-border)",
                  borderRadius: "8px",
                  background: "rgba(var(--mono-rgb-100), 0.03)",
                  maxHeight: "220px",
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {fixPlanText ?? ""}
              </pre>
            </div>
          ) : (
            <div
              style={{
                marginTop: "10px",
                color: "var(--text-faint)",
                fontSize: "0.9em",
              }}
            >
              枚举预设不可用，已禁用修复方案生成。
            </div>
          )
        ) : null}
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "8px",
          }}
        >
          <div style={{ fontWeight: 600 }}>管理器（预览 → 确认 → 写入）</div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              disabled={!enumPresets}
              onClick={() => {
                if (!enumPresets) return;
                const plan = buildFixPlan(trades, enumPresets);
                setManagerPlan(plan);
                setManagerResult(undefined);
                setManagerArmed(false);
              }}
              title={
                !enumPresets
                  ? "枚举预设不可用"
                  : "使用检查器生成的修复方案"
              }
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={enumPresets ? { ...buttonStyle, padding: "6px 10px" } : { ...disabledButtonStyle, padding: "6px 10px" }}
            >
              使用检查器修复方案
            </button>
            <button
              type="button"
              onClick={() => {
                const plan = buildTradeNormalizationPlan(trades, enumPresets, {
                  includeDeleteKeys: true,
                });
                setManagerPlan(plan);
                setManagerResult(undefined);
                setManagerArmed(false);
              }}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={{ ...buttonStyle, padding: "6px 10px" }}
            >
              生成交易计划
            </button>
            <button
              type="button"
              disabled={!loadStrategyNotes}
              onClick={async () => {
                if (!loadStrategyNotes) return;
                setManagerBusy(true);
                try {
                  const notes = await loadStrategyNotes();
                  const plan = buildStrategyMaintenancePlan(
                    notes,
                    enumPresets,
                    { includeDeleteKeys: true }
                  );
                  setManagerPlan(plan);
                  setManagerResult(undefined);
                  setManagerArmed(false);
                } finally {
                  setManagerBusy(false);
                }
              }}
              title={
                !loadStrategyNotes
                  ? "策略扫描不可用"
                  : "生成策略维护计划"
              }
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={loadStrategyNotes ? { ...buttonStyle, padding: "6px 10px" } : { ...disabledButtonStyle, padding: "6px 10px" }}
            >
              生成策略计划
            </button>
          </div>
        </div>

        <div
          style={{
            color: "var(--text-faint)",
            fontSize: "0.9em",
            marginBottom: "10px",
          }}
        >
          默认禁用写入：先预览计划，再勾选确认后执行写入。
        </div>

        {managerPlan ? (
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "8px",
                flexWrap: "wrap",
              }}
            >
              <label
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <input
                  type="checkbox"
                  checked={managerDeleteKeys}
                  onChange={(e) =>
                    setManagerDeleteKeys((e.target as HTMLInputElement).checked)
                  }
                />
                删除 legacy 字段（危险）
              </label>
              <label
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <input
                  type="checkbox"
                  checked={managerArmed}
                  onChange={(e) =>
                    setManagerArmed((e.target as HTMLInputElement).checked)
                  }
                />
                我理解这会写入笔记
              </label>
              <button
                type="button"
                disabled={!applyFixPlan || !managerArmed || managerBusy}
                onClick={async () => {
                  if (!applyFixPlan) return;
                  setManagerBusy(true);
                  try {
                    const res = await applyFixPlan(managerPlan, {
                      deleteKeys: managerDeleteKeys,
                    });
                    setManagerResult(res);
                    setManagerBackups(res.backups);
                  } finally {
                    setManagerBusy(false);
                  }
                }}
                onMouseEnter={onBtnMouseEnter}
                onMouseLeave={onBtnMouseLeave}
                onFocus={onBtnFocus}
                onBlur={onBtnBlur}
                style={
                  !applyFixPlan || !managerArmed || managerBusy
                    ? { ...disabledButtonStyle, padding: "6px 10px" }
                    : { ...buttonStyle, padding: "6px 10px" }
                }
              >
                应用计划
              </button>
              <button
                type="button"
                disabled={!restoreFiles || !managerBackups || managerBusy}
                onClick={async () => {
                  if (!restoreFiles || !managerBackups) return;
                  setManagerBusy(true);
                  try {
                    const res = await restoreFiles(managerBackups);
                    setManagerResult(res);
                    setManagerBackups(undefined);
                  } finally {
                    setManagerBusy(false);
                  }
                }}
                onMouseEnter={onBtnMouseEnter}
                onMouseLeave={onBtnMouseLeave}
                onFocus={onBtnFocus}
                onBlur={onBtnBlur}
                style={
                  !restoreFiles || !managerBackups || managerBusy
                    ? { ...disabledButtonStyle, padding: "6px 10px" }
                    : { ...buttonStyle, padding: "6px 10px" }
                }
              >
                撤销上次应用
              </button>
            </div>

            <pre
              style={{
                margin: 0,
                padding: "10px",
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                background: "rgba(var(--mono-rgb-100), 0.03)",
                maxHeight: "260px",
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {managerPlanText ?? ""}
            </pre>

            {managerResult ? (
              <div style={{ marginTop: "10px", color: "var(--text-muted)" }}>
                Applied: {managerResult.applied}, Failed: {managerResult.failed}
                {managerResult.errors.length > 0 ? (
                  <div
                    style={{
                      marginTop: "6px",
                      color: "var(--text-faint)",
                      fontSize: "0.9em",
                    }}
                  >
                    {managerResult.errors.slice(0, 5).map((e, idx) => (
                      <div key={`mgr-err-${idx}`}>
                        {e.path}: {e.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            未加载计划。请先生成计划以预览变更。
          </div>
        )}
      </div>

      <div
        style={{
          margin: "18px 0 10px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--background-modifier-border)",
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>✅ 每日行动</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
          Actions
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        {!can("tasks:open") ? (
          <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
            v5.0 在控制台内联展示 Tasks 查询块；当前未检测到 Tasks
            集成可用（请安装/启用 Tasks 插件）。
          </div>
        ) : null}

        <div
          style={{
            marginTop: "12px",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "12px",
          }}
        >
          <div
            style={{
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "10px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>
              🔥 必须解决 (Inbox & Urgent)
            </div>
            <MarkdownBlock
              markdown={`**❓ 疑难杂症 (Questions)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/question\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**🚨 紧急事项 (Urgent)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/urgent\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n`}
            />
          </div>

          <div
            style={{
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "10px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>
              🛠️ 持续改进 (Improvement)
            </div>
            <MarkdownBlock
              markdown={`**🧪 回测任务 (Backtest)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/backtest\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**📝 复盘任务 (Review)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/review\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**📖 待学习/阅读 (Study)**\n\n\
\`\`\`tasks\n\
not done\n\
(tag includes #task/study) OR (tag includes #task/read) OR (tag includes #task/watch)\n\
path does not include Templates\n\
limit 5\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**🔬 待验证想法 (Verify)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/verify\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n`}
            />
          </div>

          <div
            style={{
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "10px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>
              📅 每日例行 (Routine)
            </div>
            <MarkdownBlock
              markdown={`**📝 手动打卡 (Checklist)**\n\n\
- [ ] ☀️ **盘前**：阅读新闻，标记关键位 (S/R Levels) 🔁 every day\n\
- [ ] 🧘 **盘中**：每小时检查一次情绪 (FOMO Check) 🔁 every day\n\
- [ ] 🌙 **盘后**：填写当日 \`复盘日记\` 🔁 every day\n\n\
**🧹 杂项待办 (To-Do)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/todo\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
limit 5\n\
\`\`\`\n`}
            />
          </div>

          <div
            style={{
              border: "1px solid var(--background-modifier-border)",
              borderRadius: "10px",
              padding: "10px",
              background: "rgba(var(--mono-rgb-100), 0.03)",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: "6px" }}>
              🛠️ 等待任务 (Maintenance)
            </div>
            <MarkdownBlock
              markdown={`**🖨️ 待打印 (Print Queue)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/print\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n\n\
**📂 待整理 (Organize)**\n\n\
\`\`\`tasks\n\
not done\n\
tag includes #task/organize\n\
path does not include Templates\n\
hide backlink\n\
short mode\n\
\`\`\`\n`}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          margin: "18px 0 10px",
          paddingBottom: "8px",
          borderBottom: "1px solid var(--background-modifier-border)",
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 700 }}>📥 导出</div>
        <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
          Export
        </div>
      </div>

      <div
        style={{
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "10px",
          padding: "12px",
          marginBottom: "16px",
          background: "var(--background-primary)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "10px",
          }}
        >
          <button
            type="button"
            disabled={!runCommand}
            onClick={() =>
              runCommand?.("al-brooks-console:export-legacy-snapshot")
            }
            style={runCommand ? buttonStyle : disabledButtonStyle}
          >
            导出旧版兼容快照 (pa-db-export.json)
          </button>
          <button
            type="button"
            disabled={!runCommand}
            onClick={() =>
              runCommand?.("al-brooks-console:export-index-snapshot")
            }
            style={runCommand ? buttonStyle : disabledButtonStyle}
          >
            导出索引快照 (Index Snapshot)
          </button>
        </div>

        <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
          v5.0 在页面底部提供“一键备份数据库”按钮（写入 pa-db-export.json）。插件版
          目前提供两类导出：旧版兼容快照与索引快照（默认导出到
          Exports/al-brooks-console/）。
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "20px" }}>
        {/* Trade Feed */}
        <div>
          <h3 style={{ marginBottom: "12px" }}>最近活动</h3>
          <TradeList trades={trades.slice(0, 50)} onOpenFile={openFile} />
        </div>
      </div>
    </div>
  );
};

export class ConsoleView extends ItemView {
  private index: TradeIndex;
  private strategyIndex: StrategyIndex;
  private todayContext?: TodayContext;
  private integrations?: PluginIntegrationRegistry;
  private version: string;
  private root: Root | null = null;
  private mountEl: HTMLElement | null = null;
  private getSettings: () => AlBrooksConsoleSettings;
  private subscribeSettings: (
    listener: (settings: AlBrooksConsoleSettings) => void
  ) => () => void;

  constructor(
    leaf: WorkspaceLeaf,
    index: TradeIndex,
    strategyIndex: StrategyIndex,
    todayContext: TodayContext,
    integrations: PluginIntegrationRegistry,
    version: string,
    getSettings: () => AlBrooksConsoleSettings,
    subscribeSettings: (
      listener: (settings: AlBrooksConsoleSettings) => void
    ) => () => void
  ) {
    super(leaf);
    this.index = index;
    this.strategyIndex = strategyIndex;
    this.todayContext = todayContext;
    this.integrations = integrations;
    this.version = version;
    this.getSettings = getSettings;
    this.subscribeSettings = subscribeSettings;
  }

  getViewType() {
    return VIEW_TYPE_CONSOLE;
  }

  getDisplayText() {
    return "交易员控制台";
  }

  getIcon() {
    return "bar-chart-2";
  }

  async onOpen() {
    const openFile = (path: string) => {
      this.app.workspace.openLinkText(path, "", true);
    };

    const resolveLink = (
      linkText: string,
      fromPath: string
    ): string | undefined => {
      const cleaned = String(linkText ?? "").trim();
      if (!cleaned) return undefined;
      const dest = this.app.metadataCache.getFirstLinkpathDest(
        cleaned,
        fromPath
      );
      return dest?.path;
    };

    const getResourceUrl = (path: string): string | undefined => {
      const af = this.app.vault.getAbstractFileByPath(path);
      if (!(af instanceof TFile)) return undefined;
      return this.app.vault.getResourcePath(af);
    };

    let enumPresets: EnumPresets | undefined = undefined;
    try {
      const presetsPath = "Templates/属性值预设.md";
      const af = this.app.vault.getAbstractFileByPath(presetsPath);
      if (af instanceof TFile) {
        let fm = this.app.metadataCache.getFileCache(af)?.frontmatter as any;
        if (!fm) {
          const text = await this.app.vault.read(af);
          const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
          if (m && m[1]) fm = parseYaml(m[1]);
        }
        if (fm && typeof fm === "object") {
          enumPresets = createEnumPresetsFromFrontmatter(
            fm as Record<string, unknown>
          );
        }
      }
    } catch (e) {
      // best-effort only; dashboard should still render without presets
    }

    const applyFrontmatterPatch = (
      text: string,
      updates: Record<string, unknown>,
      deleteKeys?: string[]
    ): string => {
      const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
      const yamlText = m?.[1];
      const body = m ? text.slice(m[0].length) : text;
      const fmRaw = yamlText ? (parseYaml(yamlText) as any) : {};
      const fm: Record<string, any> =
        fmRaw && typeof fmRaw === "object" ? { ...fmRaw } : {};
      for (const [k, v] of Object.entries(updates ?? {})) fm[k] = v;
      if (deleteKeys && deleteKeys.length > 0) {
        for (const k of deleteKeys) delete fm[k];
      }
      const nextYaml = String(stringifyYaml(fm) ?? "").trimEnd();
      return `---\n${nextYaml}\n---\n${body}`;
    };

    const applyFixPlan = async (
      plan: FixPlan,
      options?: { deleteKeys?: boolean }
    ) => {
      const res: ManagerApplyResult = {
        applied: 0,
        failed: 0,
        errors: [],
        backups: {},
      };
      for (const fu of plan.fileUpdates ?? []) {
        try {
          const af = this.app.vault.getAbstractFileByPath(fu.path);
          if (!(af instanceof TFile)) {
            res.failed += 1;
            res.errors.push({ path: fu.path, message: "文件未找到" });
            continue;
          }
          const oldText = await this.app.vault.read(af);
          res.backups[fu.path] = oldText;
          const nextText = applyFrontmatterPatch(
            oldText,
            fu.updates ?? {},
            options?.deleteKeys ? fu.deleteKeys : undefined
          );
          if (nextText !== oldText) {
            await this.app.vault.modify(af, nextText);
            res.applied += 1;
          }
        } catch (e) {
          res.failed += 1;
          res.errors.push({
            path: fu.path,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return res;
    };

    const restoreFiles = async (backups: Record<string, string>) => {
      const res: ManagerApplyResult = {
        applied: 0,
        failed: 0,
        errors: [],
        backups: {},
      };
      for (const [path, text] of Object.entries(backups ?? {})) {
        try {
          const af = this.app.vault.getAbstractFileByPath(path);
          if (!(af instanceof TFile)) {
            res.failed += 1;
            res.errors.push({ path, message: "文件未找到" });
            continue;
          }
          const oldText = await this.app.vault.read(af);
          res.backups[path] = oldText;
          if (text !== oldText) {
            await this.app.vault.modify(af, text);
            res.applied += 1;
          }
        } catch (e) {
          res.failed += 1;
          res.errors.push({
            path,
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return res;
    };

    const loadStrategyNotes = async (): Promise<StrategyNoteFrontmatter[]> => {
      const repoPath = "策略仓库 (Strategy Repository)";
      const prefix = repoPath
        ? `${repoPath.replace(/^\/+/, "").trim().replace(/\/+$/, "")}/`
        : "";
      const out: StrategyNoteFrontmatter[] = [];
      const STRATEGY_TAG = "PA/Strategy";
      const files = this.app.vault
        .getMarkdownFiles()
        .filter((f) => (prefix ? f.path.startsWith(prefix) : true));
      for (const f of files) {
        const cache = this.app.metadataCache.getFileCache(f);
        let fm = cache?.frontmatter as Record<string, unknown> | undefined;
        const cacheTags = (cache?.tags ?? []).map((t) => t.tag);
        const fmTagsRaw = (fm as any)?.tags as unknown;
        const fmTags = Array.isArray(fmTagsRaw)
          ? fmTagsRaw.filter((t): t is string => typeof t === "string")
          : typeof fmTagsRaw === "string"
          ? [fmTagsRaw]
          : [];
        const normalized = [...cacheTags, ...fmTags].map(normalizeTag);
        const isStrategy = normalized.some(
          (t) => t.toLowerCase() === STRATEGY_TAG.toLowerCase()
        );
        if (!isStrategy) continue;
        if (!fm) {
          try {
            const text = await this.app.vault.read(f);
            const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
            if (m && m[1]) {
              const parsed = parseYaml(m[1]);
              fm =
                parsed && typeof parsed === "object"
                  ? (parsed as any)
                  : undefined;
            }
          } catch (e) {
            // ignore
          }
        }
        if (fm) out.push({ path: f.path, frontmatter: fm });
      }
      return out;
    };

    const loadPaTagSnapshot = async (): Promise<PaTagSnapshot> => {
      const files = this.app.vault
        .getMarkdownFiles()
        .filter((f) => !f.path.startsWith("Templates/"));

      const tagMap: Record<string, number> = {};
      let countFiles = 0;

      const isPaTag = (t: string): boolean => {
        const n = normalizeTag(t).toLowerCase();
        return n === "pa" || n.startsWith("pa/");
      };

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const cache = this.app.metadataCache.getFileCache(f);
        const cacheTags = (cache?.tags ?? []).map((t) => t.tag);
        const fm = cache?.frontmatter as any;
        const fmTagsRaw = fm?.tags as unknown;
        const fmTags = Array.isArray(fmTagsRaw)
          ? fmTagsRaw.filter((t): t is string => typeof t === "string")
          : typeof fmTagsRaw === "string"
          ? [fmTagsRaw]
          : [];
        const normalized = [...cacheTags, ...fmTags].map(normalizeTag);
        if (!normalized.some(isPaTag)) continue;

        countFiles += 1;
        for (const tag of normalized) {
          tagMap[tag] = (tagMap[tag] ?? 0) + 1;
        }

        if (i % 250 === 0) await new Promise((r) => window.setTimeout(r, 0));
      }

      return { files: countFiles, tagMap };
    };

    const loadCourse = async (
      settings: AlBrooksConsoleSettings
    ): Promise<CourseSnapshot> => {
      const syllabusName = "PA_Syllabus_Data.md";
      const syFile = this.app.vault
        .getMarkdownFiles()
        .find((f) => f.name === syllabusName);
      const syllabus = syFile
        ? parseSyllabusJsonFromMarkdown(await this.app.vault.read(syFile))
        : [];

      const COURSE_TAG = "PA/Course";
      const doneIds = new Set<string>();
      const linksById: Record<string, { path: string; name: string }> = {};

      const files = this.app.vault.getMarkdownFiles();
      for (const f of files) {
        const cache = this.app.metadataCache.getFileCache(f);
        const cacheTags = (cache?.tags ?? []).map((t) => t.tag);
        const fm = cache?.frontmatter as any;
        const fmTagsRaw = fm?.tags as unknown;
        const fmTags = Array.isArray(fmTagsRaw)
          ? fmTagsRaw.filter((t): t is string => typeof t === "string")
          : typeof fmTagsRaw === "string"
          ? [fmTagsRaw]
          : [];
        const normalized = [...cacheTags, ...fmTags].map(normalizeTag);
        const isCourse = normalized.some(
          (t) => t.toLowerCase() === COURSE_TAG.toLowerCase()
        );
        if (!isCourse) continue;

        let ids = fm?.module_id as unknown;
        if (!ids) continue;
        if (!Array.isArray(ids)) ids = [ids];
        const studied = Boolean(fm?.studied);
        for (const id of ids as any[]) {
          const strId = String(id ?? "").trim();
          if (!strId) continue;
          linksById[strId] = { path: f.path, name: f.name };
          if (studied) doneIds.add(strId);
        }
      }

      return buildCourseSnapshot({
        syllabus,
        doneIds,
        linksById,
        courseRecommendationWindow: settings.courseRecommendationWindow,
      });
    };

    const loadMemory = async (
      settings: AlBrooksConsoleSettings
    ): Promise<MemorySnapshot> => {
      const FLASH_TAG = "flashcards";
      const files = this.app.vault
        .getMarkdownFiles()
        .filter((f) => !f.path.startsWith("Templates/"));
      const picked = files.filter((f) => {
        const cache = this.app.metadataCache.getFileCache(f);
        const cacheTags = (cache?.tags ?? []).map((t) => t.tag);
        const fm = cache?.frontmatter as any;
        const fmTagsRaw = fm?.tags as unknown;
        const fmTags = Array.isArray(fmTagsRaw)
          ? fmTagsRaw.filter((t): t is string => typeof t === "string")
          : typeof fmTagsRaw === "string"
          ? [fmTagsRaw]
          : [];
        const normalized = [...cacheTags, ...fmTags].map(normalizeTag);
        return normalized.some(
          (t) => t.toLowerCase() === FLASH_TAG.toLowerCase()
        );
      });

      const fileInputs: Array<{
        path: string;
        name: string;
        folder: string;
        content: string;
      }> = [];
      for (let i = 0; i < picked.length; i++) {
        const f = picked[i];
        const content = await this.app.vault.read(f);
        const folder = f.path.split("/").slice(0, -1).pop() || "Root";
        fileInputs.push({ path: f.path, name: f.name, folder, content });
        if (i % 12 === 0) await new Promise((r) => window.setTimeout(r, 0));
      }

      return buildMemorySnapshot({
        files: fileInputs,
        today: new Date(),
        dueThresholdDays: settings.srsDueThresholdDays,
        randomQuizCount: settings.srsRandomQuizCount,
      });
    };

    this.contentEl.empty();
    this.mountEl = this.contentEl.createDiv();
    this.root = createRoot(this.mountEl);
    this.root.render(
      <ConsoleErrorBoundary>
        <ConsoleComponent
          index={this.index}
          strategyIndex={this.strategyIndex}
          todayContext={this.todayContext}
          resolveLink={resolveLink}
          getResourceUrl={getResourceUrl}
          enumPresets={enumPresets}
          loadStrategyNotes={loadStrategyNotes}
          loadPaTagSnapshot={loadPaTagSnapshot}
          applyFixPlan={applyFixPlan}
          restoreFiles={restoreFiles}
          settings={this.getSettings()}
          subscribeSettings={this.subscribeSettings}
          loadCourse={loadCourse}
          loadMemory={loadMemory}
          integrations={this.integrations}
          openFile={openFile}
          runCommand={(commandId) =>
            (this.app as any).commands?.executeCommandById?.(commandId)
          }
          version={this.version}
        />
      </ConsoleErrorBoundary>
    );
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
    this.mountEl = null;
  }
}
