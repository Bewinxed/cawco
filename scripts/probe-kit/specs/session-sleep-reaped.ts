/**
 * A session the hub files asleep has no live CLI. On a scratch fleet (real
 * hub, agent and sessiond; Claude Code against the mock model), with no
 * workspace: it runs inside one.
 *
 * The agent puts a session at rest to sleep (session.ts `sleep`): its CLI's
 * stdin and `Query` close, and the hub is told `asleep`. The SDK ends a CLI
 * still there with SIGTERM 2 s on and SIGKILL 7 s on, on unref'd timers in
 * the agent's process; until this build the agent said `asleep` without
 * waiting for either, so for those seconds, and for good when the agent
 * restarted inside them, the hub held a sleeping row while a keeper still ran
 * its CLI. No custody names a sleeping session again, so that CLI ran on in
 * its workspace's clone, and the hub closed the workspace under it (obelisk,
 * 2026-10-18, workspace bb4af2c9).
 *
 * The probe's `claude` (first on the agent's PATH) runs the real one, then,
 * for a stream-json session alone, stays 120 s ignoring SIGTERM, as a CLI
 * slow to close its MCP servers or a hook does. The session is put to
 * sleep (the dashboard's `sleep` control), and the hub's row and the
 * keeper's listing are read every 50 ms from then on.
 *
 * - (a) Not once does the hub's row read `sleeping` while the keeper holds a
 *   live process under the session's id. On main it does, for the seconds
 *   until the SDK's SIGKILL.
 * - (b) Once asleep, no process of the session is left on the keeper.
 * - (c) A second session, the agent restarted the moment its row reads
 *   `sleeping`: 15 s on, no process of it is left on the keeper. On main
 *   its CLI runs on (the SDK's kill timers went with the agent), a CLI the
 *   hub filed asleep that nothing ends.
 *
 *   bun scripts/probe-kit/run.ts session-sleep-reaped
 */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type Reply, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** How long the probe's `claude` stays once the real one has exited. */
const LINGER_S = 120;

/** The probe's `claude`: the real one, then {@link LINGER_S} seconds deaf to SIGTERM, for a stream-json session alone. */
const lingering = (real: string): string => `#!/bin/sh
case " $* " in
  *" stream-json "*)
    '${real.replaceAll("'", "'\\''")}' "$@"
    status=$?
    trap '' TERM
    sleep ${LINGER_S} </dev/null >/dev/null 2>&1
    exit $status
    ;;
esac
exec '${real.replaceAll("'", "'\\''")}' "$@"
`;

type Fleet = Awaited<ReturnType<Kit["fleet"]>>;

/** A session spawned through the probe's `claude`, one turn answered: its id, and whether its CLI was launched through the probe's. */
const sessionAtRest = async (
  fleet: Fleet,
  bin: string,
  title: string
): Promise<{ id: string; through: boolean }> => {
  const id = await fleet.spawn("claude", title);
  // A session sleeps only with a conversation to wake from: one turn first.
  const sent = Date.now();
  await fleet.send(id, "Say ok.");
  await until(
    `${title}'s first turn answered and closed`,
    () => {
      const row = fleet.instance(id);
      return fleet.seen.some((one) => one.at >= sent) &&
        row?.turn_open_at === null
        ? row
        : undefined;
    },
    Boolean,
    120_000
  );
  const through = (
    await Bun.file(`/proc/${await fleet.sessionPid(id)}/cmdline`)
      .text()
      .catch(() => "")
  ).includes(join(bin, "claude"));
  return { id, through };
};

/** Whether the keeper holds a live process under session `id`'s proc id. */
const heldFor = async (fleet: Fleet, id: string): Promise<boolean> =>
  (await fleet.heldProcs()).some((proc) => proc.procId === id);

interface Watched {
  asked: number;
  lastAlive: number | undefined;
  /** The readings in which the row read sleeping and the keeper held a live process. */
  overlap: { at: number }[];
  readings: number;
  status: string | undefined;
}

/**
 * The dashboard's `sleep` asked of session `id` (again every 15 s, as a
 * machine refuses a session not at rest), the hub's row and the keeper read
 * together every 50 ms from the ask until `watchMs` after the row reads
 * sleeping; `onAsleep` runs the moment it does.
 */
