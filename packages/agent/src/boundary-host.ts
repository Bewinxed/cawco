/**
 * `boundary-host.ts SETTINGS RUNNER FIFO CLONE READY`: a Linux workspace's boundary,
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
 * It starts in the workspace's state dir, never the clone: Bun reads
 * `bunfig.toml` (its preloads) and `.env` from the directory it starts in,
 * and a command inside writes the clone. It moves to the clone before srt
 * reads its settings, because srt resolves its protected names against its
 * working directory.
 *
 * A plain Bun script, never a module of cawco: a binary install runs its
 * bundle (srt inside) on cawco's own runtime (`BUN_BE_BUN=1`), a checkout runs
 * it on bun.
 */
import {
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  watch,
  writeFileSync,
} from "node:fs";
import { BlockList, isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import {
  type SandboxAskCallback,
  SandboxManager,
  type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";
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

const [settingsFile, runnerFile, fifo, clone, readyLine] =
  process.argv.slice(2);
if (!(settingsFile && runnerFile && fifo && clone && readyLine)) {
  console.error("usage: boundary-host.ts SETTINGS RUNNER FIFO CLONE READY");
  process.exit(64);
}
const settings = JSON.parse(
  readFileSync(settingsFile, "utf8")
) as SandboxRuntimeConfig;
const runner = readFileSync(runnerFile, "utf8");
/** `<state>/sandbox`: `OUTER INNER IDLE...`, the running sandbox's pids, which the executor and the agent read. */
const placeFile = join(process.cwd(), "sandbox");
process.chdir(clone);
await SandboxManager.initialize(settings, ask);

/**
 * What srt protects in the clone with a read-only bind. The kernel drops such
 * a bind in every other mount namespace when the host renames or unlinks what
 * it covers (a host-side `git config` locks, then renames), and nothing can
 * put it back into a running sandbox (REPORT.md §5d).
 */
const PROTECTED = ["config", "hooks", "modules"];

/** The mount points of `pid`'s mount namespace, as `/proc/<pid>/mountinfo` spells them (octal escapes read). */
const mountPoints = (pid: number): Set<string> | undefined => {
  try {
    return new Set(
      readFileSync(`/proc/${pid}/mountinfo`, "utf8")
        .split("\n")
        .map((line) =>
          (line.split(" ")[4] ?? "").replace(/\\([0-7]{3})/g, (_, code) =>
            String.fromCharCode(Number.parseInt(code, 8))
          )
        )
        .filter(Boolean)
    );
  } catch {
    return;
  }
};

const pidNamespace = (pid: string | number): string | undefined => {
  try {
    return readlinkSync(`/proc/${pid}/ns/pid`);
  } catch {
    return;
  }
};

/** One sandbox: the outer bwrap, the init beneath it, and the protected binds it started with. */
interface Sandbox {
  detached?: string;
  readonly guarded: readonly string[];
  readonly inner: number;
  readonly proc: Subprocess<"ignore", "pipe", "inherit">;
}

// What the runner starts with: nothing of this process's own environment but
// who the user is. Each command brings its own (the executor's request).
const inherited = ["HOME", "USER", "LOGNAME", "LANG", "CAWCO_WORKSPACE"];
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
 */
const startSandbox = async (): Promise<Sandbox | undefined> => {
  const wrapped = await SandboxManager.wrapWithSandbox(
    ["/bin/bash", "--norc", "--noprofile", "-c", runner, "cawco-boundary", fifo]
      .map(quote)
      .join(" ")
  );
  const proc = Bun.spawn(["/bin/sh", "-c", `exec ${wrapped}`], {
    env: runnerEnv,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  });
  const outer = proc.pid;
  const { promise, resolve } = Promise.withResolvers<Sandbox | undefined>();
  proc.exited.then(() => resolve(undefined));
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
          (pid) => /^\d+$/.test(pid) && pidNamespace(pid) === space
        );
        const mounted = mountPoints(inner) ?? new Set<string>();
        const sandbox: Sandbox = {
          proc,
          inner,
          guarded: PROTECTED.map((name) => join(clone, ".git", name)).filter(
            (path) => mounted.has(path)
          ),
        };
        writeFileSync(
          `${placeFile}.new`,
          `${outer} ${inner} ${idle.join(" ")}\n`
        );
        renameSync(`${placeFile}.new`, placeFile);
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
  const mounted = mountPoints(sandbox.inner);
  const lost = mounted && sandbox.guarded.find((path) => !mounted.has(path));
  if (lost) {
    sandbox.detached = lost;
    sandbox.proc.kill("SIGKILL");
  }
};

// The host's own view of `.git`: a rename over a protected name is seen as
// it lands, before any command could write through the detached name. The
// executor checks again before each command, and signals here when it finds
// one gone.
watch(join(clone, ".git"), (_event, name) => {
  if (name && PROTECTED.includes(name)) {
    guard();
  }
});
process.on("SIGUSR1", guard);
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => {
    stopping = true;
    current?.proc.kill("SIGKILL");
  });
}

for (;;) {
  // biome-ignore lint/performance/noAwaitInLoops: one sandbox at a time, the next only after the last is gone
  current = await startSandbox();
  const status = current ? await current.proc.exited : 1;
  const lost = current?.detached;
  SandboxManager.cleanupAfterCommand();
  if (stopping || !lost) {
    rmSync(placeFile, { force: true });
    await SandboxManager.reset();
    process.exit(status);
  }
  console.error(
    `cawco: ${lost} was changed on the host, which drops its protection inside the sandbox, so the sandbox was stopped with everything in it and starts again`
  );
}
