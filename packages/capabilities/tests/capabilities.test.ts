import { describe, expect, it } from "vitest";
import { createHarnessContext, PluginManager } from "@canva-harness/runtime";
import { deriveDesignState, SessionStore } from "@canva-harness/session";
import {
  CANVA_DEEPLINK_SERVICE_KEY,
  CANVA_DOC_SERVICE_KEY,
  createCanvaCapabilitiesPlugin,
} from "../src/index.js";

describe("Canva Capabilities Service Seam", () => {
  it("mounts services via plugin and creates designs", async () => {
    const ctx = createHarnessContext();
    const session = new SessionStore();
    const pm = new PluginManager(ctx);

    await pm.load(createCanvaCapabilitiesPlugin(session));

    const docService = ctx.services.get(CANVA_DOC_SERVICE_KEY);
    const design = docService.createDesign({
      title: "Quarterly Review",
      format: "presentation",
    });

    expect(design.title).toBe("Quarterly Review");
    expect(design.width).toBe(1920);
    expect(design.height).toBe(1080);

    const state = deriveDesignState(session.events());
    expect(state.title).toBe("Quarterly Review");
  });

  it("detects layout margin and brand font violations", async () => {
    const ctx = createHarnessContext();
    const session = new SessionStore();
    const pm = new PluginManager(ctx);
    await pm.load(createCanvaCapabilitiesPlugin(session));

    const docService = ctx.services.get(CANVA_DOC_SERVICE_KEY);
    docService.createDesign({ title: "Social Ad", format: "social_media" });

    docService.applyBrandKit({
      id: "bk-1",
      name: "Primary Brand",
      palette: ["#00C4CC", "#FFFFFF"],
      fonts: { header: "Canva Sans", body: "Canva Sans Regular" },
      primaryColor: "#00C4CC",
    });

    // Add off-margin element with forbidden font
    docService.addElement({
      id: "el-bad",
      type: "text",
      x: 10, // violating 40px safe margin
      y: 10,
      width: 200,
      height: 50,
      content: "Bad element",
      style: { fontFamily: "Comic Sans MS" },
    });

    const state = deriveDesignState(session.events());
    const report = docService.validateLayout(state);

    expect(report.valid).toBe(false);
    expect(report.violations.some((v) => v.rule === "safe-margins")).toBe(true);
    expect(report.violations.some((v) => v.rule === "brand-font-compliance")).toBe(true);
  });

  it("generates and parses deep links reliably", async () => {
    const ctx = createHarnessContext();
    const session = new SessionStore();
    const pm = new PluginManager(ctx);
    await pm.load(createCanvaCapabilitiesPlugin(session));

    const deepLinkService = ctx.services.get(CANVA_DEEPLINK_SERVICE_KEY);
    const openUrl = deepLinkService.createOpenLink("design-1234");
    expect(openUrl).toBe("canva://design/design-1234");

    const parsed = deepLinkService.parseDeepLink(openUrl);
    expect(parsed?.action).toBe("open");
    expect(parsed?.id).toBe("design-1234");
  });
});
