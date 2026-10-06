// The document as a typed tree. Anything that is not a valid document never becomes a Tree,
// so the code that writes to the file system cannot see an invalid value (RFC J2D-1 §4, §6).

export type Entry =
  | { readonly kind: "dir"; readonly entries: ReadonlyMap<string, Entry> }
  | { readonly kind: "file"; readonly content: string }
  | { readonly kind: "script"; readonly content: string }
  | { readonly kind: "link"; readonly target: string };

export type Dir = Extract<Entry, { kind: "dir" }>;

export class InvalidDocument extends Error {}

const invalid = (where: string, message: string): never => {
  throw new InvalidDocument(`${where}: ${message}`);
};

// §3: decode strict UTF-8 and parse strict JSON. JSON.parse rejects comments, trailing commas,
// NaN/Infinity and trailing data; a leading BOM is ignored, as §3 allows.
export function parse(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return invalid("input", "not valid UTF-8");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    return invalid("input", `not valid JSON (${(e as Error).message})`);
  }
}

// §3.5: a string with an unpaired surrogate cannot be encoded as UTF-8.
function wellFormed(s: string, where: string): string {
  return s.isWellFormed() ? s : invalid(where, "string contains an unpaired surrogate");
}

// §4.2.1: only simple names. Trailing "/" and "/." forms are rejected rather than trimmed.
function simpleName(name: string, where: string): string {
  if (name === "" || name === "." || name === ".." || name.includes("/") || name.includes("\0"))
    invalid(where, `invalid name ${JSON.stringify(name)}`);
  return wellFormed(name, where);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function entry(value: unknown, where: string): Entry {
  if (typeof value === "string") return { kind: "file", content: wellFormed(value, where) };
  if (isObject(value)) return dir(value, where);
  if (Array.isArray(value)) {
    const [kind, payload] = value as unknown[];
    if (value.length !== 2 || typeof kind !== "string" || typeof payload !== "string")
      return invalid(where, 'an array must be ["link", target] or ["script", content]');
    if (kind === "script") return { kind: "script", content: wellFormed(payload, where) };
    if (kind !== "link") return invalid(where, `unknown array kind ${JSON.stringify(kind)}`);
    // §10: such a link cannot be created; reject it before anything is written.
    if (payload.includes("\0")) invalid(where, "a link target cannot contain NUL");
    return { kind: "link", target: wellFormed(payload, where) };
  }
  return invalid(where, `${value === null ? "null" : typeof value} values are not allowed`);
}

// Members in ascending order of the UTF-8 bytes of their names, like the reference.
const byUtf8 = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));

function dir(object: Record<string, unknown>, where: string): Dir {
  const entries = new Map<string, Entry>();
  for (const name of Object.keys(object).sort(byUtf8)) {
    const path = where === "." ? name : `${where}/${name}`;
    entries.set(simpleName(name, path), entry(object[name], path));
  }
  return { kind: "dir", entries };
}

// §4.1: the root must be an object.
export function toTree(document: unknown): Dir {
  return isObject(document) ? dir(document, ".") : invalid("input", "the root of the document must be an object");
}
