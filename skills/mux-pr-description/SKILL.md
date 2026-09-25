---
name: mux-pr-description
description: "Write or rewrite a GitHub PR title and reviewer-neutral description that tells a coherent change story for fresh and visual readers. Use for PR titles, PR bodies, reviewer context, or a description refresh before review. Produce a one-line invariant lead, then Context, Related work, Goals, Non-goals, Solution, Next steps, Design notes, Verification, and an optional changelog."
---

# PR title and description

Write for a fresh reviewer. Lead with the single sentence anyone could repeat after closing the tab. Then explain the problem, scope, mechanics, and evidence - without arguing for the implementation or directing the review.

## Initial cuts and evolving specs

When the user requests durable specifications alongside PRs, keep a concise versioned spec in the repository and link it from the PR. Follow the repository/user path convention (for example `docs/specs/<date>/<feature-name>/`); do not impose it on unrelated repositories. Keep intent, acceptance, provisional approach and open questions in the spec; keep current diff and verification in the PR. Reuse the shared base spec for stacked work and describe each layer's delta rather than copying every description.


For first-pass feature PRs and companion specs or design documents, put a short initial-cut note near the top, before `Context`. Treat the proposed design as a starting point for iteration unless the user explicitly fixes it. Adapt this wording to the actual work:

> **Initial cut — nothing here is frozen.** This is a first pass at [goal]. Expect the approach, the division of responsibilities, and the user experience to evolve as we build and use it. This document is a starting point for iteration; open questions are listed at the end.

Include the last clause only when there are real open questions; list them near the end, before any Changelog. Keep explicit user requirements and constraints distinct from provisional design choices. Agents should revise those choices when evidence or user feedback supports a better approach, rather than follow an early spec literally. Keep the spec and PR description aligned with the current direction, and distinguish proposed behavior from what the diff actually implements and verifies. Omit the initial-cut note for settled work or a design the user has explicitly frozen.

## The one-line invariant (lead with it)

Before any section, any diagram, any symptom, find the sentence that makes the whole PR click. It is usually an invariant the change enforces: the relationship that must hold, stated so plainly a non-author can repeat it.

Good leads, each one repeatable by a stranger:

- "A search suggestion's words and its highlighted box must come from the same physical place in the drawing."
- "The cursor the queue sees must equal the progress we saved."
- "The worker persists every checkpoint before it acknowledges the work as done."

A reader who meets that sentence first reads the rest of the description as **proof of it**. A reader who meets a diagram or a symptom first has to reverse-engineer the rule from examples. So:

1. Put the invariant as the **first** sentence of `Context`, in bold, before "sometimes," before "previously," before any ASCII.
2. Pair it with its **fail-closed guarantee** when one exists - what happens when the code cannot prove the invariant holds ("every check that cannot prove coherence keeps the original candidate, so the worst case is a looser suggestion, never a wrong one"). The safety argument should be visible before any mechanics.
3. End `Solution` by returning to that same invariant as the tie-together.

Do this only when the change genuinely has a single ruling invariant. A multi-goal PR should not be forced into one line - say so and lead with the two-or-three-sentence framing instead.

## Two voices: explain-to-an-engineer, then distill

There are two different jobs, and two voices for them. Mixing them up is the most common PR-description failure.

**Voice 1 - explain it to another engineer.** This is how you *understand and draft* the change. You write it as if a sharp colleague just asked "what did you actually do here?" and you answered over a whiteboard. This voice is the source of clarity: it is where you build the mental model, show the concrete data shape, walk the mechanism, and state what does and does not change. It is allowed to be warm, plain, even a little discursive, because its only job is to make the change click for one person. A good engineer-summary sounds like:

> This PR does not redesign search. It reconciles each suggestion with its physical OCR evidence so the displayed snippet and the highlighted box refer to the same annotation. It does this conservatively: the shared OCR evidence is validated, split into visual groups, and the geometry is replaced only when one relevant group can be selected unambiguously; otherwise the original result is kept. It also preserves manual-selection fragments and gives connector rendering a single active owner.

Read that aloud - if your draft of the change cannot produce a paragraph that clean, the description is not ready, because you have not yet found the invariant. **Use Voice 1 to think.**

**Voice 2 - the published PR body.** Voice 1 is too long for the review surface. The published body *distills* it: it keeps the one-line invariant, the smallest concrete example per mechanism, the fail-closed guarantee, and the Goals/Non-goals scope - and it cuts the whiteboard derivation, the pedagogical walkthrough, and the full engineer-summary paragraph. A reviewer needs enough to judge the change, not a lecture. **Use Voice 2 to publish.**

