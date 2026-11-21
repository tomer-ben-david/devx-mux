import { execFile } from "node:child_process";
import { JsonReader, parseJson, type JsonValue } from "./json-reader.js";
import {
  BOARD_SCHEMA_VERSION,
  type BoardColumn,
  type BoardFieldNames,
  type BoardItem,
  type BoardItemContent,
  type BoardSnapshot,
  type ProjectRef,
} from "./models.js";

export type GraphqlVariables = Readonly<Record<string, JsonValue>>;

/** Sends one GraphQL request to GitHub and returns its `data` object, throwing on any GraphQL or transport error. */
export interface GraphqlTransport {
  request(query: string, variables: GraphqlVariables): Promise<JsonValue>;
}

const PROJECT_SCOPE_HINT = "GitHub Projects need the `project` token scope. Run: gh auth refresh -s project";

/** Runs GraphQL through the authenticated GitHub CLI, so `mux board` uses the same login as `gh`. */
export class GhCliGraphqlTransport implements GraphqlTransport {
  request(query: string, variables: GraphqlVariables): Promise<JsonValue> {
    return new Promise((resolve, reject) => {
      const child = execFile("gh", ["api", "graphql", "--input", "-"], { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
        try {
          resolve(graphqlData(error === null ? null : stderr.trim() || error.message, stdout));
        } catch (failure) {
          reject(failure);
        }
      });
      child.stdin?.end(JSON.stringify({ query, variables }));
    });
  }
}

/** The `data` of a `gh api graphql` response; GraphQL errors and process failures become one readable error. */
export function graphqlData(processFailure: string | null, stdout: string): JsonValue {
  const body = stdout.trim().length === 0 ? null : new JsonReader(parseJson(stdout, "gh api graphql"), "gh api graphql");
  const errors = body?.optionalField("errors")?.array() ?? [];
  if (errors.length > 0) {
    const reported = errors.map((entry) => ({ type: entry.optionalField("type")?.string(), message: entry.field("message").string() }));
    // GitHub reports a missing scope once per requested field; the first report says everything.
    const scopeError = reported.find((entry) => entry.type === "INSUFFICIENT_SCOPES");
    throw new Error(scopeError === undefined ? [...new Set(reported.map((entry) => entry.message))].join("\n") : `${scopeError.message}\n${PROJECT_SCOPE_HINT}`);
  }
  if (processFailure !== null) {
    throw new Error(/required scopes/i.test(processFailure) ? `${processFailure}\n${PROJECT_SCOPE_HINT}` : `gh api graphql failed: ${processFailure}`);
  }
  if (body === null) throw new Error("gh api graphql printed nothing.");
  const data = body.optionalField("data");
  if (data === null) throw new Error(`gh api graphql returned no data: ${stdout.slice(0, 500)}`);
  return data.raw();
}

/**
 * The only GitHub changes `mux board` may make. Each one adds something or sets a card's field; none deletes,
 * archives, removes, or rewrites a board's structure. Anything else is refused before it reaches GitHub, so a
 * bug cannot destroy data: removing cards, columns or boards stays a manual action on github.com.
 */
export const ALLOWED_MUTATIONS: ReadonlySet<string> = new Set([
  "addProjectV2DraftIssue",
  "addProjectV2ItemById",
  "updateProjectV2ItemFieldValue",
  "createProjectV2Field",
]);

