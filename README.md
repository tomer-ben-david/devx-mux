# DevX Mux

Multiplex independent AI implementation and review workflows.

DevX Mux is an open-source toolkit for reviewing, validating, and shipping software with AI coding agents. It is built from three layers that share one contract: the same scope, quality bar, and output expectations regardless of which model executes the work.

| Layer | What it provides |
| --- | --- |
| Review CLI | `mux review` and `mux multireview`: scoped, evidence-driven, read-only code review through Codex and Grok, with an optional fresh-context verification pass that tries to refute every finding |
| Agent skills | Eight public `mux-*` skills covering the end-to-end engineering workflow, multi-agent orchestration, parallel independent review, PR descriptions, staged review gates, task-context save/restore, and concise work status reports |
| Agent config | Version-controlled global instruction files for Codex and Claude, linked deterministically into each agent's home by `mux setup` |

## Why

AI-generated review and implementation are only useful when they are scoped, skeptical, and low-noise. DevX Mux encodes that stance as a stable contract that does not depend on the underlying model:

- **Provider-neutral.** The scope, prompt contract, and output handling are identical across providers. Provider selection is always explicit; DevX Mux never guesses based on installed executables and never silently falls back to another model.
- **Scoped.** Review only the changes introduced by the selected Git scope. Instructions may narrow a scope but never broaden it.
- **Evidence-driven.** Findings require concrete file and line evidence. Structural, root-cause corrections are preferred over patches and defensive clutter.
- **Read-only review.** The reviewer is instructed not to edit files, and DevX Mux exposes no mutation workflow.
- **Verbatim output.** Each provider owns its response format; DevX Mux preserves it exactly instead of parsing or rewriting it.
- **Human decisions stay human.** Consequential decisions are routed to the user; learnings are proposed for review before becoming permanent instructions.
- **No silent failures.** When a provider or Git command fails, the exact error is reported. When required context is unavailable, the review is marked incomplete with the exact blocker.

## Requirements

