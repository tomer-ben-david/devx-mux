---
name: mux-status-report
description: Draft a concise daily, weekly, or monthly work update from notes, coding-agent transcripts, Slack, and GitHub evidence. Use for manager updates, standups, handoffs, or a short report to copy into Slack or Heynote. Research is read-only; sending the report is a separate action.
---

# Mux Status Report

Turn scattered work records into a short, accurate account of what changed, what is still open, and what needs a decision. Deliver the copyable report first; keep the research detail separate.

## Establish the reporting window

- Use the user's dates and local timezone. “This month” means the first day of the current month through now, not the last seven days. State the range; if none is given, use today for a daily report or state a reasonable recent window for “the last few days.”
- Identify the audience and whose work is being reported. Verify the relevant GitHub/Slack identity rather than assuming every action in a shared repository belongs to the user.
- Distinguish work performed during the window from older pending work. An old task mentioned in a recent note is not a new accomplishment. Include older items only when they affect the current update, labelled as carry-over.

## Discover sources locally

Use the user's requested repositories and checkouts, current conversation, journal, and existing source settings. If available, read `$MUX_TASK_SETTINGS` or `devx-mux-task-config.md` in the working directory or its parents up to the user's home. Reuse its journal, checkout pool, extra notes, agent homes, and source pointers without invoking task save/switch/refresh operations or editing the journal.

No settings file is required. Discover accessible sources and report material gaps. Ask only when an unresolved identity, date range, or repository ambiguity would change the result. Do not scan unrelated home-directory content just because access is available.

| Source | Useful evidence and discovery boundaries |
| --- | --- |
| Journal, Markdown notes, Heynote | Read dated entries, task pointers, promises, and decisions. Find buffers through user configuration or the installed app's notes location. Note creation/mtime is a lead, not proof of when the work happened. |
| GitHub and local Git | Verify authored/assigned work, commits, PR state, merge dates, reviews, and deployment runs in the selected repositories. Include uncommitted work only as work in progress. Follow linked issues; do not count a mirrored patch or release commit as another delivered feature. |
| Slack | Use available read/search connectors for relevant channels, mentions, threads, and DMs, including already-read messages. Paginate the requested scope and distinguish empty results from inaccessible history. Read thread context before treating an acknowledgement as completion or a suggested date as a commitment. |
| Codex | Discover the configured home(s) and `sessions/` stores. Filter by message timestamps and repository/cwd, then inspect user messages, final answers, and relevant tool results. Formats may use different final-answer fields; inspect the actual records before relying on a parser. |
| Claude Code and alternate providers | Discover configured `projects/` stores. Providers such as Anthropic and GLM can share a store; use recorded model metadata when available instead of inferring the provider from a tab name. |
| Cursor | Discover relevant project `agent-transcripts` and available chat-history metadata. If needed and supported, query local chat databases read-only and narrowly. Missing per-message timestamps limit date certainty; modified files and empty composer drafts are not evidence of recent completed work. |
| Other chats and documents | Follow relevant links and user-provided exports through available connectors. A local shortcut, browser tab title, or URL does not prove the conversation or document body was read. Do not claim access to unavailable cloud history. |

For a broad review, inventory the requested sources, search by date and work-related context, then follow relevant tasks into concrete evidence. Do not read every raw tool payload or archive unrelated conversations. Exclude secrets, consumer/personal topics, approval echoes, copied history, and duplicate subagent reports from the work tally.

When authorized and useful, split independent source families among subagents and reconcile their findings centrally. Give each the same date window, identity, read-only scope, and required evidence pointers. A report request does not authorize resuming existing work agents.

## Reconcile before summarizing

Keep a compact working ledger: workstream, outcome, event date, present status, evidence pointer, next action, and uncertainty. It can stay in working context; no new database or public artifact is needed.

