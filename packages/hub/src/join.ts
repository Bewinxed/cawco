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
 * types reaches a shell: the target is one argv entry for `ssh`, the hub
 * address in the remote command is one this hub listed itself, and a
 * password goes only to `ssh`'s askpass, on its stdin.
 *
 * A machine that does not trust the hub's key yet is added with its
 * password: that one connection signs in with it, appends the hub's key to
 * `~/.ssh/authorized_keys` as `ssh-copy-id` does, and runs the same install.
 * The password is never in an argv, a file, a job's lines or the database.
 */

import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname, networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
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
import { readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import { generateInstallScript } from "@cawco/core/install-script";
import { LineSplitter } from "@cawco/core/lines";
import { RELEASE_PUBLIC_KEY } from "@cawco/core/release-key";
import { Elysia, t } from "elysia";
import { DB_PATH, HUB_PORT } from "./config";
import type { HubLifetimeShape } from "./lifetime";
import { localHubName } from "./mdns";

/** How long a short command gets to answer. Our choice. */
const OUTPUT_MS = 3000;

/**
 * Runs a short command and answers its stdout, or undefined when it failed.
 * One that did not answer in time is said once in the log, apart from a
 * failure, and its rows are not listed.
 */
const output = async (argv: string[]): Promise<string | undefined> => {
  const ran = await readWithin(OUTPUT_MS, async (signal) => {
    const child = Bun.spawn(argv, {
      stdout: "pipe",
      stderr: "ignore",
      stdin: "ignore",
      signal,
    });
    const [text, code] = await Promise.all([
      new Response(child.stdout).text(),
      child.exited,
    ]);
    return code === 0 ? text.trim() : undefined;
  });
  switch (ran.kind) {
    case "answered":
      return ran.value;
    case "unanswered":
      console.warn(
        `[join] ${argv.join(" ")} did not answer within ${Math.round(ran.after / 1000)} s; what it would list is not listed`
      );
      return;
    default: {
      const unhandled: never = ran;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

const TRAILING_DOT = /\.$/;

/**
 * Every address a machine could reach this hub on: Tailscale first, because a
 * tailnet address works from anywhere the machine is, then every non-internal
 * IPv4 labelled with its interface, then the `.local` name the hub holds on
 * its networks (mdns.ts), which keeps working when the hub's address changes
 * but reaches only machines on the same network. The Tailscale IP also shows
 * up as an interface (`tailscale0`, `utun…`); it is listed once, under
 * Tailscale. A machine without the `tailscale` binary simply has no Tailscale
 * rows, and a hub with mDNS off has no `.local` row.
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
  const local = localHubName();
  if (local) {
    found.push({ label: "On this network", url: url(local) });
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

/** A password `ssh` could not be handed on askpass's one line. */
const LINE_BREAK = /[\r\n]/;

/**
 * The askpass program a password add runs `ssh` with. `ssh` runs it once
 * per prompt and reads its stdout as the answer (ssh(1), SSH_ASKPASS); it
 * shares `ssh`'s stdin, a pipe that holds the password's one line, so the
 * first prompt is answered and a second one finds the pipe empty and gives
 * up. `read -r` takes the line as it is and `printf '%s'` prints it as data,
 * so no character of it is ever read as shell.
 */
const ASKPASS = `#!/bin/sh
IFS= read -r password || exit 1
printf '%s\\n' "$password"
`;

/** Where {@link ASKPASS} is written, beside the hub's database. */
const ASKPASS_PATH = join(dirname(DB_PATH), "ssh-askpass");

/** {@link ASKPASS} on disk, executable by this user alone, written only when it is not already as it should be. */
const askpass = (): string => {
  if (
    !existsSync(ASKPASS_PATH) ||
    readFileSync(ASKPASS_PATH, "utf8") !== ASKPASS
  ) {
    writeFileSync(ASKPASS_PATH, ASKPASS, { mode: 0o700 });
  }
  chmodSync(ASKPASS_PATH, 0o700);
  return ASKPASS_PATH;
};

/**
 * A public key line, and a comment that can stand inside the trust step's
 * quotes: no quote, `$`, backtick, backslash or `!` for any login shell
 * (sh, bash, zsh, fish, csh) to read.
 */
const PUBLIC_KEY = /^(\S+ [A-Za-z0-9+/]+=*)(?: (.*))?$/;
const PLAIN_COMMENT = /^[\w@.:,+=/ -]*$/;

/** The trust command's step line, worded as the install script words its own. */
const TRUST_STEP = "adding this hub's SSH key";

/**
 * The step the remote command prints before it fetches the install script:
 * the first line of a session that has signed in, which tells the dialog the
 * install runs on the machine now.
 */
const DOWNLOAD_STEP = "downloading the install script from ";

/**
 * How long a connection gets to open: `ssh`'s to the machine, and the
 * machine's `curl` to the hub address. Without the second, an address the
 * machine cannot route to (a tailnet address off the tailnet) holds the add
 * for the kernel's whole connect timeout, minutes. curl(1):
 * "--connect-timeout … Maximum time in seconds that you allow curl's
 * connection to take." Our choice.
 */
const CONNECT_S = 10;

/**
 * How long the machine's `curl` gets for the install script as a whole,
 * once connected: the script is a few kilobytes. curl(1) `--max-time`. Our
 * choice.
 */
const DOWNLOAD_MAX_S = 60;

/**
 * curl's own exits for an address it could not reach (`curl: (6)` the name
 * did not resolve, `(7)` the connection failed, `(28)` it timed out); any
 * other `curl: (` is the hub answering, and the download step's failure.
 */
const UNREACHED = /curl: \((?:6|7|28)\)/;

/**
 * How often `ssh` asks a silent server whether it is still there, three
 * times before it gives up: a server that stops answering mid-sign-in (a
 * firewall that bans the address after a failed password) ends the add in
 * about 30 s. Debian's OpenSSH sets 300 under BatchMode alone, so a password
 * add had none and waited forever. ssh_config(5), ServerAliveInterval:
 * "The default is 0 … or 300 if the BatchMode option is set
 * (Debian-specific)." Our choice of 10.
 */
const SERVER_ALIVE_S = 10;

/** The command a session runs once it has signed in: its step line, then the install. */
const installCommand = (hubUrl: string): string =>
  `echo "${INSTALL_STEP_PREFIX}${DOWNLOAD_STEP}${hubUrl}" && curl -fsSL --connect-timeout ${CONNECT_S} --max-time ${DOWNLOAD_MAX_S} ${hubUrl}/install.sh | sh`;

/**
 * What `ssh-copy-id` does on the machine, run ahead of the install by a
 * password add: `~/.ssh` made 700 and `authorized_keys` 600 when they are
 * missing (and left as they are when they exist), a final newline added to
 * the file when it lacks one, and the key appended only when the file does
 * not hold it already. It prints its step line first, so a failure is
 * named by it. It runs under `sh -c` whatever the account's login
 * shell is, quoted so that every login shell hands it over as it is: one
 * single-quoted word holding no quote or backslash (fish reads `\\` and
 * `\'` inside single quotes). Its apostrophe is printf's `\047`, which no
 * shell's single quotes touch. A key whose comment could not stand in that
 * word is added without the comment; a comment is a label, never part of
 * the key.
 */
const trustCommand = (key: string): string | null => {
  const [, blob, comment] = PUBLIC_KEY.exec(key) ?? [];
  if (!blob) {
    return null;
  }
  const line =
    comment && PLAIN_COMMENT.test(comment) ? `${blob} ${comment}` : blob;
  const file = '"$HOME/.ssh/authorized_keys"';
  const step = `${INSTALL_STEP_PREFIX}${TRUST_STEP}`.replace("'", "\\047");
  return `sh -c 'printf "${step}\\n" && umask 077 && mkdir -p "$HOME/.ssh" && touch ${file} && { [ -z "$(tail -c 1 ${file})" ] || echo >> ${file}; } && { grep -qF "${blob}" ${file} || echo "${line}" >> ${file}; }'`;
};

/** Everything the output says went wrong, most specific first. */
const UNREACHABLE = [
  "Connection refused",
  "Connection timed out",
  "Operation timed out",
  "No route to host",
  "Could not resolve hostname",
  "Network is unreachable",
  // ServerAliveInterval's end: `Connection to <host> port <port> timed out`.
  "timed out",
];

/**
 * `ssh`'s last word when no way of signing in worked, with the ways the
 * machine had left to offer: `user@host: Permission denied (publickey,password).`
 */
const DENIED = /Permission denied \(([^)]*)\)/;

/** The ways of signing in a password answers. */
const BY_PASSWORD = new Set(["password", "keyboard-interactive"]);

const problemOf = (
  lines: readonly string[],
  exitCode: number,
  machineId: string | null,
  byPassword: boolean
): SshJoinProblem => {
  const text = lines.join("\n");
  const steps = lines.filter((line) => line.startsWith(INSTALL_STEP_PREFIX));
  // ssh's own 255 with nothing from the script: the session never started.
  const unstarted = exitCode === 255 && steps.length === 0;
  const denied = unstarted ? DENIED.exec(text) : null;
  if (denied && byPassword) {
    const offered = (denied[1] ?? "").split(",").filter(Boolean);
    // A machine that offered ways and none of them a password never asked for it.
    return {
      kind: "password",
      asked:
        offered.length === 0 || offered.some((way) => BY_PASSWORD.has(way)),
    };
  }
  if (denied?.[1]?.startsWith("publickey")) {
    return { kind: "key" };
  }
  if (
    text.includes("REMOTE HOST IDENTIFICATION HAS CHANGED") ||
    text.includes("Host key verification failed")
  ) {
    return { kind: "host-key" };
  }
  const unreachable = UNREACHABLE.find((said) => text.includes(said));
  if (unreachable && unstarted) {
    return {
      kind: "unreachable",
      detail:
        lines.find((line) => line.includes(unreachable))?.trim() ?? unreachable,
    };
  }
  const last = steps.at(-1)?.slice(INSTALL_STEP_PREFIX.length);
  if (last?.startsWith(DOWNLOAD_STEP) && UNREACHED.test(text)) {
    return { kind: "download" };
  }
  if (exitCode === 0 && machineId) {
    return { kind: "unregistered" };
  }
  // No step line at all: it never signed in, for a reason none of the above names.
  return { kind: "step", step: last ?? "connecting over SSH" };
};

interface JoinDeps {
  /** Runs each finished job's forgetting until the hub closes. */
  readonly lifetime: HubLifetimeShape;
  /** Whether the hub holds a live socket from this machine right now. */
  readonly online: (machineId: string) => boolean;
}

/** How long a stopped `ssh` gets to close its connection before its group is killed outright. Our choice. */
const STOP_GRACE_MS = 3000;

/**
 * Signals `ssh`'s process group: `ssh` and the askpass it may be running.
 * One that is already gone has nothing left to signal.
 */
const signalGroup = (pid: number, signal: "SIGTERM" | "SIGKILL"): void => {
  try {
    process.kill(-pid, signal);
  } catch {
    // ESRCH: the group exited between the stop and the signal.
  }
};

/** An add's `ssh` while it runs, and its run as a whole, settled. */
interface Run {
  readonly child: Bun.Subprocess;
  readonly ended: Promise<void>;
  stopped: boolean;
}

export const joinRoutes = ({ lifetime, online }: JoinDeps) => {
  const jobs = new Map<string, SshJoinJob>();
  const runs = new Map<string, Run>();

  const settle = async (
    job: SshJoinJob,
    byPassword: boolean
  ): Promise<void> => {
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
    const problem = problemOf(job.lines, exitCode ?? -1, machineId, byPassword);
    // The `password` kind rides beside a null `problem` while an installable
    // app reads `problem` closed: the bridge's one place (scripts/
    // wire-compat.ts BRIDGES). Once the guard says no shipped reader needs
    // it, this and `passwordProblem` go.
    if (problem.kind === "password") {
      job.passwordProblem = { asked: problem.asked };
    } else {
      job.problem = problem;
    }
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

  /**
   * One SSH add. With `trust` (the password, and the trust step for the
   * hub's key) the connection signs in by password alone, through
   * {@link ASKPASS} on `ssh`'s stdin, and adds the key before the install;
   * without it, by key with no prompt at all (BatchMode). `-n` keeps that
   * stdin from the remote command: `ssh` hands the session /dev/null. `ssh`
   * leads a process group of its own (`detached`, setsid), so a stop ends it
   * and its askpass together.
   */
  const start = (
    target: string,
    port: number | null,
    hubUrl: string,
    trust: { password: string; command: string } | null
  ) => {
    const install = installCommand(hubUrl);
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
        "-n",
        ...(trust
          ? [
              "-o",
              "PreferredAuthentications=password,keyboard-interactive",
              "-o",
              "PubkeyAuthentication=no",
              "-o",
              "NumberOfPasswordPrompts=1",
            ]
          : ["-o", "BatchMode=yes"]),
        "-o",
        "StrictHostKeyChecking=accept-new",
        "-o",
        `ConnectTimeout=${CONNECT_S}`,
        "-o",
        `ServerAliveInterval=${SERVER_ALIVE_S}`,
        ...(port === null ? [] : ["-p", String(port)]),
        "--",
        target,
        trust ? `${trust.command} && ${install}` : install,
      ],
      {
        stdin: trust
          ? new TextEncoder().encode(`${trust.password}\n`)
          : "ignore",
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
        env: trust
          ? {
              ...process.env,
              SSH_ASKPASS: askpass(),
              SSH_ASKPASS_REQUIRE: "force",
            }
          : process.env,
      }
    );
    const ended = Promise.all([
      collect(job, child.stdout),
      collect(job, child.stderr),
      child.exited,
    ])
      .then(([, , code]) => {
        job.exitCode = code;
        if (run.stopped) {
          job.state = "stopped";
          return;
        }
        return settle(job, trust !== null);
      })
      .finally(() => {
        runs.delete(job.id);
        lifetime.after(JOB_TTL_MS, () => jobs.delete(job.id));
      });
    const run: Run = { child, ended, stopped: false };
    runs.set(job.id, run);
    detach(ended, "machine join");
    return job;
  };

  /**
   * Stops an add that runs: its `ssh` group is asked to end (TERM, so `ssh`
   * closes the connection), then killed if it has not within
   * {@link STOP_GRACE_MS}. Answers once the run has ended and reads
   * `stopped`. sshd sends a remote command started without a terminal no
   * signal when the connection closes, so one that had signed in ends at its
   * next write to the closed session; the install script writes a line per
   * step. It gets no terminal because the script asks its questions on one.
   */
  const stop = async (run: Run): Promise<void> => {
    run.stopped = true;
    signalGroup(run.child.pid, "SIGTERM");
    const exit = await readWithin(STOP_GRACE_MS, () => run.child.exited);
    switch (exit.kind) {
      case "answered":
        break;
      case "unanswered":
        signalGroup(run.child.pid, "SIGKILL");
        break;
      default: {
        const unhandled: never = exit;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    await run.ended;
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
    .get("/api/join", async (): Promise<JoinInfo> => ({
      addresses: await joinAddresses(),
      sshPublicKey: sshPublicKey(),
      hubHostname: hostname(),
    }))
    .post(
      "/api/machines/ssh",
      {
        body: t.Object({
          target: t.String(),
          port: t.Optional(t.Integer({ minimum: 1, maximum: 65_535 })),
          hubUrl: t.String(),
          password: t.Optional(t.String()),
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
        const password = body.password ?? "";
        if (LINE_BREAK.test(password)) {
          return status(
            422,
            "That password has a line break, which SSH cannot be handed. Check it, or add this hub's key to the machine yourself, then try again."
          );
        }
        const key = password === "" ? null : sshPublicKey();
        if (password !== "" && !key) {
          return status(
            422,
            `This hub has no SSH key to add to the machine yet. Create one on ${hostname()} with ssh-keygen -t ed25519, then try again.`
          );
        }
        const command = key === null ? null : trustCommand(key);
        if (key !== null && command === null) {
          return status(
            422,
            "This hub's SSH public key is not a key line ssh-copy-id would add. Check ~/.ssh on the hub's machine, then try again."
          );
        }
        const listed = await joinAddresses();
        if (!listed.some((address) => address.url === body.hubUrl)) {
          return status(
            422,
            "That hub address is not one this hub listed. Pick one from the list."
          );
        }
        return start(
          target,
          body.port ?? null,
          body.hubUrl,
          command === null ? null : { password, command }
        );
      }
    )
    .get("/api/machines/ssh/:id", ({ params, status }) => {
      const job = jobs.get(params.id);
      return job ?? status(404, "No SSH add with that id on this hub.");
    })
    .post("/api/machines/ssh/:id/stop", async ({ params, status }) => {
      const job = jobs.get(params.id);
      if (!job) {
        return status(404, "No SSH add with that id on this hub.");
      }
      const run = runs.get(params.id);
      if (!run) {
        return status(
          409,
          `That SSH add to ${job.target} has already ended, so there is nothing to stop.`
        );
      }
      await stop(run);
      return job;
    });
};
