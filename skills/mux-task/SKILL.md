---
name: mux-task
description: "Save, order and restore the working context of a task so you can switch between parallel tasks like `git switch`. Use for `mux task save`, `mux task load`, `mux task switch`, `mux task list`, `mux task queue`, `mux task next`, `mux task refresh`, or when the user says they are switching to a different task, PR or checkout folder and wants to come back later. Records task name, date, PR, branch, folder, which coding agents were used (Claude, Claude-GLM, Codex, Cursor), transcript/session file links and notes pointers in the user's journal; on load it switches to the branch and gives the context back."
---

# mux-task: save and load task context

The user runs many tasks in parallel across reusable checkout folders, GitHub PRs/issues, several coding agents and personal notes. This skill captures a task's context into one journal entry and later rebuilds it. It is generic: every path, repo and note location comes from the user's settings file, never from this skill.

## Settings (per user, kept next to the work)

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

## Task entry format (in the journal)

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

## Bumping (recency order)

The journal reads like a feed: the top is what was worked on most recently, the bottom is old and forgotten. So every time a task is worked on, its bullet (line one plus all its sub-bullets, verbatim) is **moved to the top of the current month's section**, above every other entry in that month, creating `## <Month> <YYYY>` above the previous month if it is missing (an entry from an older month moves up into the new month's section; its leading date stays). Do this on `save`, `refresh`, `switch` and `load`, and for a new task. `load` moves the bullet without editing its text; the other commands also update `last saved`. `list`, `queue`, `status` and `done` never bump. The move is a cut and paste of the same bullet, never a copy, so there is still exactly one entry per marker. Other entries keep their relative order.

## Refresh first (every operation on a task)

Pointers rot: PRs get merged, sessions pile up, cmux workspaces are reused. So **the first step of every command that saves, loads or switches a task (`save`, `load`, `switch`, `next`, `add` of a new task, `done`, `refresh`) is a full `refresh` of that task's pointers**, before anything else happens. Run every source in the `refresh` table (GitHub issues/PRs/branches/commits, codebase grep across `search_roots`, all agent session stores including Cursor, claude-glm, codex and codex-deepseek, a link scan of the transcripts found (`mux_task.py links`), Heynote, journal and notes, Google Drive, Slack, ChatGPT exports, cmux state) and end with the coverage table. Transcripts are scanned quickly for links every time, especially on `switch`, because the important pointers (PRs, Slack threads, Drive folders, key files) often only exist inside agent conversations. Then do what the command asked, using the refreshed pointers, and write them into the entry (links only, see Rules). Never skip a source to save time; if one cannot run, mark it `unavailable (<reason>)` in the table. `switch` refreshes both the task being left and the task being loaded. `list`, `queue`, `status` and `move` do not refresh (they only read the journal and run the `github_task_sources` searches).

cmux is a source too: for each cmux workspace id in the entry, read `~/Library/Application Support/cmux/session-*.json` (and `closed-item-history-*.json`) read-only and check the id still exists, still has the same title/folder/branch, and which tabs (agent names, browser URLs) it holds. Mark the id `stale` in the entry if it now points at other work or is gone. Only `cmux` commands that read (list/tree/identify) may be used, never ones that create, move, send input to or close anything.

## Queue (ordering)

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

## Commands

Arguments after the skill name: `save [name]`, `load <name|slug|PR#|branch>`, `switch [name]`, `next`, `queue`, `add <name> [first|last|after <slug>]`, `move <name> first|last|after <slug>|<position>`, `refresh [name]`, `done [name]`, `list`, `status`.

### save [name]
0. Refresh first (see "Refresh first"): run the full refresh for this task before the steps below.
1. Repo = cwd's git toplevel (else `default_repo`). Branch = current branch. Name = argument, else an existing entry for this branch (update it), else propose one from branch/PR title and confirm.
2. PR: `gh pr list --head <branch> --json number,url,title,state` (use `github_repo`). Also collect linked issues from the PR body if cheap.
3. Sessions: run `python3 <skill>/scripts/mux_task.py sessions --repo <repo> --branch <branch> --since <first-day>`. Keep `branch-match` rows and rows updated during this task; list `candidate (no branch info)` rows (Cursor, some Codex) only if their time window and first prompt fit, and label them as candidates. Always include the current session's transcript.
4. Notes pointers: choose 2-4 search terms (PR number, branch slug, distinctive words). If `heynote_dir` is set, `grep -c` them to confirm they hit; record only terms that do.
5. Write the entry (create it, or update it keyed by the marker, then bump it to the top of the current month). Write `State` from the conversation; do not invent.
6. Park the work (see Parking) and record the `WIP` value.
7. Print the entry's first line and what was parked/pushed.

