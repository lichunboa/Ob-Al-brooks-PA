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
import { StrategyStats } from "./components/strategy/StrategyStats";
import { TradeList } from "./components/TradeList";
import { StrategyList } from "./components/strategy/StrategyList";
import { TodayKpiCard } from "./components/trading/TodayKpiCard";
import { OpenTradeAssistant } from "./components/trading/OpenTradeAssistant";
import { TradingHubTab } from "./tabs/TradingHubTab";
import { AnalyticsTab } from "./tabs/AnalyticsTab";
import { LearnTab } from "./tabs/LearnTab";
import { ManageTab } from "./tabs/ManageTab";
import { ExportPanel } from "./components/manage/ExportPanel";
import { HealthStatusPanel } from "./components/manage/HealthStatusPanel";
import { SchemaIssuesPanel } from "./components/manage/SchemaIssuesPanel";
import { DataStatisticsPanel } from "./components/manage/DataStatisticsPanel";
import { SectionHeader } from "../ui/components/SectionHeader";
import { Button } from "../ui/components/Button";
import { InteractiveButton } from "../ui/components/InteractiveButton";
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
// normalizeTag 已移至 utils/strategy-utils.ts
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
  cardStyle,
  cardSubtleTightStyle,
  cardTightStyle,
  disabledButtonStyle,
  SPACE,
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
  toLocalDateIso,
  getLastLocalDateIsos,
  getDayOfMonth,
  getYearMonth,
} from "../utils/date-utils";
import { getRColorByAccountType } from "../utils/color-utils";
import { isEmpty, pickVal } from "../utils/validation-utils";
import { safePct } from "../utils/trade-calculations";
import { isActive } from "../utils/trade-utils";
import {
  hasCJK,
  prettySchemaVal,
  prettyExecVal,
  prettyManagerVal,
  prettyVal,
} from "../utils/format-utils";
import {
  canonicalizeSearch,
  matchesSearch,
  matchKeyToGroup,
} from "../utils/search-utils";
import { topN, countFiles, convertDailyAggToMap } from "../utils/aggregation-utils";
import { getPoints, calculateRScale, seg } from "../utils/chart-utils";
import { isImage, normalize, resolveCanonical } from "../utils/string-utils";
import { resolveCanonicalStrategy, normalizeTag, calculateStrategyStats } from "../utils/strategy-utils";
import {
  calculateDateRange,
  calculateTodayKpi,
  calculateAllTradesDateRange,
  calculateTopTuitionErrorPct,
} from "../utils/data-calculation-utils";
import {
  calculateLiveCyclePerformance,
  sortTradesByDateDesc,
  getRecentTrades,
} from "../utils/performance-utils";
import {
  calculateStrategyPerformance,
  generatePlaybookPerfRows,
  computeStrategyLab,
} from "../utils/strategy-performance-utils";
import {
  generateCalendarCells,
  calculateCalendarMaxAbs,
} from "../utils/calendar-utils";
import { useDashboardData } from "../hooks/useDashboardData";
import { useManagerState } from "../hooks/useManagerState";
import { useAnalyticsState } from "../hooks/useAnalyticsState";
import { useSchemaState } from "../hooks/useSchemaState";
import { CYCLE_MAP } from "../utils/constants";
import { normalizeCycle } from "../utils/market-cycle-utils";
import { sortTradesByDateAsc, findOpenTrade } from "../utils/trade-utils";
import { buildGalleryItems, type GalleryItem } from "../utils/gallery-utils";
import { useLearnData } from "../hooks/useLearnData";

export const VIEW_TYPE_CONSOLE = "al-brooks-console-view";

import {
  type PaTagSnapshot,
  type SchemaIssueItem
} from "../types";

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
}

