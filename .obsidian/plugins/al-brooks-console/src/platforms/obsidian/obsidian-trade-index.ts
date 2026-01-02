import { App, TFile } from "obsidian";
import type { TradeIndex } from "../../core/trade-index";
import type { TradeRecord } from "../../core/contracts";
import { FIELD_ALIASES, getFirstFieldValue, normalizeOutcome, normalizeTag, parseNumber } from "../../core/field-mapper";

type Listener = () => void;

export class ObsidianTradeIndex implements TradeIndex {
	private app: App;
	private listeners: Set<Listener> = new Set();
	private db: Map<string, TradeRecord> = new Map();

	private disposers: Array<() => void> = [];

	constructor(app: App) {
		this.app = app;
	}

	public async initialize() {
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			await this.indexFile(file);
		}
		this.registerListeners();
		this.emitChanged();
	}

	public getAll(): TradeRecord[] {
		return Array.from(this.db.values()).sort((a, b) => b.dateIso.localeCompare(a.dateIso));
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
	}

	private emitChanged() {
		for (const listener of this.listeners) listener();
	}

	private registerListeners() {
		// rename
		this.disposers.push(
			this.app.vault.on("rename", (file, oldPath) => {
				if (!(file instanceof TFile)) return;
				if (!this.db.has(oldPath)) return;
				const existing = this.db.get(oldPath);
				if (!existing) return;
				existing.path = file.path;
				existing.name = file.name;
				this.db.delete(oldPath);
				this.db.set(file.path, existing);
				this.emitChanged();
			}) as unknown as () => void
		);

		// delete
		this.disposers.push(
			this.app.vault.on("delete", (file) => {
				if (!(file instanceof TFile)) return;
				if (!this.db.has(file.path)) return;
				this.db.delete(file.path);
				this.emitChanged();
			}) as unknown as () => void
		);

		// metadata changed (covers frontmatter/tag edits)
		this.disposers.push(
			this.app.metadataCache.on("changed", (file) => {
				if (!(file instanceof TFile)) return;
				void this.indexFile(file, true);
			}) as unknown as () => void
		);
	}

	private async indexFile(file: TFile, triggerUpdate = false) {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;

		if (!fm) {
			if (this.db.delete(file.path) && triggerUpdate) this.emitChanged();
			return;
		}

		// 当前实现先保持“宽松识别”以避免误漏；严格的 #PA/Trade 识别将在 Task 3 落地。
		const tags = (Array.isArray(fm.tags) ? fm.tags : []) as unknown[];
		const normalizedTags = tags
			.filter((t): t is string => typeof t === "string")
			.map(normalizeTag);

		const isTradeTag = normalizedTags.some((t) => t.toLowerCase().includes("trade"));
		const hasTradeProps = fm.ticker !== undefined && (fm.setup !== undefined || fm.pnl !== undefined);
		const isInTradeFolder =
			file.path.includes("Trading") ||
			file.path.includes("TradeNotes") ||
			file.path.includes("Start") ||
			file.path.includes("Daily");

		if (!isTradeTag && !hasTradeProps && !isInTradeFolder) {
			if (this.db.delete(file.path) && triggerUpdate) this.emitChanged();
			return;
		}

		const pnlRaw = getFirstFieldValue(fm, FIELD_ALIASES.pnl);
		const tickerRaw = getFirstFieldValue(fm, FIELD_ALIASES.ticker);
		const outcomeRaw = getFirstFieldValue(fm, FIELD_ALIASES.outcome);
		const dateRaw = getFirstFieldValue(fm, FIELD_ALIASES.date);

		const pnl = parseNumber(pnlRaw);
		const ticker = typeof tickerRaw === "string" ? tickerRaw : undefined;
		const outcome = normalizeOutcome(outcomeRaw);
		const dateIso = typeof dateRaw === "string" ? dateRaw : file.basename.substring(0, 10);

		// 进一步放宽：trade folder 内即使缺字段也允许进入索引（后续由 Inspector/Manager 处理）。
		if (!isTradeTag && !ticker && pnl === undefined && !isInTradeFolder) {
			if (this.db.delete(file.path) && triggerUpdate) this.emitChanged();
			return;
		}

		const trade: TradeRecord = {
			path: file.path,
			name: file.name,
			dateIso: String(dateIso),
			ticker,
			pnl,
			outcome,
			mtime: file.stat?.mtime,
			tags: normalizedTags,
			rawFrontmatter: fm,
		};

		this.db.set(file.path, trade);
		if (triggerUpdate) this.emitChanged();
	}
}
