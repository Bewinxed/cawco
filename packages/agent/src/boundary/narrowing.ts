/**
 * A boundary narrowed by a policy change: which grants it lost, what of its
 * work they reach, and the words that say so.
 */

import { appendFile, readdir, readFile, readlink } from "node:fs/promises";
import { runtimeVersion } from "@cawco/core/runtime";
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import type { Policy } from "@cawco/core/workspace-judge";
import { workspacePolicy } from "@cawco/core/workspace-policy";
import { membershipName } from "../boundary-policy";
import type { SessiondClient } from "../sessiond-client";
import type { NarrowCause } from "./decisions";
import { type Seen, snapshot } from "./place-guard";
import { pathsOf, REASONS_SAID } from "./plan";
import {
  answering,
  commandsIn,
  inBoundaries,
  inTree,
  type Work,
  workProcesses,
} from "./processes";
import { listeners, type RunningSandbox } from "./sandboxes";
import {
  grantedPolicy,
  type Held,
  keeperOf,
  noticeOf,
  type Place,
  type Retiring,
  readPlace,
  readRetiring,
  WHITESPACE,
} from "./state";

/**
 * Linux: the ports the work of the older boundary `old` listens on, when a
 * newer generation of the workspace whose sandbox runs ({@link sandboxes})
 * listens on every one of them: its work was started again there (a
 * delegate's dev server, restarted after an update on the port it had), so
 * the older one is done. Undefined when its work listens on no port (a job, a
 * build: it closes once that ends), or on one no newer generation listens on
 * (it stays, reached there, {@link workspaceNetworks}). Its work's ports are
 * {@link workPorts}; a newer generation listens on a port when its network's
 * tables list it listening, whoever holds it.
 */
export const supersededPorts = async (
  seen: Seen[],
  old: Retiring,
  generations: readonly RunningSandbox[]
): Promise<number[] | undefined> => {
  const mine = generations.find((one) => one.boundary.gen === old.gen);
  if (!mine) {
    return;
  }
  const ports = await workPorts(seen, mine.place);
  if (ports.length === 0) {
    return;
  }
  const newer = new Set(
    (
      await Promise.all(
        generations
          .filter((one) => one.started > mine.started)
          .map((one) => listeners(one.place.inner))
      )
    )
      .flat()
      .map((one) => one.port)
  );
  return ports.every((port) => newer.has(port)) ? ports : undefined;
};

/**
 * Linux: the ports the work of the sandbox at `place` listens on, sorted: the
 * listening sockets of its network ({@link listeners}) that a process of its
 * work has open, one that descends from its init and was not there when its
 * runner was ready ({@link inTree}), by the socket inodes in its
 * `/proc/<pid>/fd`. srt's own relays inside are its runner's, never its work's.
 */
const workPorts = async (seen: Seen[], place: Place): Promise<number[]> => {
  const idle = new Set(place.idle);
  const work = inTree(seen, place.inner).filter((one) => !idle.has(one.pid));
  const open = new Set(
    (await Promise.all(work.map((one) => socketsOf(one.pid)))).flat()
  );
  return [
    ...new Set(
      (await listeners(place.inner))
        .filter((one) => open.has(one.inode))
        .map((one) => one.port)
    ),
  ].sort((a, b) => a - b);
};

/**
 * What the work of workspace `id`'s running boundary `held` still runs;
 * nothing once nothing does ({@link busyOld}). Its work is every process in
 * it its runner did not start with ({@link workProcesses}), what a command
 * left behind with `&`, `nohup`, `setsid` or a double fork among them,
 * whatever its session or process group: on Linux each descends from the
 * sandbox's init, on macOS each answers to its generation's name.
 */
export const workLeft = async (
  id: string,
  held: Held
): Promise<Work | undefined> => {
  const seen = await snapshot();
  const commands = await commandsIn(seen, id, held.gen);
  const processes = await workProcesses(seen, id, held);
  if (commands.length === 0 && processes.length === 0) {
    return;
  }
  const place =
    process.platform === "linux" ? await readPlace(id, held.gen) : undefined;
  const ports = place ? await workPorts(seen, place) : [];
  const words = [
    ...(commands.length > 0
      ? [
          `runs ${commands.length === 1 ? "a command" : `${commands.length} commands`} (executor ${commands.join(", ")})`,
        ]
      : []),
    ...(ports.length > 0 ? [`listens on ${ports.join(", ")}`] : []),
  ];
  return {
    commands,
    ports,
    processes,
    words: words.length > 0 ? words.join(" and ") : "runs",
  };
};

