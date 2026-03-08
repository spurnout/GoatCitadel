import type {
  ChatCompletionRequest,
  ChatSessionLifecycleStatus,
  ChatSessionRecord,
} from "@goatcitadel/contracts";

export function assertChatSessionActive(
  sessionId: string,
  lifecycleStatus: ChatSessionLifecycleStatus,
): void {
  if (lifecycleStatus === "archived") {
    throw new Error(`Session ${sessionId} is archived`);
  }
}

export function deriveChatSessionTitleFromContent(content: string): string | undefined {
  const firstLine = content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  if (!firstLine) {
    return undefined;
  }
  const sanitized = firstLine
    .replace(/^[-*#>\d.\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!sanitized) {
    return undefined;
  }
  return sanitized.slice(0, 72).trim();
}

export function shouldAllowCrossProviderFallback(
  request: Pick<ChatCompletionRequest, "providerId" | "model">,
): boolean {
  return request.providerId == null;
}

export function buildChatSessionUpdatedPayload(
  type:
    | "chat_session_pinned"
    | "chat_session_unpinned"
    | "chat_session_archived"
    | "chat_session_restored"
    | "chat_session_project_assigned"
    | "chat_session_project_unassigned",
  session: Pick<ChatSessionRecord, "sessionId" | "pinned" | "lifecycleStatus" | "archivedAt" | "projectId">,
): Record<string, unknown> {
  switch (type) {
    case "chat_session_pinned":
    case "chat_session_unpinned":
      return {
        type,
        sessionId: session.sessionId,
        pinned: session.pinned,
      };
    case "chat_session_archived":
    case "chat_session_restored":
      return {
        type,
        sessionId: session.sessionId,
        lifecycleStatus: session.lifecycleStatus,
        archivedAt: session.archivedAt,
      };
    case "chat_session_project_assigned":
    case "chat_session_project_unassigned":
      return {
        type,
        sessionId: session.sessionId,
        projectId: session.projectId,
      };
  }
}
