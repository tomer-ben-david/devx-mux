import { parseArgs } from "node:util";
import type { GitHubProjectsClient, ResolvedProject } from "./github-projects.js";
import type { KanbanFlowTask } from "./kanbanflow.js";
import { parsePointer, type BoardLinkStore } from "./link-store.js";
import { BOARD_SCHEMA_VERSION, type BoardFieldNames, type BoardItem, type BoardSnapshot, type ProjectRef } from "./models.js";

const DEFAULT_COLUMNS = ["To-do", "Do today", "In progress", "Done"];
const DEFAULT_FIELDS: BoardFieldNames = { status: "Status", time: "Focus minutes" };
const KANBANFLOW_POINTER = "kanbanflow-task";

export interface BoardCommandDependencies {
  readonly projects: GitHubProjectsClient;
  readonly links: BoardLinkStore;
  /** Reads the tasks of the KanbanFlow board whose API token is in the named environment variable. */
  readonly kanbanFlowTasks: (tokenEnvironmentVariable: string) => Promise<readonly KanbanFlowTask[]>;
  readonly environment: NodeJS.ProcessEnv;
  readonly now: () => Date;
}

export function boardHelpText(): string {
  return `DevX Mux board

Track work on a GitHub Projects board: one card per task, a column field for
its state, and a number field for focus time. Pointers from cards to local work
(terminal sessions, agent conversations, folders) stay on this machine in
$MUX_HOME/board-links.json (default ~/.devx-mux).

Usage:
  mux board setup  [--columns "A,B,C"]          Create the focus-time field; report missing columns
  mux board list   [--json]                     Show every card by column
  mux board add    --draft TITLE [--body TEXT] [--column NAME] [--json]
  mux board add    --url ISSUE_OR_PR_URL [--column NAME] [--json]
  mux board move   ITEM --column NAME
  mux board time   ITEM --add MINUTES [--json]  Add focus minutes to a card
  mux board link   ITEM --pointer KIND:VALUE [--label TEXT] [--json]
  mux board unlink ITEM --pointer KIND:VALUE
  mux board links  [ITEM] [--json]              Pointers of one card, or of all cards
  mux board import kanbanflow --token-env NAME [--map "FROM=TO"]... [--skip-column NAME]... [--dry-run]

Options:
  --project OWNER/NUMBER  Project to use (user or organization). Default: $MUX_BOARD_PROJECT.
  --status-field NAME     Single-select column field. Default: ${DEFAULT_FIELDS.status}.
  --time-field NAME       Number field for focus minutes. Default: ${DEFAULT_FIELDS.time}.
  --json                  Print a JSON document with "schema": ${BOARD_SCHEMA_VERSION}.

ITEM is a project item id as printed by list (PVTI_...). setup checks for the
columns ${DEFAULT_COLUMNS.map((name) => `"${name}"`).join(", ")}. GitHub access uses the gh login and
needs the project scope: gh auth refresh -s project

Safety: mux board only adds cards, sets a card's column or focus minutes, and
creates the focus-time field. It never deletes, archives or removes anything
and never edits columns; do those on github.com.
`;
}

