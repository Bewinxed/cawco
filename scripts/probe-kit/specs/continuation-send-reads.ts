/**
 * A send never reads a continuation job's prepared transcript and prompt:
 * the reads every send and every board publish make of the job table
 * (sends.ts `heldAtLimit` → `moveJobOf`, `continuationTable`) select a
 * job's session, stage and ids only (hub db `continuationSlips`).
 *
 * 2026-11-04, obelisk's hub: every `deliverToSession` read every job whole,
 * and each row's `prepared` (a 691k-token source's extracted transcript and
 * its summariser prompt, several MB) was parsed and checked against its
 * schema on each read (hub stored-json.ts), on the loop.
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model): a session takes one turn and is continued from its asks by a
 * person; once the job has started its new session, the job is put back
 * open (`summarising`) and its `prepared` made {@link PREPARED_MB} MB, with
 * one field that fails its schema at the end, so a read of it anywhere
 * throws and the hub's log names `continuations.prepared`.
 *
 * (a) The scene stands: the job is open and its `prepared` that large.
 * (b) {@link SENDS} sends to the new session (the source never runs again:
 *     continuations.ts `retireContinued`) are each read by it, and
 *     `/api/continuations` answers with the job open.
 * (c) The hub's log never names `continuations.prepared` meanwhile: no read
 *     of it was made.
 *
 * Main fails (b) and (c): `moveJobOf` reads every job whole on each send.
 *
 *   bun scripts/probe-kit/run.ts continuation-send-reads
 */

import { dataOf } from "../../../packages/agent/src/hub-client";
import { readWithin } from "../../../packages/core/src/bounded";
import { MODEL, until } from "../../scratch-fleet";
import { hubAt } from "../hub";
import type { Kit, KitFleet, Spec } from "../kit";

/** How large the job's `prepared` is made: past the several MB of a 691k-token source. */
const PREPARED_MB = 40;
/** How many sends the source is sent while the job stands. */
const SENDS = 3;
/** The hub's words for a stored column read that failed its schema (hub stored-json.ts `StoredShapeError`). */
const PREPARED_READ = "continuations.prepared";

/** A session on the fleet's machine that has taken one turn, and the send of that turn. */
const turnTaken = async (fleet: KitFleet, title: string): Promise<string> => {
  const id = await fleet.spawn("claude", title, fleet.sandbox);
  await readOf(fleet, id, await fleet.send(id, "Say ok."));
  return id;
};

/** `send` read by `id`'s session and its turn ended. */
const readOf = (fleet: KitFleet, id: string, send: string) =>
  until(
    `send ${send} read and its turn ended`,
    () => ({ send: fleet.sendRow(send), row: fleet.instance(id) }),
    ({ send: row, row: instance }) =>
      row?.state === "read" && !instance?.turn_open_at,
    180_000
  );

/** `source` continued from its asks, as a person's Continue asks it: a separate session, no summary. */
const continueFromAsks = (fleet: KitFleet, source: string) =>
  readWithin(30_000, async (signal) => {
    const response = await hubAt(fleet.base, { signal })
      .api.instances({ id: source })
      .continue.post({
        asksOnly: true,
        target: {
          harness: "claude",
          model: MODEL.claude,
          permissionMode: "bypassPermissions",
        },
      });
    return dataOf(response);
  });

/**
 * `prepared` as stored, made {@link PREPARED_MB} MB in its transcript's
 * middle, and its last field a string where its schema says a number, so
 * any read of it throws.
 */
const inflated = (stored: string): string => {
  const prepared = JSON.parse(stored) as {
    extracted: { middle: string[] };
    summariseInputTokens: unknown;
  };
  const line = `${"a turn of a long session ".repeat(4)}\n`;
  const count = Math.ceil((PREPARED_MB * 1_000_000) / line.length);
  prepared.extracted.middle = Array.from({ length: count }, () => line);
  prepared.summariseInputTokens = "never read on a send";
  return JSON.stringify(prepared);
};

export default {
  group: "The hub and machines",
  name: "continuation-send-reads",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const source = await turnTaken(fleet, "send-reads source");
    const continued = await continueFromAsks(fleet, source);
    const job = continued.kind === "answered" ? continued.value : undefined;
    const jobId = job?.continuationId;
    const target = job?.targetInstanceId;
    if (!(jobId && target)) {
      throw new Error(
        `the continue was not taken: ${JSON.stringify(continued)}`
      );
    }
    await until(
      `continuation ${jobId} started`,
      async () =>
        (await fleet.api((hub) => hub.api.continuations.get())).find(
          (one) => one.id === jobId
        )?.stage,
      (stage) => stage === "started" || stage === "failed",
      180_000
    );
    const [stored] = fleet.query<{ prepared: string }>(
      "SELECT prepared FROM continuations WHERE id = ?",
      jobId
    );
    if (!stored) {
      throw new Error(`continuation ${jobId} has no row`);
    }
    fleet.write(
      "UPDATE continuations SET stage = 'summarising', prepared = ? WHERE id = ?",
      inflated(stored.prepared),
      jobId
    );
    const [scene] = fleet.query<{ stage: string; bytes: number }>(
      "SELECT stage, length(prepared) AS bytes FROM continuations WHERE id = ?",
      jobId
    );
    check(
      `a: the job stands open with its prepared ${PREPARED_MB} MB`,
      scene?.stage === "summarising" && scene.bytes >= PREPARED_MB * 1_000_000,
      JSON.stringify(scene)
    );

    const mark = await fleet.logMark("hub");
    const reads: string[] = [];
    for (let at = 0; at < SENDS; at += 1) {
      const send = await fleet.send(target, `Say ok, ${at + 1}.`);
      const read = await readOf(fleet, target, send)
        .then(() => "read")
        .catch((error: Error) => error.message);
      reads.push(read);
    }
    const listed = await fleet
      .api((hub) => hub.api.continuations.get())
      .then((jobs) => jobs.find((one) => one.id === jobId)?.stage)
      .catch((error: Error) => error.message);
    check(
      `b: ${SENDS} sends to the new session are each read, and /api/continuations lists the job open`,
      reads.every((read) => read === "read") && listed === "summarising",
      `sends ${JSON.stringify(reads)}; listed ${listed}`
    );
    const named = (await mark.since())
      .split("\n")
      .filter((line) => line.includes(PREPARED_READ));
    check(
      `c: the hub's log never names ${PREPARED_READ}: no send read it`,
      named.length === 0,
      named.slice(0, 3).join("\n").slice(0, 2000)
    );
  },
} satisfies Spec;
