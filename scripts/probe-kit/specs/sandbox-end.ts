/**
 * A workspace sandbox the srt host ends itself (a guard's restart, its
 * close), or the agent stops, ends for certain: its init, the pid
 * namespace's process 1, before its outer bwrap (agent sandbox-end.ts
 * `endSandbox`), never by bwrap's `--die-with-parent` alone. And the host
 * signals through the signal wall without loading core's index.
 *
 * Runs in any workspace: no namespace is made. A stand-in sandbox is two
 * real processes, an "outer" shell and the "init" it starts.
 *
 * - e1. The init is the one on record only while its parent is the outer:
 *   another parent, or none (gone), and it is not signalled.
 * - e2. `endSandbox` on a live stand-in: its init and its outer are both
 *   gone, the init by the wall's own signal, and it answers that the init
 *   was there.
 * - e3. A pid on record that names another process now (its parent is not
 *   the outer) is left alive; the outer is still killed.
 * - e4. The wall's sending half refuses -1, 0, 1, NaN and 2.5 before
 *   anything is sent, as signal.ts always did (the signal-wall spec proves
 *   the rest through signal.ts, which now sends through it).
 * - e5. The host signals through core's signal-wall.ts, by way of
 *   sandbox-end.ts, which between them reach no other file of the
 *   repository; it reaches no signal.ts, and sends no signal of its own
 *   (no raw call in its text).
 *
 * What it cannot show, a host leg: a real srt host whose guard restarts its
 * sandbox (a guarded path renamed on the host) leaves no process of the old
 * namespace, its init and a background command in it gone, with the new
 * sandbox running.
 *
 *   bun scripts/probe-kit/run.ts sandbox-end
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  endSandbox,
  sandboxInit,
} from "../../../packages/agent/src/sandbox-end";
import {
  isSignalRefused,
  listedPid,
  signal,
} from "../../../packages/core/src/signal-wall";
import { until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");
const HOST = join(ROOT, "packages/agent/src/boundary-host.ts");
/** A raw signal call, spelled so this file holds none (scripts/signal-check.ts). */
const RAW_KILL = ["process", "kill("].join(".");

/** Whether `pid` names a live process now (not a zombie). */
const alive = (pid: number): boolean => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return stat.at(stat.lastIndexOf(")") + 2) !== "Z";
  } catch {
    return false;
  }
};

/** A stand-in sandbox: an outer shell, and the init it started (its one child). */
const standIn = async (): Promise<{
  outer: ReturnType<typeof Bun.spawn>;
  inner: number;
}> => {
  const outer = Bun.spawn(["/bin/sh", "-c", "sleep 600 & wait"], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  const inner = await until(
    "the stand-in's init",
    () =>
      Number(
        readFileSync(`/proc/${outer.pid}/task/${outer.pid}/children`, "utf8")
          .trim()
          .split(" ")[0]
      ) || undefined,
    Boolean,
    10_000
  );
  return { outer, inner };
};

const pureLegs = (kit: Kit): void => {
  const sandbox = { inner: 4242, outer: 4241 };
  const read = [
    sandboxInit(sandbox, () => 4241),
    sandboxInit(sandbox, () => 1),
    sandboxInit(sandbox, () => undefined),
  ];
  kit.check(
    "e1: the init on record is the sandbox's only while its parent is the outer bwrap; another parent or none and it is not signalled",
    read[0] === 4242 && read[1] === undefined && read[2] === undefined,
    `parent outer: ${read[0]}, parent 1: ${read[1]}, gone: ${read[2]}`
  );
  const refused = [-1, 0, 1, Number.NaN, 2.5].map((value) => {
    try {
      listedPid(value);
      return `${value}: made`;
    } catch (error) {
      return `${value}: ${isSignalRefused(error) ? "refused" : String(error)}`;
    }
  });
  kit.check(
    "e4: the wall's sending half refuses -1, 0, 1, NaN and 2.5 before anything is sent",
    refused.every((one) => one.endsWith(": refused")),
    refused.join(", ")
  );
};

const liveLegs = async (kit: Kit): Promise<void> => {
  const first = await standIn();
  const outerPid = first.outer.pid;
  const was = endSandbox({ inner: first.inner, outer: outerPid }, () =>
    first.outer.kill("SIGKILL")
  );
  await first.outer.exited;
  const initGone = await until(
    "the init gone",
    () => (alive(first.inner) ? undefined : true),
    Boolean,
    5000
  ).catch(() => false);
  kit.check(
    "e2: endSandbox on a live stand-in ends its init and its outer bwrap, and says the init was there",
    was && initGone && !alive(outerPid),
    `init ${first.inner} ${alive(first.inner) ? "alive" : "gone"}, outer ${outerPid} ${alive(outerPid) ? "alive" : "gone"}, answered ${was}`
  );

  const second = await standIn();
  const other = Bun.spawn(["sleep", "600"], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  try {
    const wrong = endSandbox(
      { inner: other.pid, outer: second.outer.pid },
      () => second.outer.kill("SIGKILL")
    );
    await second.outer.exited;
    kit.check(
      "e3: a pid on record whose parent is not the outer bwrap is left alive, and the outer is still killed",
      !wrong && alive(other.pid) && !alive(second.outer.pid),
      `other ${other.pid} ${alive(other.pid) ? "alive" : "gone"}, outer ${second.outer.pid} ${alive(second.outer.pid) ? "alive" : "gone"}, answered ${wrong}`
    );
  } finally {
    other.kill("SIGKILL");
    // The second stand-in's own init, orphaned by its outer's kill.
    if (alive(second.inner)) {
      signal(listedPid(second.inner), "SIGKILL");
    }
  }
};

/** Every repository file `entry` reaches by its imports, by path from the root. */
const reached = (entry: string): Set<string> => {
  const seen = new Set<string>();
  const transpiler = new Bun.Transpiler({ loader: "ts" });
  const visit = (file: string): void => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    // A JSON file's import is data, with nothing to follow.
    const imports = file.endsWith(".json")
      ? []
      : transpiler.scanImports(readFileSync(file, "utf8"));
    for (const { path } of imports) {
      let resolved: string;
      try {
        resolved = Bun.resolveSync(path, dirname(file));
      } catch {
        continue;
      }
      if (resolved.startsWith(ROOT) && !resolved.includes("node_modules")) {
        visit(resolved);
      }
    }
  };
  visit(entry);
  return new Set([...seen].map((file) => relative(ROOT, file)));
};

const importLeg = (kit: Kit): void => {
  const host = reached(HOST);
  const end = reached(join(ROOT, "packages/agent/src/sandbox-end.ts"));
  const hostText = readFileSync(HOST, "utf8");
  kit.check(
    "e5: the srt host signals through core's signal-wall.ts, which with sandbox-end.ts reaches no other file of the repository, never through signal.ts, and sends no signal of its own",
    host.has("packages/core/src/signal-wall.ts") &&
      host.has("packages/agent/src/sandbox-end.ts") &&
      !host.has("packages/core/src/signal.ts") &&
      [...end].every(
        (file) =>
          file === "packages/agent/src/sandbox-end.ts" ||
          file === "packages/core/src/signal-wall.ts"
      ) &&
      !hostText.includes(RAW_KILL),
    `sandbox-end.ts reaches ${[...end].join(", ")}; the host reaches ${host.size} files, signal.ts ${host.has("packages/core/src/signal.ts") ? "among them" : "not among them"}`
  );
};

const spec: Spec = {
  name: "sandbox-end",
  run: async (kit: Kit) => {
    pureLegs(kit);
    await liveLegs(kit);
    importLeg(kit);
  },
};

export default spec;
