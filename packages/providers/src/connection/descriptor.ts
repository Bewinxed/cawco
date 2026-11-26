/**
 * The generic `connection` provider (provider spec §2.9): any connection's
 * read-only MCP tool, called on an interval as a connector poll, each item
 * in its answer a record keyed by the id and version its paths name. Its
 * watch's settings hold the call (`tool`, `args`, `intervalS`) and the
 * paths (`itemsPath`, `idPath`, `versionPath`); a record's container is
 * its watch's id. Pure: no SDK.
 */

/** How a relay's sender signs, as its watch's settings hold it (connection/webhook.ts). */
export const HOOK_SCHEMES = [
  "stripe",
  "hmac-header",
  "standard-webhooks",
] as const;
export type HookScheme = (typeof HOOK_SCHEMES)[number];

/** The shortest interval a connector poll takes, s: the one poll loop's period. */
// @limit measured: the Projects PRD's one poll loop reads every watch each 60 s (.design-foundations/plans/2026-10-06-projects.md:585); a connector poll is due no sooner than the others
export const CONNECTOR_MIN_S = 60;

/** A connector poll's call and paths, as its watch's settings hold them. */
export interface ConnectorCall {
  args: Record<string, unknown>;
  /** A dot path to each item's id. */
  idPath: string;
  /** Seconds between calls, {@link CONNECTOR_MIN_S} or more. */
  intervalS: number;
  /** A dot path to the array of items in the answer; empty: the answer is the array. */
  itemsPath: string;
  tool: string;
  /** A dot path to each item's version (`updated_at`). */
  versionPath: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A watch's settings read as its connector poll's call. */
export const connectorCallOf = (settings: object): ConnectorCall => {
  const read = new Map<string, unknown>(Object.entries(settings));
  const text = (field: string): string => {
    const value = read.get(field);
    return typeof value === "string" ? value : "";
  };
  const args = read.get("args");
  const intervalS = read.get("intervalS");
  return {
    tool: text("tool"),
    args: isObject(args) ? args : {},
    intervalS: typeof intervalS === "number" ? intervalS : CONNECTOR_MIN_S,
    itemsPath: text("itemsPath"),
    idPath: text("idPath"),
    versionPath: text("versionPath"),
  };
};

/** What an event route's source pattern matches of a connector poll: `conn:<connection>:<tool>`. */
export const connectionSource = (connection: string, tool: string): string =>
  `conn:${connection}:${tool}`;

/** A value at a dot path (`fields.version`); the whole value for an empty path. */
export const valueAt = (value: unknown, path: string): unknown =>
  path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>(
      (into, part) =>
        isObject(into)
          ? new Map<string, unknown>(Object.entries(into)).get(part)
          : undefined,
      value
    );

/** A scalar as a key part; anything else is no id. A part is bounded only by its item: its columns are unbounded text. */
export const keyPart = (value: unknown): string | undefined =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
