/**
 * What the processes this user can see run and name, read from the system at
 * the moment of asking. Two readers: `prune`, which keeps every build a live
 * process runs or names (a session keeper's child whose CLI `--settings` carry
 * a hook under `versions/<v>/` needs that folder for as long as it lives), and
 * the agent, which names the process holding a port it cannot bind.
 *
 * macOS is read with `ps` and `lsof`, always through an async spawn: both run
 * on the agent's loop (prune at a confirmed trial, the gateway's bind), and a
 * synchronous spawn under Bun waits on a private loop whose handle swap
 * misplaces the process's own polls (oven-sh/bun#34069): the session keeper
 * sat wedged on one for 35 minutes.
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";

interface LiveProcess {
  /** Its command line, arguments joined by spaces. */
  command: string;
  /** Files it runs from: its executable on linux, its text segments on macOS. */
  images: string[];
  pid: number;
  /** The file its `--settings` names, when that argument is a file and not inline JSON. */
  settingsFile?: string;
}

const NUMERIC = /^\d+$/;
/** `--settings <file>`, as `ps` joins it on macOS: the file ends where the argument does. */
const SETTINGS_FILE = /--settings\s+(\/\S+)/;
/** One `ps -o pid=,command=` row. */
const PS_ROW = /^\s*(\d+)\s+(.*)$/;
/** A build's folder name, up to the separator or quote that ends it inside a path or a JSON string. */
const VERSION_NAME = /^[^/\s'"\\]+/;
const BLANKS = /\s+/;

const readOr = (read: () => string): string | undefined => {
  try {
    return read();
  } catch {
    return undefined;
  }
};

/** A `--settings` argument that is a file on disk, not an inline object. */
const settingsFileIn = (args: readonly string[]): string | undefined => {
  const value = args[args.indexOf("--settings") + 1];
  return args.includes("--settings") &&
    value?.startsWith("/") &&
    existsSync(value)
    ? value
    : undefined;
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
  const child = Bun.spawn(argv, { stdout: "pipe", stderr: "ignore" });
  const [text] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  return text;
};

async function macProcesses(): Promise<LiveProcess[]> {
  const [listed, texts] = await Promise.all([
    printed(["ps", "-axww", "-o", "pid=,command="]),
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
  return listed.split("\n").flatMap((line) => {
    const match = PS_ROW.exec(line);
    if (!match) {
      return [];
    }
    const command = match[2] ?? "";
    const file = SETTINGS_FILE.exec(command)?.[1];
    return [
      {
        pid: Number(match[1]),
        command,
        images: images.get(Number(match[1])) ?? [],
        settingsFile: file && existsSync(file) ? file : undefined,
      },
    ];
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
 * Read from what is running, never from a count of builds to keep.
 */
export async function versionsInUse(root: string): Promise<Set<string>> {
  const prefixes = [
    ...new Set([root, readOr(() => realpathSync(root)) ?? root]),
  ].map((path) => `${join(path, "versions")}/`);
  const used = new Set<string>();
  for (const one of await liveProcesses()) {
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
    : (
        await printed(["ps", "-ww", "-o", "command=", "-p", String(pid)])
      ).trim();

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