import { ConsoleErrorBoundary } from "../ui/components/ConsoleErrorBoundary";
import { MarkdownBlock } from "../ui/components/MarkdownBlock";

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
}) => {
  // 使用 useDashboardData Hook 管理核心数据
  const { trades, strategies, status, todayMarketCycle } = useDashboardData({
    index,
    strategyIndex,
    todayContext,
  });
  // 使用 useAnalyticsState Hook 管理 Analytics Tab 状态
  const { analyticsScope, setAnalyticsScope, galleryScope, setGalleryScope } =
    useAnalyticsState();

  // 使用 useSchemaState Hook 管理 Schema 检查状态
  const {
    showFixPlan,
    setShowFixPlan,
    paTagSnapshot,
    setPaTagSnapshot,
    schemaIssues,
    setSchemaIssues,
    schemaScanNote,
    setSchemaScanNote,
  } = useSchemaState();


  React.useEffect(() => {
    let cancelled = false;

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
  // 使用 useManagerState Hook 管理 Manager Tab 状态
  const {
    managerPlan,
    setManagerPlan,
    managerResult,
    setManagerResult,
    managerBusy,
    setManagerBusy,
    managerDeleteKeys,
    setManagerDeleteKeys,
    managerBackups,
    setManagerBackups,
    managerTradeInventory,
    setManagerTradeInventory,
    managerTradeInventoryFiles,
    setManagerTradeInventoryFiles,
    managerStrategyInventory,
    setManagerStrategyInventory,
    managerStrategyInventoryFiles,
    setManagerStrategyInventoryFiles,
    managerSearch,
    setManagerSearch,
    managerScope,
    setManagerScope,
    managerInspectorKey,
    setManagerInspectorKey,
    managerInspectorTab,
    setManagerInspectorTab,
    managerInspectorFileFilter,
    setManagerInspectorFileFilter,
  } = useManagerState();

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

  // 使用 useLearnState Hook 管理 Learn Tab 状态
  // State defined via hooks now
  const summary = React.useMemo(
    () => computeTradeStatsByAccountType(trades),
    [trades]
  );
  const all = summary.All;

  // liveCyclePerf 已移至 utils/performance-utils.ts
  const liveCyclePerf = React.useMemo(
    () => calculateLiveCyclePerformance(trades),
    [trades]
  );

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

  // trades, strategies, todayContext, status 的订阅已移到 useDashboardData Hook 中

  // strategyPerf 已移至 utils/strategy-performance-utils.ts
  const strategyPerf = React.useMemo(
    () => calculateStrategyPerformance(trades, (t) => resolveCanonicalStrategy(t, strategyIndex)),
    [trades, strategyIndex]
  );

  const strategyStats = React.useMemo(
    () => calculateStrategyStats(strategies, strategyPerf, isActive),
    [strategies, strategyPerf]
  );

  // playbookPerfRows 已移至 utils/strategy-performance-utils.ts
  const playbookPerfRows = React.useMemo(
    () => generatePlaybookPerfRows(strategyPerf, strategyIndex, safePct),
    [strategyPerf, strategyIndex]
  );





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

  // useLearnData hook handles course and memory loading
  const {
    course,
    courseBusy,
    courseError,
    memory,
    memoryBusy,
    memoryError,
    memoryShakeIndex,
    memoryIgnoreFocus,
    setMemoryShakeIndex,
    setMemoryIgnoreFocus,
    reloadCourse,
    reloadMemory,
    hardRefreshMemory,
  } = useLearnData({
    loadCourse,
    loadMemory,
    settings,
    integrations,
  });

  const latestTrade = trades.length > 0 ? trades[0] : undefined;

  // allTradesDateRange 已移至 utils/data-calculation-utils.ts
  const allTradesDateRange = React.useMemo(
    () => calculateAllTradesDateRange(trades),
    [trades]
  );
  const todayIso = React.useMemo(() => toLocalDateIso(new Date()), []);
  const todayTrades = React.useMemo(
    () => trades.filter((t) => t.dateIso === todayIso),
    [trades, todayIso]
  );
  // todayKpi 已移至 utils/data-calculation-utils.ts
  const todayKpi = React.useMemo(
    () => calculateTodayKpi(trades, todayIso),
    [trades, todayIso]
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
    return computeErrorAnalysis(analyticsTrades).slice(0, 5);
  }, [analyticsTrades]);
  const analyticsDaily = React.useMemo(
    () => computeDailyAgg(analyticsTrades, 90),
    [analyticsTrades]
  );
  const analyticsDailyByDate = React.useMemo(
    () => convertDailyAggToMap(analyticsDaily),
    [analyticsDaily]
  );

  const calendarDays = 35;
  const calendarDateIsos = React.useMemo(
    () => getLastLocalDateIsos(calendarDays),
    []
  );
  // calendarCells 已移至 utils/calendar-utils.ts
  const calendarCells = React.useMemo(
    () => generateCalendarCells(calendarDateIsos, analyticsDailyByDate),
    [calendarDateIsos, analyticsDailyByDate]
  );
  // calendarMaxAbs 已移至 utils/calendar-utils.ts
  const calendarMaxAbs = React.useMemo(
    () => calculateCalendarMaxAbs(calendarCells),
    [calendarCells]
  );

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
    const pct = calculateTopTuitionErrorPct(top, tuition.tuitionR);
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

  const strategyLab = React.useMemo(
    () => computeStrategyLab(trades, (t) => ({ name: identifyStrategyForAnalytics(t, strategyIndex).name })),
    [trades, strategyIndex]
  );

  const gallery = React.useMemo((): {
    items: GalleryItem[];
    scopeTotal: number;
    candidateCount: number;
  } => {
    if (!getResourceUrl) return { items: [], scopeTotal: 0, candidateCount: 0 };
    const out: GalleryItem[] = [];
    // isImage 已移至 utils/string-utils.ts

    const candidates =
      galleryScope === "All"
        ? trades
        : trades.filter(
          (t) => ((t.accountType ?? "Live") as AccountType) === galleryScope
        );

    // v5.0 口径：按“最新”取候选。index.getAll() 的顺序不保证，所以这里显式按日期倒序。
    const candidatesSorted = sortTradesByDateDesc(candidates);

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

  const openTrade = React.useMemo(
    () => findOpenTrade(trades),
    [trades]
  );

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
      <h2 className="pa-dashboard-title">
        🦁 交易员控制台
        <span className="pa-dashboard-title-meta">（Dashboard）</span>
        <span className="pa-dashboard-title-meta">v{version}</span>
        <span className="pa-dashboard-title-meta">{statusText}</span>
        <span className="pa-dashboard-title-actions">
          <InteractiveButton
            interaction="lift"
            onClick={() => openFile(TRADE_NOTE_TEMPLATE_PATH)}
            title={TRADE_NOTE_TEMPLATE_PATH}
          >
            新建交易
          </InteractiveButton>

          {integrations ? (
            <>
              <InteractiveButton
                interaction="lift"
                disabled={!can("srs:review-flashcards")}
                onClick={() => action("srs:review-flashcards")}
              >
                ⚡️ 开始复习
              </InteractiveButton>
            </>
          ) : null}

          {index.rebuild ? (
            <InteractiveButton
              interaction="lift"
              onClick={onRebuild}
            >
              重建索引
            </InteractiveButton>
          ) : null}
        </span>
      </h2>

      <div className="pa-tabbar">
        {(
          [
            { id: "trading", label: "交易中心" },
            { id: "analytics", label: "数据中心" },
            { id: "learn", label: "学习模块" },
            { id: "manage", label: "管理/维护" },
          ] as const
        ).map((t) => (
          <Button
            key={t.id}
            variant="tab"
            active={t.id === activePage}
            onClick={() => setActivePage(t.id)}
          >
            {t.label}
          </Button>
        ))}
      </div>

      {activePage === "trading" ? (
        <TradingHubTab
          latestTrade={latestTrade}
          openTrade={openTrade}
          todayTrades={todayTrades}
          openTradeStrategy={openTradeStrategy}
          todayStrategyPicks={todayStrategyPicks}
          strategyIndex={strategyIndex}
          todayKpi={todayKpi}
          todayMarketCycle={todayMarketCycle}
          reviewHints={reviewHints}
          index={index}
          openFile={openFile}
          canOpenTodayNote={canOpenTodayNote}
          onOpenTodayNote={onOpenTodayNote}
          can={can}
          textButtonStyle={textButtonStyle}
          buttonStyle={buttonStyle}
          disabledButtonStyle={disabledButtonStyle}
          MarkdownBlock={MarkdownBlock}
        />
      ) : null}

      {activePage === "analytics" ? (
        <AnalyticsTab
          summary={summary}
          strategyLab={strategyLab}
          contextAnalysis={contextAnalysis}
          analyticsSuggestion={analyticsSuggestion}
          analyticsRecentLiveTradesAsc={analyticsRecentLiveTradesAsc}
          analyticsRMultiples={analyticsRMultiples}
          analyticsMind={analyticsMind}
          analyticsTopStrats={analyticsTopStrats}
          liveCyclePerf={liveCyclePerf}
          tuition={tuition}
          calendarCells={calendarCells}
          calendarMaxAbs={calendarMaxAbs}
          calendarDays={calendarDays}
          strategyAttribution={strategyAttribution}
          analyticsScope={analyticsScope}
          gallery={gallery}
          galleryScope={galleryScope}
          gallerySearchHref={gallerySearchHref}
          allTradesDateRange={allTradesDateRange}
          setAnalyticsScope={setAnalyticsScope}
          setGalleryScope={setGalleryScope}
          openFile={openFile}
          getResourceUrl={getResourceUrl}
          textButtonStyle={textButtonStyle}
          cardTightStyle={cardTightStyle}
          cardSubtleTightStyle={cardSubtleTightStyle}
          selectStyle={selectStyle}
          SPACE={SPACE}
          getDayOfMonth={getDayOfMonth}
          getRColorByAccountType={getRColorByAccountType}
          getPoints={getPoints}
          CYCLE_MAP={CYCLE_MAP}
        />
      ) : null}
      {activePage === "learn" ? (
        <LearnTab
          memory={memory}
          memoryError={memoryError}
          memoryBusy={memoryBusy}
          course={course}
          courseError={courseError}
          courseBusy={courseBusy}
          settings={settings}
          strategyStats={strategyStats}
          strategies={strategies}
          strategyPerf={strategyPerf}
          todayMarketCycle={todayMarketCycle}
          playbookPerfRows={playbookPerfRows}
          memoryIgnoreFocus={memoryIgnoreFocus}
          memoryShakeIndex={memoryShakeIndex}
          strategyIndex={strategyIndex}
          can={can}
          action={action}
          loadMemory={loadMemory}
          reloadMemory={reloadMemory}
          hardRefreshMemory={hardRefreshMemory}
          loadCourse={loadCourse}
          reloadCourse={reloadCourse}
          openFile={openFile}
          setMemoryIgnoreFocus={setMemoryIgnoreFocus}
          setMemoryShakeIndex={setMemoryShakeIndex}
          buttonStyle={buttonStyle}
          disabledButtonStyle={disabledButtonStyle}
          buttonSmStyle={buttonSmStyle}
          buttonSmDisabledStyle={buttonSmDisabledStyle}
          textButtonStyle={textButtonStyle}
          textButtonStrongStyle={textButtonStrongStyle}
          textButtonSemiboldStyle={textButtonSemiboldStyle}
          textButtonNoWrapStyle={textButtonNoWrapStyle}
          V5_COLORS={V5_COLORS}
          seg={seg}
          simpleCourseId={simpleCourseId}
          isActive={isActive}
        />
      ) : null}


      {activePage === "manage" ? (
        <ManageTab
          // 数据Props
          schemaIssues={schemaIssues}
          paTagSnapshot={paTagSnapshot}
          trades={trades}
          strategyIndex={strategyIndex}
          managerTradeInventory={managerTradeInventory}
          managerStrategyInventory={managerStrategyInventory}
          managerInspectorKey={managerInspectorKey}
          managerInspectorTab={managerInspectorTab}
          managerInspectorFileFilter={managerInspectorFileFilter}
          managerScope={managerScope}
          managerSearch={managerSearch}
          managerBusy={managerBusy}
          inspectorIssues={inspectorIssues}
          // 状态设置函数
          setManagerInspectorKey={setManagerInspectorKey}
          setManagerInspectorTab={setManagerInspectorTab}
          setManagerInspectorFileFilter={setManagerInspectorFileFilter}
          setManagerScope={setManagerScope}
          setManagerSearch={setManagerSearch}
          setManagerBusy={setManagerBusy}
          // 操作函数
          scanManagerInventory={scanManagerInventory}
          runManagerPlan={runManagerPlan}
          buildRenameKeyPlan={buildRenameKeyPlan}
          buildDeleteKeyPlan={buildDeleteKeyPlan}
          buildAppendValPlan={buildAppendValPlan}
          buildInjectPropPlan={buildInjectPropPlan}
          buildUpdateValPlan={buildUpdateValPlan}
          buildDeleteValPlan={buildDeleteValPlan}
          selectManagerTradeFiles={selectManagerTradeFiles}
          selectManagerStrategyFiles={selectManagerStrategyFiles}
          // 辅助函数
          openFile={openFile}
          promptText={promptText}
          confirmDialog={confirmDialog}
          // 管理面板可能需要runCommand以支持导出等功能
          runCommand={runCommand}
        />
      ) : null}
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
