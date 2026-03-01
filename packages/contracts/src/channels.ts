export interface IntegrationPluginRecord {
  pluginId: string;
  label: string;
  version: string;
  description?: string;
  enabled: boolean;
  installedAt: string;
  updatedAt: string;
  capabilities: string[];
}

export interface IntegrationPluginInstallInput {
  source: string;
  pluginId?: string;
}
