// @canva-harness/cli - bootstrap
import { HarnessContext, PluginManager, createHarnessContext } from "@canva-harness/runtime";
import { SessionStore } from "@canva-harness/session";
import { CANVA_DOC_SERVICE_KEY, createCanvaCapabilitiesPlugin } from "@canva-harness/capabilities";
import {
  TOOL_REGISTRY_SERVICE_KEY,
  ToolDefinition,
  ToolRegistry,
  canvaApplyBrandKitTool,
  canvaCreateDesignTool,
  canvaExportAssetTool,
  canvaValidateLayoutTool,
} from "@canva-harness/tools";
import { AgentLoop, ILLMProvider, LLM_PROVIDER_SERVICE_KEY } from "@canva-harness/agent";

export type HarnessProfile = "safe-readonly" | "developer" | "brand-governance" | "headless" | "creative-automation";

/**
 * Per-profile enforcement envelope applied at bootstrap time.
 *
 * - `readonlyToolsOnly` — when true, only tools that declare `policy.readonly: true`
 *   are registered in the ToolRegistry. Mutating tools are excluded.
 * - `autoApprove` — when true, the default `isApproved` flag passed to
 *   `AgentLoop.runTurn` is `true`, so tools gated by `policy.requiresApproval`
 *   run without prompting. `safe-readonly` and the developer-style profiles
 *   keep this `false` so privileged tools still gate.
 */
export interface HarnessPolicy {
  readonly readonlyToolsOnly: boolean;
  readonly autoApprove: boolean;
}

export interface HarnessAppInstance {
  readonly ctx: HarnessContext;
  readonly session: SessionStore;
  readonly pluginManager: PluginManager;
  readonly toolRegistry: ToolRegistry;
  readonly agentLoop: AgentLoop;
  readonly profile: HarnessProfile;
  readonly policy: HarnessPolicy;
}

const PROFILE_POLICIES: Record<HarnessProfile, HarnessPolicy> = {
  "safe-readonly":       { readonlyToolsOnly: true,  autoApprove: false },
  "developer":           { readonlyToolsOnly: false, autoApprove: false },
  "brand-governance":    { readonlyToolsOnly: false, autoApprove: false },
  "headless":            { readonlyToolsOnly: false, autoApprove: true  },
  "creative-automation": { readonlyToolsOnly: false, autoApprove: false },
};

const ALL_TOOLS: readonly ToolDefinition[] = [
  canvaCreateDesignTool,
  canvaValidateLayoutTool,
  canvaApplyBrandKitTool,
  canvaExportAssetTool,
];

export async function bootstrapHarness(profile: HarnessProfile = "safe-readonly"): Promise<HarnessAppInstance> {
  const policy = PROFILE_POLICIES[profile];

  const ctx = createHarnessContext();
  const session = new SessionStore();
  const pm = new PluginManager(ctx);

  // 1. Mount core capabilities
  await pm.load(createCanvaCapabilitiesPlugin(session));

  // 2. Setup Tool Registry, filtered by profile policy.
  //    safe-readonly keeps only tools that declare `policy.readonly: true`;
  //    every other profile registers all built-in tools and lets the
  //    approval gate do the per-call filtering.
  const toolRegistry = new ToolRegistry();
  const tools = policy.readonlyToolsOnly
    ? ALL_TOOLS.filter((t) => t.policy?.readonly === true)
    : ALL_TOOLS;
  for (const tool of tools) {
    toolRegistry.register(tool);
  }
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
    policy,
  };
}
