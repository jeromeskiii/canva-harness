// @canva-harness/agent
import { HarnessContext, ServiceKey, createServiceKey } from "@canva-harness/runtime";
import { ModelMessage, SessionStore, deriveModelMessages } from "@canva-harness/session";
import { IToolRegistry, TOOL_REGISTRY_SERVICE_KEY } from "@canva-harness/tools";

export interface LLMResponse {
  readonly content?: string;
  readonly toolCalls?: readonly { id: string; name: string; args: Record<string, unknown> }[];
}

export interface ILLMProvider {
  generate(messages: readonly ModelMessage[], tools: readonly { name: string; description: string }[]): Promise<LLMResponse>;
}

export const LLM_PROVIDER_SERVICE_KEY: ServiceKey<ILLMProvider> = createServiceKey<ILLMProvider>("llm.provider");

export interface AgentLoopOptions {
  readonly maxSteps?: number;
  readonly isApproved?: boolean;
}

export class AgentLoop {
  constructor(
    private readonly session: SessionStore,
    private readonly ctx: HarnessContext
  ) {}

  async runTurn(userInput: string, options: AgentLoopOptions = {}): Promise<{ status: "completed" | "error"; steps: number }> {
    const maxSteps = options.maxSteps ?? 5;
    const turnId = crypto.randomUUID();

    // 1. Explicitly persist user input to maintain single source of truth (Law C)
    this.session.append("turn.started", { turnId });
    this.session.append("user.message", { turnId, content: userInput });

    let stepCount = 0;
    try {
      while (stepCount < maxSteps) {
        stepCount++;
        const stepId = crypto.randomUUID();

        // 2. Lifecycle hook: agent/pre-step
        this.session.append("step.started", { turnId, stepId, step: stepCount });
        await this.ctx.events.emit("agent.preStep", { turnId, stepId, step: stepCount });

        // 3. Derive model messages from append-only stream
        const messages = deriveModelMessages(this.session.events());

        // 4. Retrieve services
        const llm = this.ctx.services.get(LLM_PROVIDER_SERVICE_KEY);
        const toolsRegistry: IToolRegistry = this.ctx.services.has(TOOL_REGISTRY_SERVICE_KEY)
          ? this.ctx.services.get(TOOL_REGISTRY_SERVICE_KEY)
          : { list: () => [], get: () => undefined, register: () => ({ dispose: () => {} }), execute: async () => {} };

        const availableTools = toolsRegistry.list().map((t) => ({ name: t.name, description: t.description }));

        // 5. Query LLM
        const response = await llm.generate(messages, availableTools);

        // 6. Handle tool execution or assistant text
        if (response.toolCalls && response.toolCalls.length > 0) {
          for (const tc of response.toolCalls) {
            await toolsRegistry.execute(tc.name, tc.args, {
              session: this.session,
              harnessContext: this.ctx,
              callId: tc.id,
              isApproved: options.isApproved,
            });
          }
        } else {
          // Assistant finished speaking
          this.session.append("assistant.message", {
            turnId,
            stepId,
            content: response.content ?? "",
          });
          this.session.append("turn.completed", { turnId, steps: stepCount, status: "success" });
          await this.ctx.events.emit("agent.turnCompleted", { turnId, steps: stepCount });
          return { status: "completed", steps: stepCount };
        }
      }

      this.session.append("turn.completed", { turnId, steps: stepCount, status: "max_steps_reached" });
      return { status: "completed", steps: stepCount };
    } catch (err: any) {
      this.session.append("execution.error", { turnId, error: err.message });
      this.session.append("turn.completed", { turnId, steps: stepCount, status: "failed" });
      return { status: "error", steps: stepCount };
    }
  }
}
