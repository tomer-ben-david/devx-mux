import { execFile } from "node:child_process";
import {
  BOARD_SCHEMA_VERSION,
  type BoardColumn,
  type BoardFieldNames,
  type BoardItem,
  type BoardItemContent,
  type BoardSnapshot,
  type ProjectRef,
} from "./models.js";

/** Sends one GraphQL request to GitHub and returns its `data` object, throwing on any GraphQL or transport error. */
export interface GraphqlTransport {
  request(query: string, variables: Readonly<Record<string, unknown>>): Promise<unknown>;
}

const PROJECT_SCOPE_HINT = "GitHub Projects need the `project` token scope. Run: gh auth refresh -s project";

/** Runs GraphQL through the authenticated GitHub CLI, so `mux board` uses the same login as `gh`. */
export class GhCliGraphqlTransport implements GraphqlTransport {
  request(query: string, variables: Readonly<Record<string, unknown>>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = execFile("gh", ["api", "graphql", "--input", "-"], { maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
        let body: { readonly data?: unknown; readonly errors?: readonly { readonly type?: string; readonly message?: string }[] } | undefined;
        try {
          body = stdout.trim().length === 0 ? undefined : JSON.parse(stdout);
        } catch {
          body = undefined;
        }
        if (body?.errors !== undefined && body.errors.length > 0) {
          // GitHub reports a missing scope once per requested field; the first report says everything.
          const scopeError = body.errors.find((entry) => entry.type === "INSUFFICIENT_SCOPES");
          reject(new Error(scopeError === undefined
            ? [...new Set(body.errors.map((entry) => entry.message ?? JSON.stringify(entry)))].join("\n")
            : `${scopeError.message ?? "Missing token scope."}\n${PROJECT_SCOPE_HINT}`));
          return;
        }
        if (error !== null) {
          const detail = stderr.trim() || error.message;
          reject(new Error(/required scopes/i.test(detail) ? `${detail}\n${PROJECT_SCOPE_HINT}` : `gh api graphql failed: ${detail}`));
          return;
        }
        if (body?.data === undefined) {
          reject(new Error(`gh api graphql returned no data: ${stdout.slice(0, 500)}`));
          return;
        }
        resolve(body.data);
      });
      child.stdin?.end(JSON.stringify({ query, variables }));
    });
  }
}

interface RawOption { readonly id: string; readonly name: string; readonly color: string; readonly description: string }
interface RawStatusField { readonly id?: string; readonly name?: string; readonly dataType?: string; readonly options?: readonly RawOption[] }
interface RawTimeField { readonly id?: string; readonly name?: string; readonly dataType?: string }
interface RawProjectHeader {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly status: RawStatusField | null;
  readonly time: RawTimeField | null;
}
interface RawItem {
  readonly id: string;
  readonly type: "DRAFT_ISSUE" | "ISSUE" | "PULL_REQUEST" | "REDACTED";
  readonly isArchived: boolean;
  readonly updatedAt: string;
  readonly status: { readonly name?: string } | null;
  readonly time: { readonly number?: number } | null;
  readonly content: {
    readonly title?: string;
    readonly body?: string;
    readonly number?: number;
    readonly url?: string;
    readonly state?: string;
    readonly isDraft?: boolean;
    readonly repository?: { readonly nameWithOwner: string };
  } | null;
}

