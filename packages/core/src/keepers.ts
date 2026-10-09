/**
 * The machine's session keepers, side by side. Server-only.
 *
 * A keeper of build V (`cawco sessiond`, run from `versions/V/cawco`) runs in
 * a service-manager job of its own and listens on an endpoint of its own,
 * `sessiond-V.sock`, in the directory of the machine's endpoint
 * `sessiond.sock` ({@link sessiondEndpoint}). The machine's endpoint names the
 * CURRENT keeper: on a binary install it is a symlink to that keeper's own
 * socket, so everything that dials it (every session start and relaunch, the
 * CLI's probe, the proof's socket reads) reaches the current keeper without
 * knowing which build it is. Every other keeper there is RETIRING: it keeps
 * the sessions it holds, reached through the connections already open to it
 * and by its own endpoint, is sent nothing new, and is stopped once it holds
 * no live child.
 *
 * A keeper started before keepers ran side by side (a LEGACY keeper) bound
 * `sessiond.sock` itself, in the unit `cawco-sessiond.service` (launchd
 * `dev.cawco.sessiond`). When a keeper of its own build's kind is published
 * over it, its socket moves to `legacy-sessiond-<v>.sock` in the same moment,
 * where it keeps answering: a unix socket is reached through its inode, and a
 * rename keeps the inode.
 *
 * Which build's keeper is current is the `keeper` link's to say
 * ({@link readKeeperVersion}), on disk: it is what a machine's keeper starts
 * as after a reboot, and a build's keeper the link names publishes the
 * machine's endpoint when it starts. A handover publishes the endpoint, then
 * moves the link.
 */
import {
  lstat,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
} from "node:fs/promises";
import { Socket } from "node:net";
import { basename, dirname, join } from "node:path";
import { readKeeperVersion } from "./binary-installation";
import { sessiondEndpoint } from "./sessiond";

/** The machine's endpoint's own name: what names the current keeper. */
export const MACHINE_ENDPOINT = "sessiond.sock";

/**
 * The machine's endpoint as a process other than a keeper sees it: the
 * agent's unit gives it as `CAWCO_SESSIOND_ENDPOINT`, a dev run may point it
 * at a scratch socket. A keeper's own variable names its own endpoint.
 */
export const machineEndpoint = (): string =>
  process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint();

/** A keeper by what it runs: a build's own (`build`), or one that bound the machine's endpoint itself (`legacy`). */
export interface KeeperName {
  kind: "build" | "legacy";
  version: string;
}

const BUILD_ENDPOINT = /^sessiond-(.+)\.sock$/;
const LEGACY_ENDPOINT = /^legacy-sessiond-(.+)\.sock$/;
/** What a service manager's job name may carry of a build's version. */
const NOT_IN_A_JOB_NAME = /[^A-Za-z0-9._-]/g;

/** A keeper's own endpoint file name. */
export const endpointName = (keeper: KeeperName): string =>
  keeper.kind === "build"
    ? `sessiond-${keeper.version}.sock`
    : `legacy-sessiond-${keeper.version}.sock`;

/** A keeper's own endpoint, beside the machine's. */
export const keeperEndpoint = (
  keeper: KeeperName,
  machine: string = machineEndpoint()
): string => join(dirname(machine), endpointName(keeper));

/** The keeper an endpoint file name belongs to; undefined for any other file, the machine's endpoint among them. */
export const keeperOf = (name: string): KeeperName | undefined => {
  const legacy = LEGACY_ENDPOINT.exec(name);
  if (legacy?.[1]) {
    return { kind: "legacy", version: legacy[1] };
  }
  const build = BUILD_ENDPOINT.exec(name);
  return build?.[1] ? { kind: "build", version: build[1] } : undefined;
};

/**
 * A keeper's service name, as its unit (`cawco-<name>.service`) and its
 * launchd label (`dev.cawco.<name>`) carry it: `sessiond-<version>` for a
 * build's keeper, with what a job name cannot hold as `_`; `sessiond` for a
 * legacy one.
 */
export const keeperService = (keeper: KeeperName): string =>
  keeper.kind === "build"
    ? `sessiond-${keeper.version.replace(NOT_IN_A_JOB_NAME, "_")}`
    : "sessiond";

/** Whether something accepts a connection on `path` within `timeoutMs`. */
export const answers = (path: string, timeoutMs = 2000): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = new Socket();
    const settle = (answer: boolean): void => {
      clearTimeout(timer);
      socket.destroy();
      resolve(answer);
    };
    const timer = setTimeout(() => settle(false), timeoutMs);
    socket.once("connect", () => settle(true));
    socket.once("error", () => settle(false));
    socket.connect(path);
  });

