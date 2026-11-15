/**
 * Migration 0420's move, run in code just before its SQL: what a connection
 * held (`connections.sealed`) and a fleet MCP server's sign-in under way
 * (`fleet_mcp_oauth.pending`) were each one value sealed with the hub's key,
 * plain facts and secrets together, so the hub opened every row to match or
 * filter on a fact. SQL cannot open a sealed value, so this step opens each
 * one with the hub's key, places its plain facts in the columns 0419 added
 * and seals each secret alone (`connection_secrets`, `pending_verifier`);
 * 0420 then drops the two old columns. The rows the trash keeps
 * (`config_trash.rows` of a connection or an MCP server) move the same way,
 * so one put back is in the new shape.
 *
 * A value is read as the hub read it: opened with the hub's key (one kept
 * as plain text, from before secrets were sealed, is read as it is), then
 * held to the column's shape as it stood, frozen here ({@link HELD},
 * {@link PENDING}) and said in SQL by db/json-reads.ts, every JSON function
 * inside a CASE that proved the value JSON. The provider's token response
 * and the SDK's client record, kept whole, are held to the schemas their
 * new sealed columns read them with, which check in code what SQL cannot
 * (a URL's form, a coerced number).
 *
 * Present and not readable (it does not open with the hub's key, or opens
 * to something that does not read whole) places nothing: no fact, no secret.
 * It is kept as it was stored, sealed, in `sealed_unread` or
 * `pending_unread`, and logged by its row's id. A connection kept so reads
 * as not signed in, its reason saying why (core words
 * `connectionReasons.savedUnread`), until it is signed in again; a sign-in
 * under way kept so matches no redirect.
 *
 * A value kept so is read again at every start, with the same placement
 * ({@link placeSealedFacts} `unread`): once the hub's key opens it (the key
 * file it was sealed under put back), it is placed as 0420 would have
 * placed it.
 *
 * Nothing secret is logged, plain or sealed: each line names a row by its id.
 * {@link sealedFactsKept} reads every row, for the count taken on a copy
 * before 0420 runs (scripts/sealed-facts.ts).
 */
import type { Database } from "bun:sqlite";
import { connectionReasons } from "@cawco/core/words/connection-reasons";
import { z } from "zod";
import { hubSecrets, isSealed, type SecretBox } from "../secret-box";
import {
  inJson,
  type JsonShape,
  literal,
  NUMBER,
  nullable,
  object,
  oneOf,
  readsWhole,
  TEXT,
} from "./json-reads";
import type { Reading } from "./lifted-reading";
import {
  OAuthClientInformationFullSchema,
  OAuthClientInformationMixedSchema,
  OAuthTokensSchema,
  TrashedRowsSchema,
} from "./stored-shapes";

/** The migration whose SQL this step runs before, as its log names it. */
const AT = "0420";

/** An object kept whole, checked in code ({@link CHECKED_IN_CODE}). */
const RECORD: JsonShape = { type: "object" };

/** What a connection held (`connections.sealed`, `ConnectionSecret`), each key as it stood. */
const HELD_FIELDS: Record<string, JsonShape> = {
  app: {
    anyOf: [
      object(
        { appId: TEXT, privateKey: TEXT, service: literal("github") },
        {
          clientId: TEXT,
          clientSecret: TEXT,
          installationId: TEXT,
          slug: TEXT,
          webhookSecret: TEXT,
        }
      ),
      object({
        clientId: TEXT,
        clientSecret: TEXT,
        service: literal("linear"),
      }),
    ],
  },
  client: RECORD,
  device: object({
    deviceCode: TEXT,
    expiresAt: NUMBER,
    interval: NUMBER,
    userCode: TEXT,
    verificationUri: TEXT,
  }),
  gh: object({ host: TEXT, login: TEXT, machineId: TEXT }),
  key: TEXT,
  org: TEXT,
  tokens: RECORD,
  verifier: TEXT,
};
const HELD = object({}, HELD_FIELDS);

