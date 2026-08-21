import { describe, expect, it } from "vitest";
import { createHarnessContext, PluginManager } from "@canva-harness/runtime";
import { SessionStore } from "@canva-harness/session";
import { createCanvaCapabilitiesPlugin } from "@canva-harness/capabilities";
import {
  canvaCreateDesignTool,
  TOOL_REGISTRY_SERVICE_KEY,
  ToolRegistry,
} from "@canva-harness/tools";
import {
  AgentLoop,
  ILLMProvider,
  LLM_PROVIDER_SERVICE_KEY,
} from "../src/index.js";

describe("Canva Agent Loop Execution", () => {
  it("persists user input, triggers tools, and completes turn", async () => {
    const ctx = createHarnessContext();
    const session = new SessionStore();
    const pm = new PluginManager(ctx);
    await pm.load(createCanvaCapabilitiesPlugin(session));

    const toolRegistry = new ToolRegistry();
    toolRegistry.register(canvaCreateDesignTool);
    ctx.services.register(TOOL_REGISTRY_SERVICE_KEY, toolRegistry);

    let callStep = 0;
    const mockLLM: ILLMProvider = {
      generate: async () => {
        callStep++;
        if (callStep === 1) {
          // LLM chooses to call tool
          return {
            toolCalls: [
              {
                id: "call-99",
                name: "canva_create_design",
                args: { title: "Infographic", format: "social_media" },
              },
            ],
          };
        }
        // Step 2: Final response
        return {
          content: "I have created your Canva infographic design.",
        };
      },
    };
    ctx.services.register(LLM_PROVIDER_SERVICE_KEY, mockLLM);

    const loop = new AgentLoop(session, ctx);
    const result = await loop.runTurn("Make an infographic design");

    expect(result.status).toBe("completed");
    expect(result.steps).toBe(2);

    const events = session.events();
    expect(events.some((e) => e.type === "turn.started")).toBe(true);
    expect(events.some((e) => e.type === "user.message" && e.data.content === "Make an infographic design")).toBe(true);
    expect(events.some((e) => e.type === "tool.called" && e.data.toolName === "canva_create_design")).toBe(true);
    expect(events.some((e) => e.type === "assistant.message")).toBe(true);
    expect(events.some((e) => e.type === "turn.completed" && e.data.status === "success")).toBe(true);
  });
});