/** Whether `path` is `dir` or lies under it. */
const lies = (path: string, dir: string): boolean =>
  path === dir || path.startsWith(`${dir}/`);

/**
 * Whether one pair of a policy's lists (`allowRead` and `denyRead`, …) lets
 * `path` through: the deepest entry that holds it decides, a tie denying, as
 * srt and the judge decide (core workspace-policy.ts: "the deeper entry
 * deciding"). A path no entry holds is `unheld`: what the pair grants there
 * is its kind's default (read: yes; write: no), which no name says, so an old
 * policy reads it as let through and a new one as not, and a narrowing is
 * never missed.
 */
const letThrough = (
  path: string,
  allow: readonly string[],
  deny: readonly string[],
  unheld: boolean
): boolean => {
  const deepest = (list: readonly string[]) =>
    Math.max(
      -1,
      ...list
        .filter((entry) => lies(path, entry))
        .map((entry) => entry.split("/").length)
    );
  const allowed = deepest(allow);
  const denied = deepest(deny);
  return allowed < 0 && denied < 0 ? unheld : allowed > denied;
};

/** A policy field's `allow` or `deny` head, before what it is for (`Read`, `Write`). */
const ALLOW_OR_DENY = /^(allow|deny)/u;

/**
 * How a boundary's recorded grant ({@link grantedOf}) stands against the
 * policy `now`: comparable, with how it narrows ({@link narrowing}), or not
 * comparable, with why. NOT COMPARABLE IS NO NARROWING: a record that is
 * missing, unreadable, or of another set of fields than this build's policy
 * (a build before the record, or one that added or dropped a field) says
 * nothing about which way access moved, so the boundary is never stopped for
 * it with a command in it; it is kept while its work runs and handed over
 * once that ends ({@link ensure}), and its replacement starts with this
 * build's record. On 2026-10-19 the install of the build that introduced the
 * record stopped 20 running boundaries as "narrowed (what its boundary
 * started with is not on record)", a leaf's probe run among them, cut off
 * with exit 137.
 */
type Grant =
  | { readonly kind: "comparable"; readonly narrowed: readonly string[] }
  | { readonly kind: "unknown"; readonly why: string };

const compareGrant = (was: Policy | undefined, now: Policy): Grant => {
  if (!was) {
    return {
      kind: "unknown",
      why: "what it started with is not on record (a build before the record started it, or its record cannot be read)",
    };
  }
  const fieldsOf = (policy: Policy) => Object.keys(policy).sort().join(", ");
  if (fieldsOf(was) !== fieldsOf(now)) {
    return {
      kind: "unknown",
      why: `its record names the fields ${fieldsOf(was)}, and this build's policy ${fieldsOf(now)}`,
    };
  }
  return { kind: "comparable", narrowed: narrowing(was, now) };
};

/** The reasons a grant narrowed; none when it is not comparable ({@link compareGrant}). */
const narrowedBy = (grant: Grant): readonly string[] =>
  grant.kind === "comparable" ? grant.narrowed : [];

/**
 * How policy `now` narrows `was`, the policy a boundary started with
 * ({@link grantedOf}), the two of one set of fields ({@link compareGrant}),
 * each in words; none when it widens it or leaves it as it was. Read off the
 * policy's own fields, whatever they are: each pair of lists named
 * `allow<X>` and `deny<X>` narrows when a path one of its lists names was let
 * through before and is not now ({@link letThrough}); any other field narrows
 * when it changed at all (a flag, a path), as no name says which way.
 */
