import type { RealtimeEvent } from "@goatcitadel/contracts";
import { TuiApiClient } from "./api-client.js";

export type TuiLiveState = "connecting" | "live" | "polling" | "offline";

export class TuiLiveFeed {
  private state: TuiLiveState = "offline";
  private running = false;
  private abortController: AbortController | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private readonly listeners = new Set<(event: RealtimeEvent) => void>();
  private readonly stateListeners = new Set<(state: TuiLiveState) => void>();
  private lastEvent: RealtimeEvent | null = null;

  public constructor(
    private readonly client: TuiApiClient,
    private readonly pollMs = 3500,
  ) {}

  public subscribe(listener: (event: RealtimeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeState(listener: (state: TuiLiveState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  public getState(): TuiLiveState {
    return this.state;
  }

  public getLastEvent(): RealtimeEvent | null {
    return this.lastEvent;
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.abortController = new AbortController();
    void this.runLoop(this.abortController.signal);
  }

  public stop(): void {
    this.running = false;
    this.abortController?.abort();
    this.abortController = null;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.setState("offline");
  }

  private async runLoop(signal: AbortSignal): Promise<void> {
    while (this.running && !signal.aborted) {
      try {
        await this.streamEvents(signal);
      } catch {
        // noop
      }

      if (!this.running || signal.aborted) {
        break;
      }

      this.setState("polling");
      await this.pollOnce();
      await sleep(this.pollMs);
    }
  }

  private async streamEvents(signal: AbortSignal): Promise<void> {
    this.setState("connecting");
    const response = await fetch(`${this.client.baseUrl}/api/v1/events/stream?replay=20`, {
      method: "GET",
      signal,
      headers: this.client.streamHeaders(),
    });
    if (!response.ok || !response.body) {
      throw new Error(`stream failed (${response.status})`);
    }

    this.setState("live");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (this.running && !signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let split = buffer.indexOf("\n\n");
      while (split >= 0) {
        const block = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        this.handleSseBlock(block);
        split = buffer.indexOf("\n\n");
      }
    }
  }

  private handleSseBlock(block: string): void {
    const trimmed = block.trim();
    if (!trimmed || trimmed.startsWith(":")) {
      return;
    }

    const dataLine = trimmed
      .split("\n")
      .find((line) => line.startsWith("data:"));
    if (!dataLine) {
      return;
    }
    const payload = dataLine.slice(5).trim();
    if (!payload) {
      return;
    }

    try {
      const parsed = JSON.parse(payload) as RealtimeEvent;
      this.lastEvent = parsed;
      for (const listener of this.listeners) {
        listener(parsed);
      }
    } catch {
      // ignore malformed stream event
    }
  }

  private async pollOnce(): Promise<void> {
    try {
      const events = await this.client.listEvents(20);
      for (const event of events.items) {
        this.lastEvent = event;
        for (const listener of this.listeners) {
          listener(event);
        }
      }
    } catch {
      this.setState("offline");
    }
  }

  private setState(next: TuiLiveState): void {
    if (this.state === next) {
      return;
    }
    this.state = next;
    for (const listener of this.stateListeners) {
      listener(next);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
