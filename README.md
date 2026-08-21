# @canva-harness

A production-grade, plugin-first AI agent runtime and workflow harness for Canva design automation, template generation, brand kit governance, layout verification, and asset processing.

Canva Harness strictly isolates itself from `/Applications/Canva.app` (`com.canva.canvaeditor`). It does not modify the macOS application bundle nor its internal application resources. All interactions with Canva are expressed through explicit service seams and providers.

## Table of Contents
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [CLI Usage Examples](#cli-usage-examples)
- [Programmatic Usage](#programmatic-usage)
- [Operational Profiles](#operational-profiles)
- [Architectural Laws](#architectural-laws)
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
Provisions a default design, applies the Canva brand kit, and emits the derived canvas state with a layout compliance report.

```bash
npx tsx packages/cli/src/bin.ts inspect --profile=brand-governance
```

### `review`
Performs an agent loop turn over the supplied document paths and dumps the resulting session transcript.

```bash
npx tsx packages/cli/src/bin.ts review ./design.md ./copy.md
```

### `run`
Executes a free-form natural language prompt through the full agent loop with explicit approval.

```bash
npx tsx packages/cli/src/bin.ts run "Generate a Canva presentation for AI architecture"
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

| Profile | Purpose |
| :--- | :--- |
| `safe-readonly` | Inspect projects, run analysis, perform no mutations. |
| `developer` | Permit approved workspace changes through the guarded tool path. |
| `brand-governance` | Enforce strict brand kit rules and layout validation. |
| `headless` | Deterministic CI/batch review with no interactive approval. |
| `creative-automation` | Generate multi-page templates and social media assets. |

## Architectural Laws

1. **Everything Replaceable**: Services are registered through `PluginContext` via typed `ServiceKey<T>` contracts.
2. **Capability Seams**: Definition → Provider → Consumer separation honored throughout.
3. **State is Reconstructable**: Single source of truth (`SessionStore`) with pure projections; no in-place mutation.
4. **The Loop is Infrastructure**: The `AgentLoop` exposes lifecycle extension hooks instead of growing new branches.
5. **Reversible Registrations**: All registrations return disposables that unwind in LIFO order.
6. **Schema Validation at the Seam**: Type-safe `ZodType` validation prevents malformed tool invocations.
7. **Human-in-the-Loop Approval**: Privileged actions (export, off-brand edits) require explicit policy consent.

## Contributing

### Prerequisites
- Node.js >= 22
- `pnpm` >= 11.x (or `npx` to invoke tools ad-hoc)
- macOS with `/Applications/Canva.app` (for safety boundary diagnostics only — the harness never modifies the application)

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
