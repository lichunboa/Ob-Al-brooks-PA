import { ItemView, WorkspaceLeaf } from "obsidian";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { MarketScannerComponent } from "../ui/scanner/MarketScannerComponent";
import { AlBrooksConsoleSettings } from "../settings";

export const MARKET_SCANNER_VIEW_TYPE = "market-scanner-view";

export class MarketScannerView extends ItemView {
    private root: ReactDOM.Root | null = null;
    private settings: AlBrooksConsoleSettings;

    constructor(leaf: WorkspaceLeaf, settings: AlBrooksConsoleSettings) {
        super(leaf);
        this.settings = settings;
    }

    getViewType() {
        return MARKET_SCANNER_VIEW_TYPE;
    }

    getDisplayText() {
        return "Market Scanner";
    }

    getIcon() {
        return "layout-grid";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();

        // Pass API Host and backend settings
        const apiHost = this.settings?.backend?.baseUrl || "http://localhost:8088";
        const backend = this.settings?.backend || {
            enabled: true,
            baseUrl: apiHost,
            apiToken: "",
            timeout: 30000,
            autoRefreshInterval: 5,
            defaultSymbol: "BTCUSDT",
            defaultInterval: "5m",
        };
        
        console.log("[MarketScanner] Initializing with API host:", apiHost);

        this.root = ReactDOM.createRoot(container);
        this.root.render(
            React.createElement(MarketScannerComponent, {
                apiHost: apiHost,
                backend: backend,
            })
        );
    }

    async onClose() {
        if (this.root) {
            this.root.unmount();
        }
    }
}
