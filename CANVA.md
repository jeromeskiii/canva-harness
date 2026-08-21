# Canva Harness

> Companion narrative to [README.md](./README.md). This document records scope, the safety boundary, and the rationale behind each of the 7 Architectural Laws. README.md is the operational entry point — installation, CLI examples, contributing workflow, and operational profiles — and reads together with [docs/concepts.md](./docs/concepts.md) for type-level details.

Canva Harness is an extensible, provider-independent agent runtime tailored for Canva-oriented creative workflows, brand-governed design generation, visual asset analysis, layout validation, and guarded automation.

## Table of Contents

- [Safety Boundary](#safety-boundary)
- [Architectural Laws](#architectural-laws)
- [Profiles at a Glance](#profiles-at-a-glance)
- [Concepts Reference](#concepts-reference)

## Safety Boundary

This harness is strictly isolated from `/Applications/Canva.app`. It does not modify the installed macOS application bundle (`com.canva.canvaeditor`), its internal application resources (`app.asar`), or private system application support state. All Canva interactions and integrations are expressed through explicit service definitions, domain providers, export handlers, and validation plugins.

## Architectural Laws

The seven laws below are inherited and refined from the DeepSeek Harness reference. Each one points to the concrete primitives in this codebase that implement it, and to the package where each primitive lives.

1. **Law A — Everything Replaceable.** Core services (LLM, Document Store, Brand Kit, Asset Ingest, Policy, Execution) are registered into a modular `HarnessContext` rather than hardcoded in the agent loop. Concrete primitives: `ServiceKey<T>`, `ServiceRegistry`, `PluginManager`, `HarnessPlugin` — `packages/runtime`.
2. **Law B — Capability Seams.** Every subsystem strictly adheres to `Definition → Provider → Consumer`. Concrete example: `ICanvaDocumentService` (definition) and `CanvaDocumentService` (provider) in `packages/capabilities`, consumed by `canvaCreateDesignTool`, `canvaApplyBrandKitTool`, `canvaValidateLayoutTool`, and `canvaExportAssetTool` in `packages/tools`.
3. **Law C — State is Reconstructable.** Append-only `SessionStore` acts as the single source of truth. Design state, transcripts, and model messages are derived as pure projections via `deriveDesignState()`, `deriveTranscript()`, and `deriveModelMessages()` in `packages/session`. Never mutate state outside `SessionStore.append()`.
4. **Law D — The Loop is Infrastructure.** `AgentLoop` exposes lifecycle extension points (in `packages/agent`) so consumers can observe behavior without forking the loop. Concrete hook names: `agent.preStep`, `agent.turnCompleted`. Listeners are registered through the `EventBus` and disposed via a `DisposableCollection`.
5. **Law E — Reversible Registrations.** Every tool, service, event listener, and plugin-scoped resource returns a disposer function. `DisposableCollection` is plugin-scoped; `PluginManager.unload(id)` unwinds it in **LIFO** order so dependents are torn down ahead of their dependencies.
6. **Law F — Schema Validation at the Seam.** Every tool argument is validated through `ZodType.safeParse` before `tools.preExecute` is emitted. Invalid arguments are recorded to the session as `tool.error` and execution aborts. The runtime never invokes an unvalidated tool.
7. **Law G — Human-in-the-Loop Approval.** Privileged actions (export, off-brand edits) declare `policy.requiresApproval: true` on their `ToolDefinition`. The `AgentLoop` propagates `isApproved` via `ToolExecutionContext`; absent approval, the registry records `approval.requested` and rejects execution. The CLI's `run` command sets `isApproved: true`; `review` and `inspect` do not.

The event names referenced above (`agent.preStep`, `agent.turnCompleted`, `tools.preExecute`, `tools.postExecute`, `plugin.loaded`, `plugin.unloaded`, and the wildcard `*`) form the canonical event vocabulary. The full table lives in [`docs/concepts.md#event-catalog`](./docs/concepts.md#event-catalog).

## Profiles at a Glance

For the full profile table, mutations/approval matrix, and CLI flag mapping, see [README → Operational Profiles](./README.md#operational-profiles). Each profile is selected via `bootstrapHarness("<profile>")` or `npx tsx packages/cli/src/bin.ts <command> --profile=<name>`.

## Concepts Reference

The runtime type catalog lives in [`docs/concepts.md`](./docs/concepts.md). It expands each of the primitives referenced above — `ServiceKey<T>`, `DisposableCollection`, `EventBus`, `PluginManifest`, `HarnessPlugin`, the plugin lifecycle (`load → setup → unload` with dependency checks), and capability seams — with copy-pasteable examples grounded in the source.