/** A sign-in under way (`fleet_mcp_oauth.pending`), each key as it stood. */
const PENDING_REQUIRED: Record<string, JsonShape> = {
  client: RECORD,
  expiresAt: NUMBER,
  redirectUri: TEXT,
  state: TEXT,
  verifier: TEXT,
};
const PENDING_OPTIONAL: Record<string, JsonShape> = {
  access: nullable(oneOf("read", "write")),
};
const PENDING = object(PENDING_REQUIRED, PENDING_OPTIONAL);

/** What each key must be, for a reason. */
const WHAT: Record<string, string> = {
  app: "a GitHub App's or a Linear app's registration",
  client: "an OAuth client record",
  device: "a code sign-in (device code, user code, where, when, how often)",
  gh: "a machine's gh account (machine, host, login)",
  key: "text",
  org: "text",
  tokens: "an OAuth token response",
  verifier: "text",
  expiresAt: "a time",
  redirectUri: "text",
  state: "text",
  access: "read, write or null",
};

/**
 * The records kept whole, held to the schemas their new columns read them
 * with: a value SQL proves an object and these refuse would throw on its
 * first read.
 */
const CHECKED_IN_CODE: Record<string, z.ZodType> = {
  tokens: OAuthTokensSchema,
  client: OAuthClientInformationMixedSchema,
};

/** The schema a sign-in under way's client was read with. */
const PENDING_CLIENT: z.ZodType = OAuthClientInformationFullSchema;

/** `key` of `?1`, the opened value, holds `shape`, or is missing when `required` is false: SQL, inside CASEs that proved it a JSON object. */
const fieldReads = (key: string, shape: JsonShape, required: boolean) =>
  inJson(
    "?1",
    `CASE WHEN json_type(?1) = 'object' THEN (${required ? "" : `json_type(?1, '$.${key}') IS NULL OR `}${readsWhole(`(?1 -> '$.${key}')`, shape)}) ELSE 0 END`
  );

/** `path` of `?1` as stored (a record as its JSON text), once `?1` is JSON. */
const at = (path: string): string =>
  inJson("?1", `json_extract(?1, '$.${path}')`);

/** What one opened value's SQL read selects: whether it reads, why not, and its parts. */
type Selected = Record<string, string | number | null>;

/** A SELECT over the opened value `?1`: whether it is JSON, an object, reads whole as `shape`, each field's reading and each of `parts`. */
const selectOf = (
  shape: JsonShape,
  fields: Record<string, { shape: JsonShape; required: boolean }>,
  parts: Record<string, string>
): string =>
  [
    "SELECT CASE WHEN json_valid(?1) THEN 1 ELSE 0 END AS json",
    `${inJson("?1", "json_type(?1) = 'object'")} AS object`,
    `${readsWhole("?1", shape)} AS reads`,
    ...Object.entries(fields).map(
      ([key, one]) =>
        `${fieldReads(key, one.shape, one.required)} AS "field:${key}"`
    ),
    ...Object.entries(parts).map(([name, path]) => `${at(path)} AS "${name}"`),
  ].join(", ");

const HELD_SELECT = selectOf(
  HELD,
  Object.fromEntries(
    Object.entries(HELD_FIELDS).map(([key, shape]) => [
      key,
      { shape, required: false },
    ])
  ),
  {
    gh_machine_id: "gh.machineId",
    gh_host: "gh.host",
    gh_login: "gh.login",
    org: "org",
    app_service: "app.service",
    app_id: "app.appId",
    app_slug: "app.slug",
    app_client_id: "app.clientId",
    app_installation_id: "app.installationId",
    device_user_code: "device.userCode",
    device_verification_uri: "device.verificationUri",
    device_expires_at: "device.expiresAt",
    device_interval: "device.interval",
    key: "key",
    tokens: "tokens",
    client: "client",
    verifier: "verifier",
    app_private_key: "app.privateKey",
    app_client_secret: "app.clientSecret",
    app_webhook_secret: "app.webhookSecret",
    device_code: "device.deviceCode",
  }
);

const PENDING_SELECT = selectOf(
  PENDING,
  {
    ...Object.fromEntries(
      Object.entries(PENDING_REQUIRED).map(([key, shape]) => [
        key,
        { shape, required: true },
      ])
    ),
    ...Object.fromEntries(
      Object.entries(PENDING_OPTIONAL).map(([key, shape]) => [
        key,
        { shape, required: false },
      ])
    ),
  },
  {
    pending_state: "state",
    pending_redirect_uri: "redirectUri",
    pending_expires_at: "expiresAt",
    pending_access: "access",
    pending_verifier: "verifier",
    client: "client",
  }
);

