/**
 * A request to a machine whose link drops while it waits is held, not
 * failed: it goes again, under its own id, on the machine's next register,
 * and fails only when its own deadline passes with the machine still away
 * (hub server.ts `onAgentLeft`, `resendHeld`, `awaitReply`; agent
 * request-record.ts). On a scratch fleet (real hub, two machines' agents
 * and sessiond; no session): the second machine reaches the hub through the
 * kit's relay (relay.ts), whose cut is the drop.
 *
 * - Back in time: its agent frozen, the machine is asked to inspect its
 *   config (10 s deadline); its link is cut while the ask waits and let back
 *   1 s later, and its agent thawed. The ask is answered, with the
 *   machine's inspection, and the hub says it sent the held request again.
 * - Away past the deadline: asked again, frozen, cut, and kept away; the ask
 *   fails only at its deadline, saying the machine was away and whether it
 *   ran is not known, never "Completion is unknown".
 * - Asked while away: its link cut first, the machine is asked while it is
 *   away inside its reconnecting window, and let back 1 s later. The ask is
 *   held from the moment it is made and answered once the machine is back,
 *   never "isn't connected".
 *
 *   bun scripts/probe-kit/run.ts held-requests
 */
import { signal, spawnedPid } from "../../../packages/core/src/signal";
import { delay, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { relay } from "../relay";

const OTHER = "held-requests-other";
/** What the hub says as it sends held requests again (server.ts `resendHeld`). */
const RESENT = "request(s) held for it sent again under their own ids";
/** The hub's words for a request whose deadline passed with its machine away. */
const AWAY = "whether it ran is not known";
/** The hub's read deadline (server.ts `READ_TIMEOUT_MS`). */
const READ_DEADLINE_MS = 10_000;

const spec: Spec = {
  name: "held-requests",
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
    const between = relay(fleet.base);
    const other = await fleet.launchMachine(OTHER, {
      CAWCO_HUB_URL: `${between.url.replace("http", "ws")}/ws`,
    });
    const { agent } = other;
    const pid = spawnedPid(agent);
    if (pid === undefined) {
      throw new Error(`${OTHER}'s agent has no pid to freeze`);
    }
    const freeze = (frozen: boolean) =>
      signal(pid, frozen ? "SIGSTOP" : "SIGCONT");
    const inspect = () =>
      fleet.api<{ cwd?: string }>(`/api/agents/${OTHER}/inspect`, {});
    // Back in time.
    const before = await fleet.logMark("hub");
    freeze(true);
    const asked = Date.now();
    const answer = inspect().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error: String(error) })
    );
    await delay(500);
    between.cut();
    await delay(1000);
    between.release();
    freeze(false);
    const got = await answer;
    check(
      "a request held across its machine's dropped link is answered once the machine is back",
      got.ok && typeof got.value === "object",
      `${Math.round((Date.now() - asked) / 1000)} s; ${got.ok ? JSON.stringify(got.value).slice(0, 200) : got.error.slice(0, 400)}`
    );
    const said = await before.since();
    check(
      "the hub sent the held request again on the machine's register",
      said.includes(RESENT),
      said
        .split("\n")
        .filter((line) => line.includes(OTHER) || line.includes("held"))
        .slice(-5)
        .join(" | ")
    );

    // Away past the deadline.
    freeze(true);
    const askedAgain = Date.now();
    const late = inspect().then(
      () => "answered",
      (error: unknown) => String(error)
    );
    await delay(500);
    between.cut();
    const failed = await late;
    const after = Date.now() - askedAgain;
    between.release();
    freeze(false);
    check(
      "a request whose machine stays away fails at its own deadline, saying the machine was away",
      failed.includes(AWAY) &&
        !failed.includes("Completion is unknown") &&
        after >= READ_DEADLINE_MS - 500,
      `${Math.round(after / 1000)} s; ${failed.slice(0, 400)}`
    );

    // Asked while away. The machine is back first: its next register ends
    // the reconnect the last leg left it in.
    await until(
      "the second machine is back",
      async () =>
        (
          await fleet.api<{ machineId: string; status: string }[]>(
            "/api/agents"
          )
        ).find((one) => one.machineId === OTHER)?.status === "online" ||
        undefined,
      Boolean,
      60_000
    );
    const beforeAway = await fleet.logMark("hub");
    between.cut();
    await delay(500);
    const askedAway = Date.now();
    const whileAway = inspect().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error: String(error) })
    );
    await delay(1000);
    between.release();
    const gotAway = await whileAway;
    check(
      "a request made while its machine is away is held from then and answered once the machine is back",
      gotAway.ok && typeof gotAway.value === "object",
      `${Math.round((Date.now() - askedAway) / 1000)} s; ${gotAway.ok ? JSON.stringify(gotAway.value).slice(0, 200) : gotAway.error.slice(0, 400)}`
    );
    check(
      "the hub sent the request held from its making on the machine's register",
      (await beforeAway.since()).includes(RESENT)
    );
    between.stop();
  },
};

export default spec;
