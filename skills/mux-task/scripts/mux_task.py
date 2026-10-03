#!/usr/bin/env python3
"""Helpers for the mux-task skill: collect agent sessions for a repo/branch, and report checkout-pool state.

  mux_task.py sessions --repo PATH [--branch B] [--since YYYY-MM-DD] [--json]
  mux_task.py find --terms a,b,c [--since YYYY-MM-DD] [--json]       (any repo, matches by text)
  mux_task.py pool PATH [PATH ...]

Stores: Claude Code (~/.claude/projects; claude-glm shares it and is told apart by model), Codex
(~/.codex plus any CODEX_HOME such as ~/.codex-deepseek), Cursor (~/.cursor/projects). Add more with
--codex-home / --claude-projects (repeatable) or the MUX_TASK_CODEX_HOMES / MUX_TASK_CLAUDE_PROJECTS env
vars (colon separated). Nothing is written; output goes to stdout.
"""
import argparse, glob, json, os, re, subprocess, sys
from collections import Counter
from datetime import datetime, timezone

HOME = os.path.expanduser("~")
CODEX_HOMES = [f"{HOME}/.codex", f"{HOME}/.codex-deepseek"]
CLAUDE_PROJECTS = [f"{HOME}/.claude/projects"]


def codex_label(home):
    name = os.path.basename(home.rstrip("/")).lstrip(".")
    return name if name != "codex" and name.startswith("codex") else "codex"


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M")


def first_prompt(text):
    return " ".join(text.split())[:140]


def claude_agent(models):
    m = " ".join(models).lower()
    return "claude-glm" if "glm" in m else "claude-anthropic"


def scan_claude(repo, branch, since):
    slug = repo.replace("/", "-").replace(".", "-")
    out = []
    for path in [f for root in CLAUDE_PROJECTS for f in glob.glob(f"{root}/{slug}/*.jsonl")]:
        if os.path.getmtime(path) < since:
            continue
        branches, models, prompt = set(), set(), ""
        try:
            for line in open(path, errors="replace"):
                d = json.loads(line)
                if d.get("gitBranch"):
                    branches.add(d["gitBranch"])
                m = d.get("message")
                if isinstance(m, dict):
                    if m.get("model") and m["model"] != "<synthetic>":
                        models.add(m["model"])
                    if not prompt and d.get("type") == "user" and isinstance(m.get("content"), str):
                        prompt = m["content"]
                if d.get("model"):
                    models.add(d["model"])
        except (OSError, json.JSONDecodeError):
            continue
        out.append(dict(agent=claude_agent(models), models=sorted(models), branches=sorted(branches),
                        match=(branch in branches) if branch else None, path=path,
                        modified=iso(os.path.getmtime(path)), first_prompt=first_prompt(prompt)))
    return out


def scan_codex(repo, branch, since):
    out = []
    paths = [(h, f) for h in CODEX_HOMES for f in glob.glob(f"{h}/sessions/*/*/*/rollout-*.jsonl")]
    for home, path in paths:
        if os.path.getmtime(path) < since:
            continue
        try:
            with open(path, errors="replace") as f:
                meta = json.loads(f.readline()).get("payload", {})
                if meta.get("cwd") != repo:
                    continue
                git = meta.get("git") or {}
                b = git.get("branch") if isinstance(git, dict) else None
                prompt = ""
                for line in f:
                    d = json.loads(line)
                    p = d.get("payload", {})
                    if d.get("type") == "response_item" and p.get("role") == "user":
                        c = p.get("content")
                        if isinstance(c, list) and c and "<environment_context>" not in str(c[0]):
                            prompt = c[0].get("text", "")
                            break
        except (OSError, json.JSONDecodeError):
            continue
        out.append(dict(agent=codex_label(home), models=[meta.get("model_provider", "")], branches=[b] if b else [],
                        match=(b == branch) if branch and b else None, path=path,
                        modified=iso(os.path.getmtime(path)), first_prompt=first_prompt(prompt)))
    return out


def scan_cursor(repo, branch, since):
    slug = repo.strip("/").replace("/", "-").replace(".", "-").replace("_", "-")
    out = []
    for d in glob.glob(f"{HOME}/.cursor/projects/{slug}/agent-transcripts/*"):
        files = [d] if os.path.isfile(d) else glob.glob(d + "/*.jsonl")
        for path in files:
            if os.path.getmtime(path) < since:
                continue
            prompt = ""
            try:
                for line in open(path, errors="replace"):
                    j = json.loads(line)
                    if j.get("role") == "user":
                        c = j.get("message", {}).get("content", [])
                        prompt = c[0].get("text", "") if c and isinstance(c[0], dict) else str(c)
                        break
            except (OSError, json.JSONDecodeError):
                pass
            out.append(dict(agent="cursor", models=[], branches=[], match=None, path=path,
                            modified=iso(os.path.getmtime(path)), first_prompt=first_prompt(prompt)))
    return out


