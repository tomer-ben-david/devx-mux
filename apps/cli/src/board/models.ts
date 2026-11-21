/** Version of every JSON document `mux board` prints. Consumers must reject other versions. */
export const BOARD_SCHEMA_VERSION = 1;

/** A GitHub Projects (v2) board owned by a user or an organization. */
export interface ProjectRef {
  readonly owner: string;
  readonly number: number;
}

/** Names of the project fields the board reads: a single-select column field and a number field for focus time. */
export interface BoardFieldNames {
  readonly status: string;
  readonly time: string;
}

export interface BoardColumn {
  readonly optionId: string;
  readonly name: string;
}

export type BoardItemContent =
  | { readonly kind: "draft"; readonly title: string; readonly body: string }
  | {
    readonly kind: "issue";
    readonly title: string;
    readonly number: number;
    readonly url: string;
    readonly state: "OPEN" | "CLOSED";
    readonly repository: string;
  }
  | {
    readonly kind: "pull-request";
    readonly title: string;
    readonly number: number;
    readonly url: string;
    readonly state: "OPEN" | "CLOSED" | "MERGED";
    readonly isDraft: boolean;
    readonly repository: string;
    /** The pull request's head branch, so a checkout on that branch can be matched to its card. */
    readonly headRefName: string;
  }
  /** An item whose content the viewer cannot read (GitHub reports it as REDACTED). */
  | { readonly kind: "redacted" };

export interface BoardItem {
  /** Stable project item node id; it does not change when the item moves between columns. */
  readonly id: string;
  /** Column name, or null when the item has no value in the column field. */
  readonly column: string | null;
  /** Accumulated focus minutes, or null when unset or the project has no time field. */
  readonly focusMinutes: number | null;
  readonly updatedAt: string;
  readonly content: BoardItemContent;
}

export interface BoardSnapshot {
  readonly schema: typeof BOARD_SCHEMA_VERSION;
  readonly project: { readonly id: string; readonly title: string; readonly url: string; readonly owner: string; readonly number: number };
  readonly statusField: { readonly id: string; readonly name: string };
  /** Columns in the board's order. */
  readonly columns: readonly BoardColumn[];
  readonly timeField: { readonly id: string; readonly name: string } | null;
  readonly items: readonly BoardItem[];
}
