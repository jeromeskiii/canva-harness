# Canva Harness

Canva Harness is an extensible, provider-independent agent runtime tailored for Canva-oriented creative workflows, brand-governed design generation, visual asset analysis, layout validation, and guarded automation.

## Safety Boundary

This harness is strictly isolated from `/Applications/Canva.app`. It does not modify the installed macOS application bundle (`com.canva.canvaeditor`), its internal application resources (`app.asar`), or private system application support state. All Canva interactions and integrations are expressed through explicit service definitions, domain providers, export handlers, and validation plugins.

## Architectural Laws Implemented

1. **Law A — Everything Replaceable**: Core services (LLM, Document Store, Brand Kit, Asset Ingest, Policy, Execution) are registered into a modular `PluginContext` rather than hardcoded in the agent loop.
2. **Law B — Capability Seams**: Every subsystem strictly adheres to `Service Definition -> Provider -> Consumer`.
3. **Law C — State is Reconstructable**: Append-only `SessionEvent` stream acts as the single source of truth. Design state, transcripts, and model messages are derived as pure projections.
4. **Law D — The Loop is Infrastructure**: `AgentLoop` exposes lifecycle extension points (`agent/pre-step`, `tools/pre-execute`, `tools/post-execute`, `agent/turn-stopping`).
5. **Law E — Reversible Registrations**: Every tool, service, prompt section, and event listener returns a disposer function for clean teardown.
6. **Law F & G — Guarded Tool Pipeline**: Schema validation, policy checks, human-in-the-loop approval, execution, and audit event recording.

## Operational Profiles

- `safe-readonly`: Inspect design structures, validate brand guidelines, check contrast and typography without mutations.
- `developer`: Full workspace authoring, layout adjustments, and asset generation with capability-level telemetry.
- `brand-governance`: Enforce strict brand kit rules (color palette, typography hierarchy, minimum margins, logo protection).
- `headless`: Deterministic CI/batch review execution with no interactive approval prompts.
- `creative-automation`: Generate multi-page templates, social media assets, and deep-link design specifications.
