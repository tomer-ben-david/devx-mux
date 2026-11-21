/** Any value JSON can hold. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export function parseJson(text: string, source: string): JsonValue {
  try {
    const value: JsonValue = JSON.parse(text);
    return value;
  } catch (error) {
    throw new Error(`${source} did not return JSON: ${text.slice(0, 300)}`, { cause: error });
  }
}

/**
 * Reads external JSON at the boundary. Every accessor checks the type it promises and fails with the JSON path,
 * so a changed or unexpected response is reported where it enters instead of surfacing later as a wrong value.
 */
export class JsonReader {
  constructor(private readonly value: JsonValue, private readonly source: string, private readonly path = "$") {}

  /** The named member; fails when it is missing. */
  field(name: string): JsonReader {
    const member = this.object()[name];
    if (member === undefined) throw this.mismatch(`member "${name}"`, "nothing");
    return new JsonReader(member, this.source, `${this.path}.${name}`);
  }

  /** The named member, or null when it is missing or JSON null (GraphQL omits fields of fragments that did not match). */
  optionalField(name: string): JsonReader | null {
    const member = this.object()[name];
    return member === undefined || member === null ? null : new JsonReader(member, this.source, `${this.path}.${name}`);
  }

  /** The value itself, for handing on to another reader. */
  raw(): JsonValue {
    return this.value;
  }

  string(): string {
    if (typeof this.value !== "string") throw this.mismatch("a string", describe(this.value));
    return this.value;
  }

  number(): number {
    if (typeof this.value !== "number") throw this.mismatch("a number", describe(this.value));
    return this.value;
  }

  boolean(): boolean {
    if (typeof this.value !== "boolean") throw this.mismatch("a boolean", describe(this.value));
    return this.value;
  }

  array(): readonly JsonReader[] {
    if (!isJsonArray(this.value)) throw this.mismatch("an array", describe(this.value));
    return this.value.map((element: JsonValue, index: number) => new JsonReader(element, this.source, `${this.path}[${index}]`));
  }

  private object(): JsonObject {
    if (this.value === null || typeof this.value !== "object" || isJsonArray(this.value)) throw this.mismatch("an object", describe(this.value));
    return this.value;
  }

  private mismatch(expected: string, found: string): Error {
    return new Error(`${this.source}: expected ${expected} at ${this.path}, found ${found}.`);
  }
}

/** `Array.isArray` does not narrow readonly arrays; this guard does. */
function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function describe(value: JsonValue): string {
  if (value === null) return "null";
  if (isJsonArray(value)) return "an array";
  return typeof value === "object" ? "an object" : `${typeof value} ${JSON.stringify(value).slice(0, 40)}`;
}