/** Throws unless [query] is a read, or a mutation made only of [ALLOWED_MUTATIONS]. */
export function assertAllowedOperation(query: string): void {
  const operation = query.replace(/#[^\n]*/g, "").trim();
  if (!/^mutation\b/i.test(operation)) {
    if (/\bmutation\b/i.test(operation)) throw new Error("Refusing a GitHub request that mixes a mutation into a query.");
    return;
  }
  const body = operation.slice(operation.indexOf("{") + 1);
  const fields = [...body.matchAll(/(?:^|[{\s])([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*input\s*:/g)].map((match) => match[1] ?? "");
  const refused = fields.filter((field) => !ALLOWED_MUTATIONS.has(field));
  if (fields.length === 0 || refused.length > 0) {
    throw new Error(`Refusing GitHub mutation ${refused.join(", ") || "(unrecognized)"}: mux board only adds cards and sets card fields. Delete or restructure boards on github.com.`);
  }
}

const PROJECT_HEADER_FIELDS = `
  id title url
  status: field(name: $statusField) {
    ... on ProjectV2SingleSelectField { id name dataType options { id name } }
    ... on ProjectV2Field { id name dataType }
  }
  time: field(name: $timeField) {
    ... on ProjectV2Field { id name dataType }
    ... on ProjectV2SingleSelectField { id name dataType }
  }
`;

const PROJECT_HEADER_QUERY = `
query($owner: String!, $number: Int!, $statusField: String!, $timeField: String!) {
  repositoryOwner(login: $owner) {
    ... on ProjectV2Owner { projectV2(number: $number) { ${PROJECT_HEADER_FIELDS} } }
  }
}`;

const PROJECT_ITEMS_QUERY = `
query($owner: String!, $number: Int!, $statusField: String!, $timeField: String!, $cursor: String) {
  repositoryOwner(login: $owner) {
    ... on ProjectV2Owner {
      projectV2(number: $number) {
        ${PROJECT_HEADER_FIELDS}
        items(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id type isArchived updatedAt
            status: fieldValueByName(name: $statusField) { ... on ProjectV2ItemFieldSingleSelectValue { name } }
            time: fieldValueByName(name: $timeField) { ... on ProjectV2ItemFieldNumberValue { number } }
            content {
              ... on DraftIssue { title body }
              ... on Issue { title number url state repository { nameWithOwner } }
              ... on PullRequest { title number url state isDraft headRefName repository { nameWithOwner } }
            }
          }
        }
      }
    }
  }
}`;

/** The project, its column field and (when present) its focus-time field, resolved by name. */
export interface ResolvedProject {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly statusField: { readonly id: string; readonly name: string; readonly columns: readonly BoardColumn[] };
  readonly timeField: { readonly id: string; readonly name: string } | null;
}

/** What `setup` did and what it leaves to the user. */
export interface LayoutReport {
  readonly createdTimeField: boolean;
  readonly missingColumns: readonly string[];
  readonly statusField: string;
  /** Where the user adds missing columns themselves. */
  readonly settingsUrl: string;
}

/** Reads and edits one GitHub Projects (v2) board. All writes go through GraphQL mutations; nothing is cached. */
export class GitHubProjectsClient {
  constructor(private readonly transport: GraphqlTransport) {}

  async snapshot(ref: ProjectRef, fields: BoardFieldNames): Promise<BoardSnapshot> {
    const items: BoardItem[] = [];
    let cursor: string | null = null;
    let project: ResolvedProject | undefined;
    do {
      const raw = await this.project(PROJECT_ITEMS_QUERY, ref, fields, cursor);
      project ??= resolveProject(raw, ref, fields);
      const page = raw.field("items");
      for (const node of page.field("nodes").array()) {
        if (!node.field("isArchived").boolean()) items.push(toBoardItem(node));
      }
      const pageInfo = page.field("pageInfo");
      cursor = pageInfo.field("hasNextPage").boolean() ? pageInfo.field("endCursor").string() : null;
    } while (cursor !== null);
    return {
      schema: BOARD_SCHEMA_VERSION,
      project: { id: project.id, title: project.title, url: project.url, owner: ref.owner, number: ref.number },
      statusField: { id: project.statusField.id, name: project.statusField.name },
      columns: project.statusField.columns,
      timeField: project.timeField,
      items,
    };
  }

  async resolve(ref: ProjectRef, fields: BoardFieldNames): Promise<ResolvedProject> {
    return resolveProject(await this.project(PROJECT_HEADER_QUERY, ref, fields, null), ref, fields);
  }

  async move(project: ResolvedProject, itemId: string, column: string): Promise<void> {
    const option = project.statusField.columns.find((candidate) => candidate.name.toLowerCase() === column.toLowerCase());
    if (option === undefined) {
      throw new Error(`Column "${column}" does not exist. Columns: ${project.statusField.columns.map((candidate) => candidate.name).join(", ")}.`);
    }
    await this.request(`
mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } }
}`, { project: project.id, item: itemId, field: project.statusField.id, option: option.optionId });
  }

  /** Adds minutes to an item's focus-time field and returns the new total. */
  async addFocusMinutes(project: ResolvedProject, itemId: string, minutes: number): Promise<number> {
    const timeField = requireTimeField(project);
    const data = await this.request(`
query($item: ID!, $field: String!) {
  node(id: $item) { ... on ProjectV2Item { time: fieldValueByName(name: $field) { ... on ProjectV2ItemFieldNumberValue { number } } } }
}`, { item: itemId, field: timeField.name });
    const node = data.optionalField("node");
    if (node === null) throw new Error(`Project item ${itemId} does not exist.`);
    const total = (node.optionalField("time")?.optionalField("number")?.number() ?? 0) + minutes;
    await this.setFocusMinutes(project, itemId, total);
    return total;
  }

  async setFocusMinutes(project: ResolvedProject, itemId: string, minutes: number): Promise<void> {
    const timeField = requireTimeField(project);
    await this.request(`
mutation($project: ID!, $item: ID!, $field: ID!, $number: Float!) {
  updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { number: $number } }) { projectV2Item { id } }
}`, { project: project.id, item: itemId, field: timeField.id, number: minutes });
  }

  /** Creates a draft item (a card that lives only in the project) and returns its item id. */
  async addDraft(project: ResolvedProject, title: string, body: string): Promise<string> {
    const data = await this.request(`
mutation($project: ID!, $title: String!, $body: String!) {
  addProjectV2DraftIssue(input: { projectId: $project, title: $title, body: $body }) { projectItem { id } }
}`, { project: project.id, title, body });
    return data.field("addProjectV2DraftIssue").field("projectItem").field("id").string();
  }

  /** Adds an existing issue or pull request by URL and returns its item id. Adding one already on the board returns the existing item. */
  async addByUrl(project: ResolvedProject, url: string): Promise<string> {
    const resource = (await this.request(`
query($url: URI!) { resource(url: $url) { __typename ... on Issue { id } ... on PullRequest { id } } }`, { url })).optionalField("resource");
    const contentId = resource?.optionalField("id")?.string();
    if (resource === null || contentId === undefined) {
      throw new Error(`${url} is not an issue or pull request you can access${resource === null ? "" : ` (found ${resource.field("__typename").string()})`}.`);
    }
    const data = await this.request(`
mutation($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
}`, { project: project.id, content: contentId });
    return data.field("addProjectV2ItemById").field("item").field("id").string();
  }

  /**
   * Creates the focus-time number field when it is missing (an additive change) and reports which requested
   * columns are missing. Columns are never edited here: changing a single-select field rewrites its whole option
   * list, so a bug could drop a column and clear its cards. Missing columns are added by hand on github.com.
   */
  async ensureLayout(ref: ProjectRef, fields: BoardFieldNames, columns: readonly string[]): Promise<LayoutReport> {
    const project = await this.resolve(ref, fields);
    const missingColumns = columns.filter((column) => !project.statusField.columns.some((option) => option.name.toLowerCase() === column.toLowerCase()));
    if (project.timeField === null) {
      await this.request(`
mutation($project: ID!, $name: String!) {
  createProjectV2Field(input: { projectId: $project, dataType: NUMBER, name: $name }) { projectV2Field { ... on ProjectV2Field { id } } }
}`, { project: project.id, name: fields.time });
    }
    return { createdTimeField: project.timeField === null, missingColumns, statusField: project.statusField.name, settingsUrl: `${project.url}/settings` };
  }

  /** Every GitHub request goes through here, so the mutation allowlist cannot be bypassed. */
  private async request(query: string, variables: GraphqlVariables): Promise<JsonReader> {
    assertAllowedOperation(query);
    return new JsonReader(await this.transport.request(query, variables), "GitHub");
  }

  private async project(query: string, ref: ProjectRef, fields: BoardFieldNames, cursor: string | null): Promise<JsonReader> {
    const data = await this.request(query, { owner: ref.owner, number: ref.number, statusField: fields.status, timeField: fields.time, cursor });
    const owner = data.optionalField("repositoryOwner");
    if (owner === null) throw new Error(`GitHub user or organization "${ref.owner}" does not exist.`);
    const project = owner.optionalField("projectV2");
    if (project === null) throw new Error(`Project ${ref.owner}/${ref.number} does not exist or you cannot access it.`);
    return project;
  }
}

function resolveProject(raw: JsonReader, ref: ProjectRef, fields: BoardFieldNames): ResolvedProject {
  const status = raw.optionalField("status");
  const statusId = status?.optionalField("id");
  if (status === null || statusId === null || statusId === undefined) {
    throw new Error(`Project ${ref.owner}/${ref.number} has no field named "${fields.status}". Pass --status-field with its column field.`);
  }
  const statusName = status.field("name").string();
  const statusType = status.field("dataType").string();
  if (statusType !== "SINGLE_SELECT") {
    throw new Error(`Field "${statusName}" in project ${ref.owner}/${ref.number} is ${statusType}, not a single-select column field.`);
  }
  const time = raw.optionalField("time");
  const timeId = time?.optionalField("id");
  if (time !== null && timeId !== null && timeId !== undefined && time.field("dataType").string() !== "NUMBER") {
    throw new Error(`Field "${time.field("name").string()}" in project ${ref.owner}/${ref.number} is ${time.field("dataType").string()}, not a number field.`);
  }
  return {
    id: raw.field("id").string(),
    title: raw.field("title").string(),
    url: raw.field("url").string(),
    statusField: {
      id: statusId.string(),
      name: statusName,
      columns: status.field("options").array().map((option) => ({ optionId: option.field("id").string(), name: option.field("name").string() })),
    },
    timeField: time === null || timeId === null || timeId === undefined ? null : { id: timeId.string(), name: time.field("name").string() },
  };
}

function requireTimeField(project: ResolvedProject): { readonly id: string; readonly name: string } {
  if (project.timeField === null) throw new Error(`Project "${project.title}" has no focus-time number field. Run: mux board setup`);
  return project.timeField;
}

function toBoardItem(node: JsonReader): BoardItem {
  return {
    id: node.field("id").string(),
    column: node.optionalField("status")?.optionalField("name")?.string() ?? null,
    focusMinutes: node.optionalField("time")?.optionalField("number")?.number() ?? null,
    updatedAt: node.field("updatedAt").string(),
    content: toContent(node.field("type").string(), node.optionalField("content")),
  };
}

function toContent(type: string, content: JsonReader | null): BoardItemContent {
  if (type === "REDACTED") return { kind: "redacted" };
  if (content === null) throw new Error(`GitHub returned a ${type} item without content.`);
  switch (type) {
    case "DRAFT_ISSUE":
      return { kind: "draft", title: content.field("title").string(), body: content.field("body").string() };
    case "ISSUE":
      return {
        kind: "issue",
        title: content.field("title").string(),
        number: content.field("number").number(),
        url: content.field("url").string(),
        state: content.field("state").string() === "CLOSED" ? "CLOSED" : "OPEN",
        repository: content.field("repository").field("nameWithOwner").string(),
      };
    case "PULL_REQUEST":
      return {
        kind: "pull-request",
        title: content.field("title").string(),
        number: content.field("number").number(),
        url: content.field("url").string(),
        state: pullRequestState(content.field("state").string()),
        isDraft: content.field("isDraft").boolean(),
        headRefName: content.field("headRefName").string(),
        repository: content.field("repository").field("nameWithOwner").string(),
      };
    default:
      throw new Error(`GitHub returned a project item of unknown type ${type}.`);
  }
}

function pullRequestState(state: string): "OPEN" | "CLOSED" | "MERGED" {
  if (state === "OPEN" || state === "CLOSED" || state === "MERGED") return state;
  throw new Error(`GitHub returned unknown pull request state ${state}.`);
}
