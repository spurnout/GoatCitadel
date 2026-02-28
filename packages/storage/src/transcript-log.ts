import fs from "node:fs/promises";
import path from "node:path";
import type { TranscriptEvent } from "@personal-ai/contracts";

export class TranscriptLog {
  public constructor(private readonly transcriptsDir: string) {}

  public async append(event: TranscriptEvent): Promise<number> {
    const filePath = path.join(this.transcriptsDir, `${event.sessionId}.jsonl`);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    let offset = 0;
    try {
      const stat = await fs.stat(filePath);
      offset = stat.size;
    } catch {
      offset = 0;
    }

    const line = JSON.stringify(event) + "\n";
    await fs.appendFile(filePath, line, { encoding: "utf8" });
    return offset;
  }

  public async read(sessionId: string): Promise<TranscriptEvent[]> {
    const filePath = path.join(this.transcriptsDir, `${sessionId}.jsonl`);
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TranscriptEvent);
  }
}