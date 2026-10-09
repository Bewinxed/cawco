/**
 * Adding a machine: the install script every new machine runs, the addresses
 * it could reach this hub on, and the SSH add that runs the script for the
 * operator.
 *
 * The hub never connects out on its own. A machine joins by running
 * `/install.sh`, which installs the signed binary release of this hub's
 * channel and ends in `cawco binary-install agent`; an SSH add is the same script started over `ssh` from here.
 * The hub API has no auth in front of it (anyone who reaches it can already
 * spawn a session), so this adds no trust boundary — but nothing the operator
 * types reaches a shell: the target is one argv entry for `ssh`, and the hub
 * address in the remote command is one this hub listed itself.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir, hostname, networkInterfaces } from "node:os";
import { join } from "node:path";
import {
  INSTALL_JOINED,
  INSTALL_STEP_PREFIX,
  type JoinAddress,
  type JoinInfo,
  type SshJoinJob,
  type SshJoinProblem,
} from "@cawco/core";
import { RELEASE_REPOSITORY } from "@cawco/core/binary-distribution";
import { readInstallation } from "@cawco/core/binary-installation";
import { generateInstallScript } from "@cawco/core/install-script";
import { LineSplitter } from "@cawco/core/lines";
import { RELEASE_PUBLIC_KEY } from "@cawco/core/release-key";
import { Elysia, t } from "elysia";
import { HUB_PORT } from "./config";
import type { HubLifetimeShape } from "./lifetime";

/** Runs a short command and answers its stdout, or undefined when it failed or hung. */
const output = async (argv: string[]): Promise<string | undefined> => {
  const child = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "ignore",
    stdin: "ignore",
    timeout: 3000,
  });
  const [text, code] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  return code === 0 ? text.trim() : undefined;
};

const TRAILING_DOT = /\.$/;

/**
 * Every address a machine could reach this hub on: Tailscale first, because a
 * tailnet address works from anywhere the machine is, then every non-internal
 * IPv4 labelled with its interface. The Tailscale IP also shows up as an
 * interface (`tailscale0`, `utun…`); it is listed once, under Tailscale.
 * A machine without the `tailscale` binary simply has no Tailscale rows.
 */
export const joinAddresses = async (): Promise<JoinAddress[]> => {
  const url = (host: string): string => `http://${host}:${HUB_PORT}`;
  const [ip, status] = await Promise.all([
    Bun.which("tailscale") ? output(["tailscale", "ip", "-4"]) : undefined,
    Bun.which("tailscale")
      ? output(["tailscale", "status", "--json"])
      : undefined,
  ]);
  const found: JoinAddress[] = [];
  const tailscaleIp = ip?.split("\n")[0]?.trim();
  if (tailscaleIp) {
    found.push({ label: "Tailscale", url: url(tailscaleIp) });
  }
  const dnsName = status
    ? (JSON.parse(status) as { Self?: { DNSName?: string } }).Self?.DNSName
    : undefined;
  if (dnsName) {
    found.push({
      label: "Tailscale DNS",
      url: url(dnsName.replace(TRAILING_DOT, "")),
    });
  }
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }
      const candidate = url(entry.address);
      if (!found.some((address) => address.url === candidate)) {
        found.push({ label: name, url: candidate });
      }
    }
  }
  return found;
};

/**
 * The key an SSH add signs in with: what `ssh` itself tries first. The
 * ed25519 key when there is one, else the first `id_*.pub` in `~/.ssh`.
 */
export const sshPublicKey = (): string | null => {
  const dir = join(homedir(), ".ssh");
  const preferred = join(dir, "id_ed25519.pub");
  if (existsSync(preferred)) {
    return readFileSync(preferred, "utf8").trim();
  }
  if (!existsSync(dir)) {
    return null;
  }
  const [first] = readdirSync(dir)
    .filter((name) => name.startsWith("id_") && name.endsWith(".pub"))
    .sort();
  return first ? readFileSync(join(dir, first), "utf8").trim() : null;
};

/**
 * A `Host` header that can be pasted into the script as-is: a name or an
 * address and a port. Anything else is refused before a script is written.
 */
const HOST_HEADER = /^[A-Za-z0-9.\-[\]:]+$/;

/** The hub and the public site render the same installer body. */
export const installScript = (hub: string, releaseHost?: string): string =>
  generateInstallScript({
    hub,
    origin: `https://github.com/${RELEASE_REPOSITORY}`,
    releaseHost,
  });

/** How long a finished SSH add stays readable, for a dialog opened late. */
const JOB_TTL_MS = 60 * 60 * 1000;
/** Output kept per add. The steps are a dozen lines; `bun install` is the bulk. */
const MAX_LINES = 2000;
/**
 * How long a clean exit waits for the hub to see the machine. `join` itself
 * already waited for it, so this only covers the socket racing the exit.
 */
const REGISTER_GRACE_MS = 15_000;

/**
 * A target `ssh` reads as a destination and nothing else: no leading dash (an
 * option), no whitespace (a second argument once a shell splits it).
 */
const TARGET = /^[^-\s][^\s]*$/;

/** A remote shell's line ending, which a pty-less SSH session can still send. */
const CARRIAGE_RETURN = /\r$/;

/** Everything the output says went wrong, most specific first. */
const UNREACHABLE = [
  "Connection refused",
  "Connection timed out",
  "Operation timed out",
  "No route to host",
  "Could not resolve hostname",
  "Network is unreachable",
];

