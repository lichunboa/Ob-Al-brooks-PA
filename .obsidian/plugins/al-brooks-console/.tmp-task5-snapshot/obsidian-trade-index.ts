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
	private pendingPaths: Set<string> = new Set();
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private dirty = false;
	private debounceMs = 200;

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
			this.indexFile(file);
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
		this.pendingPaths.clear();
		this.dirty = false;
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
	}

	private emitChanged() {
		for (const listener of this.listeners) listener();
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
				changed = this.indexFile(af) || changed;
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

	private indexFile(file: TFile): boolean {
		const prev = this.db.get(file.path);
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
				return this.db.delete(file.path);
			}

			const trade: TradeRecord = {
				path: file.path,
				name: file.name,
				dateIso: file.basename.substring(0, 10),
				tags: normalizedTags,
				mtime: file.stat?.mtime,
			};

			this.db.set(file.path, trade);
			return true;
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
			return this.db.delete(file.path);
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
		return !prev || JSON.stringify(prev) !== JSON.stringify(trade);
	}
}
