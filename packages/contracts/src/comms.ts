export interface ChannelSendInput {
  connectionId: string;
  target: string;
  message: string;
  attachments?: Array<{
    url?: string;
    title?: string;
    mimeType?: string;
  }>;
  sessionId?: string;
  agentId?: string;
  taskId?: string;
}

export interface GmailSendInput {
  connectionId: string;
  to: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  cc?: string[];
  bcc?: string[];
  sessionId?: string;
  agentId?: string;
  taskId?: string;
}

export interface GmailReadQuery {
  connectionId: string;
  query?: string;
  maxResults?: number;
  sessionId?: string;
  agentId?: string;
  taskId?: string;
}

export interface CalendarCreateEventInput {
  connectionId: string;
  calendarId?: string;
  title: string;
  description?: string;
  startIso: string;
  endIso: string;
  attendees?: string[];
  timeZone?: string;
  sessionId?: string;
  agentId?: string;
  taskId?: string;
}

export interface CalendarListQuery {
  connectionId: string;
  calendarId?: string;
  fromIso?: string;
  toIso?: string;
  maxResults?: number;
  sessionId?: string;
  agentId?: string;
  taskId?: string;
}

export interface CommsSendResult {
  deliveryId: string;
  status: "queued" | "sent" | "failed";
  providerMessageId?: string;
  channelKey: string;
  target: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommsSyncResult {
  status: "ok" | "failed";
  channelKey: string;
  records: unknown[];
  error?: string;
}
