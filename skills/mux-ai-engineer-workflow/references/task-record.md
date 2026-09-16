# Task record and handoff

Use one compact record for substantial work, building on an existing task artifact. Avoid a second spec, backlog, or planning system. In read-only work, return the record in the conversation.

Retain fields that carry real information:

```text
Task and current stage:
Repository / checkout / branch / head / relevant existing changes:
Runtime / environment / data source, if applicable:
Goal and user-visible before/after:
Invariant:
Must preserve:
Non-goals:
Acceptance criteria and how each will be observed:

Confirmed facts and raw evidence pointers:
Inferences and how to distinguish them from alternatives:
Unknowns affecting the next decision:

Locked user decisions, with source in the conversation or task:
Agent recommendations or routine working assumptions:
Current design and why its owner is appropriate:
Completed / current / remaining implementation slices:
Verification results, revision/environment, and gaps:
Review findings and independently verified disposition:
Failed attempts, failure family, and what each taught us:
Corrections and candidate learnings:
Next useful action or concrete pending decision:
```

Do not fill unknowns with guesses or label your own proposal “approved.” Acceptance criteria must not silently drift to match the implementation.

Before handoff, preserve raw evidence pointers, locked decisions, incomplete checks, failed approaches, and next action. Identify exact base/head and any uncommitted task changes. The receiving context revalidates checkout and live state as needed; a summary does not prove tests still apply to the current revision.

For a feature, keep intent concrete. “Users can browse pages within a selected folder” leaves membership cardinality, unfiled behavior, and search scope unsettled unless requirements or an existing contract answer them. Investigate and escalate only consequential choices still open. Do not silently turn browsing into an identity redesign or project-wide search feature.

For a bug, distinguish “the UI shows the wrong excerpt” from “stored OCR is corrupt.” The first does not establish the second. Trace the actual read/render path and original data before choosing presentation correction or data repair.
