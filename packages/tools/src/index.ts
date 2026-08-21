// @canva-harness/tools
import { Disposable, HarnessContext, ServiceKey, createServiceKey } from "@canva-harness/runtime";
import { SessionStore, deriveDesignState } from "@canva-harness/session";
import { CANVA_DOC_SERVICE_KEY, DesignFormat, BrandKit } from "@canva-harness/capabilities";
import { z, ZodType } from "./schema.js";

export interface ToolPolicy {
  readonly readonly?: boolean;
  readonly requiresApproval?: boolean;
  readonly dangerous?: boolean;
}

export interface ToolExecutionContext {
  readonly session: SessionStore;
  readonly harnessContext: HarnessContext;
  readonly callId?: string;
  readonly isApproved?: boolean;
}

export interface ToolDefinition<TArgs = any, TResult = any> {
  readonly name: string;
  readonly description: string;
  readonly schema: ZodType<TArgs>;
  readonly policy?: ToolPolicy;
  execute(args: TArgs, ctx: ToolExecutionContext): Promise<TResult> | TResult;
}

export interface IToolRegistry {
  register(tool: ToolDefinition): Disposable;
  get(name: string): ToolDefinition | undefined;
  list(): readonly ToolDefinition[];
  execute(name: string, rawArgs: unknown, ctx: ToolExecutionContext): Promise<unknown>;
}

export const TOOL_REGISTRY_SERVICE_KEY: ServiceKey<IToolRegistry> = createServiceKey<IToolRegistry>("tools.registry");

export class ToolRegistry implements IToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): Disposable {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return {
      dispose: () => {
        this.tools.delete(tool.name);
      },
    };
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): readonly ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async execute(name: string, rawArgs: unknown, ctx: ToolExecutionContext): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const callId = ctx.callId ?? crypto.randomUUID();

    // 1. Schema Validation
    const parseResult = tool.schema.safeParse(rawArgs);
    if (!parseResult.success) {
      const errorMsg = `Invalid arguments for ${name}: ${parseResult.error.message}`;
      ctx.session.append("tool.error", { callId, toolName: name, error: errorMsg });
      throw new Error(errorMsg);
    }
    const validatedArgs = parseResult.data;

    // 2. Policy & Approval check
    if (tool.policy?.requiresApproval && !ctx.isApproved) {
      ctx.session.append("approval.requested", { callId, toolName: name, args: validatedArgs });
      throw new Error(`Tool ${name} requires explicit user approval before execution.`);
    }

    // 3. Pre-execution event & hook
    ctx.session.append("tool.called", { callId, toolName: name, args: validatedArgs });
    await ctx.harnessContext.events.emit("tools.preExecute", { callId, toolName: name, args: validatedArgs });

    // 4. Execution
    try {
      const result = await tool.execute(validatedArgs, ctx);

      // 5. Post-execution event & hook
      ctx.session.append("tool.result", { callId, toolName: name, result });
      await ctx.harnessContext.events.emit("tools.postExecute", { callId, toolName: name, result });

      return result;
    } catch (err: any) {
      ctx.session.append("tool.error", { callId, toolName: name, error: err.message });
      throw err;
    }
  }
}

// Built-in Canva Tools
export const canvaCreateDesignTool: ToolDefinition<{ title: string; format: DesignFormat; width?: number; height?: number }> = {
  name: "canva_create_design",
  description: "Create a new Canva design project with specified format and dimensions",
  schema: z.object({
    title: z.string().min(1),
    format: z.enum(["presentation", "social_media", "doc", "whiteboard", "video"]),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  execute: async (args, ctx) => {
    const docService = ctx.harnessContext.services.get(CANVA_DOC_SERVICE_KEY);
    return docService.createDesign(args);
  },
};

export const canvaValidateLayoutTool: ToolDefinition<{}> = {
  name: "canva_validate_layout",
  description: "Run automated layout, safe margin, and brand compliance validation on the active canvas",
  schema: z.object({}),
  policy: { readonly: true },
  execute: async (_, ctx) => {
    const docService = ctx.harnessContext.services.get(CANVA_DOC_SERVICE_KEY);
    const designState = deriveDesignState(ctx.session.events());
    return docService.validateLayout(designState);
  },
};

export const canvaApplyBrandKitTool: ToolDefinition<BrandKit> = {
  name: "canva_apply_brand_kit",
  description: "Apply an official Brand Kit (palette, typography, logo guidelines) to the current design",
  schema: z.object({
    id: z.string(),
    name: z.string(),
    palette: z.array(z.string()),
    fonts: z.object({
      header: z.string(),
      body: z.string(),
    }),
    primaryColor: z.string(),
  }),
  policy: { requiresApproval: false },
  execute: async (args, ctx) => {
    const docService = ctx.harnessContext.services.get(CANVA_DOC_SERVICE_KEY);
    docService.applyBrandKit(args);
    return { success: true, brandKit: args.name };
  },
};

export const canvaExportAssetTool: ToolDefinition<{ format: "png" | "svg" | "pdf" | "pptx" }> = {
  name: "canva_export_asset",
  description: "Export the current design to PNG, SVG, PDF, or PPTX format",
  schema: z.object({
    format: z.enum(["png", "svg", "pdf", "pptx"]),
  }),
  policy: { requiresApproval: true }, // export is guarded in production
  execute: async (args, ctx) => {
    const docService = ctx.harnessContext.services.get(CANVA_DOC_SERVICE_KEY);
    return docService.exportDesign(args.format);
  },
};
