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
 * bun run check --all
 * bash apps/apple/scripts/build-both.sh ios --gate --targets {targets}
 *   name: iOS build compiles
 *   targets: apps/apple/targets.json
 *   needs: apple
 *   timeout: 30m
 * Caw edits:
 *   docs/**
 *   README.md
 * Ship: bash scripts/ship.sh --commit {commit} --notes {notes}
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
 *   - `targets:` a target map (app-targets.ts: which folders feed which
 *     build target, and which files every build reads), from the
 *     repository's root, in place of `on:`. The step runs only when the
 *     item's diff changes a file the map gives a target, with `{targets}` in
 *     its command the targets to build: those, plus every target depending
 *     on them, deps first, comma-separated. A diff that changes none runs
 *     nothing, and its report says so. Its pass is kept by the trees of
 *     what those targets compile. The hub reads the map as the tree that
 *     lands holds it: the item's own when it changes it, else its target's.
 *   - `needs:` a machine capability (runs-on.ts: `apple`, `linux`): the step
 *     runs on an online machine that has it, in a gate workspace there at
 *     the item's last commit. With none online the item does not land, and
 *     its finish_item says why.
 *   - `timeout:` how long it may run, like `90s`, `10m` or `1h`; 10 minutes
 *     when not given.
 *   - `on-fail: stop`: a failure of this step leaves the steps after it
 *     unrun (an install the rest depend on). Without it every step runs, and
 *     each failure is reported.
 * - **`Caw edits:`**, a line at the margin, opens the files the project's
 *   Caw may edit by hand (lead-gate.ts): each indented line under it one
 *   glob (Bun.Glob: `*`, `**`, `?`, `[…]`, `{a,b}`; case-sensitive, so
 *   `[mM]` for either case of an m), from the place's root. The next line at the
 *   margin is a step again. Without the section the project declares no
 *   list, and every edit of Caw's goes to your Approve card; with it, an
 *   edit of a file it matches runs in a turn your words woke (on your card
 *   in any other), and an edit of any other file is refused. Given empty, it
 *   lets Caw edit nothing.
 * - **`Ship:`**, a line at the margin with a command beside it: how the
 *   project ships. An item whose `finish_item` asks to ship (`ship`, with its
 *   release notes) has it run once its work landed on main, on the hub's own
 *   machine, in the project's checkout there (ship.ts), with `{commit}` the
 *   landed commit and `{notes}` a file of the notes. Without it nothing
 *   ships, and such a finish_item says so.
 *
 * A gate.md that does not read is never taken for none: the item does not
 * land, and finish_item names every problem.
 */
import {
  type DeclaredStep,
  machineCalled,
  type ProjectGate,
  type RunsOnCapability,
} from "@cawco/core";
import { Elysia } from "elysia";
import { FolderRefusal, readFolderFile, refused } from "./project-folder";
import { capabilitiesOf, RUNS_ON_CAPABILITIES, runsOnWords } from "./runs-on";

/** The file in the project's folder that declares its gate. */
export const GATE_FILE = "gate.md";

/**
 * What reading gate.md answers: its steps (core `DeclaredStep`), its `Caw
 * edits:` globs (absent: it declares no list) and its `Ship:` command
 * (absent: it ships nothing), or every problem it has.
 */
export type GateReading =
  | { ok: true; steps: DeclaredStep[]; cawEdits?: string[]; ship?: string }
  | { ok: false; problems: string[] };

/**
 * The files a project's Caw may edit, as its gate.md declares them:
 * `none` when it lists none (no gate.md, or no `Caw edits:` section);
 * `declared`, its globs; `unreadable`, what keeps gate.md from reading.
 */
export type CawEdits =
  | { kind: "none" }
  | { kind: "declared"; globs: string[] }
  | { kind: "unreadable"; problems: string[] };

