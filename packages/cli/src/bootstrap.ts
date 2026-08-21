// @canva-harness/cli - bootstrap
import { HarnessContext, PluginManager, createHarnessContext } from "@canva-harness/runtime";
import { SessionStore } from "@canva-harness/session";
import { CANVA_DOC_SERVICE_KEY, createCanvaCapabilitiesPlugin } from "@canva-harness/capabilities";
import {
  TOOL_REGISTRY_SERVICE_KEY,
  ToolRegistry,
  canvaApplyBrandKitTool,
  canvaCreateDesignTool,
  canvaExportAssetTool,
  canvaValidateLayoutTool,
} from "@canva-harness/tools";
import { AgentLoop, ILLMProvider, LLM_PROVIDER_SERVICE_KEY } from "@canva-harness/agent";

export type HarnessProfile = "safe-readonly" | "developer" | "brand-governance" | "headless" | "creative-automation";

export interface HarnessAppInstance {
  readonly ctx: HarnessContext;
  readonly session: SessionStore;
  readonly pluginManager: PluginManager;
  readonly toolRegistry: ToolRegistry;
  readonly agentLoop: AgentLoop;
  readonly profile: HarnessProfile;
}

export async function bootstrapHarness(profile: HarnessProfile = "safe-readonly"): Promise<HarnessAppInstance> {
  const ctx = createHarnessContext();
  const session = new SessionStore();
  const pm = new PluginManager(ctx);

  // 1. Mount core capabilities
  await pm.load(createCanvaCapabilitiesPlugin(session));

  // 2. Setup Tool Registry
  const toolRegistry = new ToolRegistry();
  toolRegistry.register(canvaCreateDesignTool);
  toolRegistry.register(canvaValidateLayoutTool);
  toolRegistry.register(canvaApplyBrandKitTool);
  toolRegistry.register(canvaExportAssetTool);
  ctx.services.register(TOOL_REGISTRY_SERVICE_KEY, toolRegistry);

  // 3. Register default mock LLM provider
  const defaultLLM: ILLMProvider = {
    generate: async (messages, tools) => {
      const last = messages[messages.length - 1];
      if (last.role === "user" && last.content.toLowerCase().includes("design")) {
        return {
          toolCalls: [
            {
              id: crypto.randomUUID(),
              name: "canva_create_design",
              args: { title: "Automated Design", format: "presentation" },
            },
          ],
        };
      }
      return {
        content: `Canva Harness [${profile}]: Task completed successfully.`,
      };
    },
  };
  ctx.services.register(LLM_PROVIDER_SERVICE_KEY, defaultLLM);

  const agentLoop = new AgentLoop(session, ctx);

  return {
    ctx,
    session,
    pluginManager: pm,
    toolRegistry,
    agentLoop,
    profile,
  };
}
