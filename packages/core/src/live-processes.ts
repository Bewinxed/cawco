/**
 * What the processes this user can see run and name, read from the system at
 * the moment of asking. Two readers: `prune`, which keeps every build a live
 * process runs or names (a session keeper's child whose CLI `--settings` carry
 * a hook under `versions/<v>/` needs that folder for as long as it lives), and
 * the agent, which names the process holding a port it cannot bind.
 *
 * macOS command lines come from the kernel (the process reader), its text
 * segments from `lsof` through an async spawn: it runs on the agent's loop
 * (prune at a confirmed trial, the gateway's bind), and a synchronous spawn
 * under Bun waits on a private loop whose handle swap misplaces the process's
 * own polls (oven-sh/bun#34069): the session keeper sat wedged on one for 35
 * minutes.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { commandLine, commandLines } from "./process-identity";
import { hostEnvironment } from "./session-env";

interface LiveProcess {
  /** Its command line, arguments joined by spaces. */
  command: string;
  /** Files it runs from: its executable on linux, its text segments on macOS. */
  images: string[];
  pid: number;
  /** The file its `--settings` names, when that argument is a file and not inline JSON. */
  settingsFile?: string;
}

const NUMERIC = /^\d+$/u;
/**
 * `--settings <file>` or `--settings=<file>`, as `ps` joins it on macOS: the
 * file ends where the argument does. The Agent SDK sends `--flag=value` since
 * 0.3.295 ("the values of its named options are now sent in the same argument
 * as their flag").
 */
