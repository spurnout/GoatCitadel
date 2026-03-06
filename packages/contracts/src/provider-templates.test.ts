import { describe, expect, it } from "vitest";
import { providerTemplates } from "./provider-templates.js";

describe("provider templates", () => {
  it("contains the shared onboarding/settings provider catalog", () => {
    const providerIds = providerTemplates.map((template) => template.providerId);
    expect(providerIds).toContain("glm");
    expect(providerIds).toContain("moonshot");
    expect(providerIds).toContain("huggingface");
    expect(providerIds).toContain("genie-ir20");
    expect(new Set(providerIds).size).toBe(providerIds.length);
    expect(providerIds.length).toBe(17);
  });
});
