import { describe, expect, it } from "vitest";
import { createHarnessContext, PluginManager } from "@canva-harness/runtime";
import { SessionStore } from "@canva-harness/session";
import { createCanvaCapabilitiesPlugin } from "@canva-harness/capabilities";
import {
  canvaCreateDesignTool,
  canvaExportAssetTool,
  canvaValidateLayoutTool,
  ToolRegistry,
} from "../src/index.js";

describe("Canva Guarded Tool Registry", () => {
  it("executes valid tool and logs session events", async () => {
    const ctx = createHarnessContext();
    const session = new SessionStore();
    const pm = new PluginManager(ctx);
    await pm.load(createCanvaCapabilitiesPlugin(session));

    const registry = new ToolRegistry();
    registry.register(canvaCreateDesignTool);

    const result = (await registry.execute(
      "canva_create_design",
      { title: "Presentation Deck", format: "presentation" },
      { session, harnessContext: ctx }
    )) as { title: string; width: number };

    expect(result.title).toBe("Presentation Deck");
    expect(result.width).toBe(1920);

    const events = session.events();
    expect(events.some((e) => e.type === "tool.called")).toBe(true);
    expect(events.some((e) => e.type === "tool.result")).toBe(true);
  });

  it("blocks tools requiring approval when unapproved", async () => {
    const ctx = createHarnessContext();
    const session = new SessionStore();
    const pm = new PluginManager(ctx);
    await pm.load(createCanvaCapabilitiesPlugin(session));

    const registry = new ToolRegistry();
    registry.register(canvaExportAssetTool);

    await expect(
      registry.execute("canva_export_asset", { format: "pdf" }, { session, harnessContext: ctx, isApproved: false })
    ).rejects.toThrow("requires explicit user approval");

    const events = session.events();
    expect(events.some((e) => e.type === "approval.requested")).toBe(true);
  });

  it("rejects invalid arguments at the schema seam", async () => {
    const ctx = createHarnessContext();
    const session = new SessionStore();
    const registry = new ToolRegistry();
    registry.register(canvaCreateDesignTool);

    await expect(
      registry.execute("canva_create_design", { title: "", format: "invalid_format" }, { session, harnessContext: ctx })
    ).rejects.toThrow("Invalid arguments for canva_create_design");
  });
});
