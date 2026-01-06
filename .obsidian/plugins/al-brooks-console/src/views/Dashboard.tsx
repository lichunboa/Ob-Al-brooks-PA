import * as React from "react";
import {
  ItemView,
  WorkspaceLeaf,
  TFile,
  Notice,
  Modal,
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
import { StrategyStats } from "./components";
import { TradeList } from "./components/TradeList";
import { StrategyList } from "./components/StrategyList";
import {
  computeDailyAgg,
  computeStrategyAttribution,
  identifyStrategyForAnalytics,
  normalizeMarketCycleForAnalytics,
  computeContextAnalysis,
  computeErrorAnalysis,
  computeTuitionAnalysis,
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
  buildRenameKeyPlan,
  buildDeleteKeyPlan,
  buildDeleteValPlan,
  buildUpdateValPlan,
  buildAppendValPlan,
  buildInjectPropPlan,
  buildFrontmatterInventory,
  type FrontmatterFile,
  type FrontmatterInventory,
  type ManagerApplyResult,
  type StrategyNoteFrontmatter,
} from "../core/manager";
import { MANAGER_GROUPS, managerKeyTokens } from "../core/manager-groups";
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
import { V5_COLORS, withHexAlpha } from "../ui/tokens";
import {
  activeTabButtonStyle,
  buttonSmDisabledStyle,
  buttonSmStyle,
  buttonStyle,
  ctaButtonStyle,
  cardStyle,
  cardSubtleTightStyle,
  cardTightStyle,
  disabledButtonStyle,
  selectStyle,
  tabButtonStyle,
  textButtonNoWrapStyle,
  textButtonSemiboldStyle,
  textButtonStrongStyle,
  textButtonStyle,
  glassPanelStyle,
  glassCardStyle,
  glassInsetStyle,
  glassStatusStyle,
} from "../ui/styles/dashboardPrimitives";
import {
  GlassCard,
  GlassPanel,
  GlassInset,
  DisplayXL,
  HeadingL,
  HeadingM,
  Label,
  Body,
  ButtonPrimary,
  ButtonGhost,
  StatusBadge,
} from "../ui/components/DesignSystem";
import { COLORS, SPACE } from "../ui/styles/theme";

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

function getRColorByAccountType(accountType: AccountType): string {
  switch (accountType) {
    case "Live":
      return V5_COLORS.live;
    case "Demo":
      return V5_COLORS.demo;
    case "Backtest":
      return V5_COLORS.back;
  }
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
  /** v5 属性管理器：扫描全库 frontmatter（不依赖 Dataview） */
  loadAllFrontmatterFiles?: () => Promise<FrontmatterFile[]>;
  applyFixPlan?: (
    plan: FixPlan,
    options?: { deleteKeys?: boolean }
  ) => Promise<ManagerApplyResult>;
  restoreFiles?: (
    backups: Record<string, string>
  ) => Promise<ManagerApplyResult>;
  createTradeNote?: () => Promise<void>;
  settings: AlBrooksConsoleSettings;
  subscribeSettings?: (
    listener: (settings: AlBrooksConsoleSettings) => void
  ) => () => void;
  loadCourse?: (settings: AlBrooksConsoleSettings) => Promise<CourseSnapshot>;
  loadMemory?: (settings: AlBrooksConsoleSettings) => Promise<MemorySnapshot>;
  promptText?: (options: {
    title: string;
    defaultValue?: string;
    placeholder?: string;
    okText?: string;
    cancelText?: string;
  }) => Promise<string | null>;
  confirmDialog?: (options: {
    title: string;
    message: string;
    okText?: string;
    cancelText?: string;
  }) => Promise<boolean>;
  openFile: (path: string) => void;
  openGlobalSearch?: (query: string) => void;
  runCommand?: (commandId: string) => void;
  integrations?: PluginIntegrationRegistry;
  version: string;
  onUpdateMarketCycle?: (cycle: string) => Promise<void>;
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
  loadAllFrontmatterFiles,
  applyFixPlan,
  restoreFiles,
  createTradeNote,
  settings: initialSettings,
  subscribeSettings,
  loadCourse,
  loadMemory,
  promptText,
  confirmDialog,
  openFile,
  openGlobalSearch,
  runCommand,
  integrations,
  version,
  onUpdateMarketCycle,
}) => {
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
  const [analyticsScope, setAnalyticsScope] =
    React.useState<AnalyticsScope>("Live");
  const [galleryScope, setGalleryScope] = React.useState<AnalyticsScope>("All");
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

      // --- Minimal-burden Schema issues (Trade) ---
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

        // “形态/策略”二选一：至少有一个即可
        const hasPatterns =
          Array.isArray(t.patternsObserved) &&
          t.patternsObserved.filter((p) => !isEmpty(p)).length > 0;
        // v5 口径：strategyName / setupKey / setupCategory 任意一个可视作“已填策略维度”
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

  const liveCyclePerf = React.useMemo(() => {
    const normalizeCycle = (raw: unknown): string => {
      let s = String(raw ?? "").trim();
      if (!s) return "Unknown";
      // 保留现有 dashboard 的 "/" 兼容行为（不影响 core 口径，只是先做一次拆分）
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

  type DashboardPage = "trading" | "analytics" | "learn" | "manage";
  const [activePage, setActivePage] = React.useState<DashboardPage>("trading");

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

  const onBtnFocus = React.useCallback(
    (e: React.FocusEvent<HTMLButtonElement>) => {
      if (e.currentTarget.disabled) return;
      e.currentTarget.style.boxShadow = "0 0 0 2px var(--interactive-accent)";
    },
    []
  );

  const onBtnBlur = React.useCallback(
    (e: React.FocusEvent<HTMLButtonElement>) => {
      e.currentTarget.style.boxShadow = "none";
    },
    []
  );

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

  const onTextBtnFocus = React.useCallback(
    (e: React.FocusEvent<HTMLButtonElement>) => {
      if (e.currentTarget.disabled) return;
      e.currentTarget.style.boxShadow = "0 0 0 2px var(--interactive-accent)";
    },
    []
  );

  const onTextBtnBlur = React.useCallback(
    (e: React.FocusEvent<HTMLButtonElement>) => {
      e.currentTarget.style.boxShadow = "none";
    },
    []
  );

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

  const onCtaMouseEnter = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = "var(--interactive-accent-hover)";
    },
    []
  );

  const onCtaMouseLeave = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.currentTarget.style.background = "var(--interactive-accent)";
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

        if (capabilityId === "metadata-menu:open") {
          const msg = e instanceof Error ? e.message : String(e);
          new Notice(`元数据：未能打开（${msg}）`);
        }
      }
    },
    [integrations]
  );

  const can = React.useCallback(
    (capabilityId: IntegrationCapability) =>
      Boolean(integrations?.isCapabilityAvailable(capabilityId)),
    [integrations]
  );

  const TRADE_NOTE_TEMPLATE_PATH = "Templates/单笔交易模版 (Trade Note).md";

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

  const allTradesDateRange = React.useMemo(() => {
    let min: string | undefined;
    let max: string | undefined;
    for (const t of trades) {
      const d = (t.dateIso ?? "").toString().trim();
      if (!d) continue;
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    }
    return { min, max };
  }, [trades]);
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

      // Prefer explicit outcome (v5 semantics), fall back to pnl sign if missing.
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

  // Equity curve removed (keep only multi-account Capital Growth curve).

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

      // 资金曲线：按账户分别累加（口径与 v5.0 接近：只在该账户出现时 push 一点）
      cum[acct] += pnl;
      curves[acct].push(cum[acct]);

      // 策略排行：策略名优先；没有则回退到 setupCategory
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

  type GalleryItem = {
    tradePath: string;
    tradeName: string;
    accountType: AccountType;
    pnl: number;
    coverPath: string;
    url?: string;
  };

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

    // v5.0 口径：按“最新”取候选。index.getAll() 的顺序不保证，所以这里显式按日期倒序。
    const candidatesSorted = [...candidates].sort((a, b) => {
      const da = String((a as any).dateIso ?? "");
      const db = String((b as any).dateIso ?? "");
      if (da === db) return 0;
      return da < db ? 1 : -1;
    });

    // 从最近交易里取前 20 个候选（用于“最新复盘”瀑布流展示）。
    for (const t of candidatesSorted.slice(0, 20)) {
      // 优先使用索引层规范字段（SSOT）；frontmatter 仅作回退。
      const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
      const rawCover =
        (t as any).cover ?? (fm as any)["cover"] ?? (fm as any)["封面/cover"];
      const ref = parseCoverRef(rawCover);

      // 允许“没有封面”的交易也进入展示（用占位卡片），否则用户会看到
      // “范围内有 2 笔，但只展示 1 张”的困惑。
      let resolved = "";
      let url: string | undefined = undefined;
      if (ref) {
        let target = String(ref.target ?? "").trim();
        if (target) {
          // 支持外链封面（http/https），否则按 Obsidian linkpath 解析到 vault path。
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

  return (
    <div className="pa-dashboard">
      <div className="pa-dashboard-header">
        <div className="pa-dashboard-title-row">
          <h2 className="pa-dashboard-title-text">
            🦁 交易员控制台
            <span className="pa-dashboard-title-meta">（Dashboard）</span>
            <span className="pa-dashboard-title-meta">v{version}</span>
            <span className="pa-dashboard-title-meta">{statusText}</span>
          </h2>
        </div>
        <div className="pa-dashboard-actions-row">
          {integrations ? (
            <>
              <button
                type="button"
                disabled={!can("srs:review-flashcards")}
                onClick={() => action("srs:review-flashcards")}
                onMouseEnter={onBtnMouseEnter}
                onMouseLeave={onBtnMouseLeave}
                onFocus={onBtnFocus}
                onBlur={onBtnBlur}
                style={
                  can("srs:review-flashcards")
                    ? buttonStyle
                    : disabledButtonStyle
                }
              >
                ⚡️ 开始复习
              </button>
            </>
          ) : null}

          {index.rebuild ? (
            <button
              type="button"
              onClick={onRebuild}
              onMouseEnter={onBtnMouseEnter}
              onMouseLeave={onBtnMouseLeave}
              onFocus={onBtnFocus}
              onBlur={onBtnBlur}
              style={buttonStyle}
            >
              🔄 重建索引
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => openFile(TRADE_NOTE_TEMPLATE_PATH)}
            onMouseEnter={onBtnMouseEnter}
            onMouseLeave={onBtnMouseLeave}
            onFocus={onBtnFocus}
            onBlur={onBtnBlur}
            style={{
              ...buttonStyle,
              // Maintain a slight hint of accent but mostly match standard button
              border: "1px solid var(--interactive-accent)",
              color: "var(--interactive-accent)",
              fontWeight: 600,
            }}
            title={TRADE_NOTE_TEMPLATE_PATH}
          >
            ✏️ 新建交易
          </button>
        </div>
      </div>

      <div className="pa-tabbar">
        {(
          [
            { id: "trading", label: "交易中心" },
            { id: "analytics", label: "数据中心" },
            { id: "learn", label: "学习模块" },
            { id: "manage", label: "管理/维护" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActivePage(t.id)}
            style={t.id === activePage ? activeTabButtonStyle : tabButtonStyle}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activePage === "trading" ? (
        <>
          <div style={glassCardStyle}>
            {/* Level 1 Container (White/Black Frame) */}

            {/* Header / Actions Row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "10px",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: "1.1em" }}>⚔️ 交易中心</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                  Trading Hub
                </div>
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
                <div style={glassPanelStyle}>
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
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.85em",
                          }}
                        >
                          {h.en}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}

            <GlassPanel style={{ marginBottom: SPACE.lg }}>
              <HeadingM style={{ marginBottom: SPACE.md }}>今日概览</HeadingM>

              <div style={{ marginBottom: SPACE.lg }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gap: SPACE.md,
                    marginBottom: SPACE.md,
                  }}
                >
                  {(
                    [
                      {
                        label: "总交易",
                        value: String(todayKpi.total),
                        color: undefined,
                      },
                      {
                        label: "获胜",
                        value: String(todayKpi.wins),
                        color: COLORS.win,
                      },
                      {
                        label: "亏损",
                        value: String(todayKpi.losses),
                        color: COLORS.loss,
                      },
                    ] as const
                  ).map((c) => (
                    <GlassInset
                      key={c.label}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        padding: SPACE.md
                      }}
                    >
                      <Label align="center">{c.label}</Label>
                      <DisplayXL
                        money
                        color={c.color}
                        style={{ marginTop: SPACE.xs }}
                      >
                        {c.value}
                      </DisplayXL>
                    </GlassInset>
                  ))}
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: SPACE.md,
                  }}
                >
                  <GlassInset style={{ padding: SPACE.md, textAlign: "center" }}>
                    <Label align="center">胜率</Label>
                    <DisplayXL
                      money
                      color={COLORS.backtest}
                      style={{ marginTop: SPACE.xs }}
                    >
                      {todayKpi.winRatePct}%
                    </DisplayXL>
                  </GlassInset>

                  <GlassInset style={{ padding: SPACE.md, textAlign: "center" }}>
                    <Label align="center">净利润</Label>
                    <DisplayXL
                      money
                      color={todayKpi.netR >= 0 ? COLORS.win : COLORS.loss}
                      style={{ marginTop: SPACE.xs }}
                    >
                      {todayKpi.netR >= 0 ? "+" : ""}
                      {todayKpi.netR.toFixed(1)}R
                    </DisplayXL>
                  </GlassInset>
                </div>
              </div>
            </GlassPanel>



            <GlassPanel style={{ marginBottom: SPACE.lg }}>
              <HeadingM style={{ marginBottom: SPACE.sm }}>
                周期 → 策略推荐
              </HeadingM>

              <div style={{ marginBottom: SPACE.md }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: COLORS.text.muted, fontSize: "0.9em" }}>当前市场周期：</span>
                  {onUpdateMarketCycle ? (
                    <select
                      value={todayMarketCycle ?? ""}
                      onChange={(e) => onUpdateMarketCycle(e.target.value)}
                      style={{
                        ...selectStyle,
                        background: "rgba(var(--mono-rgb-100), 0.05)",
                        borderColor: "rgba(var(--mono-rgb-100), 0.1)",
                        fontSize: "0.9em",
                        padding: "2px 8px",
                      }}
                    >
                      <option value="">— 选择周期 —</option>
                      <option value="Strong Bull">Strong Bull (强多)</option>
                      <option value="Weak Bull">Weak Bull (弱多)</option>
                      <option value="Trading Range">Trading Range (震荡)</option>
                      <option value="Weak Bear">Weak Bear (弱空)</option>
                      <option value="Strong Bear">Strong Bear (强空)</option>
                      <option value="Breakout Mode">Breakout Mode (突破)</option>
                    </select>
                  ) : (
                    <StatusBadge label={todayMarketCycle ?? "—"} tone="neutral" />
                  )}
                </div>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: SPACE.sm,
              }}>
                {todayStrategyPicks.map((s) => (
                  <ButtonGhost
                    key={`today-pick-${s.path}`}
                    onClick={() => openFile(s.path)}
                    block
                    style={{ justifyContent: "flex-start", textAlign: "left" }}
                  >
                    {s.canonicalName}
                  </ButtonGhost>
                ))}
              </div>
            </GlassPanel>

            {openTrade && (
              <GlassPanel>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: SPACE.md }}>
                  <HeadingM>进行中交易助手</HeadingM>
                  <ButtonGhost onClick={() => openFile(openTrade.path)} style={{ fontSize: "0.85em" }}>
                    {openTrade.ticker ?? "未知"} • {openTrade.name} ↗
                  </ButtonGhost>
                </div>

                {openTradeStrategy ? (
                  <div>
                    <div style={{ marginBottom: SPACE.sm, display: "flex", alignItems: "baseline", gap: SPACE.xs }}>
                      <Label>执行策略:</Label>
                      <ButtonGhost
                        onClick={() => openFile(openTradeStrategy.path)}
                        style={{ padding: "0 4px", height: "auto", fontSize: "0.9em" }}
                      >
                        {openTradeStrategy.canonicalName}
                      </ButtonGhost>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                        gap: SPACE.md,
                      }}
                    >
                      {/* 1. Entry */}
                      {(openTradeStrategy.entryCriteria?.length ?? 0) > 0 && (
                        <GlassInset style={{ padding: SPACE.md }}>
                          <div style={{ display: "flex", alignItems: "center", gap: SPACE.xs, marginBottom: SPACE.sm }}>
                            <span style={{ fontSize: "1.1em" }}>🚪</span>
                            <Label color="accent">入场条件</Label>
                          </div>
                          <ul style={{ margin: 0, paddingLeft: SPACE.lg, color: COLORS.text.normal }}>
                            {openTradeStrategy.entryCriteria!.slice(0, 3).map((x, i) => (
                              <li key={`entry-${i}`}><Body style={{ fontSize: "0.9em" }}>{x}</Body></li>
                            ))}
                          </ul>
                        </GlassInset>
                      )}

                      {/* 2. Stop Loss */}
                      {(openTradeStrategy.stopLossRecommendation?.length ?? 0) > 0 && (
                        <GlassInset style={{ padding: SPACE.md }}>
                          <div style={{ display: "flex", alignItems: "center", gap: SPACE.xs, marginBottom: SPACE.sm }}>
                            <span style={{ fontSize: "1.1em" }}>🛑</span>
                            <Label style={{ color: COLORS.loss }}>止损建议</Label>
                          </div>
                          <ul style={{ margin: 0, paddingLeft: SPACE.lg, color: COLORS.text.normal }}>
                            {openTradeStrategy.stopLossRecommendation!.slice(0, 3).map((x, i) => (
                              <li key={`stop-${i}`}><Body style={{ fontSize: "0.9em" }}>{x}</Body></li>
                            ))}
                          </ul>
                        </GlassInset>
                      )}

                      {/* 3. Risks */}
                      {(openTradeStrategy.riskAlerts?.length ?? 0) > 0 && (
                        <GlassInset style={{ padding: SPACE.md }}>
                          <div style={{ display: "flex", alignItems: "center", gap: SPACE.xs, marginBottom: SPACE.sm }}>
                            <span style={{ fontSize: "1.1em" }}>⚠️</span>
                            <Label style={{ color: COLORS.backtest }}>风险提示</Label>
                          </div>
                          <ul style={{ margin: 0, paddingLeft: SPACE.lg, color: COLORS.text.normal }}>
                            {openTradeStrategy.riskAlerts!.slice(0, 3).map((x, i) => (
                              <li key={`risk-${i}`}><Body style={{ fontSize: "0.9em" }}>{x}</Body></li>
                            ))}
                          </ul>
                        </GlassInset>
                      )}

                      {/* 4. Targets */}
                      {(openTradeStrategy.takeProfitRecommendation?.length ?? 0) > 0 && (
                        <GlassInset style={{ padding: SPACE.md }}>
                          <div style={{ display: "flex", alignItems: "center", gap: SPACE.xs, marginBottom: SPACE.sm }}>
                            <span style={{ fontSize: "1.1em" }}>🎯</span>
                            <Label style={{ color: COLORS.accent }}>目标位</Label>
                          </div>
                          <ul style={{ margin: 0, paddingLeft: SPACE.lg, color: COLORS.text.normal }}>
                            {openTradeStrategy.takeProfitRecommendation!.slice(0, 3).map((x, i) => (
                              <li key={`tp-${i}`}><Body style={{ fontSize: "0.9em" }}>{x}</Body></li>
                            ))}
                          </ul>
                        </GlassInset>
                      )}
                    </div>

                    {/* Signal Validation Logic */}
                    {(() => {
                      const curSignals = (openTrade.signalBarQuality ?? []).map((s) => String(s).trim()).filter(Boolean);
                      const reqSignals = (openTradeStrategy.signalBarQuality ?? []).map((s) => String(s).trim()).filter(Boolean);

                      const hasSignalInfo = curSignals.length > 0 || reqSignals.length > 0;
                      if (!hasSignalInfo) return null;

                      const norm = (s: string) => s.toLowerCase();
                      const signalMatch = curSignals.length > 0 && reqSignals.length > 0
                        ? reqSignals.some((r) => curSignals.some((c) => {
                          const rn = norm(r);
                          const cn = norm(c);
                          return rn.includes(cn) || cn.includes(rn);
                        }))
                        : null;

                      return (
                        <GlassInset style={{ marginTop: SPACE.md, padding: SPACE.md }}>
                          <Label style={{ marginBottom: SPACE.sm }}>🔍 信号K验证</Label>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: SPACE.md }}>
                            <div>
                              <Label style={{ fontSize: "0.85em", opacity: 0.7 }}>当前信号</Label>
                              <div style={{ color: curSignals.length > 0 ? COLORS.accent : COLORS.text.muted }}>
                                {curSignals.length > 0 ? curSignals.join(" / ") : "—"}
                              </div>
                            </div>
                            <div>
                              <Label style={{ fontSize: "0.85em", opacity: 0.7 }}>策略建议</Label>
                              <div style={{ color: reqSignals.length > 0 ? COLORS.text.normal : COLORS.text.muted }}>
                                {reqSignals.length > 0 ? reqSignals.join(" / ") : "未定义"}
                              </div>
                            </div>
                          </div>

                          {signalMatch !== null && (
                            <div style={{ marginTop: SPACE.sm, paddingTop: SPACE.sm, borderTop: `1px solid ${COLORS.border}` }}>
                              <StatusBadge
                                label={signalMatch ? "信号匹配" : "信号不符"}
                                tone={signalMatch ? "success" : "warn"}
                              />
                            </div>
                          )}
                        </GlassInset>
                      );
                    })()}
                  </div>
                ) : (
                  /* Fallback */
                  <GlassInset style={{ padding: SPACE.md }}>
                    <div style={{ marginBottom: SPACE.sm, color: COLORS.text.muted }}>
                      💡 基于当前市场背景 ({openTrade.marketCycle || "未知"}) 的策略建议:
                    </div>
                    <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
                      {strategyPicks.length > 0 ? (
                        strategyPicks.map((s) => (
                          <ButtonGhost
                            key={`fallback-${s.path}`}
                            onClick={() => openFile(s.path)}
                            style={{ fontSize: "0.85em", padding: "2px 8px" }}
                          >
                            {s.canonicalName}
                          </ButtonGhost>
                        ))
                      ) : (
                        <span style={{ color: COLORS.text.muted }}>无匹配策略</span>
                      )}
                    </div>
                  </GlassInset>
                )}

              </GlassPanel>
            )}

            <div style={{ marginTop: SPACE.lg }}>
              <HeadingM style={{ marginBottom: SPACE.md }}>今日交易</HeadingM>
              {todayTrades.length > 0 ? (
                <TradeList trades={todayTrades} onOpenFile={openFile} />
              ) : (
                <div style={{ color: COLORS.text.muted, fontSize: "0.9em", paddingLeft: SPACE.xs }}>
                  今日暂无交易记录
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
            <div style={{ fontWeight: 700 }}>✅ 每日行动</div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
              Actions
            </div>
          </div>

          <div
            style={{
              ...glassPanelStyle,
              marginBottom: "16px",
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

          {/* Removed duplicate "recent trades" card; keep only the Today Trades list at top. */}
        </>
      ) : null
      }

      {
        activePage === "analytics" ? (
          <>
            <div
              style={{
                margin: `${SPACE.xxl} 0 ${SPACE.sm}`,
                paddingBottom: SPACE.xs,
                borderBottom: "1px solid var(--background-modifier-border)",
                display: "flex",
                alignItems: "baseline",
                gap: SPACE.sm,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 700 }}>📊 数据中心</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                Analytics Hub
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: SPACE.md,
                alignItems: "stretch",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: SPACE.md,
                  minWidth: 0,
                }}
              >
                <GlassCard>
                  <div style={{ marginBottom: SPACE.lg }}>
                    <HeadingM>💼 账户资金概览 <span style={{ opacity: 0.5, fontSize: "0.8em", fontWeight: 400 }}>(Account)</span></HeadingM>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: SPACE.md }}>
                    {([
                      { key: "Live", label: "🟢 实盘账户", badge: "Live", accent: V5_COLORS.live, stats: summary.Live },
                      { key: "Demo", label: "🔵 模拟盘", badge: "Demo", accent: V5_COLORS.demo, stats: summary.Demo },
                      { key: "Backtest", label: "🟠 复盘回测", badge: "Backtest", accent: V5_COLORS.back, stats: summary.Backtest },
                    ] as const).map((card) => (
                      <GlassPanel key={card.key} style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontWeight: 700, color: card.accent }}>{card.label}</div>
                          <StatusBadge label={card.badge} tone="neutral" />
                        </div>

                        <div style={{ display: "flex", alignItems: "baseline", gap: SPACE.xs, marginTop: SPACE.xs }}>
                          <DisplayXL money color={card.stats.netProfit >= 0 ? COLORS.win : COLORS.loss}>
                            {card.stats.netProfit > 0 ? "+" : ""}
                            {card.stats.netProfit.toFixed(1)}
                          </DisplayXL>
                          <span style={{ color: COLORS.text.muted, fontSize: "0.9em" }}>R</span>
                        </div>

                        <div style={{ display: "flex", gap: SPACE.lg, color: COLORS.text.muted, fontSize: "0.85em" }}>
                          <div>📦 {card.stats.countTotal} 笔</div>
                          <div>🎯 {card.stats.winRatePct}% 胜率</div>
                        </div>
                      </GlassPanel>
                    ))}
                  </div>
                </GlassCard>

                <GlassCard>
                  <div style={{ marginBottom: SPACE.lg }}>
                    <HeadingM>🌪️ 不同市场环境表现 <span style={{ opacity: 0.5, fontSize: "0.8em", fontWeight: 400 }}>(Live PnL)</span></HeadingM>
                  </div>

                  {liveCyclePerf.length === 0 ? (
                    <div style={{ color: COLORS.text.muted, fontSize: "0.9em", padding: SPACE.sm }}>
                      暂无数据
                    </div>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: SPACE.sm }}>
                      {liveCyclePerf.map((cy) => {
                        const color = cy.pnl > 0 ? COLORS.win : cy.pnl < 0 ? COLORS.loss : COLORS.text.muted;
                        return (
                          <GlassInset key={cy.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: SPACE.sm }}>
                            <Label align="center" style={{ marginBottom: SPACE.xs }}>{cycleMap[cy.name] ?? cy.name}</Label>
                            <div style={{ fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
                              {cy.pnl > 0 ? "+" : ""}
                              {cy.pnl.toFixed(1)}R
                            </div>
                          </GlassInset>
                        );
                      })}
                    </div>
                  )}
                </GlassCard>

                <GlassCard>
                  <div style={{ marginBottom: SPACE.lg }}>
                    <HeadingM>💸 错误的代价 <span style={{ opacity: 0.5, fontSize: "0.8em", fontWeight: 400 }}>(学费统计)</span></HeadingM>
                  </div>
                  {tuition.tuitionR <= 0 ? (
                    <div style={{ color: COLORS.win, fontWeight: 700, padding: SPACE.sm }}>
                      🎉 完美！近期实盘没有因纪律问题亏损。
                    </div>
                  ) : (
                    <GlassPanel style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
                      <div style={{ color: COLORS.text.muted, fontSize: "0.9em" }}>
                        因执行错误共计亏损：
                        <span style={{ color: COLORS.loss, fontWeight: 900, marginLeft: "6px" }}>
                          -{tuition.tuitionR.toFixed(1)}R
                        </span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}>
                        {tuition.rows.slice(0, 5).map((row) => {
                          const pct = Math.round((row.costR / tuition.tuitionR) * 100);
                          return (
                            <div key={row.tag} style={{ display: "flex", alignItems: "center", gap: SPACE.md, fontSize: "0.9em" }}>
                              <div style={{ width: "110px", color: COLORS.text.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.tag}>
                                {row.tag}
                              </div>
                              <GlassInset style={{ flex: "1 1 auto", height: "8px", padding: 0, borderRadius: "999px", overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: COLORS.loss }} />
                              </GlassInset>
                              <div style={{ width: "70px", textAlign: "right", color: COLORS.loss, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                                -{row.costR.toFixed(1)}R
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </GlassPanel>
                  )}
                </GlassCard>

                <GlassCard>
                  <div style={{ marginBottom: SPACE.lg }}>
                    <HeadingM>💡 系统建议 <span style={{ opacity: 0.5, fontSize: "0.8em", fontWeight: 400 }}>(Actions)</span></HeadingM>
                  </div>
                  <GlassPanel
                    style={{
                      fontSize: "0.95em",
                      lineHeight: 1.6,
                      background:
                        analyticsSuggestion.tone === "danger"
                          ? withHexAlpha(V5_COLORS.loss, "1F")
                          : analyticsSuggestion.tone === "warn"
                            ? withHexAlpha(V5_COLORS.back, "1F")
                            : withHexAlpha(V5_COLORS.win, "1A"),
                      border: "1px solid var(--background-modifier-border)",
                      color:
                        analyticsSuggestion.tone === "danger"
                          ? V5_COLORS.loss
                          : analyticsSuggestion.tone === "warn"
                            ? V5_COLORS.back
                            : V5_COLORS.win,
                      fontWeight: 600,
                    }}
                  >
                    {analyticsSuggestion.text}
                  </GlassPanel>
                </GlassCard>

                <GlassCard>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: SPACE.lg }}>
                    <HeadingM>数据分析</HeadingM>
                    <label style={{ display: "flex", alignItems: "center", gap: SPACE.sm, fontSize: "0.9em", color: COLORS.text.muted }}>
                      范围
                      <select
                        value={analyticsScope}
                        onChange={(e) => setAnalyticsScope(e.target.value as AnalyticsScope)}
                        style={{
                          background: "var(--background-primary)",
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: "4px",
                          color: "var(--text-normal)",
                          padding: "2px 8px",
                          fontSize: "inherit"
                        }}
                      >
                        <option value="Live">实盘</option>
                        <option value="Demo">模拟</option>
                        <option value="Backtest">回测</option>
                        <option value="All">全部</option>
                      </select>
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: SPACE.xl }}>
                    {/* Calendar */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, marginBottom: SPACE.md, color: COLORS.text.muted, fontSize: "0.9em" }}>
                        日历 (最近 {calendarDays} 天)
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
                        {calendarCells.map((c) => {
                          const absRatio = calendarMaxAbs > 0 ? Math.min(1, Math.abs(c.netR) / calendarMaxAbs) : 0;
                          const bg = c.netR > 0
                            ? withHexAlpha(V5_COLORS.win, "20")
                            : c.netR < 0
                              ? withHexAlpha(V5_COLORS.loss, "20")
                              : `rgba(var(--mono-rgb-100), 0.05)`;

                          return (
                            <GlassInset
                              key={`cal-${c.dateIso}`}
                              style={{
                                padding: "4px",
                                background: bg,
                                minHeight: "44px",
                                display: "flex",
                                border: `1px solid ${COLORS.border}`
                              }}
                            >
                              <div title={`${c.dateIso} • ${c.count} 笔 • ${c.netR >= 0 ? "+" : ""}${c.netR.toFixed(1)}R`} style={{ width: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                                <div style={{ fontSize: "0.75em", color: COLORS.text.muted, textAlign: "left" }}>
                                  {getDayOfMonth(c.dateIso)}
                                </div>
                                <div style={{
                                  fontSize: "0.8em",
                                  fontWeight: 700,
                                  color: c.netR > 0 ? COLORS.win : c.netR < 0 ? COLORS.loss : COLORS.text.muted,
                                  textAlign: "right"
                                }}>
                                  {c.count > 0 ? `${c.netR >= 0 ? "+" : ""}${c.netR.toFixed(1)}` : "—"}
                                </div>
                              </div>
                            </GlassInset>
                          );
                        })}
                      </div>
                    </div>

                    {/* Attribution */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, marginBottom: SPACE.md, color: COLORS.text.muted, fontSize: "0.9em" }}>
                        策略归因 (Top)
                      </div>
                      <GlassPanel style={{ padding: SPACE.sm, minHeight: "200px" }}>
                        {strategyAttribution.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
                            {strategyAttribution.map((r) => (
                              <div key={`attr-${r.strategyName}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9em" }}>
                                {r.strategyPath ? (
                                  <ButtonGhost onClick={() => openFile(r.strategyPath!)} style={{ textAlign: "left", justifyContent: "flex-start", flex: 1, overflow: "hidden", textOverflow: "ellipsis", fontSize: "0.85em" }}>
                                    {r.strategyName}
                                  </ButtonGhost>
                                ) : (
                                  <span style={{ color: COLORS.text.normal, padding: "4px 8px" }}>{r.strategyName}</span>
                                )}
                                <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
                                  <span style={{ color: COLORS.text.muted, fontSize: "0.9em" }}>{r.count}笔</span>
                                  <span style={{ fontWeight: 600, color: r.netR >= 0 ? COLORS.win : COLORS.loss, minWidth: "40px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                    {r.netR >= 0 ? "+" : ""}{r.netR.toFixed(1)}R
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: COLORS.text.muted, fontSize: "0.9em", padding: SPACE.sm, textAlign: "center" }}>
                            未找到策略归因数据。
                          </div>
                        )}
                      </GlassPanel>
                    </div>
                  </div>
                </GlassCard>

                <GlassCard>
                  <HeadingM style={{ marginBottom: SPACE.lg }}>Strategy Lab</HeadingM>

                  <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
                    {/* R-Multiples */}
                    <GlassPanel>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: SPACE.md }}>
                        <Label>📈 综合趋势 (R-Multiples)</Label>
                        <div style={{ fontSize: "0.85em", color: COLORS.text.muted }}>
                          Avg R: {analyticsRMultiples.avg.toFixed(2)}
                        </div>
                      </div>

                      {/* Chart */}
                      <div style={{
                        position: "relative",
                        height: "90px",
                        width: "100%",
                        overflowX: "auto",
                        background: `rgba(var(--mono-rgb-100), 0.03)`,
                        borderRadius: "8px",
                        border: `1px solid ${COLORS.border}`
                      }}>
                        <div style={{ position: "relative", height: "90px", width: `${Math.max(analyticsRecentLiveTradesAsc.length * 12, 200)}px` }}>
                          <div style={{ position: "absolute", left: 0, right: 0, top: "45px", height: "1px", background: `rgba(var(--mono-rgb-100), 0.18)`, borderTop: `1px dashed rgba(var(--mono-rgb-100), 0.25)` }} />
                          <div style={{ position: "absolute", left: 6, top: 35, fontSize: "0.75em", color: COLORS.text.muted }}>0R</div>

                          {analyticsRecentLiveTradesAsc.length === 0 ? (
                            <div style={{ padding: "18px", color: COLORS.text.muted, fontSize: "0.9em" }}>暂无数据</div>
                          ) : (
                            analyticsRecentLiveTradesAsc.map((t, i) => {
                              const r = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
                              const rHeight = 90;
                              const rZeroY = rHeight / 2;
                              const rScale = (rHeight / 2 - 6) / Math.max(1e-6, analyticsRMultiples.maxAbs);
                              let h = Math.abs(r) * rScale;
                              if (h < 3) h = 3;
                              const top = r >= 0 ? rZeroY - h : rZeroY;
                              const color = r > 0 ? COLORS.win : r < 0 ? COLORS.loss : COLORS.text.muted;

                              return (
                                <div
                                  key={`rbar-${t.path}-${t.dateIso}-${i}`}
                                  title={`${t.dateIso} | ${t.name} | R: ${r.toFixed(2)}`}
                                  style={{
                                    position: "absolute",
                                    left: `${i * 12}px`,
                                    top: `${top}px`,
                                    width: "8px",
                                    height: `${h}px`,
                                    background: color,
                                    borderRadius: "2px",
                                    opacity: 0.9
                                  }}
                                />
                              );
                            })
                          )}
                        </div>
                      </div>
                    </GlassPanel>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: SPACE.md }}>
                      {/* Psychology */}
                      <GlassInset style={{ padding: SPACE.md }}>
                        <Label style={{ marginBottom: SPACE.sm }}>🧠 实盘心态</Label>
                        <DisplayXL color={analyticsMind.color} style={{ fontSize: "1.5rem" }}>{analyticsMind.status}</DisplayXL>
                        <div style={{ marginTop: SPACE.sm, color: COLORS.text.muted, fontSize: "0.85em" }}>
                          FOMO: {analyticsMind.fomo} | Tilt: {analyticsMind.tilt} | 犹豫: {analyticsMind.hesitation}
                        </div>
                      </GlassInset>

                      {/* Top Strategies */}
                      <GlassPanel>
                        <Label style={{ marginBottom: SPACE.sm }}>📊 热门策略</Label>
                        {analyticsTopStrats.length === 0 ? (
                          <div style={{ color: COLORS.text.muted, fontSize: "0.9em" }}>暂无数据</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
                            {analyticsTopStrats.map((s) => {
                              const color = s.wr >= 50 ? COLORS.win : s.wr >= 40 ? COLORS.backtest : COLORS.loss; // mapping rough colors using existing vars
                              let displayName = s.name;
                              if (displayName.length > 12 && displayName.includes("(")) {
                                displayName = displayName.split("(")[0].trim();
                              }
                              return (
                                <div key={`topstrat-${s.name}`} style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: "0.9em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: "4px" }} title={s.name}>{displayName}</div>
                                    <div style={{ height: "4px", borderRadius: "999px", background: `rgba(var(--mono-rgb-100), 0.05)`, overflow: "hidden" }}>
                                      <div style={{ width: `${s.wr}%`, height: "100%", background: color }} />
                                    </div>
                                  </div>
                                  <div style={{ textAlign: "right" }}>
                                    <div style={{ fontWeight: 700, color, fontSize: "0.9em", fontVariantNumeric: "tabular-nums" }}>{s.wr}%</div>
                                    <div style={{ fontSize: "0.75em", color: COLORS.text.muted }}>{s.total}笔</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </GlassPanel>
                    </div>
                  </div>
                </GlassCard>
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: SPACE.md,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    ...cardTightStyle,
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
                      <span
                        style={{
                          fontWeight: 600,
                          opacity: 0.6,
                          fontSize: "0.85em",
                        }}
                      >
                        (Capital Growth)
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: "0.85em",
                        color: "var(--text-muted)",
                        display: "flex",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
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
                      <span style={{ color: "var(--text-faint)" }}>
                        {allTradesDateRange.min && allTradesDateRange.max
                          ? `范围：${allTradesDateRange.min} → ${allTradesDateRange.max}`
                          : "范围：—"}
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
                    const zeroY =
                      pad + (1 - (0 - minVal) / range) * (h - pad * 2);

                    const getPoints = (data: number[]) => {
                      if (data.length < 2) return "";
                      const xStep = (w - pad * 2) / Math.max(1, data.length - 1);
                      return data
                        .map((val, i) => {
                          const x = pad + i * xStep;
                          const y =
                            pad + (1 - (val - minVal) / range) * (h - pad * 2);
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

                  {/* Removed embedded strategy/suggestion duplicates; keep only primary modules elsewhere. */}
                </div>

                <GlassCard>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: SPACE.lg }}>
                    <HeadingM>Review Gallery</HeadingM>
                    <label style={{ display: "flex", alignItems: "center", gap: SPACE.sm, fontSize: "0.9em", color: COLORS.text.muted }}>
                      范围
                      <select
                        value={galleryScope}
                        onChange={(e) => setGalleryScope(e.target.value as AnalyticsScope)}
                        style={{
                          background: "var(--background-primary)",
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: "4px",
                          color: "var(--text-normal)",
                          padding: "2px 8px",
                          fontSize: "inherit"
                        }}
                      >
                        <option value="All">全部</option>
                        <option value="Live">实盘</option>
                        <option value="Backtest">回测</option>
                        <option value="Demo">模拟</option>
                      </select>
                    </label>
                  </div>

                  <div style={{ fontSize: "0.8em", color: COLORS.text.muted, marginBottom: SPACE.md }}>
                    范围内共 {gallery.scopeTotal} 笔 · 候选 {gallery.candidateCount} · 展示 {gallery.items.length}
                  </div>

                  {!getResourceUrl ? (
                    <div style={{ padding: SPACE.md, color: COLORS.text.muted }}>画廊不可用 (getResourceUrl undefined).</div>
                  ) : gallery.items.length > 0 ? (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: SPACE.md }}>
                      {gallery.items.map((it) => (
                        <button
                          key={`gal-${it.tradePath}`}
                          type="button"
                          onClick={() => openFile(it.tradePath)}
                          style={{
                            display: "block",
                            position: "relative",
                            width: "100%",
                            aspectRatio: "16/9",
                            padding: 0,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: "8px",
                            overflow: "hidden",
                            cursor: "pointer",
                            background: `rgba(var(--mono-rgb-100), 0.03)`
                          }}
                        >
                          {it.url ? (
                            <>
                              <img src={it.url} alt={it.tradeName} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                              <div style={{
                                position: "absolute", top: SPACE.xs, right: SPACE.xs,
                                background: it.accountType === "Live" ? V5_COLORS.live : it.accountType === "Backtest" ? V5_COLORS.back : V5_COLORS.demo,
                                color: "rgba(0,0,0,0.9)", fontSize: "0.6em", fontWeight: 800, padding: "2px 6px", borderRadius: "4px"
                              }}>
                                {it.accountType === "Live" ? "实盘" : it.accountType === "Backtest" ? "回测" : "模拟"}
                              </div>
                              <div style={{
                                position: "absolute", left: 0, right: 0, bottom: 0,
                                padding: `${SPACE.xxl} ${SPACE.sm} ${SPACE.sm}`,
                                background: "linear-gradient(to bottom, transparent, rgba(0,0,0,0.8))",
                                display: "flex", justifyContent: "space-between", alignItems: "flex-end"
                              }}>
                                <div style={{ color: "#fff", fontSize: "0.85em", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {it.tradeName}
                                </div>
                                <div style={{ color: it.pnl >= 0 ? V5_COLORS.live : V5_COLORS.loss, fontWeight: 800, fontSize: "0.9em" }}>
                                  {it.pnl > 0 ? "+" : ""}{it.pnl.toFixed(1)}R
                                </div>
                              </div>
                            </>
                          ) : (
                            <div style={{ padding: SPACE.md, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", color: COLORS.text.muted }}>
                              <div style={{ fontSize: "0.8em" }}>无封面</div>
                              <div style={{ fontSize: "0.9em", fontWeight: 700 }}>{it.tradeName}</div>
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: SPACE.lg, textAlign: "center", color: COLORS.text.muted }}>暂无封面图片。</div>
                  )}

                  <div style={{ marginTop: SPACE.lg, paddingTop: SPACE.md, borderTop: `1px solid ${COLORS.border}`, textAlign: "center" }}>
                    <a href={gallerySearchHref} style={{ color: COLORS.accent, fontWeight: 700, textDecoration: "none", fontSize: "0.9em" }}>
                      📂 查看所有图表
                    </a>
                  </div>
                </GlassCard>
              </div>
            </div>
          </>
        ) : null
      }

      {
        activePage === "learn" ? (
          <>
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
                ...glassCardStyle,
                marginBottom: "16px",
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
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <button
                    type="button"
                    disabled={!can("srs:review-flashcards")}
                    onClick={() => action("srs:review-flashcards")}
                    onMouseEnter={onBtnMouseEnter}
                    onMouseLeave={onBtnMouseLeave}
                    onFocus={onBtnFocus}
                    onBlur={onBtnBlur}
                    style={
                      can("srs:review-flashcards")
                        ? buttonStyle
                        : disabledButtonStyle
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
                        ? buttonSmDisabledStyle
                        : buttonSmStyle
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
                        ? buttonSmDisabledStyle
                        : buttonSmStyle
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
                  SRS 插件不可用（适配器已降级）。统计仍会从 #flashcards
                  笔记计算。
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
                    const sBase =
                      (memory.cnt?.sNorm ?? 0) + (memory.cnt?.sRev ?? 0) * 2;
                    const mMulti =
                      (memory.cnt?.mNorm ?? 0) + (memory.cnt?.mRev ?? 0) * 2;
                    const cloze = memory.cnt?.cloze ?? 0;

                    const seg = (n: number) =>
                      `${Math.max(0, (n / pTotal) * 100)}%`;

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
                              background: "var(--interactive-accent)",
                              opacity: 0.55,
                            }}
                          />
                          <div
                            style={{
                              width: seg((memory.cnt?.mRev ?? 0) * 2),
                              background: "var(--interactive-accent)",
                              opacity: 0.35,
                            }}
                          />
                          <div
                            style={{
                              width: seg(memory.cnt?.cloze ?? 0),
                              background: "var(--interactive-accent)",
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
                              border:
                                "1px solid var(--background-modifier-border)",
                              borderRadius: "8px",
                              padding: "10px",
                              textAlign: "center",
                              ...glassInsetStyle,
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
                              border:
                                "1px solid var(--background-modifier-border)",
                              borderRadius: "8px",
                              padding: "10px",
                              textAlign: "center",
                              ...glassInsetStyle,
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
                              border:
                                "1px solid var(--background-modifier-border)",
                              borderRadius: "8px",
                              padding: "10px",
                              textAlign: "center",
                              ...glassInsetStyle,
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
                          ...glassInsetStyle,
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
                          <div
                            style={{
                              color: "var(--text-faint)",
                              fontSize: "0.85em",
                            }}
                          >
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
                                      ? V5_COLORS.accent
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
                      !memoryIgnoreFocus &&
                      memory.due > 0 &&
                      Boolean(memory.focusFile);

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
                        const title = String(
                          rec.data.t || rec.data.q || "推荐"
                        );
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
                        const next = Math.floor(
                          Math.random() * memory.quizPool.length
                        );
                        setMemoryShakeIndex(next);
                      } else {
                        setMemoryShakeIndex((x) => x + 1);
                      }
                    };

                    return (
                      <div
                        style={{
                          ...glassPanelStyle,
                          padding: "12px",
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
                              style={textButtonStrongStyle}
                              onMouseEnter={onTextBtnMouseEnter}
                              onMouseLeave={onTextBtnMouseLeave}
                              onFocus={onTextBtnFocus}
                              onBlur={onTextBtnBlur}
                            >
                              {String(rec.title)}
                            </button>
                          </div>
                          <div
                            style={{
                              color: "var(--text-faint)",
                              fontSize: "0.85em",
                            }}
                          >
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
                          style={buttonSmStyle}
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
                        style={textButtonSemiboldStyle}
                        onMouseEnter={onTextBtnMouseEnter}
                        onMouseLeave={onTextBtnMouseLeave}
                        onFocus={onTextBtnFocus}
                        onBlur={onTextBtnBlur}
                      >
                        {memory.focusFile.name.replace(/\.md$/i, "")}
                      </button>
                      <span
                        style={{ marginLeft: "8px", color: "var(--text-faint)" }}
                      >
                        到期: {memory.focusFile.due} | 易度:{" "}
                        {memory.focusFile.avgEase}
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
                    <div
                      style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
                    >
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
                ...glassCardStyle,
                marginBottom: "16px",
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
                      ? buttonSmDisabledStyle
                      : buttonSmStyle
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
                            ...glassPanelStyle,
                            padding: "12px",
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
                                  style={textButtonSemiboldStyle}
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
                              笔记:{" "}
                              <strong>{link ? "已创建" : "未创建"}</strong>
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
                        <div
                          key={`ph-${ph.phase}`}
                          style={{ marginBottom: "12px" }}
                        >
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
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "6px",
                            }}
                          >
                            {ph.items.map((c) => {
                              const bg = c.isDone
                                ? V5_COLORS.win
                                : c.hasNote
                                  ? V5_COLORS.accent
                                  : "rgba(var(--mono-rgb-100), 0.06)";
                              const fg = c.isDone
                                ? "var(--background-primary)"
                                : c.hasNote
                                  ? "var(--background-primary)"
                                  : "var(--text-faint)";
                              const title = `${c.item.id}: ${String(
                                c.item.t ?? ""
                              )}`;
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
                  课程数据不可用。请检查 PA_Syllabus_Data.md 与 #PA/Course
                  相关笔记。
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
                  {" "}
                  （作战手册/Playbook）
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

              {(() => {
                const cycle = (todayMarketCycle ?? "").trim();
                if (!cycle) {
                  return (
                    <div
                      style={{
                        margin: "-6px 0 10px 0",
                        padding: "10px 12px",
                        background: "rgba(var(--mono-rgb-100), 0.03)",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        color: "var(--text-faint)",
                        fontSize: "0.9em",
                      }}
                    >
                      今日市场周期未设置（可在 今日/Today 里补充）。
                    </div>
                  );
                }

                const isActive = (statusRaw: unknown) => {
                  const s = typeof statusRaw === "string" ? statusRaw.trim() : "";
                  if (!s) return false;
                  return s.includes("实战") || s.toLowerCase().includes("active");
                };

                const picks = matchStrategies(strategyIndex, {
                  marketCycle: cycle,
                  limit: 6,
                }).filter((s) => isActive((s as any).statusRaw));

                return (
                  <div
                    style={{
                      margin: "-6px 0 10px 0",
                      padding: "10px 12px",
                      background: "rgba(var(--mono-rgb-100), 0.03)",
                      border: "1px solid var(--background-modifier-border)",
                      borderRadius: "8px",
                    }}
                  >
                    <div
                      style={{ fontWeight: 700, opacity: 0.75, marginBottom: 6 }}
                    >
                      🌊 今日市场周期：{" "}
                      <span
                        style={{ color: "var(--text-accent)", fontWeight: 800 }}
                      >
                        {cycle}
                      </span>
                    </div>
                    <div
                      style={{ fontSize: "0.85em", color: "var(--text-muted)" }}
                    >
                      {picks.length > 0 ? (
                        <>
                          推荐优先关注：{" "}
                          {picks.map((s, idx) => (
                            <React.Fragment key={`pb-pick-${s.path}`}>
                              {idx > 0 ? " · " : ""}
                              <button
                                type="button"
                                onClick={() => openFile(s.path)}
                                style={textButtonNoWrapStyle}
                                onMouseEnter={onTextBtnMouseEnter}
                                onMouseLeave={onTextBtnMouseLeave}
                                onFocus={onTextBtnFocus}
                                onBlur={onTextBtnBlur}
                              >
                                {String(s.canonicalName || s.name)}
                              </button>
                            </React.Fragment>
                          ))}
                        </>
                      ) : (
                        "暂无匹配的实战策略（可在策略卡片里补充状态/周期）。"
                      )}
                    </div>
                  </div>
                );
              })()}

              <div style={{ marginTop: "10px" }}>
                <StrategyList
                  strategies={strategies}
                  onOpenFile={openFile}
                  perf={strategyPerf}
                  showTitle={false}
                  showControls={false}
                />
              </div>

              <div
                style={{
                  marginTop: "16px",
                  paddingTop: "12px",
                  borderTop: "1px solid var(--background-modifier-border)",
                }}
              >
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {(() => {
                    const quickPath =
                      "策略仓库 (Strategy Repository)/太妃方案/太妃方案.md";
                    return (
                      <button
                        type="button"
                        onClick={() => openFile(quickPath)}
                        style={{
                          padding: "4px 10px",
                          borderRadius: "6px",
                          border: "1px solid var(--background-modifier-border)",
                          background: "rgba(var(--mono-rgb-100), 0.03)",
                          color: "var(--text-accent)",
                          cursor: "pointer",
                          fontSize: "0.85em",
                          fontWeight: 700,
                        }}
                      >
                        📚 作战手册（Brooks Playbook）
                      </button>
                    );
                  })()}

                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: "6px",
                      border: "1px solid var(--background-modifier-border)",
                      background: "rgba(var(--mono-rgb-100), 0.03)",
                      color: "var(--text-muted)",
                      fontSize: "0.85em",
                      fontWeight: 700,
                    }}
                  >
                    📖 Al Brooks经典（即将推出）
                  </span>
                </div>
              </div>

              <div
                style={{
                  marginTop: "20px",
                  paddingTop: "15px",
                  borderTop: "1px solid var(--background-modifier-border)",
                }}
              >
                <div
                  style={{ fontWeight: 700, opacity: 0.7, marginBottom: "10px" }}
                >
                  🏆 实战表现 (Performance)
                </div>

                {playbookPerfRows.length === 0 ? (
                  <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                    暂无可用的策略表现统计（需要交易记录与策略归因）。
                  </div>
                ) : (
                  <div
                    style={{
                      border: "1px solid var(--background-modifier-border)",
                      borderRadius: "8px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 72px 88px 60px",
                        gap: "0px",
                        padding: "8px 10px",
                        borderBottom:
                          "1px solid var(--background-modifier-border)",
                        color: "var(--text-muted)",
                        fontSize: "0.85em",
                        fontWeight: 700,
                      }}
                    >
                      <div>策略</div>
                      <div>胜率</div>
                      <div>盈亏</div>
                      <div>次数</div>
                    </div>

                    {playbookPerfRows.map((r) => {
                      const pnlColor =
                        r.pnl > 0
                          ? V5_COLORS.win
                          : r.pnl < 0
                            ? V5_COLORS.loss
                            : "var(--text-muted)";

                      return (
                        <div
                          key={`pb-perf-${r.canonical}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 72px 88px 60px",
                            padding: "8px 10px",
                            borderBottom:
                              "1px solid var(--background-modifier-border)",
                            fontSize: "0.9em",
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {r.path ? (
                              <button
                                type="button"
                                onClick={() => openFile(r.path!)}
                                style={textButtonStyle}
                                onMouseEnter={onTextBtnMouseEnter}
                                onMouseLeave={onTextBtnMouseLeave}
                                onFocus={onTextBtnFocus}
                                onBlur={onTextBtnBlur}
                              >
                                {r.canonical}
                              </button>
                            ) : (
                              <span>{r.canonical}</span>
                            )}
                          </div>
                          <div style={{ fontVariantNumeric: "tabular-nums" }}>
                            {r.winRate}%
                          </div>
                          <div
                            style={{
                              color: pnlColor,
                              fontWeight: 800,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {r.pnl > 0 ? "+" : ""}
                            {Math.round(r.pnl)}
                          </div>
                          <div style={{ fontVariantNumeric: "tabular-nums" }}>
                            {r.total}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Gallery is rendered in the Analytics grid (with scope selector). */}
          </>
        ) : null
      }

      {
        activePage === "manage" ? (
          <>
            <div
              style={{
                margin: `${SPACE.xxl} 0 ${SPACE.sm}`,
                paddingBottom: SPACE.xs,
                borderBottom: "1px solid var(--background-modifier-border)",
                display: "flex",
                alignItems: "baseline",
                gap: SPACE.sm,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 700 }}>📉 管理模块</div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                管理（Management）
              </div>
            </div>

            <div style={{ ...glassCardStyle, marginBottom: SPACE.xl }}>
              {(() => {
                const issueCount = schemaIssues.length;
                const healthScore = Math.max(0, 100 - issueCount * 5);
                const healthColor =
                  healthScore > 90
                    ? V5_COLORS.win
                    : healthScore > 60
                      ? V5_COLORS.back
                      : V5_COLORS.loss;
                const files = paTagSnapshot?.files ?? 0;
                const tags = paTagSnapshot
                  ? Object.keys(paTagSnapshot.tagMap).length
                  : 0;

                const issueByType = new Map<string, number>();
                for (const it of schemaIssues) {
                  const k = (it.type ?? "未知").toString();
                  issueByType.set(k, (issueByType.get(k) ?? 0) + 1);
                }
                const topTypes = [...issueByType.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 8);

                const topTags = paTagSnapshot
                  ? Object.entries(paTagSnapshot.tagMap)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 60)
                  : [];

                const hasCJK = (str: string) => /[\u4e00-\u9fff]/.test(str);

                const prettySchemaVal = (val?: string) => {
                  let s = (val ?? "").toString().trim();
                  if (!s) return "";
                  const low = s.toLowerCase();
                  if (s === "Unknown" || low === "unknown") return "未知/Unknown";
                  if (s === "Empty" || low === "empty") return "空/Empty";
                  if (low === "null") return "空/null";

                  // 中文(English) -> 中文/English
                  if (s.includes("(") && s.endsWith(")")) {
                    const parts = s.split("(");
                    const cn = (parts[0] || "").trim();
                    const en = parts
                      .slice(1)
                      .join("(")
                      .replace(/\)\s*$/, "")
                      .trim();
                    if (cn && en) return `${cn}/${en}`;
                    if (cn) return cn;
                    if (en) return `待补充/${en}`;
                  }

                  // 已是 pair，尽量保证中文在左
                  if (s.includes("/")) {
                    const parts = s.split("/");
                    const left = (parts[0] || "").trim();
                    const right = parts.slice(1).join("/").trim();
                    if (hasCJK(left)) return s;
                    if (hasCJK(right)) return `${right}/${left}`;
                    return `待补充/${s}`;
                  }

                  if (!hasCJK(s) && /[a-zA-Z]/.test(s)) return `待补充/${s}`;
                  return s;
                };

                const prettyExecVal = (val?: string) => {
                  const s0 = (val ?? "").toString().trim();
                  if (!s0) return "未知/Unknown";
                  const low = s0.toLowerCase();
                  if (low.includes("unknown") || low === "null")
                    return "未知/Unknown";
                  if (low.includes("perfect") || s0.includes("完美"))
                    return "🟢 完美";
                  if (low.includes("fomo") || s0.includes("FOMO"))
                    return "🔴 FOMO";
                  if (low.includes("tight") || s0.includes("止损太紧"))
                    return "🔴 止损太紧";
                  if (low.includes("scratch") || s0.includes("主动"))
                    return "🟡 主动离场";
                  if (
                    low.includes("normal") ||
                    low.includes("none") ||
                    s0.includes("正常")
                  )
                    return "🟢 正常";
                  return prettySchemaVal(s0) || "未知/Unknown";
                };

                const topN = (
                  getter: (t: TradeRecord) => string | undefined,
                  pretty?: (v?: string) => string
                ) => {
                  const map = new Map<string, number>();
                  for (const t of trades) {
                    const raw = getter(t);
                    const base = (raw ?? "").toString().trim();
                    const v = (pretty ? pretty(base) : base) || "Unknown";
                    if (!v) continue;
                    map.set(v, (map.get(v) ?? 0) + 1);
                  }
                  return [...map.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5);
                };

                const distTicker = topN((t) => t.ticker, prettySchemaVal);
                // “Setup” 分布优先看 setupKey（v5/legacy 的 setup/setupKey），并兼容 setupCategory。
                const distSetup = topN(
                  (t) => t.setupKey ?? t.setupCategory,
                  prettySchemaVal
                );
                const distExec = topN((t) => t.executionQuality, prettyExecVal);

                const sortedRecent = [...trades]
                  .sort((a, b) =>
                    a.dateIso < b.dateIso ? 1 : a.dateIso > b.dateIso ? -1 : 0
                  )
                  .slice(0, 15);

                return (
                  <div style={{ marginBottom: SPACE.md }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: SPACE.md,
                        marginBottom: SPACE.md,
                      }}
                    >
                      <div style={glassPanelStyle}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: SPACE.md,
                            marginBottom: SPACE.sm,
                          }}
                        >
                          <div style={{ fontWeight: 800, color: healthColor }}>
                            ❤️ 系统健康度：{healthScore}
                          </div>
                          <div style={{ color: "var(--text-muted)" }}>
                            待修异常：{issueCount}
                          </div>
                        </div>

                        {topTypes.length ? (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: `${SPACE.xs} ${SPACE.xl}`,
                              fontSize: "0.9em",
                            }}
                          >
                            {topTypes.map(([t, c]) => (
                              <div
                                key={t}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: SPACE.md,
                                  color: "var(--text-muted)",
                                }}
                              >
                                <span
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={t}
                                >
                                  {t}
                                </span>
                                <span
                                  style={{
                                    fontVariantNumeric: "tabular-nums",
                                  }}
                                >
                                  {c}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ color: V5_COLORS.win }}>
                            ✅ 系统非常健康（All Clear）
                          </div>
                        )}
                      </div>

                      <div style={glassPanelStyle}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: SPACE.md,
                            marginBottom: SPACE.sm,
                          }}
                        >
                          <div style={{ fontWeight: 800 }}>🧠 系统诊断</div>
                          <div style={{ color: "var(--text-muted)" }}>
                            {schemaScanNote ? "已扫描" : "未扫描"}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: `${SPACE.xs} ${SPACE.xl}`,
                            fontSize: "0.9em",
                            color: "var(--text-muted)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: SPACE.md,
                            }}
                          >
                            <span>枚举预设</span>
                            <span>{enumPresets ? "✅ 已加载" : "—"}</span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: SPACE.md,
                            }}
                          >
                            <span>标签扫描</span>
                            <span>{paTagSnapshot ? "✅ 正常" : "—"}</span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: SPACE.md,
                            }}
                          >
                            <span>交易记录</span>
                            <span>{trades.length}</span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "10px",
                            }}
                          >
                            <span>笔记档案</span>
                            <span>{files}</span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "10px",
                            }}
                          >
                            <span>标签总数</span>
                            <span>{tags}</span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "10px",
                            }}
                          >
                            <span>属性管理器</span>
                            <span>✅ 可用</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ ...glassCardStyle, marginBottom: "10px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: "10px",
                          marginBottom: "8px",
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>⚠️ 异常详情</div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                          }}
                        >
                          {issueCount}
                        </div>
                      </div>

                      {schemaIssues.length === 0 ? (
                        <div
                          style={{
                            color: V5_COLORS.win,
                            fontSize: "0.9em",
                          }}
                        >
                          ✅ 无异常
                        </div>
                      ) : (
                        <div
                          style={{
                            ...glassPanelStyle,
                            maxHeight: "260px",
                            overflow: "auto",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "2fr 1fr 1fr",
                              gap: "10px",
                              padding: "8px",
                              borderBottom: "1px solid var(--background-modifier-border)",
                              color: "var(--text-faint)",
                              fontSize: "0.85em",
                              background: "transparent",
                            }}
                          >
                            <div>文件</div>
                            <div>问题</div>
                            <div>字段</div>
                          </div>
                          {schemaIssues.slice(0, 80).map((item, idx) => (
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
                                padding: 0,
                                border: "none",
                                borderBottom:
                                  "1px solid var(--background-modifier-border)",
                                background: "transparent",
                                cursor: "pointer",
                                outline: "none",
                              }}
                            >
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "2fr 1fr 1fr",
                                  gap: "10px",
                                  padding: "10px",
                                  alignItems: "baseline",
                                }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontWeight: 650,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {item.name}
                                  </div>
                                  <div
                                    style={{
                                      color: "var(--text-faint)",
                                      fontSize: "0.85em",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {item.path}
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
                                <div
                                  style={{
                                    color: "var(--text-muted)",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                  title={item.key}
                                >
                                  {item.key}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        ...glassPanelStyle,
                        marginBottom: "12px",
                      }}
                    >
                      <details>
                        <summary
                          style={{
                            cursor: "pointer",
                            fontWeight: 800,
                            listStyle: "none",
                          }}
                        >
                          📊 分布摘要（可展开）
                          <span
                            style={{
                              marginLeft: "10px",
                              color: "var(--text-faint)",
                              fontSize: "0.9em",
                              fontWeight: 600,
                            }}
                          >
                            完整图像建议看 Schema
                          </span>
                        </summary>

                        <div style={{ marginTop: "10px" }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr 1fr",
                              gap: "10px",
                              marginBottom: "10px",
                            }}
                          >
                            {[
                              { title: "Ticker", data: distTicker },
                              { title: "Setup", data: distSetup },
                              { title: "Exec", data: distExec },
                            ].map((col) => (
                              <div
                                key={col.title}
                                style={{
                                  border:
                                    "1px solid var(--background-modifier-border)",
                                  borderRadius: "10px",
                                  padding: "10px",
                                  background: "var(--background-primary)",
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 700,
                                    marginBottom: "8px",
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
                                  <div style={{ display: "grid", gap: "6px" }}>
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
                                        <div
                                          style={{
                                            color: "var(--text-muted)",
                                            fontVariantNumeric: "tabular-nums",
                                          }}
                                        >
                                          {v}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>

                          <div
                            style={{
                              border:
                                "1px solid var(--background-modifier-border)",
                              borderRadius: "10px",
                              padding: "10px",
                              background: "var(--background-primary)",
                            }}
                          >
                            <div style={{ fontWeight: 800, marginBottom: "8px" }}>
                              🏷️ 标签全景（Tag System）
                            </div>
                            {!paTagSnapshot ? (
                              <div
                                style={{
                                  color: "var(--text-faint)",
                                  fontSize: "0.9em",
                                }}
                              >
                                标签扫描不可用。
                              </div>
                            ) : (
                              <div
                                style={{
                                  display: "flex",
                                  flexWrap: "wrap",
                                  gap: "6px",
                                }}
                              >
                                {topTags.map(([tag, count]) => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => openGlobalSearch(`tag:${tag}`)}
                                    onMouseEnter={onTextBtnMouseEnter}
                                    onMouseLeave={onTextBtnMouseLeave}
                                    onFocus={onTextBtnFocus}
                                    onBlur={onTextBtnBlur}
                                    style={{
                                      padding: "2px 8px",
                                      borderRadius: "999px",
                                      border:
                                        "1px solid var(--background-modifier-border)",
                                      background: "var(--background-primary)",
                                      fontSize: "0.85em",
                                      color: "var(--text-muted)",
                                      cursor: "pointer",
                                    }}
                                  >
                                    #{tag} ({count})
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </details>
                    </div>

                    <div
                      style={{
                        ...glassCardStyle,
                        marginBottom: "12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          gap: "10px",
                          marginBottom: "10px",
                        }}
                      >
                        <div style={{ fontWeight: 800 }}>
                          📄 原始数据明细（Raw Data）
                        </div>
                        <div
                          style={{
                            color: "var(--text-faint)",
                            fontSize: "0.9em",
                          }}
                        >
                          最近 {sortedRecent.length} 笔
                        </div>
                      </div>

                      <div
                        style={{
                          ...glassPanelStyle,
                          overflow: "auto",
                          maxHeight: "260px",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "90px 110px 120px 1fr 100px 120px",
                            gap: "10px",
                            padding: "10px",
                            borderBottom:
                              "1px solid var(--background-modifier-border)",
                            color: "var(--text-faint)",
                            fontSize: "0.85em",
                            background: "var(--background-primary)",
                          }}
                        >
                          <div>日期</div>
                          <div>品种</div>
                          <div>周期</div>
                          <div>策略</div>
                          <div>结果</div>
                          <div>执行</div>
                        </div>

                        {sortedRecent.map((t) => (
                          <button
                            key={t.path}
                            type="button"
                            onClick={() => openFile(t.path)}
                            title={t.path}
                            onMouseEnter={onTextBtnMouseEnter}
                            onMouseLeave={onTextBtnMouseLeave}
                            onFocus={onTextBtnFocus}
                            onBlur={onTextBtnBlur}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: 0,
                              border: "none",
                              borderBottom:
                                "1px solid var(--background-modifier-border)",
                              background: "transparent",
                              cursor: "pointer",
                              outline: "none",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "90px 110px 120px 1fr 100px 120px",
                                gap: "10px",
                                padding: "10px",
                                alignItems: "baseline",
                                fontSize: "0.9em",
                              }}
                            >
                              <div style={{ color: "var(--text-muted)" }}>
                                {t.dateIso}
                              </div>
                              <div style={{ fontWeight: 650 }}>
                                {t.ticker ?? "—"}
                              </div>
                              <div style={{ color: "var(--text-muted)" }}>
                                {t.timeframe ?? "—"}
                              </div>
                              <div
                                style={{
                                  color: "var(--text-muted)",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={t.setupKey ?? t.setupCategory ?? ""}
                              >
                                {prettySchemaVal(t.setupKey ?? t.setupCategory) ||
                                  "—"}
                              </div>
                              <div style={{ color: "var(--text-muted)" }}>
                                {t.outcome ?? "unknown"}
                              </div>
                              <div style={{ color: "var(--text-muted)" }}>
                                {prettyExecVal(t.executionQuality) || "—"}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: SPACE.md,
                        marginBottom: SPACE.md,
                      }}
                    >
                      {[
                        {
                          title: "系统健康度",
                          value: String(healthScore),
                          color: healthColor,
                        },
                        {
                          title: "待修异常",
                          value: String(issueCount),
                          color:
                            issueCount > 0 ? COLORS.loss : COLORS.text.muted,
                        },
                        {
                          title: "标签总数",
                          value: String(tags),
                          color: COLORS.accent,
                        },
                        {
                          title: "笔记档案",
                          value: String(files),
                          color: COLORS.accent,
                        },
                      ].map((c) => (
                        <GlassPanel key={c.title} style={{ textAlign: "center" }}>
                          <div style={{ color: COLORS.text.muted, fontSize: "0.9em", marginBottom: SPACE.xs }}>
                            {c.title}
                          </div>
                          <DisplayXL style={{ color: c.color }}>
                            {c.value}
                          </DisplayXL>
                        </GlassPanel>
                      ))}
                    </div>

                    <GlassPanel style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: SPACE.md }}>
                      <div style={{ fontWeight: 800, color: healthColor, display: "flex", alignItems: "center", gap: SPACE.md }}>
                        <span>{issueCount === 0 ? "✅ 系统非常健康" : "⚠️ 系统需要修复"}</span>
                        <StatusBadge
                          label={issueCount === 0 ? "AI Clear" : "Needs Attention"}
                          tone={issueCount === 0 ? "success" : "warn"}
                        />
                      </div>
                      <div style={{ color: COLORS.text.muted, fontSize: "0.9em" }}>
                        {issueCount === 0
                          ? "所有关键属性已规范填写"
                          : "建议优先处理异常详情中的缺失字段"}
                      </div>
                    </GlassPanel>

                    <details style={{ marginTop: "12px" }}>
                      <summary
                        style={{
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          fontWeight: 700,
                        }}
                      >
                        🔎 检查器（Inspector）与修复方案预览（可展开）
                      </summary>

                      <div style={{ marginTop: "12px" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: "12px",
                            marginBottom: "8px",
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>检查器问题列表</div>
                          <ButtonGhost
                            onClick={() => setShowFixPlan((v) => !v)}
                            disabled={!enumPresets}
                            title={
                              !enumPresets ? "枚举预设不可用" : "切换修复方案预览"
                            }
                          >
                            {showFixPlan ? "隐藏修复方案" : "显示修复方案"}
                          </ButtonGhost>
                        </div>

                        <div
                          style={{
                            color: "var(--text-faint)",
                            fontSize: "0.9em",
                            marginBottom: "10px",
                          }}
                        >
                          只读：仅报告问题；修复方案（FixPlan）仅预览（不会写入
                          vault）。
                          <span style={{ marginLeft: "8px" }}>
                            枚举预设：{enumPresets ? "已加载" : "不可用"}
                          </span>
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
                              <div style={{ color: V5_COLORS.loss }}>
                                错误：{errorCount}
                              </div>
                              <div style={{ color: V5_COLORS.back }}>
                                警告：{warnCount}
                              </div>
                              <div style={{ color: "var(--text-muted)" }}>
                                总计：{inspectorIssues.length}
                              </div>
                            </div>
                          );
                        })()}

                        {inspectorIssues.length === 0 ? (
                          <div
                            style={{
                              color: "var(--text-faint)",
                              fontSize: "0.9em",
                            }}
                          >
                            未发现问题。
                          </div>
                        ) : (
                          <div
                            style={{
                              ...glassPanelStyle,
                              maxHeight: "240px",
                              overflow: "auto",
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
                                      width: "60px",
                                      color:
                                        issue.severity === "error"
                                          ? V5_COLORS.loss
                                          : V5_COLORS.back,
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
                                    <div style={{ fontWeight: 600 }}>
                                      {issue.title}
                                    </div>
                                    <div
                                      style={{
                                        color: "var(--text-faint)",
                                        fontSize: "0.85em",
                                      }}
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

                        {showFixPlan && enumPresets ? (
                          <div style={{ marginTop: "12px" }}>
                            <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                              修复方案预览（FixPlan）
                            </div>
                            <pre
                              style={{
                                ...glassPanelStyle,
                                margin: 0,
                                padding: "10px",
                                maxHeight: "220px",
                                overflow: "auto",
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {fixPlanText ?? ""}
                            </pre>
                          </div>
                        ) : !enumPresets ? (
                          <div
                            style={{
                              marginTop: "12px",
                              color: "var(--text-faint)",
                              fontSize: "0.9em",
                            }}
                          >
                            枚举预设不可用，已禁用修复方案生成。
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </div>
                );
              })()}
            </div>

            <GlassCard style={{ marginBottom: SPACE.lg }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: SPACE.md,
                  marginBottom: SPACE.md,
                }}
              >
                <HeadingM>💎 上帝模式（属性管理器）</HeadingM>
                <div
                  style={{ display: "flex", alignItems: "center", gap: SPACE.sm }}
                >
                  <ButtonPrimary
                    onClick={async () => {
                      setManagerBusy(true);
                      try {
                        await scanManagerInventory();
                      } finally {
                        setManagerBusy(false);
                      }
                    }}
                    disabled={managerBusy}
                    style={{ padding: "6px 16px" }}
                  >
                    扫描属性 (v5.0)
                  </ButtonPrimary>
                </div>
              </div>
              <div style={{ marginTop: SPACE.md }}>
                <GlassPanel style={{ padding: SPACE.md }}>
                  {managerTradeInventory || managerStrategyInventory ? (
                    <>
                      <input
                        value={managerSearch}
                        onChange={(e) => setManagerSearch(e.target.value)}
                        placeholder="🔍 搜索属性..."
                        style={{
                          width: "100%",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          border: `1px solid ${COLORS.border}`,
                          background: "rgba(0,0,0,0.2)",
                          color: COLORS.text.normal,
                          marginBottom: SPACE.md,
                          fontSize: "1rem"
                        }}
                      />

                      {(() => {
                        const q = managerSearch.trim().toLowerCase();

                        const canonicalizeSearch = (s: string) => {
                          const raw = (s ?? "").toString().trim();
                          if (!raw) return "";
                          const low = raw.toLowerCase();
                          if (low === "n/a" || low === "na") return "unknown";
                          if (low.includes("unknown") || raw.includes("未知"))
                            return "unknown";
                          if (low === "null" || raw.includes("空/null"))
                            return "null";
                          if (
                            low.includes("empty") ||
                            raw === "空" ||
                            raw.includes("空/empty")
                          )
                            return "empty";
                          return low;
                        };

                        const qCanon = canonicalizeSearch(q);

                        const groups = MANAGER_GROUPS;
                        const othersTitle = "📂 其他属性 (Other)";

                        const prettyVal = (val: string) => {
                          let s = (val ?? "").toString().trim();
                          if (!s) return "";
                          const low = s.toLowerCase();
                          if (s === "Unknown" || low === "unknown")
                            return "未知/Unknown";
                          if (s === "Empty" || low === "empty") return "空/Empty";
                          if (low === "null") return "空/null";
                          return s;
                        };

                        const matchKeyToGroup = (key: string) => {
                          const tokens = managerKeyTokens(key);
                          for (const g of groups) {
                            for (const kw of g.keywords) {
                              const needle = String(kw ?? "")
                                .trim()
                                .toLowerCase();
                              if (!needle) continue;
                              if (
                                tokens.some(
                                  (t) => t === needle || t.includes(needle)
                                )
                              ) {
                                return g.title;
                              }
                            }
                          }
                          return othersTitle;
                        };

                        const renderInventoryGrid = (
                          inv: FrontmatterInventory | undefined,
                          scope: "trade" | "strategy",
                          title: string
                        ) => {
                          if (!inv) return null;

                          const matchesSearch = (key: string) => {
                            if (!q) return true;
                            const kl = key.toLowerCase();
                            if (kl.includes(q)) return true;
                            if (qCanon && canonicalizeSearch(kl).includes(qCanon))
                              return true;
                            const vals = Object.keys(inv.valPaths[key] ?? {});
                            return vals.some((v) => {
                              const vl = v.toLowerCase();
                              if (vl.includes(q)) return true;
                              if (!qCanon) return false;
                              return canonicalizeSearch(vl).includes(qCanon);
                            });
                          };

                          const bucketed = new Map<string, string[]>();
                          for (const g of groups) bucketed.set(g.title, []);
                          bucketed.set(othersTitle, []);

                          const visibleKeys = inv.keys
                            .map((k) => k.key)
                            .filter((k) => matchesSearch(k));

                          for (const key of visibleKeys) {
                            const g = matchKeyToGroup(key);
                            bucketed.get(g)!.push(key);
                          }

                          const groupEntries: Array<{
                            name: string;
                            keys: string[];
                          }> = [
                            {
                              name: groups[0]?.title ?? "",
                              keys: bucketed.get(groups[0]?.title ?? "") ?? [],
                            },
                            {
                              name: groups[1]?.title ?? "",
                              keys: bucketed.get(groups[1]?.title ?? "") ?? [],
                            },
                            {
                              name: groups[2]?.title ?? "",
                              keys: bucketed.get(groups[2]?.title ?? "") ?? [],
                            },
                            {
                              name: othersTitle,
                              keys: bucketed.get(othersTitle) ?? [],
                            },
                          ].filter((x) => x.name && x.keys.length > 0);

                          return (
                            <div style={{ marginBottom: "14px" }}>
                              <div style={{ fontWeight: 700, margin: "8px 0" }}>
                                {title}
                              </div>
                              {groupEntries.length === 0 ? (
                                <div
                                  style={{
                                    color: "var(--text-faint)",
                                    fontSize: "0.9em",
                                  }}
                                >
                                  无匹配属性。
                                </div>
                              ) : (
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "repeat(auto-fit, minmax(240px, 1fr))",
                                    gap: SPACE.md,
                                  }}
                                >
                                  {groupEntries.map((g) => (
                                    <GlassPanel
                                      key={`${scope}:${g.name}`}
                                      style={{
                                        padding: "10px",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: SPACE.sm,
                                      }}
                                    >
                                      <div
                                        style={{
                                          fontWeight: 700,
                                          marginBottom: "4px",
                                          color: COLORS.text.muted,
                                          fontSize: "0.9em",
                                          paddingLeft: "4px"
                                        }}
                                      >
                                        {g.name}
                                      </div>
                                      <div
                                        style={{ display: "grid", gap: "6px" }}
                                      >
                                        {g.keys.slice(0, 18).map((key) => {
                                          const countFiles = (
                                            inv.keyPaths[key] ?? []
                                          ).length;
                                          const vals = Object.keys(
                                            inv.valPaths[key] ?? {}
                                          );
                                          const topVals = vals
                                            .map((v) => ({
                                              v,
                                              c: (inv.valPaths[key]?.[v] ?? [])
                                                .length,
                                            }))
                                            .sort((a, b) => b.c - a.c)
                                            .slice(0, 2);
                                          return (
                                            <button
                                              key={`${scope}:${key}`}
                                              type="button"
                                              onClick={() => {
                                                setManagerScope(scope);
                                                setManagerInspectorKey(key);
                                                setManagerInspectorTab("vals");
                                                setManagerInspectorFileFilter(
                                                  undefined
                                                );
                                              }}
                                              onMouseEnter={onBtnMouseEnter}
                                              onMouseLeave={onBtnMouseLeave}
                                              onFocus={onBtnFocus}
                                              onBlur={onBtnBlur}
                                              style={{
                                                border: `1px solid ${COLORS.border}`,
                                                borderRadius: "10px",
                                                padding: "10px",
                                                background: "rgba(255,255,255,0.03)",
                                                cursor: "pointer",
                                                width: "100%",
                                                textAlign: "left",
                                                transition: "all 0.2s ease"
                                              }}
                                            >
                                              <div
                                                style={{
                                                  fontWeight: 650,
                                                  display: "flex",
                                                  justifyContent: "space-between",
                                                  gap: "8px",
                                                  color: COLORS.text.normal,
                                                  marginBottom: "6px"
                                                }}
                                              >
                                                <span>{key}</span>
                                                <span
                                                  style={{
                                                    fontSize: "0.85em",
                                                    color: COLORS.text.muted,
                                                    background: "rgba(0,0,0,0.2)",
                                                    padding: "2px 6px",
                                                    borderRadius: "4px"
                                                  }}
                                                >
                                                  {countFiles}
                                                </span>
                                              </div>
                                              <div
                                                style={{
                                                  fontSize: "0.85em",
                                                  color: COLORS.text.faint,
                                                  display: "flex",
                                                  gap: "6px",
                                                  flexWrap: "wrap",
                                                  lineHeight: 1.3
                                                }}
                                              >
                                                {topVals.map((tv) => (
                                                  <span
                                                    key={tv.v}
                                                    style={{
                                                      background: "rgba(255,255,255,0.1)",
                                                      padding: "1px 5px",
                                                      borderRadius: "4px",
                                                    }}
                                                  >
                                                    {prettyVal(tv.v)} ({tv.c})
                                                  </span>
                                                ))}
                                                {vals.length > 2 ? (
                                                  <span>...</span>
                                                ) : null}
                                                {vals.length === 0 ? <span>(无值)</span> : null}
                                              </div>
                                            </button>);
                                        })}

                                        {g.keys.length > 18 ? (
                                          <div
                                            style={{ color: "var(--text-faint)" }}
                                          >
                                            还有 {g.keys.length - 18} 个…
                                          </div>
                                        ) : null}
                                      </div>
                                    </GlassPanel>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        };

                        return (
                          <>
                            {renderInventoryGrid(
                              managerTradeInventory,
                              "trade",
                              "📂 属性列表"
                            )}
                          </>
                        );
                      })()}

                      {managerInspectorKey
                        ? (() => {
                          const inv =
                            managerScope === "strategy"
                              ? managerStrategyInventory
                              : managerTradeInventory;
                          const key = managerInspectorKey;
                          if (!inv) return null;

                          const selectManagerFiles =
                            managerScope === "strategy"
                              ? selectManagerStrategyFiles
                              : selectManagerTradeFiles;

                          const allPaths = inv.keyPaths[key] ?? [];
                          const perVal = inv.valPaths[key] ?? {};
                          const sortedVals = Object.entries(perVal).sort(
                            (a, b) => (b[1]?.length ?? 0) - (a[1]?.length ?? 0)
                          );
                          const currentPaths =
                            managerInspectorFileFilter?.paths ?? allPaths;
                          const filterLabel = managerInspectorFileFilter?.label;

                          const prettyManagerVal = (val: string) => {
                            let s = (val ?? "").toString().trim();
                            if (!s) return "";
                            const low = s.toLowerCase();
                            if (s === "Unknown" || low === "unknown")
                              return "未知/Unknown";
                            if (s === "Empty" || low === "empty")
                              return "空/Empty";
                            if (low === "null") return "空/null";
                            return s;
                          };

                          const close = () => {
                            setManagerInspectorKey(undefined);
                            setManagerInspectorTab("vals");
                            setManagerInspectorFileFilter(undefined);
                          };

                          const doRenameKey = async () => {
                            const n =
                              (await promptText?.({
                                title: `重命名 ${key}`,
                                defaultValue: key,
                                placeholder: "输入新属性名",
                                okText: "重命名",
                                cancelText: "取消",
                              })) ?? "";
                            const nextKey = n.trim();
                            if (!nextKey || nextKey === key) return;
                            const ok =
                              (await confirmDialog?.({
                                title: "确认重命名",
                                message: `将属性\n${key}\n重命名为\n${nextKey}`,
                                okText: "确认",
                                cancelText: "取消",
                              })) ?? false;
                            if (!ok) return;
                            const plan = buildRenameKeyPlan(
                              selectManagerFiles(allPaths),
                              key,
                              nextKey,
                              { overwrite: true }
                            );
                            await runManagerPlan(plan, {
                              closeInspector: true,
                              forceDeleteKeys: true,
                              refreshInventory: true,
                            });
                          };

                          const doDeleteKey = async () => {
                            const ok =
                              (await confirmDialog?.({
                                title: "确认删除属性",
                                message: `⚠️ 将从所有关联文件中删除属性：\n${key}`,
                                okText: "删除",
                                cancelText: "取消",
                              })) ?? false;
                            if (!ok) return;
                            const plan = buildDeleteKeyPlan(
                              selectManagerFiles(allPaths),
                              key
                            );
                            await runManagerPlan(plan, {
                              closeInspector: true,
                              forceDeleteKeys: true,
                              refreshInventory: true,
                            });
                          };

                          const doAppendVal = async () => {
                            const v =
                              (await promptText?.({
                                title: `追加新值 → ${key}`,
                                placeholder: "输入要追加的值",
                                okText: "追加",
                                cancelText: "取消",
                              })) ?? "";
                            const val = v.trim();
                            if (!val) return;
                            const ok =
                              (await confirmDialog?.({
                                title: "确认追加",
                                message: `向属性\n${key}\n追加值：\n${val}`,
                                okText: "确认",
                                cancelText: "取消",
                              })) ?? false;
                            if (!ok) return;
                            const plan = buildAppendValPlan(
                              selectManagerFiles(allPaths),
                              key,
                              val
                            );
                            await runManagerPlan(plan, {
                              closeInspector: true,
                              refreshInventory: true,
                            });
                          };

                          const doInjectProp = async () => {
                            const k =
                              (await promptText?.({
                                title: "注入属性：属性名",
                                placeholder: "例如：市场周期/market_cycle",
                                okText: "下一步",
                                cancelText: "取消",
                              })) ?? "";
                            const newKey = k.trim();
                            if (!newKey) return;
                            const v =
                              (await promptText?.({
                                title: `注入属性：${newKey} 的值`,
                                placeholder: "输入要注入的值",
                                okText: "注入",
                                cancelText: "取消",
                              })) ?? "";
                            const newVal = v.trim();
                            if (!newVal) return;
                            const ok =
                              (await confirmDialog?.({
                                title: "确认注入",
                                message:
                                  `将向 ${currentPaths.length} 个文件注入：\n` +
                                  `${newKey}: ${newVal}`,
                                okText: "确认",
                                cancelText: "取消",
                              })) ?? false;
                            if (!ok) return;
                            const plan = buildInjectPropPlan(
                              selectManagerFiles(currentPaths),
                              newKey,
                              newVal
                            );
                            await runManagerPlan(plan, {
                              closeInspector: true,
                              refreshInventory: true,
                            });
                          };

                          const doUpdateVal = async (
                            val: string,
                            paths: string[]
                          ) => {
                            const n =
                              (await promptText?.({
                                title: `修改值 → ${key}`,
                                defaultValue: val,
                                placeholder: "输入新的值",
                                okText: "修改",
                                cancelText: "取消",
                              })) ?? "";
                            const next = n.trim();
                            if (!next || next === val) return;
                            const ok =
                              (await confirmDialog?.({
                                title: "确认修改",
                                message:
                                  `将 ${paths.length} 个文件中的\n` +
                                  `${key}: ${val}\n` +
                                  `修改为\n` +
                                  `${key}: ${next}`,
                                okText: "确认",
                                cancelText: "取消",
                              })) ?? false;
                            if (!ok) return;
                            const plan = buildUpdateValPlan(
                              selectManagerFiles(paths),
                              key,
                              val,
                              next
                            );
                            await runManagerPlan(plan, {
                              closeInspector: true,
                              refreshInventory: true,
                            });
                          };

                          const doDeleteVal = async (
                            val: string,
                            paths: string[]
                          ) => {
                            const ok =
                              (await confirmDialog?.({
                                title: "确认移除值",
                                message:
                                  `将从 ${paths.length} 个文件中移除：\n` +
                                  `${key}: ${val}`,
                                okText: "移除",
                                cancelText: "取消",
                              })) ?? false;
                            if (!ok) return;
                            const plan = buildDeleteValPlan(
                              selectManagerFiles(paths),
                              key,
                              val,
                              {
                                deleteKeyIfEmpty: true,
                              }
                            );
                            await runManagerPlan(plan, {
                              closeInspector: true,
                              forceDeleteKeys: true,
                              refreshInventory: true,
                            });
                          };

                          const showFilesForVal = (
                            val: string,
                            paths: string[]
                          ) => {
                            setManagerInspectorTab("files");
                            setManagerInspectorFileFilter({
                              paths,
                              label: `值: ${val}`,
                            });
                          };

                          return (
                            <div
                              onClick={(e) => {
                                if (e.target === e.currentTarget) close();
                              }}
                              style={{
                                position: "fixed",
                                inset: 0,
                                background: "rgba(0,0,0,0.5)",
                                backdropFilter: "blur(6px)",
                                zIndex: 9999,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                padding: "24px",
                              }}
                            >
                              <GlassCard
                                style={{
                                  width: "min(860px, 95vw)",
                                  maxHeight: "85vh",
                                  overflow: "hidden",
                                  display: "flex",
                                  flexDirection: "column",
                                  padding: 0,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: SPACE.md,
                                    padding: "16px",
                                    borderBottom: `1px solid ${COLORS.border}`,
                                    background: "rgba(0,0,0,0.2)",
                                  }}
                                >
                                  <div style={{ fontWeight: 800, fontSize: "1.1em" }}>
                                    {key}
                                    <span
                                      style={{
                                        color: COLORS.text.muted,
                                        fontSize: "0.8em",
                                        marginLeft: "10px",
                                        fontWeight: 600,
                                        background: "rgba(255,255,255,0.1)",
                                        padding: "2px 6px",
                                        borderRadius: "4px"
                                      }}
                                    >
                                      {managerScope === "strategy" ? "STRATEGY" : "TRADE"}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", gap: SPACE.sm }}>
                                    <ButtonGhost
                                      disabled={managerBusy}
                                      onClick={doDeleteKey}
                                      style={{ color: COLORS.loss }}
                                    >
                                      🗑️ 删除属性
                                    </ButtonGhost>
                                    <ButtonGhost onClick={close}>
                                      ✕ 关闭
                                    </ButtonGhost>
                                  </div>
                                </div>

                                <div
                                  style={{
                                    display: "flex",
                                    gap: SPACE.sm,
                                    padding: "12px 16px",
                                    borderBottom: `1px solid ${COLORS.border}`,
                                  }}
                                >
                                  <ButtonGhost
                                    onClick={() => {
                                      setManagerInspectorTab("vals");
                                      setManagerInspectorFileFilter(undefined);
                                    }}
                                    style={{
                                      background: managerInspectorTab === "vals" ? "rgba(255,255,255,0.15)" : undefined,
                                      borderColor: managerInspectorTab === "vals" ? COLORS.accent : undefined
                                    }}
                                  >
                                    属性值 ({sortedVals.length})
                                  </ButtonGhost>
                                  <ButtonGhost
                                    onClick={() => setManagerInspectorTab("files")}
                                    style={{
                                      background: managerInspectorTab === "files" ? "rgba(255,255,255,0.15)" : undefined,
                                      borderColor: managerInspectorTab === "files" ? COLORS.accent : undefined
                                    }}
                                  >
                                    关联文件 ({allPaths.length})
                                  </ButtonGhost>
                                </div>

                                <div
                                  style={{
                                    padding: "16px",
                                    overflow: "auto",
                                    flex: "1 1 auto",
                                  }}
                                >
                                  {managerInspectorTab === "vals" ? (
                                    <div style={{ display: "grid", gap: SPACE.sm }}>
                                      {sortedVals.length === 0 ? (
                                        <div style={{ padding: "40px", textAlign: "center", color: COLORS.text.muted }}>
                                          无值记录
                                        </div>
                                      ) : (
                                        sortedVals.map(([val, paths]) => (
                                          <GlassPanel
                                            key={`mgr-v5-row-${val}`}
                                            style={{
                                              display: "flex",
                                              justifyContent: "space-between",
                                              alignItems: "center",
                                              gap: SPACE.md,
                                              padding: "10px",
                                            }}
                                          >
                                            <div style={{ display: "flex", alignItems: "center", gap: SPACE.md, minWidth: 0 }}>
                                              <span
                                                style={{
                                                  border: `1px solid ${COLORS.border}`,
                                                  borderRadius: "99px",
                                                  padding: "2px 10px",
                                                  background: "rgba(0,0,0,0.2)",
                                                  maxWidth: "400px",
                                                  overflow: "hidden",
                                                  textOverflow: "ellipsis",
                                                  whiteSpace: "nowrap",
                                                }}
                                                title={val}
                                              >
                                                {prettyManagerVal(val) || val}
                                              </span>
                                              <span style={{ color: COLORS.text.muted, fontVariantNumeric: "tabular-nums" }}>
                                                {paths.length}
                                              </span>
                                            </div>
                                            <div style={{ display: "flex", gap: SPACE.sm }}>
                                              <ButtonGhost
                                                disabled={managerBusy}
                                                onClick={() => void doUpdateVal(val, paths)}
                                                title="修改"
                                              >
                                                ✏️
                                              </ButtonGhost>
                                              <ButtonGhost
                                                disabled={managerBusy}
                                                onClick={() => void doDeleteVal(val, paths)}
                                                title="删除"
                                              >
                                                🗑️
                                              </ButtonGhost>
                                              <ButtonGhost
                                                onClick={() => showFilesForVal(val, paths)}
                                                title="查看文件"
                                              >
                                                👁️
                                              </ButtonGhost>
                                            </div>
                                          </GlassPanel>
                                        ))
                                      )}
                                    </div>
                                  ) : (
                                    <div style={{ display: "grid", gap: SPACE.sm }}>
                                      {filterLabel ? (
                                        <div
                                          style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            color: COLORS.accent,
                                            fontWeight: 700,
                                            padding: "8px 12px",
                                            border: `1px solid ${COLORS.border}`,
                                            borderRadius: "8px",
                                            background: "rgba(0,0,0,0.1)",
                                          }}
                                        >
                                          <span>🔍 筛选: {filterLabel}</span>
                                          <ButtonGhost onClick={() => setManagerInspectorFileFilter(undefined)}>
                                            ✕ 重置
                                          </ButtonGhost>
                                        </div>
                                      ) : null}

                                      {currentPaths.slice(0, 200).map((p) => (
                                        <button
                                          key={`mgr-v5-file-${p}`}
                                          type="button"
                                          onClick={() => void openFile?.(p)}
                                          title={p}
                                          onMouseEnter={onBtnMouseEnter}
                                          onMouseLeave={onBtnMouseLeave}
                                          onFocus={onBtnFocus}
                                          onBlur={onBtnBlur}
                                          style={{
                                            textAlign: "left",
                                            border: `1px solid ${COLORS.border}`,
                                            borderRadius: "8px",
                                            padding: "10px",
                                            background: "rgba(255,255,255,0.03)",
                                            cursor: "pointer",
                                            color: COLORS.text.normal,
                                            width: "100%"
                                          }}
                                        >
                                          <div style={{ fontWeight: 700 }}>{p.split("/").pop()}</div>
                                          <div style={{ color: COLORS.text.muted, fontSize: "0.85em", opacity: 0.8 }}>{p}</div>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                <div
                                  style={{
                                    padding: "12px 16px",
                                    borderTop: `1px solid ${COLORS.border}`,
                                    display: "flex",
                                    gap: SPACE.sm,
                                    justifyContent: "flex-end",
                                    background: "rgba(0,0,0,0.1)",
                                  }}
                                >
                                  {managerInspectorTab === "vals" ? (
                                    <>
                                      <ButtonGhost
                                        disabled={managerBusy}
                                        onClick={() => void doRenameKey()}
                                      >
                                        ✏️ 重命名
                                      </ButtonGhost>
                                      <ButtonGhost
                                        disabled={managerBusy}
                                        onClick={() => void doAppendVal()}
                                      >
                                        ➕ 追加新值
                                      </ButtonGhost>
                                    </>
                                  ) : (
                                    <ButtonGhost
                                      disabled={managerBusy}
                                      onClick={() => void doInjectProp()}
                                    >
                                      💉 注入属性
                                    </ButtonGhost>
                                  )}
                                </div>
                              </GlassCard>
                            </div>
                          );
                        })()
                        : null}
                    </>
                  ) : (
                    <div
                      style={{ color: "var(--text-faint)", fontSize: "0.9em" }}
                    >
                      尚未扫描属性。点击上方“扫描属性（v5.0）”。
                    </div>
                  )}
                </GlassPanel>
              </div>
            </GlassCard>

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
                导出
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
                v5.0 在页面底部提供“一键备份数据库”按钮（写入
                pa-db-export.json）。插件版 目前提供两类导出：旧版兼容快照（写入
                vault 根目录 pa-db-export.json）与索引快照（导出到
                Exports/al-brooks-console/）。
              </div>
            </div>
          </>
        ) : null
      }
    </div >
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

    const promptText: Props["promptText"] = async (options) => {
      return await new Promise<string | null>((resolve) => {
        const modal = new Modal(this.app);
        modal.titleEl.setText(options.title);
        let resolved = false;

        const wrap = modal.contentEl.createDiv();
        const input = wrap.createEl("input", {
          type: "text",
          value: options.defaultValue ?? "",
          attr: { placeholder: options.placeholder ?? "" },
        });
        input.style.width = "100%";
        input.style.marginTop = "6px";

        const btnRow = wrap.createDiv();
        btnRow.style.display = "flex";
        btnRow.style.justifyContent = "flex-end";
        btnRow.style.gap = "8px";
        btnRow.style.marginTop = "12px";

        const cancelBtn = btnRow.createEl("button", {
          text: options.cancelText ?? "取消",
        });
        cancelBtn.addEventListener("click", () => {
          resolved = true;
          modal.close();
          resolve(null);
        });

        const okBtn = btnRow.createEl("button", {
          text: options.okText ?? "确定",
        });
        okBtn.addEventListener("click", () => {
          resolved = true;
          const v = input.value ?? "";
          modal.close();
          resolve(v);
        });

        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            okBtn.click();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelBtn.click();
          }
        });

        modal.onClose = () => {
          if (!resolved) resolve(null);
        };

        modal.open();
        window.setTimeout(() => {
          input.focus();
          input.select();
        }, 0);
      });
    };

    const confirmDialog: Props["confirmDialog"] = async (options) => {
      return await new Promise<boolean>((resolve) => {
        const modal = new Modal(this.app);
        modal.titleEl.setText(options.title);
        let resolved = false;

        const wrap = modal.contentEl.createDiv();
        const msg = wrap.createEl("div", { text: options.message });
        msg.style.whiteSpace = "pre-wrap";

        const btnRow = wrap.createDiv();
        btnRow.style.display = "flex";
        btnRow.style.justifyContent = "flex-end";
        btnRow.style.gap = "8px";
        btnRow.style.marginTop = "12px";

        const cancelBtn = btnRow.createEl("button", {
          text: options.cancelText ?? "取消",
        });
        cancelBtn.addEventListener("click", () => {
          resolved = true;
          modal.close();
          resolve(false);
        });

        const okBtn = btnRow.createEl("button", {
          text: options.okText ?? "确认",
        });
        okBtn.addEventListener("click", () => {
          resolved = true;
          modal.close();
          resolve(true);
        });

        modal.onClose = () => {
          if (!resolved) resolve(false);
        };

        modal.open();
      });
    };

    const openGlobalSearch = (query: string) => {
      try {
        const plugin = (this.app as any)?.internalPlugins?.plugins?.[
          "global-search"
        ];
        const inst = plugin?.instance as any;
        inst?.openGlobalSearch?.(query);
      } catch {
        // best-effort only
      }
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

    const createTradeNote = async (): Promise<void> => {
      const TEMPLATE_PATH = "Templates/单笔交易模版 (Trade Note).md";
      const DEST_DIR = "Daily/Trades";

      const ensureFolder = async (path: string): Promise<void> => {
        const parts = String(path ?? "")
          .replace(/^\/+/, "")
          .split("/")
          .map((p) => p.trim())
          .filter(Boolean);

        let cur = "";
        for (const p of parts) {
          cur = cur ? `${cur}/${p}` : p;
          const existing = this.app.vault.getAbstractFileByPath(cur);
          if (!existing) {
            try {
              await this.app.vault.createFolder(cur);
            } catch {
              // ignore if created concurrently
            }
          }
        }
      };

      const pickAvailablePath = async (basePath: string): Promise<string> => {
        const raw = String(basePath ?? "").replace(/^\/+/, "");
        if (!this.app.vault.getAbstractFileByPath(raw)) return raw;

        const m = raw.match(/^(.*?)(\.[^./]+)$/);
        const prefix = m ? m[1] : raw;
        const ext = m ? m[2] : "";
        for (let i = 2; i <= 9999; i++) {
          const candidate = `${prefix}_${i}${ext}`;
          if (!this.app.vault.getAbstractFileByPath(candidate))
            return candidate;
        }
        return `${prefix}_${Date.now()}${ext}`;
      };

      const today = toLocalDateIso(new Date());
      await ensureFolder(DEST_DIR);

      let content = "";
      try {
        const af = this.app.vault.getAbstractFileByPath(TEMPLATE_PATH);
        if (af instanceof TFile) content = await this.app.vault.read(af);
      } catch {
        // best-effort only
      }

      if (!content.trim()) {
        content = `---\n${stringifyYaml({
          tags: [TRADE_TAG],
          date: today,
        }).trimEnd()}\n---\n\n`;
      }

      const base = `${DEST_DIR}/${today}_Trade.md`;
      const path = await pickAvailablePath(base);
      await this.app.vault.create(path, content);
      openFile(path);
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

          try {
            await this.app.fileManager.processFrontMatter(af, (fm) => {
              const updates = (fu.updates ?? {}) as Record<string, unknown>;
              for (const [k, v] of Object.entries(updates)) (fm as any)[k] = v;
              if (
                options?.deleteKeys &&
                fu.deleteKeys &&
                fu.deleteKeys.length
              ) {
                for (const k of fu.deleteKeys) delete (fm as any)[k];
              }
            });
            res.applied += 1;
          } catch {
            // Fallback: patch YAML text directly (best-effort) for files with unusual frontmatter state.
            const nextText = applyFrontmatterPatch(
              oldText,
              fu.updates ?? {},
              options?.deleteKeys ? fu.deleteKeys : undefined
            );
            if (nextText !== oldText) {
              await this.app.vault.modify(af, nextText);
              res.applied += 1;
            }
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

    const loadAllFrontmatterFiles = async (): Promise<FrontmatterFile[]> => {
      const EXCLUDE_PREFIXES = [
        ".obsidian/",
        "Templates/",
        "Attachments/",
        "Exports/",
        "copilot/",
      ];

      const files = this.app.vault
        .getMarkdownFiles()
        .filter((f) => !EXCLUDE_PREFIXES.some((p) => f.path.startsWith(p)));

      const out: FrontmatterFile[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const cache = this.app.metadataCache.getFileCache(f);
        let fm = cache?.frontmatter as Record<string, unknown> | undefined;

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
          } catch {
            // ignore
          }
        }

        if (fm) out.push({ path: f.path, frontmatter: fm });
        if (i % 250 === 0) await new Promise((r) => window.setTimeout(r, 0));
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



    const onUpdateMarketCycle = async (cycle: string) => {
      // 1. Try to find today's note
      // Logic: Search for files in "Daily" (or root) that start with YYYY-MM-DD
      const dateIso = toLocalDateIso(new Date());
      const allFiles = this.app.vault.getMarkdownFiles();
      // Heuristic: file name starts with dateIso or contains it
      const todayFile = allFiles.find(
        (f) =>
          f.name.startsWith(dateIso) &&
          (f.path.includes("Daily") || f.path.includes("Journal") || f.parent?.name === "Daily")
      );

      if (!todayFile) {
        new Notice(`未找到今日 (${dateIso}) 的日记文件，无法更新周期。`);
        return;
      }

      try {
        await this.app.fileManager.processFrontMatter(todayFile, (fm) => {
          fm["market_cycle"] = cycle;
        });
        new Notice(`已更新市场周期: ${cycle}`);
      } catch (e) {
        new Notice("更新市场周期失败: " + String(e));
      }
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
          loadAllFrontmatterFiles={loadAllFrontmatterFiles}
          applyFixPlan={applyFixPlan}
          restoreFiles={restoreFiles}
          createTradeNote={createTradeNote}
          settings={this.getSettings()}
          subscribeSettings={this.subscribeSettings}
          loadCourse={loadCourse}
          loadMemory={loadMemory}
          promptText={promptText}
          confirmDialog={confirmDialog}
          integrations={this.integrations}
          openFile={openFile}
          openGlobalSearch={openGlobalSearch}
          runCommand={(commandId) =>
            (this.app as any).commands?.executeCommandById?.(commandId)
          }
          version={this.version}
          onUpdateMarketCycle={onUpdateMarketCycle}
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
