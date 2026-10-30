/**
 * Records made safe to commit as a preview's fixture (the primitives spec
 * §3, "The fixture tool"): every string of every record passed through the
 * credential filter first (the hub's `redactSecrets`, handed in, so this
 * module stays the dashboard's, the agent's and the hub's alike), then
 * emails, home paths, IPv4 addresses and tailnet names, and every id a
 * record carries (or any uuid left in its words) remapped to a short stable
 * one, the same across one call, so references inside the fixture still
 * agree. Each replacement is counted for the tool's answer. Dates and
 * titles are kept: they are the product's own words and its real ages.
 */
import { fnv1a } from "./fnv1a";

/** What a redaction replaced, by kind, as `records_fixture` says it. */
export interface RedactCounts {
  emails: number;
  hosts: number;
  ids: number;
  paths: number;
  secrets: number;
}

/** A short stable id for a real one: its kind, then fnv1a of the real id in hex, three figures (`tsk-7a2`). */
const shortId = (kind: string, id: string): string =>
  `${kind}-${fnv1a(id).toString(16).padStart(8, "0").slice(0, 3)}`;

/**
 * Each real id's short one ({@link shortId}), longer by a figure where two
 * would meet: a fixture's ids stay unique, so a list keyed by them draws.
 */
export function shortIds(
  kind: string,
  ids: readonly string[]
): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const id of ids) {
    const hash = fnv1a(id).toString(16).padStart(8, "0");
    let length = 3;
    let short = `${kind}-${hash.slice(0, length)}`;
    while (taken.has(short) && length < hash.length) {
      length += 1;
      short = `${kind}-${hash.slice(0, length)}`;
    }
    taken.add(short);
    out.set(id, short);
  }
  return out;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/gu;
const HOME = /\/(?:home|Users)\/[^/\s"'`]+/gu;
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu;
const TAILNET = /\b[\w-]+(?:\.[\w-]+)*\.ts\.net\b/gu;
const UUID =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/giu;
const ESCAPE = /[.*+?^${}()|[\]\\]/gu;

/** `text` with each `pattern` match replaced by `by`, how many counted on `counts[kind]`. */
const swap = (
  text: string,
  pattern: RegExp,
  by: (match: string) => string,
  counts: RedactCounts,
  kind: keyof RedactCounts
): string =>
  text.replace(pattern, (match) => {
    counts[kind] += 1;
    return by(match);
  });

/**
 * `records` with every string redacted (module header) and every id `ids`
 * names remapped to its short one, wherever it stands; a uuid `ids` doesn't
 * name is remapped too, and added to `ids`. Never changes `records`.
 */
export async function redactRecords<T>(
  records: T[],
  ids: Map<string, string>,
  secrets: (text: string) => Promise<string>
): Promise<{ counts: RedactCounts; records: T[] }> {
  const counts: RedactCounts = {
    emails: 0,
    hosts: 0,
    ids: 0,
    paths: 0,
    secrets: 0,
  };
  const known = [...ids.keys()].sort((a, b) => b.length - a.length);
  const named =
    known.length > 0
      ? new RegExp(
          `(?<![\\w-])(?:${known.map((id) => id.replace(ESCAPE, "\\$&")).join("|")})(?![\\w-])`,
          "gu"
        )
      : null;
  const text = async (value: string): Promise<string> => {
    const kept = await secrets(value);
    if (kept !== value) {
      counts.secrets += 1;
    }
    let out = swap(kept, EMAIL, () => "someone@example.com", counts, "emails");
    out = swap(out, HOME, () => "~", counts, "paths");
    out = swap(out, TAILNET, () => "<host>", counts, "hosts");
    out = swap(out, IPV4, () => "<host>", counts, "hosts");
    if (named) {
      out = swap(out, named, (id) => ids.get(id) ?? id, counts, "ids");
    }
    return swap(
      out,
      UUID,
      (id) => {
        const short = ids.get(id) ?? shortId("id", id);
        ids.set(id, short);
        return short;
      },
      counts,
      "ids"
    );
  };
  const walk = async (value: unknown): Promise<unknown> => {
    if (typeof value === "string") {
      return await text(value);
    }
    if (Array.isArray(value)) {
      return await Promise.all(value.map(walk));
    }
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, one] of Object.entries(value)) {
        out[key] = await walk(one);
      }
      return out;
    }
    return value;
  };
  const redacted: T[] = [];
  for (const record of records) {
    redacted.push((await walk(record)) as T);
  }
  return { records: redacted, counts };
}
