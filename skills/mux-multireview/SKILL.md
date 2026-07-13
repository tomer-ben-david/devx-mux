---
name: mux-multireview
description: Run the same exact read-only review scope concurrently through independent Codex and Grok reviewers using DevX Mux. Use when a user asks for mux multireview, mux-multireview, both Codex and Grok reviews, parallel multi-provider review, or two independent AI reviews without an implementation or fix loop.
---

# Mux Multireview

Run DevX Mux's provider-neutral concurrent review command from the repository being reviewed:

```bash
mux multireview <scope> [options]
```

Read [`../devx-mux/references/review-protocol.md`](../devx-mux/references/review-protocol.md) before running the review.

## Scope

Use the scope the user selected. Map requests exactly:

| Request | Scope |
| --- | --- |
| Current branch | `branch` |
| Working-tree changes | `local` |
| One commit | `commit <ref>` |
| Pull request | `pr <number>` |
| Whole repository | `codebase` |

Do not substitute one scope for another. For branch reviews, let Git derive the merge base unless the user explicitly supplies `--base`. Record the current HEAD before starting.

## Run

Use high reasoning by default:

```bash
mux multireview <scope> --codex-reasoning high --grok-reasoning high
```

Use `--repo <path>` when the target is not the current directory. Use `--format markdown` when output is being captured instead of rendered interactively.

Translate explicit user focus, verification requirements, and non-goals into `--instructions`. Pass the same instructions to both reviewers and do not invent additional exclusions:

```bash
mux multireview branch --instructions "Treat backfill and repair scripts as non-goals. Review shipped runtime code only and require concrete reproduction for findings."
```

If `mux` is unavailable, fail loudly and tell the user to install or link DevX Mux. Do not silently substitute direct provider commands.

## Report

Preserve each provider's report verbatim. State the exact scope and HEAD, then present the Codex and Grok verdicts independently. Do not silently filter findings or claim convergence when either review is incomplete.

For PR scope, follow the shared protocol's GitHub publication rules. Post the complete Codex and Grok reports as separate PR comments after both reviews finish successfully. Include the provider and reviewed head above each verbatim report. Do not post the combined wrapper instead of the two provider reports. Use body files with `gh pr comment`; never interpolate a full report into a shell command.

Once GitHub comment publication is authorized, also post the exact comment `@codex review` once for the current PR review round. Do not post duplicate triggers for the same requested round.

Keep provider execution read-only. If the user wants an implementor to fix findings and repeat reviews until clean, use `$mux-orchestrate` as a separate workflow.
