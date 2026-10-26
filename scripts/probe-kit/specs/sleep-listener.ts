/**
 * Linux's sleep and wake listener ends with the agent that started it,
 * however the agent ends, SIGKILL included (agent/src/activity.ts
 * `hearSleep`, its gdbus under the `TETHER`).
 *
 * A private D-Bus daemon stands in for the system bus (gdbus reads
 * `DBUS_SYSTEM_BUS_ADDRESS`), its AppArmor mediation off so it starts inside
 * a workspace. A child agent (sleep-listener-child.ts) starts the listener
 * with the agent's own `hearSleep` and says `listening` once gdbus monitors
 * logind's path.
 *
 * 1. The listener stands: the tether shell, gdbus and the tether's `cat`,
 *    each under the agent.
 * 2. gdbus ends first (SIGTERM): the tether ends with it, the agent alive.
 * 2b. The tether shell is sent SIGTERM: gdbus and its cat go with it.
 * 3. A second agent's listener; the agent is SIGKILLed: every process of the
 *    listener is gone within a second.
 *
 * Runs on Linux only.
 *
 *   bun scripts/probe-kit/run.ts sleep-listener
 */
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  commandLine,
  processLineage,
} from "../../../packages/core/src/process-identity";
import { listedPid, signal } from "../../../packages/core/src/signal";
import type { Kit, Spec } from "../kit";

const CHILD = join(import.meta.dir, "..", "sleep-listener-child.ts");
/** How long the listener has to be gone. The brief's bar. */
const GONE_MS = 1000;
/** How long gdbus has to say it monitors. Our call: it says it in milliseconds. */
const LISTEN_MS = 10_000;

/** Whether `pid` runs now: listed, and no zombie. */
const runs = (pid: number): boolean => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.charAt(stat.lastIndexOf(")") + 2) !== "Z";
  } catch {
    return false;
  }
};

/** Every descendant of `root` now, with its command line. */
const descendants = async (
  root: number
): Promise<{ pid: number; args: string }[]> => {
  const rows = await processLineage();
  const tree = new Set<number>([root]);
  for (let grew = true; grew;) {
    grew = false;
    for (const row of rows) {
      if (!tree.has(row.pid) && tree.has(row.ppid)) {
        tree.add(row.pid);
        grew = true;
      }
    }
  }
  tree.delete(root);
  return Promise.all(
    [...tree].map(async (pid) => ({
      pid,
      args: (await commandLine(pid)) ?? "",
    }))
  );
};

/** Waits until none of `pids` runs, or `ms` passes: how long it took, or undefined. */
const goneWithin = async (
  pids: readonly number[],
  ms: number
): Promise<number | undefined> => {
  const from = performance.now();
  while (performance.now() - from <= ms) {
    if (!pids.some(runs)) {
      return Math.round(performance.now() - from);
    }
    // biome-ignore lint/performance/noAwaitInLoops: polls the process table until the listener is gone
    await Bun.sleep(10);
  }
};

/** Reads `stream` until a line `word`, or `ms` passes. */
const saysWithin = async (
  stream: ReadableStream<Uint8Array>,
  word: string,
  ms: number
): Promise<boolean> => {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let said = "";
  const deadline = Bun.sleep(ms).then(() => false);
  const heard = (async () => {
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: one chunk at a time until the word
      const { value, done } = await reader.read();
      if (done) {
        return false;
      }
      said += decoder.decode(value, { stream: true });
      if (said.split("\n").includes(word)) {
        return true;
      }
    }
  })();
  const ok = await Promise.race([heard, deadline]);
  reader.releaseLock();
  return ok;
};