The rule in one line: write the engineer-explanation to find the clarity, then publish only enough of it to let a reviewer reproduce your judgment.

- Draft in Voice 1: mental model, concrete data shape, fail-closed table, "what it does NOT change" - all welcome.
- Publish in Voice 2: keep the invariant lead and one worked example per mechanism; cut the rest.
- The published body is never the full engineer-explanation. But it must read like it was *written by someone who could give that explanation.*

### Conciseness budget

A published body that feels exhaustive usually just hasn't been distilled. Apply a hard budget before publishing:

- **Context: 1 short paragraph.** Invariant + fail-closed + the concrete problem. If it needs a second paragraph, the invariant is still buried.
- **Solution: one labeled mechanism per real moving part, one worked example each.** No paragraph longer than ~4 sentences. If two mechanisms share an invariant, say so once, don't re-prove it twice.
- **Verification: commands + counts + one line on the breadth.** Cut the prose enumeration of every scenario into a single comma-separated coverage line.
- **Changelog: one line per entry** (see the Changelog format). Do not narrate the path to a decision; state the outcome + why in scope.

If a section can be read as "current truth" and still be cut, cut it. Verbosity reads as advocacy; tightness reads as confidence.

## Draft and clarity pass

When an implementor and orchestrator are both available:

1. Ask the implementor to write the first complete draft from the current diff.
2. Have a fresh model rewrite it for clarity while preserving technical facts.
3. Remove unexplained internal labels, advocacy, and review instructions.

The implementor has the deepest change context. The fresh reader is better at finding jargon and missing background. Do not publish an implementor draft without the clarity pass.

## Tell the change story

Make the description readable as one causal story:

```text
previous behavior -> problem -> solution -> resulting behavior -> evidence
```

`Context` establishes the previous behavior and problem (led by the one-line invariant). `Goals` and `Non-goals` define the intended outcome and boundary. `Solution` explains the mechanism and resulting behavior. `Verification` supplies the evidence.

Tell the story of the system and the change, not the chronology of implementation attempts, review rounds, or abandoned approaches. A fresh reader should understand why the change exists, what changed, and how the evidence supports it without reconstructing the development conversation.

## Gather current facts

- Read the actual diff, file list, commits, and existing PR body.
- Derive the problem, goal, key changes, boundaries, and verification from current repository state.
- Verify related PR numbers and states with `gh`; do not rely on memory.
- Read recent merged PR titles when repository naming conventions are unclear.
- Record honest limits on what tests or CI prove.

## Required structure

Use these exact section names because review workflows use Goals and Non-goals as the scope contract.

### Context

One short paragraph. **First sentence: the one-line invariant (bold) plus its fail-closed guarantee**, per the lead rule above. Then one sentence on the previous behavior and the concrete problem - grounded in a real file, function, field, command, or data flow.

Bad: "Fix the resilient sync path."

Good: "**The cursor the queue sees must equal the progress we saved.** Failed uploads were retried from process memory, so restarting the worker lost their position. This change persists the last acknowledged item before the worker advances."

### Related work

Include this section when the change belongs to a sequence. For three or more related PRs, use a table with:

| PR | Role | Status | Evidence |
| --- | --- | --- | --- |
| `#123` | Introduced the queue | Merged and enabled | 1,000-item fixture completed without retries |

State dependency direction and actual activation status, not only whether a PR merged. Omit the section for a standalone change.

### Goals

State what the PR accomplishes in one sentence or a tight list. This is the scope reviewers judge.

### Non-goals

List only meaningful boundaries, normally no more than five. Do not pad the section with obvious exclusions.

### Solution

Describe how the current diff achieves the goals. Summarize the major code, configuration, or data-flow changes and how they work together so a fresh reviewer can understand the implemented approach without opening the diff.

Keep this section concrete and reviewer-neutral. Name important files, functions, fields, commands, or boundaries when they clarify the mechanics. Do not turn it into a file-by-file changelog or argue that the approach is superior.

#### Multi-part changes: one area per symptom

Some PRs touch several parts of the system at once. Usually that is one invariant showing up as several symptoms in different places. Do not mash it all into one paragraph. Build the section in three layers: the skeleton, then the per-area body, then the quality bar for each area.

**Layer 1 - the skeleton.** Start with one line on the shared invariant, then a root-and-branches tree: invariant on top, one branch per area, each branch naming the symptom that area fixes. A reader sees the whole PR in seconds:

```text
the cursor the queue sees must equal the progress we saved
                      |
   ┌──────────┬───────┴────────┬─────────────┐
1. retry     2. restart       3. replay     4. dashboard
   path        path             backfill       counter
(cursor       (in-memory        (re-does       (shows old
 jumps past   position lost)    done work)     number after
 saved)                                        restart)
```

