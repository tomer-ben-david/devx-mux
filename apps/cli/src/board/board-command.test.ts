import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { parseProjectRef, runBoardCommand, type BoardCommandDependencies } from "./board-command.js";
import { GitHubProjectsClient, type GraphqlTransport } from "./github-projects.js";
import { KanbanFlowClient, type HttpFetch, type KanbanFlowTask } from "./kanbanflow.js";
import { BoardLinkStore } from "./link-store.js";
import type { BoardSnapshot } from "./models.js";

interface FakeOption { id: string; name: string; color: string; description: string }
interface FakeItem { id: string; type: "DRAFT_ISSUE" | "ISSUE"; title: string; body: string; status: string | null; minutes: number | null; issueUrl?: string }

/** An in-memory GitHub project that answers the GraphQL operations GitHubProjectsClient sends. */
class FakeGitHubProject implements GraphqlTransport {
  options: FakeOption[] = [{ id: "opt-todo", name: "Todo", color: "GREEN", description: "kept" }];
  timeField: { id: string; name: string } | null = null;
  readonly items: FakeItem[] = [];
  readonly issues = new Map<string, string>([["https://github.com/acme/app/issues/7", "ISSUE_7"]]);
  private nextId = 1;

  async request(query: string, variables: Readonly<Record<string, unknown>>): Promise<unknown> {
    const v = (key: string): never => variables[key] as never;
    if (query.includes("updateProjectV2ItemFieldValue")) {
      const item = this.item(v("item"));
      if (v("option") !== undefined) item.status = this.options.find((option) => option.id === v("option"))?.name ?? null;
      else item.minutes = v("number");
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: item.id } } };
    }
    if (query.includes("addProjectV2DraftIssue")) {
      const id = `PVTI_${this.nextId++}`;
      this.items.push({ id, type: "DRAFT_ISSUE", title: v("title"), body: v("body"), status: null, minutes: null });
      return { addProjectV2DraftIssue: { projectItem: { id } } };
    }
    if (query.includes("resource(url")) {
      const id = this.issues.get(v("url"));
      return { resource: id === undefined ? null : { __typename: "Issue", id } };
    }
    if (query.includes("addProjectV2ItemById")) {
      const url = [...this.issues].find(([, id]) => id === v("content"))?.[0] ?? "";
      const existing = this.items.find((item) => item.issueUrl === url);
      if (existing !== undefined) return { addProjectV2ItemById: { item: { id: existing.id } } };
      const id = `PVTI_${this.nextId++}`;
      this.items.push({ id, type: "ISSUE", title: "Fix login", body: "", status: null, minutes: null, issueUrl: url });
      return { addProjectV2ItemById: { item: { id } } };
    }
    if (query.includes("updateProjectV2Field")) {
      const options = v("options") as { id?: string; name: string; color: string; description: string }[];
      this.options = options.map((option) => ({ ...option, id: option.id ?? `opt-${option.name}` }));
      return { updateProjectV2Field: { projectV2Field: { id: "status-field" } } };
    }
    if (query.includes("createProjectV2Field")) {
      this.timeField = { id: "time-field", name: v("name") };
      return { createProjectV2Field: { projectV2Field: { id: "time-field" } } };
    }
    if (query.includes("node(id")) {
      const item = this.item(v("item"));
      return { node: { time: item.minutes === null ? null : { number: item.minutes } } };
    }
    if (v("owner") !== "acme" || v("number") !== 1) return { repositoryOwner: { projectV2: null } };
    const header = {
      id: "PVT_1",
      title: "Work",
      url: "https://github.com/users/acme/projects/1",
      status: v("statusField") === "Status" ? { id: "status-field", name: "Status", dataType: "SINGLE_SELECT", options: this.options } : null,
      time: this.timeField === null || v("timeField") !== this.timeField.name ? null : { ...this.timeField, dataType: "NUMBER" },
    };
    if (!query.includes("items(first")) return { repositoryOwner: { projectV2: header } };
    return {
      repositoryOwner: {
        projectV2: {
          ...header,
          items: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: this.items.map((item) => ({
              id: item.id,
              type: item.type,
              isArchived: false,
              updatedAt: "2026-01-01T00:00:00Z",
              status: item.status === null ? null : { name: item.status },
              time: item.minutes === null ? null : { number: item.minutes },
              content: item.type === "DRAFT_ISSUE"
                ? { title: item.title, body: item.body }
                : { title: item.title, number: 7, url: item.issueUrl, state: "OPEN", repository: { nameWithOwner: "acme/app" } },
            })),
          },
        },
      },
    };
  }

  private item(id: string): FakeItem {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item === undefined) throw new Error(`no item ${id}`);
    return item;
  }
}