### Parking (used by save and switch)
- Tracked changes on a non-protected branch: `git add -u`, commit `wip(mux-task): save context for <slug>`. Never add untracked files (list them instead). Never bypass hooks; if a hook fails, stop and report.
- Push the branch only if it is not in `protected_branches` and it has or can create an upstream on `origin`. **Never push a protected branch. Never force-push.**
- On a protected branch: do not commit or push; if there are tracked changes, `git stash push -m "mux-task:<slug>"` and record it as `WIP: stash`.
- Report anything left behind (untracked files, failed push).

### load <ref>
0. Refresh first (see "Refresh first"): refresh the entry's pointers, then continue.
1. Find the entry by marker/name/PR number/branch in `journal`. Several matches → list and ask.
2. Show the entry's first line, then State, Agents, Sessions, Notes, Links.
3. Find where to work: if the branch is already checked out in a `checkout_pool` folder or worktree (`mux_task.py pool <folders>`), use that. Otherwise take the entry's Folder if it is clean or on a protected branch. Otherwise pick a pool folder that is clean and on a protected branch. If none, ask.
4. In that folder: Park whatever is there first if it has tracked changes (rules above), `git fetch origin <branch>`, `git switch <branch>` (or `git switch -c <branch> --track origin/<branch>`), fast-forward only (`git pull --ff-only`). If the entry's WIP is `stash`, offer `git stash pop`. Never discard changes.
5. Tell the user the folder to `cd` into (the shell cannot be moved for them) and how to resume each listed agent (e.g. `claude --resume <sessionId>`, `codex resume <id>`; Cursor: open the folder). Run the Heynote search terms and show hits.
6. Loading does not edit the entry's text or `last saved`, but it does bump the bullet to the top of the current month (see Bumping), since you are starting work on it.

### queue / next / add / move
- `queue`: print the queue with position numbers, each item as its entry's first line (name, date, PR, branch), then unqueued recent entries. Highlight which task is checked out where (pool state).
- `next`: same as `switch` to the head of the queue that is not the current task.
- `add <name> [first|last|after <slug>]`: put an existing entry (or a new task, see `switch`) into the queue; default `last`.
- `move <name> ...`: rewrite only the queue line.

### switch [name]
With no name, this is `next`. Otherwise `save` for the current task (Parking included), update the queue per the rules above, then `load <name>`. If `<name>` has no entry, treat it as a new task: pick a free pool folder on the protected branch, ask for the branch to create or track, and start an entry with `save`.

### refresh [name]
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

### done [name]
Append ` · done` to the entry's first line and remove its slug from the queue. Nothing else is deleted; `list` hides done entries.

### list / status
Scan, do not maintain: show the queue first (in order), then read the remaining `mux-task:` entries from the journal whose `last saved` is within `recent_days` and that are not done, newest first, one line each (name, date, PR, branch). Then run each `github_task_sources` search (`gh search issues|prs ... --state open --json number,title,url,repository`) and show hits that have no journal entry as "on GitHub, no saved context" so they can be picked up with `switch`. Cap each source at 20 results. `status` adds, per pool folder, `mux_task.py pool` output so it is clear which folder holds which task.

## Rules
- The journal is an append/update log, not a task manager. Apart from the single queue line, save updates the task's own bullet (never duplicates it) and bumps it to the top of the current month, adds one only for a new task, and never reorders or prunes other entries beyond that bump. Do not build an index or task list; keep entries short so the journal does not balloon.
- Do not store secrets, tokens or webhook URLs in an entry.
- Pushes: non-protected branches only, only as part of Parking. Everything else that leaves the machine needs the user's say-so.
- **Links only, never contents.** An entry stores pointers, not copies: absolute file paths (with line numbers for Heynote/notes hits), URLs and permalinks (GitHub issues/PRs/branches, Slack permalinks with channel id, Drive folder links or local Drive paths), and session ids. Never paste chat transcripts, Slack/WhatsApp message bodies, ChatGPT chats, documents or file contents into the journal. This covers every source: Codex, Claude Code (anthropic/glm/qwen), Cursor and any other agent session (link the transcript file path, plus the resume command if useful); ChatGPT exports and web chats (link the export file path or chat URL); Heynote (file path + line); Drive (folder/file link); Slack and WhatsApp (permalink, or the Slack permalink of the copy the user sent themselves). The only prose allowed is the short `State` (2-4 lines of what was done and the next step) and a few words labelling each link.
- cmux workspace, pane and surface ids are pointers that go stale (the user reuses workspaces for other tasks). Record them with the workspace title, folder and date, say they may be stale, and note the cmux files that hold state (`~/Library/Application Support/cmux/session-*.json`), but never assume an id still belongs to the task.
