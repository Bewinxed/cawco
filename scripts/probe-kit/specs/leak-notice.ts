/**
 * What a session starts and leaks, the session is told, and nothing is
 * stopped (agent leak-watch.ts, hub server.ts `tellLeak`); heavy runs start
 * at once, with no slot and no queue. On a scratch fleet (real hub, agent
 * and sessiond; Claude Code against the mock model), with no workspace: it
 * runs inside one.
 *
 * The agent's leak threshold is set to {@link THRESHOLD_GIB} GiB
 * (`CAWCO_LEAK_MEMORY_GIB`; 8 unset) so a probe's process crosses it in
 * seconds; every other rule is the agent's own (a minute's steady climb, a
 * leftover's 10 s grace).
 *
 * - (m1) A session's background command grows its memory 8 MiB a second to
 *   768 MiB and then holds it, its process named `leak-probe-M`. Within
 *   {@link MEMORY_WAIT_MS} the session reads a message from the hub's own
 *   word saying a process it started is leaking memory, naming
 *   `leak-probe-M`, its pid and how much it holds.
 * - (m2) That process is still alive once the session has read it.
 * - (o1) A session's foreground command leaves `sleep 600.0951` running in a
 *   session of its own and ends 15 s later. Within {@link LEFT_WAIT_MS} of
 *   its end the session reads a message saying a process it started is still
 *   running after what started it ended, naming `sleep 600.0951`.
 * - (o2) That `sleep` is still alive once the session has read it.
 * - (h1) Two `bun run typecheck`s, each a heavy run the old gate held in a
 *   slot, started at the same moment: each prints its first check's line
 *   before either ends, neither prints a `CAWCO-QUEUE` line, and both pass.
 *
 * On main the agent says nothing of either leak, and the second typecheck
 * waits behind the first's slot whenever the machine's eight are held.
 *
 *   bun scripts/probe-kit/run.ts leak-notice
 */
import { commandLines } from "../../../packages/core/src/process-identity";
import {
  isAlive,
  listedPid,
  signal as signalPid,
} from "../../../packages/core/src/signal";
import { leakWords } from "../../../packages/core/src/words/leaks";
import { type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

/** The agent's leak threshold for this spec, in GiB. */
const THRESHOLD_GIB = 0.25;
/** How long the memory leg waits: the climb's 768 MiB over 96 s, read in a minute's window, and room. */
const MEMORY_WAIT_MS = 180_000;
/** How long the leftover leg waits after its command ends: the grace, two looks, and room. */
const LEFT_WAIT_MS = 60_000;
const MEMORY_TAG = "PROBE-LEAK-MEM";
const LEFT_TAG = "PROBE-LEAK-LEFT";
/** The leaking process's name, as its command line shows it. */
const LEAKER = "leak-probe-M";
/** The leftover's `sleep` argument. */
const LEFTOVER = "600.0951";
/** 8 MiB more each second, 96 times, then held for 15 minutes. */
const GROW = `exec -a ${LEAKER} perl -e 'my @k; for (1 .. 96) { push @k, "x" x (8 * 1024 * 1024); select(undef, undef, undef, 1); } sleep 900;'`;
/** A `sleep` left in a session of its own, its streams its own, and a command that ends 15 s on. */
const LEAVE = `setsid sleep ${LEFTOVER} < /dev/null > /dev/null 2>&1 & sleep 15; echo LEFT-DONE`;

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const bash = (command: string, background: boolean): Reply => ({
  everyMs: 5,
  words: [],
  tool: {
    name: "Bash",
    input: {
      command,
      description: background ? "Grow memory" : "Leave a process behind",
      ...(background ? { run_in_background: true } : { timeout: 120_000 }),
    },
  },
});

const ran = { memory: false, left: false };
/** Each tagged session runs its one command, then says it is done; the hub's words to it are answered "ok". */
const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  if (request.afterTool) {
    return text("Done.");
  }
  if (request.last.includes(MEMORY_TAG) && !ran.memory) {
    ran.memory = true;
    return bash(GROW, true);
  }
  if (request.last.includes(LEFT_TAG) && !ran.left) {
    ran.left = true;
    return bash(LEAVE, false);
  }
  return text("ok");
};

/** The pids whose command line starts with `start`. */
const pidsOf = async (start: string): Promise<number[]> =>
  (await commandLines())
    .filter((line) => line.command.startsWith(start))
    .map((line) => line.pid);

/** The message the hub sent a session that carries every one of `words`, as the session read it. */
const toldWith = (seen: readonly Seen[], words: readonly string[]) =>
  seen.find((request) => words.every((word) => request.last.includes(word)))
    ?.last;

