#!/usr/bin/env bun
/**
 * Proves the scratch-fleet leash (scratch-fleet-leash.ts): a fleet never
 * outlives the process that started it, even one killed with SIGKILL, when
 * nothing of its own `close` runs.
 *
 * A child of this probe (`… probe-fleet-leash.ts starter`) stands a scratch
 * fleet up (sessiond, hub, agent) with one OpenCode and one Claude Code
 * session running under its sessiond, then prints what it started. This
 * probe reads the child's whole tree (descendants, and the members of every
 * process group one of them leads), checks it holds an `opencode` and a
 * `claude`, SIGKILLs the child, and waits {@link WITHIN_MS} for the tree to
 * be gone: no pid of it alive (a zombie counts as gone), no process left in
 * a group it led, and `pgrep -f` finding no process on the fleet's own entry
 * paths in this checkout. PASS or FAIL, with what was left; anything left is
 * killed and the fleet's dirs removed either way.
 *
 * Run: `bun scripts/probe-fleet-leash.ts` (Linux or macOS).
 */
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  commandLine,
  processLineage,
} from "../packages/core/src/process-identity";
import { ensureDeps } from "./lib/deps";
import { treeOf } from "./scratch-fleet-leash";

// The dependencies first (lib/deps.ts): the fleet loads after them.
await ensureDeps();
const { scratchFleet } = await import("./scratch-fleet");

const WITHIN_MS = 10_000;
const ENTRIES = [
  "packages/hub/src/index.ts",
  "packages/agent/src/cli.ts",
  "packages/sessiond/src/main.ts",
];

interface Started {
  home: string;
  pids: Record<string, number>;
  runtime: string;
  sandbox: string;
}

const starter = async () => {
  const fleet = await scratchFleet({
    name: "probe-fleet-leash",
    respond: () => ({ everyMs: 20, words: ["leashed"] }),
  });
  const sessiond = fleet.launch("sessiond");
  await fleet.sessiondUp();
  const hub = fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  const agent = fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await fleet.spawn("opencode", "leash opencode");
  await fleet.spawn("claude", "leash claude");
  const started: Started = {
    pids: { sessiond: sessiond.pid, hub: hub.pid, agent: agent.pid },
    sandbox: fleet.sandbox,
    home: fleet.home,
    runtime: fleet.env.XDG_RUNTIME_DIR ?? "",
  };
  console.log(`FLEET ${JSON.stringify(started)}`);
  // Held until this probe kills it: nothing of the fleet's own `close` runs.
  await new Promise(() => undefined);
};

/**
 * Whether `pid` runs: the kernel has it (a signal 0 reaches it, or is refused
 * it, EPERM), and it is no zombie waiting to be reaped. A command line that
 * cannot be read never makes a running process count as gone.
 */
const runs = async (pid: number): Promise<boolean> => {
  try {
    process.kill(pid, 0);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
  const line = await commandLine(pid).catch(() => undefined);
  return !line?.endsWith("<defunct>");
};

/** What is left of the tree: its pids still running, members of its groups, and processes on the fleet's entry paths. */
const leftOf = async (
  tree: Set<number>,
  root: string
): Promise<Map<number, string>> => {
  const left = new Map<number, string>();
  const rows = await processLineage();
  const inGroups = rows
    .filter((row) => tree.has(row.pgid) && !tree.has(row.pid))
    .map((row) => row.pid);
  const byPath = (
    await Promise.all(
      ENTRIES.map((entry) =>
        Bun.$`pgrep -f ${join(root, entry)}`.nothrow().quiet().text()
      )
    )
  )
    .join("\n")
    .split("\n")
    .filter(Boolean)
    .map(Number)
    .filter((pid) => pid !== process.pid);
  for (const pid of new Set([...tree, ...inGroups, ...byPath])) {
    // biome-ignore lint/performance/noAwaitInLoops: a few dozen pids, read once each
    if (await runs(pid)) {
      left.set(pid, (await commandLine(pid)) ?? "?");
    }
  }
  return left;
};

/** The starter's own lines, echoed, until the one naming what it started; none when it exits first. */
const fleetOf = async (
  stdout: ReadableStream<Uint8Array>
): Promise<Started | undefined> => {
  let text = "";
  const decoder = new TextDecoder();
  for await (const chunk of stdout) {
    text += decoder.decode(chunk);
    const lines = text.split("\n");
    text = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("FLEET ")) {
        return JSON.parse(line.slice("FLEET ".length)) as Started;
      }
      console.log(`  starter: ${line}`);
    }
  }
};

const main = async () => {
  const root = resolve(import.meta.dir, "..");
  const child = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, "probe-fleet-leash.ts"),
      "starter",
    ],
    { stdout: "pipe", stderr: "inherit" }
  );
  console.log(`… the starter runs, pid ${child.pid}`);
  const started = await fleetOf(child.stdout);
  if (!started) {
    console.log(
      `FAIL: the starter exited ${await child.exited} before its fleet was up`
    );
    process.exit(1);
  }
  const tree = await treeOf(child.pid);
  const named = await Promise.all(
    [...tree].map(async (pid) => ({
      pid,
      line: (await commandLine(pid).catch(() => undefined)) ?? "",
    }))
  );
  // OpenCode 2 runs as `opencode2 serve`; Claude Code as the Agent SDK's `claude`.
  const opencode = named.filter(({ line }) => line.includes("opencode"));
  const claude = named.filter(({ line }) => line.includes("claude"));
  console.log(
    `… the fleet's tree: ${tree.size} processes (hub ${started.pids.hub}, agent ${started.pids.agent}, sessiond ${started.pids.sessiond}), ${opencode.length} opencode, ${claude.length} claude`
  );
  for (const { pid, line } of named) {
    console.log(`  ${pid} ${line.slice(0, 160)}`);
  }
  let failure: string | undefined;
  if (opencode.length === 0 || claude.length === 0) {
    failure = `the fleet held no ${opencode.length === 0 ? "opencode" : "claude"} process to prove on`;
  }

  process.kill(child.pid, "SIGKILL");
  const killedAt = Date.now();
  console.log(`… the starter (pid ${child.pid}) killed with SIGKILL`);
  let left = await leftOf(tree, root);
  while (left.size > 0 && Date.now() - killedAt < WITHIN_MS) {
    // biome-ignore lint/performance/noAwaitInLoops: one look every quarter second until the deadline
    await Bun.sleep(250);
    left = await leftOf(tree, root);
  }
  const took = Date.now() - killedAt;
  if (left.size > 0) {
    failure ??= `${left.size} of the fleet's processes still ran ${took} ms after its starter was killed:\n${[
      ...left,
    ]
      .map(([pid, line]) => `  ${pid} ${line}`)
      .join("\n")}`;
    for (const pid of left.keys()) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // gone already
      }
    }
  }
  await Promise.all(
    [started.sandbox, started.home, started.runtime]
      .filter(Boolean)
      .map((dir) => rm(dir, { recursive: true, force: true }))
  );
  if (failure) {
    console.log(`FAIL: ${failure}`);
    process.exit(1);
  }
  console.log(
    `PASS: all ${tree.size} of the fleet's processes (${opencode.length} opencode, ${claude.length} claude) were gone ${took} ms after its starter was killed`
  );
  process.exit(0);
};

if (process.argv[2] === "starter") {
  await starter();
} else {
  await main();
}
