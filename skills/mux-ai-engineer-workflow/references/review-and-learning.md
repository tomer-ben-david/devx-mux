# Adversarial review and correction learning

Read the relevant section when challenging a design, reviewing a diff, or extracting learnings. Reviews remain read-only. Use an independent context only when requested or already authorized; otherwise label the pass self-review and disclose that independence was not obtained. No provider, other skill, or paid service is required.

## Review packet

Provide the original request and contract, locked decisions, proposed design or exact diff scope, raw evidence pointers, acceptance criteria, and verification limits. Exclude a persuasive narrative about why the author believes the solution is correct. The reviewer must inspect underlying sources and challenge their interpretation.

For a design, ask whether each new concept is necessary, whether the existing owner can express the requirement, and which negative example breaks it. Seek a simpler alternative meeting the same requirements, not an expanded wish list.

For implementation, evaluate both:

1. **Change correctness:** Does the selected diff establish the invariant without new regressions, unwanted compatibility behavior, duplicate ownership, or unjustified complexity? Do tests reject plausible incorrect behavior?
2. **Intent and completion:** Does the user/system flow deliver the original capability, including integration between slices? Could every local test pass while the overall requirement remains unmet?

A finding needs a concrete scenario, violated requirement/invariant, evidence at the selected revision, and user/system impact. A comment saying “intentional,” reviewer agreement, or an attractive architecture story is not proof. “No actionable findings” is valid.

Keep consequential findings distinct from optional improvements and independently check each before implementing. Do not accept a rewrite just because it sounds more robust. Do not reject a necessary structural correction because it changes more lines than a symptom patch.

Once required checks pass and actionable in-scope findings are resolved, conclude. Another round needs changed code, an unresolved acceptance gap, or new evidence. Explicitly requested multi-review workflows retain their completion rules. If required tooling is unavailable, report the gap; self-review does not satisfy a requested independent review.

## Candidate learning

Capture actual corrections, including those caused by missing context or an overly rigid instruction. Do not blame the user's prompt by default or infer a universal rule from one task.

For each worthwhile candidate, give:

```text
Observed failure and concrete task evidence:
What the user corrected:
Why the original reasoning failed:
Earlier observable signal that could have caught it:
Proposed rule, with applicability and limits:
Best home: test / static check / domain docs / agent instruction /
           review cue / human judgment / task-only knowledge
How a future task could demonstrate that the lesson helps:
Status: proposed, not adopted
```

Example: an agent proposes storing a second navigation label to correct a display error. Evidence shows that the canonical token is already stored and the rendering path selected too much text. The lesson concerns tracing existing facts through the reader before proposing persistent state. “Never add a column” would be wrong: another feature may require independent state with its own lifecycle.

Prefer the cheapest reliable enforcement. A wrong cross-folder result may warrant a production-path scope test; an ownership rule may belong in domain docs; a nuanced tradeoff may remain human judgment. Do not add everything to AGENTS.md or generate a generic manifesto.

Propose concise wording for the user to edit or accept. Persist only when requested, in the authorized destination. Do not automatically update global memory. At the next relevant task, read the accepted lesson before the stage where the previous error occurred.

For a requested retrospective across several tasks, compare evidenced failure classes, human course corrections, review cycles, escaped defects, and workflow maintenance. Distinguish necessary product decisions from avoidable rework. Unknown counts stay unknown. Recommend a small process change with a way to assess it; do not invent improvement percentages or add automatic weekly jobs.
