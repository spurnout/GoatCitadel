import fs from "node:fs/promises";
import path from "node:path";
import type { TranscriptEvent } from "@goatcitadel/contracts";
import { safeJsonParse } from "./safe-json.js";

export class TranscriptLog {
  private readonly writeQueues = new Map<string, Promise<number>>();

  public constructor(private readonly transcriptsDir: string) {}

  public async append(event: TranscriptEvent): Promise<number> {
    const prior = this.writeQueues.get(event.sessionId) ?? Promise.resolve(0);
    const next = prior
      .catch(() => 0)
      .then(async () => this.appendInternal(event));

    this.writeQueues.set(event.sessionId, next);
    try {
      return await next;
    } finally {
      if (this.writeQueues.get(event.sessionId) === next) {
        this.writeQueues.delete(event.sessionId);
      }
    }
  }

  private async appendInternal(event: TranscriptEvent): Promise<number> {
    const filePath = path.join(this.transcriptsDir, `${event.sessionId}.jsonl`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const handle = await fs.open(filePath, "a+");
    try {
      const stat = await handle.stat();
      const offset = stat.size;
      const line = JSON.stringify(event) + "\n";
      await handle.write(line, null, "utf8");
      return offset;
    } finally {
      await handle.close();
    }
  }

  public async read(sessionId: string): Promise<TranscriptEvent[]> {
    const filePath = path.join(this.transcriptsDir, `${sessionId}.jsonl`);
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => safeJsonParse<TranscriptEvent | undefined>(line, undefined))
      .filter((event): event is TranscriptEvent => Boolean(event));
  }
}
