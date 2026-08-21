// @canva-harness/session
export interface SessionEvent<T = Record<string, unknown>> {
  readonly id: string;
  readonly type: string;
  readonly timestamp: number;
  readonly schemaVersion: number;
  readonly data: T;
}

export interface ModelMessage {
  readonly role: "system" | "user" | "assistant" | "tool";
  readonly content: string;
  readonly toolCallId?: string;
  readonly toolCalls?: readonly { id: string; name: string; arguments: string }[];
}

export interface CanvaCanvasElement {
  readonly id: string;
  readonly type: "text" | "image" | "shape" | "vector" | "video";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly content?: string;
  readonly style?: Record<string, unknown>;
}

export interface CanvaDesignState {
  readonly id?: string;
  readonly title?: string;
  readonly format?: "presentation" | "social_media" | "doc" | "whiteboard" | "video";
  readonly width: number;
  readonly height: number;
  readonly elements: readonly CanvaCanvasElement[];
  readonly brandKit?: {
    readonly palette: readonly string[];
    readonly fonts: { readonly header: string; readonly body: string };
  };
  readonly exports: readonly { format: string; urlOrPath: string; timestamp: number }[];
}

export class SessionStore {
  private readonly log: SessionEvent[] = [];
  public readonly id: string;

  constructor(id: string = crypto.randomUUID(), initialEvents: readonly SessionEvent[] = []) {
    this.id = id;
    this.log.push(...initialEvents);
  }

  append<T extends Record<string, unknown>>(type: string, data: T, schemaVersion: number = 1): SessionEvent<T> {
    const event: SessionEvent<T> = {
      id: crypto.randomUUID(),
      type,
      timestamp: Date.now(),
      schemaVersion,
      data,
    };
    this.log.push(event);
    return event;
  }

  events(): readonly SessionEvent[] {
    return [...this.log];
  }

  fork(forkId: string = crypto.randomUUID()): SessionStore {
    return new SessionStore(forkId, this.log);
  }
}

// Pure State Projections
export function deriveTranscript(events: readonly SessionEvent[]): string {
  return events
    .map((e) => `[${new Date(e.timestamp).toISOString()}] [v${e.schemaVersion}] ${e.type} ${JSON.stringify(e.data)}`)
    .join("\n");
}

export function deriveModelMessages(events: readonly SessionEvent[]): readonly ModelMessage[] {
  const messages: ModelMessage[] = [];

  for (const event of events) {
    if (event.type === "user.message") {
      messages.push({ role: "user", content: String(event.data.content ?? "") });
    } else if (event.type === "assistant.message") {
      messages.push({ role: "assistant", content: String(event.data.content ?? "") });
    } else if (event.type === "tool.called") {
      messages.push({
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: String(event.data.callId ?? ""),
            name: String(event.data.toolName ?? ""),
            arguments: JSON.stringify(event.data.args ?? {}),
          },
        ],
      });
    } else if (event.type === "tool.result") {
      messages.push({
        role: "tool",
        toolCallId: String(event.data.callId ?? ""),
        content: JSON.stringify(event.data.result ?? {}),
      });
    }
  }

  return messages;
}

export function deriveDesignState(events: readonly SessionEvent[]): CanvaDesignState {
  let state: CanvaDesignState = {
    width: 1920,
    height: 1080,
    elements: [],
    exports: [],
  };

  for (const event of events) {
    switch (event.type) {
      case "design.created":
        state = {
          ...state,
          id: String(event.data.id),
          title: String(event.data.title),
          format: event.data.format as CanvaDesignState["format"],
          width: Number(event.data.width ?? 1920),
          height: Number(event.data.height ?? 1080),
          elements: [],
        };
        break;

      case "design.element_added":
        if (event.data.element) {
          state = {
            ...state,
            elements: [...state.elements, event.data.element as CanvaCanvasElement],
          };
        }
        break;

      case "brand_kit.applied":
        state = {
          ...state,
          brandKit: event.data.brandKit as CanvaDesignState["brandKit"],
        };
        break;

      case "export.generated":
        state = {
          ...state,
          exports: [
            ...state.exports,
            {
              format: String(event.data.format),
              urlOrPath: String(event.data.urlOrPath),
              timestamp: event.timestamp,
            },
          ],
        };
        break;
    }
  }

  return state;
}
