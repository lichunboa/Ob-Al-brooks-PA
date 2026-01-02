import { Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { ConsoleView, VIEW_TYPE_CONSOLE } from "./views/Dashboard";
import { ObsidianTradeIndex } from "./platforms/obsidian/obsidian-trade-index";
import { ObsidianStrategyIndex } from "./platforms/obsidian/obsidian-strategy-index";
import { ObsidianTodayContext } from "./platforms/obsidian/obsidian-today-context";
import { PluginIntegrationRegistry } from "./integrations/PluginIntegrationRegistry";
import { DEFAULT_SETTINGS, type AlBrooksConsoleSettings } from "./settings";
import { AlBrooksConsoleSettingTab } from "./settings-tab";
import { computeTradeStatsByAccountType } from "./core/stats";
import { buildConsoleExportSnapshot } from "./core/export-snapshot";

export default class AlBrooksConsolePlugin extends Plugin {
    public index: ObsidianTradeIndex;
    public strategyIndex: ObsidianStrategyIndex;
	public todayContext: ObsidianTodayContext;
	public integrations: PluginIntegrationRegistry;
    public settings: AlBrooksConsoleSettings = DEFAULT_SETTINGS;
    private settingsListeners = new Set<(settings: AlBrooksConsoleSettings) => void>();

    public onSettingsChanged(listener: (settings: AlBrooksConsoleSettings) => void): () => void {
        this.settingsListeners.add(listener);
        return () => this.settingsListeners.delete(listener);
    }

    private notifySettingsChanged() {
        for (const l of this.settingsListeners) {
            try {
                l(this.settings);
            } catch (e) {
                // ignore listener errors
            }
        }
    }

    async loadSettings() {
        const saved = (await this.loadData()) as Partial<AlBrooksConsoleSettings> | null;
        this.settings = { ...DEFAULT_SETTINGS, ...(saved ?? {}) };
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.notifySettingsChanged();
    }

    async onload() {
        console.log("🦁 交易员控制台：加载中…");

		await this.loadSettings();
		this.addSettingTab(new AlBrooksConsoleSettingTab(this.app, this));

        // 1. Initialize Indexer
        this.index = new ObsidianTradeIndex(this.app);
		this.strategyIndex = new ObsidianStrategyIndex(this.app);
		this.todayContext = new ObsidianTodayContext(this.app);
        this.integrations = new PluginIntegrationRegistry(this.app);

        // 2. Start Scanning (Async)
        this.app.workspace.onLayoutReady(() => {
            void this.index.initialize();
			void this.strategyIndex.initialize();
			void this.todayContext.initialize();
        });

        this.registerView(
            VIEW_TYPE_CONSOLE,
            (leaf: WorkspaceLeaf) =>
                new ConsoleView(
                    leaf,
                    this.index,
                    this.strategyIndex,
                    this.todayContext,
                    this.integrations,
                    this.manifest.version,
                    () => this.settings,
                    (cb) => this.onSettingsChanged(cb)
                )
        );

        this.addRibbonIcon("bar-chart-2", "打开交易员控制台", () => {
            this.activateView();
        });

        this.addCommand({
            id: "open-console",
            name: "打开交易员控制台",
            callback: () => {
                this.activateView();
            }
        });

        this.addCommand({
            id: "export-index-snapshot",
            name: "导出索引快照（JSON）",
            callback: () => {
                void this.exportIndexSnapshot();
            },
        });
    }

    private async exportIndexSnapshot(): Promise<void> {
        try {
            const exportedAt = new Date().toISOString();
            const trades = this.index?.getAll?.() ?? [];
            const statsByAccountType = computeTradeStatsByAccountType(trades);
            const strategyCards = this.strategyIndex?.list?.();
            const snapshot = buildConsoleExportSnapshot({
                exportedAt,
                pluginVersion: this.manifest.version,
                trades,
                statsByAccountType,
                strategyCards,
            });

            const content = JSON.stringify(snapshot, null, 2);
            const dir = "Exports/al-brooks-console";
            await this.ensureFolder(dir);

            const stamp = this.toFileTimestamp(new Date());
            const base = `${dir}/snapshot_${stamp}.json`;
            const path = await this.pickAvailablePath(base);
            await this.app.vault.create(path, content);
            new Notice(`交易员控制台：已导出快照 → ${path}`);
        } catch (e) {
            new Notice(`交易员控制台：导出失败：${e instanceof Error ? e.message : String(e)}`);
        }
    }

    private async ensureFolder(path: string): Promise<void> {
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
    }

    private async pickAvailablePath(basePath: string): Promise<string> {
        const raw = String(basePath ?? "").replace(/^\/+/, "");
        if (!this.app.vault.getAbstractFileByPath(raw)) return raw;

        const m = raw.match(/^(.*?)(\.[^./]+)$/);
        const prefix = m ? m[1] : raw;
        const ext = m ? m[2] : "";
        for (let i = 2; i <= 9999; i++) {
            const candidate = `${prefix}_${i}${ext}`;
            if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
        }
        return `${prefix}_${Date.now()}${ext}`;
    }

    private toFileTimestamp(d: Date): string {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        const ss = String(d.getSeconds()).padStart(2, "0");
        return `${y}${m}${day}_${hh}${mm}${ss}`;
    }

    async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_CONSOLE);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            await leaf.setViewState({ type: VIEW_TYPE_CONSOLE, active: true });
        }

        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }
}
