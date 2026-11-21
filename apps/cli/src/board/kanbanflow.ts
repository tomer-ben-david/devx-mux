import { JsonReader, parseJson } from "./json-reader.js";

/** A KanbanFlow task as the import needs it. */
export interface KanbanFlowTask {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly column: string;
  readonly secondsSpent: number;
}

export type HttpFetch = (url: string, init: { readonly headers: Readonly<Record<string, string>> }) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

const API_ROOT = "https://kanbanflow.com/api/v1";
const PAGE_SIZE = "100";

/** Reads one KanbanFlow board through its REST API, authenticated with the board's API token. */
export class KanbanFlowClient {
  constructor(private readonly fetch: HttpFetch, private readonly apiToken: string) {}

  async tasks(): Promise<readonly KanbanFlowTask[]> {
    const columns = (await this.get("/board")).field("columns").array()
      .map((column) => ({ id: column.field("uniqueId").string(), name: column.field("name").string() }));
    const tasks: KanbanFlowTask[] = [];
    for (const column of columns) {
      const pending: URLSearchParams[] = [new URLSearchParams({ columnId: column.id, limit: PAGE_SIZE })];
      for (let query = pending.shift(); query !== undefined; query = pending.shift()) {
        for (const group of (await this.get(`/tasks?${query.toString()}`)).array()) {
          for (const task of group.field("tasks").array()) {
            tasks.push({
              id: task.field("_id").string(),
              name: task.field("name").string(),
              description: task.optionalField("description")?.string() ?? "",
              column: column.name,
              secondsSpent: task.optionalField("totalSecondsSpent")?.number() ?? 0,
            });
          }
          const nextTaskId = group.optionalField("nextTaskId")?.string();
          if (group.optionalField("tasksLimited")?.boolean() === true && nextTaskId !== undefined) {
            pending.push(nextPage(column.id, nextTaskId, group.optionalField("swimlaneId")?.string()));
          }
        }
      }
    }
    return tasks;
  }

  private async get(pathAndQuery: string): Promise<JsonReader> {
    const response = await this.fetch(`${API_ROOT}${pathAndQuery}`, {
      headers: { Authorization: `Basic ${Buffer.from(`apiToken:${this.apiToken}`).toString("base64")}` },
    });
    const body = await response.text();
    const endpoint = `KanbanFlow ${pathAndQuery.split("?")[0]}`;
    if (!response.ok) throw new Error(`${endpoint} failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
    return new JsonReader(parseJson(body, endpoint), endpoint);
  }
}

function nextPage(columnId: string, startTaskId: string, swimlaneId: string | undefined): URLSearchParams {
  const query = new URLSearchParams({ columnId, limit: PAGE_SIZE, startTaskId });
  if (swimlaneId !== undefined) query.set("swimlaneId", swimlaneId);
  return query;
}
