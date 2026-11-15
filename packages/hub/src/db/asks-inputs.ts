/**
 * Migration 0436's step, run in code just before its SQL: no ask the hub
 * keeps holds a call's input as it was asked in plain text, and keeping a
 * prompt as a permit opens nothing. SQL can neither seal nor digest, so
 * this step holds the hub's key:
 *
 * - **A parked ask** (`parked_asks`) gets the keyed digest of its call
 *   (`call_digest`, call-digest.ts), made from its sealed input (0434),
 *   opened here and nowhere else at run time but an Approve (pending.ts
 *   `asAsked`). One whose input does not open gets a digest no call has.
 * - **A permit** (`asks.kept`, kind `permit`) keeps the digest of the call
 *   it was asked for (`digest`) and the card's input in place of the call's
 *   own (card-input.ts `cardInput`): its session's next call is matched by
 *   the digest (asks.ts `granted`).
 * - **An approval** (`asks.kept`, kind `approve`) keeps the card's input,
 *   the call's own sealed beside it (`asks.input_sealed`), opened only when
 *   the approved call runs (asks.ts `carryOut`).
 *
 * A question keeps what it asked: its questions are the person's to read
 * and answer. A row whose record does not read (0408's `record_unread`) is
 * left for seal-at-rest.ts, which seals that column whole. The plain bytes
 * the rewrite leaves in the file's freed pages go at the same start
 * (seal-at-rest.ts `movedOutOfPlain`). Nothing secret is logged.
 */
import type { Database } from "bun:sqlite";
import { callDigest } from "../call-digest";
import { cardInput } from "../card-input";
import { hubSecrets } from "../secret-box";
import { isRecord, parsed } from "./parked-inputs";
import { movedOutOfPlain } from "./seal-at-rest";

/** A digest no call has: for a call whose input cannot be read. */
const noCall = (id: string): string => callDigest(`unread ${id}`, {});

/** A parked ask's call digest, from its sealed input opened here. */
const parkedDigest = (envelope: string, inputSealed: string, id: string) => {
  const stored = parsed(envelope);
  const payload = isRecord(stored) ? stored.payload : undefined;
  const tool = isRecord(payload) ? payload.toolName : undefined;
  let input: unknown;
  try {
    input = JSON.parse(hubSecrets().open(inputSealed));
  } catch {
    return noCall(id);
  }
  return typeof tool === "string" && isRecord(input)
    ? callDigest(tool, input)
    : noCall(id);
};

/** Every parked ask with no call digest yet, and every ask whose call's input is kept in plain text: their counts, read with no key. */
export const askInputsToSeal = (
  client: Database
): { parked: number; permits: number; approvals: number } => {
  const count = (sql: string): number =>
    client.query<{ n: number }, []>(sql).get()?.n ?? 0;
  const digested =
    count(
      "SELECT count(*) AS n FROM pragma_table_info('parked_asks') WHERE name = 'call_digest'"
    ) > 0;
  const sealedColumn =
    count(
      "SELECT count(*) AS n FROM pragma_table_info('asks') WHERE name = 'input_sealed'"
    ) > 0;
  // Before 0408 an ask is one JSON record, its kind inside it.
  const columns =
    count(
      "SELECT count(*) AS n FROM pragma_table_info('asks') WHERE name = 'kind'"
    ) > 0;
  const of = (kind: string): string =>
    columns
      ? `kind = '${kind}' AND kept IS NOT NULL`
      : `json_valid(record) AND json_extract(record, '$.asked.kind') = '${kind}'`;
  return {
    parked: count(
      `SELECT count(*) AS n FROM parked_asks${digested ? " WHERE call_digest IS NULL" : ""}`
    ),
    permits: count(`SELECT count(*) AS n FROM asks WHERE ${of("permit")}`),
    approvals: count(
      `SELECT count(*) AS n FROM asks WHERE ${of("approve")}${sealedColumn ? " AND input_sealed IS NULL" : ""}`
    ),
  };
};

/** A permit's or an approval's kept record rewritten (module), and the input to seal beside an approval. */
const keptRewritten = (
  id: string,
  kind: string,
  raw: string
): { kept: string; sealed: string | null } | undefined => {
  const kept = parsed(raw);
  const asked = isRecord(kept) ? kept.asked : undefined;
  if (!(isRecord(kept) && isRecord(asked) && typeof asked.tool === "string")) {
    return;
  }
  const input = isRecord(asked.input) ? asked.input : {};
  const shown = cardInput(asked.tool, input);
  if (kind === "permit") {
    const digest = isRecord(asked.input)
      ? callDigest(asked.tool, input)
      : noCall(id);
    return {
      kept: JSON.stringify({
        ...kept,
        asked: { ...asked, input: shown, digest },
      }),
      sealed: null,
    };
  }
  return {
    kept: JSON.stringify({ ...kept, asked: { ...asked, input: shown } }),
    sealed: hubSecrets().seal(JSON.stringify(input)),
  };
};

/** Digests every parked ask's call and rewrites every permit's and approval's record (module); answers how many of each. Run only in a start that applies 0436 (db/migrate.ts). */
export const sealAskInputs = (
  client: Database
): { parked: number; permits: number; approvals: number } => {
  const parkedRows = client
    .query<{ id: string; envelope: string; inputSealed: string }, []>(
      "SELECT request_id AS id, envelope, input_sealed AS inputSealed FROM parked_asks WHERE call_digest IS NULL"
    )
    .all();
  const digestParked = client.query(
    "UPDATE parked_asks SET call_digest = ? WHERE request_id = ?"
  );
  for (const row of parkedRows) {
    digestParked.run(
      parkedDigest(row.envelope, row.inputSealed, row.id),
      row.id
    );
  }
  const askRows = client
    .query<{ id: string; kind: string; kept: string }, []>(
      "SELECT id, kind, kept FROM asks WHERE kind IN ('permit', 'approve') AND kept IS NOT NULL"
    )
    .all();
  const rewrite = client.query(
    "UPDATE asks SET kept = ?, input_sealed = ? WHERE id = ?"
  );
  const done = { parked: parkedRows.length, permits: 0, approvals: 0 };
  for (const row of askRows) {
    const rewritten = keptRewritten(row.id, row.kind, row.kept);
    if (!rewritten) {
      console.warn(
        `[migrations] 0436: ask ${row.id}'s record does not read; left as stored`
      );
      continue;
    }
    rewrite.run(rewritten.kept, rewritten.sealed, row.id);
    if (row.kind === "permit") {
      done.permits += 1;
    } else {
      done.approvals += 1;
    }
  }
  movedOutOfPlain(done.permits + done.approvals);
  return done;
};
