/**
 * A finished turn pushes to the person's phone only when its session waits
 * on them (hub push.ts `turnEnded`, `ownWork`; each harness's `wakes` on its
 * result). On a scratch fleet (real hub, agent and sessiond against the mock
 * model) with a stand-in Cawrier that keeps every push and one paired
 * device, on Claude Code, OpenCode and pi alike:
 *
 * - (d) A plain session's turn ends with nothing of its own going on: one
 *   turn push for it reaches Cawrier.
 * - (c) A session ends its turn with a shell command of its own running in
 *   the background (Claude Code's Bash `run_in_background`, OpenCode's
 *   shell with `background: true`, pi's bash moved to the background by a
 *   send that reached it mid-call): no turn push for it while the command
 *   runs, past the push's look grace and its burst. Once the command ends,
 *   its end starts the session's next turn, which ends with nothing left:
 *   then one turn push goes.
 *
 * Delegating (legs a and b) cuts workspaces, so those run on the host:
 * turn-push-delegates.
 *
 *   bun scripts/probe-kit/run.ts turn-push
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  HARNESSES,
  type Harness,
  type Reply,
  type Seen,
  until,
} from "../../scratch-fleet";
import { type Kit, type KitFleet, logSince, type Spec } from "../kit";

/** How long a background command runs: past the quiet window, then it ends. */
const BG_SECONDS = 50;
/**
 * How long a turn's end is watched for a push that must not come: the
 * hub's look grace (5 s, push.ts `LOOK_GRACE_MS`), its burst's quiet (10 s,
 * `QUIET_MS`), and room for the stand-in to be reached.
 */
const QUIET_WATCH_MS = 25_000;
/** How long a push that must come is waited for after its turn's end. */
const PUSH_WAIT_MS = 60_000;

const plainTag = (harness: Harness) => `PROBE-PLAIN-${harness}`;
const bgTag = (harness: Harness) => `PROBE-BG-${harness}`;
const steerTag = (harness: Harness) => `PROBE-STEER-${harness}`;

/** The hub's line for a burst sent as one push (push.ts `sentLine`): its id, and the items it held. */
const BURST_SENT = /\[notify\] push (needs-\S+): \d+ in one \(([^)]*)\)/;

/** A push the stand-in Cawrier took: a visible one under its collapse id. */
interface Pushed {
  collapseId?: string;
  payload: { cawco?: { instanceId?: string; kind?: string } };
}

/**
 * A stand-in Cawrier that keeps every push, the hub pointed at it, and one
 * phone paired: what reached the person's phone. `turns(id)` is how many
 * of them carried the session's finished turn.
 */
export const standInPhone = (fleet: KitFleet) => {
  const pushed: Pushed[] = [];
  const cawrier = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/v1/push") {
        pushed.push((await request.json()) as Pushed);
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 204 });
    },
  });
  fleet.env.CAWCO_CAWRIER_ORIGIN = `http://127.0.0.1:${cawrier.port}`;
  return {
    /** Pairs one phone with the hub, which must be up. */
    pair: async (): Promise<void> => {
      const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
      await fleet.api("/api/push/register", {
        pairingId: crypto.randomUUID(),
        secret: Buffer.from(bytes(32)).toString("base64url"),
        key: Buffer.from(bytes(32)).toString("base64"),
        name: "Probe iPhone",
        platform: "ios",
      });
    },
    /**
     * The pushes so far that carried the session's finished turn: under its
     * own `turn-<id>` collapse id, or a burst's (`needs-…`) the hub's log
     * says held it among others ("N in one (turn-<id>, …)").
     */
    turns: async (instanceId: string): Promise<number> => {
      const turn = `turn-${instanceId}`;
      const bursts = new Set(
        (await fleet.logs("hub")).split("\n").flatMap((line) => {
          const held = BURST_SENT.exec(line);
          return held?.[2]?.split(", ").includes(turn) ? [held[1]] : [];
        })
      );
      return pushed.filter(
        (one) => one.collapseId === turn || bursts.has(one.collapseId ?? "")
      ).length;
    },
    /** Every push's collapse id so far, for a failure's detail. */
    ids: (): string[] => pushed.map((one) => one.collapseId ?? "background"),
    stop: () => cawrier.stop(true),
  };
};

export type Phone = ReturnType<typeof standInPhone>;

/** The hub's `[notify]` lines about the session since `then`: why a push went or did not. */
export const notifyLines = async (
  fleet: KitFleet,
  instanceId: string,
  then: string
): Promise<string> =>
  logSince(then, await fleet.logs("hub"))
    .split("\n")
    .filter((line) => line.includes(`turn-${instanceId}`))
    .join(" | ");

/** A session at rest: no turn open on the hub, no busy pulse. */
export const atRest = async (fleet: KitFleet, id: string): Promise<void> => {
  await until(
    `${id.slice(0, 8)} at rest`,
    async () => {
      const [row] = fleet.query<{ turn_open_at: number | null }>(
        "SELECT turn_open_at FROM instances WHERE id = ?",
        id
      );
      const pulses =
        await fleet.api<Record<string, { busy?: boolean }>>("/api/pulses");
      return row?.turn_open_at === null && !pulses[id]?.busy;
    },
    Boolean,
    120_000
  );
};

