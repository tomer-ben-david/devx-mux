# DevX Crew

Your engineering crew for AI-written code.

DevX Crew is an open-source toolkit for reviewing, validating, and shipping software with AI coding agents. Its first tool is `devx review`, an opinionated, evidence-driven code reviewer built around the [DevX coding standards](https://github.com/tomer-ben-david/devx-coding-standards).

## Why

AI code review is only useful when it is scoped, skeptical, and low-noise. DevX Crew gives the reviewer a stable contract independent of the underlying model:

- Review only changes introduced by the selected diff.
- Prefer structural, root-cause findings over patches and defensive clutter.
- Require concrete file and line evidence.
- Separate correctness findings from readability and standards findings.
- Report no findings when there is no actionable issue.

## Install from source

Requires Node.js 22 or newer and at least one supported provider CLI: Grok or Codex.

```bash
git clone https://github.com/tomer-ben-david/devx-crew.git
cd devx-crew
./run.sh setup
```

## Usage

Run inside any Git repository:

```bash
devx review branch --provider grok
devx review pr 123 --provider grok --base origin/main
devx review commit HEAD --provider grok
devx review local --provider grok
devx review codebase --provider grok
devx review codebase --provider codex
devx review codebase --provider codex --reasoning xhigh
```

When working directly from the cloned DevX Crew repository, use `./devx.sh` instead:

```bash
./devx.sh review branch --provider grok
./devx.sh review pr 123 --provider grok --base origin/main
./devx.sh review commit HEAD --provider grok
./devx.sh review local --provider grok
./devx.sh review codebase --provider grok
./devx.sh review codebase --provider codex
```

To install the shorter global `devx` command, run `./run.sh link` once.

### Run the same review with Codex and Grok

Run each command from the repository you want to review:

```bash
# Codex, using the Codex CLI's configured model
devx review codebase --provider codex --reasoning high

# Grok, using the Grok CLI's latest default model
devx review codebase --provider grok --reasoning high
```

Replace `codebase` with `pr 123 --base origin/main`, `local`, `branch`, or `commit HEAD` to review a narrower scope. A PR review first reads the PR title and description, then reviews its diff against the stated intent. DevX Crew does not pin either provider's model. It asks the selected CLI to use its configured default model and reports the exact model when the provider exposes it.

Provider selection is always explicit. DevX Crew never guesses based on installed executables or silently falls back to another model.

Supported providers:

| Provider | Required executable | Execution policy |
| --- | --- | --- |
| `grok` | `grok` | High reasoning with verification enabled |
| `codex` | `codex` | Read-only sandbox with ephemeral session storage |

Override reasoning effort when needed:

```bash
devx review codebase --provider codex --reasoning medium
devx review codebase --provider codex --reasoning high
devx review codebase --provider codex --reasoning xhigh
```

Grok supports `medium` and `high`. Without `--reasoning`, each provider keeps its configured default.

Preview the exact reviewer prompt without invoking a model:

```bash
devx review branch --provider grok --dry-run
```

Select a base branch or repository explicitly:

```bash
devx review branch --provider grok --base origin/main --repo /path/to/repository
```

### Review scopes

| Scope | Reviewed changes |
| --- | --- |
| `pr [number]` | PR metadata and stated intent first, then the branch diff from its base to `HEAD` |
| `branch` | Merge-base diff from the base branch to `HEAD` |
| `commit [ref]` | The selected commit, defaulting to `HEAD` |
| `local` | Staged, unstaged, and untracked working-tree changes |
| `codebase` | Repository-wide architecture and implementation audit of the current checkout |

Review execution is read-only. The reviewer is instructed not to edit files, and DevX Crew does not expose a mutation workflow.

### Review output

Every provider returns the same review structure:

- A standards checklist table with PASS, FAIL, or N/A for every applicable item
- P1, P2, and P3 findings with evidence and durable corrections
- Decisions that went well
- Verification gaps
- A Markdown-friendly summary with finding counts and the final verdict

In a terminal, DevX Crew shows a colored, fixed-height live viewport for provider messages, reasoning, and tool activity. The completed review becomes a compact dashboard with verdict, findings, every standards result, verification gaps, and usage. Raw prompts and protocol noise remain hidden.

When output is piped or captured by an AI agent, DevX Crew emits clean Markdown without cursor animation. Every successful run saves both a concise handoff summary and the complete PASS/FAIL/N/A report in a private per-user temporary directory, then prints both paths. Unix-like systems use `/tmp/devx-crew-<uid>/`; Windows uses the native temporary directory.

The artifact-first review handoff and strict read-only reviewer separation are inspired by the strongest workflow ideas in Grok's `/review`. DevX Crew implements its own provider-neutral persona, validated report model, exhaustive DevX standards checklist, severity system, terminal dashboard, and multi-provider adapters.

The console reports the provider CLI version, configured model, and reasoning effort when they can be verified. Token usage is shown in compact form when the provider emits it, while the report artifact preserves exact counts. Remaining account quota is reported as unavailable rather than estimated.

### Using DevX Crew from an AI agent

An agent should first inspect the command contract:

```bash
devx review --help
```

Then select the scope from repository state and invoke an explicit provider:

```bash
# Uncommitted work
devx review local --provider grok

# Current branch against its base
devx review branch --provider grok --base origin/main

# One completed commit
devx review commit HEAD --provider grok

# Entire repository
devx review codebase --provider grok
```

Agents must not substitute one scope for another: `local` includes working-tree changes, `commit` reviews one commit, and `branch` reviews the cumulative branch diff. Use `--dry-run` when the task is to inspect the generated review instructions without invoking a provider.

Because agent-captured stdout is non-interactive, the final response is already Markdown suitable for parsing or relaying. The same report is persisted to the temporary artifact path printed after the review.

## Architecture

```text
apps/cli              command parsing and process boundary
packages/reviewer     review scope, prompt contract, provider interface
```

Grok and Codex are currently supported. The provider interface is intentionally small so additional model backends can be added without changing review semantics or terminal output.

### Agent model

DevX Crew composes review behavior from independent building blocks:

| Component | Responsibility |
| --- | --- |
| Role | Responsibilities and allowed capabilities |
| Persona | Judgment, engineering taste, and communication style |
| Protocol | Investigation, verification, and decision procedure |
| Standards | Repository-specific quality expectations |
| Provider | The model and execution backend |

This keeps the reviewer's identity stable across model providers and allows future commands to reuse roles or personas without duplicating a giant prompt.

## Development

Use the local runner for the complete development workflow:

```bash
./run.sh setup
./run.sh check
./devx.sh review branch --provider grok --dry-run
```

Run `./run.sh help` for individual test, type-check, build, link, review, and cleanup commands. The project intentionally uses local verification instead of consuming hosted CI minutes.

The shell files are minimal launchers only. Workflow behavior lives in TypeScript under `scripts/`. On systems without a POSIX shell, use the equivalent npm entry point:

```bash
npm run crew -- check
npm run devx -- review local --provider grok
```

## License

MIT
