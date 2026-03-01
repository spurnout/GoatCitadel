import type { IntegrationPluginRecord } from "@goatcitadel/contracts";

export class PluginRuntimeService {
  private plugins = new Map<string, IntegrationPluginRecord>();

  public list(): IntegrationPluginRecord[] {
    return Array.from(this.plugins.values()).sort((left, right) => left.pluginId.localeCompare(right.pluginId));
  }

  public upsert(plugin: IntegrationPluginRecord): IntegrationPluginRecord {
    this.plugins.set(plugin.pluginId, plugin);
    return plugin;
  }

  public remove(pluginId: string): boolean {
    return this.plugins.delete(pluginId);
  }
}
