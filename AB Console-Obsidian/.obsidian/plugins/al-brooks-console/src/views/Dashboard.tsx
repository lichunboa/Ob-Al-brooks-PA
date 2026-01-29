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
import { ConsoleProvider } from "../context/ConsoleContext";
import { ConsoleContent } from "./ConsoleContent";
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
  private saveSettingsCallback: (settings: AlBrooksConsoleSettings) => Promise<void>;

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
    ) => () => void,
    saveSettings: (settings: AlBrooksConsoleSettings) => Promise<void>
  ) {
    super(leaf);
    this.index = index;
    this.strategyIndex = strategyIndex;
    this.todayContext = todayContext;
    this.integrations = integrations;
    this.version = version;
    this.getSettings = getSettings;
    this.subscribeSettings = subscribeSettings;
    this.saveSettingsCallback = saveSettings;
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
        <ConsoleProvider
          index={this.index}
          strategyIndex={this.strategyIndex}
          todayContext={this.todayContext}
          settings={this.getSettings()}
          onSaveSettings={async (s) => {
            await this.saveSettingsCallback(s);
          }}
          app={this.app}
          version={this.version}
          openFile={async (path) => {
            this.app.workspace.openLinkText(path, "", true);
          }}
          resolveLink={resolveLink}
          getResourceUrl={getResourceUrl}
          runCommand={(commandId) =>
            (this.app as any).commands?.executeCommandById?.(commandId)
          }
          openGlobalSearch={openGlobalSearch}
          promptText={promptText}
          confirmDialog={confirmDialog}
          loadStrategyNotes={loadStrategyNotes}
          loadPaTagSnapshot={loadPaTagSnapshot}
          loadAllFrontmatterFiles={loadAllFrontmatterFiles}
          applyFixPlan={applyFixPlan}
          restoreFiles={restoreFiles}
          createTradeNote={createTradeNote}
          loadCourse={loadCourse}
          loadMemory={loadMemory}
          integrations={this.integrations}
          enumPresets={enumPresets}
        >
          <ConsoleContent />
        </ConsoleProvider>
      </ConsoleErrorBoundary>
    );
  }

  async onClose() {
    this.root?.unmount();
    this.root = null;
    this.mountEl = null;
  }
}
