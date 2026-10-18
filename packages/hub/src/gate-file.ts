/**
 * A project's landing gate, as it declares it: `gate.md` in its hub folder,
 * beside `stages.md` and `delegates/` (Projects spec §5.1). The hub runs
 * exactly the steps it names on the tree about to land, whatever the
 * project's language or toolchain, and nothing of its own: no install, no
 * script it guesses from a lockfile or a package.json. A project with no
 * gate.md, or one that names no step, lands with no checks, and its report
 * says so.
 *
 * ```
 * ---
 * bun install --frozen-lockfile
 *   on-fail: stop
 * bun run lint:changed
 * bun run typecheck
 * bash apps/apple/scripts/build-both.sh ios --gate
 *   name: iOS build compiles
 *   on: apps/apple, scripts/lib/heavy-run.sh
 *   needs: apple
 *   timeout: 30m
 * ---
 * Anything after the block is notes for people; the hub reads none of it.
 * ```
 *
 * - **A step** is a line that starts at the margin: the shell command, run in
 *   the workspace's checkout (inside its boundary), passing when it exits 0.
 *   Steps run in the order written. A line starting `#` is a comment.
 * - **Its options** are the indented `key: value` lines under it:
 *   - `name:` what the report calls it; the command when not given.
 *   - `on:` the paths (files or folders, comma-separated, from the
 *     repository's root) whose change makes it run: it runs only for an item
 *     whose diff against its target touches one. Without `on:` it always
 *     runs. A step with `on:` keeps its pass by those paths' trees, so a
 *     rebase that left them alone does not run it again.
 *   - `needs:` a machine capability (runs-on.ts: `apple`, `linux`): the step
 *     runs on an online machine that has it, in a gate workspace there at
 *     the item's last commit. With none online the item does not land, and
 *     its finish_item says why.
 *   - `timeout:` how long it may run, like `90s`, `10m` or `1h`; 10 minutes
 *     when not given.
 *   - `on-fail: stop`: a failure of this step leaves the steps after it
 *     unrun (an install the rest depend on). Without it every step runs, and
 *     each failure is reported.
 *
 * A gate.md that does not read is never taken for none: the item does not
 * land, and finish_item names every problem.
 */
import { namedAmong } from "@cawco/core";
import { Elysia } from "elysia";
import { FolderRefusal, readFolderFile, refused } from "./project-folder";
import {
  capabilitiesOf,
  RUNS_ON_CAPABILITIES,
  type RunsOnCapability,
  runsOnWords,
} from "./runs-on";

/** The file in the project's folder that declares its gate. */
export const GATE_FILE = "gate.md";

/** A step as the project declares it. */
export interface DeclaredStep {
  command: string;
  /** The paths whose change makes it run; absent: it always runs. */
  inputs?: string[];
  /** What the report calls it. */
  name: string;
  /** The capability of the machine it runs on; absent: the workspace's own. */
  needs?: RunsOnCapability;
  /** A failure leaves the steps after it unrun. */
  stopsRest: boolean;
  /** Seconds before it is killed; the gate's default when absent. */
  timeoutSec?: number;
}

/** What reading gate.md answers: its steps, or every problem it has. */
export type GateReading =
  { ok: true; steps: DeclaredStep[] } | { ok: false; problems: string[] };

/**
 * A project's gate: `none` with no gate.md; `declared`, its steps (none
 * when its block names none); `unreadable`, what is wrong with it.
 */
export type ProjectGate =
  | { kind: "none" }
  | { kind: "declared"; steps: DeclaredStep[] }
  | { kind: "unreadable"; problems: string[] };

const FENCE = /^---\s*$/;
const LINE_SPLIT = /\r?\n/;
const INDENTED = /^\s/;
const OPTION = /^([a-z-]+):\s*(.*)$/;
const DURATION = /^(\d{1,5})(s|m|h)$/;
const SECONDS = { s: 1, m: 60, h: 3600 } as const;
/** A day: no landing gate step waits longer. */
const MOST_SEC = 86_400;
const GLOB = /[*?[\]{}]/;
const TRAILING = /\/(\*\*)?$/;
const LEADING = /^\.\//;
const KEYS = ["name", "on", "needs", "timeout", "on-fail"] as const;
type Key = (typeof KEYS)[number];

