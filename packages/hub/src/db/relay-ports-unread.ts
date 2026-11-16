/**
 * Before migration 0416's SQL runs, the hub's log names every proof of the
 * stream relay whose stored chips (`stream_relay_proofs.ports`, which of
 * the relay's URLs answered on a device, as JSON) and the relay whose stored
 * ports (`stream_relay.ports`, what its machine has bound) 0416 keeps as not
 * read: a value that is there and does not read whole as the hub read it,
 * with why.
 *
 * The predicates below are 0416's own: its SQL was written from them, over
 * the JSON columns as they stand before it. {@link CHIPS} and
 * {@link PORTS} are the columns' shapes as the hub read them then, frozen
 * here: a proof's chips are those its writers make (core `portNameOf`), a
 * relay's ports core `RelayPorts`. {@link relayPortsKept} reads every row
 * with them, for the count taken on a copy before 0416 runs
 * (scripts/continuations-moves-relay.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import {
  FLAG,
  inJson,
  listOf,
  object,
  oneOf,
  readsWhole,
  shown,
} from "./json-reads";

/** A proof's chips, as `stream_relay_proofs.ports` held them: a list of the relay URLs' chips (core `RelayPortName`). */
const CHIPS = listOf(oneOf("udp 3478", "tcp 3478", "tls 5349"));

/** The relay's ports, as `stream_relay.ports` held them (core `RelayPorts`). */
const PORTS = object({ tcp: FLAG, tls: FLAG, udp: FLAG });

/** A proof's chips read whole: a list, each entry one of the relay URLs' chips. */
const CHIPS_READ = readsWhole("ports", CHIPS);

/** The relay's ports read whole: whether each of its three listeners is bound. */
const PORTS_READ = readsWhole("ports", PORTS);

/** What a stored value is to 0416. */
export type PortsReading =
  /** Never set: a relay no frame has said, or a proof that answered nothing. */
  | { kind: "never" }
  /** It reads whole and is placed as it is. */
  | { kind: "placed" }
  /** It does not read whole: kept as stored, none of it placed. */
  | { kind: "unread"; why: string };

/** One row 0416 reads: a device's proof or the relay, its value as stored, and what 0416 makes of it. */
export interface KeptPorts {
  /** The proof's device, or the relay's row. */
  id: string;
  raw: string | null;
  reading: PortsReading;
  table: "stream_relay" | "stream_relay_proofs";
}

interface Row {
  empty: number | null;
  id: string;
  json: number | null;
  raw: string | null;
  reads: number;
}

const readingOf = (row: Row, why: string): PortsReading => {
  if (row.raw === null || row.empty) {
    return { kind: "never" };
  }
  if (row.reads) {
    return { kind: "placed" };
  }
  return { kind: "unread", why: row.json === 0 ? "it is not JSON" : why };
};

/** Every proof's chips and the relay's ports as 0416 reads them. Run on a database 0416 has not run on. */
export const relayPortsKept = (client: Database): KeptPorts[] => [
  ...client
    .query<Row, []>(
      `SELECT device_id AS id, CAST(ports AS TEXT) AS raw, CASE WHEN json_valid(ports) THEN 1 ELSE 0 END AS json, ${CHIPS_READ} AS reads, ${inJson("ports", `CASE WHEN ${CHIPS_READ} THEN json_array_length(ports) = 0 END`)} AS empty FROM stream_relay_proofs ORDER BY at, device_id`
    )
    .all()
    .map((row) => ({
      table: "stream_relay_proofs" as const,
      id: row.id,
      raw: row.raw,
      reading: readingOf(
        row,
        "it is not a list of the relay URLs' chips (udp 3478, tcp 3478, tls 5349)"
      ),
    })),
  ...client
    .query<Row, []>(
      `SELECT id, CAST(ports AS TEXT) AS raw, CASE WHEN ports IS NULL THEN NULL WHEN json_valid(ports) THEN 1 ELSE 0 END AS json, ${PORTS_READ} AS reads, 0 AS empty FROM stream_relay ORDER BY id`
    )
    .all()
    .map((row) => ({
      table: "stream_relay" as const,
      id: row.id,
      raw: row.raw,
      reading: readingOf(
        row,
        "it is not whether UDP, TCP and TLS are each bound, true or false"
      ),
    })),
];

/** Logs every value 0416 keeps as not read, one line each. Run only in a start that applies 0416 (db/migrate.ts). */
export const logRelayPortsUnread = (client: Database): void => {
  for (const row of relayPortsKept(client)) {
    if (row.reading.kind !== "unread" || row.raw === null) {
      continue;
    }
    console.info(
      row.table === "stream_relay_proofs"
        ? `[migrations] 0416: the stream relay's proof from ${row.id}: its chips ${shown(row.raw)} do not read: ${row.reading.why}; kept as not read, it proves no port, and the device proves the relay again`
        : `[migrations] 0416: the stream relay ${row.id}: its ports ${shown(row.raw)} do not read: ${row.reading.why}; kept as not read, none placed until its machine's next frame says them`
    );
  }
};
