# DeepSeek Harness Architecture Review & Alignment for Canva Harness

## Overview

Canva Harness adopts the core architectural principles of DeepSeek Harness and the Prompt Guide:
- **Service Seams over Monolithic Core**: Tools and services live in isolated packages (`@canva-harness/runtime`, `@canva-harness/session`, `@canva-harness/capabilities`, `@canva-harness/tools`, `@canva-harness/agent`, `@canva-harness/cli`).
- **Append-Only Event Sourcing**: All design lifecycle events (`turn.started`, `tool.called`, `design.created`, `brand_kit.applied`, `export.generated`) are recorded durably with `schemaVersion`.
- **Pure State Projections**: Model messages, transcripts, and active canvas state are derived purely from the session log.
- **Strict Guardrails & Human-in-the-Loop**: Destructive operations or off-brand changes require explicit policy consent.
- **Disposability**: All plugin effects and listeners clean up deterministically in LIFO order.