**Layer 2 - the per-area body.** Write each area as short prose answering three questions:

1. **What it touches** - which file(s) and function(s)?
2. **Why** - what goes wrong, in plain words? (Show the bad result, not a category like "reliability".)
3. **How it fixes it** - what does the code do now, step by step?

Example area (generic):

> **1. Retry path** (`sync/retry.ts`). Today the worker advances its cursor, then saves - a crash between the two loses the advance. Now `saveCursor()` runs before `advanceCursor()`, and a crash leaves the old cursor intact.
>
> How it fixes it (`sync/checkpoint.ts`):
> 1. Read the batch via the shared queue reader.
> 2. Check it is complete - `assertContiguousBatch()` stops on any gap.
> 3. Pick the next cursor - `nextOffset()`; if two offsets tie, keep the old one.
>
> On any failure, keep the old cursor (fail closed).

Not every area fixes a symptom. If one area is shared code the others call (a common reader, a base helper), say so plainly: name what it centralizes and who uses it. That is "one source of truth", not a fourth bug. A before/after table earns its place when the fix splits one thing into two, or changes a rule - one row per role:

| Field | Before | After |
| --- | --- | --- |
| `ackOffset` | meant "done" and "restart point" | means only "done" |
| `persistedCursor` | did not exist | the safe restart point |

Finish Solution with one short line that returns to the invariant shared by all areas (for example: "all four areas enforce it the same way - a check that cannot prove the cursor is saved leaves it untouched"). State the rule the code already enforces; do not argue the approach is best. For a single-part change, skip this whole subsection - write Solution as one short summary paragraph, no areas and no tree.

**Layer 3 - the quality bar for each area (show, do not claim).** This is what separates a useful description from a hand-wave. Three techniques below, in the Voice-1 spirit (use them to build the engineer-explanation); keep the ones that sharpen the example in the Voice-2 published body and cut the rest.

*Technique 1 - the concrete data shape.* When the invariant is about a relationship between values (text vs. geometry, two fields, two representations), show the value shape and the broken vs. corrected pair once, in two or three lines. This is the fastest way to make "the words and the box disagree" land:

```text
broken:   snippet = rightCell.text   // "RB-1"
          bbox    = leftCell.bbox    // box around SCF-1

correct:  snippet = rightCell.text
          bbox    = rightCell.bbox
```

Use a tiny typed shape only if it clarifies - one `type`/`const` pair, not a module. If the example is clearer without code, drop the code.

*Technique 2 - every claim needs a concrete example.* Never write "the old code merged rows into one box" or "the cursor jumped ahead" without showing what that looked like and what it looks like now - one input, the old output, the new output. If you cannot build a tiny example, the "why" or "how" is too vague; sharpen it until you can. When the example has a layout or spatial shape - a grid, two regions side by side, where a box sits - draw it as ASCII instead of narrating it, so the wrong-region problem is visible at a glance:

```text
before                        after
┌────────┬────────┐           ┌────────┬────────┐
│ item A │ item B │           │ item A │ item B │
│ ┌────┐ │        │           │        │ ┌────┐ │
│ └────┘ │        │           │        │ └────┘ │
└────────┴────────┘           └────────┴────────┘
label "item B", box on A      label "item B", box on B
(wrong region)                (right region)
```

A pure input/output change ("returned X, now returns Y") is clearer as one line; reserve the drawing for examples that genuinely have a shape.

*Technique 3 - show the mechanism, not just the function name.* Naming a function ("`assertContiguousBatch()` refuses to advance on a gap") tells the reader a guard exists, not what it checks. A reviewer should learn how the fix works from the description alone. For each step that carries real logic, give a tiny worked example: the input, the check it applies, and the result on both a passing and a failing case:

> Step: prove the batch is complete. `assertContiguousBatch()` joins each item's anchors and checks they stitch into one contiguous run with no gaps or overlaps, and that the joined text equals the stored batch text.
> Pass: items `[1-4]`, `[5-8]`, `[9-12]` join to `[1-12]` and match -> accept.
> Fail: items `[1-4]`, `[6-8]` leave a gap at `5` -> reject, keep the old cursor.

When a mechanism is fail-closed, the fail-closed decision is itself a compact table a reviewer can scan faster than prose:

```text
Certain the invariant holds   -> improve the result
Cannot prove it               -> keep the original result
Never guess                   -> avoid the wrong result
```

If a step is too small to merit a worked example (a single read, a sort), say what it does in one line and move on.

