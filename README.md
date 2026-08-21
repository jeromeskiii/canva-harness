# @canva-harness

A production-grade, plugin-first AI agent runtime and workflow harness for Canva design automation, template generation, brand kit governance, layout verification, and asset processing.

## Architecture

Canva Harness is built on the 7 Architectural Laws of DeepSeek Harness:
- **Core Runtime (`packages/runtime`)**: Modular `PluginManager`, typed `ServiceRegistry`, and `EventBus` with disposable unwinding.
- **Session & Projections (`packages/session`)**: Append-only event store as single source of truth; pure state projections and session forking.
- **Capabilities (`packages/capabilities`)**: Domain models for Canva designs, multi-page presentations, social templates, vector elements, brand kit rules, deep links (`canva://`), and layout validators.
- **Guarded Tools (`packages/tools`)**: Zod-validated tool definitions with pre/post execution hooks and automatic session logging.
- **Agent Loop (`packages/agent`)**: Minimal turn-and-step execution engine with streaming, turn termination, and error recovery.
- **CLI (`packages/cli`)**: Standalone CLI with profile bootstrapping, doctor diagnostics, design inspection, and batch review.

## Quick Start

```bash
# Run test suite
pnpm test

# Run CLI demo
npx tsx packages/cli/src/bin.ts doctor
npx tsx packages/cli/src/bin.ts inspect --profile brand-governance
```
