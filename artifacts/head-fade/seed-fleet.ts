#!/usr/bin/env bun
/**
 * A scratch fleet holding one session with a long transcript, for the head
 * fade's captures (web here, iOS through mac-capture.sh): a real hub, agent
 * and sessiond on loopback (scripts/scratch-fleet.ts), Claude Code on the
 * mock model, answering each of a dozen sends with a few paragraphs.
 *
 *   bun artifacts/head-fade/seed-fleet.ts
 *
 * Prints `READY <hub url> <session id>` once every reply is in the hub's
 * transcript, then holds the fleet up until SIGINT or SIGTERM, when it stops
 * what it started (by PID) and deletes its sandbox.
 */
import { scratchFleet, until } from "../../scripts/scratch-fleet";

const SENDS = 12;
const PARAGRAPH =
  "The transcript keeps its place while the rows above it settle, so a reader who scrolled up to check an earlier step is never pulled back down. Each tool call folds into one line once it lands, and the lines stack in the ledger's rail. ";
const STEP = /step (\d+)/;
/** Each word with the space after it: the mock joins them as they are. */
const WORDS = /(?<= )/;
const reply = (n: number) =>
  `Step ${n} is done. ${PARAGRAPH}\n\n- The branch builds clean.\n- The lint pass is quiet.\n- The captures are saved beside the script.\n\n${PARAGRAPH}${PARAGRAPH}`;

const fleet = await scratchFleet({
  name: "head-fade",
  respond: (seen) => {
    const n = Number(STEP.exec(seen.last)?.[1] ?? 0);
    return { everyMs: 2, words: reply(n).split(WORDS) };
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
  const id = await fleet.spawn("claude", "Head fade captures");
  for (let n = 1; n <= SENDS; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each send waits for the turn before it to end
    await fleet.send(id, `Run step ${n} and report.`);
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