- Treat agent summaries, notes, PR descriptions, and Slack posts as leads. Confirm consequential completion claims with the relevant merge/run result, saved execution evidence, or current artifact. A posted promise can be stale after an operation completed elsewhere.
- Separate **implemented, reviewed, merged, deployed, and accepted**. Passing CI does not prove deployment; a successful deployment does not prove that a held candidate was published or the feature works for users.
- Judge completion against the actual task: code intended for main is not delivered while its PR is unmerged; a verified manual repair, investigation, or evaluation can be complete without a merge. Report those outcomes separately from any unfinished permanent fix or feature.
- Resolve conflicting checkpoints by task/version/environment and event time. Do not combine metrics from one run with code or publication state from another. Preserve explicit pause instructions over older “ready” or “active” labels.
- Attribute contributions accurately: coordinating a test, repairing data, implementing a fix, and developing the underlying feature are different work. Account authorship or an integration-created issue alone does not establish personal credit.
- Reconcile explicit task lists in notes against the draft report before delivery. Keep a requested review of another person's PR distinct from related feature work; include outstanding commitments with an honest status rather than silently omitting them.
- Attach denominators, coverage, and essential exclusions to numbers. Distinguish measured runtime from estimates and total spend from reservations. A high benchmark agreement score is not automatically accuracy or end-to-end success; keep a critical usability gap visible beside good results.
- Classify each item as completed, in progress, newly reported/opened, pending a dependency or decision, paused, or unverified. Identify the actual next action for pending items. Old timestamps or an idle coordinator alone do not prove a stall.
- Expose unresolved contradictions instead of choosing the more flattering story. If evidence is unavailable, use “reported complete” or “not verified” where material, rather than claiming failure or success.

Stop when the requested sources are checked or their limits recorded and the material workstreams are reconciled. Follow additional evidence only to resolve a concrete ambiguity in the report; do not turn a daily update into an unrelated engineering audit.

## Deliver a short draft

For a brief daily Slack or Heynote update, aim for **4–6 short bullets, roughly 100–180 words**, unless the user requests another length. Use their language and tone, with concrete outcomes instead of agent activity or internal review chronology. A reader should grasp the status of each bullet in a few seconds.

For a broader manager report, default to **bold topic headings** and a flat list under each topic: **one task and one sentence per bullet, with no nested bullets**. Begin each bullet with `**STATUS · Specific task:**`, using a **single uppercase word** for the status. Choose the most informative state, such as `MERGED`, `DEPLOYED`, `FIXED`, `TESTED`, `DIAGNOSED`, `REVIEWED`, `DRAFT`, `ONGOING`, `PENDING`, `BLOCKED`, `PAUSED`, or `DEFERRED`; avoid compound labels such as `DRAFT / TESTED`. State other material milestones and limitations in the sentence, so `REVIEWED` does not imply merged and `TESTED` does not imply shipped.

Each sentence should identify the concrete complaint or task, the action and useful result, and what remains when unfinished. Do not call an entire topic “done” because one experiment or repair finished. Add an executive summary only when requested; preserve the requested formatting when adapting the report. Do not erase implementation, investigation, data repair, or testing contributions just to meet the short-draft word target, and do not infer hours worked from transcript volume, commits, or test counts.

Name the actual task or user-visible problem, not just a category such as “reliability improvements.” Add a short before/after example where it makes the work understandable. Make the next action specific, and distinguish the user's decisions from remaining engineering work. When the user wants to choose what to include, separate recent work from earlier days in the requested window rather than silently dropping either group.

When asked what has not been approached, reconcile outstanding notes and commitments with later evidence. List confirmed untouched/deferred tasks separately; label stale notes “status not verified” instead of assuming they remain open or counting them as this period's work.

Group by subject rather than by status unless the user requests otherwise. Include newly opened work and paused items when meaningful. Use a table only when requested or clearly better suited to the destination. Omit empty categories and avoid repeating the same work in several sections.

An adaptable shape:

```markdown
Update — [date range]

**Search**

- **FIXED · Missing results:** Repaired the affected records and verified the reported search now returns results.
- **DRAFT · Duplicate results:** Added duplicate prevention and passed database tests; browser acceptance and merge remain pending.

**Deployments**

- **TESTED · Migration rehearsal:** Verified deployment from the destination repository; the actual transfer remains pending.

**Models**

- **PENDING · Model upgrade:** Review and test the proposed model-default changes before deciding whether to merge.
```

Put critical limitations in the relevant bullet, not only in an appendix. Prefer a few recognizable links over hashes, session IDs, local paths, or a PR inventory. Technical evidence belongs outside the copyable message.

For broad source reviews, add a brief separate coverage note: sources checked, date scope, and material unavailable sources. Offer or link the detailed evidence only when useful; do not repeat the full investigation beneath every daily draft. Describe sampled or searched records honestly, without claiming every line of every chat was read.

Research and drafting are read-only against source systems. Do not post to Slack, overwrite notes, edit tickets, notify people, or schedule reporting without explicit authorization for that action. Keep private source content and user-specific configuration out of this public skill and its examples.
