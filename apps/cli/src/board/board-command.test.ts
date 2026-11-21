import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectRef, runBoardCommand, type BoardCommandDependencies } from "./board-command.js";
import { assertAllowedOperation, GitHubProjectsClient, graphqlData, type GraphqlTransport, type GraphqlVariables } from "./github-projects.js";
import { JsonReader, type JsonValue } from "./json-reader.js";
import { KanbanFlowClient, type HttpFetch, type KanbanFlowTask } from "./kanbanflow.js";
import type { BoardSnapshot } from "./models.js";

type FakeColumn = { id: string; name: string };
interface FakeItem {
  id: string;
  type: "DRAFT_ISSUE" | "ISSUE" | "PULL_REQUEST";
  title: string;
  body: string;
  status: string | null;
  minutes: number | null;
  url: string | null;
}

const ISSUE_URL = "https://github.com/acme/app/issues/7";
const PULL_REQUEST_URL = "https://github.com/acme/app/pull/8";

/** An in-memory GitHub project that answers the GraphQL operations GitHubProjectsClient sends. */
class FakeGitHubProject implements GraphqlTransport {
  columns: FakeColumn[] = [{ id: "opt-todo", name: "Todo" }];
  timeField: { id: string; name: string } | null = null;
  /** When set, item content is returned without this member, as a changed GitHub response would. */
  dropContentMember: string | null = null;
  readonly items: FakeItem[] = [];
  private readonly contentIds = new Map<string, string>([[ISSUE_URL, "ISSUE_7"], [PULL_REQUEST_URL, "PR_8"]]);
  private nextId = 1;

