import { App, TFile, Notice } from "obsidian";
import { ActionService } from "../core/action/action-service";

export interface DiagnosisReport {
    file: TFile;
    missingKeys: string[];
}

export class MetadataDoctor {
    private app: App;
    private actionService: ActionService;

    // Standard keys from 'Templates/单笔交易模版 (Trade Note).md'
    // We treat the Full Key (e.g. "封面/cover") as the standard.
    private readonly STANDARD_KEYS = [
        "封面/cover",
        "categories",
        "tags",
        "date",
        "账户类型/account_type",
        "品种/ticker",
        "时间周期/timeframe",
        "日内类型/day_type",
        "总是方向/always_in",
        "市场周期/market_cycle",
        "方向/direction",
        "设置类别/setup_category",
        "观察到的形态/patterns_observed",
        "信号K/signal_bar_quality",
        "策略名称/strategy_name",
        "管理计划/management_plan",
        "订单类型/order_type",
        "入场/entry_price",
        "止损/stop_loss",
        "目标位/take_profit",
        "初始风险/initial_risk",
        "净利润/net_profit",
        "执行评价/execution_quality",
        "结果/outcome"
    ];

    constructor(app: App) {
        this.app = app;
        this.actionService = new ActionService(app);
    }

    /**
     * Scan all markdown files (or filtered list) for missing keys.
     * Only scans files that look like Trade Notes (have "categories: 交易日记" or "tags: PA/Trade").
     */
    async scan(files?: TFile[]): Promise<DiagnosisReport[]> {
        const targetFiles = files || this.app.vault.getMarkdownFiles();
        const reports: DiagnosisReport[] = [];

        for (const file of targetFiles) {
            const cache = this.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter;

            // Filter: Must be a Trade Note
            if (!this.isTradeNote(fm)) continue;

            // Check keys
            const missing: string[] = [];
            for (const key of this.STANDARD_KEYS) {
                if (!fm || !(key in fm)) {
                    // Check if simplified key exists? 
                    // e.g. if standard is "封面/cover", but user has "cover"?
                    // For "The Doctor", we might want to enforce the Standard Template format.
                    // But to be safe, let's check if any part of the key exists.
                    // Actually, let's be strict for now to ensure consistency with the user's explicit template.

                    // Allow simple key if it matches the english part?
                    // The template uses "Key/Alias". 
                    // If user has "Key" or "Alias" or "Key/Alias", strictly we want them to align with template?
                    // Let's check strict missing for now.
                    missing.push(key);
                }
            }

            if (missing.length > 0) {
                reports.push({
                    file,
                    missingKeys: missing
                });
            }
        }

        return reports;
    }

    /**
     * Fix a single diagnosis by adding missing keys.
     */
    async fix(diagnosis: DiagnosisReport): Promise<void> {
        const { file, missingKeys } = diagnosis;
        if (missingKeys.length === 0) return;

        // Prepare update object
        // We use ActionService or processFrontmatter directly?
        // processFrontmatter is safer.
        try {
            await this.app.fileManager.processFrontMatter(file, (fm: any) => {
                for (const key of missingKeys) {
                    if (!(key in fm)) {
                        // Set default values matching template
                        if (key === "timeframe") fm[key] = "5m";
                        else if (key === "categories") fm[key] = ["交易日记"];
                        else if (key === "tags") {
                            // Don't overwrite existing tags if they exist in a different key?
                            // But here we are adding the key 'tags' if missing.
                            fm[key] = ["PA/Trade"];
                        }
                        else {
                            fm[key] = ""; // Empty string or null? Template usually has empty.
                        }
                    }
                }
            });
            new Notice(`Fixed ${missingKeys.length} fields in ${file.basename}`);
        } catch (e) {
            console.error(`Failed to fix ${file.path}`, e);
            new Notice(`Failed to fix ${file.basename}`);
        }
    }

    /**
     * Fix all reports
     */
    async fixAll(reports: DiagnosisReport[]): Promise<void> {
        let count = 0;
        for (const report of reports) {
            await this.fix(report);
            count++;
        }
        new Notice(`Batch fixed ${count} files.`);
    }

    private isTradeNote(fm: any): boolean {
        if (!fm) return false;

        // Check categories
        if (fm.categories && Array.isArray(fm.categories) && fm.categories.includes("交易日记")) return true;
        // Check tags
        if (fm.tags) {
            const tags = Array.isArray(fm.tags) ? fm.tags : [fm.tags];
            if (tags.some((t: string) => t.includes("PA/Trade"))) return true;
        }

        return false;
    }
}