/**
 * One `on:` path as the diff names paths: from the repository's root, `/`
 * between parts, no trailing `/` or `/**`. A problem when it is absolute,
 * climbs out, or is a pattern.
 */
const inputPath = (raw: string): { path: string } | { problem: string } => {
  const path = raw.trim().replace(LEADING, "").replace(TRAILING, "");
  if (!path) {
    return { problem: `on: has an empty path in “${raw}”.` };
  }
  if (path.startsWith("/")) {
    return {
      problem: `on: ${path} is absolute; name it from the repository's root, like apps/web.`,
    };
  }
  if (path.split("/").includes("..")) {
    return { problem: `on: ${path} climbs out of the repository with “..”.` };
  }
  if (GLOB.test(path)) {
    return {
      problem: `on: ${path} is a pattern; name a file or a folder (a folder covers everything under it).`,
    };
  }
  return { path };
};

/** One option of `step`, applied; a problem in words when it does not read. */
const applyOption = (
  step: DeclaredStep,
  key: Key,
  value: string
): string | undefined => {
  switch (key) {
    case "name":
      if (!value) {
        return `name: under “${step.command}” is empty.`;
      }
      step.name = value;
      return;
    case "on": {
      const paths: string[] = [];
      for (const part of value.split(",")) {
        const read = inputPath(part);
        if ("problem" in read) {
          return read.problem;
        }
        paths.push(read.path);
      }
      step.inputs = [...new Set(paths)];
      return;
    }
    case "needs":
      if (!(RUNS_ON_CAPABILITIES as string[]).includes(value)) {
        return `needs: “${value}” under “${step.command}” is not a capability; it is ${RUNS_ON_CAPABILITIES.join(" or ")}.`;
      }
      step.needs = value as RunsOnCapability;
      return;
    case "timeout": {
      const match = DURATION.exec(value);
      const seconds = match
        ? Number(match[1]) * SECONDS[match[2] as keyof typeof SECONDS]
        : 0;
      if (!(seconds > 0 && seconds <= MOST_SEC)) {
        return `timeout: “${value}” under “${step.command}” is not a duration from 1s to 24h, like 90s, 10m or 1h.`;
      }
      step.timeoutSec = seconds;
      return;
    }
    default:
      if (value !== "stop") {
        return `on-fail: “${value}” under “${step.command}” is not stop (leave it out to run every step).`;
      }
      step.stopsRest = true;
      return;
  }
};

/**
 * One indented option line, `text`, applied to `step` (undefined: none
 * above it), with the keys `seen` under it so far; a problem in words when
 * it does not read.
 */
const optionLine = (
  text: string,
  step: DeclaredStep | undefined,
  seen: Set<Key>
): string | undefined => {
  if (!step) {
    return `“${text}” is indented before any step: an option goes under the step it belongs to.`;
  }
  const option = OPTION.exec(text);
  const key = option?.[1] as Key | undefined;
  if (!(option && key && (KEYS as readonly string[]).includes(key))) {
    return `“${text}” under “${step.command}” is not an option; options are ${KEYS.map((each) => `${each}:`).join(", ")}.`;
  }
  if (seen.has(key)) {
    return `${key}: is given twice under “${step.command}”.`;
  }
  seen.add(key);
  return applyOption(step, key, (option[2] ?? "").trim());
};

/** gate.md's block as steps, or every problem it has. */
export const readGate = (content: string): GateReading => {
  const lines = content.split(LINE_SPLIT);
  const start = lines.findIndex((line) => line.trim() !== "");
  const end =
    start >= 0 && FENCE.test(lines[start] ?? "")
      ? lines.findIndex((line, at) => at > start && FENCE.test(line))
      : -1;
  if (end < 0) {
    return {
      ok: false,
      problems: [
        "gate.md holds no block: its steps go between a --- line and the next --- line.",
      ],
    };
  }
  const steps: DeclaredStep[] = [];
  const problems: string[] = [];
  /** The option keys given under the last step so far. */
  let seen = new Set<Key>();
  for (const line of lines.slice(start + 1, end)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) {
      continue;
    }
    if (INDENTED.test(line)) {
      const problem = optionLine(text, steps.at(-1), seen);
      if (problem) {
        problems.push(problem);
      }
      continue;
    }
    steps.push({ command: text, name: text, stopsRest: false });
    seen = new Set();
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, steps };
};

