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

Requires Node.js 22 or newer and the [Grok CLI](https://grok.com/) for the initial provider.

```bash
git clone https://github.com/tomer-ben-david/devx-crew.git
cd devx-crew
npm install
npm run build
npm link --workspace @devx-crew/cli
```

## Usage

Run inside any Git repository:

```bash
devx review branch
devx review commit HEAD
devx review local
```

Preview the exact reviewer prompt without invoking a model:

```bash
devx review branch --dry-run
```

Select a base branch or repository explicitly:

```bash
devx review branch --base origin/main --repo /path/to/repository
```

### Review scopes

| Scope | Reviewed changes |
| --- | --- |
| `branch` | Merge-base diff from the base branch to `HEAD` |
| `commit [ref]` | The selected commit, defaulting to `HEAD` |
| `local` | Staged, unstaged, and untracked working-tree changes |

Review execution is read-only. The reviewer is instructed not to edit files, and DevX Crew does not expose a mutation workflow.

## Architecture

```text
apps/cli              command parsing and process boundary
packages/reviewer     review scope, prompt contract, provider interface
```

The initial provider is Grok. The provider interface is intentionally small so additional model backends can be added without changing review semantics.

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
./run.sh review branch --dry-run
```

Run `./run.sh help` for individual test, type-check, build, link, review, and cleanup commands. The project intentionally uses local verification instead of consuming hosted CI minutes.

## License

MIT