const problemOf = (
  lines: readonly string[],
  exitCode: number,
  machineId: string | null
): SshJoinProblem => {
  const text = lines.join("\n");
  if (text.includes("Permission denied (publickey")) {
    return { kind: "key" };
  }
  if (
    text.includes("REMOTE HOST IDENTIFICATION HAS CHANGED") ||
    text.includes("Host key verification failed")
  ) {
    return { kind: "host-key" };
  }
  const steps = lines.filter((line) => line.startsWith(INSTALL_STEP_PREFIX));
  const unreachable = UNREACHABLE.find((said) => text.includes(said));
  // ssh's own 255 with nothing from the script: the session never started.
  if (unreachable && exitCode === 255 && steps.length === 0) {
    return {
      kind: "unreachable",
      detail:
        lines.find((line) => line.includes(unreachable))?.trim() ?? unreachable,
    };
  }
  if (steps.length === 0 && text.includes("curl: (")) {
    return { kind: "download" };
  }
  const last = steps.at(-1);
  if (exitCode === 0 && machineId) {
    return { kind: "unregistered" };
  }
  return last
    ? { kind: "step", step: last.slice(INSTALL_STEP_PREFIX.length) }
    : { kind: "download" };
};

interface JoinDeps {
  /** Runs each finished job's forgetting until the hub closes. */
  readonly lifetime: HubLifetimeShape;
  /** Whether the hub holds a live socket from this machine right now. */
  readonly online: (machineId: string) => boolean;
}

export const joinRoutes = ({ lifetime, online }: JoinDeps) => {
  const jobs = new Map<string, SshJoinJob>();

  const settle = async (job: SshJoinJob): Promise<void> => {
    const { machineId, exitCode } = job;
    if (exitCode === 0 && machineId) {
      const deadline = Date.now() + REGISTER_GRACE_MS;
      while (!online(machineId) && Date.now() < deadline) {
        // biome-ignore lint/performance/noAwaitInLoops: a poll — each check must see the registry after the previous wait
        await Bun.sleep(500);
      }
      if (online(machineId)) {
        job.state = "done";
        return;
      }
    }
    job.problem = problemOf(job.lines, exitCode ?? -1, machineId);
    job.state = "failed";
  };

  const collect = async (
    job: SshJoinJob,
    stream: ReadableStream<Uint8Array>
  ): Promise<void> => {
    const decoder = new TextDecoder();
    const lines = new LineSplitter();
    const take = (line: string): void => {
      const clean = line.replace(CARRIAGE_RETURN, "");
      if (clean.startsWith(INSTALL_JOINED)) {
        job.machineId = clean.slice(INSTALL_JOINED.length).trim();
      }
      job.lines.push(clean);
      if (job.lines.length > MAX_LINES) {
        job.lines.splice(0, job.lines.length - MAX_LINES);
      }
    };
    for await (const chunk of stream) {
      for (const line of lines.push(decoder.decode(chunk, { stream: true }))) {
        take(line);
      }
    }
    const rest = lines.push(decoder.decode());
    for (const line of rest) {
      take(line);
    }
    if (lines.pending) {
      take(lines.end());
    }
  };

  const start = (target: string, port: number | null, hubUrl: string) => {
    const job: SshJoinJob = {
      id: crypto.randomUUID(),
      target,
      port,
      hubUrl,
      state: "running",
      lines: [],
      exitCode: null,
      machineId: null,
      problem: null,
    };
    jobs.set(job.id, job);
    const child = Bun.spawn(
      [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        "ConnectTimeout=10",
        ...(port === null ? [] : ["-p", String(port)]),
        "--",
        target,
        `curl -fsSL ${hubUrl}/install.sh | sh`,
      ],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" }
    );
    Promise.all([
      collect(job, child.stdout),
      collect(job, child.stderr),
      child.exited,
    ])
      .then(([, , code]) => {
        job.exitCode = code;
        return settle(job);
      })
      .finally(() => {
        lifetime.after(JOB_TTL_MS, () => jobs.delete(job.id));
      });
    return job;
  };

  return new Elysia()
    .get("/install.sh", async ({ request, status, set }) => {
      const host = request.headers.get("host");
      if (!(host && HOST_HEADER.test(host))) {
        return status(400, "The request has no usable Host header.");
      }
      if (!RELEASE_PUBLIC_KEY) {
        return status(
          503,
          "This hub's build cannot install machines yet: it carries no release key to check a download against, so it would hand out an installer that verifies nothing. Install a released build of CawCo on this hub to enable it."
        );
      }
      const installation = await readInstallation();
      set.headers["content-type"] = "text/x-shellscript; charset=utf-8";
      return installScript(`http://${host}`, installation?.releaseHost);
    })
    .get(
      "/api/join",
      async (): Promise<JoinInfo> => ({
        addresses: await joinAddresses(),
        sshPublicKey: sshPublicKey(),
        hubHostname: hostname(),
      })
    )
    .post(
      "/api/machines/ssh",
      {
        body: t.Object({
          target: t.String(),
          port: t.Optional(t.Integer({ minimum: 1, maximum: 65_535 })),
          hubUrl: t.String(),
        }),
      },
      async ({ body, status }) => {
        const target = body.target.trim();
        if (!TARGET.test(target)) {
          return status(
            422,
            "Enter the SSH target as user@host or a Host from ~/.ssh/config, with no spaces and no leading dash."
          );
        }
        const listed = await joinAddresses();
        if (!listed.some((address) => address.url === body.hubUrl)) {
          return status(
            422,
            "That hub address is not one this hub listed. Pick one from the list."
          );
        }
        return start(target, body.port ?? null, body.hubUrl);
      }
    )
    .get("/api/machines/ssh/:id", ({ params, status }) => {
      const job = jobs.get(params.id);
      return job ?? status(404, "No SSH add with that id on this hub.");
    });
};