  async request(query: string, variables: GraphqlVariables): Promise<JsonValue> {
    // Real GitHub answers a by-name lookup of a field the project lacks with NOT_FOUND instead of null.
    if (/\bfield(ValueByName)?\(name:/.test(query)) throw new Error("Could not resolve to a Unions::ProjectV2FieldConfiguration with the name …");
    const argument = new JsonReader({ ...variables }, "variables");
    if (query.includes("updateProjectV2ItemFieldValue")) {
      const item = this.item(argument.field("item").string());
      const option = argument.optionalField("option")?.string();
      if (option === undefined) item.minutes = argument.field("number").number();
      else item.status = this.columns.find((column) => column.id === option)?.name ?? null;
      return { updateProjectV2ItemFieldValue: { projectV2Item: { id: item.id } } };
    }
    if (query.includes("addProjectV2DraftIssue")) {
      const id = this.add("DRAFT_ISSUE", argument.field("title").string(), argument.field("body").string(), null);
      return { addProjectV2DraftIssue: { projectItem: { id } } };
    }
    if (query.includes("resource(url")) {
      const id = this.contentIds.get(argument.field("url").string());
      return { resource: id === undefined ? null : { __typename: "Issue", id } };
    }
    if (query.includes("addProjectV2ItemById")) {
      const contentId = argument.field("content").string();
      const url = [...this.contentIds].find(([, id]) => id === contentId)?.[0] ?? "";
      const existing = this.items.find((item) => item.url === url);
      const id = existing?.id ?? (url === ISSUE_URL ? this.add("ISSUE", "Fix login", "", url) : this.add("PULL_REQUEST", "Speed up", "", url));
      return { addProjectV2ItemById: { item: { id } } };
    }
    if (query.includes("createProjectV2Field")) {
      this.timeField = { id: "time-field", name: argument.field("name").string() };
      return { createProjectV2Field: { projectV2Field: { id: "time-field" } } };
    }
    if (query.includes("node(id")) {
      const item = this.item(argument.field("item").string());
      return { node: { fieldValues: { nodes: this.fieldValues(item) } } };
    }
    if (argument.field("owner").string() !== "acme" || argument.field("number").number() !== 1) return { repositoryOwner: { projectV2: null } };
    const fields: JsonValue[] = [
      { id: "title-field", name: "Title", dataType: "TITLE" },
      { id: "status-field", name: "Status", dataType: "SINGLE_SELECT", options: this.columns },
      {},
      ...(this.timeField === null ? [] : [{ ...this.timeField, dataType: "NUMBER" }]),
    ];
    const header = { id: "PVT_1", title: "Work", url: "https://github.com/users/acme/projects/1", fields: { nodes: fields } };
    if (!query.includes("items(first")) return { repositoryOwner: { projectV2: header } };
    const nodes = this.items.map((item) => ({
      id: item.id,
      type: item.type,
      isArchived: false,
      updatedAt: "2026-01-01T00:00:00Z",
      fieldValues: { nodes: this.fieldValues(item) },
      content: this.content(item),
    }));
    return { repositoryOwner: { projectV2: { ...header, items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } };
  }

  /** Values as GitHub lists them: one per set field, kinds the query does not select come back empty. */
  private fieldValues(item: FakeItem): JsonValue[] {
    return [
      {},
      ...(item.status === null ? [] : [{ name: item.status, field: { id: "status-field" } }]),
      ...(item.minutes === null || this.timeField === null ? [] : [{ number: item.minutes, field: { id: this.timeField.id } }]),
    ];
  }

  private content(item: FakeItem): JsonValue {
    const repository = { nameWithOwner: "acme/app" };
    const content: Record<string, JsonValue> = item.type === "DRAFT_ISSUE"
      ? { title: item.title, body: item.body }
      : item.type === "ISSUE"
        ? { title: item.title, number: 7, url: item.url, state: "OPEN", repository }
        : { title: item.title, number: 8, url: item.url, state: "OPEN", isDraft: false, headRefName: "speed-up", repository };
    if (this.dropContentMember !== null) delete content[this.dropContentMember];
    return content;
  }

  private add(type: FakeItem["type"], title: string, body: string, url: string | null): string {
    const id = `PVTI_${this.nextId++}`;
    this.items.push({ id, type, title, body, status: null, minutes: null, url });
    return id;
  }

  private item(id: string): FakeItem {
    const item = this.items.find((candidate) => candidate.id === id);
    if (item === undefined) throw new Error(`no item ${id}`);
    return item;
  }
}

async function withBoard(run: (board: (...argv: string[]) => Promise<string>, github: FakeGitHubProject, kanbanFlow: KanbanFlowTask[]) => Promise<void>): Promise<void> {
  const github = new FakeGitHubProject();
  const kanbanFlow: KanbanFlowTask[] = [];
  const dependencies: BoardCommandDependencies = {
    projects: new GitHubProjectsClient(github),
    kanbanFlowTasks: async () => kanbanFlow,
    environment: { MUX_BOARD_PROJECT: "acme/1" },
  };
  await run((...argv) => runBoardCommand(argv, dependencies), github, kanbanFlow);
}

const snapshotOf = async (board: (...argv: string[]) => Promise<string>): Promise<BoardSnapshot> => {
  const snapshot: BoardSnapshot = JSON.parse(await board("list", "--json"));
  return snapshot;
};

test("setup creates the focus field, reports missing columns with where to add them, and never edits columns", () => withBoard(async (board, github) => {
  assert.equal(await board("setup", "--columns", "todo, Doing"),
    "created number field \"Focus minutes\"\nStatus is missing \"Doing\". Add it as options of the Status field at https://github.com/users/acme/projects/1/settings\n");
  assert.deepEqual(github.columns, [{ id: "opt-todo", name: "Todo" }], "columns are untouched");
  github.columns.push({ id: "opt-doing", name: "Doing" });
  assert.equal(await board("setup", "--columns", "Todo,Doing"), "number field \"Focus minutes\" exists\nStatus has every column\n");
}));

test("only additive GitHub mutations can be sent; deletes, archives and column rewrites are refused", () => {
  for (const allowed of ["addProjectV2DraftIssue", "addProjectV2ItemById", "updateProjectV2ItemFieldValue", "createProjectV2Field"]) {
    assert.doesNotThrow(() => assertAllowedOperation(`mutation($p: ID!) { ${allowed}(input: { projectId: $p }) { clientMutationId } }`));
  }
  assert.doesNotThrow(() => assertAllowedOperation("query { viewer { login } }"));
  for (const refused of ["deleteProjectV2Item", "archiveProjectV2Item", "deleteProjectV2Field", "updateProjectV2Field", "deleteProjectV2", "deleteIssue", "closeIssue"]) {
    assert.throws(() => assertAllowedOperation(`mutation { ${refused}(input: { id: "x" }) { clientMutationId } }`), new RegExp(`Refusing GitHub mutation ${refused}`));
  }
  assert.throws(() => assertAllowedOperation("mutation { a: addProjectV2DraftIssue(input: {}) { clientMutationId } b: deleteProjectV2Item(input: {}) { clientMutationId } }"),
    /Refusing GitHub mutation deleteProjectV2Item/);
  assert.throws(() => assertAllowedOperation("mutation { deleteProjectV2Item(id: \"x\") { deletedItemId } }"), /Refusing GitHub mutation \(unrecognized\)/);
  assert.throws(() => assertAllowedOperation("query { x } mutation { deleteProjectV2Item(input: {}) { deletedItemId } }"), /mixes a mutation/);
});

test("cards are added, moved between columns and accumulate focus minutes", () => withBoard(async (board, github) => {
  github.columns.push({ id: "opt-doing", name: "Doing" }, { id: "opt-done", name: "Done" });
  await board("setup");
  const created: { readonly itemId: string } = JSON.parse(await board("add", "--draft", "  Write release notes ", "--body", "for v2", "--column", "todo", "--json"));
  const issue = (await board("add", "--url", ISSUE_URL)).trim();
  assert.equal((await board("add", "--url", ISSUE_URL)).trim(), issue, "adding an issue twice returns the same card");
  await board("add", "--url", PULL_REQUEST_URL, "--column", "Doing");

  await board("move", issue, "--column", "Doing");
  await board("time", created.itemId, "--add", "25");
  assert.equal(await board("time", created.itemId, "--add", "50"), `${created.itemId}: 1h 15m\n`);

  const snapshot = await snapshotOf(board);
  assert.equal(snapshot.schema, 1);
  assert.deepEqual(snapshot.columns.map((column) => column.name), ["Todo", "Doing", "Done"]);
  assert.deepEqual(snapshot.items.map((item) => [item.column, item.focusMinutes, item.content]), [
    ["Todo", 75, { kind: "draft", title: "Write release notes", body: "for v2" }],
    ["Doing", null, { kind: "issue", title: "Fix login", number: 7, url: ISSUE_URL, state: "OPEN", repository: "acme/app" }],
    ["Doing", null, { kind: "pull-request", title: "Speed up", number: 8, url: PULL_REQUEST_URL, state: "OPEN", isDraft: false, headRefName: "speed-up", repository: "acme/app" }],
  ]);
  assert.match(await board("list"), /Todo \(1\)\n {2}Write release notes \[1h 15m\]/);
  await assert.rejects(board("move", created.itemId, "--column", "Blocked"), /Column "Blocked" does not exist. Columns: Todo, Doing, Done/);
}));

test("an unexpected GitHub response fails with the path of the missing value", () => withBoard(async (board, github) => {
  await board("add", "--url", ISSUE_URL);
  github.dropContentMember = "repository";
  await assert.rejects(board("list"), /GitHub: expected member "repository" at \$\.repositoryOwner\.projectV2\.items\.nodes\[0\]\.content, found nothing\./);
}));

test("focus time needs the focus field and fails loudly without it", () => withBoard(async (board) => {
  const draft = (await board("add", "--draft", "Spike")).trim();
  await assert.rejects(board("time", draft, "--add", "25"), /no focus-time number field. Run: mux board setup/);
}));

test("KanbanFlow import maps columns, carries tracked time, skips chosen columns, and skips titles already on the board", () => withBoard(async (board, github, kanbanFlow) => {
  github.columns.push({ id: "opt-doing", name: "Doing" }, { id: "opt-done", name: "Done" });
  await board("setup");
  kanbanFlow.push(
    { id: "k1", name: "Reply to review", description: "", column: "To-do", secondsSpent: 0 },
    { id: "k2", name: "Ship search ", description: "details", column: "In progress", secondsSpent: 1_800 },
    { id: "k3", name: "Old work", description: "", column: "Done", secondsSpent: 60 },
  );
  await assert.rejects(board("import", "kanbanflow", "--token-env", "T"), /"To-do", "In progress" match no board column/);

  const options = ["--token-env", "T", "--map", "To-do=Todo", "--map", "in progress=Doing", "--skip-column", "done"];
  assert.match(await board("import", "kanbanflow", ...options, "--dry-run"), /would add "Ship search " -> Doing \(30m\)\n2 to import, 1 skipped/);
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

test("gh responses: data passes through, GraphQL errors are deduplicated, a missing scope says how to grant it", () => {
  assert.deepEqual(graphqlData(null, JSON.stringify({ data: { viewer: { login: "a" } } })), { viewer: { login: "a" } });
  const scope = { type: "INSUFFICIENT_SCOPES", message: "needs read:project" };
  assert.throws(() => graphqlData("exit 1", JSON.stringify({ errors: [scope, scope, scope] })),
    (error: Error) => error.message === "needs read:project\nGitHub Projects need the `project` token scope. Run: gh auth refresh -s project");
  assert.throws(() => graphqlData("exit 1", JSON.stringify({ errors: [{ message: "bad" }, { message: "bad" }] })), (error: Error) => error.message === "bad");
  assert.throws(() => graphqlData("could not connect", ""), /gh api graphql failed: could not connect/);
  assert.throws(() => graphqlData(null, "{}"), /returned no data/);
});

test("KanbanFlow client follows every column's pages and sends the API token", async () => {
  const requests: string[] = [];
  const responses = new Map<string, JsonValue>([
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
