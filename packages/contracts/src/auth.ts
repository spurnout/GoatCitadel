export interface SseTokenIssueResponse {
  token: string;
  expiresAt: string;
  scope: "events:stream";
}

