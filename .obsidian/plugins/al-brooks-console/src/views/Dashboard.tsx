import * as React from "react";
import {
  ItemView,
  WorkspaceLeaf,
  Notice,
  TFile,
  parseYaml,
  stringifyYaml,
} from "obsidian";
import { createRoot, Root } from "react-dom/client";
import type { TradeIndex } from "../core/trade-index";
import type { StrategyIndex } from "../core/strategy-index";
import { matchStrategies } from "../core/strategy-matcher";
import { Strategies } from "./components/Strategies";
import { StrategyList } from "./components/StrategyList";
import { ContextWidget, ErrorWidget } from "./components/AnalyticsWidgets";
import { StatsCard } from "./components/StatsCard";
import { StrategyStats } from "./components";
import { Gallery } from "./components/Gallery";
import type { GalleryItem } from "./components/types";
import { useDashboardData, getRColorByAccountType } from "./hooks/useDashboardData";
import { GlobalStyles } from "./GlobalStyles";
import { TrendRow } from "./components/TrendRow";
import type { PluginIntegrationRegistry } from "../integrations/PluginIntegrationRegistry";
import type { TodayContext } from "../core/today-context";
import type { AlBrooksConsoleSettings } from "../settings";
import type { CourseSnapshot } from "../core/course";
import {
  buildCourseSnapshot,
  parseSyllabusJsonFromMarkdown,
  simpleCourseId
} from "../core/course";
import type { MemorySnapshot } from "../core/memory";
import { buildMemorySnapshot } from "../core/memory";
import type { FixPlan, FixPlanFileUpdate } from "../core/inspector";
import { buildFixPlan } from "../core/inspector";
import { type EnumPresets, createEnumPresetsFromFrontmatter } from "../core/enum-presets";
import { TradeList } from "./components/TradeList";

import type { AnalyticsScope } from "../core/analytics";
import {
  type ManagerApplyResult,
  type StrategyNoteFrontmatter,
  buildTradeNormalizationPlan,
  buildStrategyMaintenancePlan
} from "../core/manager";

export const VIEW_TYPE_CONSOLE = "al-brooks-console-view";
const normalizeTag = (t: unknown) => String(t ?? "").trim();
const calendarDays = 35;
const parseCoverRef = (val: unknown): string | undefined => {
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") return val[0].trim();
  return undefined;
};

class ConsoleErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ConsoleErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "1rem", color: "var(--text-error)" }}>
          <h3>控制台渲染出错</h3>
          <pre>{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

interface ConsoleComponentProps {
  index: TradeIndex;
  strategyIndex: StrategyIndex;
  todayContext?: TodayContext;
  resolveLink: (linkText: string, fromPath: string) => string | undefined;
  getResourceUrl: (path: string) => string | undefined;
  enumPresets?: EnumPresets;
  loadStrategyNotes: () => Promise<StrategyNoteFrontmatter[]>;
  applyFixPlan: (plan: FixPlan, options?: { deleteKeys?: boolean }) => Promise<ManagerApplyResult>;
  restoreFiles: (backups: Record<string, string>) => Promise<ManagerApplyResult>;
  settings: AlBrooksConsoleSettings;
  subscribeSettings: (listener: (settings: AlBrooksConsoleSettings) => void) => () => void;
  loadCourse: (settings: AlBrooksConsoleSettings) => Promise<CourseSnapshot>;
  loadMemory: (settings: AlBrooksConsoleSettings) => Promise<MemorySnapshot>;
  integrations?: PluginIntegrationRegistry;
  openFile: (path: string) => void;
  version: string;
}

export const ConsoleComponent: React.FC<ConsoleComponentProps> = (props) => {
  const {
    index,
    strategyIndex,
    todayContext,
    resolveLink,
    getResourceUrl,
    enumPresets,
    loadStrategyNotes,
    applyFixPlan,
    restoreFiles,
    settings,
    subscribeSettings,
    loadCourse,
    loadMemory,
    integrations,
    openFile,
    version,
  } = props;

  const {
    trades,
    strategies,
    status,
    todayMarketCycle,
    analyticsScope,
    setAnalyticsScope,
    onRebuild,
    summary,
    all,
    strategyStats,
    latestTrade,
    todayIso,
    todayTrades,
    todaySummary,
    todayLatestTrade,
    rLast10,
    rLast30,
    r10MaxAbs,
    r30MaxAbs,
    reviewHints,
    calendarCells,
    equitySeries,
    strategyAttribution,
    inspectorIssues,
    fixPlan: hookFixPlan, // From hook (based on presets, mostly for linting)
    openTrade,
    todayStrategyPicks,
    openTradeStrategy,
    contextAnalysis,
    errorAnalysis,
  } = useDashboardData(index, strategyIndex, todayContext, enumPresets);

  const statusText = React.useMemo(() => {
    switch (status) {
      case "idle": return "";
      case "loading": return "⚡️";
      case "ready": return "🟢";
      case "error": return "🔴";
      default: return "";
    }
  }, [status]);

  // --- UI Helper States ---

  // Course State
  const [course, setCourse] = React.useState<CourseSnapshot | undefined>(undefined);
  const [courseBusy, setCourseBusy] = React.useState(false);
  const [courseError, setCourseError] = React.useState<string | undefined>(undefined);

  const reloadCourse = React.useCallback(async () => {
    if (!loadCourse || !settings) return;
    setCourseBusy(true);
    setCourseError(undefined);
    try {
      const res = await loadCourse(settings);
      setCourse(res);
    } catch (e) {
      setCourseError(String(e));
    } finally {
      setCourseBusy(false);
    }
  }, [loadCourse, settings]);

  // Memory State
  const [memory, setMemory] = React.useState<MemorySnapshot | undefined>(undefined);
  const [memoryBusy, setMemoryBusy] = React.useState(false);
  const [memoryError, setMemoryError] = React.useState<string | undefined>(undefined);

  const reloadMemory = React.useCallback(async () => {
    if (!loadMemory || !settings) return;
    setMemoryBusy(true);
    setMemoryError(undefined);
    try {
      const res = await loadMemory(settings);
      setMemory(res);
    } catch (e) {
      setMemoryError(String(e));
    } finally {
      setMemoryBusy(false);
    }
  }, [loadMemory, settings]);

  React.useEffect(() => {
    reloadCourse();
    reloadMemory();
  }, [reloadCourse, reloadMemory]);

  React.useEffect(() => {
    if (!subscribeSettings) return;
    return subscribeSettings(() => {
      reloadCourse();
      reloadMemory();
    });
  }, [subscribeSettings, reloadCourse, reloadMemory]);

  // Manager/Fix Plan State
  const [showFixPlan, setShowFixPlan] = React.useState(false);
  const [managerPlan, setManagerPlan] = React.useState<FixPlan | undefined>(undefined);
  const [managerDeleteKeys, setManagerDeleteKeys] = React.useState(false);
  const [managerBusy, setManagerBusy] = React.useState(false);
  const [managerResult, setManagerResult] = React.useState<ManagerApplyResult | undefined>(undefined);
  const [managerBackups, setManagerBackups] = React.useState<Record<string, string> | undefined>(undefined);

  // If no manual plan is set, we might show the hook's auto-generated lint fix plan in some UI, 
  // but usually Manager UI works on `managerPlan` state.
  // We can initialize managerPlan from hookFixPlan if desired, but usually it's triggered by button.

  const managerPlanText = React.useMemo(() => {
    const p = managerPlan ?? hookFixPlan;
    if (!p) return undefined;
    return JSON.stringify(p, null, 2);
  }, [managerPlan, hookFixPlan]);

  const managerArmed = React.useMemo(() => {
    // Armed if there is a plan with updates
    return (managerPlan?.fileUpdates?.length ?? 0) > 0;
  }, [managerPlan]);

  // Just a setter wrapper to match usage if code calls setManagerArmed
  const setManagerArmed = (armed: boolean) => {
    // No-op if derived, or clear plan if false?
    if (!armed) setManagerPlan(undefined);
  };

  // --- Styles & Helpers ---

  const selectStyle = {
    background: "var(--background-modifier-form-field)",
    color: "var(--text-normal)",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "4px",
    padding: "4px 8px",
    fontSize: "0.9em",
  };

  const buttonStyle = {
    cursor: "pointer",
    background: "var(--interactive-accent)",
    color: "var(--text-on-accent)",
    border: "none",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "0.9em",
    marginLeft: "8px",
  };
  const disabledButtonStyle = {
    ...buttonStyle,
    background: "var(--background-modifier-border)",
    color: "var(--text-muted)",
    cursor: "not-allowed",
  };
  const textButtonStyle = {
    background: "none",
    border: "none",
    padding: 0,
    color: "var(--text-accent)",
    cursor: "pointer",
    textDecoration: "underline",
    fontSize: "inherit",
  };

  const onBtnMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.disabled) e.currentTarget.style.opacity = "0.9";
  };
  const onBtnMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.opacity = "1";
  };
  const onBtnFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    e.currentTarget.style.boxShadow = "0 0 0 2px var(--background-modifier-border)";
  };
  const onBtnBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
    e.currentTarget.style.boxShadow = "none";
  };
  const onTextBtnMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = "var(--text-accent-hover)";
  };
  const onTextBtnMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.color = "var(--text-accent)";
  };
  const onTextBtnFocus = (e: React.FocusEvent<HTMLButtonElement>) => {
    e.currentTarget.style.textDecoration = "none";
  };
  const onTextBtnBlur = (e: React.FocusEvent<HTMLButtonElement>) => {
    e.currentTarget.style.textDecoration = "underline";
  };

  // Mini Cell Interaction (Heatmap)
  const onMiniCellMouseEnter = (e: any) => {
    e.currentTarget.style.transform = "scale(1.2)";
    e.currentTarget.style.zIndex = "1";
  };
  const onMiniCellMouseLeave = (e: any) => {
    e.currentTarget.style.transform = "scale(1)";
    e.currentTarget.style.zIndex = "0";
  };
  const onMiniCellFocus = (e: any) => {
    e.currentTarget.style.outline = "2px solid var(--interactive-accent)";
  };
  const onMiniCellBlur = (e: any) => {
    e.currentTarget.style.outline = "none";
  };

  const getDayOfMonth = (iso: string) => {
    if (!iso) return 1;
    return parseInt(iso.slice(8, 10), 10) || 1;
  };

  const calendarMaxAbs = React.useMemo(() => {
    if (!calendarCells) return 1;
    let max = 0;
    for (const c of calendarCells) {
      if (Math.abs(c.netR) > max) max = Math.abs(c.netR);
    }
    return max > 0 ? max : 1;
  }, [calendarCells]);

  const can = (actionId: string) => integrations?.isCapabilityAvailable(actionId as any) ?? false;
  const action = (actionId: string) => integrations?.run(actionId as any);

  const galleryItems = React.useMemo((): GalleryItem[] => {
    if (!getResourceUrl) return [];
    const out: GalleryItem[] = [];
    const seen = new Set<string>();
    const isImage = (p: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(p);

    for (const t of trades) {
      const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
      const rawCover = (fm as any)["cover"] ?? (fm as any)["封面/cover"];
      const ref = parseCoverRef(rawCover);
      if (!ref) continue;

      let target = ref;
      // 解析 markdown link 的 target 可能带引号/空格
      target = String(target).trim();
      if (!target) continue;

      const resolved = resolveLink ? resolveLink(target, t.path) : target;
      if (!resolved || !isImage(resolved)) continue;
      if (seen.has(resolved)) continue;
      seen.add(resolved);

      const url = getResourceUrl(resolved);
      out.push({ tradePath: t.path, coverPath: resolved, url });
      if (out.length >= 48) break;
    }

    return out;
  }, [trades, resolveLink, getResourceUrl]);

  // Computations now handled by useDashboardData hook

  const strategyPicks = React.useMemo(() => {
    if (!latestTrade) return [];
    const fm = (latestTrade.rawFrontmatter ?? {}) as Record<string, any>;
    const patternsRaw =
      fm["patterns"] ??
      fm["形态/patterns"] ??
      fm["观察到的形态/patterns_observed"];
    const patterns = Array.isArray(patternsRaw)
      ? patternsRaw
        .filter((x: any) => typeof x === "string")
        .map((s: string) => s.trim())
        .filter(Boolean)
      : typeof patternsRaw === "string"
        ? patternsRaw
          .split(/[,，;；/|]/g)
          .map((s: string) => s.trim())
          .filter(Boolean)
        : [];
    const marketCycle = (fm["market_cycle"] ??
      fm["市场周期/market_cycle"]) as any;
    const marketCycleStr =
      todayMarketCycle ??
      (typeof marketCycle === "string" ? marketCycle.trim() : undefined);
    const setupCategory = (fm["setup_category"] ??
      fm["设置类别/setup_category"]) as any;
    const setupCategoryStr =
      typeof setupCategory === "string" ? setupCategory.trim() : undefined;
    return matchStrategies(strategyIndex, {
      marketCycle: marketCycleStr,
      setupCategory: setupCategoryStr,
      patterns,
      limit: 6,
    });
  }, [latestTrade, strategyIndex, todayMarketCycle]);



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
              复习
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

      {latestTrade && reviewHints.length > 0 && (
        <div
          style={{
            border: "1px solid var(--background-modifier-border)",
            borderRadius: "10px",
            padding: "12px",
            marginBottom: "16px",
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
                <div style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
                  {h.en}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        style={{
          background: "var(--background-secondary)",
          border: "1px solid var(--background-modifier-border)",
          borderRadius: "12px",
          padding: "20px",
          marginBottom: "24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <span style={{ fontSize: "1.4em" }}>📊</span>
          <div style={{ fontSize: "1.2em", fontWeight: 700, color: "var(--text-normal)" }}>
            今日实时监控 (Today's Dashboard) - {todayIso}
          </div>
        </div>

        {/* Create Journal Button */}
        <button
          type="button"
          onClick={() => {
            if (todayContext && todayContext.openTodayNote) {
              todayContext.openTodayNote();
            } else {
              // Fallback: simple implementation or notice
              new Notice("正在打开今日笔记...");
              // Ideally trigger command or use app.workspace.openLinkText
            }
          }}
          style={{
            width: "100%",
            border: "1px dashed var(--text-muted)",
            background: "rgba(var(--mono-rgb-100), 0.05)",
            color: "var(--text-muted)",
            padding: "12px",
            borderRadius: "8px",
            cursor: "pointer",
            marginBottom: "20px",
            fontSize: "0.95em",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px"
          }}
        >
          📝 创建今日日记 并设置市场周期以获取策略推荐
        </button>

        {/* Market Cycle Strategy Recommendations */}
        {todayMarketCycle && todayStrategyPicks.length > 0 && (
          <div style={{ marginBottom: "20px", padding: "12px", background: "rgba(var(--mono-rgb-100), 0.03)", borderRadius: "8px" }}>
            <div style={{ fontSize: "0.9em", color: "var(--text-muted)", marginBottom: "10px" }}>
              💡 基于当前市场周期 <span style={{ color: "var(--text-accent)", fontWeight: 600 }}>[{todayMarketCycle}]</span> 的策略建议：
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {todayStrategyPicks.map((s) => (
                <button
                  key={`rec-${s.path}`}
                  type="button"
                  onClick={() => openFile(s.path)}
                  style={{
                    border: "1px solid var(--interactive-accent)",
                    background: "rgba(var(--interactive-accent-rgb), 0.1)",
                    color: "var(--text-on-accent)",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontSize: "0.85em",
                    // @ts-ignore
                    "--text-on-accent": "var(--text-normal)", // Fallback if var not defined
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--interactive-accent)";
                    e.currentTarget.style.color = "var(--text-on-accent-inverted)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(var(--interactive-accent-rgb), 0.1)";
                    e.currentTarget.style.color = "var(--text-normal)";
                  }}
                >
                  {s.canonicalName}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stats Grid (5 Cards) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "20px" }}>
          <StatsCard
            title="总交易"
            value={todaySummary.All.countTotal}
            color="var(--text-accent)"
          />
          <StatsCard
            title="获胜"
            value={todaySummary.All.countWins}
            color="var(--text-success)"
          />
          <StatsCard
            title="亏损"
            value={todaySummary.All.countLosses}
            color="var(--text-error)"
          />
          <StatsCard
            title="胜率"
            value={`${todaySummary.All.winRatePct}%`}
            color="var(--text-warning)"
          />
          <StatsCard
            title="净利润"
            value={`${todaySummary.All.netProfit > 0 ? "+" : ""}${todaySummary.All.netProfit.toFixed(1)}R`}
            color={todaySummary.All.netProfit >= 0 ? "var(--text-success)" : "var(--text-error)"}
          />
        </div>

        {/* Recent Trades Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "12px",
          color: "var(--text-muted)",
          fontSize: "0.9em"
        }}>
          <span>🕒 最近交易记录</span>
        </div>

        {/* Create Trade Button - Bottom */}
        {todayTrades.length === 0 && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-faint)", fontSize: "0.9em" }}>
            🦅 今日暂无交易记录
          </div>
        )}

        <div style={{ borderTop: "1px solid var(--background-modifier-border)", paddingTop: "16px", marginTop: "16px" }}>
          <button
            type="button"
            disabled={!can("quickadd:new-live-trade")}
            onClick={() => action("quickadd:new-live-trade")}
            style={{
              width: "100%",
              background: "rgba(var(--color-green-rgb), 0.2)",
              border: "1px solid rgba(var(--color-green-rgb), 0.4)",
              color: "var(--text-success)",
              padding: "12px",
              borderRadius: "6px",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: "1em",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.2s ease"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(var(--color-green-rgb), 0.3)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(var(--color-green-rgb), 0.2)";
            }}
          >
            📝 创建新交易笔记 (图表分析 → 形态识别 → 策略匹配)
          </button>
        </div>

      </div>

      <Strategies picks={strategyPicks} onOpenFile={openFile} />





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
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "0.9em",
            marginBottom: "10px",
          }}
        >
          市场周期：{todayMarketCycle ?? "—"}
        </div>

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
                  策略：{" "}
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
                  {(openTradeStrategy.stopLossRecommendation?.length ?? 0) >
                    0 && (
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
                        {openTradeStrategy
                          .riskAlerts!.slice(0, 3)
                          .map((x, i) => (
                            <li key={`risk-${i}`}>{x}</li>
                          ))}
                      </ul>
                    </div>
                  )}
                  {(openTradeStrategy.takeProfitRecommendation?.length ?? 0) >
                    0 && (
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
              </div>
            ) : (
              <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                未找到匹配策略。
              </div>
            )}
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
                  到期 {memory.focusFile.due}
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
                    title={`${c.dateIso} • ${c.count} 笔 • ${c.netR >= 0 ? "+" : ""
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
      </div>

      <Gallery
        items={galleryItems}
        available={!!getResourceUrl}
        onOpenFile={openFile}
      />

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
                {managerPlanText ?? ""}
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

      {/* Main Content Area */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "20px" }}>

        {/* Strategy Repository (Gap Restoration) */}
        <StrategyList strategies={strategies as any[]} onOpenFile={openFile} />

        {/* Analytics Gap Restoration */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <ContextWidget data={contextAnalysis} />
          <ErrorWidget data={errorAnalysis} />
        </div>

        {/* Trade Feed */}
        <div>
          <h3 style={{ marginBottom: "12px" }}>最近活动</h3>
          <TradeList trades={trades.slice(0, 50)} onOpenFile={openFile} />
        </div>
      </div>
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
        .filter((f: TFile) => (prefix ? f.path.startsWith(prefix) : true));
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

    const loadCourse = async (
      settings: AlBrooksConsoleSettings
    ): Promise<CourseSnapshot> => {
      const syllabusName = "PA_Syllabus_Data.md";
      const syFile = this.app.vault
        .getMarkdownFiles()
        .find((f: TFile) => f.name === syllabusName);
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
        .filter((f: TFile) => !f.path.startsWith("Templates/"));
      const picked = files.filter((f: TFile) => {
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
          applyFixPlan={applyFixPlan}
          restoreFiles={restoreFiles}
          settings={this.getSettings()}
          subscribeSettings={this.subscribeSettings}
          loadCourse={loadCourse}
          loadMemory={loadMemory}
          integrations={this.integrations}
          openFile={openFile}
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
