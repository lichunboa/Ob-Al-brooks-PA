import type { App } from "obsidian";
import type {
  IntegrationCapability,
  IntegrationCapabilityInfo,
  PluginAdapter,
} from "./contracts";
import { findCommandByPrefix, listCommands, runCommand } from "./contracts";

const PREFIXES = ["metadata-menu:", "metadata-menu-"];

export class MetadataMenuAdapter implements PluginAdapter {
  public id = "metadata-menu";
  public displayName = "Metadata Menu";

  private app: App;
  private openCmdId: string | undefined;

  constructor(app: App) {
    this.app = app;
    // Commands from community plugins may not be registered yet during app startup.
    // Resolve lazily so availability can update without requiring a plugin reload.
    this.openCmdId = undefined;
  }

  private resolveOpenCommandId(): string | undefined {
    const cmds = listCommands(this.app);

    // Prefer an exact match if the plugin exposes the canonical command id.
    const exact = cmds.find((c) => c.id === "metadata-menu:open");
    if (exact) return exact.id;

    for (const prefix of PREFIXES) {
      const cmd = findCommandByPrefix(this.app, prefix);
      if (cmd) return cmd.id;
    }

    // Fallbacks: allow variants with slightly different ids/names.
    const idMatch = cmds.find((c) => c.id.includes("metadata-menu"));
    if (idMatch) return idMatch.id;

    const nameMatch = cmds.find((c) => {
      const name = (c.name ?? "").toLowerCase();
      return (
        name.includes("metadata menu") ||
        name.includes("metadata-menu") ||
        name.includes("metadata") ||
        name.includes("元数据")
      );
    });
    return nameMatch?.id;
  }

  private getOpenCommandId(): string | undefined {
    if (this.openCmdId) return this.openCmdId;
    this.openCmdId = this.resolveOpenCommandId();
    return this.openCmdId;
  }

  public isAvailable(): boolean {
    return Boolean(this.getOpenCommandId());
  }

  public getCapabilities(): IntegrationCapabilityInfo[] {
    const cmd = this.getOpenCommandId();
    if (!cmd) return [];
    return [
      {
        id: "metadata-menu:open",
        label: "Open Metadata Menu",
        commandId: cmd,
      },
    ];
  }

  public async run(capabilityId: IntegrationCapability): Promise<void> {
    if (capabilityId !== "metadata-menu:open") {
      throw new Error(`MetadataMenuAdapter cannot run: ${capabilityId}`);
    }
    const cmd = this.getOpenCommandId();
    if (!cmd) throw new Error("Metadata Menu command not available");
    return runCommand(this.app, cmd);
  }
}