const FENCE = /^---\s*$/u;
const LINE_SPLIT = /\r?\n/u;
const INDENTED = /^\s/u;
const OPTION = /^([a-z-]+):\s*(.*)$/u;
const DURATION = /^(\d{1,5})(s|m|h)$/u;
const SECONDS = { s: 1, m: 60, h: 3600 } as const;
/** A day: no landing gate step waits longer. */
const MOST_SEC = 86_400;
const GLOB = /[*?[\]{}]/u;
const TRAILING = /\/(\*\*)?$/u;
const LEADING = /^\.\//u;
const KEYS = ["name", "on", "targets", "needs", "timeout", "on-fail"] as const;
/** The word in a `targets:` step's command the hub gives the targets to build. */
export const TARGETS_PLACE = "{targets}";
/** The margin line that opens the files Caw may edit, any case. */
const CAW_EDITS = /^caw edits:\s*(.*)$/iu;
/** The margin line that declares the ship command, any case. */
const SHIP = /^ship:\s*(.*)$/iu;
/** The words a ship command is given: the landed commit and the notes' file. */
const SHIP_PLACES = ["{commit}", "{notes}"] as const;
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
    case "targets": {
      const read = inputPath(value);
      if ("problem" in read) {
        return read.problem.replace("on:", "targets:");
      }
      step.targetMap = read.path;
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
    case "on-fail":
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

/**
 * One `Caw edits:` glob as the place's paths are matched: from its root, no
 * leading `./`. A problem when it is absolute or climbs out.
 */
const cawEditGlob = (raw: string): { glob: string } | { problem: string } => {
  const glob = raw.replace(LEADING, "");
  if (glob.startsWith("/")) {
    return {
      problem: `Caw edits: ${glob} is absolute; write it from the place's root, like docs/**.`,
    };
  }
  if (glob.split("/").includes("..")) {
    return { problem: `Caw edits: ${glob} climbs out of the place with “..”.` };
  }
  return { glob };
};

/** What reading gate.md's block holds so far. */
interface BlockRead {
  /** The `Caw edits:` globs; undefined until the section opens. */
  cawEdits?: string[];
  /** The indented lines now are `Caw edits:` globs, not a step's options. */
  inCawEdits: boolean;
  problems: string[];
  /** The option keys given under the last step so far. */
  seen: Set<Key>;
  /** The `Ship:` command; undefined until its line. */
  ship?: string;
  steps: DeclaredStep[];
}

/**
 * The `Ship:` line: the command the hub runs on its own machine, in the
 * project's checkout there, once an item that asked to ship has landed on
 * main (hub ship.ts), with `{commit}` and `{notes}` in its place.
 */
const shipLine = (read: BlockRead, command: string): void => {
  if (read.ship !== undefined) {
    read.problems.push("Ship: is given twice; a project ships one way.");
    return;
  }
  const absent = SHIP_PLACES.filter((place) => !command.includes(place));
  if (absent.length > 0) {
    read.problems.push(
      `Ship: “${command}” names no ${absent.join(" or ")}: the command takes the landed commit as {commit} and the release notes' file as {notes}.`
    );
    return;
  }
  read.ship = command;
};

/** One line at the margin: `Caw edits:`, which opens its section, `Ship:`, or a step. */
const marginLine = (read: BlockRead, text: string): void => {
  const ship = SHIP.exec(text);
  if (ship) {
    read.inCawEdits = false;
    shipLine(read, (ship[1] ?? "").trim());
    return;
  }
  const opens = CAW_EDITS.exec(text);
  if (!opens) {
    read.inCawEdits = false;
    read.steps.push({ command: text, name: text, stopsRest: false });
    read.seen = new Set();
    return;
  }
  if (read.cawEdits) {
    read.problems.push("Caw edits: is given twice; list every glob under one.");
  } else if (opens[1]) {
    read.problems.push(
      `Caw edits: takes its globs on the indented lines under it, one each, not “${opens[1]}” beside it.`
    );
  }
  read.cawEdits ??= [];
  read.inCawEdits = true;
};

/** One indented line: a glob under `Caw edits:`, else an option of the step above it. */
const indentedLine = (read: BlockRead, text: string): void => {
  if (read.inCawEdits) {
    const glob = cawEditGlob(text);
    if ("problem" in glob) {
      read.problems.push(glob.problem);
    } else {
      read.cawEdits?.push(glob.glob);
    }
    return;
  }
  const problem = optionLine(text, read.steps.at(-1), read.seen);
  if (problem) {
    read.problems.push(problem);
  }
};

/**
 * What a step's `targets:` asks of it, in words: none of `on:` beside it,
 * and `{targets}` in its command exactly when it names a map.
 */
const targetsProblem = (step: DeclaredStep): string | undefined => {
  const placed = step.command.includes(TARGETS_PLACE);
  if (step.targetMap && step.inputs) {
    return `“${step.command}” gives both on: and targets:; its map says which changes run it, so drop on:.`;
  }
  if (step.targetMap && !placed) {
    return `“${step.command}” names a target map (targets: ${step.targetMap}) but no ${TARGETS_PLACE}, where the hub gives it the targets to build.`;
  }
  if (placed && !step.targetMap) {
    return `“${step.command}” has ${TARGETS_PLACE} but no targets: map to fill it from.`;
  }
};

/** gate.md's block as steps and Caw edits, or every problem it has. */
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
  const read: BlockRead = {
    inCawEdits: false,
    problems: [],
    seen: new Set(),
    steps: [],
  };
  for (const line of lines.slice(start + 1, end)) {
    const text = line.trim();
    if (!text || text.startsWith("#")) {
      continue;
    }
    if (INDENTED.test(line)) {
      indentedLine(read, text);
    } else {
      marginLine(read, text);
    }
  }
  const { cawEdits, ship, steps } = read;
  const problems = [
    ...read.problems,
    ...steps.flatMap((step) => targetsProblem(step) ?? []),
  ];
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    steps,
    ...(cawEdits ? { cawEdits } : {}),
    ...(ship ? { ship } : {}),
  };
};

