import type { App } from "obsidian";

export type IntegrationCapability =
  | "quickadd:new-live-trade"
  | "quickadd:new-demo-trade"
  | "quickadd:new-backtest"
  | "srs:review-flashcards"
  | "dataview:force-refresh"
  | "tasks:open"
  | "metadata-menu:open";

export interface IntegrationCapabilityInfo {
  id: IntegrationCapability;
  label: string;
  commandId?: string;
}

export interface PluginAdapter {
  id: string;
  displayName: string;
  isAvailable(): boolean;
  getCapabilities(): IntegrationCapabilityInfo[];
  run(capabilityId: IntegrationCapability): Promise<void>;
}

export interface CommandInfo {
  id: string;
  name?: string;
}

export function listCommands(app: App): CommandInfo[] {
  const commandsAny = (app as any).commands;
  if (typeof commandsAny?.listCommands === "function") {
    try {
      const list = commandsAny.listCommands() as Array<{
        id: string;
        name?: string;
      }>;
      return list.map((c) => ({ id: c.id, name: c.name }));
    } catch {
      // ignore
    }
  }

  const dict = commandsAny?.commands as
    | Record<string, { id: string; name?: string }>
    | undefined;
  if (dict && typeof dict === "object") {
    return Object.keys(dict).map((id) => ({ id, name: dict[id]?.name }));
  }

  return [];
}

export function commandExists(app: App, commandId: string): boolean {
  return listCommands(app).some((c) => c.id === commandId);
}

export function findCommandByPrefix(
  app: App,
  prefix: string
): CommandInfo | undefined {
  const cmds = listCommands(app);
  return cmds.find((c) => c.id.startsWith(prefix));
}

export async function runCommand(app: App, commandId: string): Promise<void> {
  try {
    await (app as any).commands.executeCommandById(commandId);
  } catch (e) {
    console.warn("[al-brooks-console] Failed to execute command", commandId, e);
    throw e;
  }
}