const narrowing = (was: Policy, now: Policy): string[] => {
  const before: Record<string, unknown> = { ...was };
  const after: Record<string, unknown> = { ...now };
  const fields = [
    ...new Set([...Object.keys(before), ...Object.keys(after)]),
  ].sort();
  const paired = (field: string): string | undefined => {
    const rest = field.replace(ALLOW_OR_DENY, "");
    return rest !== field &&
      [`allow${rest}`, `deny${rest}`].every(
        (name) => pathsOf(before[name]) && pathsOf(after[name])
      )
      ? rest
      : undefined;
  };
  return fields.flatMap((field) => {
    const rest = paired(field);
    if (rest === undefined) {
      return JSON.stringify(before[field]) === JSON.stringify(after[field])
        ? []
        : [`${field} changed`];
    }
    if (field.startsWith("deny")) {
      return [];
    }
    const lists = (policy: Record<string, unknown>) =>
      [
        pathsOf(policy[`allow${rest}`]) ?? [],
        pathsOf(policy[`deny${rest}`]) ?? [],
      ] as const;
    const [allowBefore, denyBefore] = lists(before);
    const [allowNow, denyNow] = lists(after);
    return [
      ...new Set([...allowBefore, ...denyBefore, ...allowNow, ...denyNow]),
    ]
      .filter(
        (path) =>
          letThrough(path, allowBefore, denyBefore, true) &&
          !letThrough(path, allowNow, denyNow, false)
      )
      .map((path) => `${path} is no longer let through by allow${rest}`);
  });
};

/** One process a boundary's work runs, as the delegate's own commands saw it: its pid there and its command line. */
export interface WorkProcess {
  readonly command: string;
  readonly pid: number;
}

/** How much of a stopped process's command line is said. Ours: a line's worth. */
const COMMAND_SAID = 160;

const NS_PIDS = /^NSpid:\s+(.+)$/mu;

/** Linux: process `pid`'s pid in each pid namespace it is in, outermost first (`/proc/<pid>/status`'s `NSpid`); none once it is gone. */
const nsPids = async (pid: number): Promise<number[]> =>
  (
    NS_PIDS.exec(
      await readFile(`/proc/${pid}/status`, "utf8").catch(() => "")
    )?.[1] ?? ""
  )
    .trim()
    .split(WHITESPACE)
    .filter(Boolean)
    .map(Number);

/**
 * What the work of workspace `id`'s generation `boundary` runs now, as
 * {@link busyOld} counts it: the processes the rest descend from (the work's
 * roots), as its commands saw them. Linux: each pid in the sandbox's own pid
 * namespace; macOS: the processes that answer to that generation's name,
 * its runner aside ({@link answering}).
 */
export const workIn = async (
  id: string,
  boundary: Pick<Held, "gen" | "pid">
): Promise<WorkProcess[]> => {
  const seen = await snapshot();
  let work: Seen[] = [];
  let level = 0;
  if (process.platform === "linux") {
    const place = await readPlace(id, boundary.gen);
    if (place) {
      const idle = new Set(place.idle);
      work = inTree(seen, place.inner).filter((one) => !idle.has(one.pid));
      level = (await nsPids(place.inner)).length - 1;
    }
  } else {
    const members = new Set(
      answering(inBoundaries(seen), membershipName(id, boundary.gen))
    );
    work = seen.filter(
      (one) => one.pid !== boundary.pid && members.has(one.pid)
    );
  }
  const pids = new Set(work.map((one) => one.pid));
  return await Promise.all(
    work
      .filter((one) => !pids.has(one.ppid))
      .map(async (one) => ({
        pid: level > 0 ? ((await nsPids(one.pid))[level] ?? one.pid) : one.pid,
        command: one.command.slice(0, COMMAND_SAID),
      }))
  );
};

/**
 * The line a delegate's next command shows once CawCo stopped what its work
 * ran (`stopped`) for `cause`: each process by its command and the pid its
 * commands saw, to be started again. Queued by {@link tellStopped}.
 */
const workStoppedLine = (
  cause: string,
  stopped: readonly WorkProcess[]
): string => {
  const one = stopped.length === 1;
  const each = stopped
    .map((proc) => `\`${proc.command}\` (pid ${proc.pid})`)
    .join(", ");
  return `cawco: ${cause}, and what still ran in it was stopped: ${each}. Start ${one ? "it" : "them"} again if you still need ${one ? "it" : "them"}.`;
};

/** Queues {@link workStoppedLine} for workspace `id`'s next session command ({@link noticeOf}); nothing when nothing was stopped. Answers the line. */
export const tellStopped = async (
  id: string,
  cause: string,
  stopped: readonly WorkProcess[]
): Promise<string | undefined> => {
  if (stopped.length === 0) {
    return;
  }
  const line = workStoppedLine(cause, stopped);
  await appendFile(noticeOf(id), `${line}\n`, { mode: 0o600 });
  return line;
};