def cmd_sessions(a):
    repo = os.path.realpath(a.repo)
    since = datetime.strptime(a.since, "%Y-%m-%d").timestamp() if a.since else 0
    rows = scan_claude(repo, a.branch, since) + scan_codex(repo, a.branch, since) + scan_cursor(repo, a.branch, since)
    rows.sort(key=lambda r: r["modified"], reverse=True)
    if a.json:
        print(json.dumps(rows, indent=2))
        return
    for r in rows:
        tag = {True: "branch-match", False: "other-branch", None: "candidate (no branch info)"}[r["match"]]
        print(f"- {r['modified']} | {r['agent']} | {tag} | {r['path']}\n    {r['first_prompt']}")


def cmd_find(a):
    """Find sessions in every store, in any repo, whose text mentions any term (case-insensitive)."""
    terms = [t.strip().lower() for t in a.terms.split(",") if t.strip()]
    since = datetime.strptime(a.since, "%Y-%m-%d").timestamp() if a.since else 0
    files = []
    for root in CLAUDE_PROJECTS:
        files += [("claude", f) for f in glob.glob(f"{root}/*/*.jsonl")]
    for h in CODEX_HOMES:
        files += [(codex_label(h), f) for f in glob.glob(f"{h}/sessions/*/*/*/rollout-*.jsonl")]
    files += [("cursor", f) for f in glob.glob(f"{HOME}/.cursor/projects/*/agent-transcripts/*/*.jsonl")]
    files += [("cursor", f) for f in glob.glob(f"{HOME}/.cursor/projects/*/agent-transcripts/*.jsonl")]
    rows = []
    for agent, path in files:
        if os.path.getmtime(path) < since:
            continue
        try:
            text = open(path, errors="replace").read().lower()
        except OSError:
            continue
        hits = {t: text.count(t) for t in terms if t in text}
        if not hits:
            continue
        rows.append(dict(agent=agent, path=path, modified=iso(os.path.getmtime(path)), hits=hits))
    rows.sort(key=lambda r: (-sum(r["hits"].values()), r["modified"]), reverse=False)
    rows = rows[: a.limit]
    if a.json:
        print(json.dumps(rows, indent=2))
        return
    for r in rows:
        print(f"- {r['modified']} | {r['agent']} | hits={r['hits']} | {r['path']}")


URL_RE = re.compile(r"https?://[^\s\"'<>)\]\\|`]+")
PATH_RE = re.compile(r"(?<![\w/.:-])(/(?:Users|Volumes|tmp|private|opt)/[^\s\"'<>)\]\\:,;`|]+)")
CMUX_RE = re.compile(r"cmux://[^\s\"'<>)\]\\`]+|\b(?:workspace|surface|pane):\d+\b")
NOISE_URL = ("localhost", "127.0.0.1", "schemas.", "w3.org", "example.com", "anthropic.com/", "openai.com/", "json-schema.org", "npmjs.", "nodejs.org", "example.test", "http://test", "dkr.ecr", "mozilla.org", "pris.ly", "x-access-token", "${", "amazonaws.com/v2/")
NOISE_PATH = ("/node_modules/", "/.git/", "/.next/", "/.cache/", "/Library/Caches/", "/private/var/", "/tmp/claude", "/.codex/sessions/", "/.claude/projects/")


def kind_of(url):
    if "slack.com/archives" in url:
        return "slack"
    if "github.com" in url:
        return "github"
    if "drive.google.com" in url or "docs.google.com" in url:
        return "drive"
    if "chatgpt.com" in url or "chat.openai.com" in url:
        return "chatgpt"
    if "grafana" in url:
        return "grafana"
    return "web"


