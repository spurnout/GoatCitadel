export interface ResearchRunRecord {
  runId: string;
  sessionId: string;
  query: string;
  mode: "quick" | "deep";
  status: "running" | "completed" | "failed";
  summary?: string;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

export interface ResearchSourceRecord {
  sourceId: string;
  runId: string;
  title?: string;
  url: string;
  snippet?: string;
  rank: number;
  createdAt: string;
}

export interface ResearchSummaryRecord {
  runId: string;
  query: string;
  summary: string;
  sources: ResearchSourceRecord[];
}
