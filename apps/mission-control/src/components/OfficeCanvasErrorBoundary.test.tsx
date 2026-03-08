import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { OfficeCanvasErrorBoundary } from "./OfficeCanvasErrorBoundary";

function FlakyScene(props: { shouldThrow: boolean }) {
  if (props.shouldThrow) {
    throw new Error("scene-failure");
  }
  return <div>scene-ready</div>;
}

describe("OfficeCanvasErrorBoundary", () => {
  it("stays latched until resetKey changes, then retries cleanly", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let renderer = create(<div />);

    try {
      await act(async () => {
        renderer = create(
          <OfficeCanvasErrorBoundary resetKey="cinematic::animated">
            <FlakyScene shouldThrow />
          </OfficeCanvasErrorBoundary>,
        );
      });

      expect(consoleError).toHaveBeenCalled();
      expect(renderer.root.findAllByType("p")[0]?.children.join("")).toContain("Changing motion settings or goat asset inputs will retry the scene.");

      await act(async () => {
        renderer.update(
          <OfficeCanvasErrorBoundary resetKey="cinematic::animated">
            <FlakyScene shouldThrow={false} />
          </OfficeCanvasErrorBoundary>,
        );
      });

      expect(renderer.root.findAllByType("p")[0]?.children.join("")).toContain("Changing motion settings or goat asset inputs will retry the scene.");

      await act(async () => {
        renderer.update(
          <OfficeCanvasErrorBoundary resetKey="reduced::animated">
            <FlakyScene shouldThrow={false} />
          </OfficeCanvasErrorBoundary>,
        );
      });

      expect(renderer.root.findAllByType("div").some((node) => node.children.includes("scene-ready"))).toBe(true);
    } finally {
      consoleError.mockRestore();
      renderer.unmount();
    }
  });
});