/** A connection's facts, by the column each is placed in. */
const FACT_COLUMNS = [
  "gh_machine_id",
  "gh_host",
  "gh_login",
  "org",
  "app_service",
  "app_id",
  "app_slug",
  "app_client_id",
  "app_installation_id",
  "device_user_code",
  "device_verification_uri",
  "device_expires_at",
  "device_interval",
] as const;

/** A connection's secrets, by their `connection_secrets` column, each sealed alone. */
const SECRET_COLUMNS = [
  "key",
  "tokens",
  "client",
  "verifier",
  "app_private_key",
  "app_client_secret",
  "app_webhook_secret",
  "device_code",
] as const;

/** A sign-in under way's plain columns; its verifier is sealed alone. */
const PENDING_COLUMNS = [
  "pending_state",
  "pending_redirect_uri",
  "pending_expires_at",
  "pending_access",
] as const;

type Value = string | number | null;

/** What one value places: its plain columns, and its secrets as plain text (sealed as they are written). */
export interface Placed {
  plain: Record<string, Value>;
  secrets: Record<string, string | null>;
}

/** One sealed value as 0420 reads it: its row, and what it makes of it. */
export interface Kept {
  /** The row's id: a connection's, or an MCP server's name. */
  id: string;
  /** What it places, when it reads. */
  placed?: Placed;
  /** The value as stored, kept as `*_unread` when it does not read. */
  raw: Value;
  reading: Reading;
  /** The trash entry it is kept in; absent for a live row. */
  trash?: number;
}

/** The opened text of `raw`, or why there is none. */
const openedOf = (
  raw: Value,
  box: () => SecretBox
): { text: string } | { why: string } => {
  if (typeof raw !== "string") {
    return { why: "it is not text" };
  }
  if (!isSealed(raw)) {
    // Kept before secrets were sealed (seal-at-rest.ts): read as it is.
    return { text: raw };
  }
  try {
    return { text: box().open(raw) };
  } catch {
    return { why: "it does not open with the hub's key" };
  }
};

/** Why a value that opened does not read: not JSON, not an object, else each field that is off. */
const whyOf = (row: Selected, fieldsOff: string[]): string => {
  if (row.json === 0) {
    return "it is not JSON";
  }
  if (row.object !== 1) {
    return "it is not an object";
  }
  return fieldsOff
    .map((key) => `${key} is not ${WHAT[key] ?? "its shape"}`)
    .join(", ");
};

/** The fields `row` says are off, by SQL, then by the schemas that check in code. */
const offOf = (row: Selected, checked: Record<string, z.ZodType>): string[] => {
  const off = Object.keys(row)
    .filter((name) => name.startsWith("field:") && row[name] !== 1)
    .map((name) => name.slice("field:".length));
  for (const [key, schema] of Object.entries(checked)) {
    const text = row[key];
    if (
      typeof text === "string" &&
      !off.includes(key) &&
      !schema.safeParse(JSON.parse(text)).success
    ) {
      off.push(key);
    }
  }
  return off;
};

/** Reads one sealed value: never set, placed with what `place` makes of its SQL row, or restrictive and why. */
const readOne = (
  client: Database,
  raw: Value,
  box: () => SecretBox,
  select: string,
  checked: Record<string, z.ZodType>,
  place: (row: Selected) => Placed
): { reading: Reading; placed?: Placed } => {
  if (raw === null) {
    return { reading: { kind: "unset" } };
  }
  const opened = openedOf(raw, box);
  if ("why" in opened) {
    return { reading: { kind: "restrictive", why: opened.why } };
  }
  const row = client.query<Selected, [string]>(select).get(opened.text);
  if (!row) {
    return { reading: { kind: "restrictive", why: "it does not read" } };
  }
  const off = row.object === 1 ? offOf(row, checked) : [];
  if (row.reads !== 1 || off.length > 0) {
    return { reading: { kind: "restrictive", why: whyOf(row, off) } };
  }
  return { reading: { kind: "placed" }, placed: place(row) };
};