const sleepWatched = async (
  fleet: Fleet,
  id: string,
  watchMs: number,
  onAsleep: () => Promise<void> = async () => undefined
): Promise<Watched> => {
  const readings: { at: number; status: string | undefined; alive: boolean }[] =
    [];
  const watched = new AbortController();
  const reader = (async () => {
    while (!watched.signal.aborted) {
      // biome-ignore lint/performance/noAwaitInLoops: one reading of the row and the keeper at a time
      const alive = await heldFor(fleet, id).catch(() => false);
      readings.push({
        at: Date.now(),
        status: fleet.instance(id)?.status,
        alive,
      });
      await Bun.sleep(50);
    }
  })();
  const asked = Date.now();
  let askedLast = 0;
  const status = await until(
    `${id.slice(0, 8)} asleep`,
    async () => {
      if (
        fleet.instance(id)?.status !== "sleeping" &&
        Date.now() - askedLast > 15_000
      ) {
        askedLast = Date.now();
        await fleet.control(id, "sleep");
      }
      return fleet.instance(id)?.status;
    },
    (now) => now === "sleeping",
    90_000
  ).catch(() => fleet.instance(id)?.status);
  if (status === "sleeping") {
    await onAsleep();
  }
  await Bun.sleep(watchMs);
  watched.abort();
  await reader;
  return {
    overlap: readings.filter((one) => one.status === "sleeping" && one.alive),
    readings: readings.length,
    asked,
    status,
    lastAlive: readings.findLast((one) => one.alive)?.at,
  };
};

/** A watch in words, for a check's detail. */
const watchedWords = (through: boolean, watched: Watched): string =>
  `launched through the probe's claude: ${through}; ${watched.status}; ${watched.overlap.length} of ${watched.readings} readings sleeping with a live process${watched.overlap[0] ? `, the first ${watched.overlap[0].at - watched.asked} ms after the ask` : ""}; last alive ${watched.lastAlive ? `${watched.lastAlive - watched.asked} ms` : "never"} after the ask`;

const spec: Spec = {
  name: "session-sleep-reaped",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => text("ok"));
    const path = String(fleet.env.PATH);
    const real = Bun.which("claude", { PATH: path });
    if (!real) {
      check("the real claude is on the fleet's PATH", false, path);
      return;
    }
    const bin = join(fleet.sandbox, "lingering-bin");
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, "claude"), lingering(real));
    await chmod(join(bin, "claude"), 0o755);
    const agentEnv = { PATH: `${bin}:${path}` };

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], agentEnv);
    await fleet.agentUp();
    await fleet.accountSignedIn();

    // ── (a), (b) a sleep, watched past the SDK's SIGKILL ─────────────────
    const first = await sessionAtRest(fleet, bin, "Sleeper");
    const watched = await sleepWatched(fleet, first.id, 10_000);
    check(
      "(a) the hub's row never reads sleeping while the keeper holds a live process under the session's id",
      first.through &&
        watched.status === "sleeping" &&
        watched.overlap.length === 0,
      watchedWords(first.through, watched)
    );
    check(
      "(b) once asleep, no process of the session is left on the keeper",
      !(await heldFor(fleet, first.id)),
      (await heldFor(fleet, first.id)) ? "a process is still held" : "none held"
    );

    // ── (c) the agent restarted the moment the row reads sleeping ────────
    const second = await sessionAtRest(fleet, bin, "Restarted sleeper");
    const restarted = await sleepWatched(fleet, second.id, 15_000, async () => {
      await fleet.stop("agent");
      fleet.launch("agent", [], agentEnv);
      await fleet.agentUp();
    });
    const left = await heldFor(fleet, second.id);
    check(
      "(c) with the agent restarted the moment the row reads sleeping, no process of the session is left on the keeper 15 s on",
      second.through && restarted.status === "sleeping" && !left,
      `${watchedWords(second.through, restarted)}; ${left ? "a process is still held: a CLI the hub filed asleep, which nothing will end" : "none held"}`
    );
  },
};

export default spec;
