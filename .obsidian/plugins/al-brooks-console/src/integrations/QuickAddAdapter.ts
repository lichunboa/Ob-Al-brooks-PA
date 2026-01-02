import type { App } from "obsidian";
import type { IntegrationCapability, IntegrationCapabilityInfo, PluginAdapter } from "./contracts";
import { commandExists, runCommand } from "./contracts";

const CMD_NEW_LIVE = "quickadd:choice:New Live Trade";
const CMD_NEW_DEMO = "quickadd:choice:New Demo Trade";
const CMD_NEW_BACKTEST = "quickadd:choice:New Backtest";

export class QuickAddAdapter implements PluginAdapter {
	public id = "quickadd";
	public displayName = "QuickAdd";

	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	public isAvailable(): boolean {
		// Prefer command detection (survives plugin id changes)
		return (
			commandExists(this.app, CMD_NEW_LIVE) ||
			commandExists(this.app, CMD_NEW_DEMO) ||
			commandExists(this.app, CMD_NEW_BACKTEST)
		);
	}

	public getCapabilities(): IntegrationCapabilityInfo[] {
		const caps: IntegrationCapabilityInfo[] = [];
		if (commandExists(this.app, CMD_NEW_LIVE)) {
			caps.push({ id: "quickadd:new-live-trade", label: "New Live Trade", commandId: CMD_NEW_LIVE });
		}
		if (commandExists(this.app, CMD_NEW_DEMO)) {
			caps.push({ id: "quickadd:new-demo-trade", label: "New Demo Trade", commandId: CMD_NEW_DEMO });
		}
		if (commandExists(this.app, CMD_NEW_BACKTEST)) {
			caps.push({ id: "quickadd:new-backtest", label: "New Backtest", commandId: CMD_NEW_BACKTEST });
		}
		return caps;
	}

	public async run(capabilityId: IntegrationCapability): Promise<void> {
		switch (capabilityId) {
			case "quickadd:new-live-trade":
				return runCommand(this.app, CMD_NEW_LIVE);
			case "quickadd:new-demo-trade":
				return runCommand(this.app, CMD_NEW_DEMO);
			case "quickadd:new-backtest":
				return runCommand(this.app, CMD_NEW_BACKTEST);
			default:
				throw new Error(`QuickAddAdapter cannot run: ${capabilityId}`);
		}
	}
}