/** `row`'s text part `name`, or null. */
const textOf = (row: Selected, name: string): string | null => {
  const value = row[name];
  return typeof value === "string" ? value : null;
};

/** Each of `names` from `row`, as stored. */
const pick = (row: Selected, names: readonly string[]) =>
  Object.fromEntries(names.map((name) => [name, row[name] ?? null]));

/** A connection's facts and secrets, as its row read them. */
const placeHeld = (row: Selected): Placed => ({
  plain: pick(row, FACT_COLUMNS),
  secrets: Object.fromEntries(
    SECRET_COLUMNS.map((name) => [name, textOf(row, name)])
  ),
});

/** A sign-in under way's columns and its verifier; its client is `client`, kept by the same write, and is not placed. */
const placePending = (row: Selected): Placed => ({
  plain: pick(row, PENDING_COLUMNS),
  secrets: { pending_verifier: textOf(row, "pending_verifier") },
});

/** What a connection held, read: never set, placed or restrictive. */
const readHeld = (client: Database, raw: Value, box: () => SecretBox) =>
  readOne(client, raw, box, HELD_SELECT, CHECKED_IN_CODE, placeHeld);

/** A sign-in under way, read; its state another's already placed is no sign-in of its own. */
const readPending = (
  client: Database,
  raw: Value,
  box: () => SecretBox,
  states: Set<string>
) => {
  const read = readOne(
    client,
    raw,
    box,
    PENDING_SELECT,
    { client: PENDING_CLIENT },
    placePending
  );
  const state = read.placed?.plain.pending_state;
  if (typeof state !== "string") {
    return read;
  }
  if (states.has(state)) {
    return {
      reading: {
        kind: "restrictive" as const,
        why: "its state is another sign-in's",
      },
    };
  }
  states.add(state);
  return read;
};

/** The trash's entries, each as its rows parse; one that does not parse is not the trash's to move here. */
const TrashRows = z.array(TrashedRowsSchema);

interface TrashEntry {
  id: number;
  kind: string;
  rows: z.output<typeof TrashRows>;
}

const trashEntries = (client: Database): TrashEntry[] =>
  client
    .query<{ id: number; kind: string; rows: string }, []>(
      "SELECT id, kind, rows FROM config_trash WHERE kind IN ('connection', 'mcp') ORDER BY id"
    )
    .all()
    .flatMap((entry) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(entry.rows);
      } catch {
        return [];
      }
      const rows = TrashRows.safeParse(parsed);
      return rows.success
        ? [{ id: entry.id, kind: entry.kind, rows: rows.data }]
        : [];
    });

/** The trash's connections and sign-ins under way, as 0420 reads them. */
const trashKept = (client: Database, box: () => SecretBox): SealedFacts => {
  const connections: Kept[] = [];
  const pending: Kept[] = [];
  for (const entry of trashEntries(client)) {
    for (const part of entry.rows) {
      for (const row of part.rows) {
        if (part.table === "connections" && typeof row.id === "string") {
          const raw = row.sealed ?? null;
          connections.push({
            id: row.id,
            raw,
            trash: entry.id,
            ...readHeld(client, raw, box),
          });
        }
        if (part.table === "fleet_mcp_oauth" && typeof row.name === "string") {
          const raw = row.pending ?? null;
          pending.push({
            id: row.name,
            raw,
            trash: entry.id,
            ...readPending(client, raw, box, new Set()),
          });
        }
      }
    }
  }
  return { connections, pending };
};

/** Every connection's held value and every sign-in under way, live and in the trash, as 0420 reads them. */
export interface SealedFacts {
  connections: Kept[];
  pending: Kept[];
}

/**
 * Where the values read come from: `migration`, the sealed columns 0420
 * drops and the trash's rows, on a database 0420 has not run on; `unread`,
 * the live values 0420 kept as not read (`sealed_unread`, `pending_unread`),
 * on one it has, each read again with the hub's key as it is now. A
 * connection signed in since (it holds secrets) and a server whose new
 * sign-in is under way are not read again: what they hold now stands.
 */