const PROJECT_HEADER_FIELDS = `
  id title url
  status: field(name: $statusField) {
    ... on ProjectV2SingleSelectField { id name dataType options { id name color description } }
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
              ... on PullRequest { title number url state isDraft repository { nameWithOwner } }
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
  readonly statusField: { readonly id: string; readonly name: string; readonly options: readonly RawOption[] };
  readonly timeField: { readonly id: string; readonly name: string } | null;
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

/** Reads and edits one GitHub Projects (v2) board. All writes go through GraphQL mutations; nothing is cached. */
export class GitHubProjectsClient {
  constructor(private readonly transport: GraphqlTransport) {}

  /** Every GitHub request goes through here, so the mutation allowlist cannot be bypassed. */
  private request(query: string, variables: Readonly<Record<string, unknown>>): Promise<unknown> {
    assertAllowedOperation(query);
    return this.transport.request(query, variables);
  }

  async snapshot(ref: ProjectRef, fields: BoardFieldNames): Promise<BoardSnapshot> {
    const items: BoardItem[] = [];
    let cursor: string | null = null;
    let project: ResolvedProject | undefined;
    do {
      const data = await this.request(PROJECT_ITEMS_QUERY, { ...variables(ref, fields), cursor });
      const raw = projectFrom(data, ref) as RawProjectHeader & {
        readonly items: { readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null }; readonly nodes: readonly RawItem[] };
      };
      project ??= resolveProject(raw, ref, fields);
      for (const node of raw.items.nodes) {
        if (!node.isArchived) items.push(toBoardItem(node));
      }
      cursor = raw.items.pageInfo.hasNextPage ? raw.items.pageInfo.endCursor : null;
    } while (cursor !== null);
    return {
      schema: BOARD_SCHEMA_VERSION,
      project: { id: project.id, title: project.title, url: project.url, owner: ref.owner, number: ref.number },
      statusField: { id: project.statusField.id, name: project.statusField.name },
      columns: project.statusField.options.map((option): BoardColumn => ({ optionId: option.id, name: option.name })),
      timeField: project.timeField,
      items,
    };
  }

  async resolve(ref: ProjectRef, fields: BoardFieldNames): Promise<ResolvedProject> {
    const data = await this.request(PROJECT_HEADER_QUERY, variables(ref, fields));
    return resolveProject(projectFrom(data, ref) as RawProjectHeader, ref, fields);
  }

  async move(project: ResolvedProject, itemId: string, column: string): Promise<void> {
    const option = project.statusField.options.find((candidate) => candidate.name.toLowerCase() === column.toLowerCase());
    if (option === undefined) {
      throw new Error(`Column "${column}" does not exist. Columns: ${project.statusField.options.map((candidate) => candidate.name).join(", ")}.`);
    }
    await this.request(`
mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: { projectId: $project, itemId: $item, fieldId: $field, value: { singleSelectOptionId: $option } }) { projectV2Item { id } }
}`, { project: project.id, item: itemId, field: project.statusField.id, option: option.id });
  }

  /** Adds minutes to an item's focus-time field and returns the new total. */
  async addFocusMinutes(project: ResolvedProject, itemId: string, minutes: number): Promise<number> {
    const timeField = requireTimeField(project);
    const data = await this.request(`
query($item: ID!, $field: String!) {
  node(id: $item) { ... on ProjectV2Item { time: fieldValueByName(name: $field) { ... on ProjectV2ItemFieldNumberValue { number } } } }
}`, { item: itemId, field: timeField.name }) as { readonly node: { readonly time?: { readonly number?: number } | null } | null };
    if (data.node === null) throw new Error(`Project item ${itemId} does not exist.`);
    const total = (data.node.time?.number ?? 0) + minutes;
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
}`, { project: project.id, title, body }) as { readonly addProjectV2DraftIssue: { readonly projectItem: { readonly id: string } } };
    return data.addProjectV2DraftIssue.projectItem.id;
  }

  /** Adds an existing issue or pull request by URL and returns its item id. Adding one already on the board returns the existing item. */
  async addByUrl(project: ResolvedProject, url: string): Promise<string> {
    const resource = await this.request(`
query($url: URI!) { resource(url: $url) { __typename ... on Issue { id } ... on PullRequest { id } } }`, { url }) as {
      readonly resource: { readonly __typename: string; readonly id?: string } | null;
    };
    if (resource.resource?.id === undefined) {
      throw new Error(`${url} is not an issue or pull request you can access${resource.resource === null ? "" : ` (found ${resource.resource.__typename})`}.`);
    }
    const data = await this.request(`
mutation($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
}`, { project: project.id, content: resource.resource.id }) as { readonly addProjectV2ItemById: { readonly item: { readonly id: string } } };
    return data.addProjectV2ItemById.item.id;
  }

  /**
   * Creates the focus-time number field when it is missing (an additive change) and reports which requested
   * columns are missing. Columns are never edited here: changing a single-select field rewrites its whole option
   * list, so a bug could drop a column and clear its cards. Missing columns are added by hand on github.com.
   */
  async ensureLayout(ref: ProjectRef, fields: BoardFieldNames, columns: readonly string[]): Promise<LayoutReport> {
    const project = await this.resolve(ref, fields);
    const missingColumns = columns.filter((column) => !project.statusField.options.some((option) => option.name.toLowerCase() === column.toLowerCase()));
    let createdTimeField = false;
    if (project.timeField === null) {
      await this.request(`
mutation($project: ID!, $name: String!) {
  createProjectV2Field(input: { projectId: $project, dataType: NUMBER, name: $name }) { projectV2Field { ... on ProjectV2Field { id } } }
}`, { project: project.id, name: fields.time });
      createdTimeField = true;
    }
    return { createdTimeField, missingColumns, statusField: project.statusField.name, settingsUrl: `${project.url}/settings` };
  }
}

