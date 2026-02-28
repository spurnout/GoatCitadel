import type { IntegrationCatalogEntry } from "@goatcitadel/contracts";

export const INTEGRATION_CATALOG: IntegrationCatalogEntry[] = [
  // Channels
  entry("channel", "tui", "Terminal/TUI", "Interactive terminal channel for local operations.", "native", ["local"], ["chat", "commands"]),
  entry("channel", "webchat", "Webchat", "Embedded web chat endpoint for browser clients.", "native", ["token", "basic"], ["chat", "sessions"]),
  entry("channel", "discord", "Discord", "Discord bot/webhook bridge.", "beta", ["oauth", "bot-token"], ["chat", "threads"]),
  entry("channel", "signal", "Signal", "Signal messenger bridge.", "planned", ["device-link"], ["chat"]),
  entry("channel", "whatsapp", "WhatsApp", "WhatsApp business bridge.", "planned", ["oauth", "token"], ["chat", "media"]),
  entry("channel", "telegram", "Telegram", "Telegram bot integration.", "beta", ["bot-token"], ["chat", "threads"]),
  entry("channel", "slack", "Slack", "Slack app/bot integration.", "beta", ["oauth"], ["chat", "threads", "mentions"]),
  entry("channel", "imessage", "iMessage", "iMessage bridge (platform dependent).", "planned", ["local-agent"], ["chat", "attachments"]),
  entry("channel", "teams", "Microsoft Teams", "Teams bot/webhook integration.", "planned", ["oauth"], ["chat", "threads"]),
  entry("channel", "nextcloud-talk", "Nextcloud Talk", "Nextcloud Talk channel bridge.", "planned", ["token"], ["chat", "rooms"]),
  entry("channel", "matrix", "Matrix", "Matrix room bot integration.", "beta", ["access-token"], ["chat", "rooms"]),

  // Model providers
  entry("model_provider", "openai", "OpenAI", "Direct OpenAI provider support.", "native", ["api-key"], ["chat-completions"]),
  entry("model_provider", "anthropic", "Anthropic", "Anthropic provider via adapter or compatible proxy.", "beta", ["api-key"], ["messages", "chat-completions"]),
  entry("model_provider", "google", "Google", "Google model provider via adapter/proxy.", "beta", ["api-key"], ["chat-completions"]),
  entry("model_provider", "minimax", "MiniMax", "MiniMax provider route.", "planned", ["api-key"], ["chat-completions"]),
  entry("model_provider", "vercel", "Vercel AI Gateway", "Vercel AI Gateway compatible endpoint.", "planned", ["api-key"], ["chat-completions"]),
  entry("model_provider", "openrouter", "OpenRouter", "OpenRouter aggregated model endpoint.", "native", ["api-key"], ["chat-completions"]),
  entry("model_provider", "mistral", "Mistral", "Mistral provider route.", "planned", ["api-key"], ["chat-completions"]),
  entry("model_provider", "deepseek", "DeepSeek", "DeepSeek provider route.", "planned", ["api-key"], ["chat-completions"]),
  entry("model_provider", "glm", "GLM", "GLM provider route.", "planned", ["api-key"], ["chat-completions"]),
  entry("model_provider", "perplexity", "Perplexity", "Perplexity provider route.", "planned", ["api-key"], ["chat-completions"]),
  entry("model_provider", "huggingface", "HuggingFace", "HuggingFace inference route.", "planned", ["api-key"], ["chat-completions"]),
  entry("model_provider", "local-models", "Local Models", "Local model backends (LM Studio/Ollama/LocalAI).", "native", ["local"], ["chat-completions"]),

  // Productivity
  entry("productivity", "apple-notes", "Apple Notes", "Sync or publish notes to Apple Notes.", "planned", ["local-agent"], ["read", "write"]),
  entry("productivity", "apple-reminders", "Apple Reminders", "Task/reminder sync with Apple Reminders.", "planned", ["local-agent"], ["read", "write"]),
  entry("productivity", "things3", "Things 3", "Things 3 task integration.", "planned", ["local-agent"], ["read", "write"]),
  entry("productivity", "notion", "Notion", "Notion workspace integration.", "beta", ["oauth", "token"], ["read", "write", "search"]),
  entry("productivity", "obsidian", "Obsidian", "Obsidian vault integration.", "beta", ["local"], ["read", "write", "search"]),
  entry("productivity", "bear", "Bear Notes", "Bear notes integration.", "planned", ["local-agent"], ["read", "write"]),
  entry("productivity", "trello", "Trello", "Trello board/task integration.", "planned", ["oauth"], ["read", "write"]),
  entry("productivity", "github", "GitHub", "GitHub issue/pr/repo automation integration.", "native", ["token"], ["read", "write", "webhooks"]),

  // Automation tools
  entry("automation", "browser-chrome-control", "Browser Control", "Chrome/Chromium automation and capture flows.", "beta", ["local"], ["browse", "automation", "screenshots"]),
  entry("automation", "canvas-a2ui", "Canvas + A2UI", "Visual canvas workspace and agent-to-ui interactions.", "planned", ["local"], ["visual-workspace"]),
  entry("automation", "voice-wake-talk", "Voice Wake + Talk", "Wake-word and voice interaction pipeline.", "planned", ["local"], ["voice"]),
  entry("automation", "gmail", "Gmail", "Gmail read/send integration.", "planned", ["oauth"], ["read", "write"]),
  entry("automation", "cron", "Cron Jobs", "Scheduled task orchestration.", "native", ["local"], ["scheduling"]),
  entry("automation", "webhooks", "Webhooks", "Inbound/outbound webhook automation.", "native", ["token"], ["events", "automation"]),
  entry("automation", "weather", "Weather", "Weather data integration.", "native", ["none"], ["data"]),
  entry("automation", "image-gen", "Image Generation", "Image generation model integration.", "planned", ["api-key"], ["generation"]),
  entry("automation", "gif-search", "GIF Search", "GIF search integration.", "planned", ["api-key"], ["search"]),
  entry("automation", "peekaboo-screen", "Peekaboo Screen", "Screen capture and remote control integration.", "planned", ["local-agent"], ["capture", "control"]),
  entry("automation", "camera-photo-video", "Camera", "Photo/video capture integration.", "planned", ["local-agent"], ["capture"]),

  // Platforms
  entry("platform", "macos-menubar-voice", "macOS Menu Bar + Voice", "Native macOS app integration target.", "planned", ["local-agent"], ["voice", "tray"]),
  entry("platform", "ios-canvas-camera-voice", "iOS Canvas/Camera/Voice", "Native iOS companion capabilities.", "planned", ["app-auth"], ["canvas", "camera", "voice"]),
  entry("platform", "android-canvas-camera-screen", "Android Canvas/Camera/Screen", "Native Android companion capabilities.", "planned", ["app-auth"], ["canvas", "camera", "screen"]),
  entry("platform", "windows-wsl2", "Windows (WSL2 Recommended)", "Windows host platform support.", "native", ["local"], ["desktop"]),
  entry("platform", "linux-native", "Linux Native", "Linux native platform support.", "native", ["local"], ["desktop"]),
];

function entry(
  kind: IntegrationCatalogEntry["kind"],
  key: string,
  label: string,
  description: string,
  maturity: IntegrationCatalogEntry["maturity"],
  authMethods: string[],
  capabilities: string[],
): IntegrationCatalogEntry {
  return {
    catalogId: `${kind}.${key}`,
    kind,
    key,
    label,
    description,
    maturity,
    authMethods,
    capabilities,
  };
}