export type SealedSource = "migration" | "unread";

const SOURCES: Record<
  SealedSource,
  { connections: string; pending: string; taken: string | null }
> = {
  migration: {
    connections: "SELECT id, sealed AS raw FROM connections ORDER BY id",
    pending:
      "SELECT name AS id, pending AS raw FROM fleet_mcp_oauth ORDER BY name",
    taken: null,
  },
  unread: {
    connections:
      "SELECT c.id, c.sealed_unread AS raw FROM connections c WHERE c.sealed_unread IS NOT NULL AND NOT EXISTS (SELECT 1 FROM connection_secrets s WHERE s.connection_id = c.id) ORDER BY c.id",
    pending:
      "SELECT name AS id, pending_unread AS raw FROM fleet_mcp_oauth WHERE pending_unread IS NOT NULL AND pending_state IS NULL ORDER BY name",
    taken:
      "SELECT pending_state AS state FROM fleet_mcp_oauth WHERE pending_state IS NOT NULL",
  },
};

/**
 * Every value `from` names, as 0420 reads them, with the hub's box (`box`,
 * asked for only when there is a sealed value to open).
 */
export const sealedFactsKept = (
  client: Database,
  box: () => SecretBox,
  from: SealedSource
): SealedFacts => {
  const source = SOURCES[from];
  // A state already placed on a live row is no other sign-in's.
  const states = new Set<string>(
    source.taken === null
      ? []
      : client
          .query<{ state: string }, []>(source.taken)
          .all()
          .map((row) => row.state)
  );
  const connections: Kept[] = client
    .query<{ id: string; raw: Value }, []>(source.connections)
    .all()
    .map((row) => ({
      id: row.id,
      raw: row.raw,
      ...readHeld(client, row.raw, box),
    }));
  const pending: Kept[] = client
    .query<{ id: string; raw: Value }, []>(source.pending)
    .all()
    .map((row) => ({
      id: row.id,
      raw: row.raw,
      ...readPending(client, row.raw, box, states),
    }));
  if (from === "migration") {
    const trashed = trashKept(client, box);
    connections.push(...trashed.connections);
    pending.push(...trashed.pending);
  }
  return { connections, pending };
};

/** `raw`, kept as not read: sealed as it was, or sealed now when it was plain text. */
const keptSealed = (raw: Value, box: () => SecretBox): string | null => {
  if (raw === null) {
    return null;
  }
  const text = String(raw);
  return isSealed(text) ? text : box().seal(text);
};

/** `secrets`, each sealed alone; null when none is there. */
const sealedEach = (
  secrets: Record<string, string | null>,
  box: () => SecretBox
): Record<string, string | null> | null => {
  if (Object.values(secrets).every((one) => one === null)) {
    return null;
  }
  return Object.fromEntries(
    Object.entries(secrets).map(([name, plain]) => [
      name,
      plain === null ? null : box().seal(plain),
    ])
  );
};

/** Where a value is, for its log line. */
const whereOf = (kept: Kept): string =>
  kept.trash === undefined ? "" : ` (trash entry ${kept.trash})`;

/** Logs each value 0420 keeps as not read, by its row's id and why. */
const logUnread = ({ connections, pending }: SealedFacts): void => {
  for (const kept of connections) {
    if (kept.reading.kind === "restrictive") {
      console.info(
        `[migrations] ${AT}: connection ${kept.id}${whereOf(kept)}: what it held does not read: ${kept.reading.why}; kept sealed as it was, nothing placed: it reads as not signed in until it is signed in again`
      );
    }
  }
  for (const kept of pending) {
    if (kept.reading.kind === "restrictive") {
      console.info(
        `[migrations] ${AT}: MCP server ${kept.id}${whereOf(kept)}: its sign-in under way does not read: ${kept.reading.why}; kept sealed as it was, nothing placed: no redirect matches it`
      );
    }
  }
};