/** Why a narrowed boundary was replaced, in a delegate's words: at most {@link REASONS_SAID} reasons, then how many more. */
export const narrowedCause = (narrowed: readonly string[]): string => {
  const more = narrowed.length - REASONS_SAID;
  return `this workspace's access was narrowed (${narrowed.slice(0, REASONS_SAID).join("; ")}${more > 0 ? `; and ${more} more` : ""}), so its boundary was replaced`;
};

/** The generations of a workspace whose access narrowed ({@link narrowedGenerations}): the current one's reasons (none when it did not), and each older one still beside it that did. */
export interface Narrowed {
  readonly current: readonly string[];
  readonly older: readonly { boundary: Retiring; why: readonly string[] }[];
}

/**
 * Which generations of workspace `ref`, its current boundary `held` and each
 * older one still beside it ({@link Retiring}), grant what the workspace's
 * policy as it stands no longer does ({@link narrowing}); undefined when none
 * does. One whose grant is not comparable is none of them ({@link
 * compareGrant}).
 */
export const narrowedGenerations = async (
  ref: WorkspaceRef,
  held: Pick<Held, "gen">
): Promise<Narrowed | undefined> => {
  const now = await workspacePolicy(ref);
  const current = narrowedBy(
    compareGrant(await grantedPolicy(ref.id, held.gen), now)
  );
  const older: { boundary: Retiring; why: readonly string[] }[] = [];
  for (const boundary of await readRetiring(ref.id)) {
    const granted = await grantedPolicy(ref.id, boundary.gen);
    const why = narrowedBy(compareGrant(granted, now));
    if (why.length > 0) {
      older.push({ boundary, why });
    }
  }
  return current.length > 0 || older.length > 0
    ? { current, older }
    : undefined;
};

/** Why workspace `ref`'s current boundary `held`'s grant is not comparable with its policy now ({@link compareGrant}); nothing when it is. */
export const unknownGrant = async (
  ref: WorkspaceRef,
  held: Pick<Held, "gen">
): Promise<string | undefined> => {
  const grant = compareGrant(
    await grantedPolicy(ref.id, held.gen),
    await workspacePolicy(ref)
  );
  return grant.kind === "unknown" ? grant.why : undefined;
};

/**
 * The keeper a boundary replaced while this build's keeper is owed the
 * machine's endpoint ({@link ownKeeperOwed}) starts on: this build's own
 * keeper, which an update's helper starts at its own endpoint before the
 * machine's names it, once it answers there. Until then there is none to
 * start on but the current one (`client`), and the boundary started there is
 * handed over to this build's keeper once that is the machine's, as every
 * boundary on a retiring keeper is ({@link leaveRetiringKeepers}).
 */
export const keeperTakingOver = async (
  client: SessiondClient,
  owed: boolean
): Promise<SessiondClient> =>
  owed
    ? ((await keeperOf({ kind: "build", version: runtimeVersion })) ?? client)
    : client;

/**
 * How often the boundaries in use are looked at for a narrowing no event
 * says (looks.ts `lookForNarrowing`): 5 s, unless a probe's scratch fleet names
 * another in `CAWCO_NARROW_LOOK_MS` (boundary-handover holds it off, so only
 * the hub's event can act on a project's folder moved away). Read once, as
 * the daemon starts.
 */
export const NARROW_LOOK_MS = process.env.CAWCO_NARROW_LOOK_MS
  ? Number(process.env.CAWCO_NARROW_LOOK_MS)
  : 5000;

/** Each {@link NarrowCause} in the log's words. */
export const NARROW_CAUSE_WORDS: Readonly<Record<NarrowCause, string>> = {
  accounts: "this machine's accounts changed",
  "folder-moved": "a project's folder moved",
  look: "a look at the boundaries in use",
  project: "its project changed",
  use: "a use of its boundary",
};

/** The socket inodes process `pid` has open, as its `/proc/<pid>/fd` links name them (`socket:[INODE]`); none once it is gone. */
const socketsOf = async (pid: number): Promise<string[]> => {
  const fds = await readdir(`/proc/${pid}/fd`).catch(() => [] as string[]);
  const links = await Promise.all(
    fds.map((fd) => readlink(`/proc/${pid}/fd/${fd}`).catch(() => undefined))
  );
  return links.flatMap((link) => {
    const inode = link && SOCKET_LINK.exec(link)?.[1];
    return inode ? [inode] : [];
  });
};

const SOCKET_LINK = /^socket:\[(\d+)\]$/u;
