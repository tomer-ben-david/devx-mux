---
name: mux-orchestrate
description: Provider-neutral entrypoint for orchestrating a coding implementor and independent Codex, Grok, or ChatGPT reviewers through DevX Mux. Use when a user asks for mux-orchestrate, implementation followed by independent multi-provider review, a fix-and-rereview loop, or the older codex-orchestrate workflow.
---

# Mux Orchestrate

Read [`../devx-mux/SKILL.md`](../devx-mux/SKILL.md) completely and follow it.

Treat this skill as the stable, provider-neutral invocation name. Keep orchestration rules, transports, and review protocol in `devx-mux`; do not duplicate them here.

Do not perform remote mutations unless the user explicitly authorizes them.
