# Concepts Reference

This document expands each runtime primitive referenced from [README.md](../README.md#concepts-reference) and [CANVA.md](../CANVA.md#concepts-reference). Every section is grounded in the source under `packages/runtime`, `packages/session`, `packages/capabilities`, `packages/tools`, and `packages/agent`.

## Table of Contents

- [`ServiceKey<T>`](#servicekeyt)
- [`ServiceRegistry`](#serviceregistry)
- [`EventBus`](#eventbus)
- [`DisposableCollection`](#disposablecollection)
- [`HarnessContext`](#harnesscontext)
- [`PluginManifest` and `HarnessPlugin`](#pluginmanifest-and-harnessplugin)
- [`PluginManager`: load and unload](#pluginmanager-load-and-unload)
- [`SessionStore` and projections](#sessionstore-and-projections)
- [`ToolDefinition` and `ToolRegistry`](#tooldefinition-and-toolregistry)
- [Event Catalog](#event-catalog)
- [Capability Seams](#capability-seams)

## `ServiceKey<T>`

`ServiceKey<T>` is a *typed identifier* for any service registered in the `ServiceRegistry`. It carries only a `name` string plus an optional human-readable `description`; the `T` parameter constrains what consumers can fetch.

```ts
import { createServiceKey } from "@canva-harness/runtime";

export const CANVA_DOC_SERVICE_KEY = createServiceKey<ICanvaDocumentService>(
  "canva.document",
  "Document creation, brand-kit, and layout-validation operations."
);
```

Create a key once per service, near where the contract is defined, and import the constant from anywhere you need to fetch the implementation. Two registrations under the same `name` throw `Service already registered: <name>` — duplication is loud, not silent.

## `ServiceRegistry`

The registry is a string-keyed store with strict registration semantics.

```ts
import { ServiceRegistry, createServiceKey } from "@canva-harness/runtime";

const registry = new ServiceRegistry();

const KEY = createServiceKey<{ ping(): void }>("my.service");
const dispose = registry.register(KEY, { ping: () => {} });

// throws if the key is already registered
registry.has(KEY);   // true
registry.get(KEY);   // { ping(): void }
registry.list();     // ["my.service"]

dispose.dispose();   // removes the entry
```

Every `register()` returns a `Disposable`. Both listeners and registrations are disposable; both should be tracked in a `DisposableCollection`.

## `EventBus`

Async pub/sub. Used to emit lifecycle hooks (`agent.preStep`, `tools.preExecute`, etc.) and let plugins observe them without forking the loop. Listeners are awaited sequentially in registration order.

```ts
import { EventBus } from "@canva-harness/runtime";

const bus = new EventBus();

const off = bus.on("agent.preStep", async (payload) => {
  // payload is typed by the listener, not the emitter.
  console.log("step started", payload);
});

await bus.emit("agent.preStep", { turnId: "t1", stepId: "s1", step: 1 });

off.dispose();
```

A wildcard listener registered under `"*"` receives `{ event, payload }` for every emitted event. It's the right hook for cross-cutting telemetry and provenance.

```ts
bus.on("*", async ({ event, payload }) => {
  // event === "agent.preStep", payload === { turnId: "t1", ... }
});
```

## `DisposableCollection`

Plugins do not own the global service registry directly; they receive a **scoped** `DisposableCollection` from `PluginManager` so a future `unload(id)` can unwind their work without touching anything else.

```ts
import { DisposableCollection, Disposable } from "@canva-harness/runtime";

const d = new DisposableCollection();

const registration: Disposable = /* from ServiceRegistry.register */;
const listener: Disposable = /* from EventBus.on */;

d.push(registration, listener);

await d.dispose();
// The listener is removed first (LIFO), then the service registration is dropped.
```

`push()` accepts `Disposable` objects and plain functions (`() => void | Promise<void>`); functions are wrapped into a `Disposable` automatically. Empty `Disposable` registrations silently no-op, so always return what `register()` gives you — never `void`.

## `HarnessContext`

The shared, top-level context every plugin operates against:

```ts
export interface HarnessContext {
  readonly services: ServiceRegistry;
  readonly events: EventBus;
  readonly disposables: DisposableCollection;
  readonly provenance: ProvenanceTracker;
}
```

- `services` — global; share across plugins but never mutate outside of `register()`.
- `events` — global; safe to subscribe from any plugin.
- `disposables` — *plugin-scoped copy* given to each plugin. Use it; do not call `services.unregister()` ad-hoc.
- `provenance` — records `record(capability, pluginId)` so a contributor can ask "which plugin owns this surface?" at any time.

`createHarnessContext()` constructs a fresh instance for tests and one-shot harnesses. The CLI's `bootstrapHarness()` factory builds the production version with the LLM provider and tool registry pre-installed.

## `PluginManifest` and `HarnessPlugin`

A `PluginManifest` is the plugin's identity card; an `HarnessPlugin` adds a `setup(ctx)` method that runs once on load.

```ts
import {
  PluginManifest,
  HarnessPlugin,
  HarnessContext,
} from "@canva-harness/runtime";

export const manifest: PluginManifest = {
  id: "foo-export",
  name: "Foo XML Export",
  version: "0.1.0",
  description: "Renders Canva designs to an internal Foo XML dialect.",
  dependencies: ["canva-core-capabilities"], // optional; ordered
};

export function createFooExportPlugin(): HarnessPlugin {
  return {
    manifest,
    async setup(ctx: HarnessContext) {
      // Register services, push disposables, emit "loaded".
    },
  };
}
```

`id` must be unique across the host. `dependencies` is verified by `PluginManager.load()`; loading a plugin whose dependency is not yet loaded throws `Missing dependency for <id>: <depId>`.

## `PluginManager`: load and unload

```ts
import { PluginManager, createHarnessContext } from "@canva-harness/runtime";

const ctx = createHarnessContext();
const pm = new PluginManager(ctx);

await pm.load(createCanvaCapabilitiesPlugin(session));
await pm.load(createFooExportPlugin());  // depends on the line above

// Reverse on shutdown or explicit hot-reload:
await pm.unload("foo-export");
// LIFO unwinds every disposable this plugin pushed. If another plugin still
// depends on foo-export, unload throws "Cannot unload foo-export: depended on by <id>".
```

`PluginManager.list()` returns the loaded manifests for diagnostics (the same shape `doctor` uses).

## `SessionStore` and projections

`SessionStore` is the append-only log. The only legal mutation is `append(type, data, schemaVersion?)`. Everything else — `deriveDesignState(events)`, `deriveTranscript(events)`, `deriveModelMessages(events)` — is a pure projection.

```ts
import { SessionStore, deriveDesignState, deriveTranscript } from "@canva-harness/session";

const store = new SessionStore();
store.append("design.created", { id: "d1", title: "Demo", format: "presentation", width: 1920, height: 1080 });
store.append("brand_kit.applied", { brandKit: { palette: ["#00C4CC"], fonts: { header: "Canva Sans", body: "Open Sans" } } });

deriveDesignState(store.events()).id;              // "d1"
deriveTranscript(store.events());                  // bracketed, sorted-by-insertion transcript
store.fork("alt-session");                         // copy-on-write; original is unchanged
```

`SessionStore` events carry a `schemaVersion` (default `1`). Bumping the version is the canonical way to evolve the event shape; readers should branch on `event.schemaVersion` instead of guessing.

## `ToolDefinition` and `ToolRegistry`

A tool is a leaf-level verb. The registry validates the arguments, enforces policy, emits `tools.preExecute` / `tools.postExecute`, persists a `tool.called` / `tool.result` (or `tool.error`) pair to the session, and only then invokes `execute(args, ctx)`.

```ts
import { ToolDefinition, IToolRegistry, TOOL_REGISTRY_SERVICE_KEY } from "@canva-harness/tools";
import { z, ZodType } from "@canva-harness/tools";

interface ValidateLayoutArgs { /* empty */ }

export const canvaValidateLayoutTool: ToolDefinition<ValidateLayoutArgs> = {
  name: "canva_validate_layout",
  description: "Run automated layout, safe margin, and brand compliance validation on the active canvas",
  schema: z.object({}) as ZodType<ValidateLayoutArgs>,
  policy: { readonly: true },
  execute: async (_args, ctx) => {
    const doc = ctx.harnessContext.services.get(CANVA_DOC_SERVICE_KEY);
    return doc.validateLayout(deriveDesignState(ctx.session.events()));
  },
};

toolRegistry.register(canvaValidateLayoutTool);

await toolRegistry.execute("canva_validate_layout", {}, {
  session: ctx.session,
  harnessContext: ctx,
  callId: "c1",
  isApproved: false,
});
```

Pipeline order:

1. `schema.safeParse(rawArgs)` → reject (`tool.error`) if invalid.
2. **Policy gate.** If `policy.requiresApproval` and `!isApproved`, emit `approval.requested` and reject.
3. Append `tool.called`; emit `tools.preExecute`.
4. Run the tool's `execute()`.
5. Append `tool.result`; emit `tools.postExecute`.

Any thrown error from step 4 is funneled through `tool.error` and rethrown to the caller.

## Event Catalog

| Event | Emitted by | Payload |
| :--- | :--- | :--- |
| `plugin.loaded` | `PluginManager.load` | `{ id, name }` |
| `plugin.unloaded` | `PluginManager.unload` | `{ id }` |
| `agent.preStep` | `AgentLoop.runTurn` | `{ turnId, stepId, step }` |
| `agent.turnCompleted` | `AgentLoop.runTurn` | `{ turnId, steps }` |
| `tools.preExecute` | `ToolRegistry.execute` | `{ callId, toolName, args }` |
| `tools.postExecute` | `ToolRegistry.execute` | `{ callId, toolName, result }` |
| `*` (wildcard) | `EventBus.emit` | `{ event, payload }` |

The session, not the bus, carries structured state-change events (`design.created`, `design.element_added`, `brand_kit.applied`, `export.generated`, `turn.started`, `turn.completed`, `user.message`, `assistant.message`, `tool.called`, `tool.result`, `tool.error`, `approval.requested`, `execution.error`). Treat the session as audit-grade and the bus as observable-grade.

## Capability Seams

The codebase follows Law B end-to-end. Reading `packages/capabilities` and `packages/tools` together shows the full Definition → Provider → Consumer pattern:

```ts
// packages/capabilities/src/index.ts — Definition
export interface ICanvaDocumentService {
  createDesign(input): CanvaDesignState;
  addElement(element): void;
  applyBrandKit(kit): void;
  validateLayout(state): LayoutValidationReport;
  exportDesign(format): { format: string; urlOrPath: string };
}

export const CANVA_DOC_SERVICE_KEY: ServiceKey<ICanvaDocumentService> =
  createServiceKey<ICanvaDocumentService>("canva.document");

// Provider is registered by createCanvaCapabilitiesPlugin():
ctx.services.register(CANVA_DOC_SERVICE_KEY, new CanvaDocumentService(session));

// packages/tools/src/index.ts — Consumer (one of four)
export const canvaCreateDesignTool: ToolDefinition<{ title: string; format: DesignFormat; ... }> = {
  name: "canva_create_design",
  description: "Create a new Canva design project with specified format and dimensions",
  schema: z.object({ /* ... */ }),
  execute: async (args, ctx) => {
    const doc = ctx.harnessContext.services.get(CANVA_DOC_SERVICE_KEY);
    return doc.createDesign(args);
  },
};
```

When adding a new seam, do all three: declare the interface and the `ServiceKey<T>`, ship a `HarnessPlugin` that registers an implementation under that key, and provide at least one tool that consumes it. Skipping any of the three breaks Law B and triggers the PR review checklist in [README.md](../README.md#pull-request-standards).