### Next steps

When later work remains, give the short ordered sequence and say what requires a separate action or approval. If the change is self-contained, say: "No follow-up; this PR is the complete change."

### Design notes

Use this optional section for implementation facts beyond the Solution summary:

- important invariants
- order of operations
- data flow
- limitations that shaped the implementation

State what the code does. Do not tell the reviewer what to check.

Bad: "Confirm the worker cannot acknowledge before persisting."

Good: "The worker persists the checkpoint before acknowledging the queue item."

### Verification

List the commands, tests, or manual checks that actually ran. State any meaningful gaps without implying that unrun verification passed.

## Visual clarity

Help visual readers understand non-trivial architecture, ownership, data flow, lifecycle, sequencing, or before-and-after behavior. Add the smallest useful visual inside `Solution` or `Design notes`:

- Use a tiny ASCII diagram for flow, hierarchy, ownership, or event order.
- Use a compact table for exact mappings, before-and-after behavior, or repeated-field comparisons.
- Keep each visual focused on one concept with plain labels and only the nodes or columns needed to understand the change.

Do not add a visual when a short paragraph or list is clearer. Visuals explain the implementation; they must not decorate the description, prescribe review steps, or replace the concrete prose.

## Reviewer neutrality

- Inform; do not argue.
- Do not add a "What to review" or "Focus areas" section.
- Do not pre-rebut alternatives with "Why X, not Y."
- Do not prescribe code checks or expected reviewer conclusions.
- Do not recap the implementation debate.
- Keep genuine open questions neutral and separate from asserted facts.

## Title

- Follow the repository's existing convention, including Conventional Commits when used.
- Name the concrete behavior or component.
- Mention both scopes when the PR genuinely spans two areas.
- Prefer `fix(sync): persist retry cursor before acknowledgement` over `improve reliability`.

## Changelog

When a PR description needs durable update history, place `## Changelog` at the bottom. Keep the sections above as current truth. Use a flat, newest-first list. **Each entry anchors to a concrete commit and leads with a short bold subject** so the list scans before the detail:

```markdown
## Changelog
- 2026-07-13 14:32 · a1b2c3d: **reject stale checkpoints** - concurrent workers could otherwise move the cursor backward - in scope because checkpoint ordering is part of this PR's retry contract.
```

Format: `- YYYY-MM-DD HH:MM · <short-sha>: **<subject, ~1-5 words>** <what changed>`. The time disambiguates same-day entries; the 7-char short SHA points at the commit the entry describes; the **bold subject** (~1-5 words) names the change so a reader scans the whole list first, then reads detail only where it matters. If an entry predates a known commit or spans several, anchor it to the most representative SHA (or omit the SHA and keep the datetime only) rather than inventing one.

For versioned changelogs in companion spec or design files, preserve the existing table/list structure and ordering, but include both date and time for every new entry (`YYYY-MM-DD HH:MM`, with the timezone stated in the column heading or near the changelog). A version table should use a `Date/time` column rather than a date-only `Date` column. Use the actual entry time in the user’s timezone; do not invent historical times or infer them from version order. Leave older date-only entries unchanged unless their times can be verified.

Capture what changed, why the team arrived there, and why it belongs in scope. The why clause names the trigger (review finding, PR comment, scope decision), the scope verdict, and the goal the change serves in one short phrase; it does not narrate the review thread. Do not invent history, evidence, or a SHA that does not correspond to a real commit.

## Remote editing

Drafting is local. Before changing a remote PR title or body, obtain explicit user confirmation.

After confirmation:

1. Write the body to a temporary file with real newlines.
2. Run `gh pr edit <number> --title "..." --body-file <file>`.
3. Fetch the PR body again with `gh pr view` and verify its rendered structure.

Do not encode the body as escaped `\n` sequences in a shell argument.

## Final check

- **The first sentence of Context is the one-line invariant, in bold, paired with its fail-closed guarantee.**
- Context is understandable without recent chat history.
- The change was drafted in the explain-to-an-engineer voice; the published body is the distilled Voice-2 version (invariant lead + one example per mechanism), not the walkthrough.
- The sections form one causal story from previous behavior through verified outcome.
- Goals and Non-goals are present and accurate.
- Solution explains how the current diff achieves the goals and returns to the invariant as tie-together.
- A non-trivial solution includes the smallest useful diagram, table, or concrete data shape for visual readers.
- Related work and Next steps are included when applicable.
- Design notes state facts rather than review instructions.
- Verification says what ran and what remains unproven.
- The title is specific and follows repository convention.
- No private paths, credentials, customer names, internal URLs, or unrelated project details appear in the draft.
