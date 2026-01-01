import * as React from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import * as ReactDOM from "react-dom";

export const VIEW_TYPE_CONSOLE = "al-brooks-console-view";

const ConsoleComponent = () => {
    return (
        <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
            <h1 style={{ color: "#3b82f6" }}>🦁 Trader Console (Bespoke)</h1>
            <p>Welcome to your custom native plugin.</p>
            <div style={{
                marginTop: "20px",
                padding: "15px",
                background: "rgba(59, 130, 246, 0.1)",
                borderRadius: "8px",
                border: "1px solid rgba(59, 130, 246, 0.3)"
            }}>
                <strong>Status:</strong> System Online
                <br />
                <strong>Mode:</strong> React Native View
            </div>
        </div>
    );
};

export class ConsoleView extends ItemView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType() {
        return VIEW_TYPE_CONSOLE;
    }

    getDisplayText() {
        return "Trader Console";
    }

    getIcon() {
        return "bar-chart-2";
    }

    async onOpen() {
        // Render React
        ReactDOM.render(
            <ConsoleComponent />,
            this.containerEl.children[1]
        );
    }

    async onClose() {
        ReactDOM.unmountComponentAtNode(this.containerEl.children[1]);
    }
}