export interface LayoutReport {
  readonly createdTimeField: boolean;
  readonly missingColumns: readonly string[];
  readonly statusField: string;
  /** Where the user adds missing columns themselves. */
  readonly settingsUrl: string;
}

function variables(ref: ProjectRef, fields: BoardFieldNames): Record<string, unknown> {
  return { owner: ref.owner, number: ref.number, statusField: fields.status, timeField: fields.time };
}

function projectFrom(data: unknown, ref: ProjectRef): unknown {
  const owner = (data as { readonly repositoryOwner: { readonly projectV2?: unknown } | null }).repositoryOwner;
  if (owner === null) throw new Error(`GitHub user or organization "${ref.owner}" does not exist.`);
  if (owner.projectV2 === undefined || owner.projectV2 === null) throw new Error(`Project ${ref.owner}/${ref.number} does not exist or you cannot access it.`);
  return owner.projectV2;
}

function resolveProject(raw: RawProjectHeader, ref: ProjectRef, fields: BoardFieldNames): ResolvedProject {
  const status = raw.status;
  if (status?.id === undefined || status.name === undefined) {
    throw new Error(`Project ${ref.owner}/${ref.number} has no field named "${fields.status}". Pass --status-field with its column field.`);
  }
  if (status.dataType !== "SINGLE_SELECT" || status.options === undefined) {
    throw new Error(`Field "${status.name}" in project ${ref.owner}/${ref.number} is ${status.dataType ?? "not a field"}, not a single-select column field.`);
  }
  const time = raw.time;
  if (time?.id !== undefined && time.dataType !== "NUMBER") {
    throw new Error(`Field "${time.name ?? fields.time}" in project ${ref.owner}/${ref.number} is ${time.dataType ?? "unknown"}, not a number field.`);
  }
  return {
    id: raw.id,
    title: raw.title,
    url: raw.url,
    statusField: { id: status.id, name: status.name, options: status.options },
    timeField: time?.id === undefined ? null : { id: time.id, name: time.name ?? fields.time },
  };
}

function requireTimeField(project: ResolvedProject): { readonly id: string; readonly name: string } {
  if (project.timeField === null) throw new Error(`Project "${project.title}" has no focus-time number field. Run: mux board setup`);
  return project.timeField;
}

function toBoardItem(node: RawItem): BoardItem {
  return {
    id: node.id,
    column: node.status?.name ?? null,
    focusMinutes: node.time?.number ?? null,
    updatedAt: node.updatedAt,
    content: toContent(node),
  };
}

function toContent(node: RawItem): BoardItemContent {
  const content = node.content;
  switch (node.type) {
    case "DRAFT_ISSUE":
      return { kind: "draft", title: content?.title ?? "", body: content?.body ?? "" };
    case "ISSUE":
      return {
        kind: "issue",
        title: required(content?.title, node, "title"),
        number: required(content?.number, node, "number"),
        url: required(content?.url, node, "url"),
        state: required(content?.state, node, "state") === "CLOSED" ? "CLOSED" : "OPEN",
        repository: required(content?.repository?.nameWithOwner, node, "repository"),
      };
    case "PULL_REQUEST": {
      const state = required(content?.state, node, "state");
      return {
        kind: "pull-request",
        title: required(content?.title, node, "title"),
        number: required(content?.number, node, "number"),
        url: required(content?.url, node, "url"),
        state: state === "MERGED" ? "MERGED" : state === "CLOSED" ? "CLOSED" : "OPEN",
        isDraft: content?.isDraft ?? false,
        repository: required(content?.repository?.nameWithOwner, node, "repository"),
      };
    }
    case "REDACTED":
      return { kind: "redacted" };
  }
}

function required<T>(value: T | undefined, node: RawItem, field: string): T {
  if (value === undefined) throw new Error(`GitHub returned ${node.type} item ${node.id} without ${field}.`);
  return value;
}
