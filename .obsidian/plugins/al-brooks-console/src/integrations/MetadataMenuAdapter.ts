import type { App } from "obsidian";
import type {
  IntegrationCapability,
  IntegrationCapabilityInfo,
  PluginAdapter,
} from "./contracts";
import { findCommandByPrefix, runCommand } from "./contracts";

const PREFIXES = ["metadata-menu:", "metadata-menu-"];

export class MetadataMenuAdapter implements PluginAdapter {
  public id = "metadata-menu";
  public displayName = "Metadata Menu";

  private app: App;
  private openCmdId: string | undefined;

  constructor(app: App) {
    this.app = app;
    this.openCmdId = this.resolveOpenCommandId();
  }

  private resolveOpenCommandId(): string | undefined {
    for (const prefix of PREFIXES) {
      const cmd = findCommandByPrefix(this.app, prefix);
      if (cmd) return cmd.id;
    }
    return undefined;
  }

  public isAvailable(): boolean {
    return Boolean(this.openCmdId);
  }

  public getCapabilities(): IntegrationCapabilityInfo[] {
    if (!this.openCmdId) return [];
    return [
      {
        id: "metadata-menu:open",
        label: "Open Metadata Menu",
        commandId: this.openCmdId,
      },
    ];
  }

  public async run(capabilityId: IntegrationCapability): Promise<void> {
    if (capabilityId !== "metadata-menu:open") {
      throw new Error(`MetadataMenuAdapter cannot run: ${capabilityId}`);
    }
    if (!this.openCmdId) throw new Error("Metadata Menu command not available");
    return runCommand(this.app, this.openCmdId);
  }
}
