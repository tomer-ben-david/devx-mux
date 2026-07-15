# DevX Mux

Multiplex independent AI implementation and review workflows.

DevX Mux is an open-source toolkit for reviewing, validating, and shipping software with AI coding agents. Its first tool is `mux review`, an opinionated, evidence-driven code reviewer built around the [DevX coding standards](https://github.com/tomer-ben-david/devx-coding-standards).

## Why

AI code review is only useful when it is scoped, skeptical, and low-noise. DevX Mux gives the reviewer a stable contract independent of the underlying model:

- Review only changes introduced by the selected diff.
- Prefer structural, root-cause findings over patches and defensive clutter.
- Require concrete file and line evidence.
- Separate correctness findings from readability and standards findings.
- Report no findings when there is no actionable issue.

## Install

Requires Node.js 22.18 or newer and at least one supported provider CLI: Grok or Codex. Node 22.18 is the minimum because DevX Mux and its packaged skills execute TypeScript entrypoints directly. The package installs its own Bun runtime for the OpenTUI dashboard; no global Bun installation is required.

```bash
npm install --global devx-mux
mux setup
```

`mux setup` links the public DevX Mux skills into Codex, Claude, and shared agent discovery. It is safe to run again after reinstalling or moving the package.

### Install from source

```bash
git clone https://github.com/tomer-ben-david/devx-mux.git
cd devx-mux
./mux.sh setup
./mux.sh link-agent-files
```

## Usage

Run inside any Git repository:

```bash
mux review branch --provider grok
mux review pr 123 --provider grok --base origin/main
mux review commit HEAD --provider grok
mux review local --provider grok
mux review codebase --provider grok
mux review codebase --provider codex
mux review codebase --provider codex --reasoning xhigh
mux review branch --provider codex --instructions "Review shipped runtime code only."
```

When working directly from the cloned DevX Mux repository, use `./mux.sh` instead:

```bash
./mux.sh review branch --provider grok
./mux.sh review pr 123 --provider grok --base origin/main
./mux.sh review commit HEAD --provider grok
./mux.sh review local --provider grok
./mux.sh review codebase --provider grok
./mux.sh review codebase --provider codex
./mux.sh multireview codebase
./mux.sh multireview codebase --codex-reasoning xhigh --grok-reasoning high
./mux.sh multireview branch --instructions "Treat backfill and repair scripts as non-goals. Review shipped runtime code only."
```

For source development, run `./mux.sh link` once to replace the published command with a global npm link back to the checkout. Do not relink after each local commit: `./mux.sh check` refreshes the built files used by the linked command. Use `./mux.sh build` when only a rebuild is needed. Package versions change for releases, not for every commit.

### Public agent skills

DevX Mux is also the canonical public home for reusable agent workflows:

| Skill | Responsibility |
| --- | --- |
| `devx-mux` | Discover implementor and reviewer panels, then coordinate independent Codex, Grok, and optional ChatGPT review loops across cmux or DevX Rex |
| `mux-multireview` | Run the same read-only scope concurrently through independent Codex and Grok reviewers |
| `mux-orchestrate` | Provider-neutral invocation for the `devx-mux` implementation and independent review loop |
| `pr-title-description` | Draft reviewer-neutral PR titles and descriptions with explicit Goals, Non-goals, and Solution |
| `staged-pr-review` | Run commit, branch, standards, and final full-PR review gates sequentially |

Install links for Codex, Claude, and shared agent discovery:

```bash
mux setup
```

Each person runs the installer once after installing the npm package. It links the packaged public skills into their Codex, Claude, and shared-agent skill directories, so `$mux-multireview` and `$mux-orchestrate` can be invoked while working in any repository. Source contributors can use `./mux.sh link-agent-files` to link the same skills directly to their checkout.

The installer refreshes stale symlinks it owns, but never overwrites a real file or directory. Legacy names such as `codex-orchestrate`, `cmux-review-loop`, and `rex-review-loop` may remain compatibility pointers to `devx-mux`; new orchestration prompts should use `mux-orchestrate`. The canonical workflow and shared browser transport live in `devx-mux`.

The repository's root `AGENTS.md` remains local to each clone and is not installed globally. Reusable workflows belong in public skills; repository-specific policy stays in `AGENTS.md`.

### Portability

DevX Mux keeps portable orchestration and provider logic in TypeScript wherever possible so the same code can evolve across macOS, Linux, and Windows. Shell files are limited to thin compatibility entrypoints and adapters for inherently Unix-specific cmux or Rex socket behavior. New shared logic should not be implemented twice in separate mux scripts.

### Run the same review with Codex and Grok

Run each command from the repository you want to review:

```bash
# Codex, using the Codex CLI's configured model
mux review codebase --provider codex --reasoning high

# Grok, using the Grok CLI's latest default model
mux review codebase --provider grok --reasoning high

# Both reviewers concurrently, with independent reports
mux review codebase --provider both --reasoning high

# Recommended parallel-review command: Codex xhigh and Grok high
mux multireview codebase

# Both concurrently, with maximum Codex reasoning and high Grok reasoning
mux multireview codebase --codex-reasoning xhigh --grok-reasoning high

# Force clean Markdown even when launched from an interactive shell
mux multireview codebase --format markdown

# Give both reviewers the same focus and non-goals
mux multireview branch --instructions "Treat backfill and repair scripts as non-goals. Review shipped runtime code only and require concrete reproduction."
```

Replace `codebase` with `pr 123 --base origin/main`, `local`, `branch`, or `commit HEAD` to review a narrower scope. For PR review, DevX Mux requires each provider to use its own native read-only tools to read the title, description, issue comments, submitted reviews, and inline review threads before reviewing the diff. If required context remains unavailable after the provider exhausts its available methods, it reports the exact blocker and marks the review incomplete. DevX Mux does not pin either provider's model. It asks the selected CLI to use its configured default model and reports the exact model when the provider exposes it.

Use `--instructions "..."` to give every selected reviewer the same additional focus, verification requirements, or non-goals. Instructions may narrow review within the selected Git scope, but they cannot broaden that scope, authorize mutations, override repository guidance, or lower the evidence bar.

Provider selection is always explicit. DevX Mux never guesses based on installed executables or silently falls back to another model.

Supported providers:

| Provider | Required executable | Execution policy |
| --- | --- | --- |
| `grok` | `grok` | High reasoning with verification enabled |
| `codex` | `codex` | Read-only sandbox with ephemeral session storage |

Override reasoning effort when needed:

```bash
mux review codebase --provider codex --reasoning medium
mux review codebase --provider codex --reasoning high
mux review codebase --provider codex --reasoning xhigh
```

Grok supports `low`, `medium`, and `high`. Codex supports `low`, `medium`, `high`, and `xhigh`. For parallel review, use `--codex-reasoning` and `--grok-reasoning` when the reviewers should use different efforts. Without an override, `mux multireview` defaults Codex to `xhigh` and Grok to `high`, while `mux review --provider both` defaults both to `high`. Each CLI keeps its default model.

Preview the exact reviewer prompt without invoking a model:

```bash
mux review branch --provider grok --dry-run
```

Select a base branch or repository explicitly:

```bash
mux review branch --provider grok --base origin/main --repo /path/to/repository
```

### Review scopes

| Scope | Reviewed changes |
| --- | --- |
| `pr [number]` | PR metadata and stated intent first, then the branch diff from its base to `HEAD` |
| `branch` | Merge-base diff determined from Git; no default branch name is assumed. Use `--base` to override explicitly. |
| `commit [ref]` | The selected commit, defaulting to `HEAD` |
| `local` | Staged, unstaged, and untracked working-tree changes |
| `codebase` | Repository-wide architecture and implementation audit of the current checkout |

Review execution is read-only. The reviewer is instructed not to edit files, and DevX Mux does not expose a mutation workflow.

### Review output

Every provider receives the same scope and quality bar, then owns its response format. DevX preserves that output verbatim. Reviews are asked to cover:

- Every DevX coding standard individually, with PASS, FAIL, or N/A and brief evidence
- P1, P2, and P3 findings with evidence and durable corrections
- Decisions that went well
- Verification gaps
- A Markdown-friendly summary with finding counts and the final verdict

In an interactive terminal, DevX Mux uses a responsive OpenTUI dashboard for concise investigation notes, tool activity, elapsed time, activity counts, and independent reviewer state. Parallel reviews give Codex and Grok equal color-coded panels and run them directly in the same DevX process. Final review Markdown does not flood the activity panes. It is preserved verbatim in the provider and combined report artifacts.

When output is piped or captured by an AI agent, DevX Mux emits the complete provider-owned Markdown to stdout without cursor animation. Status and artifact paths go to stderr, so stdout is safe to render, capture, or relay. Every successful run also saves the complete reports in a private per-user temporary directory. Unix-like systems use `/tmp/devx-mux-<uid>/`; Windows uses the native temporary directory.

Output defaults to `auto`: TUI for an interactive terminal and Markdown otherwise. Override detection with `--format tui` or `--format markdown`. This supports direct shell use as well as calls from Codex, Claude, scripts, and other agents without maintaining separate commands.

The artifact-first review handoff and strict read-only reviewer separation are inspired by the strongest workflow ideas in Grok's `/review`. The retained terminal UI learns from the MIT-licensed [superagent-ai/grok-cli](https://github.com/superagent-ai/grok-cli), while semantic event handling and provider-state clarity also learn from the Apache-2.0 [OpenAI Codex CLI](https://github.com/openai/codex). DevX Mux implements its own provider-neutral persona, review guidance, dashboard, and multi-provider orchestration without parsing or rewriting provider responses.

The console reports the provider CLI version, configured model, and reasoning effort when they can be verified. Token usage is shown in compact form when the provider emits it, while the report artifact preserves exact counts. Remaining account quota is reported as unavailable rather than estimated.

### Using DevX Mux from an AI agent

An agent should first inspect the command contract:

```bash
mux review --help
```

Then select the scope from repository state and invoke an explicit provider:

```bash
# Uncommitted work
mux review local --provider grok

# Current branch against its base
mux review branch --provider grok --base origin/main

# One completed commit
mux review commit HEAD --provider grok

# Entire repository
mux review codebase --provider grok
```

Agents must not substitute one scope for another: `local` includes working-tree changes, `commit` reviews one commit, and `branch` reviews the cumulative branch diff. Use `--dry-run` when the task is to inspect the generated review instructions without invoking a provider.

Because agent-captured stdout is non-interactive, the final response is already Markdown suitable for rendering or relaying. DevX does not parse or rewrite it. The same report is persisted to the temporary artifact path printed on stderr. Agents can pass `--format markdown` explicitly when their terminal wrapper allocates a pseudo-TTY.

## Architecture

```text
apps/cli              command parsing and process boundary
packages/reviewer     review scope, prompt contract, provider interface
```

Grok and Codex are currently supported. The provider interface is intentionally small so additional model backends can be added without changing review semantics or terminal output.

### Agent model

DevX Mux composes review behavior from independent building blocks:

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
./mux.sh setup
./mux.sh check
./mux.sh review branch --provider grok --dry-run
```

Run `./mux.sh help` for individual test, type-check, build, link, review, and cleanup commands. The project intentionally uses local verification instead of consuming hosted CI minutes.

The npm release is built from a clean CLI bundle and includes the five public skills. Verify the exact consumer installation path locally with:

```bash
npm run test:install
```

### Publishing

The package version in `apps/cli/package.json` is the release source of truth. The first release reserves the package name through an explicitly authorized local `npm publish --workspace devx-mux`. After that, configure npm trusted publishing for `tomer-ben-david/devx-mux` and `.github/workflows/publish-npm.yml`. Publishing a GitHub release whose tag exactly matches `v<package-version>` then runs the full local check and publishes with npm provenance. A mismatched tag fails before publication.

The shell files are minimal launchers only. Workflow behavior lives in TypeScript under `scripts/`. On systems without a POSIX shell, use the equivalent npm entry point:

```bash
npm run mux -- check
npm run cli -- review local --provider grok
```

## License

MIT
