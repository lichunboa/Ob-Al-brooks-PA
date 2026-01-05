import type { App } from "obsidian";
import type {
  IntegrationCapability,
  IntegrationCapabilityInfo,
  PluginAdapter,
} from "./contracts";
import { findCommandByPrefix, runCommand } from "./contracts";

// We intentionally avoid hard dependency on a single command id.
// If a Tasks plugin is installed, we try to find any command under its prefix.
const PREFIXES = ["obsidian-tasks-plugin:", "tasks:"];

export class TasksAdapter implements PluginAdapter {
  public id = "tasks";
  public displayName = "Tasks";

  private app: App;
  private openCmdId: string | undefined;

  constructor(app: App) {
    this.app = app;
    // NOTE: Commands from community plugins may not be registered yet during app startup.
    // We lazily resolve the command id on demand so the button can become available
    // without requiring an explicit reload of this plugin.
    this.openCmdId = undefined;
  }

  private resolveOpenCommandId(): string | undefined {
    for (const prefix of PREFIXES) {
      const cmd = findCommandByPrefix(this.app, prefix);
      if (cmd) return cmd.id;
    }
    return undefined;
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
      { id: "tasks:open", label: "Open Tasks", commandId: cmd },
    ];
  }

  public async run(capabilityId: IntegrationCapability): Promise<void> {
    if (capabilityId !== "tasks:open") {
      throw new Error(`TasksAdapter cannot run: ${capabilityId}`);
    }
    const cmd = this.getOpenCommandId();
    if (!cmd) throw new Error("Tasks open command not available");
    return runCommand(this.app, cmd);
  }
}
