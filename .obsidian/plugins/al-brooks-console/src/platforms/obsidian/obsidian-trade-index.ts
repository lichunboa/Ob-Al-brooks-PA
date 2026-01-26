import { App, TFile } from "obsidian";
import type { TradeIndex, TradeIndexStatus } from "../../core/trade-index";
import type { TradeRecord } from "../../core/contracts";
import {
  FIELD_ALIASES,
  getFirstFieldValue,
  isTradeTag,
  normalizeAccountType,
  normalizeOutcome,
  normalizeString,
  normalizeStringArray,
  normalizeTag,
  normalizeTicker,
  parseNumber,
} from "../../core/field-mapper";

type Listener = () => void;

export interface ObsidianTradeIndexOptions {
  enableFileClass?: boolean;
  tradeFileClasses?: string[];
  /**
   * Optional path prefix allowlist to reduce scanning scope (mobile-friendly).
   * Example: ["Daily/Trades/"]
   */
  folderAllowlist?: string[];
  chunkSize?: number;
  debounceMs?: number;
  minEmitIntervalMs?: number;
}

export class ObsidianTradeIndex implements TradeIndex {
  private app: App;
  private listeners: Set<Listener> = new Set();
  private statusListeners: Set<Listener> = new Set();
  private db: Map<string, TradeRecord> = new Map();
  private enableFileClass: boolean;
  private tradeFileClassesLower: Set<string>;
  private folderAllowlistNormalized: string[];
  private folderDenylistNormalized: string[];
  private pendingPaths: Set<string> = new Set();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private debounceMs: number;
  private minEmitIntervalMs: number;
  private lastEmitAt = 0;
  private chunkSize: number;
  private status: TradeIndexStatus = { phase: "idle" };
  private initialized = false;
  private rebuildInFlight: Promise<void> | null = null;

  private disposers: Array<() => void> = [];

  constructor(app: App, options: ObsidianTradeIndexOptions = {}) {
    this.app = app;
    this.enableFileClass = options.enableFileClass ?? true;
    const defaults = ["PA_Metadata_Schema"];
    const configured = options.tradeFileClasses ?? defaults;
    this.tradeFileClassesLower = new Set(
      configured.map((s) => s.trim().toLowerCase()).filter(Boolean)
    );
    this.folderAllowlistNormalized = (options.folderAllowlist ?? [])
      .map((p) => p.replace(/^\/+/, "").trim())
      .filter(Boolean)
      .map((p) => (p.endsWith("/") ? p : `${p}/`));
    // Default denylist to prevent templates/exports/plugin internals from polluting indices.
    this.folderDenylistNormalized = ["Templates/", "Exports/", ".obsidian/"]
      .map((p) => p.replace(/^\/+/, "").trim())
      .filter(Boolean)
      .map((p) => (p.endsWith("/") ? p : `${p}/`));
    this.chunkSize = Math.max(25, options.chunkSize ?? 250);
    this.debounceMs = Math.max(50, options.debounceMs ?? 200);
    this.minEmitIntervalMs = Math.max(0, options.minEmitIntervalMs ?? 200);
  }

  private shouldIndexFile(path: string): boolean {
    const normalized = String(path ?? "").replace(/^\/+/, "");
    if (!normalized) return false;
    for (const p of this.folderDenylistNormalized) {
      if (normalized.startsWith(p)) return false;
    }
    return true;
  }

  private toLocalDateIso(d: Date): string {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
      return this.toLocalDateIso(new Date());
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  private isValidDateIso(iso: string): boolean {
    const m = String(iso ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
      return false;
    }
    if (mo < 1 || mo > 12) return false;
    if (d < 1 || d > 31) return false;

    const dt = new Date(Date.UTC(y, mo - 1, d));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === mo - 1 &&
      dt.getUTCDate() === d
    );
  }

  private parseDateIsoFromBasename(basename: string): string | null {
    const raw = String(basename ?? "");

    const m1 = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m1) {
      const iso = `${m1[1]}-${m1[2]}-${m1[3]}`;
      return this.isValidDateIso(iso) ? iso : null;
    }

