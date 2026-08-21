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

  it("safe-readonly profile registers only tools with policy.readonly", async () => {
    const harness = await bootstrapHarness("safe-readonly");
    const names = harness.toolRegistry.list().map((t) => t.name);

    expect(names).toEqual(["canva_validate_layout"]);
    expect(harness.policy.readonlyToolsOnly).toBe(true);
    expect(harness.policy.autoApprove).toBe(false);
  });

  it("headless profile registers all tools and pre-approves", async () => {
    const harness = await bootstrapHarness("headless");

    expect(harness.toolRegistry.list().length).toBeGreaterThanOrEqual(4);
    expect(harness.policy.autoApprove).toBe(true);
    expect(harness.policy.readonlyToolsOnly).toBe(false);
  });

  it.each(["developer", "brand-governance", "creative-automation"] as const)(
    "%s registers all tools and requires explicit approval",
    async (profile) => {
      const harness = await bootstrapHarness(profile);

      expect(harness.toolRegistry.list().length).toBeGreaterThanOrEqual(4);
      expect(harness.policy.readonlyToolsOnly).toBe(false);
      expect(harness.policy.autoApprove).toBe(false);
    }
  );
});