/** The background command each harness's shell runs, as its tool takes it. */
const backgroundCall = (
  offered: readonly string[]
): { input: object; name: string } | undefined => {
  const command = `sleep ${BG_SECONDS} && echo PROBE-BG-done`;
  if (offered.includes("Bash")) {
    return {
      name: "Bash",
      input: {
        command,
        description: "A long command in the background",
        run_in_background: true,
      },
    };
  }
  if (offered.includes("shell")) {
    return { name: "shell", input: { command, background: true } };
  }
  // pi's bash runs in the foreground; a send that meets it moves it.
  return offered.includes("bash")
    ? { name: "bash", input: { command } }
    : undefined;
};

/** Whether each harness's background leg has made its call, by harness. */
const called = new Set<Harness>();

/**
 * Every session answers "ok"; a background leg's, asked its words the
 * first time, starts its command first.
 */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return { everyMs: 5, words: ["Probe title"] };
  }
  const leg = HARNESSES.find(
    (harness) => request.all.includes(bgTag(harness)) && !called.has(harness)
  );
  const call = leg ? backgroundCall(request.toolNames) : undefined;
  if (leg && call && !request.afterTool) {
    called.add(leg);
    return { everyMs: 5, words: [], tool: call };
  }
  return { everyMs: 5, words: ["ok"] };
};

/** (d) A plain session's turn: one push. */
const plainLeg = async (
  kit: Kit,
  fleet: KitFleet,
  phone: Phone,
  harness: Harness,
  cwd: string
): Promise<void> => {
  const id = await fleet.spawn(harness, `Plain ${harness}`, cwd);
  const then = await fleet.logs("hub");
  await fleet.send(id, `${plainTag(harness)}: say ok.`);
  await until(
    `${harness}: the plain turn answered`,
    () => fleet.seen.some((one) => one.all.includes(plainTag(harness))) || null,
    Boolean,
    120_000
  );
  await atRest(fleet, id);
  const pushes = await until(
    `${harness}: the plain turn's push`,
    () => phone.turns(id),
    (count) => count > 0,
    PUSH_WAIT_MS
  ).catch(() => phone.turns(id));
  kit.check(
    `(d) ${harness}: a plain session's finished turn pushes once`,
    pushes === 1,
    `${pushes} turn push(es); hub: ${await notifyLines(fleet, id, then)}`
  );
};

/** (c) A session with its own command in the background: no push until it ends, then one. */
const backgroundLeg = async (
  kit: Kit,
  fleet: KitFleet,
  phone: Phone,
  harness: Harness,
  cwd: string
): Promise<void> => {
  const id = await fleet.spawn(harness, `Background ${harness}`, cwd);
  const then = await fleet.logs("hub");
  await fleet.send(id, `${bgTag(harness)}: start the long command.`);
  const startedAt = Date.now();
  await until(
    `${harness}: the background command called`,
    () => called.has(harness) || null,
    Boolean,
    120_000
  );
  if (harness === "pi") {
    // pi moves a running shell command to the background when a send
    // reaches the turn that waits on it (pi-runtime `#moveShells`).
    await Bun.sleep(3000);
    await fleet.send(id, `${steerTag(harness)}: carry on while it runs.`);
  }
  await atRest(fleet, id);
  const restedAt = Date.now();
  await Bun.sleep(QUIET_WATCH_MS);
  const quietPushes = await phone.turns(id);
  const stillRunning = Date.now() - startedAt < BG_SECONDS * 1000;
  kit.check(
    `(c) ${harness}: its turn ended with its background command running, and no turn push went`,
    quietPushes === 0 && stillRunning,
    `${quietPushes} turn push(es) in ${QUIET_WATCH_MS / 1000} s after its turn ended, ${((Date.now() - startedAt) / 1000).toFixed(0)} s into a ${BG_SECONDS} s command (turn ended ${((restedAt - startedAt) / 1000).toFixed(0)} s in); hub: ${await notifyLines(fleet, id, then)}`
  );
  const pushes = await until(
    `${harness}: the push after the background command ended`,
    () => phone.turns(id),
    (count) => count > 0,
    BG_SECONDS * 1000 + PUSH_WAIT_MS
  ).catch(() => phone.turns(id));
  const woke = fleet.seen.filter(
    (one) => one.tools && one.all.includes(bgTag(harness))
  ).length;
  kit.check(
    `(c) ${harness}: once its command ended, the turn that ended with nothing left pushed once`,
    pushes === 1,
    `${pushes} turn push(es); ${woke} request(s) of its conversation; hub: ${await notifyLines(fleet, id, then)}`
  );
};

const spec: Spec = {
  name: "turn-push",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(respond);
    const device = standInPhone(fleet);
    try {
      fleet.launch("sessiond");
      await fleet.sessiondUp();
      fleet.launch("hub");
      await fleet.hubUp();
      await device.pair();
      fleet.fileAccount();
      fleet.launch("agent");
      await fleet.agentUp();
      await fleet.accountSignedIn();
      const cwd = join(fleet.sandbox, "work");
      await mkdir(cwd, { recursive: true });
      await writeFile(join(cwd, "README.md"), "turn push probe\n");
      for (const harness of HARNESSES) {
        // One leg at a time: two turn pushes in one burst go as one.
        // biome-ignore lint/performance/noAwaitInLoops: legs in order, each push out before the next
        await plainLeg(kit, fleet, device, harness, cwd);
        await backgroundLeg(kit, fleet, device, harness, cwd);
      }
      kit.note(`every push the phone took: ${device.ids().join(", ")}`);
    } finally {
      await device.stop();
    }
  },
};

export default spec;
