/**
 * The hub's hold on a boundary relaunch (`relaunching` in hub server.ts):
 * a second ask within its {@link HOLD_MS} is said in the hub's log, naming
 * the session and why, and asked again as the hold ends, not left to the
 * session's next turn's end.
 *
 * On a scratch fleet (real hub, agent and sessiond; the real Claude Code CLI
 * against the mock model) with the agent reaching the hub through the kit's
 * relay (relay.ts). A fleet runs no workspace boundary, so no CLI here runs
 * a hook that fails open: the relay turns the agent's ask after a manual
 * `/compact` (`compact_relaunch`) into the boundary's (`boundary_relaunch`)
 * as it passes, which the hub takes by the same path. One session: a turn,
 * `/compact` (relaunched, the hold starts), a turn and `/compact` again
 * inside the hold.
 *
 * Asserted:
 * 1. the second ask, inside the hold, is not sent: the hub's log names the
 *    session and says it is asked again as the hold ends, and its process
 *    is still the one the first relaunch started;
 * 2. as the hold ends, the hub says so and relaunches it: a new process,
 *    no sooner than the hold after the first relaunch;
 * 3. the session answers its next turn on the new process.
 *
 *   bun scripts/probe-kit/run.ts relaunch-hold
 */
import { relaunchWords } from "../../../packages/core/src/words/relaunch";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import type { KitFleet, Spec } from "../kit";
import { relay } from "../relay";

/** The hub's hold on a boundary relaunch (server.ts `RELAUNCH_SETTLE_MS`). */
const HOLD_MS = 60_000;
const MARK = "RELAUNCH-HOLD";

/** Whether `request` is Claude Code's summary request of a `/compact`: its instruction, as 2.1.309 words it. */
const summarising = (request: Seen): boolean =>
  request.last.includes(
    "Your task is to create a detailed summary of the conversation so far"
  );

const respond = (request: Seen): Reply => {
  if (summarising(request)) {
    return { everyMs: 5, words: ["<summary>The probe so far.</summary>"] };
  }
  return { everyMs: 5, words: [request.tools ? "ok" : "Probe title"] };
};

/** `words` sent to `id`, read by the mock, and its turn closed. */
const turn = async (fleet: KitFleet, id: string, words: string) => {
  const since = Date.now();
  await fleet.send(id, words);
  await until(
    `"${words}" answered`,
    () =>
      fleet.seen.some(
        (one) =>
          one.at > since &&
          (words === "/compact" ? summarising(one) : one.last.includes(words))
      ) && fleet.instance(id)?.turn_open_at === null
        ? true
        : undefined,
    Boolean,
    120_000
  );
};

/** The pid sessiond holds for `id`'s CLI, once it holds one other than `not`. */
const pidOf = async (
  fleet: KitFleet,
  id: string,
  not: number | undefined,
  withinMs: number
) =>
  Number(
    await until(
      not === undefined
        ? "sessiond holding the session's CLI"
        : `a new CLI for the session in place of pid ${not}`,
      () => fleet.sessionPid(id),
      (pid) => pid !== undefined && Number(pid) !== not,
      withinMs
    )
  );

const spec: Spec = {
  name: "relaunch-hold",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    const between = relay(fleet.base, {
      toHub: (text) =>
        text.includes('"subtype":"compact_relaunch"')
          ? text.replaceAll(
              '"subtype":"compact_relaunch"',
              '"subtype":"boundary_relaunch"'
            )
          : undefined,
    });
    fleet.launch("agent", [], {
      CAWCO_HUB_URL: `${between.url.replace("http", "ws")}/ws`,
    });
    await fleet.agentUp();
    await fleet.accountSignedIn();

    const id = await fleet.spawn("claude", "relaunch hold", fleet.workdir);
    await turn(fleet, id, `${MARK} one`);
    const first = await pidOf(fleet, id, undefined, 30_000);
    const hubAt = await fleet.logMark("hub");
    /** The hub's lines since the mark that are `line`. */
    const said = async (line: string) =>
      (await hubAt.since()).split("\n").filter((one) => one.includes(line));
    const holdSeconds = HOLD_MS / 1000;

    await turn(fleet, id, "/compact");
    const second = await pidOf(fleet, id, first, 90_000);
    const relaunchedAt = Date.now();
    check(
      "the first ask relaunches it at once",
      (await said(relaunchWords.relaunching("boundary", id))).length === 1,
      `pid ${first} → ${second}`
    );

    // A /compact with nothing since the last one summarises nothing.
    await turn(fleet, id, `${MARK} two`);
    await turn(fleet, id, "/compact");
    const dropped = await until(
      "the hub's word on the ask inside its hold",
      () => said(relaunchWords.heldBack(id, holdSeconds)),
      (lines) => lines.length > 0,
      30_000
    );
    check(
      "the ask inside the hold is said, naming the session and why",
      dropped.length === 1,
      dropped[0] ?? "none"
    );
    check(
      "inside the hold its process is the one the first relaunch started",
      Number(await fleet.sessionPid(id)) === second &&
        Date.now() - relaunchedAt < HOLD_MS,
      `pid ${await fleet.sessionPid(id)}, ${Math.round((Date.now() - relaunchedAt) / 1000)} s after the relaunch`
    );

    const third = await pidOf(fleet, id, second, HOLD_MS + 60_000);
    const after = Date.now() - relaunchedAt;
    const ended = await said(relaunchWords.holdEnded(id));
    check(
      "as the hold ends the kept ask goes, and the session is relaunched",
      ended.length === 1 &&
        (await said(relaunchWords.relaunching("boundary", id))).length === 2 &&
        after >= HOLD_MS - 5000,
      `pid ${second} → ${third}, ${Math.round(after / 1000)} s after the first relaunch; ${ended[0] ?? "no word of the hold's end"}`
    );

    await turn(fleet, id, `${MARK} after`);
    check(
      "it answers its next turn on the new process",
      Number(await fleet.sessionPid(id)) === third &&
        fleet.instance(id)?.status === "running",
      `pid ${await fleet.sessionPid(id)}, row ${fleet.instance(id)?.status}`
    );
    await fleet.stopSession(id);
    between.stop();
  },
};

export default spec;
