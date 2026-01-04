import { App, TFile } from "obsidian";
import type { TodayContext } from "../../core/today-context";
import type { Unsubscribe } from "../../core/trade-index";
import { getFirstFieldValue } from "../../core/field-mapper";
import { normalizeMarketCycleForAnalytics } from "../../core/analytics";

const TODAY_FIELD_ALIASES = {
  marketCycle: [
    "marketCycleKey",
    "market_cycle_key",
    "cycle",
    "market_cycle",
    "marketCycle",
    "市场周期/market_cycle",
    "市场周期",
  ],
} as const;

function toLocalDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toString(v: unknown): string | undefined {
  if (Array.isArray(v)) {
    if (v.length > 0 && typeof v[0] === "string") return v[0].trim();
    return undefined;
  }
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function pickTodayJournalFile(app: App, todayIso: string): TFile | undefined {
  // todayIso is YYYY-MM-DD
  const yyyy = todayIso.slice(0, 4);
  const yy = todayIso.slice(2, 4);
  const mm = todayIso.slice(5, 7);
  const dd = todayIso.slice(8, 10);

  const candidatesSet = new Set<string>();
  candidatesSet.add(`${yyyy}-${mm}-${dd}`); // 2026-01-03
  candidatesSet.add(`${yyyy}${mm}${dd}`); // 20260103
  candidatesSet.add(`${yy}${mm}${dd}`); // 260103

  const files = app.vault.getMarkdownFiles();
  const candidates = files.filter((f) => {
    // Check if basename starts with any of the candidate date strings
    for (const pattern of candidatesSet) {
      if (
        f.basename === pattern ||
        f.basename.startsWith(pattern + "_") ||
        f.basename.startsWith(pattern + " ")
      ) {
        return true;
      }
    }
    return false;
  });

  if (candidates.length === 0) return undefined;

  // Prefer Daily folder if present.
  const daily = candidates.filter(
    (f) =>
      f.path.toLowerCase().includes("/daily/") || f.path.startsWith("Daily/")
  );
  if (daily.length > 0) {
    daily.sort((a, b) => a.path.length - b.path.length);
    return daily[0];
  }

  candidates.sort((a, b) => a.path.length - b.path.length);
  return candidates[0];
}

export class ObsidianTodayContext implements TodayContext {
  private app: App;
  private todayIso: string;
  private todayFile?: TFile;
  private marketCycle?: string;
  private unsubscribers: Unsubscribe[] = [];
  private listeners: Set<() => void> = new Set();
  private initialized = false;

  constructor(app: App) {
    this.app = app;
    this.todayIso = toLocalDateIso(new Date());
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.refresh();

    const off = this.app.metadataCache.on("changed", (file) => {
      if (!(file instanceof TFile)) return;
      if (!this.todayFile) return;
      if (file.path !== this.todayFile.path) return;
      const prev = this.marketCycle;
      this.marketCycle = this.readMarketCycle(file);
      if (prev !== this.marketCycle) this.emitChanged();
    });
    this.unsubscribers.push(() => this.app.metadataCache.offref(off));
  }

  public getTodayMarketCycle(): string | undefined {
    return this.marketCycle;
  }

  public async openTodayNote(): Promise<void> {
    if (this.todayFile) {
      await this.app.workspace.getLeaf(false).openFile(this.todayFile);
      return;
    }
    // Fallback: try to execute Daily Notes command
    // This handles creation if it doesn't exist.
    const ran = (this.app as any).commands?.executeCommandById("daily-notes");
    if (ran === false) {
      console.warn("Daily Notes command not found or failed.");
      // Try 'periodic-notes:open-daily-note' if Periodic Notes is used
      (this.app as any).commands?.executeCommandById(
        "periodic-notes:open-daily-note"
      );
    }
  }

  public onChanged(handler: () => void): Unsubscribe {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  public dispose(): void {
    for (const u of this.unsubscribers) u();
    this.unsubscribers = [];
    this.listeners.clear();
  }

  private emitChanged() {
    for (const h of this.listeners) {
      try {
        h();
      } catch (e) {
        console.warn("[al-brooks-console] TodayContext listener error", e);
      }
    }
  }

  private refresh() {
    this.todayFile = pickTodayJournalFile(this.app, this.todayIso);
    this.marketCycle = this.todayFile
      ? this.readMarketCycle(this.todayFile)
      : undefined;
    this.emitChanged();
  }

  private readMarketCycle(file: TFile): string | undefined {
    const cache = this.app.metadataCache.getFileCache(file);
    const fm = cache?.frontmatter as Record<string, unknown> | undefined;
    if (!fm) return undefined;
    const raw = getFirstFieldValue(fm as any, TODAY_FIELD_ALIASES.marketCycle);
    return normalizeMarketCycleForAnalytics(raw);
  }
}
