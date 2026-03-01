export type MediaJobType = "ocr" | "vision" | "audio_transcribe" | "video_transcribe" | "analyze";
export type MediaJobStatus = "queued" | "running" | "ready" | "failed" | "unsupported";

export interface MediaJobRecord {
  jobId: string;
  sessionId?: string;
  attachmentId?: string;
  type: MediaJobType;
  status: MediaJobStatus;
  inputJson?: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface MediaArtifactRecord {
  artifactId: string;
  jobId: string;
  attachmentId?: string;
  kind: "thumbnail" | "ocr_text" | "transcript" | "analysis";
  storageRelPath?: string;
  textPreview?: string;
  mimeType?: string;
  sizeBytes?: number;
  createdAt: string;
}

export interface MediaCreateJobRequest {
  type: MediaJobType;
  sessionId?: string;
  attachmentId?: string;
  input?: Record<string, unknown>;
}

export interface ChatAttachmentPreviewResponse {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  mediaType: "text" | "image" | "audio" | "video" | "binary";
  thumbnailRelPath?: string;
  extractPreview?: string;
  ocrText?: string;
  transcriptText?: string;
  analysisStatus: MediaJobStatus;
}
