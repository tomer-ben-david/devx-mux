---
name: mux-journal
description: "One skill for your work journal: draft daily/weekly/monthly status reports and manager updates from notes, coding-agent transcripts, Slack and GitHub; update the journal from that scan; and save, order, switch and restore parallel task context (branch, folder, PR, agent sessions, notes pointers) like `git switch`. Use for status/standup/manager updates, 'what did I do', 'update my journal', `mux task save|load|switch|next|queue|add|move|refresh|done|list|status`, or when switching between tasks/PRs/checkout folders."
---

# mux-journal: status reports, journal and task context

One front door for everything around your work log. Pick the mode from the request, then follow only that mode's section. All modes share one settings file and one source list.

## Modes

| Request | Mode | Writes? |
|---|---|---|
| "status", "standup", "manager update", "what did I do this week", "draft a report" | **Report** | Read-only. Delivers a copyable draft. Never posts, notifies or edits notes. |
| "update my journal", "save this report", "log what I did" | **Report + save** | Report first, then add/update a dated journal entry (see Save to the journal). No parking, commits or branch switches. |
| `save`, `load`, `switch`, `next`, `queue`, `add`, `move`, `refresh`, `done`, `list`, `status` (task words, a PR/branch to resume, "I'm switching tasks") | **Task** | Updates the task's journal entry; `save`/`switch`/`load` may park (WIP commit/stash) per Parking. |

When unsure, default to **Report** (the read-only one). A report request never authorizes Task-mode parking, switching or resuming agents, and Task mode never posts anything outside the machine.

The journal marker stays `` `mux-task:<slug>` `` and the helper script stays `scripts/mux_task.py`, so existing journal entries and tooling keep working.

## Settings (shared by every mode)

Read the first that exists: `$MUX_TASK_SETTINGS`, then `devx-mux-task-config.md` in the current directory, then in each parent directory up to `~`. So the user can keep one visible config file in any folder they work in (or in a parent shared by several checkouts). It holds `key: value` bullets:

