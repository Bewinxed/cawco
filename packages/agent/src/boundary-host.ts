/**
 * `boundary-host.ts SETTINGS RUNNER FIFO CLONE READY DENIES [PLACE...]`: a Linux workspace's boundary,
 * as sessiond holds it, one process per workspace (`boundary.ts`). It hosts
 * @anthropic-ai/sandbox-runtime (srt) in library mode: `SandboxManager` is a
 * module-level singleton, one config and one proxy per process, so each
 * workspace has its own process. It starts srt's proxy with the workspace's
 * settings and the ask callback below, wraps the workspace's runner (the
 * script RUNNER names, handed to bash inline) and runs it: every command of
 * the workspace then runs inside that one sandbox, handed in over FIFO.
 *
 * The wrapped command is a plain bwrap invocation, which this process `exec`s
 * through `sh`, so bwrap is this process's own child: bwrap's
 * `--die-with-parent` then ends the sandbox with everything in it whenever
 * this process goes. Closing a boundary kills that outer bwrap; srt then sees
 * its child exit, and this process removes srt's proxy, its socat bridges and
 * its mount points before it exits with the sandbox's status (REPORT.md §5e).
 * The one sandbox it ends itself, when the host detaches one of its
 * protected binds, it starts again, under the same pid and FIFO, so the
 * workspace's sessions run on ({@link guard}).
 *
 * Before each sandbox it makes every dir srt is to bind back from under the
 * runtime dir (PLACE, {@link makePlaces}), and every clone-side deny path the clone lacks
 * (DENIES, `cloneDenies` in workspace-policy.ts) a real, empty one
 * ({@link standIn}): srt binds an existing path onto itself and leaves
 * nothing on the host, where an absent one gets a read-only empty file a
 * host harness then reads as its config.
 *
 * It starts in the workspace's state dir, never the clone: Bun reads
 * `bunfig.toml` (its preloads) and `.env` from the directory it starts in,
 * and a command inside writes the clone. It moves to the clone before srt
 * reads its settings, because srt resolves its protected names against its
 * working directory.
 *
 * A plain Bun script, never a module of cawco, importing nothing of it but
 * core's dependency-free dir names (`claude-dirs.ts`), mount table
 * (`mount-table.ts`) and nested-boundary words (`boundary-nesting.ts`),
 * with safe git and state files: a binary install runs
 * its bundle (srt inside) on cawco's own runtime (`BUN_BE_BUN=1`), a checkout
 * runs it on bun.
 */
