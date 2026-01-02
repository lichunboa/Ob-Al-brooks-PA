import { App, TFile } from "obsidian";
import type { TodayContext } from "../../core/today-context";
import type { Unsubscribe } from "../../core/trade-index";
import { getFirstFieldValue } from "../../core/field-mapper";

const TODAY_FIELD_ALIASES = {
	marketCycle: ["market_cycle", "marketCycle", "市场周期/market_cycle", "市场周期"],
} as const;

function toLocalDateIso(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

function toString(v: unknown): string | undefined {
	if (typeof v !== "string") return undefined;
	const s = v.trim();
	return s.length ? s : undefined;
}

function pickTodayJournalFile(app: App, todayIso: string): TFile | undefined {
	const files = app.vault.getMarkdownFiles();
	const candidates = files.filter((f) => f.basename === todayIso || f.basename.startsWith(todayIso));
	if (candidates.length === 0) return undefined;

	// Prefer Daily folder if present.
	const daily = candidates.filter((f) => f.path.toLowerCase().includes("/daily/") || f.path.startsWith("Daily/"));
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
		this.marketCycle = this.todayFile ? this.readMarketCycle(this.todayFile) : undefined;
		this.emitChanged();
	}

	private readMarketCycle(file: TFile): string | undefined {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		if (!fm) return undefined;
		return toString(getFirstFieldValue(fm as any, TODAY_FIELD_ALIASES.marketCycle));
	}
}