/** A connection's row as the trash keeps it, moved: its facts placed, or kept as not read and not signed in. */
const movedConnectionRow = (
  row: Record<string, Value>,
  kept: Kept,
  box: () => SecretBox
): Record<string, Value> => {
  const { sealed: _sealed, ...rest } = row;
  const unread = kept.reading.kind === "restrictive";
  return {
    ...rest,
    ...Object.fromEntries(
      FACT_COLUMNS.map((name) => [name, kept.placed?.plain[name] ?? null])
    ),
    sealed_unread: unread ? keptSealed(kept.raw, box) : null,
    ...(unread
      ? { state: "needs-sign-in", reason: connectionReasons.savedUnread }
      : {}),
  };
};

/** A sign-in's row as the trash keeps it, moved. */
const movedPendingRow = (
  row: Record<string, Value>,
  kept: Kept,
  box: () => SecretBox
): Record<string, Value> => {
  const { pending: _pending, ...rest } = row;
  const verifier = kept.placed?.secrets.pending_verifier ?? null;
  return {
    ...rest,
    ...Object.fromEntries(
      PENDING_COLUMNS.map((name) => [name, kept.placed?.plain[name] ?? null])
    ),
    pending_verifier: verifier === null ? null : box().seal(verifier),
    pending_unread:
      kept.reading.kind === "restrictive" ? keptSealed(kept.raw, box) : null,
  };
};

/** Each trash entry of a connection or an MCP server in the new shape, rewritten. */
const moveTrash = (
  client: Database,
  facts: SealedFacts,
  box: () => SecretBox
): void => {
  const write = client.query<unknown, [string, number]>(
    "UPDATE config_trash SET rows = ? WHERE id = ?"
  );
  const keptOf = (kinds: Kept[], trash: number, id: string): Kept | undefined =>
    kinds.find((one) => one.trash === trash && one.id === id);
  for (const entry of trashEntries(client)) {
    const parts = entry.rows.flatMap((part) => {
      if (part.table === "connections") {
        const moved = part.rows.map((row) => {
          const kept =
            typeof row.id === "string"
              ? keptOf(facts.connections, entry.id, row.id)
              : undefined;
          return kept
            ? { row: movedConnectionRow(row, kept, box), kept }
            : { row, kept };
        });
        const secrets = moved.flatMap(({ kept }) => {
          const sealed = kept?.placed
            ? sealedEach(kept.placed.secrets, box)
            : null;
          return kept && sealed ? [{ connection_id: kept.id, ...sealed }] : [];
        });
        return [
          { table: part.table, rows: moved.map((one) => one.row) },
          ...(secrets.length > 0
            ? [{ table: "connection_secrets", rows: secrets }]
            : []),
        ];
      }
      if (part.table === "fleet_mcp_oauth") {
        return [
          {
            table: part.table,
            rows: part.rows.map((row) => {
              const kept =
                typeof row.name === "string"
                  ? keptOf(facts.pending, entry.id, row.name)
                  : undefined;
              return kept ? movedPendingRow(row, kept, box) : row;
            }),
          },
        ];
      }
      return [part];
    });
    write.run(JSON.stringify(parts), entry.id);
  }
};

/**
 * The live values of `kept` that place, each with its row's id; as 0420
 * runs (`from` `migration`), each that does not read is handed to `keep`
 * first, to be kept as not read. A value read again at a start that still
 * does not read is already kept: nothing is written for it.
 */
const livePlaced = (
  kept: readonly Kept[],
  from: SealedSource,
  keep: (one: Kept) => void
): (Placed & { id: string })[] =>
  kept.flatMap((one) => {
    if (one.trash !== undefined) {
      return [];
    }
    if (one.reading.kind === "restrictive" && from === "migration") {
      keep(one);
    }
    return one.placed ? [{ id: one.id, ...one.placed }] : [];
  });

/**
 * Each live connection's facts and secrets placed, what was kept as not
 * read let go and the reason it set taken back (its row looked at again);
 * as 0420 runs, what does not read kept as not read and the row not signed
 * in.
 */
