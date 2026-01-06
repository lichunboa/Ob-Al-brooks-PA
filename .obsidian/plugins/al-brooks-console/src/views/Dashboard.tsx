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
import { ManageTab } from "./tabs/ManageTab";
import { LearnTab } from "./tabs/LearnTab";
import { AnalyticsTab } from "./tabs/AnalyticsTab";
import { TradingHubTab } from "./tabs/TradingHubTab";
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
  const courseSnapshot = course;

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
        <TradingHubTab
          latestTrade={latestTrade}
          reviewHints={reviewHints}
          todayKpi={todayKpi}
          todayMarketCycle={todayMarketCycle}
          onUpdateMarketCycle={onUpdateMarketCycle}
          todayStrategyPicks={todayStrategyPicks}
          openFile={openFile}
          openTrade={openTrade}
          openTradeStrategy={openTradeStrategy}
          strategyPicks={strategyPicks}
          todayTrades={todayTrades}
          can={can}
        />
      ) : null}
      }

      {
        activePage === "analytics" ? (
          <AnalyticsTab
            summary={summary}
            liveCyclePerf={liveCyclePerf}
            cycleMap={cycleMap}
            tuition={tuition}
            analyticsSuggestion={analyticsSuggestion}
            analyticsScope={analyticsScope}
            setAnalyticsScope={setAnalyticsScope}
            calendarCells={calendarCells}
            calendarDays={calendarDays}
            calendarMaxAbs={calendarMaxAbs}
            strategyAttribution={strategyAttribution}
            analyticsRMultiples={analyticsRMultiples}
            analyticsRecentLiveTradesAsc={analyticsRecentLiveTradesAsc}
            analyticsMind={analyticsMind}
            analyticsTopStrats={analyticsTopStrats}
            openFile={openFile}
            getDayOfMonth={getDayOfMonth}
          />
        ) : null
      }

      {
        activePage === "learn" ? (
          <LearnTab
            strategies={strategies}
            syllabuses={courseSnapshot?.syllabus}
            strategyStats={strategyStats}
            todayMarketCycle={todayMarketCycle}
            strategyIndex={strategyIndex}
            openFile={openFile}
            strategyPerf={strategyPerf}
            playbookPerfRows={playbookPerfRows}
            recommendationWindow={settings.courseRecommendationWindow}
          />
        ) : null
      }

      {
        activePage === "manage" ? (
          <ManageTab
            schemaIssues={schemaIssues}
            schemaScanNote={schemaScanNote}
            paTagSnapshot={paTagSnapshot}
            trades={trades}
            enumPresets={enumPresets}
            openFile={openFile}
            openGlobalSearch={openGlobalSearch}
            managerDeleteKeys={managerDeleteKeys}
            setManagerDeleteKeys={setManagerDeleteKeys}
            managerBackups={managerBackups}
            setManagerBackups={setManagerBackups}
            managerTradeInventory={managerTradeInventory}
            managerTradeInventoryFiles={managerTradeInventoryFiles}
            managerStrategyInventory={managerStrategyInventory}
            managerStrategyInventoryFiles={managerStrategyInventoryFiles}
            scanManagerInventory={scanManagerInventory}
            runManagerPlan={runManagerPlan}
            managerSearch={managerSearch}
            setManagerSearch={setManagerSearch}
            managerScope={managerScope}
            setManagerScope={setManagerScope}
            managerInspectorKey={managerInspectorKey}
            setManagerInspectorKey={setManagerInspectorKey}
            managerInspectorTab={managerInspectorTab}
            setManagerInspectorTab={setManagerInspectorTab}
            managerInspectorFileFilter={managerInspectorFileFilter}
            setManagerInspectorFileFilter={setManagerInspectorFileFilter}
            managerBusy={managerBusy}
            managerPlan={managerPlan}
            managerResult={managerResult}
            fixPlanText={fixPlanText}
            showFixPlan={showFixPlan}
            setShowFixPlan={setShowFixPlan}
            inspectorIssues={inspectorIssues}
            promptText={promptText}
            confirmDialog={confirmDialog}
            runCommand={runCommand}
          />
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
