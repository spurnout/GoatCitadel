import type { ChatSessionPrefsRecord } from "@goatcitadel/contracts";

const LIVE_DATA_KEYWORD_REGEX =
  /\b(latest|today|right now|news|price|weather|recent|recently|lately)\b/;

const CURRENT_EVENT_REGEX =
  /\bcurrent\s+(news|events|weather|forecast|temperature|price|prices|stock|stocks|market|markets|headlines?|score|scores|conditions?|traffic)\b/;

const EXPLICIT_WEB_PHRASES = [
  "look online",
  "search online",
  "browse the web",
  "web search",
  "use internet",
  "search web",
];

export function hasLiveDataKeywords(objective: string): boolean {
  return (
    LIVE_DATA_KEYWORD_REGEX.test(objective)
    || CURRENT_EVENT_REGEX.test(objective)
    || EXPLICIT_WEB_PHRASES.some((phrase) => objective.includes(phrase))
    || objective.includes("what's going on with")
    || objective.includes("whats going on with")
  );
}

export function shouldPreferToolBackedChatPath(
  objective: string,
  prefs: Pick<ChatSessionPrefsRecord, "webMode">,
): boolean {
  if (prefs.webMode === "off") {
    return false;
  }
  return hasLiveDataKeywords(objective);
}
