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
      { id: "tasks:open", label: "Open Tasks", commandId: this.openCmdId },
    ];
  }

  public async run(capabilityId: IntegrationCapability): Promise<void> {
    if (capabilityId !== "tasks:open") {
      throw new Error(`TasksAdapter cannot run: ${capabilityId}`);
    }
    if (!this.openCmdId) throw new Error("Tasks open command not available");
    return runCommand(this.app, this.openCmdId);
  }
}
