import { describe, expect, it } from "vitest";
import { bootstrapHarness } from "../src/bootstrap.js";
import { CANVA_DOC_SERVICE_KEY } from "@canva-harness/capabilities";
import { TOOL_REGISTRY_SERVICE_KEY } from "@canva-harness/tools";

describe("Canva Harness CLI & Bootstrap", () => {
  it("bootstraps with all services and tools active", async () => {
    const harness = await bootstrapHarness("brand-governance");

    expect(harness.profile).toBe("brand-governance");
    expect(harness.ctx.services.has(CANVA_DOC_SERVICE_KEY)).toBe(true);
    expect(harness.ctx.services.has(TOOL_REGISTRY_SERVICE_KEY)).toBe(true);

    const tools = harness.toolRegistry.list();
    expect(tools.length).toBeGreaterThanOrEqual(4);
    expect(tools.some((t) => t.name === "canva_create_design")).toBe(true);
    expect(tools.some((t) => t.name === "canva_validate_layout")).toBe(true);
  });
});