def cmd_links(a):
    """Extract links, file paths, Slack permalinks, PR/issue refs and cmux refs from transcripts (links only, no text)."""
    paths = list(a.paths)
    if a.terms:
        terms = [t.strip().lower() for t in a.terms.split(",") if t.strip()]
        since = datetime.strptime(a.since, "%Y-%m-%d").timestamp() if a.since else 0
        files = []
        for root in CLAUDE_PROJECTS:
            files += glob.glob(f"{root}/*/*.jsonl")
        for h in CODEX_HOMES:
            files += glob.glob(f"{h}/sessions/*/*/*/rollout-*.jsonl")
        files += glob.glob(f"{HOME}/.cursor/projects/*/agent-transcripts/*/*.jsonl")
        files += glob.glob(f"{HOME}/.cursor/projects/*/agent-transcripts/*.jsonl")
        for f in files:
            if os.path.getmtime(f) < since:
                continue
            try:
                t = open(f, errors="replace").read().lower()
            except OSError:
                continue
            if any(x in t for x in terms):
                paths.append(f)
    urls, files_seen, cm = Counter(), Counter(), Counter()
    for p in paths:
        try:
            text = open(p, errors="replace").read().replace("\\/", "/").replace("\\n", "\n")
        except OSError:
            continue
        for u in URL_RE.findall(text):
            u = u.rstrip(".,;")
            if not any(n in u for n in NOISE_URL):
                urls[u] += 1
        for f in PATH_RE.findall(text):
            f = f.rstrip(".,;")
            if not any(n in f for n in NOISE_PATH) and os.path.exists(f) and not re.fullmatch(r"/Users/[^/]+/dev/projects/[^/]+/[^/]+/?", f):
                files_seen[f] += 1
        for c in CMUX_RE.findall(text):
            cm[c] += 1
    groups = {}
    for u, n in urls.items():
        groups.setdefault(kind_of(u), []).append((n, u))
    out = {"sessions_scanned": len(paths), "urls": {k: sorted(v, reverse=True)[: a.limit] for k, v in groups.items()},
           "files": files_seen.most_common(a.limit), "cmux_refs": cm.most_common(a.limit)}
    if a.json:
        print(json.dumps(out, indent=2))
        return
    print(f"scanned {len(paths)} sessions")
    for k, v in out["urls"].items():
        print(f"\n## {k} links (count | url)")
        for n, u in v:
            print(f"{n} | {u}")
    print("\n## existing file paths (count | path)")
    for f, n in out["files"]:
        print(f"{n} | {f}")
    print("\n## cmux refs (count | ref)")
    for c, n in out["cmux_refs"]:
        print(f"{n} | {c}")


def git(path, *args):
    r = subprocess.run(["git", "-C", path, *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""


def cmd_pool(a):
    for p in a.paths:
        p = os.path.expanduser(p)
        if not os.path.isdir(p):
            print(f"{p} | missing")
            continue
        branch = git(p, "branch", "--show-current") or "(detached)"
        dirty = len(git(p, "status", "--porcelain", "--untracked-files=no").splitlines())
        ahead = git(p, "rev-list", "--count", "@{u}..HEAD") or "no-upstream"
        print(f"{p} | branch={branch} | tracked-changes={dirty} | unpushed={ahead}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("sessions")
    s.add_argument("--repo", required=True)
    s.add_argument("--branch")
    s.add_argument("--since")
    s.add_argument("--json", action="store_true")
    s.set_defaults(fn=cmd_sessions)
    f = sub.add_parser("find")
    f.add_argument("--terms", required=True)
    f.add_argument("--since")
    f.add_argument("--limit", type=int, default=25)
    f.add_argument("--json", action="store_true")
    f.set_defaults(fn=cmd_find)
    l = sub.add_parser("links")
    l.add_argument("paths", nargs="*")
    l.add_argument("--terms")
    l.add_argument("--since")
    l.add_argument("--limit", type=int, default=25)
    l.add_argument("--json", action="store_true")
    l.set_defaults(fn=cmd_links)
    p = sub.add_parser("pool")
    p.add_argument("paths", nargs="+")
    p.set_defaults(fn=cmd_pool)
    ap.add_argument("--codex-home", action="append", default=[])
    ap.add_argument("--claude-projects", action="append", default=[])
    a = ap.parse_args()
    global CODEX_HOMES, CLAUDE_PROJECTS
    env_c = [x for x in os.environ.get("MUX_TASK_CODEX_HOMES", "").split(":") if x]
    env_p = [x for x in os.environ.get("MUX_TASK_CLAUDE_PROJECTS", "").split(":") if x]
    CODEX_HOMES = list(dict.fromkeys(CODEX_HOMES + env_c + a.codex_home))
    CLAUDE_PROJECTS = list(dict.fromkeys(CLAUDE_PROJECTS + env_p + a.claude_projects))
    a.fn(a)


if __name__ == "__main__":
    main()