/** The project's gate as its folder holds it now. */
export const projectGate = async (projectId: string): Promise<ProjectGate> => {
  let content: string;
  try {
    ({ content } = await readFolderFile(projectId, GATE_FILE));
  } catch (error) {
    if (error instanceof FolderRefusal && error.status === 404) {
      return { kind: "none" };
    }
    throw error;
  }
  const reading = readGate(content);
  return reading.ok
    ? { kind: "declared", steps: reading.steps }
    : { kind: "unreadable", problems: reading.problems };
};

/**
 * `GET /api/projects/:id/gate`: the project's gate as the hub reads it now,
 * for Settings: `none`, its steps, or what keeps gate.md from reading. The
 * file is written as any folder file is (`PUT /api/projects/:id/folder/file`
 * with `path: "gate.md"`).
 */
export const gateRoutes = (projectExists: (id: string) => boolean) =>
  new Elysia().get("/api/projects/:id/gate", async ({ params }) => {
    try {
      if (!projectExists(params.id)) {
        throw new FolderRefusal(404, `The hub keeps no project ${params.id}.`);
      }
      return { file: GATE_FILE, gate: await projectGate(params.id) };
    } catch (error) {
      return refused(error);
    }
  });

/** Whether `inputs` covers `path`: the path itself, or one under a folder it names. */
export const covers = (inputs: readonly string[], path: string): boolean =>
  inputs.some((input) => path === input || path.startsWith(`${input}/`));

/**
 * The item's own changes against its target, one path per line: from where
 * HEAD left `origin/<base>` to HEAD, renames on both sides. Nothing for a
 * clone with no `origin`, which lands nowhere (landing.ts `no-remote`). Run
 * in its workspace, through the safe git shell.
 */
export const changedPathsCommand = (quotedBase: string): string =>
  `if git remote get-url origin >/dev/null 2>&1; then base=$(git merge-base ${quotedBase} HEAD) && git diff --name-only --no-renames "$base" HEAD; fi`;

/** The diff's output as paths: one per line, blanks dropped. */
export const diffPaths = (stdout: string): string[] =>
  stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** The machines a step that `needs` a capability may run on: online, and having it by the OS each reported. */
export const capableMachines = <M extends { machineId: string; os: string }>(
  machines: readonly M[],
  capability: RunsOnCapability,
  online: (machineId: string) => boolean
): M[] =>
  machines.filter(
    (machine) =>
      capabilitiesOf(machine.os).includes(capability) &&
      online(machine.machineId)
  );

/** When a machine was last seen, in ms; 0 when never. */
const seenAt = (machine: {
  lastSeenAt: Date | number | string | null;
}): number =>
  machine.lastSeenAt === null ? 0 : new Date(machine.lastSeenAt).getTime();

/**
 * The machine with `capability` seen last, named among the fleet (core
 * `namedAmong`); undefined when none ever registered.
 */
export const lastCapable = (
  machines: readonly {
    hostname: string;
    lastSeenAt: Date | number | string | null;
    machineId: string;
    os: string;
  }[],
  capability: RunsOnCapability
): string | undefined => {
  const [last] = capableMachines(machines, capability, () => true).sort(
    (a, b) => seenAt(b) - seenAt(a)
  );
  return last ? namedAmong(last, machines) : undefined;
};

/**
 * Why an item does not land while no machine a step needs is online, in one
 * sentence: what it changed (for a step with `on:`), the step, and the
 * machine it would have used, by name, or that the hub knows none.
 */
export const capableRefusal = (
  step: { name: string; needs: RunsOnCapability },
  touched: readonly string[],
  last: string | undefined
): string => {
  const needs = runsOnWords(step.needs);
  const why =
    touched.length === 0
      ? `This project's landing gate runs “${step.name}” on ${needs}`
      : `This item changes ${touched.length === 1 ? touched[0] : `${touched.length} files “${step.name}” reads (${touched[0]} first)`}, so it lands only once “${step.name}” passes on ${needs}`;
  const machines = last ? `${last} is offline` : "the hub knows none";
  return `${why}, and none is online (${machines}): wait for one with wait_item and call finish_item again, or call it with blocked.`;
};