- Node.js 22.18 or newer. This minimum exists because DevX Mux and its packaged skills execute TypeScript entrypoints directly.
- At least one supported provider CLI: [Grok](https://github.com/superagent-ai/grok-cli) or [Codex](https://github.com/openai/codex), installed and authenticated.
- No global Bun installation is required; the package brings its own Bun runtime for the terminal dashboard.

## Install

```bash
npm install --global devx-mux
mux setup
```

`mux setup` links the public DevX Mux skills into Codex, Claude, and shared agent discovery, and links the version-controlled `agent-config` instruction files into each agent home. It is deterministic and safe to run again after reinstalling or moving the package.

### Install from source

```bash
git clone https://github.com/tomer-ben-david/devx-mux.git
cd devx-mux
./mux.sh setup
./mux.sh link-agent-files
```

On systems without a POSIX shell, use the equivalent npm entry points: `npm run mux -- <command>` and `npm run cli -- <command>`.

## Review CLI

Run inside any Git repository. `mux review` reviews through the provider you name; `mux multireview` always runs Codex and Grok concurrently and independently.

```bash
mux review branch --provider grok
mux review pr 123 --provider grok --base origin/main
mux review commit HEAD --provider codex
mux review local --provider codex
mux review codebase --provider both --reasoning high

mux multireview codebase
mux multireview codebase --codex-reasoning xhigh --grok-reasoning high
mux multireview branch --instructions "Review shipped runtime code only."
```

When working from a clone of this repository, use `./mux.sh review ...` and `./mux.sh multireview ...` instead of the global `mux` command.

### Review scopes

| Scope | Reviewed changes |
| --- | --- |
| `pr [number]` | PR metadata and stated intent first, then the branch diff from its base to `HEAD` |
| `branch` | Merge-base diff determined from Git; no default branch name is assumed. Use `--base` to override explicitly. |
| `commit [ref]` | The selected commit, defaulting to `HEAD` |
| `local` | Staged, unstaged, and untracked working-tree changes |
| `codebase` | Repository-wide architecture and implementation audit of the current checkout |

Scopes are not interchangeable: `local` includes working-tree changes, `commit` reviews exactly one commit, and `branch` reviews the cumulative branch diff. Agents invoking DevX Mux must select the scope that matches the task.

### Providers

| Provider | Required executable | Execution policy |
| --- | --- | --- |
| `grok` | `grok` | High reasoning with verification enabled |
| `codex` | `codex` | Read-only sandbox with ephemeral session storage |

DevX Mux does not pin either provider's model. It asks the selected CLI to use its configured default model and reports the exact model when the provider exposes it.

For PR review, each provider must use its own native read-only tools to read the title, description, issue comments, submitted reviews, and inline review threads before reviewing the diff. If required context remains unavailable after the provider exhausts its available methods, it reports the exact blocker and marks the review incomplete.

### Reasoning effort

```bash
mux review codebase --provider codex --reasoning medium   # low | medium | high | xhigh
mux review codebase --provider grok --reasoning high      # low | medium | high
```

Grok supports `low`, `medium`, and `high`. Codex supports `low`, `medium`, `high`, and `xhigh`. Without an override, `mux multireview` defaults Codex to `xhigh` and Grok to `high`, while `mux review --provider both` defaults both to `high`. Use `--codex-reasoning` and `--grok-reasoning` when parallel reviewers should use different efforts.

### Shared instructions

```bash
mux review branch --provider grok --instructions "Review shipped runtime code only."
```

`--instructions` gives every selected reviewer the same additional focus, verification requirements, or non-goals. Instructions may narrow review within the selected Git scope, but they cannot broaden that scope, authorize mutations, override repository guidance, or lower the evidence bar.

Preview the exact composed prompt without invoking a model:

```bash
mux review branch --provider grok --dry-run
```

### Finding verification pass

Parallel review can produce findings that fall apart under scrutiny. `mux multireview --verify` adds a fresh-context skeptic pass after both reports: a new context that wrote none of the findings re-checks each one against the repository and returns `CONFIRMED`, `REFUTED`, or `UNRESOLVED` with the file and line evidence that decided it. The skeptic adds no new findings, merges nothing, and softens nothing; findings you cannot decide from repository evidence are `UNRESOLVED`, never silently `CONFIRMED`.

```bash
mux multireview pr 123 --verify
```

### Review output

Every provider receives the same scope and quality bar, then owns its response format. Reviews are asked to cover every DevX coding standard individually with PASS, FAIL, or N/A and brief evidence; P1–P3 findings with evidence and durable corrections; decisions that went well; verification gaps; and a Markdown-friendly summary with finding counts and the final verdict.

- **Interactive terminal:** a responsive OpenTUI dashboard shows investigation notes, tool activity, elapsed time, activity counts, and independent reviewer state. Parallel reviews run directly in the same DevX process with equal color-coded panels. Final review Markdown does not flood the activity panes; it is preserved verbatim in the report artifacts.
- **Piped or agent-captured output:** the complete provider-owned Markdown goes to stdout without cursor animation, while status and artifact paths go to stderr. Stdout is safe to render, capture, or relay.
- **Artifacts:** every successful run saves the complete reports in a private per-user temporary directory (`/tmp/devx-mux-<uid>/` on Unix-like systems, the native temporary directory on Windows).

Output defaults to `auto`: TUI for an interactive terminal, Markdown otherwise. Override detection with `--format tui` or `--format markdown`. The console reports the provider CLI version, configured model, and reasoning effort when they can be verified, shows token usage in compact form when the provider emits it, and reports remaining account quota as unavailable rather than estimated.

The artifact-first review handoff and strict read-only reviewer separation are inspired by the strongest workflow ideas in Grok's `/review`. The retained terminal UI learns from the MIT-licensed superagent-ai/grok-cli, while semantic event handling and provider-state clarity also learn from the Apache-2.0 OpenAI Codex CLI. DevX Mux implements its own provider-neutral persona, review guidance, dashboard, and multi-provider orchestration.

### Using DevX Mux from an AI agent

Inspect the command contract first, then select the scope from repository state:

```bash
mux review --help

mux review local --provider grok                              # uncommitted work
mux review branch --provider grok --base origin/main          # current branch
mux review commit HEAD --provider grok                        # one completed commit
mux review codebase --provider grok                           # entire repository
```

Because agent-captured stdout is non-interactive, the final response is already Markdown suitable for rendering or relaying, and the same report is persisted to the artifact path printed on stderr. Agents whose terminal wrapper allocates a pseudo-TTY can pass `--format markdown` explicitly. Use `--dry-run` when the task is to inspect the generated review instructions without invoking a provider.

## Agent skills

DevX Mux is the canonical public home for reusable agent workflows. Each skill is packaged with the npm release and linked under a `mux-*` invocation name by `mux setup`.

| Skill | Responsibility |
| --- | --- |
| `mux-ai-engineer-workflow` | Drive features, bugs, refactors, and performance work from investigation through defensible implementation, with a stated working contract, evidence checks, bounded implementation, human decision points, and learning from corrections |
| `mux-director` | Orchestrate an implementor, independent Codex/Grok/ChatGPT/@codex reviewers, a labeled DevX self-review, and an optional Opus investigator — for one PR (fix loop, patch-loop detection, convergence) or across several parallel PRs (cross-PR smell detection, decision routing) |
| `mux-multireview` | Run the same exact read-only review scope concurrently through independent Codex and Grok reviewers |
| `mux-chatgpt-review` | Loop a pull request through a user-selected ChatGPT browser surface until the exact head is reported clean |
| `mux-staged-review` | Run commit, branch, standards, and final full-PR review gates sequentially, advancing only after each stage is clean |
| `mux-pr-description` | Write concise, reviewer-neutral PR titles and descriptions that explain the intended outcome, scope, implemented solution, and evidence, with a structure suited to the change |
| `mux-journal` | One skill for your work log: draft daily, weekly, or monthly status reports from notes, agent transcripts, Slack, and GitHub evidence; save them to your journal; and save, order, and restore the working context of parallel tasks so switching works like `git switch` |

### Work journal (`mux-journal`)

`$mux-journal` is one front door for status reports, journal updates, and task context. It picks a mode from the request, and every mode shares the same settings file (`devx-mux-task-config.md`) and source list.

- **Report** (read-only): an update to copy into Slack or Heynote. It checks the requested window across accessible notes, Codex/Claude/Cursor transcripts, messages, and repository activity, then reconciles claims against merge, deployment, or execution evidence. Daily updates use 4–6 short bullets; broader manager reports group one-sentence `STATUS · Task` bullets under bold topic headings. Source-coverage limits stay separate from the copyable message. It never posts messages or resumes paused work.
- **Report + save**: the same report, then a dated entry in your configured Markdown journal, preserving prior content. No commits or branch switches.
- **Task** (`save`, `load`, `switch`, `next`, `queue`, `add`, `move`, `refresh`, `done`, `list`, `status`): one journal entry per task with name, date, PR, branch, folder, agents used, session links, and notes pointers.
  - **Refresh first.** Every save, load, or switch re-verifies GitHub, branches and commits, agent session stores, transcript link scans, Heynote, Google Drive, Slack, ChatGPT exports, cmux state, and the codebases, ending with a coverage table.
  - **An explicit queue.** A single ordered line in the journal ranks current work; `switch` and `next` follow it, `done` retires from it.
  - **Safe parking.** Saving commits tracked changes as `wip(mux-task): ...` on non-protected branches only, pushes only when an upstream exists, stashes on protected branches, and never force-pushes or discards changes.
  - **Links, never contents.** Entries store paths, permalinks, and session ids, never pasted transcripts, message bodies, file contents, or secrets.

Existing `mux-task:<slug>` journal markers keep working. All paths, repositories, and note locations come from the user's own settings file; the skill ships with no personal paths. `mux-journal` replaces the former `mux-task` and `mux-status-report` skills.

### Skill installation

```bash
mux setup
```

Each person runs the installer once after installing the npm package. It links the packaged public skills into their Codex, Claude, and shared-agent skill directories so every public workflow is available under its `mux-*` name. Source contributors can use `./mux.sh link-agent-files` to link the same files directly to their checkout.

DevX Mux reserves the canonical names in the table plus the obsolete `devx-mux`, `mux-orchestrate`, `pr-title-description`, and `staged-pr-review` names in the skill directories it manages. The installer deduplicates identical configured skill roots, rejects nested roots, builds and validates the complete canonical-link and obsolete-name cleanup plan, then applies it: every canonical reserved name is force-replaced with the current source, and every obsolete reserved name is deleted. Setup is therefore deterministic after reinstalling or moving the package, without risking the source checkout or preserving an older installed copy. The canonical orchestration workflow and shared browser transport live in `mux-director` (which absorbed the former `mux-orchestrate`).

### Agent config synchronization

Global agent instruction files are version-controlled in this repository under `agent-config/` instead of living as bare, unsynchronized dotfiles. The folder layout is the mapping — `agent-config/<home>/<relative-path>` is linked to `~/<.home>/<relative-path>` for the `codex` and `claude` homes — so dropping a new file into `agent-config/` links it automatically on the next install. The repository's root `AGENTS.md` remains local to each clone and is not installed globally: reusable workflows belong in public skills, while repository-specific policy stays in `AGENTS.md`.

## Architecture

```text
apps/cli              command parsing, provider dispatch, process boundary
packages/reviewer     review scope, prompt contract, provider interface
packages/terminal-ui  OpenTUI dashboard and terminal reporting
skills/               the eight public mux-* agent workflows
agent-config/         version-controlled Codex and Claude instruction files
scripts/              thin launchers, packaging, and release verification
tests/                end-to-end npm installation test
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

### Portability

DevX Mux keeps portable orchestration and provider logic in TypeScript wherever possible so the same code can evolve across macOS, Linux, and Windows. Shell files are limited to thin compatibility entrypoints and adapters for inherently Unix-specific cmux or Rex socket behavior. New shared logic is not implemented twice in separate mux scripts.

Iterative browser workflows retain both the exact surface or pane ref and its stable UUID. Their portable reminder only delays and prints that UUID; after each delay the agent re-resolves the current ref and reads the browser itself. The reminder never calls cmux, Rex, or a browser API and never classifies review completion.

## Development

Use the local runner for the complete development workflow:

```bash
./mux.sh setup                                      # one-time: link skills and agent config
./mux.sh check                                      # tests, type checking, build, linked CLI refresh
./mux.sh review branch --provider grok --dry-run    # inspect a composed prompt
./mux.sh help                                       # all subcommands
```

Run `./mux.sh check` before committing so tests, type checking, and the globally linked CLI build are current. The project intentionally uses local verification instead of consuming hosted CI minutes.

The npm release is built from a clean CLI bundle and includes the eight public `mux-*` skills. Verify the exact consumer installation path locally with:

```bash
npm run test:install
```

The shell files are minimal launchers only; workflow behavior lives in TypeScript under `scripts/`.

### Publishing

The package version in `apps/cli/package.json` is the release source of truth. The first release reserves the package name through an explicitly authorized local `npm publish --workspace devx-mux`. After that, configure npm trusted publishing for `tomer-ben-david/devx-mux` and `.github/workflows/publish-npm.yml`. Publishing a GitHub release whose tag exactly matches `v<package-version>` then runs the full local check and publishes with npm provenance. A mismatched tag fails before publication.

## License

MIT