    const m2 = raw.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m2) {
      const iso = `${m2[1]}-${m2[2]}-${m2[3]}`;
      return this.isValidDateIso(iso) ? iso : null;
    }

    const m3 = raw.match(/^(\d{2})(\d{2})(\d{2})/);
    if (m3) {
      const yy = Number(m3[1]);
      const y = yy >= 70 ? 1900 + yy : 2000 + yy;
      const iso = `${y}-${m3[2]}-${m3[3]}`;
      return this.isValidDateIso(iso) ? iso : null;
    }

    return null;
  }

  private normalizeDateIso(dateRaw: unknown, file: TFile): string {
    // 1) frontmatter date
    if (typeof dateRaw === "string") {
      const s = dateRaw.trim();
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m && this.isValidDateIso(m[1])) return m[1];
      const dt = new Date(s);
      if (!Number.isNaN(dt.getTime())) return this.toLocalDateIso(dt);
    } else if (dateRaw instanceof Date) {
      return this.toLocalDateIso(dateRaw);
    } else if (typeof dateRaw === "number" && Number.isFinite(dateRaw)) {
      const dt = new Date(dateRaw);
      if (!Number.isNaN(dt.getTime())) return this.toLocalDateIso(dt);
    }

    // 2) filename
    const fromName = this.parseDateIsoFromBasename(file.basename);
    if (fromName) return fromName;

    // 3) fallback to ctime/mtime
    const stampMs =
      (file.stat?.ctime as number | undefined) ??
      (file.stat?.mtime as number | undefined) ??
      Date.now();
    return this.toLocalDateIso(new Date(stampMs));
  }

  public async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.registerListeners();
    await this.rebuild();
  }

  public getStatus(): TradeIndexStatus {
    return this.status;
  }

  public onStatusChanged(handler: Listener) {
    this.statusListeners.add(handler);
    return () => {
      this.statusListeners.delete(handler);
    };
  }

  public async rebuild(): Promise<void> {
    if (this.rebuildInFlight) return this.rebuildInFlight;

    this.rebuildInFlight = (async () => {
      try {
        this.pendingPaths.clear();
        this.dirty = false;
        this.db.clear();
        this.setStatus({ phase: "building", processed: 0, total: 0 });

        const start =
          typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now();
        const files = this.getCandidateFilesForInitialBuild();
        const total = files.length;
        this.setStatus({ phase: "building", processed: 0, total });

        let processed = 0;
        for (const file of files) {
          try {
            this.indexFile(file);
          } catch (e) {
            console.warn(
              "[al-brooks-console] Failed to index file",
              file.path,
              e
            );
          }
          processed++;
          if (processed % this.chunkSize === 0) {
            this.setStatus({ phase: "building", processed, total });
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        const end =
          typeof performance !== "undefined" && performance.now
            ? performance.now()
            : Date.now();
        this.setStatus({
          phase: "ready",
          processed: total,
          total,
          lastBuildMs: Math.max(0, Math.round(end - start)),
        });
        this.emitChanged();

        // 如果构建期间积累了变更事件，构建完成后再 flush 一次。
        if (this.pendingPaths.size > 0 || this.dirty) {
          this.ensureFlushScheduled();
        }
      } catch (e) {
        console.warn("[al-brooks-console] TradeIndex rebuild failed", e);
        this.setStatus({
          phase: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    })();

    try {
      await this.rebuildInFlight;
    } finally {
      this.rebuildInFlight = null;
    }
  }

  public getAll(): TradeRecord[] {
    return Array.from(this.db.values()).sort((a, b) =>
      b.dateIso.localeCompare(a.dateIso)
    );
  }

  public onChanged(handler: Listener) {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  public dispose() {
    for (const disposer of this.disposers) disposer();
    this.disposers = [];
    this.listeners.clear();
    this.statusListeners.clear();
    this.pendingPaths.clear();
    this.dirty = false;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.rebuildInFlight = null;
  }

  private emitChanged() {
    const now = Date.now();
    if (
      this.minEmitIntervalMs > 0 &&
      now - this.lastEmitAt < this.minEmitIntervalMs
    ) {
      this.markDirty();
      return;
    }
    this.lastEmitAt = now;
    for (const listener of this.listeners) listener();
  }

  private emitStatusChanged() {
    for (const listener of this.statusListeners) listener();
  }

  private setStatus(next: TradeIndexStatus) {
    this.status = next;
    this.emitStatusChanged();
  }

  private registerListeners() {
    // modify (file content changes)
    this.disposers.push(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile)) return;
        this.queueReindex(file);
      }) as unknown as () => void
    );

    // rename
    this.disposers.push(
      this.app.vault.on("rename", (file, oldPath) => {
        if (!(file instanceof TFile)) return;
        const existing = this.db.get(oldPath);
        if (existing) {
          existing.path = file.path;
          existing.name = file.name;
          this.db.delete(oldPath);
          this.db.set(file.path, existing);
          this.markDirty();
        }
        // 无论之前是否已入库，都重新评估（可能从非 trade 变为 trade，或反之）。
        this.queueReindex(file);
      }) as unknown as () => void
    );

    // delete
    this.disposers.push(
      this.app.vault.on("delete", (file) => {
        if (!(file instanceof TFile)) return;
        if (this.db.delete(file.path)) this.markDirty();
      }) as unknown as () => void
    );

    // metadata changed (covers frontmatter/tag edits)
    this.disposers.push(
      this.app.metadataCache.on("changed", (file) => {
        if (!(file instanceof TFile)) return;
        this.queueReindex(file);
      }) as unknown as () => void
    );
  }

  private getCandidateFilesForInitialBuild(): TFile[] {
    const files = this.app.vault.getMarkdownFiles();
    const filteredByFolder = this.folderAllowlistNormalized.length
      ? files.filter((f) =>
        this.folderAllowlistNormalized.some((p) => f.path.startsWith(p))
      )
      : files;

    const filteredByPath = filteredByFolder.filter((f) =>
      this.shouldIndexFile(f.path)
    );

    return filteredByPath.filter((file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) return true;

      const normalizedTags = this.getNormalizedTagsFromFrontmatter(
        cache?.frontmatter
      );
      const hasTradeTag = normalizedTags.some(isTradeTag);
      if (hasTradeTag) return true;
      if (!this.enableFileClass) return false;
      const fileClassRaw = getFirstFieldValue(
        cache.frontmatter,
        FIELD_ALIASES.fileClass
      );
      const fileClasses = Array.isArray(fileClassRaw)
        ? fileClassRaw.filter((v): v is string => typeof v === "string")
        : typeof fileClassRaw === "string"
          ? [fileClassRaw]
          : [];
      return fileClasses.some((fc) =>
        this.tradeFileClassesLower.has(fc.trim().toLowerCase())
      );
    });
  }

  private markDirty() {
    this.dirty = true;
    this.ensureFlushScheduled();
  }

  private queueReindex(file: TFile) {
    this.pendingPaths.add(file.path);
    this.ensureFlushScheduled();
  }

  private ensureFlushScheduled() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushQueued();
    }, this.debounceMs);
  }

  private flushQueued() {
    const paths = Array.from(this.pendingPaths);
    this.pendingPaths.clear();

    let changed = false;
    for (const path of paths) {
      const af = this.app.vault.getAbstractFileByPath(path);
      if (af instanceof TFile) {
        try {
          changed = this.indexFile(af) || changed;
        } catch (e) {
          console.warn(
            "[al-brooks-console] Failed to reindex file",
            af.path,
            e
          );
        }
      } else {
        changed = this.db.delete(path) || changed;
      }
    }

    if (this.dirty) {
      changed = true;
      this.dirty = false;
    }

    if (changed) this.emitChanged();
  }

  private getNormalizedTagsFromFrontmatter(
    fm: Record<string, unknown> | undefined
  ): string[] {
    const fmTagsRaw = fm?.tags as unknown;
    const fmTags = Array.isArray(fmTagsRaw)
      ? fmTagsRaw.filter((t): t is string => typeof t === "string")
      : typeof fmTagsRaw === "string"
        ? [fmTagsRaw]
        : [];
    return fmTags.map(normalizeTag);
  }

  private indexFile(file: TFile): boolean {
    if (!this.shouldIndexFile(file.path)) {
      return this.db.delete(file.path);
    }

    const prev = this.db.get(file.path);
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter;
    const normalizedTags = this.getNormalizedTagsFromFrontmatter(fm);
    const hasTradeTag = normalizedTags.some(isTradeTag);

    if (!fm) {
      // 为避免文档/报告中的“#PA/Trade”文字（尤其在代码块/示例中）造成误入库，
      // 交易识别默认只信任 frontmatter tags 或 fileClass（需要 frontmatter）。
      return this.db.delete(file.path);
    }

    const fileClassRaw = getFirstFieldValue(fm, FIELD_ALIASES.fileClass);
    const fileClasses = Array.isArray(fileClassRaw)
      ? fileClassRaw.filter((v): v is string => typeof v === "string")
      : typeof fileClassRaw === "string"
        ? [fileClassRaw]
        : [];

    const hasTradeFileClass =
      this.enableFileClass &&
      fileClasses.some((fc) =>
        this.tradeFileClassesLower.has(fc.trim().toLowerCase())
      );

    if (!hasTradeTag && !hasTradeFileClass) {
      return this.db.delete(file.path);
    }

    const pnlRaw = getFirstFieldValue(fm, FIELD_ALIASES.pnl);
    const rRaw = getFirstFieldValue(fm, FIELD_ALIASES.r);
    const tickerRaw = getFirstFieldValue(fm, FIELD_ALIASES.ticker);
    const outcomeRaw = getFirstFieldValue(fm, FIELD_ALIASES.outcome);
    const dateRaw = getFirstFieldValue(fm, FIELD_ALIASES.date);
    const accountTypeRaw = getFirstFieldValue(fm, FIELD_ALIASES.accountType);

    const marketCycleRaw = getFirstFieldValue(fm, FIELD_ALIASES.marketCycle);
    const setupKeyRaw = getFirstFieldValue(fm, FIELD_ALIASES.setupKey);
    const setupCategoryRaw = getFirstFieldValue(
      fm,
      FIELD_ALIASES.setupCategory
    );
    const patternsObservedRaw = getFirstFieldValue(
      fm,
      FIELD_ALIASES.patternsObserved
    );
    const signalBarQualityRaw = getFirstFieldValue(
      fm,
      FIELD_ALIASES.signalBarQuality
    );
    const timeframeRaw = getFirstFieldValue(fm, FIELD_ALIASES.timeframe);
    const directionRaw = getFirstFieldValue(fm, FIELD_ALIASES.direction);
    const strategyNameRaw = getFirstFieldValue(fm, FIELD_ALIASES.strategyName);
    const managementPlanRaw = getFirstFieldValue(
      fm,
      FIELD_ALIASES.managementPlan
    );
    const orderTypeRaw = getFirstFieldValue(fm, FIELD_ALIASES.orderType);
    const executionQualityRaw = getFirstFieldValue(
      fm,
      FIELD_ALIASES.executionQuality
    );
    const coverRaw = getFirstFieldValue(fm, FIELD_ALIASES.cover);

    const entryPriceRaw = getFirstFieldValue(fm, FIELD_ALIASES.entryPrice);
    const stopLossRaw = getFirstFieldValue(fm, FIELD_ALIASES.stopLoss);
    const takeProfitRaw = getFirstFieldValue(fm, FIELD_ALIASES.takeProfit);
    const initialRiskRaw = getFirstFieldValue(fm, FIELD_ALIASES.initialRisk);
    const netProfitRaw = getFirstFieldValue(fm, FIELD_ALIASES.netProfit);

    // v5 对齐：严格区分金额(pnl)与比率(r)
    // 1. 优先读取显式的金额字段 (net_profit / pnl)
    let pnl = parseNumber(pnlRaw);
    const r = parseNumber(rRaw);
    const initialRisk = parseNumber(initialRiskRaw);

    // 2. 如果金额缺失，但有 R 和 风险额，则自动推算金额
    // 注意：严禁直接用 r 填充 pnl (例如 2R != $2.0)
    if (pnl === undefined && r !== undefined && initialRisk !== undefined) {
      pnl = r * initialRisk;
    }

    const ticker = normalizeTicker(tickerRaw);
    const outcome = normalizeOutcome(outcomeRaw);
    const dateIso = this.normalizeDateIso(dateRaw, file);
    const accountType = normalizeAccountType(accountTypeRaw);

    const marketCycle = normalizeString(marketCycleRaw);
    const setupKey = normalizeString(setupKeyRaw);
    const setupCategory = normalizeString(setupCategoryRaw);
    const patternsObserved = normalizeStringArray(patternsObservedRaw);
    const signalBarQuality = normalizeStringArray(signalBarQualityRaw);
    const timeframe = normalizeString(timeframeRaw);
    const direction = normalizeString(directionRaw);
    const strategyName = normalizeString(strategyNameRaw);

    // FIX: Management Plan values often contain slashes (e.g. "Set/Forget"), 
    // so we shouldn't use the default normalizeStringArray which splits on '/'.
    // We only split on commas and semicolons here.
    const managementPlan = Array.isArray(managementPlanRaw)
      ? managementPlanRaw.filter((x): x is string => typeof x === "string").map(s => s.trim())
      : typeof managementPlanRaw === "string"
        ? managementPlanRaw.split(/[,，;；]/g).map(s => s.trim()).filter(Boolean)
        : [];

    const orderType = normalizeString(orderTypeRaw);
    const executionQuality = normalizeString(executionQualityRaw);
    const cover = normalizeString(coverRaw);

    const entryPrice = parseNumber(entryPriceRaw);
    const stopLoss = parseNumber(stopLossRaw);
    const takeProfit = parseNumber(takeProfitRaw);
    const netProfit = parseNumber(netProfitRaw);

    const trade: TradeRecord = {
      path: file.path,
      name: file.name,
      dateIso,
      ticker,
      pnl,
      r,
      outcome,
      accountType,
      marketCycle,
      setupKey,
      setupCategory,
      patternsObserved,
      signalBarQuality,
      timeframe,
      direction,
      strategyName,
      managementPlan,
      orderType,
      executionQuality,
      cover,
      entryPrice,
      stopLoss,
      takeProfit,

      initialRisk,
      netProfit,
      mtime: file.stat?.mtime,
      tags: normalizedTags,
      rawFrontmatter: fm,
    };

    // [DEBUG] Log removed for performance
    // if (file.path.endsWith(".md")) { ... }

    this.db.set(file.path, trade);
    return !prev || JSON.stringify(prev) !== JSON.stringify(trade);
  }
}