/** A typecheck run: its first line's time, its end's time, its exit and everything it said. */
interface Checked {
  code: number;
  ended: number;
  first: number;
  said: string;
}

const typecheck = async (): Promise<Checked> => {
  const child = Bun.spawn(["bun", "scripts/typecheck.ts"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  let first = 0;
  const read = async (stream: ReadableStream<Uint8Array>): Promise<string> => {
    let all = "";
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      first ||= Date.now();
      all += decoder.decode(chunk);
    }
    return all;
  };
  const [out, err, code] = await Promise.all([
    read(child.stdout),
    read(child.stderr),
    child.exited,
  ]);
  return { code, ended: Date.now(), first, said: `${out}${err}` };
};

const spec: Spec = {
  group: "Workspaces and what agents may touch",
  name: "leak-notice",
  run: async (kit: Kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent", [], { CAWCO_LEAK_MEMORY_GIB: String(THRESHOLD_GIB) });
    await fleet.agentUp();
    await fleet.accountSignedIn();
    try {
      // ── (m1), (m2) a process whose memory keeps climbing ─────────────────
      const grower = await fleet.spawn("claude", "Leak memory");
      await fleet.send(grower, `${MEMORY_TAG}: grow memory.`);
      const memoryTold = await until(
        "the session told of its leaking process",
        () => toldWith(fleet.seen, [leakWords.leaking, LEAKER]),
        Boolean,
        MEMORY_WAIT_MS
      ).catch(() => undefined);
      check(
        "(m1) the session reads that a process it started is leaking memory, naming it, its pid and what it holds",
        !!memoryTold?.includes("pid ") && memoryTold.includes("GiB resident"),
        memoryTold ?? `no such message; the command ran: ${ran.memory}`
      );
      const leakers = await pidsOf(LEAKER);
      check(
        "(m2) the leaking process is still running",
        leakers.some((pid) => isAlive(listedPid(pid))),
        `${LEAKER}: ${leakers.join(", ") || "no process"}`
      );

      // ── (o1), (o2) a process left behind by a command that ended ─────────
      const leaver = await fleet.spawn("claude", "Leave a process");
      await fleet.send(leaver, `${LEFT_TAG}: leave a process behind.`);
      const ended = await until(
        "the leaving command's end",
        () =>
          fleet.seen.find(
            (request) => request.afterTool && request.body.includes("LEFT-DONE")
          ),
        Boolean,
        120_000
      ).catch(() => undefined);
      const leftTold = await until(
        "the session told of its leftover",
        () => toldWith(fleet.seen, [leakWords.leftBehind, `sleep ${LEFTOVER}`]),
        Boolean,
        LEFT_WAIT_MS
      ).catch(() => undefined);
      check(
        "(o1) after its command ends, the session reads that a process it started is still running, naming it",
        !!ended && !!leftTold,
        leftTold ??
          `no such message; its command ${ended ? "ended" : "never ended"}`
      );
      const leftovers = await pidsOf(`sleep ${LEFTOVER}`);
      check(
        "(o2) the process left behind is still running",
        leftovers.some((pid) => isAlive(listedPid(pid))),
        `sleep ${LEFTOVER}: ${leftovers.join(", ") || "no process"}`
      );
    } finally {
      const probes = await Promise.all([
        pidsOf(LEAKER),
        pidsOf(`sleep ${LEFTOVER}`),
      ]);
      for (const pid of probes.flat()) {
        signalPid(listedPid(pid), "SIGKILL");
      }
    }

    // ── (h1) two heavy runs at once ───────────────────────────────────────
    const started = Date.now();
    const [one, two] = await Promise.all([typecheck(), typecheck()]);
    const queued = `${one.said}${two.said}`.includes("CAWCO-QUEUE");
    check(
      "(h1) two typechecks started together both run at once: each says its first check before either ends, no queue line, both pass",
      one.first > 0 &&
        two.first > 0 &&
        Math.max(one.first, two.first) < Math.min(one.ended, two.ended) &&
        !queued &&
        one.code === 0 &&
        two.code === 0,
      `first lines at +${one.first - started} ms and +${two.first - started} ms, ends at +${one.ended - started} ms and +${two.ended - started} ms, exits ${one.code} and ${two.code}, ${queued ? "a CAWCO-QUEUE line" : "no queue line"}${one.code || two.code ? `\n${one.code ? one.said.slice(-1500) : two.said.slice(-1500)}` : ""}`
    );
  },
};

export default spec;
