Read the project's README.md file before starting any work.
Also read the public DevX coding standards repository for coding standards:
https://github.com/tomer-ben-david/devx-coding-standards

**Top rule — prefer the best / long-term design over the quick / short-term one.** Don't pick a solution because it's faster to write when a better long-term design exists. This includes: structural fix over non-structural patch (rewrite page order into the PDF itself, not a `reorder` column read instead), root-cause over symptom, durable over expedient. IGNORE human-shaped effort estimates — an agent does in minutes what a human budgets in hours, so never self-censor the best design because it "feels big." See devx-coding-standards #1 RULE.
When a source checkout includes shared Codex guidance, keep it aligned with
the repository's own `agent-config/codex/AGENTS.md`; do not assume a fixed
machine-specific path.

PR review pipeline: see `~/.claude/rules/review-pipeline.md` and use the
public `mux-*` skills it names. Keep review execution read-only unless the
task explicitly authorizes a change.
