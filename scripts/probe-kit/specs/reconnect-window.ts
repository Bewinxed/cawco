/**
 * Right after the hub restarts, a machine it heard from within its
 * reconnecting window (core handover.ts `RECONNECTING_MS`) reads as
 * reconnecting, never offline: a hub restart is the case that window exists
 * for, and every deploy restarts the hub. Once the window ends, it reads
 * offline. The transcript route is the one route that answers a machine's
 * state this way (`X-Cawco-Machine-State`), and the dashboard's load, its
 * store and the app all read it there.
 *
 * A scratch fleet (real hub, agent and sessiond, Claude Code against the
 * mock model), no page. Each order below starts from an agent connected
 * longer than the window, on its heartbeats alone (a machine that registered
 * long ago, as every machine of a fleet has):
 *
 *  - agent first: the agent stops, then the hub restarts (the old hub's
 *    socket close stamps when it last heard from the machine);
 *  - hub first, as a deploy goes: the hub stops, the agent stops while it is
 *    down (no hub hears that close), then the hub starts.
 *
 * After each, the session's transcript read answers 503 naming the machine,
 * `X-Cawco-Machine-State: reconnecting` and a `Retry-After` of the seconds
 * left (1 to 60); read again a while later, `Retry-After` is that much less;
 * once it has passed, the read answers 503 naming the machine with no state
 * and no `Retry-After` (offline).
 *
 *   bun scripts/probe-kit/run.ts reconnect-window
 */
import { type Reply, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

/** How long the hub reads a machine it heard from as reconnecting (core handover.ts `RECONNECTING_MS`). */
const RECONNECTING_MS = 60_000;
/** Longer than the window, so the window's start is the agent's heartbeats, not its register. */
const CONNECTED_MS = RECONNECTING_MS + 30_000;
/** The second read within the window, this long after the first. */
const LATER_MS = 20_000;

const respond = (): Reply => ({ words: ["Done."], everyMs: 20 });

interface Read {
  machine: string | null;
  retryAfter: number | null;
  state: string | null;
  status: number;
}

const spec: Spec = {
  name: "reconnect-window",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const session = await fleet.spawn("claude", "Reconnect window probe");
    await fleet.send(session, "Say hello.");
    await until(
      "the first turn ended",
      () =>
        fleet.query<{ turn_ended_at: number | null }>(
          "SELECT turn_ended_at FROM instances WHERE id = ?",
          session
        )[0]?.turn_ended_at ?? 0,
      (at) => at > 0,
      120_000
    );

    const read = async (): Promise<Read> => {
      const response = await fetch(
        `${fleet.base}/api/instances/${session}/transcript`,
        { signal: AbortSignal.timeout(30_000) }
      );
      await response.text();
      const after = response.headers.get("retry-after");
      return {
        status: response.status,
        machine: response.headers.get("x-cawco-machine"),
        state: response.headers.get("x-cawco-machine-state"),
        retryAfter: after === null ? null : Number(after),
      };
    };
    const said = (one: Read) =>
      `${one.status} machine ${one.machine || "(none)"}, ${one.state ?? "(no state)"}, Retry-After ${one.retryAfter ?? "(none)"}`;
    const lastHeard = () =>
      fleet.query<{ last_seen_at: number | null }>(
        "SELECT last_seen_at FROM agents"
      )[0]?.last_seen_at ?? 0;

    const orders = {
      "agent first": async () => {
        await fleet.stop("agent");
        await fleet.stop("hub");
        fleet.launch("hub");
        await fleet.hubUp();
      },
      "hub first": async () => {
        await fleet.stop("hub");
        await fleet.stop("agent");
        fleet.launch("hub");
        await fleet.hubUp();
      },
    };
    for (const [order, away] of Object.entries(orders)) {
      if (order !== "agent first") {
        fleet.launch("agent");
        // biome-ignore lint/performance/noAwaitInLoops: one order after the other, on one fleet
        await fleet.agentUp();
      }
      const connected = Date.now();
      await Bun.sleep(CONNECTED_MS);
      kit.check(
        `${order}: connected past the window, the hub hears its heartbeats`,
        lastHeard() - connected > RECONNECTING_MS,
        `last heard ${((lastHeard() - connected) / 1000).toFixed(1)}s into ${CONNECTED_MS / 1000}s connected`
      );
      await away();
      kit.note(
        `${order}: the restarted hub last heard from the machine ${((Date.now() - lastHeard()) / 1000).toFixed(1)}s ago`
      );
      const first = await read();
      kit.check(
        `${order}: right after the restart, the read says reconnecting, with the seconds left`,
        first.status === 503 &&
          first.machine !== null &&
          first.machine !== "" &&
          first.state === "reconnecting" &&
          first.retryAfter !== null &&
          first.retryAfter >= 1 &&
          first.retryAfter <= RECONNECTING_MS / 1000,
        said(first)
      );
      await Bun.sleep(LATER_MS);
      const later = await read();
      const drop = (first.retryAfter ?? 0) - (later.retryAfter ?? 0);
      kit.check(
        `${order}: ${LATER_MS / 1000}s on, still reconnecting, Retry-After that much less`,
        later.state === "reconnecting" && Math.abs(drop - LATER_MS / 1000) <= 2,
        `${said(later)}; down ${drop}s`
      );
      await Bun.sleep(((later.retryAfter ?? 0) + 1) * 1000);
      const lapsed = await read();
      kit.check(
        `${order}: once Retry-After has passed, the read says offline`,
        lapsed.status === 503 &&
          lapsed.machine === first.machine &&
          lapsed.state === null &&
          lapsed.retryAfter === null,
        said(lapsed)
      );
    }
  },
};
export default spec;
