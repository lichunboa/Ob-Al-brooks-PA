import { Plugin, WorkspaceLeaf } from "obsidian";
import { ConsoleView, VIEW_TYPE_CONSOLE } from "./ConsoleView";

export default class AlBrooksConsolePlugin extends Plugin {
    async onload() {
        this.registerView(
            VIEW_TYPE_CONSOLE,
            (leaf: WorkspaceLeaf) => new ConsoleView(leaf)
        );

        this.addRibbonIcon("bar-chart-2", "Open Trader Console", () => {
            this.activateView();
        });

        this.addCommand({
            id: "open-console",
            name: "Open Trader Console",
            callback: () => {
                this.activateView();
            }
        });
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
