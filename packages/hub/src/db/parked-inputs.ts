/**
 * Migration 0434's step, run in code just before its SQL: every parked
 * ask's call input (`parked_asks.envelope`'s `payload.input`, the one copy
 * of an agent's tool input the hub kept on disk whole) sealed with the
 * hub's key into the column 0433 added (`input_sealed`, secret-box.ts), and
 * the envelope kept as every screen reads it (redactor.ts `redactedAsk`: its
 * input hidden as its card shows it, every string's credentials cut). 0434
 * then holds every row to a sealed input. SQL cannot seal, so this step
 * holds the key.
 *
 * An envelope that does not read as an ask keeps its sealed input all the
 * same (whatever `payload.input` held, `null` when nothing), and its stored
 * envelope loses its input (`{}`) and every credential in its other words:
 * the hub reads it as it read it before, and an Approve of it finds an
 * input that does not open to an object and withdraws it (pending.ts
 * `asAsked`). Nothing is dropped.
 *
 * The plain bytes the rewrite leaves in the file's freed pages go at the
 * same start: seal-at-rest.ts rewrites the file (VACUUM) after any start in
 * which this step moved a value ({@link movedOutOfPlain}).
 *
 * Nothing secret is logged, plain or sealed: each line names a row by its
 * request id. {@link parkedInputsToSeal} counts the rows on a copy before
 * 0434 runs, with no key (scripts/parked-inputs.ts).
 */
import type { Database } from "bun:sqlite";
import { ParkedAskShape } from "@cawco/core/stored-shapes";
import { passedValue, redacted, redactedAsk } from "../redactor";
import { hubSecrets } from "../secret-box";
import { movedOutOfPlain } from "./seal-at-rest";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** What `raw` (an envelope as stored) parses to, or null when it is not JSON. */
const parsed = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** A stored envelope as every screen reads it, and the input it held. */
const sealedRow = (
  raw: string
): { envelope: string; input: unknown; reads: boolean } => {
  const stored = parsed(raw);
  const payload = isRecord(stored) ? stored.payload : undefined;
  const input = isRecord(payload) ? (payload.input ?? null) : null;
  const ask = ParkedAskShape.safeParse(stored);
  if (ask.success) {
    return {
      envelope: JSON.stringify(passedValue(redactedAsk(ask.data))),
      input,
      reads: true,
    };
  }
  const bare = isRecord(stored)
    ? {
        ...stored,
        payload: { ...(isRecord(payload) ? payload : {}), input: {} },
      }
    : { payload: { input: {} } };
  let kept: unknown;
  try {
    kept = passedValue(redacted(bare));
  } catch {
    // Its payload says it is an ask and does not read as one: the redactor
    // sends none such, so it is kept with no payload words at all.
    kept = passedValue(redacted({ ...bare, payload: { input: {} } }));
  }
  return { envelope: JSON.stringify(kept), input, reads: false };
};

/** Every parked ask whose input is not sealed yet: none before 0433 adds the column is sealed. */
export const parkedInputsToSeal = (
  client: Database
): { requestId: string; envelope: string }[] => {
  const sealed = client
    .query<{ there: number }, []>(
      "SELECT count(*) AS there FROM pragma_table_info('parked_asks') WHERE name = 'input_sealed'"
    )
    .get();
  return client
    .query<{ requestId: string; envelope: string }, []>(
      sealed?.there
        ? "SELECT request_id AS requestId, envelope FROM parked_asks WHERE input_sealed IS NULL"
        : "SELECT request_id AS requestId, envelope FROM parked_asks"
    )
    .all();
};

/** Seals every parked ask's input in place (module); answers how many. Run only in a start that applies 0434 (db/migrate.ts). */
export const sealParkedInputs = (client: Database): number => {
  const rows = parkedInputsToSeal(client);
  const update = client.query(
    "UPDATE parked_asks SET envelope = ?, input_sealed = ? WHERE request_id = ?"
  );
  for (const { requestId, envelope } of rows) {
    const row = sealedRow(envelope);
    update.run(
      row.envelope,
      hubSecrets().seal(JSON.stringify(row.input)),
      requestId
    );
    if (!row.reads) {
      console.warn(
        `[migrations] 0434: parked ask ${requestId} does not read as an ask; its input sealed as stored and its envelope kept without it, so an Approve of it withdraws it`
      );
    }
  }
  movedOutOfPlain(rows.length);
  return rows.length;
};