const SETTINGS_FILE = /--settings[=\s]+(\/\S+)/u;
const SETTINGS_FLAG = "--settings";
/** A build's folder name, up to the separator or quote that ends it inside a path or a JSON string. */
const VERSION_NAME = /^[^/\s'"\\]+/u;
const BLANKS = /\s+/u;

const readOr = (read: () => string): string | undefined => {
  try {
    return read();
  } catch {
    return undefined;
  }
};

/** A `--settings` argument that is a file on disk, not an inline object. */
const settingsFileIn = (args: readonly string[]): string | undefined => {
  const at = args.findIndex(
    (arg) => arg === SETTINGS_FLAG || arg.startsWith(`${SETTINGS_FLAG}=`)
  );
  const flag = args[at];
  const value =
    flag === SETTINGS_FLAG
      ? args[at + 1]
      : flag?.slice(SETTINGS_FLAG.length + 1);
  return value?.startsWith("/") && existsSync(value) ? value : undefined;
};

function linuxProcesses(): LiveProcess[] {
  return readdirSync("/proc")
    .filter((name) => NUMERIC.test(name))
    .flatMap((name) => {
      const cmdline = readOr(() =>
        readFileSync(`/proc/${name}/cmdline`, "utf8")
      );
      if (cmdline === undefined) {
        return [];
      }
      const args = cmdline.split("\0").filter((arg) => arg !== "");
      const exe = readOr(() => readlinkSync(`/proc/${name}/exe`));
      return [
        {
          pid: Number(name),
          command: args.join(" "),
          images: exe ? [exe] : [],
          settingsFile: settingsFileIn(args),
        },
      ];
    });
}

/** What a command prints on stdout, read without holding the loop. */
const printed = async (argv: string[]): Promise<string> => {
  const child = Bun.spawn(argv, {
    env: hostEnvironment(),
    stdout: "pipe",
    stderr: "ignore",
  });
  const [text] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  return text;
};

async function macProcesses(): Promise<LiveProcess[]> {
  const [listed, texts] = await Promise.all([
    commandLines(),
    // Every process's text segments at once: the executable is the first, and a
    // build started through a link shows here by the folder it really lives in.
    printed(["lsof", "-nP", "-w", "-d", "txt", "-Fpn"]),
  ]);
  const images = new Map<number, string[]>();
  let pid = 0;
  for (const line of texts.split("\n")) {
    if (line.startsWith("p")) {
      pid = Number(line.slice(1));
    } else if (line.startsWith("n")) {
      images.set(pid, [...(images.get(pid) ?? []), line.slice(1)]);
    }
  }
  return listed.map(({ pid: listedPid, command }) => {
    const file = SETTINGS_FILE.exec(command)?.[1];
    return {
      pid: listedPid,
      command,
      images: images.get(listedPid) ?? [],
      settingsFile: file && existsSync(file) ? file : undefined,
    };
  });
}

/** Every process this user can see, now. */
export const liveProcesses = (): Promise<LiveProcess[]> =>
  process.platform === "linux"
    ? Promise.resolve(linuxProcesses())
    : macProcesses();

/**
 * The builds under `<root>/versions/` that a live process runs or names: its
 * executable, its command line, and the settings file its command line names.
 * Read from what is running, never from a count of builds to keep. The asking
 * process is not counted: the update helper that prunes runs from the build
 * it has just replaced, ends with the prune, and needs nothing on disk to do
 * so (a running executable outlives its file).
 */
export async function versionsInUse(root: string): Promise<Set<string>> {
  const prefixes = [
    ...new Set([root, readOr(() => realpathSync(root)) ?? root]),
  ].map((path) => `${join(path, "versions")}/`);
  const used = new Set<string>();
  const others = (await liveProcesses()).filter((p) => p.pid !== process.pid);
  for (const one of others) {
    const texts = [
      one.command,
      ...one.images,
      ...(one.settingsFile
        ? [readOr(() => readFileSync(one.settingsFile as string, "utf8")) ?? ""]
        : []),
    ];
    for (const text of texts) {
      for (const prefix of prefixes) {
        let at = text.indexOf(prefix);
        while (at !== -1) {
          const rest = text.slice(at + prefix.length);
          const name = VERSION_NAME.exec(rest)?.[0];
          if (name) {
            used.add(name);
          }
          at = text.indexOf(prefix, at + prefix.length);
        }
      }
    }
  }
  return used;
}

/** A process that runs from inside a folder ({@link processesWithin}). */
export interface ProcessWithin {
  command: string;
  pid: number;
}

/** Whether `path` is `root` or lies under it. */
const under = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

/** Linux names a working directory deleted under its process so. */
const DELETED = / \(deleted\)$/u;

/**
 * Every process this user can see that runs from inside one of `roots`
 * (absolute folders, each also read through its real path): its working
 * directory there, its executable there (on macOS any of its text segments:
 * a native module loaded from a clone's `node_modules` too), or its command
 * line naming a path there (`node <clone>/node_modules/.bin/vite preview`).
 * A process whose parent ended and that init or launchd adopted is found
 * the same: what it runs from does not move with its parent. Linux reads
 * `/proc/<pid>/{cwd,exe,cmdline}`, where another user's process withholds
 * its cwd; macOS asks `lsof -d cwd,txt` once, beside the kernel's command
 * lines.
 */
export async function processesWithin(
  roots: readonly string[]
): Promise<ProcessWithin[]> {
  const all = [
    ...new Set(
      roots.flatMap((root) => [root, readOr(() => realpathSync(root)) ?? root])
    ),
  ];
  const inside = (path: string | undefined): boolean =>
    path !== undefined && all.some((root) => under(path, root));
  const names = (command: string): boolean =>
    all.some((root) => command.includes(`${root}/`) || command.endsWith(root));
  if (process.platform === "linux") {
    return linuxProcesses().flatMap((one) => {
      const cwd = readOr(() => readlinkSync(`/proc/${one.pid}/cwd`))?.replace(
        DELETED,
        ""
      );
      const exe = one.images[0]?.replace(DELETED, "");
      return inside(cwd) || inside(exe) || names(one.command)
        ? [{ pid: one.pid, command: one.command }]
        : [];
    });
  }
  const [listed, opened] = await Promise.all([
    commandLines(),
    printed(["lsof", "-nP", "-w", "-d", "cwd,txt", "-Fpn"]),
  ]);
  const from = new Set<number>();
  let pid = 0;
  for (const line of opened.split("\n")) {
    if (line.startsWith("p")) {
      pid = Number(line.slice(1));
    } else if (line.startsWith("n") && inside(line.slice(1))) {
      from.add(pid);
    }
  }
  return listed.filter((one) => from.has(one.pid) || names(one.command));
}

/** The sockets listening on TCP `port`, by inode, from this network namespace's tables. */
function listeningInodes(port: number): string[] {
  const hex = port.toString(16).toUpperCase().padStart(4, "0");
  return ["/proc/net/tcp", "/proc/net/tcp6"].flatMap((table) =>
    (readOr(() => readFileSync(table, "utf8")) ?? "")
      .split("\n")
      .slice(1)
      .map((row) => row.trim().split(BLANKS))
      // local_address is `<ip>:<port>` in hex; `0A` is LISTEN; the inode is the tenth field.
      .filter((fields) => fields[1]?.endsWith(`:${hex}`) && fields[3] === "0A")
      .map((fields) => fields[9] ?? "")
      .filter((inode) => inode !== "" && inode !== "0")
  );
}

/** The processes whose open files include one of these sockets. */
function socketOwners(inodes: readonly string[]): number[] {
  const wanted = new Set(inodes.map((inode) => `socket:[${inode}]`));
  return readdirSync("/proc")
    .filter((name) => NUMERIC.test(name))
    .filter((name) =>
      (readOr(() => readdirSync(`/proc/${name}/fd`).join("\n")) ?? "")
        .split("\n")
        .some((fd) =>
          wanted.has(readOr(() => readlinkSync(`/proc/${name}/fd/${fd}`)) ?? "")
        )
    )
    .map(Number);
}

const commandOf = async (pid: number): Promise<string> =>
  process.platform === "linux"
    ? (readOr(() => readFileSync(`/proc/${pid}/cmdline`, "utf8")) ?? "")
        .split("\0")
        .filter((arg) => arg !== "")
        .join(" ")
    : ((await commandLine(pid)) ?? "").trim();

/**
 * Who listens on TCP `port` here, in words: each holder's pid and command
 * line. Linux reads `/proc/net/tcp{,6}` for the listening socket's inode and
 * finds the process that has it open under `/proc/<pid>/fd`; macOS asks
 * `lsof -nP -iTCP:<port> -sTCP:LISTEN`.
 */
export async function portHolder(port: number): Promise<string> {
  let pids: number[];
  let unseen = "";
  if (process.platform === "linux") {
    const inodes = listeningInodes(port);
    pids = socketOwners(inodes);
    if (pids.length === 0 && inodes.length > 0) {
      unseen = `a process this user cannot see (socket inode ${inodes.join(", ")})`;
    }
  } else {
    const listed = await printed([
      "lsof",
      "-nP",
      `-iTCP:${port}`,
      "-sTCP:LISTEN",
      "-Fp",
    ]);
    pids = [
      ...new Set(
        listed
          .split("\n")
          .filter((line) => line.startsWith("p"))
          .map((line) => Number(line.slice(1)))
      ),
    ];
  }
  if (pids.length === 0) {
    return unseen || "no process this user can see";
  }
  const holders = await Promise.all(
    pids.map(
      async (pid) =>
        `pid ${pid} (${(await commandOf(pid)) || "no command line"})`
    )
  );
  return holders.join("; ");
}