/** The project's gate as its folder holds it now. */
export const projectGate = async (projectId: string): Promise<ProjectGate> => {
  const reading = await gateReading(projectId);
  if (!reading) {
    return { kind: "none" };
  }
  if (!reading.ok) {
    return { kind: "unreadable", problems: reading.problems };
  }
  return reading.cawEdits
    ? { kind: "declared", steps: reading.steps, cawEdits: reading.cawEdits }
    : { kind: "declared", steps: reading.steps };
};

/** gate.md as the project's folder holds it now, read; undefined with no gate.md. */
const gateReading = async (
  projectId: string
): Promise<GateReading | undefined> => {
  try {
    const { content } = await readFolderFile(projectId, GATE_FILE);
    return readGate(content);
  } catch (error) {
    if (error instanceof FolderRefusal && error.status === 404) {
      return;
    }
    throw error;
  }
};

/**
 * The project's `Ship:` command, as its gate.md declares it now (ship.ts
 * runs it); undefined when it declares none, or gate.md does not read (no
 * item lands through such a gate).
 */
export const projectShip = async (
  projectId: string
): Promise<string | undefined> => {
  const reading = await gateReading(projectId);
  return reading?.ok ? reading.ship : undefined;
};

/** The files the project's Caw may edit, as its gate.md declares them now. */
export const projectCawEdits = async (projectId: string): Promise<CawEdits> => {
  const gate = await projectGate(projectId);
  if (gate.kind === "unreadable") {
    return gate;
  }
  return gate.kind === "declared" && gate.cawEdits
    ? { kind: "declared", globs: gate.cawEdits }
    : { kind: "none" };
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
 * `machineCalled`); undefined when none ever registered.
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
  return last ? machineCalled(last.machineId, machines) : undefined;
};

/**
 * Why an item does not land while no machine a step needs is online, in one
 * sentence: what it changed (for a step with `on:`), the step, and the
 * machine it would have used, by name, or that the hub knows none. The item
 * waits for one ({@link capableWaitReason}) and its session is woken when
 * one is online ({@link capableOnline}).
 */
export const capableRefusal = (
  step: { name: string; needs: RunsOnCapability },
  touched: readonly string[],
  last: string | undefined
): string => {
  const needs = runsOnWords(step.needs);
  const why =
    touched.length === 0
      ? `This project's merge checks run “${step.name}” on ${needs}`
      : `This item changes ${touched.length === 1 ? touched[0] : `${touched.length} files “${step.name}” reads (${touched[0]} first)`}, so it lands only once “${step.name}” passes on ${needs}`;
  const machines = last ? `${last} is offline` : "the hub knows none";
  return `${why}, and none is online (${machines}). The item waits for one: end your turn, and the hub wakes you when one is online to call finish_item again; or call finish_item with blocked.`;
};

/** The reason an item waits for while its gate needs `capability` and no such machine is online. */
export const capableWaitReason = (capability: RunsOnCapability): string =>
  `waiting for ${runsOnWords(capability)} to come online`;

/** The capability an item's wait reason waits for, when it is {@link capableWaitReason}'s. */
export const capableWaitFor = (
  reason: string | null
): RunsOnCapability | undefined =>
  RUNS_ON_CAPABILITIES.find(
    (capability) => capableWaitReason(capability) === reason
  );

/** What wakes an item that waited for `capability`: `machine`, which has it, is online. */
export const capableOnline = (
  capability: RunsOnCapability,
  machine: string
): string =>
  `${machine}, ${runsOnWords(capability)}, is online now: call finish_item again.`;