const spec: Spec = {
  group: "The hub and machines",
  name: "sleep-listener",
  async run(kit: Kit) {
    const { check } = kit;
    if (process.platform !== "linux") {
      kit.note("sleep-listener: Linux's listener, read on Linux only");
      return;
    }
    const dir = await mkdtemp(join(process.env.TMPDIR ?? "/tmp", "sleep-bus-"));
    const socket = join(dir, "bus");
    const config = join(dir, "bus.conf");
    await writeFile(
      config,
      `<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-Bus Bus Configuration 1.0//EN" "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <type>custom</type>
  <listen>unix:path=${socket}</listen>
  <auth>EXTERNAL</auth>
  <apparmor mode="disabled"/>
  <policy context="default">
    <allow send_destination="*" eavesdrop="true"/>
    <allow eavesdrop="true"/>
    <allow own="*"/>
  </policy>
</busconfig>
`
    );
    const bus = Bun.spawn(
      [
        "dbus-daemon",
        `--config-file=${config}`,
        "--nofork",
        "--print-address=1",
      ],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" }
    );
    const agents: Bun.Subprocess[] = [];
    try {
      // dbus-daemon says its address on its first line and keeps stdout open.
      const reader = bus.stdout.getReader();
      const { value } = await reader.read();
      reader.releaseLock();
      const address = new TextDecoder().decode(value).split("\n")[0]?.trim();
      if (
        !check(
          "a private bus stands in for the system bus",
          !!address?.startsWith("unix:"),
          address || (await new Response(bus.stderr).text()).trim()
        )
      ) {
        return;
      }
      const start = async () => {
        const agent = Bun.spawn([process.execPath, CHILD], {
          env: { ...process.env, DBUS_SYSTEM_BUS_ADDRESS: address },
          stdin: "ignore",
          stdout: "pipe",
          stderr: "inherit",
        });
        agents.push(agent);
        const listening = await saysWithin(
          agent.stdout,
          "listening",
          LISTEN_MS
        );
        return { agent, listening, under: await descendants(agent.pid) };
      };

      // 1 and 2: the listener stands; gdbus ends first, and the tether with it.
      const first = await start();
      const named = (under: { pid: number; args: string }[]) =>
        under.map((one) => `${one.pid} ${one.args}`).join("; ");
      const gdbus = first.under.find((one) =>
        one.args.split(" ")[0]?.endsWith("/gdbus")
      );
      const shell = first.under.find((one) =>
        one.args.startsWith("/bin/sh -c")
      );
      check(
        "the listener stands under the agent: gdbus, its tether shell and the tether's cat",
        first.listening &&
          !!gdbus &&
          !!shell &&
          first.under.some((one) => one.args === "cat"),
        `listening ${first.listening}; ${named(first.under)}`
      );
      if (gdbus) {
        signal(listedPid(gdbus.pid), "SIGTERM");
        const took = await goneWithin(
          first.under.map((one) => one.pid),
          GONE_MS
        );
        check(
          "gdbus ending first ends its tether, and the agent lives on",
          took !== undefined && runs(first.agent.pid),
          took === undefined
            ? `still running after ${GONE_MS} ms: ${named(first.under.filter((one) => runs(one.pid)))}`
            : `all gone in ${took} ms; agent ${first.agent.pid} running ${runs(first.agent.pid)}`
        );
      }

      // 2b: the tether shell signalled ends gdbus with it.
      const signalled = await start();
      const tetherShell = signalled.under.find((one) =>
        one.args.startsWith("/bin/sh -c")
      );
      if (
        check(
          "a listener for the tether's own signal stands",
          signalled.listening && !!tetherShell,
          named(signalled.under)
        ) &&
        tetherShell
      ) {
        signal(listedPid(tetherShell.pid), "SIGTERM");
        const took = await goneWithin(
          signalled.under.map((one) => one.pid),
          GONE_MS
        );
        check(
          "the tether shell ended by SIGTERM takes gdbus and its cat with it",
          took !== undefined,
          took === undefined
            ? `still running: ${named(signalled.under.filter((one) => runs(one.pid)))}`
            : `all gone in ${took} ms`
        );
      }

      // 3: the agent is SIGKILLed, and its listener goes with it.
      const second = await start();
      check(
        "a second agent's listener stands",
        second.listening && second.under.length >= 3,
        `listening ${second.listening}; ${named(second.under)}`
      );
      second.agent.kill("SIGKILL");
      await second.agent.exited;
      const took = await goneWithin(
        second.under.map((one) => one.pid),
        GONE_MS
      );
      check(
        `the agent SIGKILLed, every process of its listener is gone within ${GONE_MS} ms`,
        took !== undefined,
        took === undefined
          ? `still running: ${named(second.under.filter((one) => runs(one.pid)))}`
          : `${second.under.length} processes (${named(second.under)}) gone ${took} ms after the agent ended by ${second.agent.signalCode}`
      );
    } finally {
      for (const agent of agents) {
        agent.kill("SIGKILL");
      }
      bus.kill("SIGKILL");
      await bus.exited;
      await rm(dir, { recursive: true, force: true });
    }
  },
};

export default spec;
