import { describe, expect, it } from "vitest";
import {
  deriveDesignState,
  deriveModelMessages,
  deriveTranscript,
  SessionStore,
} from "../src/index.js";

describe("Canva Harness Session Log & Projections", () => {
  it("records events and maintains immutable append-only order", () => {
    const store = new SessionStore();
    store.append("user.message", { content: "Create a Canva slide for AI architecture" });
    store.append("design.created", {
      id: "design-101",
      title: "AI Architecture",
      format: "presentation",
      width: 1920,
      height: 1080,
    });

    const events = store.events();
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("user.message");
    expect(events[1].type).toBe("design.created");
  });

  it("forks sessions safely without mutating parent", () => {
    const parent = new SessionStore("parent-session");
    parent.append("user.message", { content: "Initial prompt" });

    const fork = parent.fork("child-session");
    expect(fork.events()).toHaveLength(1);

    fork.append("user.message", { content: "Divergent branch" });
    expect(fork.events()).toHaveLength(2);
    expect(parent.events()).toHaveLength(1);
  });

  it("projects design state correctly from events", () => {
    const store = new SessionStore();
    store.append("design.created", {
      id: "design-202",
      title: "Product Launch",
      format: "social_media",
      width: 1080,
      height: 1080,
    });

    store.append("design.element_added", {
      element: {
        id: "el-1",
        type: "text",
        x: 100,
        y: 100,
        width: 880,
        height: 200,
        content: "Announcing Canva Harness",
      },
    });

    store.append("brand_kit.applied", {
      brandKit: {
        palette: ["#00C4CC", "#7D2AE8", "#1A1A1A"],
        fonts: { header: "Canva Sans", body: "Open Sans" },
      },
    });

    const state = deriveDesignState(store.events());
    expect(state.id).toBe("design-202");
    expect(state.format).toBe("social_media");
    expect(state.elements).toHaveLength(1);
    expect(state.elements[0].content).toBe("Announcing Canva Harness");
    expect(state.brandKit?.palette).toContain("#00C4CC");
  });

  it("derives model messages and transcript accurately", () => {
    const store = new SessionStore();
    store.append("user.message", { content: "Add logo" });
    store.append("tool.called", { callId: "call-1", toolName: "canva_insert_asset", args: { assetId: "logo" } });
    store.append("tool.result", { callId: "call-1", result: { success: true } });

    const messages = deriveModelMessages(store.events());
    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe("user");
    expect(messages[1].toolCalls?.[0].name).toBe("canva_insert_asset");
    expect(messages[2].role).toBe("tool");

    const transcript = deriveTranscript(store.events());
    expect(transcript).toContain("canva_insert_asset");
  });
});