export async function runBoardCommand(argv: readonly string[], dependencies: BoardCommandDependencies): Promise<string> {
  const [subcommand, ...rest] = argv;
  if (subcommand === undefined || subcommand === "--help" || subcommand === "-h" || rest.includes("--help") || rest.includes("-h")) {
    return boardHelpText();
  }
  const parsed = parseArgs({
    args: rest,
    allowPositionals: true,
    strict: true,
    options: {
      project: { type: "string" },
      "status-field": { type: "string" },
      "time-field": { type: "string" },
      json: { type: "boolean", default: false },
      columns: { type: "string" },
      column: { type: "string" },
      draft: { type: "string" },
      body: { type: "string" },
      url: { type: "string" },
      add: { type: "string" },
      pointer: { type: "string" },
      label: { type: "string" },
      "token-env": { type: "string" },
      map: { type: "string", multiple: true },
      "skip-column": { type: "string", multiple: true },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const values = parsed.values;
  const json = values.json ?? false;
  const fields: BoardFieldNames = { status: values["status-field"] ?? DEFAULT_FIELDS.status, time: values["time-field"] ?? DEFAULT_FIELDS.time };
  const project = (): ProjectRef => parseProjectRef(values.project ?? dependencies.environment["MUX_BOARD_PROJECT"]);
  const positionals = parsed.positionals;
  const { projects, links } = dependencies;

  switch (subcommand) {
    case "setup": {
      expectPositionals(positionals, 0, "setup");
      const columns = values.columns === undefined ? DEFAULT_COLUMNS : splitList(values.columns, "--columns");
      const report = await projects.ensureLayout(project(), fields, columns);
      const lines = [
        report.createdTimeField ? `created number field "${fields.time}"` : `number field "${fields.time}" exists`,
        report.missingColumns.length === 0
          ? `${report.statusField} has every column`
          : `${report.statusField} is missing ${report.missingColumns.map((name) => `"${name}"`).join(", ")}. Add ${report.missingColumns.length === 1 ? "it" : "them"} as options of the ${report.statusField} field at ${report.settingsUrl}`,
      ];
      return `${lines.join("\n")}\n`;
    }
    case "list": {
      expectPositionals(positionals, 0, "list");
      const snapshot = await projects.snapshot(project(), fields);
      return json ? `${JSON.stringify(snapshot)}\n` : formatSnapshot(snapshot);
    }
    case "add": {
      expectPositionals(positionals, 0, "add");
      if ((values.draft === undefined) === (values.url === undefined)) throw new Error("mux board add needs exactly one of --draft TITLE or --url URL.");
      if (values.url !== undefined && values.body !== undefined) throw new Error("--body only applies to --draft.");
      const resolved = await projects.resolve(project(), fields);
      const itemId = values.draft === undefined
        ? await projects.addByUrl(resolved, requireUrl(values.url))
        : await projects.addDraft(resolved, nonEmpty(values.draft, "--draft"), values.body ?? "");
      if (values.column !== undefined) await projects.move(resolved, itemId, values.column);
      return json ? `${JSON.stringify({ schema: BOARD_SCHEMA_VERSION, itemId })}\n` : `${itemId}\n`;
    }
    case "move": {
      const itemId = singleItem(positionals, "move");
      if (values.column === undefined) throw new Error("mux board move needs --column NAME.");
      await projects.move(await projects.resolve(project(), fields), itemId, values.column);
      return `moved ${itemId} to ${values.column}\n`;
    }
    case "time": {
      const itemId = singleItem(positionals, "time");
      const minutes = Number(values.add);
      if (values.add === undefined || !Number.isFinite(minutes) || minutes <= 0) throw new Error("mux board time needs --add MINUTES (a positive number).");
      const total = await projects.addFocusMinutes(await projects.resolve(project(), fields), itemId, minutes);
      return json ? `${JSON.stringify({ schema: BOARD_SCHEMA_VERSION, itemId, focusMinutes: total })}\n` : `${itemId}: ${formatMinutes(total)}\n`;
    }
    case "link": {
      const itemId = singleItem(positionals, "link");
      const pointer = parsePointer(requirePointer(values.pointer), values.label, dependencies.now().toISOString());
      const pointers = links.link(itemId, pointer);
      return json ? `${JSON.stringify({ schema: BOARD_SCHEMA_VERSION, itemId, pointers })}\n` : `linked ${pointer.kind}:${pointer.value} to ${itemId}\n`;
    }
    case "unlink": {
      const itemId = singleItem(positionals, "unlink");
      const pointer = parsePointer(requirePointer(values.pointer), undefined, dependencies.now().toISOString());
      links.unlink(itemId, pointer);
      return `unlinked ${pointer.kind}:${pointer.value} from ${itemId}\n`;
    }
    case "links": {
      if (positionals.length > 1) throw new Error(`Unexpected arguments: ${positionals.slice(1).join(" ")}`);
      const all = links.read();
      const itemId = positionals[0];
      const items = itemId === undefined ? all.items : { [itemId]: all.items[itemId] ?? [] };
      if (json) return `${JSON.stringify({ schema: BOARD_SCHEMA_VERSION, items })}\n`;
      const lines = Object.entries(items).flatMap(([id, pointers]) => [
        id,
        ...(pointers.length === 0 ? ["  (no pointers)"] : pointers.map((pointer) => `  ${pointer.kind}:${pointer.value}${pointer.label === undefined ? "" : `  ${pointer.label}`}`)),
      ]);
      return lines.length === 0 ? "No cards have pointers.\n" : `${lines.join("\n")}\n`;
    }
    case "import": {
      const [source, ...unexpected] = positionals;
      if (source !== "kanbanflow" || unexpected.length > 0) throw new Error("Usage: mux board import kanbanflow --token-env NAME");
      if (values["token-env"] === undefined) throw new Error("mux board import kanbanflow needs --token-env NAME (the environment variable holding the board's API token).");
      return importKanbanFlow(dependencies, project(), fields, {
        tokenEnvironmentVariable: values["token-env"],
        columnMap: parseColumnMap(values.map ?? []),
        skippedColumns: (values["skip-column"] ?? []).map((name) => name.toLowerCase()),
        dryRun: values["dry-run"] ?? false,
      });
    }
    default:
      throw new Error(`Unknown board command: ${subcommand}\n\n${boardHelpText()}`);
  }
}

export function parseProjectRef(value: string | undefined): ProjectRef {
  if (value === undefined || value === "") throw new Error("No project selected. Pass --project OWNER/NUMBER or set MUX_BOARD_PROJECT.");
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([1-9][0-9]*)$/.exec(value.trim());
  if (match === null) throw new Error(`Project "${value}" must look like OWNER/NUMBER, for example acme/3.`);
  return { owner: match[1] ?? "", number: Number(match[2]) };
}

interface ImportOptions {
  readonly tokenEnvironmentVariable: string;
  readonly columnMap: ReadonlyMap<string, string>;
  readonly skippedColumns: readonly string[];
  readonly dryRun: boolean;
}

async function importKanbanFlow(dependencies: BoardCommandDependencies, ref: ProjectRef, fields: BoardFieldNames, options: ImportOptions): Promise<string> {
  const { projects, links } = dependencies;
  const [tasks, resolved] = await Promise.all([dependencies.kanbanFlowTasks(options.tokenEnvironmentVariable), projects.resolve(ref, fields)]);
  const imported = new Set(Object.values(links.read().items).flatMap((pointers) =>
    pointers.filter((pointer) => pointer.kind === KANBANFLOW_POINTER).map((pointer) => pointer.value)));
  const pending = tasks.filter((task) => !options.skippedColumns.includes(task.column.toLowerCase()) && !imported.has(task.id));
  const plan = pending.map((task) => ({ task, column: targetColumn(task.column, options.columnMap, resolved) }));
  const unmapped = [...new Set(plan.filter((entry) => entry.column === undefined).map((entry) => entry.task.column))];
  if (unmapped.length > 0) {
    throw new Error(`KanbanFlow column${unmapped.length === 1 ? "" : "s"} ${unmapped.map((name) => `"${name}"`).join(", ")} match no board column (${resolved.statusField.options.map((option) => option.name).join(", ")}). Pass --map "FROM=TO" or --skip-column NAME.`);
  }
  const minutesOf = (task: KanbanFlowTask): number => Math.round(task.secondsSpent / 60);
  if (plan.some((entry) => minutesOf(entry.task) > 0) && resolved.timeField === null) {
    throw new Error(`Some KanbanFlow tasks have tracked time but project "${resolved.title}" has no focus-time field. Run: mux board setup`);
  }
  const skippedAlready = tasks.length - pending.length;
  const lines = plan.map((entry) => `${options.dryRun ? "would add" : "added"} "${entry.task.name}" -> ${entry.column}${minutesOf(entry.task) > 0 ? ` (${formatMinutes(minutesOf(entry.task))})` : ""}`);
  if (!options.dryRun) {
    for (const entry of plan) {
      const itemId = await projects.addDraft(resolved, entry.task.name, entry.task.description);
      links.link(itemId, { kind: KANBANFLOW_POINTER, value: entry.task.id, addedAt: dependencies.now().toISOString() });
      await projects.move(resolved, itemId, entry.column ?? "");
      if (minutesOf(entry.task) > 0) await projects.setFocusMinutes(resolved, itemId, minutesOf(entry.task));
    }
  }
  return `${[...lines, `${plan.length} ${options.dryRun ? "to import" : "imported"}, ${skippedAlready} skipped (already imported or in a skipped column).`].join("\n")}\n`;
}

function targetColumn(source: string, columnMap: ReadonlyMap<string, string>, project: ResolvedProject): string | undefined {
  const wanted = columnMap.get(source.toLowerCase()) ?? source;
  return project.statusField.options.find((option) => option.name.toLowerCase() === wanted.toLowerCase())?.name;
}

function parseColumnMap(entries: readonly string[]): ReadonlyMap<string, string> {
  return new Map(entries.map((entry) => {
    const separator = entry.indexOf("=");
    if (separator <= 0 || separator === entry.length - 1) throw new Error(`--map "${entry}" must look like FROM=TO.`);
    return [entry.slice(0, separator).trim().toLowerCase(), entry.slice(separator + 1).trim()];
  }));
}

function formatSnapshot(snapshot: BoardSnapshot): string {
  const known = new Set(snapshot.columns.map((column) => column.name));
  const groups = [
    ...snapshot.columns.map((column) => ({ name: column.name, items: snapshot.items.filter((item) => item.column === column.name) })),
    { name: "No column", items: snapshot.items.filter((item) => item.column === null || !known.has(item.column)) },
  ].filter((group) => group.name !== "No column" || group.items.length > 0);
  const lines = [`${snapshot.project.title}  ${snapshot.project.url}`];
  for (const group of groups) {
    lines.push("", `${group.name} (${group.items.length})`);
    for (const item of group.items) lines.push(`  ${describe(item)}  ${item.id}`);
  }
  return `${lines.join("\n")}\n`;
}

function describe(item: BoardItem): string {
  const time = item.focusMinutes === null || item.focusMinutes === 0 ? "" : ` [${formatMinutes(item.focusMinutes)}]`;
  switch (item.content.kind) {
    case "draft":
      return `${item.content.title}${time}`;
    case "issue":
      return `${item.content.repository}#${item.content.number} ${item.content.title}${item.content.state === "CLOSED" ? " (closed)" : ""}${time}`;
    case "pull-request":
      return `PR ${item.content.repository}#${item.content.number} ${item.content.title}${item.content.state === "OPEN" ? "" : ` (${item.content.state.toLowerCase()})`}${time}`;
    case "redacted":
      return `(no access)${time}`;
  }
}

function formatMinutes(total: number): string {
  const minutes = Math.round(total);
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes}m` : `${hours}h ${minutes % 60}m`;
}

function expectPositionals(positionals: readonly string[], count: number, command: string): void {
  if (positionals.length !== count) throw new Error(`mux board ${command} got unexpected arguments: ${positionals.join(" ")}`);
}

function singleItem(positionals: readonly string[], command: string): string {
  const [itemId, ...unexpected] = positionals;
  if (itemId === undefined) throw new Error(`mux board ${command} needs an ITEM id (see mux board list).`);
  if (unexpected.length > 0) throw new Error(`Unexpected arguments: ${unexpected.join(" ")}`);
  return itemId;
}

function splitList(value: string, option: string): readonly string[] {
  const entries = value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (entries.length === 0) throw new Error(`${option} must list at least one name.`);
  return entries;
}

function nonEmpty(value: string, option: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${option} must not be empty.`);
  return trimmed;
}

function requireUrl(value: string | undefined): string {
  if (value === undefined || !/^https:\/\/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/[0-9]+\/?$/.test(value)) {
    throw new Error(`--url must be a GitHub issue or pull request URL, got "${value ?? ""}".`);
  }
  return value;
}

function requirePointer(value: string | undefined): string {
  if (value === undefined) throw new Error("This command needs --pointer KIND:VALUE.");
  return value;
}
