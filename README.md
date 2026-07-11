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
devx review commit HEAD --provider grok
devx review local --provider grok
devx review codebase --provider grok
devx review codebase --provider codex
```

When working directly from the cloned DevX Crew repository, use `./devx.sh` instead:

```bash
./devx.sh review branch --provider grok
./devx.sh review commit HEAD --provider grok
./devx.sh review local --provider grok
./devx.sh review codebase --provider grok
./devx.sh review codebase --provider codex
```

To install the shorter global `devx` command, run `./run.sh link` once.

Provider selection is always explicit. DevX Crew never guesses based on installed executables or silently falls back to another model.

Supported providers:

| Provider | Required executable | Execution policy |
| --- | --- | --- |
| `grok` | `grok` | High reasoning with verification enabled |
| `codex` | `codex` | Read-only sandbox with ephemeral session storage |

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
| `branch` | Merge-base diff from the base branch to `HEAD` |
| `commit [ref]` | The selected commit, defaulting to `HEAD` |
| `local` | Staged, unstaged, and untracked working-tree changes |
| `codebase` | Repository-wide architecture and implementation audit at `HEAD` |

Review execution is read-only. The reviewer is instructed not to edit files, and DevX Crew does not expose a mutation workflow.

### Review output

Every provider returns the same review structure:

- A standards checklist table with PASS, FAIL, or N/A for every applicable item
- P1, P2, and P3 findings with evidence and durable corrections
- Decisions that went well
- Verification gaps
- A Markdown-friendly summary with finding counts and the final verdict

DevX Crew hides provider prompts, reasoning, tool commands, and file-reading transcripts. The terminal shows concise progress while the provider works, followed only by the formatted final review.

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
