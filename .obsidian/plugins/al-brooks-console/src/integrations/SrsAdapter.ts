import type { App } from "obsidian";
import type { IntegrationCapability, IntegrationCapabilityInfo, PluginAdapter } from "./contracts";
import { commandExists, runCommand } from "./contracts";

const CMD_REVIEW = "obsidian-spaced-repetition:srs-review-flashcards";

export class SrsAdapter implements PluginAdapter {
	public id = "obsidian-spaced-repetition";
	public displayName = "Spaced Repetition";

	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	public isAvailable(): boolean {
		return commandExists(this.app, CMD_REVIEW);
	}

	public getCapabilities(): IntegrationCapabilityInfo[] {
		if (!commandExists(this.app, CMD_REVIEW)) return [];
		return [{ id: "srs:review-flashcards", label: "Review Flashcards", commandId: CMD_REVIEW }];
	}

	public async run(capabilityId: IntegrationCapability): Promise<void> {
		if (capabilityId !== "srs:review-flashcards") {
			throw new Error(`SrsAdapter cannot run: ${capabilityId}`);
		}
		return runCommand(this.app, CMD_REVIEW);
	}
}
