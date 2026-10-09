/**
 * `boundary-host.ts SETTINGS RUNNER FIFO CLONE`: a Linux workspace's boundary,
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
import { readFileSync } from "node:fs";
import { BlockList, isIP } from "node:net";
import { networkInterfaces } from "node:os";
import {
  type SandboxAskCallback,
  SandboxManager,
  type SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";

/** The line this process prints with the outer bwrap's pid, before the runner's ready line. */
const SANDBOX_LINE = "cawco-boundary-sandbox";

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

const [settingsFile, runnerFile, fifo, clone] = process.argv.slice(2);
if (!(settingsFile && runnerFile && fifo && clone)) {
  console.error("usage: boundary-host.ts SETTINGS RUNNER FIFO CLONE");
  process.exit(64);
}
const settings = JSON.parse(
  readFileSync(settingsFile, "utf8")
) as SandboxRuntimeConfig;
const runner = readFileSync(runnerFile, "utf8");
process.chdir(clone);
await SandboxManager.initialize(settings, ask);
const wrapped = await SandboxManager.wrapWithSandbox(
  ["/bin/bash", "--norc", "--noprofile", "-c", runner, "cawco-boundary", fifo]
    .map(quote)
    .join(" ")
);
// What the runner starts with: nothing of this process's own environment but
// who the user is. Each command brings its own (the executor's request).
const inherited = ["HOME", "USER", "LOGNAME", "LANG", "CAWCO_WORKSPACE"];
const sandbox = Bun.spawn(["/bin/sh", "-c", `exec ${wrapped}`], {
  env: {
    PATH: "/usr/sbin:/usr/bin:/sbin:/bin",
    ...Object.fromEntries(
      inherited.flatMap((name) => {
        const value = process.env[name];
        return value === undefined ? [] : [[name, value]];
      })
    ),
  },
  stdin: "ignore",
  stdout: "inherit",
  stderr: "inherit",
});
console.log(`${SANDBOX_LINE} ${sandbox.pid}`);
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"] as const) {
  process.on(signal, () => sandbox.kill("SIGKILL"));
}
const status = await sandbox.exited;
SandboxManager.cleanupAfterCommand();
await SandboxManager.reset();
process.exit(status);
