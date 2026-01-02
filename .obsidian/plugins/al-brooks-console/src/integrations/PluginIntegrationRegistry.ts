import type { App } from "obsidian";
import type {
  IntegrationCapability,
  IntegrationCapabilityInfo,
  PluginAdapter,
} from "./contracts";
import { QuickAddAdapter } from "./QuickAddAdapter";
import { SrsAdapter } from "./SrsAdapter";
import { DataviewAdapter } from "./DataviewAdapter";
import { TasksAdapter } from "./TasksAdapter";
import { MetadataMenuAdapter } from "./MetadataMenuAdapter";
import { isDatacoreAvailable, isTemplaterAvailable } from "./TemplaterDetector";

export interface IntegrationSnapshot {
  capabilities: Record<string, IntegrationCapabilityInfo[]>;
  detected: {
    templater: boolean;
    datacore: boolean;
  };
}

export class PluginIntegrationRegistry {
  private app: App;
  private adapters: PluginAdapter[];

  constructor(app: App) {
    this.app = app;
    this.adapters = [
      new QuickAddAdapter(app),
      new SrsAdapter(app),
      new DataviewAdapter(app),
      new TasksAdapter(app),
      new MetadataMenuAdapter(app),
    ];
  }

  public getSnapshot(): IntegrationSnapshot {
    const capabilities: Record<string, IntegrationCapabilityInfo[]> = {};
    for (const adapter of this.adapters) {
      capabilities[adapter.id] = adapter.getCapabilities();
    }
    return {
      capabilities,
      detected: {
        templater: isTemplaterAvailable(this.app),
        datacore: isDatacoreAvailable(this.app),
      },
    };
  }

  public findCapability(
    capabilityId: IntegrationCapability
  ): { adapter: PluginAdapter; info: IntegrationCapabilityInfo } | null {
    for (const adapter of this.adapters) {
      for (const info of adapter.getCapabilities()) {
        if (info.id === capabilityId) return { adapter, info };
      }
    }
    return null;
  }

  public isCapabilityAvailable(capabilityId: IntegrationCapability): boolean {
    return this.findCapability(capabilityId) !== null;
  }

  public async run(capabilityId: IntegrationCapability): Promise<void> {
    const found = this.findCapability(capabilityId);
    if (!found) throw new Error(`Capability not available: ${capabilityId}`);
    await found.adapter.run(capabilityId);
  }
}
