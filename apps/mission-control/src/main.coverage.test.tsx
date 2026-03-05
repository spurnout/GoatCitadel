import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));

vi.mock("react-dom/client", () => ({
  createRoot: createRootMock,
}));

vi.mock("./App", () => ({
  App: () => null,
}));

vi.mock("./state/ui-preferences", () => ({
  UiPreferencesProvider: ({ children }: { children: unknown }) => children,
}));

describe("main entrypoint coverage", () => {
  beforeEach(() => {
    vi.resetModules();
    createRootMock.mockClear();
    renderMock.mockClear();
    vi.stubGlobal("document", {
      getElementById: vi.fn(() => ({ id: "root" })),
    } as unknown as Document);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts the app root", async () => {
    await import("./main");
    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(renderMock).toHaveBeenCalledTimes(1);
  });
});