/**
 * The current keeper's own endpoint, as the machine's endpoint names it now:
 * where its symlink leads, beside it, or the machine's endpoint itself when it
 * is a keeper's own socket (a legacy keeper, a checkout's, or none yet).
 */
export const currentEndpoint = async (
  machine: string = machineEndpoint()
): Promise<string> => {
  const target = await readlink(machine).catch(() => undefined);
  return target === undefined
    ? machine
    : join(dirname(machine), basename(target));
};

/** The current keeper, as the machine's endpoint names it now. */
export interface CurrentKeeper {
  /** Its own endpoint: the socket the machine's endpoint leads to. */
  endpoint: string;
  keeper: KeeperName;
}

/**
 * The keeper the machine's endpoint names now: the build's keeper its symlink
 * leads to, or the legacy keeper whose own socket it is (its build is the one
 * the `keeper` link names, `unknown` where there is none). Undefined when
 * nothing is there.
 */
export async function currentKeeper(
  machine: string = machineEndpoint()
): Promise<CurrentKeeper | undefined> {
  const target = await readlink(machine).catch(() => undefined);
  if (target !== undefined) {
    const keeper = keeperOf(basename(target));
    return keeper
      ? { endpoint: join(dirname(machine), basename(target)), keeper }
      : undefined;
  }
  const found = await lstat(machine).catch(() => undefined);
  if (!found?.isSocket()) {
    return undefined;
  }
  return {
    endpoint: machine,
    keeper: {
      kind: "legacy",
      version: (await readKeeperVersion()) ?? "unknown",
    },
  };
}

/** One keeper endpoint in the machine's endpoint directory. */
export interface FoundKeeper {
  /** Whether the machine's endpoint names it. */
  current: boolean;
  endpoint: string;
  keeper: KeeperName;
}

/**
 * Every keeper endpoint beside the machine's, the current one first: each
 * build's own, each legacy one set aside, and a legacy keeper still holding
 * the machine's endpoint itself. Whether each answers is the caller's to
 * find out; a file left by a keeper that is gone answers nothing.
 */
export async function keeperEndpoints(
  machine: string = machineEndpoint()
): Promise<FoundKeeper[]> {
  const current = await currentKeeper(machine);
  const dir = dirname(machine);
  const names = await readdir(dir).catch(() => [] as string[]);
  const found: FoundKeeper[] = names.flatMap((name) => {
    const keeper = keeperOf(name);
    const endpoint = join(dir, name);
    return keeper
      ? [{ endpoint, keeper, current: current?.endpoint === endpoint }]
      : [];
  });
  if (current && current.endpoint === machine) {
    found.push({ endpoint: machine, keeper: current.keeper, current: true });
  }
  return found.sort((a, b) => Number(b.current) - Number(a.current));
}

/**
 * Makes the keeper at `endpoint` the machine's current one: the machine's
 * endpoint beside it becomes a symlink to it, put in place by one rename, so
 * a dial reaches one keeper or the other and never a missing file. A legacy
 * keeper's own socket there is first moved to its legacy name
 * ({@link endpointName}), its build `legacyVersion`, the instant before; with
 * no version given, a live one there is refused rather than cut off from
 * every new dial and every agent that starts. A socket there that answers
 * nothing is what a keeper that is gone left, and is replaced.
 */
export async function publishKeeper(
  endpoint: string,
  legacyVersion?: string
): Promise<void> {
  const machine = join(dirname(endpoint), MACHINE_ENDPOINT);
  const target = basename(endpoint);
  if ((await readlink(machine).catch(() => undefined)) === target) {
    return;
  }
  const there = await lstat(machine).catch(() => undefined);
  const legacy =
    there?.isSocket() && (await answers(machine)) ? machine : undefined;
  if (legacy && legacyVersion === undefined) {
    throw new Error(
      `${machine} is the socket of a keeper started before keepers ran side by side; it is set aside by the handover that names its build`
    );
  }
  const next = `${machine}.${process.pid}.next`;
  await rm(next, { force: true });
  await symlink(target, next);
  if (legacy && legacyVersion !== undefined) {
    await rename(
      legacy,
      keeperEndpoint({ kind: "legacy", version: legacyVersion }, machine)
    );
  }
  await rename(next, machine);
}