| Key | Meaning |
|---|---|
| `journal` | Markdown journal the task entries are appended to / updated in (month sections `## Month YYYY`, newest first; inside a month, most recently worked task first, see Bumping). It is a running log, not a task manager. Required. |
| `recent_days` | How far back `list`/`status` scan for entries. Default `14`. Older entries stay in the journal as history and are simply ignored. |
| `github_task_sources` | Where "my tasks" live on GitHub, one `gh` search per bullet, e.g. `issues assigned:@me repo:owner/name`, `prs author:@me repo:owner/name`. Optional. |
| `checkout_pool` | Reusable clone folders, comma separated. Optional. |
| `default_repo` | Repo used when the current directory is not a git repo. Optional. |
| `github_repo` | `owner/name` for PR and issue lookup (`gh`). Optional; else derive from `origin`. |
| `heynote_dir` | Folder with Heynote `.txt` buffers. Optional. |
| `protected_branches` | Never push these. Default `main, master`. |
| `extra_notes` | Other places to search for task notes (folders/files). Optional. |
| `codex_homes` | Extra `CODEX_HOME` dirs whose `sessions/` hold Codex transcripts (e.g. `~/.codex-deepseek` for `codex-deepseek`). `~/.codex` and `~/.codex-deepseek` are always tried. Label = dir name. |
| `claude_projects` | Extra Claude Code `projects/` dirs (a second config dir, another machine's copy). `~/.claude/projects` is always tried; claude-glm shares it and is told apart by model name. |
| `search_roots` | Codebases/folders to grep on refresh (default: the checkout pool and the task's folder). |
| `slack_search` | How to search Slack **read-only**: name a Slack MCP whose search/read tools may be used, or a command template. Optional. |
| `gdrive_search` | Google Drive **read-only**: a local Drive-for-desktop mount (`~/Library/CloudStorage/GoogleDrive-<account>/`; search names with `find`, grep only real text files: `.gdoc`/`.gsheet`/`.gslides` are pointers without content), the Drive connector (`search_files` / `read_file_content`), or `gws`. Optional. |
| `chatgpt_exports` | Folder(s) and glob of exported ChatGPT chats, e.g. `~/Downloads/ChatGPT-*`. Grepped on refresh. The ChatGPT/Codex desktop app keeps no readable history, so exports and links in the entry are the only sources. |

If no settings file exists, auto-detect (cwd repo, `gh repo view`, `~/Library/Application Support/Heynote/notes`), tell the user what you found, and offer to write `devx-mux-task-config.md` in the current directory. Never put personal paths into this skill's files.

No settings file is required for Report mode: discover accessible sources and report material gaps. Reading settings never itself authorizes journal edits or task operations.

## Sources (shared by every mode)

Use the user's requested repositories and checkouts, current conversation, journal, and existing source settings. If available, read `$MUX_TASK_SETTINGS` or `devx-mux-task-config.md` in the working directory or its parents up to the user's home. Reuse its journal, checkout pool, extra notes, agent homes, and source pointers. Reading this configuration does not itself authorize task save/switch operations or journal edits.

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

Task-mode `refresh` uses the stricter per-source table under Task mode › refresh, and must end with its coverage table.

## Report mode

### Establish the reporting window

- Use the user's dates and local timezone. “This month” means the first day of the current month through now, not the last seven days. State the range; if none is given, use today for a daily report or state a reasonable recent window for “the last few days.”
- Identify the audience and whose work is being reported. Verify the relevant GitHub/Slack identity rather than assuming every action in a shared repository belongs to the user.
- Distinguish work performed during the window from older pending work. An old task mentioned in a recent note is not a new accomplishment. Include older items only when they affect the current update, labelled as carry-over.

### Reconcile before summarizing

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

### Deliver a short draft

For a brief daily Slack or Heynote update, aim for **4–6 short bullets, roughly 100–180 words**, unless the user requests another length. Use their language and tone, with concrete outcomes instead of agent activity or internal review chronology. A reader should grasp the status of each bullet in a few seconds.

For a broader manager report, default to **bold topic headings** and a flat list under each topic: **one task and one sentence per bullet, with no nested bullets**. Begin each bullet with `**STATUS · Specific task:**`, using a **single uppercase word** for the status. Choose the most informative state, such as `MERGED`, `DEPLOYED`, `FIXED`, `TESTED`, `DIAGNOSED`, `REVIEWED`, `DRAFT`, `ONGOING`, `PENDING`, `BLOCKED`, `PAUSED`, or `DEFERRED`; avoid compound labels such as `DRAFT / TESTED`. State other material milestones and limitations in the sentence, so `REVIEWED` does not imply merged and `TESTED` does not imply shipped.

Each sentence should identify the concrete complaint or task, the action and useful result, and what remains when unfinished. Do not call an entire topic “done” because one experiment or repair finished. Add an executive summary only when requested; preserve the requested formatting when adapting the report. Do not erase implementation, investigation, data repair, or testing contributions just to meet the short-draft word target, and do not infer hours worked from transcript volume, commits, or test counts.

Name the actual task or user-visible problem, not just a category such as “reliability improvements.” Add a short before/after example where it makes the work understandable. Make the next action specific, and distinguish the user's decisions from remaining engineering work. When the user wants to choose what to include, separate recent work from earlier days in the requested window rather than silently dropping either group.

When asked what has not been approached, reconcile outstanding notes and commitments with later evidence. List confirmed untouched/deferred tasks separately; label stale notes “status not verified” instead of assuming they remain open or counting them as this period's work.

Group by subject rather than by status unless the user requests otherwise. Include newly opened work and paused items when meaningful. Use a table only when requested or clearly better suited to the destination. Omit empty categories and avoid repeating the same work in several sections.

When the user supplies a status message they actually sent and approves its format, preserve that structure: a short title, topic sections, and `STATUS · Specific task: result; remaining work` entries. Markdown emphasis and bullet markers may be omitted for plain-text pasting without changing the content or status distinctions. Derive topics from the user's actual work rather than prescribing a company-specific category list.

An adaptable shape:

```markdown
My Status — [date range]

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

Research and drafting are read-only against source systems. Do not post to Slack, overwrite notes, edit tickets, notify people, or schedule reporting without explicit authorization for that action.

### Save to the journal (Report + save)

If the user asks to save the report or handoff and has an existing Markdown journal, use the journal they identify or the `journal` path in their private settings. Add or update a dated entry in its established format, preserving earlier content and linking the relevant sessions and evidence; do not copy raw transcripts into the journal. Update Heynote or another destination only when requested, and verify the saved result. If the destination is ambiguous, ask for it rather than inventing a personal journal path.

A reusable setup tip is to configure `journal: /path/to/your/journal.md` in the user's own settings file. Keep that actual path and personal source mapping outside the public skill. A notes-only save does not authorize parking, committing, or switching unrelated code work; use Task mode for a requested task-context handoff, within the user's stated scope.

Keep the public skill, examples, fixtures, and PR descriptions generic. Public platform and tool names such as Slack, Heynote, GitHub, Codex, Claude, Cursor, Azure, and OpenAI are appropriate; do not copy real people's names, customer/company/project names, private repository links, identifiers, local paths, or actual run metrics from a user's report into these public materials. Use generic examples rather than an anonymized copy that still reveals a recognizable private project. This publishing boundary does not require removing relevant facts from the user's own authorized status draft: tailor that draft to its intended audience and keep secrets out.

## Task mode

Saves and restores the working context of a task so you can switch between parallel tasks like `git switch`. Records task name, date, PR, branch, folder, which coding agents were used (Claude, Claude-GLM, Codex, Cursor), transcript/session links and notes pointers in the journal; on load it switches to the branch and gives the context back.

### Task entry format (in the journal)

One bullet per task, placed at the top of the current month section (create `## <Month> <YYYY>` above the previous month if missing). The marker `` `mux-task:<slug>` `` is the stable key. Slug: lowercase kebab of the task name.

```
- DD/Mon/YYYY - **Task: <name>** `mux-task:<slug>` — PR #N <url> · branch `<branch>` · last saved DD/Mon/YYYY HH:MM
  - Folder: <abs path> (<pool name if any>)
  - Agents: claude-anthropic, claude-glm, codex, cursor
  - Sessions:
    - <agent> <YYYY-MM-DD HH:MM> — <abs transcript path> — <first prompt, short>
  - Notes: Heynote search `<terms>`; <other pointers>
  - Links: <issues, Slack, Drive, docs>
  - State: <what was done, what is in flight, next step — 2-4 lines>
  - WIP: <commit sha of the wip save, or "clean">
```

The leading date is the first day worked and never changes; only `last saved` updates. Keep line one scannable: name, date, PR, branch.

### Bumping (recency order)

The journal reads like a feed: the top is what was worked on most recently, the bottom is old and forgotten. So every time a task is worked on, its bullet (line one plus all its sub-bullets, verbatim) is **moved to the top of the current month's section**, above every other entry in that month, creating `## <Month> <YYYY>` above the previous month if it is missing (an entry from an older month moves up into the new month's section; its leading date stays). Do this on `save`, `refresh`, `switch` and `load`, and for a new task. `load` moves the bullet without editing its text; the other commands also update `last saved`. `list`, `queue`, `status` and `done` never bump. The move is a cut and paste of the same bullet, never a copy, so there is still exactly one entry per marker. Other entries keep their relative order.

### Refresh first (every operation on a task)

Pointers rot: PRs get merged, sessions pile up, cmux workspaces are reused. So **the first step of every command that saves, loads or switches a task (`save`, `load`, `switch`, `next`, `add` of a new task, `done`, `refresh`) is a full `refresh` of that task's pointers**, before anything else happens. Run every source in the `refresh` table (GitHub issues/PRs/branches/commits, codebase grep across `search_roots`, all agent session stores including Cursor, claude-glm, codex and codex-deepseek, a link scan of the transcripts found (`mux_task.py links`), Heynote, journal and notes, Google Drive, Slack, ChatGPT exports, cmux state) and end with the coverage table. Transcripts are scanned quickly for links every time, especially on `switch`, because the important pointers (PRs, Slack threads, Drive folders, key files) often only exist inside agent conversations. Then do what the command asked, using the refreshed pointers, and write them into the entry (links only, see Rules). Never skip a source to save time; if one cannot run, mark it `unavailable (<reason>)` in the table. `switch` refreshes both the task being left and the task being loaded. `list`, `queue`, `status` and `move` do not refresh (they only read the journal and run the `github_task_sources` searches).

cmux is a source too: for each cmux workspace id in the entry, read `~/Library/Application Support/cmux/session-*.json` (and `closed-item-history-*.json`) read-only and check the id still exists, still has the same title/folder/branch, and which tabs (agent names, browser URLs) it holds. Mark the id `stale` in the entry if it now points at other work or is gone. Only `cmux` commands that read (list/tree/identify) may be used, never ones that create, move, send input to or close anything.

### Queue (ordering)

Order lives in a single line, directly under the journal's `# ` title, so reordering never touches task entries:

```
> **Task queue** (mux-task): <slug-1> > <slug-2> > <slug-3>
```

Head = what to work on now, then next, and so on. Create the line if missing. Only slugs of tasks that are not done appear in it; if a slug has no entry, drop it and say so. Entries not in the queue are "unqueued" (recent work nobody ranked yet). Keep the queue short: if it exceeds ~7, suggest parking or finishing something instead of silently growing it.

Rules that keep it honest:
- `save` on a new task (after its refresh) appends it to the end (or the front if the user says it is urgent).
- `switch` to a task interrupts the current one: the target goes to the front and the current task goes right behind it, so it is the first thing to resume. `--append` leaves the queue order alone.
- `done` removes the slug from the queue.
- `load` and `save` never reorder anything else.

### Commands

Arguments after the skill name: `save [name]`, `load <name|slug|PR#|branch>`, `switch [name]`, `next`, `queue`, `add <name> [first|last|after <slug>]`, `move <name> first|last|after <slug>|<position>`, `refresh [name]`, `done [name]`, `list`, `status`.

#### save [name]
0. Refresh first (see "Refresh first"): run the full refresh for this task before the steps below.
1. Repo = cwd's git toplevel (else `default_repo`). Branch = current branch. Name = argument, else an existing entry for this branch (update it), else propose one from branch/PR title and confirm.
2. PR: `gh pr list --head <branch> --json number,url,title,state` (use `github_repo`). Also collect linked issues from the PR body if cheap.
3. Sessions: run `python3 <skill>/scripts/mux_task.py sessions --repo <repo> --branch <branch> --since <first-day>`. Keep `branch-match` rows and rows updated during this task; list `candidate (no branch info)` rows (Cursor, some Codex) only if their time window and first prompt fit, and label them as candidates. Always include the current session's transcript.
4. Notes pointers: choose 2-4 search terms (PR number, branch slug, distinctive words). If `heynote_dir` is set, `grep -c` them to confirm they hit; record only terms that do.
5. Write the entry (create it, or update it keyed by the marker, then bump it to the top of the current month). Write `State` from the conversation; do not invent.
6. Park the work (see Parking) and record the `WIP` value.
7. Print the entry's first line and what was parked/pushed.

#### Parking (used by save and switch)
- Tracked changes on a non-protected branch: `git add -u`, commit `wip(mux-task): save context for <slug>`. Never add untracked files (list them instead). Never bypass hooks; if a hook fails, stop and report.
- Push the branch only if it is not in `protected_branches` and it has or can create an upstream on `origin`. **Never push a protected branch. Never force-push.**
- On a protected branch: do not commit or push; if there are tracked changes, `git stash push -m "mux-task:<slug>"` and record it as `WIP: stash`.
- Report anything left behind (untracked files, failed push).

#### load <ref>
0. Refresh first (see "Refresh first"): refresh the entry's pointers, then continue.
1. Find the entry by marker/name/PR number/branch in `journal`. Several matches → list and ask.
2. Show the entry's first line, then State, Agents, Sessions, Notes, Links.
3. Find where to work: if the branch is already checked out in a `checkout_pool` folder or worktree (`mux_task.py pool <folders>`), use that. Otherwise take the entry's Folder if it is clean or on a protected branch. Otherwise pick a pool folder that is clean and on a protected branch. If none, ask.
4. In that folder: Park whatever is there first if it has tracked changes (rules above), `git fetch origin <branch>`, `git switch <branch>` (or `git switch -c <branch> --track origin/<branch>`), fast-forward only (`git pull --ff-only`). If the entry's WIP is `stash`, offer `git stash pop`. Never discard changes.
5. Tell the user the folder to `cd` into (the shell cannot be moved for them) and how to resume each listed agent (e.g. `claude --resume <sessionId>`, `codex resume <id>`; Cursor: open the folder). Run the Heynote search terms and show hits.
6. Loading does not edit the entry's text or `last saved`, but it does bump the bullet to the top of the current month (see Bumping), since you are starting work on it.

#### queue / next / add / move
- `queue`: print the queue with position numbers, each item as its entry's first line (name, date, PR, branch), then unqueued recent entries. Highlight which task is checked out where (pool state).
- `next`: same as `switch` to the head of the queue that is not the current task.
- `add <name> [first|last|after <slug>]`: put an existing entry (or a new task, see `switch`) into the queue; default `last`.
- `move <name> ...`: rewrite only the queue line.

#### switch [name]
With no name, this is `next`. Otherwise `save` for the current task (Parking included), update the queue per the rules above, then `load <name>`. If `<name>` has no entry, treat it as a new task: pick a free pool folder on the protected branch, ask for the branch to create or track, and start an entry with `save`.

#### refresh [name]
Re-collect everything known about a task from every place it can live, show what changed, and update the entry. Read-only against the outside world. Default task = the current branch's entry, else the queue head.

1. Load the entry. Derive **distinctive** search terms from it: issue/PR refs written as `#6076` and `issues/6076` (a bare number matches unrelated ids), branch name and slug, distinctive words from Name and State (e.g. `github enterprise`). Note the entry's `last saved` time: "new" means after it, or not already listed in the entry.
2. Search every source below. Do not skip one because an earlier one found enough.

| Source | How (all read-only) |
|---|---|
| GitHub issue/PR bodies + comments | `gh issue view` / `gh pr view --comments` for each linked ref; new comments, state, assignee, labels |
| GitHub search | `gh search issues|prs <terms> --repo <github_repo and other repos in config>`; `gh search code <terms>`; linked/closing PRs |
| Branches + commits | in every `checkout_pool` folder and the task folder: `git branch -a --list '*<slug words>*'`, `git log --all --since=<last saved> --grep=<terms>`; which folder holds the branch (`mux_task.py pool`) |
| Codebase | grep `<terms>` and quoted identifiers across `search_roots` (Grep tool), ignoring `node_modules`, build output, lockfiles |
| Agent sessions | `mux_task.py sessions --repo <folder> --branch <branch>` per folder holding the branch, plus `mux_task.py find --terms <terms> --since <first day>` across every store: claude-anthropic, claude-glm, codex, codex-deepseek and any `codex_homes`/`claude_projects`, and Cursor |
| Heynote | grep terms in `heynote_dir/*.txt` with a few lines of context |
| Journal + notes | grep terms in `journal` and `extra_notes` |
| Google Drive | `gdrive_search`: `search_files` with `fullText contains '<term>'` (one clause per term, `or`-joined), then `read_file_content` only for promising hits. Read-only; never create, copy, share or edit. If the connector is not connected or `gws` auth has expired, report `unavailable` and say how to fix it |
| Slack | `slack_search`, read-only search/read only. Never post, react, edit, join or mark read. If not configured or no tool is available, report `unavailable` |
| ChatGPT exports | grep `chatgpt_exports` (`grep -l -i` per term, then context lines); also list ChatGPT links already in the entry |
| Links inside transcripts | for every session found (all stores: Claude Code anthropic/glm/qwen, Codex `~/.codex` and `~/.codex-deepseek` and any `codex_homes`, Cursor agent-transcripts and cursor-chat agents), run `python3 <skill>/scripts/mux_task.py links <transcript paths...>` (or `links --terms <terms> --since <first day>`). It scans the raw transcripts and lists, by count, the URLs grouped as github / slack / drive / chatgpt / grafana / web, existing absolute file paths, and cmux refs. From that, keep only the important ones as pointers: GitHub PR/issue/run/branch URLs the task actually touches, Slack permalinks (thread references), Drive/Docs links, ChatGPT chat links, key files or folders the agents kept working in, cmux refs. Skip noise (CDN/asset URLs, `localhost`, test hosts, `/tmp` scratch unless it holds a report the user would want). Never record a path to a file that holds secrets (`.env`, tokens, tunnels), and never copy contents |
| cmux | read-only: `~/Library/Application Support/cmux/session-*.json` and `closed-item-history-*.json` (workspaces, tab titles, folders, branches, browser URLs), `cmux` read commands only; grep the workspace ids in the entry, then search titles/folders for the task's terms; mark ids `stale` when they moved to other work |
| ChatGPT web chats | cannot be searched; ask whether anything newer should be pasted |

3. **Always end with the coverage table, even when nothing was found.** One row per source above, in this order, so a missing search is visible:

```
| Source | Searched? | Scope / query | Hits | New since last save |
```
`Searched?` is `yes`, `no (<reason>)` or `unavailable (<reason>)`. `Hits` is a count. `New` names the concrete new item (comment, commit, session path, Heynote line) or `-`. Never mark a source `yes` without having run it in this refresh.
4. Below the table, list the new findings in a few lines each, then update the entry (and bump it to the top of the current month): add new sessions/links/notes pointers, revise `State` and `Next step` only from evidence, set `last saved`. Do not delete anything from the entry without asking. Then apply the Parking rules only if the task's folder has tracked changes and the user asked for `switch`/`save`; refresh alone does not commit or push.

#### done [name]
Append ` · done` to the entry's first line and remove its slug from the queue. Nothing else is deleted; `list` hides done entries.

#### list / status
Scan, do not maintain: show the queue first (in order), then read the remaining `mux-task:` entries from the journal whose `last saved` is within `recent_days` and that are not done, newest first, one line each (name, date, PR, branch). Then run each `github_task_sources` search (`gh search issues|prs ... --state open --json number,title,url,repository`) and show hits that have no journal entry as "on GitHub, no saved context" so they can be picked up with `switch`. Cap each source at 20 results. `status` adds, per pool folder, `mux_task.py pool` output so it is clear which folder holds which task.

## Rules (every mode)

- The journal is an append/update log, not a task manager. Apart from the single queue line, save updates the task's own bullet (never duplicates it) and bumps it to the top of the current month, adds one only for a new task, and never reorders or prunes other entries beyond that bump. Do not build an index or task list; keep entries short so the journal does not balloon.
- Do not store secrets, tokens or webhook URLs in an entry.
- Pushes: non-protected branches only, only as part of Parking. Everything else that leaves the machine needs the user's say-so.
- **Links only, never contents.** An entry stores pointers, not copies: absolute file paths (with line numbers for Heynote/notes hits), URLs and permalinks (GitHub issues/PRs/branches, Slack permalinks with channel id, Drive folder links or local Drive paths), and session ids. Never paste chat transcripts, Slack/WhatsApp message bodies, ChatGPT chats, documents or file contents into the journal. This covers every source: Codex, Claude Code (anthropic/glm/qwen), Cursor and any other agent session (link the transcript file path, plus the resume command if useful); ChatGPT exports and web chats (link the export file path or chat URL); Heynote (file path + line); Drive (folder/file link); Slack and WhatsApp (permalink, or the Slack permalink of the copy the user sent themselves). The only prose allowed is the short `State` (2-4 lines of what was done and the next step) and a few words labelling each link.
- cmux workspace, pane and surface ids are pointers that go stale (the user reuses workspaces for other tasks). Record them with the workspace title, folder and date, say they may be stale, and note the cmux files that hold state (`~/Library/Application Support/cmux/session-*.json`), but never assume an id still belongs to the task.
- Report research is read-only against source systems: do not post to Slack, overwrite notes, edit tickets, notify people or schedule reporting without explicit authorization for that action.
