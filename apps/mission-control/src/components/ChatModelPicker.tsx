import { GCCombobox, GCSelect } from "./ui";

export interface ChatModelProviderOption {
  providerId: string;
  label: string;
  models: string[];
}

export function ChatModelPicker({
  providers,
  providerId,
  model,
  disabled,
  onChangeProvider,
  onChangeModel,
}: {
  providers: ChatModelProviderOption[];
  providerId?: string;
  model?: string;
  disabled?: boolean;
  onChangeProvider: (providerId: string) => void;
  onChangeModel: (model: string) => void;
}) {
  const activeProvider = providers.find((item) => item.providerId === providerId) ?? providers[0];
  const models = activeProvider?.models ?? [];

  return (
    <div className="chat-model-picker">
      <GCSelect
        value={activeProvider?.providerId ?? ""}
        disabled={disabled || providers.length === 0}
        onChange={onChangeProvider}
        aria-label="Provider"
        options={providers.map((provider) => ({
          value: provider.providerId,
          label: provider.label,
        }))}
      />
      {models.length > 12 ? (
        <GCCombobox
          value={model ?? models[0] ?? ""}
          disabled={disabled || models.length === 0}
          onChange={onChangeModel}
          aria-label="Model"
          placeholder="Search model..."
          options={models.map((item) => ({ value: item, label: item }))}
        />
      ) : (
        <GCSelect
          value={model ?? models[0] ?? ""}
          disabled={disabled || models.length === 0}
          onChange={onChangeModel}
          aria-label="Model"
          options={models.map((item) => ({ value: item, label: item }))}
        />
      )}
    </div>
  );
}
