import { App, TFile } from "obsidian";
import type { TradeIndex } from "../../core/trade-index";
import type { TradeRecord } from "../../core/contracts";
import {
	FIELD_ALIASES,
	getFirstFieldValue,
	isTradeTag,
	normalizeOutcome,
	normalizeTag,
	normalizeTicker,
	parseNumber,
} from "../../core/field-mapper";

type Listener = () => void;

export interface ObsidianTradeIndexOptions {
	enableFileClass?: boolean;
	tradeFileClasses?: string[];
}

export class ObsidianTradeIndex implements TradeIndex {
	private app: App;
	private listeners: Set<Listener> = new Set();
	private db: Map<string, TradeRecord> = new Map();
	private enableFileClass: boolean;
	private tradeFileClassesLower: Set<string>;

	private disposers: Array<() => void> = [];

	constructor(app: App, options: ObsidianTradeIndexOptions = {}) {
		this.app = app;
		this.enableFileClass = options.enableFileClass ?? true;
		const defaults = ["PA_Metadata_Schema"];
		const configured = options.tradeFileClasses ?? defaults;
		this.tradeFileClassesLower = new Set(configured.map((s) => s.trim().toLowerCase()).filter(Boolean));
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
		const cacheTags = (cache?.tags ?? []).map((t) => t.tag);
		const fmTagsRaw = fm?.tags;
		const fmTags = Array.isArray(fmTagsRaw)
			? fmTagsRaw.filter((t): t is string => typeof t === "string")
			: typeof fmTagsRaw === "string"
				? [fmTagsRaw]
				: [];

		const normalizedTags = [...cacheTags, ...fmTags].map(normalizeTag);
		const hasTradeTag = normalizedTags.some(isTradeTag);

		if (!fm) {
			// 允许：仅靠 tag（包含 inline tag）识别的交易笔记，即使没有 frontmatter。
			if (!hasTradeTag) {
				if (this.db.delete(file.path) && triggerUpdate) this.emitChanged();
				return;
			}

			const trade: TradeRecord = {
				path: file.path,
				name: file.name,
				dateIso: file.basename.substring(0, 10),
				tags: normalizedTags,
				mtime: file.stat?.mtime,
			};

			this.db.set(file.path, trade);
			if (triggerUpdate) this.emitChanged();
			return;
		}

		const fileClassRaw = getFirstFieldValue(fm, FIELD_ALIASES.fileClass);
		const fileClasses = Array.isArray(fileClassRaw)
			? fileClassRaw.filter((v): v is string => typeof v === "string")
			: typeof fileClassRaw === "string"
				? [fileClassRaw]
				: [];

		const hasTradeFileClass =
			this.enableFileClass &&
			fileClasses.some((fc) => this.tradeFileClassesLower.has(fc.trim().toLowerCase()));

		if (!hasTradeTag && !hasTradeFileClass) {
			if (this.db.delete(file.path) && triggerUpdate) this.emitChanged();
			return;
		}

		const pnlRaw = getFirstFieldValue(fm, FIELD_ALIASES.pnl);
		const tickerRaw = getFirstFieldValue(fm, FIELD_ALIASES.ticker);
		const outcomeRaw = getFirstFieldValue(fm, FIELD_ALIASES.outcome);
		const dateRaw = getFirstFieldValue(fm, FIELD_ALIASES.date);

		const pnl = parseNumber(pnlRaw);
		const ticker = normalizeTicker(tickerRaw);
		const outcome = normalizeOutcome(outcomeRaw);
		const dateIso = typeof dateRaw === "string" ? dateRaw : file.basename.substring(0, 10);

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