function withBoard(run: (board: (...argv: string[]) => Promise<string>, github: FakeGitHubProject, linksFile: string, kanbanFlow: KanbanFlowTask[]) => Promise<void>): Promise<void> {
  const home = mkdtempSync(path.join(tmpdir(), "devx-mux-board-"));
  const github = new FakeGitHubProject();
  const linksFile = path.join(home, "board-links.json");
  const kanbanFlow: KanbanFlowTask[] = [];
  const dependencies: BoardCommandDependencies = {
    projects: new GitHubProjectsClient(github),
    links: new BoardLinkStore(linksFile),
    kanbanFlowTasks: async () => kanbanFlow,
    environment: { MUX_BOARD_PROJECT: "acme/1" },
    now: () => new Date("2026-02-03T04:05:06Z"),
  };
  return run((...argv) => runBoardCommand(argv, dependencies), github, linksFile, kanbanFlow)
    .finally(() => rmSync(home, { recursive: true, force: true }));
}

const snapshotOf = async (board: (...argv: string[]) => Promise<string>): Promise<BoardSnapshot> => JSON.parse(await board("list", "--json"));

test("setup adds missing columns without changing existing ones, creates the focus field, and is idempotent", () => withBoard(async (board, github) => {
  assert.equal(await board("setup", "--columns", "todo, Doing, Done"),
    "added columns \"Doing\", \"Done\" to Status\ncreated number field \"Focus minutes\"\n");
  assert.deepEqual(github.options[0], { id: "opt-todo", name: "Todo", color: "GREEN", description: "kept" });
  assert.deepEqual(github.options.map((option) => option.name), ["Todo", "Doing", "Done"]);
  assert.equal(await board("setup", "--columns", "Todo,Doing,Done"), "Board already has every column and the focus-time field.\n");
}));

test("cards are added, moved between columns and accumulate focus minutes", () => withBoard(async (board) => {
  await board("setup", "--columns", "Todo,Doing,Done");
  const draft = JSON.parse(await board("add", "--draft", "  Write release notes ", "--body", "for v2", "--column", "todo", "--json")).itemId as string;
  const issue = (await board("add", "--url", "https://github.com/acme/app/issues/7")).trim();
  assert.equal((await board("add", "--url", "https://github.com/acme/app/issues/7")).trim(), issue, "adding an issue twice returns the same card");

  await board("move", issue, "--column", "Doing");
  await board("time", draft, "--add", "25");
  assert.equal(await board("time", draft, "--add", "50"), `${draft}: 1h 15m\n`);

  const snapshot = await snapshotOf(board);
  assert.equal(snapshot.schema, 1);
  assert.deepEqual(snapshot.columns.map((column) => column.name), ["Todo", "Doing", "Done"]);
  assert.deepEqual(snapshot.items.map((item) => [item.column, item.focusMinutes, item.content]), [
    ["Todo", 75, { kind: "draft", title: "Write release notes", body: "for v2" }],
    ["Doing", null, { kind: "issue", title: "Fix login", number: 7, url: "https://github.com/acme/app/issues/7", state: "OPEN", repository: "acme/app" }],
  ]);
  assert.match(await board("list"), /Todo \(1\)\n {2}Write release notes \[1h 15m\]/);
  await assert.rejects(board("move", draft, "--column", "Blocked"), /Column "Blocked" does not exist. Columns: Todo, Doing, Done/);
}));

test("focus time needs the focus field and fails loudly without it", () => withBoard(async (board) => {
  const draft = (await board("add", "--draft", "Spike")).trim();
  await assert.rejects(board("time", draft, "--add", "25"), /no focus-time number field. Run: mux board setup/);
}));