import {
  chmodSync,
  type FSWatcher,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  type Stats,
  watch,
  writeFileSync,
} from "node:fs";
import { BlockList, isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import {
  type SandboxAskCallback,
  SandboxManager,
  type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";
import {
  NESTED_BOUNDARY_LABEL,
  nestedBoundaryReason,
} from "@cawco/core/boundary-nesting";
import { projectClaudeRelative } from "@cawco/core/claude-dirs";
import { isGitDirSync } from "@cawco/core/git-dir";
import { mountedAnywhere, mountPointsOf } from "@cawco/core/mount-table";
import { SAFE_GIT_ENV, safeGitArgv } from "@cawco/core/safe-git";
import { writeStateFileSync } from "@cawco/core/state-file";
import type { Subprocess } from "bun";

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

/**
 * Address space no command dials by an address literal. srt judges only the
 * address a name resolves to (resolved-address-guard.ts: "An IP literal on the
 * allowlist is an explicit choice and is never re-judged here"), so a literal
 * the ask callback lets through is dialed as written. IPv6 forms that carry an
 * IPv4 address (mapped, compatible, NAT64, 6to4) are refused whole. One list
 * per family: node's BlockList matches an IPv4 address against an IPv6 rule
 * for the IPv4-mapped range too, so one list would refuse every IPv4 address.
 */
const DENIED_V4 = (() => {
  const list = new BlockList();
  for (const [net, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ] as const) {
    list.addSubnet(net, prefix, "ipv4");
  }
  list.addAddress("100.100.100.200", "ipv4");
  list.addAddress("168.63.129.16", "ipv4");
  return list;
})();

const DENIED_V6 = (() => {
  const list = new BlockList();
  for (const [net, prefix] of [
    ["::", 96],
    ["::ffff:0:0", 96],
    ["64:ff9b::", 96],
    ["64:ff9b:1::", 48],
    ["2002::", 16],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
  ] as const) {
    list.addSubnet(net, prefix, "ipv6");
  }
  return list;
})();

/** `host` as the resolver reads it: inet_aton shorthand (`127.1`, `2130706433`) spelled out, brackets dropped. */
const canonical = (host: string): string | undefined => {
  const bare =
    host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const url = `http://${isIP(bare) === 6 ? `[${bare}]` : bare}/`;
  if (!URL.canParse(url)) {
    return;
  }
  const { hostname } = new URL(url);
  return hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
};

/** Whether `address`, an IP literal, is this host's own or denied ({@link DENIED_V4}, {@link DENIED_V6}). */
const deniedAddress = (address: string): boolean => {
  const denied =
    isIP(address) === 6
      ? DENIED_V6.check(address, "ipv6")
      : DENIED_V4.check(address, "ipv4");
  if (denied) {
    return true;
  }
  return Object.values(networkInterfaces())
    .flat()
    .some((one) => one?.address.toLowerCase() === address.toLowerCase());
};

/**
 * The loopback names (RFC 6761): srt's guard lets an allowed one resolve to
 * loopback ("The reserved loopback names (`localhost` and anything under
 * `.localhost`) resolve to loopback — that is what allow-listing them asks
 * for", resolved-address-guard.ts), and through the proxy, which dials from
 * the host, that is the host's own loopback: the agent and the hub.
 */
const TRAILING_DOTS = /\.+$/;

const loopbackName = (name: string): boolean =>
  name === "localhost" || name.endsWith(".localhost");

/**
 * Every host name the settings name no rule for comes here, as srt's proxy
 * meets it: any name but a loopback name is allowed (srt's guard then refuses
 * one that resolves into loopback, private, tailnet or this host's own
 * space), and an address literal only outside the denied space ({@link deniedAddress}). A host this
 * cannot read is refused.
 */
const ask: SandboxAskCallback = ({ host }) => {
  const name = canonical(host)?.toLowerCase().replace(TRAILING_DOTS, "");
  if (!name) {
    return Promise.resolve(false);
  }
  const allowed = isIP(name) === 0 ? !loopbackName(name) : !deniedAddress(name);
  if (!allowed) {
    console.error(
      `cawco: the workspace's sandbox refused ${name}, an address of this machine or its network`
    );
  }
  return Promise.resolve(allowed);
};

const [
  settingsFile,
  runnerFile,
  fifo,
  clone,
  readyLine,
  deniesFile,
  ...places
] = process.argv.slice(2);
if (!(settingsFile && runnerFile && fifo && clone && readyLine && deniesFile)) {
  console.error(
    "usage: boundary-host.ts SETTINGS RUNNER FIFO CLONE READY DENIES [PLACE...]"
  );
  process.exit(64);
}

/**
 * Makes each PLACE the host lacks, owner-only (0700, as a runtime dir is),
 * before every sandbox: the dirs srt binds back from under the denied
 * runtime dir (the workspace's door dir, srt's own temp dir). srt restores a
 * read carve-out of a denied dir only if it exists as it wraps ("Not
 * restoring … nothing there resolves (absent, dangling or unreadable)",
 * `pushReadDenyDirMounts` in linux-sandbox-utils.js at 0.0.79), and this
 * sandbox lives as long as the workspace, so a dir made after the wrap never
 * shows inside: the door's sockets, made in it later, would be out of reach.
 * A bound dir shows every entry made in it afterwards.
 */
const makePlaces = (): void => {
  for (const place of places) {
    mkdirSync(place, { recursive: true, mode: 0o700 });
  }
};
const settings = JSON.parse(
  readFileSync(settingsFile, "utf8")
) as SandboxRuntimeConfig;
const runner = readFileSync(runnerFile, "utf8");

/** A clone-side deny path and what stands in for it, as `cloneDenies` (workspace-policy.ts) lists them. */
interface Deny {
  readonly empty:
    | { readonly kind: "dir"; readonly readOnly?: true }
    | { readonly kind: "file"; readonly text: string }
    | { readonly kind: "none" };
  readonly path: string;
}
const denies = JSON.parse(readFileSync(deniesFile, "utf8")) as Deny[];
/** `<state>/sandbox`: `OUTER INNER IDLE...`, the running sandbox's pids, which the executor and the agent read. */
const placeFile = join(process.cwd(), "sandbox");
/** `<state>/guarded`: the running sandbox's protected binds, which the executor checks before every command. */
const guardedFile = join(process.cwd(), "guarded");
const lstatOf = (path: string): Stats | undefined => {
  try {
    return lstatSync(path);
  } catch {
    // Not there: nothing to look at.
    return undefined;
  }
};

/**
 * Why the folder this boundary holds is no longer there to hold, when it is
 * not: a delegate's clone whose `.git` is no repository (`isGitDirSync`), or
 * a project lead's place that is no folder. Nothing is ever made at a clone's
 * path but by its create: a clone deleted under a running sandbox stays
 * gone, rather than refilled with stand-ins (`standIn`) into a husk.
 */
const goneReason = (): string | undefined => {
  if (process.env.CAWCO_LEAD_PLACE === "1") {
    return lstatOf(clone)?.isDirectory()
      ? undefined
      : `${clone} is not a folder`;
  }
  return isGitDirSync(join(clone, ".git"))
    ? undefined
    : `${clone} is not a git clone any more`;
};

/** Ends this boundary without a sandbox: the folder it holds is gone ({@link goneReason}). */
const GONE_STATUS = 66;

const refuseGone = (reason: string): never => {
  // On stdout, as a line: the agent names a boundary that did not start by
  // what it heard (`ready` in boundary.ts).
  console.log(
    `cawco: ${reason}, so the workspace's sandbox does not start and its boundary closes`
  );
  process.exit(GONE_STATUS);
};

const goneAtStart = goneReason();
if (goneAtStart) {
  refuseGone(goneAtStart);
}
// srt resolves its own mandatory names against this working directory and
// makes a mount point for each that is absent. A project lead's place is a
// person's own folder, never written into, so there srt starts in the place's
// scratch dir (`CAWCO_SANDBOX_CWD`); a clone's are stood in for (standIn).
process.chdir(process.env.CAWCO_SANDBOX_CWD || clone);
await SandboxManager.initialize(settings, ask);

/**
 * A mount point an earlier sandbox left on the host, by srt's own test
 * (`isStaleBwrapMountPoint`, linux-sandbox-utils.ts at 0.0.79): bwrap makes
 * one for an absent path with ensure_file(dest, 0444), an empty regular file
 * with no write bits and one link, which no checkout or writer makes.
 */
const leftMountPoint = (stat: Stats): boolean =>
  stat.isFile() &&
  stat.size === 0 &&
  // biome-ignore lint/suspicious/noBitwiseOperators: a file mode's write bits, tested as srt tests them
  (stat.mode & 0o222) === 0 &&
  stat.nlink === 1;

/** The clone's directories above `path`, outermost first. */
const above = (path: string): string[] => {
  const dirs: string[] = [];
  for (
    let dir = dirname(path);
    dir.startsWith(`${clone}/`);
    dir = dirname(dir)
  ) {
    dirs.unshift(dir);
  }
  return dirs;
};

/**
 * {@link standIn} for one path: its parents made as the clone's own
 * directories, then the path itself. A mount point an earlier sandbox left
 * (`left`) may still be held by that sandbox: an older boundary runs on
 * beside this one until nothing runs in it (`handOver` in boundary.ts), and
 * unlinking the file it binds would drop its deny there. So a file's stand-in
 * is written into it in place, its inode kept, and a dir's is made only once
 * no mount namespace holds it (`mountedAnywhere`); until then srt covers it
 * again, and the agent replaces this boundary once nothing runs in it.
 */
const makeStandIn = (
  path: string,
  empty: Exclude<Deny["empty"], { kind: "none" }>,
  left: boolean
): void => {
  for (const dir of above(path)) {
    const stat = lstatOf(dir);
    if (!stat) {
      mkdirSync(dir);
    } else if (!stat.isDirectory()) {
      throw new Error(`${dir} is not a directory of the clone`);
    }
  }
  if (left && empty.kind === "file") {
    chmodSync(path, 0o644);
    // In place, never renamed over: this inode is the mount point a sandbox
    // left, and a rename would put another file where the mount is.
    writeFileSync(path, empty.text, { flag: "r+" });
    return;
  }
  if (left) {
    if (mountedAnywhere(path)) {
      throw new Error(
        "an earlier sandbox still holds the mount point left there"
      );
    }
    rmSync(path);
  }
  if (empty.kind === "dir") {
    mkdirSync(path);
    if (empty.readOnly) {
      chmodSync(path, 0o555);
    }
  } else {
    // Writable whatever the umask: an empty file with no write bits is what
    // srt takes for a mount point an earlier sandbox left (leftMountPoint),
    // and would cover with /dev/null and remove.
    // In place: its folder is the clone's own, made above or there already,
    // and a clone deleted since is never made again by this write.
    writeStateFileSync(path, empty.text, {
      exclusive: true,
      inPlace: true,
      mode: 0o644,
    });
  }
};

/**
 * git-lfs's format marker in the clone's `.git/config`, written before a
 * sandbox binds the file. git-lfs writes `lfs.repositoryformatversion` into
 * any repository it runs in that lacks it, by git's lock-and-rename; the
 * agent runs it on the host in the clone (hub-git.ts: `git lfs push` before
 * a push through the git door, `git lfs fetch` after one that moved refs),
 * and the rename drops the sandbox's read-only bind on `.git/config`, so the
 * guard stops the sandbox and the push or fetch that set it off is cut off,
 * having landed (exit 137, "the boundary stopped while this command ran").
 * Written only while no mount namespace holds the file: an older boundary
 * still running beside this one keeps its bind.
 */
const markLfs = (): void => {
  const config = join(clone, ".git", "config");
  if (!lstatOf(config)?.isFile() || mountedAnywhere(config)) {
    return;
  }
  const has = Bun.spawnSync(
    safeGitArgv([
      "config",
      "--file",
      config,
      "--get",
      "lfs.repositoryformatversion",
    ]),
    { env: { ...process.env, ...SAFE_GIT_ENV }, stdout: "ignore" }
  );
  if (has.exitCode === 0) {
    return;
  }
  const set = Bun.spawnSync(
    safeGitArgv([
      "config",
      "--file",
      config,
      "lfs.repositoryformatversion",
      "0",
    ]),
    { env: { ...process.env, ...SAFE_GIT_ENV }, stderr: "pipe" }
  );
  if (set.exitCode !== 0) {
    console.error(
      `cawco: git-lfs's format marker could not be written into ${config} before the workspace's sandbox started, so a host-side git-lfs run will restart the sandbox once: ${set.stderr.toString().trim()}`
    );
  }
};

/**
 * Makes each deny path the clone lacks a real, valid, empty one, before a
 * sandbox starts: srt then binds it onto itself, and nothing of the sandbox
 * is left on the host (`cloneDenies`). One the clone has is left exactly as
 * it is (a tracked config stays as the repository has it), but for a mount
 * point an earlier sandbox left, which is no one's config. Nothing is made
 * under a directory that is not the clone's own (a symlink, a file): srt
 * then stands in for the path as it always has. The workspace's
 * `info/exclude` keeps every one out of git's status, each by its own line
 * (`listStandIns` in stand-ins.ts). A file's stand-in is readable (0644): one
 * with no write bits is what srt takes for a mount point an earlier sandbox
 * left, and covers with `/dev/null`, which a sandbox cannot even read (the
 * clone's mounts are `nodev`).
 */
const standIn = (): void => {
  markLfs();
  for (const { path, empty } of denies) {
    const found = lstatOf(path);
    if (empty.kind === "none" || (found && !leftMountPoint(found))) {
      continue;
    }
    try {
      makeStandIn(path, empty, found !== undefined);
    } catch (error) {
      console.error(
        `cawco: ${path} could not be made before the workspace's sandbox started, so srt stands in for it: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
};

/**
 * Every clone-side deny path the guard covers, relative to the clone: what
 * host git runs or reads (its config, hooks, submodules' git dirs) and the
 * harness project config a host harness loads at the workspace's next
 * session (Claude Code's project settings, hooks, commands and agents,
 * OpenCode's config, `.mcp.json`), and srt's own mandatory names at the
 * clone's root, each given a stand-in too. The guard covers these whatever DENIES
 * names, and every path DENIES names besides (`cloneDenies` in
 * workspace-policy.ts, the policy's list, which names the same).
 */
const PROTECTED = [
  ".git/config",
  ".git/hooks",
  ".git/modules",
  ...[
    "settings.json",
    "settings.local.json",
    "hooks",
    "commands",
    "agents",
  ].map((name) => projectClaudeRelative(name)),
  "opencode.json",
  "opencode.jsonc",
  ".opencode",
  ".mcp.json",
  // srt's own mandatory names at the clone's root (`DANGEROUS_FILES`,
  // `getDangerousDirectories()` in sandbox-utils.js at 0.0.79).
  ".gitconfig",
  ".gitmodules",
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".profile",
  ".ripgreprc",
  ".vscode",
  ".idea",
];

/**
 * What srt is to protect in the clone with read-only binds, each with the
 * inode it has as the sandbox is wrapped: every {@link PROTECTED} path and
 * DENIES path the clone has as a file or directory of its own, and the
 * clone's directories above them,
 * which srt binds too so that what holds a deny path cannot be renamed. The
 * kernel drops such a bind in every other mount namespace when the host
 * renames or unlinks what it covers (a host-side `git config` locks, then
 * renames), and nothing can put it back into a running sandbox
 * (REPORT.md §5d).
 */
const toProtect = (): Map<string, string> => {
  const found = new Map<string, string>();
  const paths = new Set([
    ...PROTECTED.map((name) => join(clone, name)),
    ...denies.map(({ path }) => path),
  ]);
  for (const path of paths) {
    for (const each of [...above(path), path]) {
      const stat = lstatOf(each);
      if (stat && !stat.isSymbolicLink()) {
        found.set(each, `${stat.dev}:${stat.ino}`);
      }
    }
  }
  return found;
};

/** A path as `/proc/<pid>/mountinfo` spells it (the kernel's `seq_escape` of space, tab, newline and backslash). */
const mountinfoSpelling = (path: string): string =>
  path.replace(
    /[ \t\n\\]/g,
    (char) => `\\${char.charCodeAt(0).toString(8).padStart(3, "0")}`
  );

/** A process's entry in `/proc`. */
const PID = /^\d+$/;

const pidNamespace = (pid: string | number): string | undefined => {
  try {
    return readlinkSync(`/proc/${pid}/ns/pid`);
  } catch {
    // Gone, or another user's.
    return undefined;
  }
};

/** One sandbox: the outer bwrap, the init beneath it, and the protected binds it started with. */
interface Sandbox {
  detached?: string;
  readonly guarded: readonly string[];
  readonly inner: number;
  readonly proc: Subprocess<"ignore", "pipe", "pipe">;
}

/** A sandbox that ended before its runner was ready: bwrap's status. */
interface Unstarted {
  readonly status: number;
}

/**
 * This process's AppArmor label, as the kernel names it; none where AppArmor
 * is not there.
 */
const apparmorLabel = (): string | undefined => {
  try {
    return readFileSync("/proc/self/attr/apparmor/current", "utf8").trim();
  } catch {
    // No AppArmor here.
    return undefined;
  }
};

/**
 * Why no sandbox can start here, when this process already runs inside a
 * bwrap sandbox under the host's `bwrap-userns-restrict` profile: a host
 * setting, said as one (`boundary-nesting.ts`).
 */
const nestedRefusal = (): string | undefined => {
  const label = apparmorLabel();
  return label?.includes(NESTED_BOUNDARY_LABEL)
    ? nestedBoundaryReason(label)
    : undefined;
};

// What the runner starts with: nothing of this process's own environment but
// who the user is. Each command brings its own (the executor's request).
const inherited = [
  "HOME",
  "USER",
  "LOGNAME",
  "LANG",
  "CAWCO_WORKSPACE",
  // A lead's place: nothing a command starts outlives it (boundary.ts `LAUNCH`).
  "CAWCO_LEAD_PLACE",
];
const runnerEnv = {
  PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
  ...Object.fromEntries(
    inherited.flatMap((name) => {
      const value = process.env[name];
      return value === undefined ? [] : [[name, value]];
    })
  ),
};

/**
 * Starts one sandbox around the runner and answers it once the runner is
 * ready, after `<state>/sandbox` names it; the runner's ready line is passed
 * on only then, so whoever waits for it finds the file. Every line the
 * runner says is passed on.
 *
 * What bwrap and srt say on stderr before the runner is ready is passed on
 * as lines too: sessiond streams a process's stdout alone, and the agent
 * says why a boundary did not start from the lines it heard (`ready` in
 * boundary.ts), so a refused sandbox is named with bwrap's own words, not
 * an exit status alone. After that, stderr is this process's own, as before.
 */
const startSandbox = async (): Promise<Sandbox | Unstarted> => {
  makePlaces();
  standIn();
  const protect = toProtect();
  const wrapped = await SandboxManager.wrapWithSandbox(
    ["/bin/bash", "--norc", "--noprofile", "-c", runner, "cawco-boundary", fifo]
      .map(quote)
      .join(" ")
  );
  const proc = Bun.spawn(["/bin/sh", "-c", `exec ${wrapped}`], {
    env: runnerEnv,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const outer = proc.pid;
  let started = false;
  const { promise, resolve } = Promise.withResolvers<Sandbox | Unstarted>();
  // What stderr says before the runner is ready is kept: said as lines if
  // the sandbox ends there, what refused it first when that is the host's
  // AppArmor (bwrap's own words then blame the kernel), on stderr if it starts.
  const early: string[] = [];
  const stderrDone = (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of proc.stderr) {
      if (started) {
        process.stderr.write(chunk);
        continue;
      }
      pending += decoder.decode(chunk, { stream: true });
      let end = pending.indexOf("\n");
      while (end >= 0) {
        early.push(pending.slice(0, end).trim());
        pending = pending.slice(end + 1);
        end = pending.indexOf("\n");
      }
    }
    early.push(pending.trim());
  })();
  proc.exited.then(async (status) => {
    if (started) {
      return;
    }
    await stderrDone;
    for (const line of [nestedRefusal(), ...early]) {
      if (line) {
        console.log(line);
      }
    }
    resolve({ status });
  });
  (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of proc.stdout) {
      pending += decoder.decode(chunk, { stream: true });
      let end = pending.indexOf("\n");
      while (end >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        end = pending.indexOf("\n");
        if (line !== readyLine) {
          console.log(line);
          continue;
        }
        const inner = Number.parseInt(
          readFileSync(`/proc/${outer}/task/${outer}/children`, "utf8").trim(),
          10
        );
        const space = pidNamespace(inner);
        const idle = readdirSync("/proc").filter(
          (pid) => PID.test(pid) && pidNamespace(pid) === space
        );
        const mounted = mountPointsOf(inner) ?? new Set<string>();
        // Guarded: each bind srt made, and each path the host changed while
        // the sandbox started, whose bind is gone already ({@link guard}
        // stops this sandbox for it at once). One srt did not bind, the same
        // file as before, is not srt's to protect.
        const guarded = [...protect].flatMap(([path, inode]) => {
          if (mounted.has(path)) {
            return [path];
          }
          const now = lstatOf(path);
          return now && `${now.dev}:${now.ino}` === inode ? [] : [path];
        });
        const sandbox: Sandbox = { proc, inner, guarded };
        started = true;
        for (const said of early.splice(0)) {
          if (said) {
            console.error(said);
          }
        }
        writeStateFileSync(
          guardedFile,
          guarded.map((path) => `${mountinfoSpelling(path)}\n`).join("")
        );
        writeStateFileSync(placeFile, `${outer} ${inner} ${idle.join(" ")}\n`);
        resolve(sandbox);
        console.log(line);
      }
    }
  })();
  return await promise;
};

let current: Sandbox | undefined;
let stopping = false;

/** Kills the sandbox, with everything in it, when one of its protected binds is gone. */
const guard = (): void => {
  const sandbox = current;
  if (!sandbox || sandbox.detached) {
    return;
  }
  const mounted = mountPointsOf(sandbox.inner);
  const lost = mounted && sandbox.guarded.find((path) => !mounted.has(path));
  if (lost) {
    sandbox.detached = lost;
    sandbox.proc.kill("SIGKILL");
  }
};

let watchers: FSWatcher[] = [];

/**
 * The host's own view of each directory holding a guarded bind, armed for
 * each sandbox (a directory a restart made anew is watched anew): a rename
 * or an unlink of a guarded path is seen as it lands, before any command
 * could write through the detached name. Then one look at once, for a
 * change that landed while the sandbox started, before these could see it.
 * The executor checks again before each command, and signals here when it
 * finds one gone.
 */
const watchGuarded = (sandbox: Sandbox): void => {
  for (const watcher of watchers) {
    watcher.close();
  }
  const guarded = new Set(sandbox.guarded);
  watchers = [...new Set(sandbox.guarded.map((path) => dirname(path)))].flatMap(
    (dir) => {
      try {
        const watcher = watch(dir, (_event, name) => {
          if (name && guarded.has(join(dir, name))) {
            guard();
          }
        });
        // A watched directory that goes is a guarded path gone.
        watcher.on("error", guard);
        return [watcher];
      } catch {
        // Gone already: the look below finds what was in it unbound.
        return [];
      }
    }
  );
  guard();
};
process.on("SIGUSR1", guard);
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => {
    stopping = true;
    current?.proc.kill("SIGKILL");
  });
}

for (;;) {
  // Before every sandbox, the first and each one started again: a clone
  // deleted under a running sandbox drops its protected binds, and the
  // sandbox stopped for that never starts in its path again.
  const gone = goneReason();
  if (gone) {
    rmSync(placeFile, { force: true });
    rmSync(guardedFile, { force: true });
    // biome-ignore lint/performance/noAwaitInLoops: the boundary's last step
    await SandboxManager.reset();
    refuseGone(gone);
  }
  const sandbox = await startSandbox();
  current = "proc" in sandbox ? sandbox : undefined;
  if (current) {
    watchGuarded(current);
  }
  const status = "proc" in sandbox ? await sandbox.proc.exited : sandbox.status;
  const lost = current?.detached;
  SandboxManager.cleanupAfterCommand();
  if (stopping || !lost) {
    rmSync(placeFile, { force: true });
    rmSync(guardedFile, { force: true });
    await SandboxManager.reset();
    process.exit(status);
  }
  console.error(
    `cawco: ${lost} was changed on the host, which drops its protection inside the sandbox, so the sandbox was stopped with everything in it and starts again`
  );
}
