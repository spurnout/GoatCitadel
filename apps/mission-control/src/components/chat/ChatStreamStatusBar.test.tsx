import React from "react";
import { create, type ReactTestRendererJSON } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ChatStreamStatusBar, type ChatStreamStatus } from "./ChatStreamStatusBar";

function renderBar(status: ChatStreamStatus, queuedCount = 0, error: string | null = null) {
  return create(
    <ChatStreamStatusBar status={status} queuedCount={queuedCount} error={error} />,
  );
}

function asElement(renderer: ReturnType<typeof create>): ReactTestRendererJSON {
  const json = renderer.toJSON();
  if (!json || Array.isArray(json)) {
    throw new Error("Expected single element");
  }
  return json;
}

describe("ChatStreamStatusBar", () => {
  it("renders null when idle with no queue and no error", () => {
    const renderer = renderBar("idle", 0, null);
    expect(renderer.toJSON()).toBeNull();
  });

  it("renders with tone-active when streaming", () => {
    const el = asElement(renderBar("streaming", 0, null));
    expect(el.props.className).toContain("tone-active");
  });

  it("renders with tone-pending when connecting", () => {
    const el = asElement(renderBar("connecting", 0, null));
    expect(el.props.className).toContain("tone-pending");
  });

  it("shows queued count when streaming with queued items", () => {
    const el = asElement(renderBar("streaming", 3, null));
    const text = JSON.stringify(el);
    expect(text).toContain("3 queued");
  });

  it("renders error tone and message", () => {
    const el = asElement(renderBar("error", 0, "Connection lost"));
    expect(el.props.className).toContain("tone-error");
    const text = JSON.stringify(el);
    expect(text).toContain("Connection lost");
  });

  it("renders when idle but error is present", () => {
    const json = renderBar("idle", 0, "Stale error").toJSON();
    expect(json).toBeTruthy();
  });

  it("renders when idle but queue has items", () => {
    const json = renderBar("idle", 2, null).toJSON();
    expect(json).toBeTruthy();
  });
});