const placeConnections = (
  client: Database,
  kept: readonly Kept[],
  box: () => SecretBox,
  from: SealedSource
): void => {
  const place = client.query<unknown, Value[]>(
    `UPDATE connections SET ${FACT_COLUMNS.map((name) => `${name} = ?`).join(", ")}, sealed_unread = NULL, state = CASE WHEN reason = ? THEN 'error' ELSE state END, reason = CASE WHEN reason = ? THEN ? ELSE reason END WHERE id = ?`
  );
  const insertSecrets = client.query<unknown, Value[]>(
    `INSERT INTO connection_secrets (connection_id, ${SECRET_COLUMNS.join(", ")}) VALUES (?, ${SECRET_COLUMNS.map(() => "?").join(", ")})`
  );
  const keep = client.query<unknown, Value[]>(
    "UPDATE connections SET sealed_unread = ?, state = 'needs-sign-in', reason = ? WHERE id = ?"
  );
  const placing = livePlaced(kept, from, (one) => {
    keep.run(keptSealed(one.raw, box), connectionReasons.savedUnread, one.id);
  });
  for (const { id, plain, secrets } of placing) {
    place.run(
      ...FACT_COLUMNS.map((name) => plain[name] ?? null),
      connectionReasons.savedUnread,
      connectionReasons.savedUnread,
      connectionReasons.notLookedAt,
      id
    );
    const sealed = sealedEach(secrets, box);
    if (sealed) {
      insertSecrets.run(
        id,
        ...SECRET_COLUMNS.map((name) => sealed[name] ?? null)
      );
    }
  }
};

/** Each live sign-in under way placed and what was kept as not read let go; as 0420 runs, what does not read kept as not read. */
const placePendings = (
  client: Database,
  kept: readonly Kept[],
  box: () => SecretBox,
  from: SealedSource
): void => {
  const place = client.query<unknown, Value[]>(
    `UPDATE fleet_mcp_oauth SET ${PENDING_COLUMNS.map((name) => `${name} = ?`).join(", ")}, pending_verifier = ?, pending_unread = NULL WHERE name = ?`
  );
  const keep = client.query<unknown, Value[]>(
    "UPDATE fleet_mcp_oauth SET pending_unread = ? WHERE name = ?"
  );
  const placing = livePlaced(kept, from, (one) => {
    keep.run(keptSealed(one.raw, box), one.id);
  });
  for (const { id, plain, secrets } of placing) {
    const verifier = secrets.pending_verifier ?? null;
    place.run(
      ...PENDING_COLUMNS.map((name) => plain[name] ?? null),
      verifier === null ? null : box().seal(verifier),
      id
    );
  }
};

/** One line for a start's read again: how many kept as not read now read and are placed, and how many still do not. */
const logReadAgain = ({ connections, pending }: SealedFacts): void => {
  if (connections.length + pending.length === 0) {
    return;
  }
  const placed = (kept: Kept[]) =>
    kept.filter((one) => one.reading.kind === "placed").length;
  console.info(
    `[sealed-facts] kept as not read since migration 0420: ${placed(connections)} of ${connections.length} connection(s) and ${placed(pending)} of ${pending.length} sign-in(s) under way read with the hub's key now and are placed; the rest still do not read and stay as they are`
  );
};

/**
 * The one placement of what a connection held and a sign-in under way,
 * read from `from` ({@link SealedSource}):
 *
 * - `migration`, before 0420's SQL (db/migrate.ts `sealed-facts`, inside
 *   its transaction: a key file that cannot be read stops the start with
 *   nothing applied): every live value placed, or kept as not read and
 *   logged by its row's id, and the trash's rows in the new shape;
 * - `unread`, at every start since (db/migrate.ts `sealed-facts-read-again`,
 *   in a transaction of its own): each value kept as not read read again
 *   with the hub's key as it is now (its old key file put back), placed
 *   exactly so when it reads, its `*_unread` let go and a connection's
 *   reason taken back when that value set it; one that still does not read
 *   stays, and the start says so in one line.
 */
export const placeSealedFacts = (
  client: Database,
  from: SealedSource
): void => {
  const box = (): SecretBox => hubSecrets();
  const facts = sealedFactsKept(client, box, from);
  if (from === "migration") {
    logUnread(facts);
  } else {
    logReadAgain(facts);
  }
  placeConnections(client, facts.connections, box, from);
  placePendings(client, facts.pending, box, from);
  if (from === "migration") {
    moveTrash(client, facts, box);
  }
};
