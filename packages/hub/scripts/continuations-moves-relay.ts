/**
 * `bun run continuations-moves-relay <database>` in packages/hub: what
 * migrations 0414, 0415 and 0416 will do to a hub database's continuation
 * jobs (`continuations.asked_by`, who asked, and `continuations.waiting`,
 * the job's wait), project moves (`moves.state`, from which 0415 lifts the
 * session's id, the parked ask and the approval) and stream relay
 * (`stream_relay_proofs.ports`, which URLs a device proved, and
 * `stream_relay.ports`, what the relay's machine bound), read before they
 * run. Opens the database read-only (a copy of a live hub's, or a fixture
 * unpacked) and counts each column's rows as placed (it reads whole and
 * moves to columns as it is), never set (the column's "not set": the
 * person's asker by default, no wait, no ask parked, never approved, a
 * proof that answered nothing, a relay no frame has said) and restrictive
 * (it does not read whole: a job neither folded nor a move, failed as the
 * hub starts while open; a wait none of which is placed; a move the hub
 * neither runs nor shows, its named row held; a proof of no port; ports
 * none of which are placed), and names each restrictive row. Read with the
 * migrations' own predicates (db/continuation-askers-unread.ts,
 * db/move-states-unread.ts, db/relay-ports-unread.ts); a table its
 * migration has run on is said so and not counted.
 */
import { continuationsKept } from "../src/db/continuation-askers-unread";
import { movesKept } from "../src/db/move-states-unread";
import { relayPortsKept } from "../src/db/relay-ports-unread";
import { countedDatabase } from "./counted-database";

const { client, has, ran } = countedDatabase("continuations-moves-relay");
/** A value as this shows it: cut short, on one line. */
const shown = (raw: string): string => JSON.stringify(raw);

if (has("continuations", "asked_by")) {
  const jobs = continuationsKept(client);
  const askers = jobs.flatMap((job) =>
    job.asker.kind === "placed" ? [job.asker.as] : []
  );
  const kinds = ["person", "session", "task", "move"]
    .map((kind) => `${askers.filter((one) => one === kind).length} ${kind}`)
    .join(", ");
  const unreadAskers = jobs.filter((job) => job.asker.kind === "unread");
  console.log(
    `continuations.asked_by: ${jobs.length} read, ${askers.length} placed (${kinds}), 0 never set (NOT NULL: one never set holds the person's, its default, counted with the person's), ${unreadAskers.length} restrictive (${unreadAskers.filter((job) => !["started", "failed", "cancelled"].includes(job.stage)).length} open)`
  );
  for (const job of unreadAskers) {
    console.log(
      `  restrictive: ${job.id} (${job.stage}, source ${job.sourceInstanceId}): ${shown(job.askerRaw)}: ${job.asker.kind === "unread" ? job.asker.why : ""}`
    );
  }
  const waits = jobs.map((job) => job.wait.kind);
  console.log(
    `continuations.waiting: ${jobs.length} read, ${waits.filter((one) => one === "placed").length} placed, ${waits.filter((one) => one === "never").length} never set, ${waits.filter((one) => one === "unread").length} restrictive`
  );
  for (const job of jobs) {
    if (job.wait.kind === "unread" && job.waitRaw !== null) {
      console.log(
        `  restrictive: ${job.id} (${job.stage}): ${shown(job.waitRaw)}: ${job.wait.why}`
      );
    }
  }
} else {
  ran("continuations.asked_by, continuations.waiting", "0414");
}

if (has("moves", "state")) {
  const moves = movesKept(client);
  const placed = moves.flatMap((move) =>
    move.reading.kind === "placed" ? [move.reading] : []
  );
  const unread = moves.flatMap((move) =>
    move.reading.kind === "unread" ? [{ ...move, reading: move.reading }] : []
  );
  const named = (column: string) =>
    unread.filter((move) => move.reading.placed.includes(column)).length;
  console.log(
    `moves.state: ${moves.length} read, ${placed.length} placed (${placed.filter((one) => one.asked).length} with a parked ask, ${placed.filter((one) => one.approved).length} approved; ask_id never set on ${placed.filter((one) => !one.asked).length}, approved never set on ${placed.filter((one) => !one.approved).length}), 0 never set (NOT NULL since its first migration), ${unread.length} restrictive (${named("target_instance_id")} naming the row they hold, ${named("ask_id")} an ask; none approved)`
  );
  for (const move of unread) {
    console.log(
      `  restrictive: ${move.id} (${move.stage}, project ${move.projectId}): ${shown(move.raw)}: ${move.reading.why}; placed ${move.reading.placed.join(", ") || "none"}`
    );
  }
} else {
  ran("moves.state", "0415");
}

if (has("stream_relay_proofs", "ports") && has("stream_relay", "ports")) {
  const rows = relayPortsKept(client);
  for (const table of ["stream_relay_proofs", "stream_relay"] as const) {
    const of = rows.filter((row) => row.table === table);
    const count = (kind: string) =>
      of.filter((row) => row.reading.kind === kind).length;
    console.log(
      `${table}.ports: ${of.length} read, ${count("placed")} placed, ${count("never")} never set (${table === "stream_relay" ? "no frame said them" : "no URL answered"}), ${count("unread")} restrictive (${table === "stream_relay" ? "none placed until the next frame" : "proving no port"})`
    );
    for (const row of of) {
      if (row.reading.kind === "unread" && row.raw !== null) {
        console.log(
          `  restrictive: ${row.id}: ${shown(row.raw)}: ${row.reading.why}`
        );
      }
    }
  }
} else {
  ran("stream_relay_proofs.ports, stream_relay.ports", "0416");
}

if (has("stream_relay", "health")) {
  const relays = client
    .query<{ asked: number; rows: number }, []>(
      "SELECT count(*) AS rows, count(checked_at) AS asked FROM stream_relay"
    )
    .get();
  console.log(
    `stream_relay.health, stream_relay.checked_at: ${relays?.rows ?? 0} rows, ${relays?.asked ?? 0} asked; 0417 drops both: the hub asks each port again within a minute of its start`
  );
} else {
  ran("stream_relay.health, stream_relay.checked_at", "0417");
}
client.close();
