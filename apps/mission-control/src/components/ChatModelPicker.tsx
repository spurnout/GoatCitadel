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
      <select
        value={activeProvider?.providerId ?? ""}
        disabled={disabled || providers.length === 0}
        onChange={(event) => onChangeProvider(event.target.value)}
        aria-label="Provider"
      >
        {providers.map((provider) => (
          <option key={provider.providerId} value={provider.providerId}>
            {provider.label}
          </option>
        ))}
      </select>
      <select
        value={model ?? models[0] ?? ""}
        disabled={disabled || models.length === 0}
        onChange={(event) => onChangeModel(event.target.value)}
        aria-label="Model"
      >
        {models.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </div>
  );
}
