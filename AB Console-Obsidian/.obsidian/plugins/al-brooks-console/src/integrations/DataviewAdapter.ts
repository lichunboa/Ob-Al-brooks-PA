import type { App } from "obsidian";
import type {
  IntegrationCapability,
  IntegrationCapabilityInfo,
  PluginAdapter,
} from "./contracts";
import { commandExists, runCommand } from "./contracts";

const CMD_PRIMARY = "dataview:force-refresh-views";
const CMD_FALLBACK = "dataview:dataview-force-refresh-views";

export class DataviewAdapter implements PluginAdapter {
  public id = "dataview";
  public displayName = "Dataview";

  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  public isAvailable(): boolean {
    return (
      commandExists(this.app, CMD_PRIMARY) ||
      commandExists(this.app, CMD_FALLBACK)
    );
  }

  public getCapabilities(): IntegrationCapabilityInfo[] {
    const cmd = commandExists(this.app, CMD_PRIMARY)
      ? CMD_PRIMARY
      : commandExists(this.app, CMD_FALLBACK)
      ? CMD_FALLBACK
      : undefined;
    if (!cmd) return [];
    return [
      {
        id: "dataview:force-refresh",
        label: "强制刷新 Dataview",
        commandId: cmd,
      },
    ];
  }

  public async run(capabilityId: IntegrationCapability): Promise<void> {
    if (capabilityId !== "dataview:force-refresh") {
      throw new Error(`DataviewAdapter cannot run: ${capabilityId}`);
    }
    const cmd = commandExists(this.app, CMD_PRIMARY)
      ? CMD_PRIMARY
      : CMD_FALLBACK;
    return runCommand(this.app, cmd);
  }
}
