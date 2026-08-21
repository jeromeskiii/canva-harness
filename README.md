# @canva-harness

> A production-grade, plugin-first AI agent runtime and workflow harness for Canva design automation, template generation, brand kit governance, layout verification, and asset processing.
> Companion narrative in [CANVA.md](./CANVA.md) — scope, safety boundary, and the 7 Architectural Laws. This README is the operational entry point: installation, commands, configuration, contributing workflow, and operational profiles.

Canva Harness strictly isolates itself from `/Applications/Canva.app` (`com.canva.canvaeditor`). It does not modify the macOS application bundle nor its internal application resources. All interactions with Canva are expressed through explicit service seams and providers.

## Table of Contents
- [Architecture](#architecture)
  - [Core Runtime (`@canva-harness/runtime`)](#core-runtime-canva-harnessruntime)
  - [Session & Projections (`@canva-harness/session`)](#session--projections-canva-harnesssession)
  - [Capabilities (`@canva-harness/capabilities`)](#capabilities-canva-harnesscapabilities)
  - [Guarded Tools (`@canva-harness/tools`)](#guarded-tools-canva-harnesstools)
  - [Agent Loop (`@canva-harness/agent`)](#agent-loop-canva-harnessagent)
  - [CLI (`@canva-harness/cli`)](#cli-canva-harnesscli)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Usage Examples](#cli-usage-examples)
  - [`doctor`](#doctor)
  - [`inspect`](#inspect)
  - [`review`](#review)
  - [`run`](#run)
- [Programmatic Usage](#programmatic-usage)
  - [Defining a Custom Tool](#defining-a-custom-tool)
  - [Adding a Capability](#adding-a-capability)
- [Operational Profiles](#operational-profiles)
- [Architectural Laws](#architectural-laws)
- [Concepts Reference](#concepts-reference)
- [Versioning & Status](#versioning--status)
- [Contributing](#contributing)
- [Testing](#testing)
- [License](#license)

## Architecture

Canva Harness is built on the 7 Architectural Laws of DeepSeek Harness:

### Core Runtime (`@canva-harness/runtime`)
Modular `PluginManager`, typed `ServiceRegistry`, typed `EventBus`, `DisposableCollection` (LIFO unwinding), and a `ProvenanceTracker` for capability debugging.

### Session & Projections (`@canva-harness/session`)
Append-only `SessionStore` with `schemaVersion`. All state — model messages, conversational transcripts, and active canvas state — is derived as a pure projection from the event log. Sessions support safe forking.

### Capabilities (`@canva-harness/capabilities`)
Domain services for Canva designs (presentation, social_media, doc, whiteboard, video), brand kit enforcement, layout validators (safe margins, brand font compliance), and `canva://` deep link generation and parsing.

### Guarded Tools (`@canva-harness/tools`)
Type-safe schema validation, policy gates (read-only / requiresApproval), pre/post lifecycle hooks emitting `tools.preExecute` and `tools.postExecute` events, and full-session audit logging.

### Agent Loop (`@canva-harness/agent`)
Minimal turn-and-step execution engine that guarantees explicit user message persistence prior to deriving model messages, lifecycle hooks (`agent.preStep`, `agent.turnCompleted`), and error recovery with terminal events.

### CLI (`@canva-harness/cli`)
Standalone CLI with profile bootstrapping, `doctor` diagnostics, `inspect` operations, `review` runs, and `run` command execution.

## Installation

```bash
git clone https://github.com/jeromeskiii/canva-harness.git
cd canva-harness
npm install -g pnpm
pnpm install
pnpm test
```

## Quick Start

```bash
# Verify environment and integration
npx tsx packages/cli/src/bin.ts doctor

# Inspect a generated design with brand governance
npx tsx packages/cli/src/bin.ts inspect --profile=brand-governance

# Review markdown documentation
npx tsx packages/cli/src/bin.ts review ./README.md ./CANVA.md
```

## CLI Usage Examples

The CLI provides four core commands. All commands accept the `--profile=<name>` flag to switch operational posture.

### `doctor`
Audits the active workspace, detects the macOS Canva desktop application, lists mounted plugins and services, and enumerates registered tools.

```bash
npx tsx packages/cli/src/bin.ts doctor
```

Sample output:
```json
{
  "status": "healthy",
  "harness": "@canva-harness/cli",
  "profile": "safe-readonly",
  "safetyBoundary": {
    "canvaAppDetected": true,
    "path": "/Applications/Canva.app",
    "bundleId": "com.canva.canvaeditor",
    "isolated": true
  },
  "plugins": [{"id": "canva-core-capabilities", "name": "Canva Core Capabilities", "version": "0.1.0"}],
  "services": ["canva.document", "canva.deeplink", "tools.registry", "llm.provider"],
  "tools": [
    {"name": "canva_create_design", "description": "Create a new Canva design project with specified format and dimensions"}
  ]
}
```

### `inspect`
Provisions a default design, applies the Canva brand kit, and emits the derived canvas state with a layout compliance report. The brand kit is applied by `CanvaDocumentService.applyBrandKit()` after the design is created, so the derived state shows both the layout and the governance palette.

```bash
npx tsx packages/cli/src/bin.ts inspect --profile=brand-governance
```

Sample output:

```json
{
  "action": "inspect",
  "profile": "brand-governance",
  "designState": {
    "width": 1920,
    "height": 1080,
    "elements": [],
    "exports": [],
    "id": "5c80b8cb-8aa4-4adc-b5b2-d4204fb34312",
    "title": "Template Project",
    "format": "presentation",
    "brandKit": {
      "palette": ["#00C4CC", "#7D2AE8", "#0E1318"],
      "fonts": { "header": "Canva Sans", "body": "Open Sans" }
    }
  },
  "validationReport": { "valid": true, "violations": [] },
  "eventsLogged": 2
}
```

### `review`
Performs an agent loop turn over the supplied document paths and dumps the resulting session transcript. The default LLM provider is a stub; tool calls only fire when the user message contains the literal keyword `design`. A `review` of pure documentation therefore produces a single text-only step and a 5-event transcript, as shown below.

```bash
npx tsx packages/cli/src/bin.ts review ./README.md ./CANVA.md
```

Sample output:

```json
{
  "status": "completed",
  "filesProcessed": ["./README.md", "./CANVA.md"],
  "steps": 1
}
```

Transcript (each line is an ISO-8601 UTC timestamped event from `SessionStore.append()`; do not parse as local time):

```text
[2026-08-21T16:22:10.808Z] [v1] turn.started {"turnId":"1736b87a-edd7-4df4-8855-5530134bd33e"}
[2026-08-21T16:22:10.808Z] [v1] user.message {"turnId":"1736b87a-edd7-4df4-8855-5530134bd33e","content":"Review layout and brand specifications for files: ./README.md, ./CANVA.md"}
[2026-08-21T16:22:10.808Z] [v1] step.started {"turnId":"1736b87a-edd7-4df4-8855-5530134bd33e","stepId":"328e0d7d-136e-484f-99ab-dd1c8b38a0ba","step":1}
[2026-08-21T16:22:10.808Z] [v1] assistant.message {"turnId":"1736b87a-edd7-4df4-8855-5530134bd33e","stepId":"328e0d7d-136e-484f-99ab-dd1c8b38a0ba","content":"Canva Harness [safe-readonly]: Task completed successfully."}
[2026-08-21T16:22:10.808Z] [v1] turn.completed {"turnId":"1736b87a-edd7-4df4-8855-5530134bd33e","steps":1,"status":"success"}
```

### `run`
Executes a free-form natural language prompt through the full agent loop with explicit approval. The default LLM stub returns a canned text message unless the prompt contains the keyword `design`, in which case it issues a single `canva_create_design` tool call and the agent loop performs a second step to record the assistant message. All transcripts use ISO-8601 UTC timestamps emitted by `SessionStore.append()`; do not parse them as local time.

```bash
npx tsx packages/cli/src/bin.ts run "design a Canva pitch deck for our new SaaS"
```

Sample output (two-step transcript with the create-design tool call):

```json
{
  "result": "completed",
  "steps": 2,
  "designState": {
    "width": 1920,
    "height": 1080,
    "elements": [],
    "exports": [],
    "id": "3dc234f8-7142-47e4-b09b-e7bf74c7debf",
    "title": "Automated Design",
    "format": "presentation"
  },
}
```

Transcript (notice the `tool.called` and `design.created` events recorded between `step.started` and the assistant reply):

```text
[2026-08-21T16:27:22.171Z] [v1] turn.started {"turnId":"1d63a3c0-b252-4775-8157-aea228b81cdc"}
[2026-08-21T16:27:22.171Z] [v1] user.message {"turnId":"1d63a3c0-b252-4775-8157-aea228b81cdc","content":"design a Canva pitch deck for our new SaaS"}
[2026-08-21T16:27:22.171Z] [v1] step.started {"turnId":"1d63a3c0-b252-4775-8157-aea228b81cdc","stepId":"2b47f422-29f9-4e62-89a5-d576e2f256cd","step":1}
[2026-08-21T16:27:22.172Z] [v1] tool.called {"callId":"ace455fa-76ac-41cf-a21e-f9d21531e3b6","toolName":"canva_create_design","args":{"title":"Automated Design","format":"presentation"}}
[2026-08-21T16:27:22.172Z] [v1] design.created {"id":"3dc234f8-7142-47e4-b09b-e7bf74c7debf","title":"Automated Design","format":"presentation","width":1920,"height":1080}
[2026-08-21T16:27:22.172Z] [v1] tool.result {"callId":"ace455fa-76ac-41cf-a21e-f9d21531e3b6","toolName":"canva_create_design","result":{"id":"3dc234f8-7142-47e4-b09b-e7bf74c7debf","title":"Automated Design","format":"presentation","width":1920,"height":1080,"elements":[],"exports":[]}}
[2026-08-21T16:27:22.172Z] [v1] step.started {"turnId":"1d63a3c0-b252-4775-8157-aea228b81cdc","stepId":"0f3b1940-e829-4c93-9e27-0e0f1d6da582","step":2}
[2026-08-21T16:27:22.172Z] [v1] assistant.message {"turnId":"1d63a3c0-b252-4775-8157-aea228b81cdc","stepId":"0f3b1940-e829-4c93-9e27-0e0f1d6da582","content":"Canva Harness [safe-readonly]: Task completed successfully."}
[2026-08-21T16:27:22.172Z] [v1] turn.completed {"turnId":"1d63a3c0-b252-4775-8157-aea228b81cdc","steps":2,"status":"success"}
```

## Programmatic Usage

```ts
// bootstrap.ts
import { bootstrapHarness } from "@canva-harness/cli";
import { CANVA_DOC_SERVICE_KEY } from "@canva-harness/capabilities";
import { deriveDesignState } from "@canva-harness/session";

const harness = await bootstrapHarness("developer");
const docService = harness.ctx.services.get(CANVA_DOC_SERVICE_KEY);

const design = docService.createDesign({ title: "Launch Deck", format: "presentation" });
docService.applyBrandKit({
  id: "kit-1",
  name: "Primary",
  palette: ["#00C4CC", "#7D2AE8"],
  fonts: { header: "Canva Sans", body: "Open Sans" },
  primaryColor: "#00C4CC",
});

// Pure projection of current canvas from session log
const state = deriveDesignState(harness.session.events());
```

### Defining a Custom Tool

```ts
import { z, ZodType } from "@canva-harness/tools";

interface AddAssetArgs {
  designId: string;
  assetUrl: string;
}

export const addAssetTool = {
  name: "canva_add_asset",
  description: "Insert an asset into a Canva design",
  schema: z.object({
    designId: z.string().min(1),
    assetUrl: z.string().min(1),
  }) as ZodType<AddAssetArgs>,
  policy: { requiresApproval: true },
  execute: async (args, ctx) => {
    ctx.session.append("asset.added", args);
    return { success: true };
  },
};
```

## Operational Profiles

| Profile | Purpose | Mutations allowed | Interactive approval |
| :--- | :--- | :--- | :--- |
| `safe-readonly` | Inspect projects, run analysis, perform no mutations. | no | no |
| `developer` | Permit approved workspace changes through the guarded tool path. | yes (guarded) | yes |
| `brand-governance` | Enforce strict brand kit rules and layout validation. | yes (guarded) | yes |
| `headless` | Deterministic CI/batch review with no interactive approval. | yes (pre-approved) | no |
| `creative-automation` | Generate multi-page templates and social media assets. | yes (guarded) | yes |

On non-macOS hosts `doctor` reports `safetyBoundary.canvaAppDetected: false` while `isolated` stays `true`. The harness still operates; only that one diagnostic is a no-op.

## Architectural Laws

1. **Everything Replaceable (A)**: Services are registered through `PluginContext` via typed `ServiceKey<T>` contracts.
2. **Capability Seams (B)**: Definition → Provider → Consumer separation honored throughout.
3. **State is Reconstructable (C)**: Single source of truth (`SessionStore`) with pure projections; no in-place mutation.
4. **The Loop is Infrastructure (D)**: The `AgentLoop` exposes lifecycle extension hooks instead of growing new branches.
5. **Reversible Registrations (E)**: All registrations return disposables that unwind in LIFO order.
6. **Schema Validation at the Seam (F)**: Type-safe `ZodType` validation prevents malformed tool invocations.
7. **Human-in-the-Loop Approval (G)**: Privileged actions (export, off-brand edits) require explicit policy consent.

The full narrative for each law, with rationale, lives in [CANVA.md](./CANVA.md#architectural-laws).

## Concepts Reference

A short pointer map to the runtime types contributors will touch. Full definitions and examples live in [`docs/concepts.md`](./docs/concepts.md).

- **`ServiceKey<T>`** — typed identifier for any service registered in the `ServiceRegistry`. Created once per service via `createServiceKey<T>(name, description?)`.
- **`ServiceRegistry`** — string-keyed map with strict registration (re-registering throws). Every `register()` returns a `Disposable`.
- **`EventBus`** — async pub/sub used for `agent.preStep`, `agent.turnCompleted`, `tools.preExecute`, `tools.postExecute`, `plugin.loaded`, `plugin.unloaded`. Also supports a `"*"` wildcard listener that receives `{ event, payload }`.
- **`DisposableCollection`** — plugin-scoped list that unwinds in **LIFO** order on `dispose()`. Every registration an `HarnessPlugin` makes must be pushed here.
- **`PluginManifest` / `HarnessPlugin`** — `{ id, name, version, description?, dependencies? }` plus `setup(ctx)`. Plugin load verifies dependencies.
- **`SessionStore.append()`** — the *only* legal mutation surface. Everything else is derived by `deriveDesignState(events)` or `deriveTranscript(events)`.

## Versioning & Status

- **Current version**: `0.1.0` (pre-1.0; APIs may change between minor versions).
- **Versioning policy**: SemVer 2.0.0 once we hit `1.0.0`. Until then, every minor-version bump may include a breaking change logged in `CHANGELOG.md`.
- **Public vs internal packages**: `@canva-harness/cli`, `@canva-harness/agent`, `@canva-harness/capabilities`, `@canva-harness/tools`, `@canva-harness/session`, and `@canva-harness/runtime` are public; any package prefixed `@canva-harness/internal-*` is not.

## Contributing

### Prerequisites
- Node.js >= 22
- `pnpm` >= 11.x (or `npx` to invoke tools ad-hoc)
- macOS with `/Applications/Canva.app` (for safety boundary diagnostics only — the harness never modifies the application)
  - Non-macOS hosts still operate; `doctor` will simply report `canvaAppDetected: false`.

### Workflow
1. **Fork and Branch**: Create a topic branch named `feature/<scope>` or `fix/<scope>` from `main`.
2. **Implement**: Add or modify code inside the relevant `packages/*` directory.
   - Always add new domain services as `PluginManifest` objects.
   - Always emit events through the `SessionStore`; never mutate state in place.
   - Always validate tool arguments via `ZodType` schemas.
3. **Test**: Run `npx vitest run` to validate all packages.
   - Add unit tests for new services under `packages/<pkg>/tests/`.
   - Add integration tests in `packages/cli/tests/` for new end-to-end flows.
4. **Document**: Update `CANVA.md` or `README.md` whenever new commands, profiles, or capabilities are introduced.

### Pull Request Standards
- One concern per PR.
- Include the rationale for any architectural deviation from the 7 Laws.
- Reference the relevant Law (A–G) that your PR implements or refines.
- Provide a test addendum demonstrating the new path.

In addition, the PR description must include all of the following self-check items when applicable:

- **Profile delta** — list every profile (`safe-readonly`, `developer`, `brand-governance`, `headless`, `creative-automation`) whose behavior changes, with one sentence each.
- **Sample CLI output delta** — show before/after JSON for any changed or new command. Pin the profile in the example header.
- **Event names delta** — list any new event names (`agent.*`, `tools.*`, or plugin-local). Update [`docs/concepts.md`](./docs/concepts.md).
- **Integration test** — at least one new test under `packages/cli/tests/` covering the end-to-end path through `bootstrapHarness()`.

### Coding Style
- TypeScript strict mode is mandatory.
- `enable_experimental_strict: true` is canonical.
- Avoid mutation outside of `SessionStore.append()`.
- Never write secrets, cookies, credentials, or proprietary Canva assets to disk.
- Use `crypto.randomUUID()` for stable identifier generation.

## Testing

```bash
# Run all tests
npx vitest run

# Run with verbose reporter
npx vitest run --reporter=verbose

# Run a single package suite
npx vitest run packages/runtime
```

### CI
GitHub Actions automatically runs `vitest run` on every push to `main` and on every pull request. The workflow definition is at `.github/workflows/ci.yml`.

## License

MIT — see [LICENSE](LICENSE) for full text.
