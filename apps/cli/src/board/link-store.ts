import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { BOARD_SCHEMA_VERSION, type BoardLinks, type BoardPointer } from "./models.js";

/** `$MUX_HOME` (default `~/.devx-mux`): machine-local DevX Mux state that must never be published. */
export function muxHomeDirectory(environment: NodeJS.ProcessEnv): string {
  const configured = environment["MUX_HOME"];
  return configured === undefined || configured === "" ? path.join(homedir(), ".devx-mux") : configured;
}

export function parsePointer(value: string, label: string | undefined, addedAt: string): BoardPointer {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Pointer "${value}" must look like KIND:VALUE, for example folder:/path/to/checkout or claude:<session id>.`);
  }
  return { kind: value.slice(0, separator), value: value.slice(separator + 1), ...(label === undefined ? {} : { label }), addedAt };
}

const LOCK_ATTEMPTS = 200;
const LOCK_RETRY_MILLIS = 10;

/**
 * Pointers from board items to machine-local work (sessions, conversations, folders), stored in one JSON file.
 * Every change is a locked read-modify-write followed by an atomic rename, so concurrent writers (an editor and
 * an agent skill, say) never lose each other's pointers and readers never see a partial file.
 */
export class BoardLinkStore {
  constructor(private readonly filePath: string) {}

  read(): BoardLinks {
    if (!existsSync(this.filePath)) return { schema: BOARD_SCHEMA_VERSION, items: {} };
    let parsed: { readonly schema?: unknown; readonly items?: unknown };
    try {
      parsed = JSON.parse(readFileSync(this.filePath, "utf8"));
    } catch (error) {
      throw new Error(`${this.filePath} is not valid JSON. Fix or remove it.`, { cause: error });
    }
    if (parsed.schema !== BOARD_SCHEMA_VERSION || typeof parsed.items !== "object" || parsed.items === null) {
      throw new Error(`${this.filePath} has schema ${String(parsed.schema)}; this DevX Mux reads schema ${BOARD_SCHEMA_VERSION}.`);
    }
    return { schema: BOARD_SCHEMA_VERSION, items: parsed.items as BoardLinks["items"] };
  }

  /** Adds a pointer to an item, or refreshes the label of one already linked. Returns the item's pointers. */
  link(itemId: string, pointer: BoardPointer): readonly BoardPointer[] {
    return this.update(itemId, (pointers) => {
      const existing = pointers.find((candidate) => samePointer(candidate, pointer));
      if (existing === undefined) return [...pointers, pointer];
      return pointers.map((candidate) => candidate === existing
        ? { ...existing, ...(pointer.label === undefined ? {} : { label: pointer.label }) }
        : candidate);
    });
  }

  /** Removes a pointer from an item. Returns the item's remaining pointers. */
  unlink(itemId: string, pointer: Pick<BoardPointer, "kind" | "value">): readonly BoardPointer[] {
    return this.update(itemId, (pointers) => {
      if (!pointers.some((candidate) => samePointer(candidate, pointer))) {
        throw new Error(`Item ${itemId} has no pointer ${pointer.kind}:${pointer.value}.`);
      }
      return pointers.filter((candidate) => !samePointer(candidate, pointer));
    });
  }

  private update(itemId: string, change: (pointers: readonly BoardPointer[]) => readonly BoardPointer[]): readonly BoardPointer[] {
    return this.withLock(() => {
      const links = this.read();
      const next = change(links.items[itemId] ?? []);
      const items = { ...links.items };
      if (next.length === 0) delete items[itemId];
      else items[itemId] = next;
      this.write({ schema: BOARD_SCHEMA_VERSION, items });
      return next;
    });
  }

  private write(links: BoardLinks): void {
    mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.filePath}.tmp-${process.pid}`;
    writeFileSync(temporaryPath, `${JSON.stringify(links, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporaryPath, this.filePath);
  }

  private withLock<T>(action: () => T): T {
    mkdirSync(path.dirname(this.filePath), { recursive: true, mode: 0o700 });
    const lockPath = `${this.filePath}.lock`;
    let descriptor: number | undefined;
    for (let attempt = 0; descriptor === undefined; attempt += 1) {
      try {
        descriptor = openSync(lockPath, "wx", 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (attempt >= LOCK_ATTEMPTS) {
          throw new Error(`${lockPath} has been held for over ${LOCK_ATTEMPTS * LOCK_RETRY_MILLIS} ms. If no mux board command is running, remove it.`);
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MILLIS);
      }
    }
    try {
      return action();
    } finally {
      closeSync(descriptor);
      rmSync(lockPath, { force: true });
    }
  }
}

function samePointer(left: Pick<BoardPointer, "kind" | "value">, right: Pick<BoardPointer, "kind" | "value">): boolean {
  return left.kind === right.kind && left.value === right.value;
}
