import { App, TFile, Vault, MetadataCache, Events, WorkspaceLeaf } from "obsidian";
import { TradeData, TradeIndexStats } from "../types";

// Helper to safely parse numbers
const safeNum = (val: any): number => {
    const n = parseFloat(val);
    return isNaN(n) ? 0 : n;
};

// Singleton Indexer Class
export class TradeIndex extends Events {
    private app: App;
    private vault: Vault;
    private cache: MetadataCache;

    // In-memory version of the database
    // Map<FilePath, TradeData>
    private db: Map<string, TradeData> = new Map();

    public stats: TradeIndexStats = {
        totalTrades: 0,
        lastScan: 0,
        dirty: false
    };

    constructor(app: App) {
        super();
        this.app = app;
        this.vault = app.vault;
        this.cache = app.metadataCache;
    }

    // Initialize: Full Scan
    public async initialize() {
        console.log("🦁 TradeIndex: Initializing...");
        const start = Date.now();

        const files = this.vault.getMarkdownFiles();

        for (const file of files) {
            await this.indexFile(file);
        }

        this.stats.lastScan = Date.now();
        this.stats.totalTrades = this.db.size;
        console.log(`🦁 TradeIndex: Scanned ${files.length} files. Found ${this.db.size} trades. Time: ${Date.now() - start}ms`);

        // Register Listeners for Robust Sync
        this.registerListeners();

        // Notify UI
        this.trigger("index-updated");
    }

    private registerListeners() {
        // 1. Rename Handler
        this.vault.on("rename", (file, oldPath) => {
            if (file instanceof TFile && this.db.has(oldPath)) {
                console.log(`🦁 Rename detected: ${oldPath} -> ${file.path}`);
                const data = this.db.get(oldPath);
                if (data) {
                    data.path = file.path;
                    data.filename = file.name;
                    this.db.delete(oldPath);
                    this.db.set(file.path, data);
                    this.trigger("index-updated");
                }
            }
        });

        // 2. Delete Handler
        this.vault.on("delete", (file) => {
            if (file instanceof TFile && this.db.has(file.path)) {
                console.log(`🦁 Delete detected: ${file.path}`);
                this.db.delete(file.path);
                this.stats.totalTrades = this.db.size;
                this.trigger("index-updated");
            }
        });

        // 3. Modify Handler (Metadata Changed)
        this.cache.on("changed", (file) => {
            // Re-index this specific file
            this.indexFile(file, true);
        });
    }

    private async indexFile(file: TFile, triggerUpdate = false) {
        // Filter: Must be in "Notes/" or have trade tags
        // For efficiency, we check cache first
        const cache = this.cache.getFileCache(file);
        if (!cache || !cache.frontmatter) {
            // Check if it WAS a trade (maybe tag removed)
            if (this.db.has(file.path)) {
                this.db.delete(file.path);
                if (triggerUpdate) this.trigger("index-updated");
            }
            return;
        }

        const fm = cache.frontmatter;

        // Heuristic: Is this a trade note?
        // Check 1: Tags
        const tags = fm.tags || [];
        const isTradeTag = Array.isArray(tags) && tags.some(t => t.includes("Trade") || t.includes("trade"));
        // Check 2: Key properties
        const hasTradeProps = fm.ticker !== undefined && (fm.setup !== undefined || fm.pnl !== undefined);

        if (!isTradeTag && !hasTradeProps) {
            if (this.db.has(file.path)) {
                this.db.delete(file.path);
                if (triggerUpdate) this.trigger("index-updated");
            }
            return;
        }

        // Parse Data
        const trade: TradeData = {
            path: file.path,
            filename: file.name,
            date: fm.date || file.basename.substring(0, 10), // Simple fallback
            ticker: fm.ticker || "Unknown",
            direction: fm.dir || fm.direction || "Unknown",
            setup: fm.setup,
            market_cycle: fm.market_cycle,
            outcome: fm.outcome || "Open",
            pnl: safeNum(fm.pnl),
            r: safeNum(fm.r),
            tf: fm.tf || "",
            tags: Array.isArray(tags) ? tags : [],
            frontmatter: fm
        };

        this.db.set(file.path, trade);
        this.stats.totalTrades = this.db.size;

        if (triggerUpdate) {
            this.trigger("index-updated");
        }
    }

    public getAllTrades(): TradeData[] {
        return Array.from(this.db.values()).sort((a, b) => {
            // Sort by date desc
            return b.date.localeCompare(a.date);
        });
    }
}
