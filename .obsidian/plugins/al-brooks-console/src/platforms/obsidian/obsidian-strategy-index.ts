import { App, EventRef, TFile } from "obsidian";
import type { StrategyCard, StrategyIndex } from "../../core/strategy-index";
import { getFirstFieldValue, normalizeTag } from "../../core/field-mapper";

const STRATEGY_TAG = "PA/Strategy";

const STRATEGY_FIELD_ALIASES = {
  canonicalName: [
    "策略名称/strategy_name",
    "strategy_name",
    "strategyName",
    "name",
  ],
  statusRaw: [
    "状态/status",
    "status",
    "strategy_status",
    "strategyStatus",
    "statusRaw",
  ],
  riskReward: [
    "风险收益比/risk_reward",
    "risk_reward",
    "riskReward",
    "R/R",
    "RR",
  ],
  source: ["来源/source", "source"],
  marketCycle: ["市场周期/market_cycle", "market_cycle", "marketCycle"],
  setupCategory: ["设置类别/setup_category", "setup_category", "setupCategory"],
  patternsObserved: [
    "观察到的形态/patterns_observed",
    "patterns_observed",
    "patterns",
  ],
  signalBarQuality: [
    "信号K/signal_bar_quality",
    "signal_bar_quality",
    "signalBarQuality",
  ],
  entryCriteria: ["入场条件/entry_criteria", "entry_criteria", "entryCriteria"],
  riskAlerts: ["风险提示/risk_alerts", "risk_alerts", "riskAlerts"],
  stopLossRecommendation: [
    "止损建议/stop_loss_recommendation",
    "stop_loss_recommendation",
    "stopLossRecommendation",
  ],
  takeProfitRecommendation: [
    "目标建议/take_profit_recommendation",
    "take_profit_recommendation",
    "takeProfitRecommendation",
  ],
} as const;

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v))
    return v
      .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      .map((s) => s.trim());
  if (typeof v === "string")
    return v
      .split(/[,，;；/|]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function toString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function isStrategyFile(app: App, file: TFile): boolean {
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter as Record<string, unknown> | undefined;
  const cacheTags = (cache?.tags ?? []).map((t) => t.tag);
  const fmTagsRaw = fm?.tags as unknown;
  const fmTags = Array.isArray(fmTagsRaw)
    ? fmTagsRaw.filter((t): t is string => typeof t === "string")
    : typeof fmTagsRaw === "string"
    ? [fmTagsRaw]
    : [];
  const normalized = [...cacheTags, ...fmTags].map(normalizeTag);
  return normalized.some((t) => t.toLowerCase() === STRATEGY_TAG.toLowerCase());
}

function splitCnEn(name: string): { cn?: string; en?: string } {
  const m = name.match(/^(.*?)\((.*?)\)\s*$/);
  if (!m) return {};
  const cn = m[1]?.trim();
  const en = m[2]?.trim();
  return { cn: cn || undefined, en: en || undefined };
}

export interface ObsidianStrategyIndexOptions {
  repoPath?: string;
}

export class ObsidianStrategyIndex implements StrategyIndex {
  private app: App;
  private repoPath: string;
  private cards: StrategyCard[] = [];
  private byNameMap: Map<string, StrategyCard> = new Map();
  private lookupMap: Map<string, string> = new Map();
  private byPatternMap: Map<string, string> = new Map();
  private initialized = false;
  private eventRefs: EventRef[] = [];
  private listeners: Set<() => void> = new Set();
  private rebuildTimer: number | null = null;

  constructor(app: App, options: ObsidianStrategyIndexOptions = {}) {
    this.app = app;
    this.repoPath = (options.repoPath ?? "策略仓库 (Strategy Repository)")
      .replace(/^\/+/, "")
      .trim();
    if (this.repoPath.endsWith("/")) this.repoPath = this.repoPath.slice(0, -1);
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    const schedule = () => this.scheduleRebuild();

    // Metadata cache may not be ready on first render; wait for resolved.
    this.eventRefs.push(this.app.metadataCache.on("resolved", schedule));

    // Watch repo file changes to keep Strategy Repository live without plugin reload.
    this.eventRefs.push(
      this.app.vault.on("create", (file) => {
        if (this.shouldWatchFile(file)) schedule();
      })
    );
    this.eventRefs.push(
      this.app.vault.on("modify", (file) => {
        if (this.shouldWatchFile(file)) schedule();
      })
    );
    this.eventRefs.push(
      this.app.vault.on("delete", (file) => {
        if (this.shouldWatchFile(file)) schedule();
      })
    );
    this.eventRefs.push(
      this.app.vault.on("rename", (file) => {
        if (this.shouldWatchFile(file)) schedule();
      })
    );

    // Kick off an initial build (best-effort). A later "resolved" will rebuild again.
    this.scheduleRebuild(0);
  }

  public list(): StrategyCard[] {
    return this.cards;
  }

  public byName(name: string): StrategyCard | undefined {
    return this.byNameMap.get(name);
  }

  public lookup(alias: string): StrategyCard | undefined {
    const key = alias.trim();
    if (!key) return undefined;
    const canonical =
      this.lookupMap.get(key) ?? this.lookupMap.get(key.toLowerCase());
    if (!canonical) return undefined;
    return this.byNameMap.get(canonical);
  }

  public byPattern(pattern: string): StrategyCard | undefined {
    const key = pattern.trim();
    if (!key) return undefined;
    const canonical =
      this.byPatternMap.get(key) ?? this.byPatternMap.get(key.toLowerCase());
    if (!canonical) return undefined;
    return this.byNameMap.get(canonical);
  }

  public onChanged(handler: () => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private emitChanged() {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch (e) {
        console.warn(
          "[al-brooks-console] StrategyIndex onChanged handler failed",
          e
        );
      }
    }
  }

  private scheduleRebuild(delayMs = 200) {
    if (this.rebuildTimer !== null) {
      window.clearTimeout(this.rebuildTimer);
    }
    this.rebuildTimer = window.setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuild();
      this.emitChanged();
    }, delayMs);
  }

  private shouldWatchFile(file: unknown): file is TFile {
    if (!(file instanceof TFile)) return false;
    if (file.extension !== "md") return false;
    const prefix = this.repoPath ? `${this.repoPath}/` : "";
    return prefix ? file.path.startsWith(prefix) : true;
  }

  private rebuild() {
    this.cards = [];
    this.byNameMap = new Map();
    this.lookupMap = new Map();
    this.byPatternMap = new Map();

    const prefix = this.repoPath ? `${this.repoPath}/` : "";
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => (prefix ? f.path.startsWith(prefix) : true));

    for (const file of files) {
      if (!isStrategyFile(this.app, file)) continue;
      const cache = this.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter as Record<string, unknown> | undefined;
      if (!fm) continue;

      const canonicalName =
        toString(
          getFirstFieldValue(fm as any, STRATEGY_FIELD_ALIASES.canonicalName)
        ) ?? file.basename;

      const statusRaw = toString(
        getFirstFieldValue(fm as any, STRATEGY_FIELD_ALIASES.statusRaw)
      );

      const riskReward = toString(
        getFirstFieldValue(fm as any, STRATEGY_FIELD_ALIASES.riskReward)
      );

      const source = toString(
        getFirstFieldValue(fm as any, STRATEGY_FIELD_ALIASES.source)
      );

      const marketCycles = toStringArray(
        getFirstFieldValue(fm as any, STRATEGY_FIELD_ALIASES.marketCycle)
      );
      const setupCategoriesRaw = getFirstFieldValue(
        fm as any,
        STRATEGY_FIELD_ALIASES.setupCategory
      );
      const setupCategories = setupCategoriesRaw
        ? toStringArray(setupCategoriesRaw)
        : [];
      const patternsObserved = toStringArray(
        getFirstFieldValue(fm as any, STRATEGY_FIELD_ALIASES.patternsObserved)
      );
      const signalBarQuality = toStringArray(
        getFirstFieldValue(fm as any, STRATEGY_FIELD_ALIASES.signalBarQuality)
      );
      const entryCriteria = toStringArray(
        getFirstFieldValue(fm as any, STRATEGY_FIELD_ALIASES.entryCriteria)
      );
      const riskAlerts = toStringArray(
        getFirstFieldValue(fm as any, STRATEGY_FIELD_ALIASES.riskAlerts)
      );
      const stopLossRecommendation = toStringArray(
        getFirstFieldValue(
          fm as any,
          STRATEGY_FIELD_ALIASES.stopLossRecommendation
        )
      );
      const takeProfitRecommendation = toStringArray(
        getFirstFieldValue(
          fm as any,
          STRATEGY_FIELD_ALIASES.takeProfitRecommendation
        )
      );

      const card: StrategyCard = {
        path: file.path,
        name: file.name,
        canonicalName,
        statusRaw,
        riskReward,
        source,
        marketCycles,
        setupCategories,
        patternsObserved,
        signalBarQuality,
        entryCriteria,
        riskAlerts,
        stopLossRecommendation,
        takeProfitRecommendation,
      };

      this.cards.push(card);
      this.byNameMap.set(canonicalName, card);

      this.addLookup(canonicalName, canonicalName);
      this.addLookup(file.basename, canonicalName);

      const { cn, en } = splitCnEn(canonicalName);
      if (cn) this.addLookup(cn, canonicalName);
      if (en) this.addLookup(en, canonicalName);

      for (const pat of patternsObserved) {
        this.byPatternMap.set(pat, canonicalName);
        this.byPatternMap.set(pat.toLowerCase(), canonicalName);
      }
    }

    this.cards.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  }

  private addLookup(alias: string, canonical: string) {
    const k = alias.trim();
    if (!k) return;
    this.lookupMap.set(k, canonical);
    this.lookupMap.set(k.toLowerCase(), canonical);
  }
}
