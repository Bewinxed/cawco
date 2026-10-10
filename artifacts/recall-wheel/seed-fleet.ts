#!/usr/bin/env bun
/**
 * A scratch fleet holding one session the reader has sent 40 messages to, for
 * the recall wheel's checks (wheel-check.mjs): a real hub, agent and sessiond
 * on loopback (scripts/scratch-fleet.ts), Claude Code on the mock model,
 * answering each send with one short line. Every seventh send runs to three
 * lines, so the wheel has multi-line rows to take.
 *
 *   bun artifacts/recall-wheel/seed-fleet.ts
 *
 * Prints `READY <hub url> <session id>` once every reply is in the hub's
 * transcript, then holds the fleet up until SIGINT or SIGTERM, when it stops
 * what it started (by PID) and deletes its sandbox.
 */
import { scratchFleet, until } from "../../scripts/scratch-fleet";

const SENDS = 40;
const STEP = /step (\d+)/;
/** Each word with the space after it: the mock joins them as they are. */
const WORDS = /(?<= )/;
const reply = (n: number) => `Step ${n} is done. `;
const send = (n: number) =>
  n % 7 === 0
    ? `Run step ${n} and report.\nKeep the branch clean.\nSave the captures beside the script.`
    : `Run step ${n} and report on what changed in the composer.`;

const fleet = await scratchFleet({
  name: "recall-wheel",
  respond: (seen) => {
    const n = Number(STEP.exec(seen.last)?.[1] ?? 0);
    return { everyMs: 1, words: reply(n).split(WORDS) };
  },
});

let closing = false;
const shut = async (code: number) => {
  if (closing) {
    return;
  }
  closing = true;
  await fleet.close();
  await fleet.clean(false);
  process.exit(code);
};
process.on("SIGINT", () => shut(0));
process.on("SIGTERM", () => shut(0));

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const id = await fleet.spawn("claude", "Recall wheel checks");
  for (let n = 1; n <= SENDS; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each send waits for the turn before it to end
    await fleet.send(id, send(n));
    await until(
      `step ${n}'s reply in the transcript`,
      () =>
        fleet
          .api<{ messages?: unknown[] }>(`/api/instances/${id}/transcript`)
          .then((page) => JSON.stringify(page)),
      (text) => text.includes(`Step ${n} is done.`),
      120_000
    );
  }
  console.log(`READY ${fleet.base} ${id}`);
  await new Promise(() => undefined);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await shut(1);
}