test("pointers link local work to cards, deduplicate, and survive in the links file", () => withBoard(async (board, _github, linksFile) => {
  await board("link", "PVTI_9", "--pointer", "folder:/work/app", "--label", "checkout");
  await board("link", "PVTI_9", "--pointer", "claude:abc:def");
  await board("link", "PVTI_9", "--pointer", "folder:/work/app", "--label", "main checkout");
  const links = JSON.parse(await board("links", "PVTI_9", "--json"));
  assert.deepEqual(links.items.PVTI_9, [
    { kind: "folder", value: "/work/app", label: "main checkout", addedAt: "2026-02-03T04:05:06.000Z" },
    { kind: "claude", value: "abc:def", addedAt: "2026-02-03T04:05:06.000Z" },
  ]);
  assert.equal(JSON.parse(readFileSync(linksFile, "utf8")).schema, 1);

  await board("unlink", "PVTI_9", "--pointer", "claude:abc:def");
  await board("unlink", "PVTI_9", "--pointer", "folder:/work/app");
  assert.equal(await board("links"), "No cards have pointers.\n");
  await assert.rejects(board("unlink", "PVTI_9", "--pointer", "folder:/work/app"), /has no pointer folder:\/work\/app/);
  await assert.rejects(board("link", "PVTI_9", "--pointer", "no-kind"), /must look like KIND:VALUE/);
}));

test("KanbanFlow import maps columns, carries tracked time, skips chosen columns, and never imports a task twice", () => withBoard(async (board, github, _linksFile, kanbanFlow) => {
  await board("setup", "--columns", "Todo,Doing,Done");
  kanbanFlow.push(
    { id: "k1", name: "Reply to review", description: "", column: "To-do", secondsSpent: 0 },
    { id: "k2", name: "Ship search", description: "details", column: "In progress", secondsSpent: 1_800 },
    { id: "k3", name: "Old work", description: "", column: "Done", secondsSpent: 60 },
  );
  await assert.rejects(board("import", "kanbanflow", "--token-env", "T"), /"To-do", "In progress" match no board column/);

  const options = ["--token-env", "T", "--map", "To-do=Todo", "--map", "in progress=Doing", "--skip-column", "done"];
  assert.match(await board("import", "kanbanflow", ...options, "--dry-run"), /would add "Ship search" -> Doing \(30m\)\n2 to import, 1 skipped/);
  assert.equal(github.items.length, 0, "dry run changes nothing");

  assert.match(await board("import", "kanbanflow", ...options), /2 imported, 1 skipped/);
  assert.deepEqual((await snapshotOf(board)).items.map((item) => [item.content.kind === "draft" ? item.content.title : "", item.column, item.focusMinutes]), [
    ["Reply to review", "Todo", null],
    ["Ship search", "Doing", 30],
  ]);
  assert.match(await board("import", "kanbanflow", ...options), /0 imported, 3 skipped/);
}));

test("project selection is explicit and validated", async () => {
  assert.deepEqual(parseProjectRef("acme-org/12"), { owner: "acme-org", number: 12 });
  assert.throws(() => parseProjectRef(undefined), /Pass --project OWNER\/NUMBER or set MUX_BOARD_PROJECT/);
  assert.throws(() => parseProjectRef("acme"), /must look like OWNER\/NUMBER/);
  await withBoard(async (board) => {
    await assert.rejects(board("list", "--project", "acme/2"), /Project acme\/2 does not exist or you cannot access it/);
    await assert.rejects(board("list", "--status-field", "Stage"), /has no field named "Stage"/);
    await assert.rejects(board("add", "--url", "https://example.com/x"), /must be a GitHub issue or pull request URL/);
  });
});

test("KanbanFlow client follows every column's pages and sends the API token", async () => {
  const requests: string[] = [];
  const responses = new Map<string, unknown>([
    ["/board", { columns: [{ uniqueId: "c1", name: "To-do" }, { uniqueId: "c2", name: "Done" }] }],
    ["/tasks?columnId=c1&limit=100", [{ columnId: "c1", tasksLimited: true, nextTaskId: "t2", tasks: [{ _id: "t1", name: "A", totalSecondsSpent: 120 }] }]],
    ["/tasks?columnId=c1&limit=100&startTaskId=t2", [{ columnId: "c1", tasksLimited: false, tasks: [{ _id: "t2", name: "B", description: "b" }] }]],
    ["/tasks?columnId=c2&limit=100", [{ columnId: "c2", tasks: [] }]],
  ]);
  const fetch: HttpFetch = async (url, init) => {
    const key = url.replace("https://kanbanflow.com/api/v1", "");
    requests.push(key);
    assert.equal(init.headers["Authorization"], `Basic ${Buffer.from("apiToken:secret").toString("base64")}`);
    const body = responses.get(key);
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, text: async () => JSON.stringify(body ?? "missing") };
  };
  assert.deepEqual(await new KanbanFlowClient(fetch, "secret").tasks(), [
    { id: "t1", name: "A", description: "", column: "To-do", secondsSpent: 120 },
    { id: "t2", name: "B", description: "b", column: "To-do", secondsSpent: 0 },
  ]);
  assert.equal(requests.length, 4);
});
