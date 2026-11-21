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

interface RawColumn { readonly uniqueId: string; readonly name: string }
interface RawTaskGroup {
  readonly columnId: string;
  readonly swimlaneId?: string;
  readonly tasksLimited?: boolean;
  readonly nextTaskId?: string;
  readonly tasks: readonly {
    readonly _id: string;
    readonly name: string;
    readonly description?: string;
    readonly totalSecondsSpent?: number;
  }[];
}

const API_ROOT = "https://kanbanflow.com/api/v1";

/** Reads one KanbanFlow board through its REST API, authenticated with the board's API token. */
export class KanbanFlowClient {
  constructor(private readonly fetch: HttpFetch, private readonly apiToken: string) {}

  async tasks(): Promise<readonly KanbanFlowTask[]> {
    const board = await this.get("/board") as { readonly columns?: readonly RawColumn[] };
    if (board.columns === undefined) throw new Error("KanbanFlow returned a board without columns.");
    const tasks: KanbanFlowTask[] = [];
    for (const column of board.columns) {
      const pending: Record<string, string>[] = [{ columnId: column.uniqueId, limit: "100" }];
      for (let query = pending.shift(); query !== undefined; query = pending.shift()) {
        const groups = await this.get(`/tasks?${new URLSearchParams(query).toString()}`) as readonly RawTaskGroup[];
        for (const group of groups) {
          for (const task of group.tasks) {
            tasks.push({
              id: task._id,
              name: task.name,
              description: task.description ?? "",
              column: column.name,
              secondsSpent: task.totalSecondsSpent ?? 0,
            });
          }
          if (group.tasksLimited === true && group.nextTaskId !== undefined) {
            pending.push({
              columnId: column.uniqueId,
              limit: "100",
              startTaskId: group.nextTaskId,
              ...(group.swimlaneId === undefined ? {} : { swimlaneId: group.swimlaneId }),
            });
          }
        }
      }
    }
    return tasks;
  }

  private async get(pathAndQuery: string): Promise<unknown> {
    const response = await this.fetch(`${API_ROOT}${pathAndQuery}`, {
      headers: { Authorization: `Basic ${Buffer.from(`apiToken:${this.apiToken}`).toString("base64")}` },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`KanbanFlow ${pathAndQuery.split("?")[0]} failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
    return JSON.parse(body);
  }
}
