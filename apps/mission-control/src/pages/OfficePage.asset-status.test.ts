import { beforeEach, describe, expect, it, vi } from "vitest";
import { describeGoatAssetStatus, loadOfficeAssetPack } from "./OfficePage";

describe("OfficePage asset status helpers", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("describes the animated goat as the preferred live asset", () => {
    expect(describeGoatAssetStatus({
      goatModelPath: "/assets/office/models/goat-subagent-animated.glb",
      goatModelVariant: "animated",
      goatModelLabel: "Animated Goat Subagent",
    })).toEqual({
      tone: "live",
      chipLabel: "Animated goat live",
      helpLabel: "Animated Goat Subagent",
      helpCopy: " Animation clips are enabled when the current GLB provides them.",
    });
  });

  it("describes the procedural fallback when no goat asset resolves", () => {
    expect(describeGoatAssetStatus({})).toEqual({
      tone: "warning",
      chipLabel: "Procedural goat live",
      helpLabel: "Procedural Goat",
      helpCopy: " No shipped goat asset resolved, so the scene is using the procedural fallback.",
    });
  });

  it("prefers the animated goat asset over the static fallback in the manifest", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/assets/office/asset-manifest.json")) {
        return new Response(
          JSON.stringify({
            models: [
              { id: "goat-subagent-animated", label: "Animated Goat Subagent", path: "/assets/goat-animated.glb", includedInRepo: true },
              { id: "goat-subagent", label: "Goat Subagent", path: "/assets/goat.glb", includedInRepo: true },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if ((init?.method ?? "GET").toUpperCase() === "HEAD") {
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch);

    await expect(loadOfficeAssetPack()).resolves.toEqual({
      goatModelPath: "/assets/goat-animated.glb",
      goatModelVariant: "animated",
      goatModelLabel: "Animated Goat Subagent",
    });
  });

  it("resolves animated goat and office kit assets together when both are present", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/assets/office/asset-manifest.json")) {
        return new Response(
          JSON.stringify({
            models: [
              { id: "goat-subagent-animated", label: "Animated Goat Subagent", path: "/assets/goat-animated.glb", includedInRepo: true },
              { id: "goat-subagent", label: "Goat Subagent", path: "/assets/goat.glb", includedInRepo: true },
              { id: "office-floor-tile", label: "Floor Tile", path: "/assets/floor.gltf", includedInRepo: true },
              { id: "office-wall-panel", label: "Wall Panel", path: "/assets/wall.gltf", includedInRepo: true },
              { id: "office-desk-medium", label: "Desk", path: "/assets/desk.gltf", includedInRepo: true },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if ((init?.method ?? "GET").toUpperCase() === "HEAD") {
        return new Response(null, { status: 200 });
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch);

    await expect(loadOfficeAssetPack()).resolves.toEqual({
      goatModelPath: "/assets/goat-animated.glb",
      goatModelVariant: "animated",
      goatModelLabel: "Animated Goat Subagent",
      roomFloorTilePath: "/assets/floor.gltf",
      roomWallPath: "/assets/wall.gltf",
      deskModelPath: "/assets/desk.gltf",
    });
  });

  it("returns the procedural fallback descriptor when the manifest request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/assets/office/asset-manifest.json")) {
        throw new Error("asset-manifest-unavailable");
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch);

    await expect(loadOfficeAssetPack()).resolves.toEqual({
      goatModelVariant: "procedural",
      goatModelLabel: "Procedural Goat",
    });
  });
});
