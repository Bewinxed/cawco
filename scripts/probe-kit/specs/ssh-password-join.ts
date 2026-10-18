/**
 * Connect a machine › Over SSH with a password (hub join.ts): the password
 * signs in one connection, which adds the hub's key to the machine's
 * `~/.ssh/authorized_keys` as `ssh-copy-id` does and runs the install in the
 * same session; every later add signs in with the key. The password is never
 * in an argv, an environment, a job's lines, the hub's log or its database.
 *
 * The scratch target is an SSH server on loopback (the maintained `ssh2`
 * package's): a non-root OpenSSH `sshd` cannot check a password, which needs
 * /etc/shadow or PAM. It takes one throwaway user and a random password full
 * of shell-hostile characters, signs in by password, keyboard-interactive or
 * a key in its own `authorized_keys`, and runs each command with `sh -c`
 * under a HOME of its own. The hub's `ssh` is system OpenSSH, through a
 * wrapper on the hub's PATH that names the scratch HOME's key and
 * known_hosts: OpenSSH reads `~` from the password database, never $HOME,
 * so the scratch hub's own `~/.ssh` would otherwise be the host user's.
 *
 * (a) Before any password, a key add is refused: the machine does not trust
 *     the hub's key yet.
 * (b) A wrong password is refused, classified as `password`, nothing added.
 * (c) The right password: the target's `authorized_keys` holds the hub's key
 *     once (`.ssh` 700, the file 600), and the install ran in that session.
 *     No process's argv or environment held the password while it signed in.
 * (d) The right password again: the key is still there once.
 * (e) A key add with no password now signs in with the key (BatchMode).
 * (g) An add stopped while it signs in: the stop answers `stopped`, its
 *     `ssh` and every process of its group are gone, and a fresh add works.
 * (h) A wrong password the machine answers with silence (as a firewall that
 *     bans the address after a failed password) ends the add within
 *     {@link SILENT_MS}, as a machine that stopped answering.
 * (i) An add that signed in and hangs on a hub address that never answers
 *     (the owner's: a tailnet address from a machine off the tailnet) says
 *     it signed in, and Stop ends it.
 * (j) Left alone, that download ends within {@link DOWNLOAD_MS}, as the
 *     machine unable to reach the hub.
 * (l) On a real OpenSSH sshd, Stop ends the command on the machine too
 *     (sshd signals none started without a terminal), and an add that runs
 *     to its end leaves no watchdog behind.
 * (k) The dialog's password field, masked, with its show/hide toggle.
 * (f) The password is in no job's lines, the hub's log or its database.
 *
 * (b) and (h) are timed: a wrong password ends the add, it never spins.
 *
 *   bun scripts/probe-kit/run.ts ssh-password-join
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  type AuthContext,
  type AuthenticationType,
  type ParsedKey,
  type PublicKeyAuthContext,
  Server,
  utils,
} from "ssh2";
import type { SshJoinJob } from "../../../packages/core/src/join";
import { until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const USER = "probe";
/** Quotes, `$`, a backslash, `!` and spaces: any shell that read it would change it. */
const PASSWORD = `pw '1" $HOME \\ !x ${crypto.randomUUID()}`;
const WRONG = `wrong ${crypto.randomUUID()}`;
/** A password the scratch target never answers: it says nothing more on that connection. */
const SILENCED = `silenced ${crypto.randomUUID()}`;
/** How long one add gets to end before the spec reads it as still spinning. */
const ADD_MS = 60_000;
/** How long a refused password may take to end the add: ssh's own round trips. */
const REFUSED_MS = 15_000;
/** How long a silenced sign-in may take: the hub's 10 s ServerAliveInterval, three asks, and slack. */
const SILENT_MS = 45_000;
/** How long a download the hub address never answers may take: curl's 60 s `--max-time`, and slack. */
const DOWNLOAD_MS = 80_000;

const PROCESS_ID = /^\d+$/;

/** A process's group, from /proc/<pid>/stat (the third field after the name). */
const groupOf = (pid: number): number | null => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[2]);
  } catch {
    return null;
  }
};

/** Every live process whose argv holds all of `parts`, or whose group is `group`. */
const processes = (match: { parts: string[] } | { group: number }): number[] =>
  readdirSync("/proc")
    .filter((entry) => PROCESS_ID.test(entry))
    .map(Number)
    .filter((pid) => {
      if ("group" in match) {
        return groupOf(pid) === match.group;
      }
      try {
        const argv = readFileSync(`/proc/${pid}/cmdline`, "utf8");
        return match.parts.every((part) => argv.includes(part));
      } catch {
        return false;
      }
    });

/** Every process's argv and environment that holds `secret`, read from /proc. */
const holders = (secret: string): string[] => {
  const found: string[] = [];
  for (const entry of readdirSync("/proc")) {
    if (!PROCESS_ID.test(entry)) {
      continue;
    }
    for (const part of ["cmdline", "environ"]) {
      try {
        if (readFileSync(`/proc/${entry}/${part}`).includes(secret)) {
          found.push(`${entry}/${part}`);
        }
      } catch {
        // Gone, or another user's: neither is one this hub started.
      }
    }
  }
  return found;
};

/** One add as a reviewer reads it in a PASS or FAIL line. */
const seen = (job: SshJoinJob) =>
  `${job.state} ${JSON.stringify(job.problem)} ${JSON.stringify(job.passwordProblem)}, exit ${job.exitCode}; lines ${JSON.stringify(job.lines.slice(-6))}`;

/** Stops the add `id` as the dialog's Stop does: the hub's answer, or its refusal, and either said. */
const stopAdd = (fleet: KitFleet, id: string) =>
  fleet.api<SshJoinJob>(`/api/machines/ssh/${id}/stop`, {}).then(
    (job) => ({ job, said: seen(job) }),
    (error: Error) => ({ job: null, said: error.message })
  );

/** The group of the first live process whose argv holds all of `parts`. */
const sshGroup = (parts: string[]): number | null => {
  const pid = processes({ parts }).at(0);
  return pid === undefined ? null : groupOf(pid);
};

/** `dir`'s and `file`'s permission bits, as `700 600`, or `none` when the file is missing. */
const modesOf = (dir: string, file: string): string =>
  existsSync(file)
    ? `${statSync(dir).mode.toString(8).slice(-3)} ${statSync(file).mode.toString(8).slice(-3)}`
    : "none";

const OVER_SSH = /Over SSH/;

/**
 * (l) On a real OpenSSH sshd (this user's own, unprivileged: key sign-in
 * only, the scratch target's `authorized_keys`, which holds the hub's key
 * by now): Stop ends what the add runs on the machine, not only the hub's
 * `ssh`, and an add that runs to its end leaves nothing behind.
 */
async function realSshd(
  kit: Kit,
  fleet: KitFleet,
  dir: string,
  authorized: string,
  urls: { refused: string; holding: string }
): Promise<void> {
  const lease = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: () => undefined },
  });
  const { port } = lease;
  lease.stop(true);
  const config = join(dir, "sshd_config");
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -f ${join(dir, "sshd_host_key")}`.quiet();
  writeFileSync(
    config,
    `Port ${port}\nListenAddress 127.0.0.1\nHostKey ${join(dir, "sshd_host_key")}\nPidFile ${join(dir, "sshd.pid")}\nAuthorizedKeysFile ${authorized}\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nUsePAM no\nStrictModes no\n`
  );
  const sshd = Bun.spawn(
    ["/usr/sbin/sshd", "-D", "-f", config, "-E", join(dir, "sshd.log")],
    { stdout: "ignore", stderr: "ignore" }
  );
  const user = (await Bun.$`id -un`.text()).trim();
  const begin = (hubUrl: string) =>
    fleet.api<SshJoinJob>("/api/machines/ssh", {
      target: `${user}@127.0.0.1`,
      port,
      hubUrl,
    });
  const read = (id: string) => fleet.api<SshJoinJob>(`/api/machines/ssh/${id}`);
  const remoteCurl = () =>
    processes({ parts: ["curl", `${urls.holding}/install.sh`] });
  const watchdogs = () => processes({ parts: ["while ps -p"] });
  try {
    await until(
      "the real sshd listening",
      () => existsSync(join(dir, "sshd.pid")) || undefined,
      Boolean,
      10_000
    );
    const held = await begin(urls.holding);
    const curl = await until(
      "the machine's curl holding the download",
      () => remoteCurl().at(0),
      Boolean,
      20_000
    ).catch(() => undefined);
    const curlGroup = curl === undefined ? null : groupOf(curl);
    const stopped = await stopAdd(fleet, held.id);
    const gone = await until(
      "the machine's curl and its group gone",
      () =>
        remoteCurl().length === 0 &&
        processes({ group: curlGroup ?? -1 }).length === 0
          ? true
          : undefined,
      Boolean,
      10_000
    ).catch(() => false);
    kit.check(
      "l: on a real sshd, Stop ends what the add runs on the machine: its curl and every process of that group are gone within 10 s",
      stopped.job?.state === "stopped" && curl !== undefined && gone === true,
      `stop answered ${stopped.said}; machine's curl ${curl} (group ${curlGroup}); left ${JSON.stringify(remoteCurl())} and in the group ${JSON.stringify(processes({ group: curlGroup ?? -1 }))}`
    );
    const ran = await begin(urls.refused);
    const ended = await until(
      "the add on the real sshd ended",
      () => read(ran.id),
      (job) => job.state !== "running",
      30_000
    ).catch(() => read(ran.id));
    const strays = await until(
      "no watchdog left on the machine",
      () => (watchdogs().length === 0 ? true : undefined),
      Boolean,
      5000
    ).catch(() => false);
    kit.check(
      "l: on a real sshd, an add that runs to its end exits with its own failure and leaves no watchdog behind",
      ended.problem?.kind === "download" && strays === true,
      `${seen(ended)}; watchdogs left ${JSON.stringify(watchdogs())}`
    );
  } finally {
    sshd.kill();
  }
}

/** (k) The dialog's password field: masked, and its toggle flips it. */
async function passwordField(kit: Kit, fleet: KitFleet): Promise<void> {
  const page = await kit.page("desk");
  await open(page, `${await fleet.dashboard()}/`, "button[aria-haspopup]");
  await page.getByRole("button", { name: OVER_SSH }).first().click();
  await page.waitForSelector("#join-password");
  const fieldNow = () =>
    page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>("#join-password");
      const toggle = document.querySelector<HTMLButtonElement>(
        'button[aria-controls="join-password"]'
      );
      return {
        type: input?.type,
        autocomplete: input?.getAttribute("autocomplete"),
        spellcheck: input?.getAttribute("spellcheck"),
        autocapitalize: input?.getAttribute("autocapitalize"),
        name: toggle?.getAttribute("aria-label"),
        pressed: toggle?.getAttribute("aria-pressed"),
        inside: Boolean(
          toggle && input?.closest("[data-slot=input-group]")?.contains(toggle)
        ),
      };
    });
  const masked = await fieldNow();
  await page.getByRole("button", { name: "Show password" }).click();
  const shown = await fieldNow();
  await page.getByRole("button", { name: "Hide password" }).click();
  const maskedAgain = await fieldNow();
  kit.check(
    "k: the password field is masked with its attributes, and its toggle inside it flips type, name and aria-pressed",
    masked.type === "password" &&
      masked.autocomplete === "current-password" &&
      masked.spellcheck === "false" &&
      masked.autocapitalize === "off" &&
      masked.name === "Show password" &&
      masked.pressed === "false" &&
      masked.inside &&
      shown.type === "text" &&
      shown.name === "Hide password" &&
      shown.pressed === "true" &&
      maskedAgain.type === "password" &&
      maskedAgain.pressed === "false",
    `masked ${JSON.stringify(masked)}; shown ${JSON.stringify(shown)}; masked again ${JSON.stringify(maskedAgain)}`
  );
}

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const dir = join(fleet.sandbox, "ssh-target");
  const home = join(dir, "home");
  const bin = join(dir, "bin");
  mkdirSync(home, { recursive: true });
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(fleet.home, ".ssh"), { recursive: true, mode: 0o700 });
  const hubKey = join(fleet.home, ".ssh", "id_ed25519");
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -C cawco-probe-hub -f ${hubKey}`.quiet();
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -f ${join(dir, "host_key")}`.quiet();
  const hubPublic = readFileSync(`${hubKey}.pub`, "utf8").trim();
  const hubBlob = hubPublic.split(" ").slice(0, 2).join(" ");
  writeFileSync(
    join(dir, "ssh_config"),
    `UserKnownHostsFile ${join(dir, "known_hosts")}\nIdentityFile ${hubKey}\nIdentitiesOnly yes\n`
  );
  writeFileSync(
    join(bin, "ssh"),
    `#!/bin/sh\nexec /usr/bin/ssh -F ${join(dir, "ssh_config")} "$@"\n`
  );
  chmodSync(join(bin, "ssh"), 0o755);
  // Inside a workspace boundary the hub's machine has no address but
  // loopback, so `/api/join` lists none to choose. This `tailscale` gives it
  // two. 127.0.0.2, where the hub (bound to 127.0.0.1) does not answer: the
  // target's `curl` of the install script is refused, which shows the
  // install ran in the session without installing a build there. And
  // 127.0.0.3, its "DNS name", where a socket of this spec's accepts and
  // never answers: a hub address that holds the download, as a tailnet
  // address does for a machine off the tailnet.
  writeFileSync(
    join(bin, "tailscale"),
    `#!/bin/sh\ncase "$1" in ip) echo 127.0.0.2 ;; *) echo '{"Self":{"DNSName":"127.0.0.3."}}' ;; esac\n`
  );
  chmodSync(join(bin, "tailscale"), 0o755);

  const authorized = join(home, ".ssh", "authorized_keys");
  const signedIn: string[] = [];
  const triedPasswords: string[] = [];
  const holdersAtSignIn: string[] = [];
  /** How many sign-ins were met with silence ({@link SILENCED}). */
  let silenced = 0;
  /** Whether `password` signs in by `way`, noting every try and, as it signs in, who held it. */
  const accepts = (password: string, way: string): boolean => {
    triedPasswords.push(password);
    if (password !== PASSWORD) {
      return false;
    }
    holdersAtSignIn.push(...holders(PASSWORD));
    signedIn.push(way);
    return true;
  };
  const trusted = (): ParsedKey[] =>
    existsSync(authorized)
      ? readFileSync(authorized, "utf8")
          .split("\n")
          .filter(Boolean)
          .flatMap((line) => {
            const key = utils.parseKey(line);
            return key instanceof Error ? [] : [key as ParsedKey];
          })
      : [];
  /**
   * A key sign-in: the key is one `authorized_keys` holds, and its
   * signature, once sent, verifies (before it, the client only asks).
   */
  const keyAccepted = (ctx: PublicKeyAuthContext): boolean => {
    const { key, signature, blob, hashAlgo } = ctx;
    const match = trusted().find(
      (one) => one.type === key.algo && one.getPublicSSH().equals(key.data)
    );
    if (!(match && signature && blob)) {
      return Boolean(match);
    }
    const verified = match.verify(blob, signature, hashAlgo) === true;
    if (verified) {
      signedIn.push("publickey");
    }
    return verified;
  };
  const WAYS: AuthenticationType[] = [
    "publickey",
    "password",
    "keyboard-interactive",
  ];
  const authenticate = (ctx: AuthContext): void => {
    const answer = (ok: boolean): void => {
      if (ok) {
        ctx.accept();
      } else {
        ctx.reject(WAYS);
      }
    };
    if (ctx.username !== USER) {
      answer(false);
      return;
    }
    switch (ctx.method) {
      case "password":
        if (ctx.password === SILENCED) {
          silenced += 1;
          break;
        }
        answer(accepts(ctx.password, "password"));
        break;
      case "keyboard-interactive":
        ctx.prompt([{ prompt: "Password: ", echo: false }], (answers) =>
          answer(accepts(answers[0] ?? "", "keyboard-interactive"))
        );
        break;
      case "publickey":
        answer(keyAccepted(ctx));
        break;
      default:
        answer(false);
    }
  };
  const server = new Server(
    { hostKeys: [readFileSync(join(dir, "host_key"))] },
    (client) => {
      client
        .on("authentication", authenticate)
        .on("ready", () => {
          client.on("session", (accept) => {
            accept().on("exec", (acceptExec, _reject, info) => {
              const channel = acceptExec();
              const child = Bun.spawn(["sh", "-c", info.command], {
                cwd: home,
                env: { HOME: home, PATH: process.env.PATH ?? "/usr/bin:/bin" },
                stdin: "ignore",
                stdout: "pipe",
                stderr: "pipe",
              });
              // As sshd does: output as it comes, the exit once both ends close.
              const relay = async (
                from: ReadableStream<Uint8Array>,
                to: { write: (chunk: Uint8Array) => unknown }
              ) => {
                for await (const chunk of from) {
                  to.write(chunk);
                }
              };
              Promise.all([
                relay(child.stdout, channel),
                relay(child.stderr, channel.stderr),
                child.exited,
              ]).then(([, , code]) => {
                channel.exit(code);
                channel.end();
              });
            });
          });
        })
        .on("error", () => undefined);
    }
  );
  const port = await new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as { port: number }).port);
    });
  });

  const jobs: SshJoinJob[] = [];
  try {
    fleet.launch("hub", [], { PATH: `${bin}:${fleet.env.PATH}` });
    await fleet.hubUp();
    const info = await fleet.api<{ addresses: { url: string }[] }>("/api/join");
    const hubUrl = info.addresses[0]?.url ?? "";
    const holdingUrl = info.addresses[1]?.url ?? "";
    kit.check(
      "the hub lists the two addresses to hand the install",
      hubUrl.includes("127.0.0.2") && holdingUrl.includes("127.0.0.3"),
      JSON.stringify(info.addresses)
    );
    // Accepts the machine's `curl` and never answers it.
    const holding = Bun.listen({
      hostname: "127.0.0.3",
      port: Number(new URL(fleet.base).port),
      socket: { data: () => undefined },
    });
    const begin = (password?: string, address = hubUrl) =>
      fleet.api<SshJoinJob>("/api/machines/ssh", {
        target: `${USER}@127.0.0.1`,
        port,
        hubUrl: address,
        ...(password === undefined ? {} : { password }),
      });
    const read = (id: string) =>
      fleet.api<SshJoinJob>(`/api/machines/ssh/${id}`);
    /**
     * One add through the hub API, read until it ends, and how long that
     * took. One still running after {@link ADD_MS} is answered as it reads.
     */
    const timedAdd = async (password?: string, address = hubUrl) => {
      const from = Date.now();
      const started = await begin(password, address);
      const ended = await until(
        `the add ${started.id} ended`,
        () => read(started.id),
        (job) => job.state !== "running",
        ADD_MS
      ).catch(() => read(started.id));
      jobs.push(ended);
      return { job: ended, ms: Date.now() - from };
    };
    const add = async (password?: string) => (await timedAdd(password)).job;
    const keyLines = () =>
      existsSync(authorized)
        ? readFileSync(authorized, "utf8")
            .split("\n")
            .filter((line) => line.startsWith(hubBlob))
        : [];
    /** The install ran: its download was tried, from the address given. */
    const installed = (job: SshJoinJob) =>
      job.problem?.kind === "download" &&
      job.lines.some((line: string) => line.includes("curl: ("));

    // (a) The hub's key is not trusted yet.
    const before = await add();
    kit.check(
      "a: before a password, the machine refuses the hub's key",
      before.problem?.kind === "key" && keyLines().length === 0,
      seen(before)
    );

    // (b) A wrong password.
    const { job: wrong, ms: wrongMs } = await timedAdd(WRONG);
    kit.check(
      `b: a wrong password is refused within ${REFUSED_MS / 1000} s and classified as the password (asked, beside a null problem while the bridge stands), and nothing is added`,
      wrong.problem === null &&
        wrong.passwordProblem?.asked === true &&
        wrongMs < REFUSED_MS &&
        triedPasswords.includes(WRONG) &&
        keyLines().length === 0,
      `${seen(wrong)}; ended after ${wrongMs} ms; passwords tried ${triedPasswords.length}`
    );

    // (c) The right password.
    const first = await add(PASSWORD);
    const modes = modesOf(join(home, ".ssh"), authorized);
    kit.check(
      "c: the password signs in, the hub's key is added once (.ssh 700, the file 600), and the install runs in the same session",
      signedIn.includes("password") &&
        keyLines().length === 1 &&
        keyLines()[0] === hubPublic &&
        modes === "700 600" &&
        installed(first),
      `${seen(first)}; signed in by ${signedIn.join(", ")}; key lines ${JSON.stringify(keyLines())}; modes ${modes}`
    );
    kit.check(
      "c: no process's argv or environment held the password while it signed in",
      holdersAtSignIn.length === 0,
      holdersAtSignIn.join(", ")
    );

    // (d) Again: append only when absent.
    const again = await add(PASSWORD);
    kit.check(
      "d: a second password add leaves the key there once",
      keyLines().length === 1 && installed(again),
      `${seen(again)}; key lines ${keyLines().length}`
    );

    // (e) The key alone now.
    const byKey = await add();
    kit.check(
      "e: an add with no password signs in with the hub's key (BatchMode) and runs the install",
      signedIn.at(-1) === "publickey" && installed(byKey),
      `${seen(byKey)}; signed in by ${signedIn.join(", ")}`
    );

    // (g) Stopped while it signs in: the machine never answers the password.
    const held = await begin(SILENCED);
    const sshArgv = ["/usr/bin/ssh", `${USER}@127.0.0.1`, String(port)];
    const pid = await until(
      "the add's ssh signing in",
      () => (silenced > 0 ? processes({ parts: sshArgv }).at(0) : undefined),
      Boolean,
      15_000
    ).catch(() => undefined);
    const group = sshGroup(sshArgv);
    const stopped = await stopAdd(fleet, held.id);
    const left = processes({ group: group ?? -1 });
    const reread = await read(held.id);
    jobs.push(reread);
    kit.check(
      "g: Stop ends an add that signs in: it reads stopped, its ssh and every process of its group are gone, and no step ran",
      stopped.job?.state === "stopped" &&
        reread.state === "stopped" &&
        group === pid &&
        left.length === 0 &&
        processes({ parts: sshArgv }).length === 0 &&
        !reread.lines.some((line) => line.startsWith("cawco-install: ")),
      `stop answered ${stopped.said}; ssh pid ${pid}, group ${group}, left in the group ${JSON.stringify(left)}`
    );
    const afterStop = await add(PASSWORD);
    kit.check(
      "g: a fresh add after the stop signs in and runs the install",
      installed(afterStop),
      seen(afterStop)
    );

    // (h) A wrong password met with silence: the add ends, it never spins.
    const { job: silent, ms: silentMs } = await timedAdd(SILENCED);
    kit.check(
      `h: a sign-in the machine stops answering ends within ${SILENT_MS / 1000} s, as a machine that did not answer (timed out)`,
      silent.state === "failed" &&
        silent.problem?.kind === "unreachable" &&
        silent.problem.detail.includes("timed out") &&
        silentMs < SILENT_MS,
      `${seen(silent)}; ended after ${silentMs} ms`
    );

    // (i) Signed in, the download held by a hub address that never answers:
    // the job says it has signed in, and Stop ends it.
    const downloading = await begin(PASSWORD, holdingUrl);
    const signedInRead = await until(
      "the add past its sign-in, on its download step",
      () => read(downloading.id),
      (job) =>
        job.lines.some((line) =>
          line.startsWith("cawco-install: downloading the install script")
        ),
      15_000
    ).catch(() => read(downloading.id));
    const downloadGroup = sshGroup(sshArgv);
    const stoppedDownload = await stopAdd(fleet, downloading.id);
    jobs.push(await read(downloading.id));
    kit.check(
      "i: once signed in the job says so (its download step) while it runs, and Stop ends a download that hangs: stopped, its ssh group gone",
      signedInRead.state === "running" &&
        signedInRead.lines.some((line) =>
          line.startsWith("cawco-install: downloading the install script")
        ) &&
        stoppedDownload.job?.state === "stopped" &&
        downloadGroup !== null &&
        processes({ group: downloadGroup }).length === 0,
      `while running ${seen(signedInRead)}; stop answered ${stoppedDownload.said}; group ${downloadGroup}`
    );

    // (j) The same hanging download, left alone, ends within curl's limits.
    const { job: held2, ms: heldMs } = await timedAdd(PASSWORD, holdingUrl);
    kit.check(
      `j: a download the hub address never answers ends within ${DOWNLOAD_MS / 1000} s, as the machine unable to reach the hub`,
      held2.state === "failed" &&
        held2.problem?.kind === "download" &&
        heldMs < DOWNLOAD_MS,
      `${seen(held2)}; ended after ${heldMs} ms`
    );
    await realSshd(kit, fleet, dir, authorized, {
      refused: hubUrl,
      holding: holdingUrl,
    });
    holding.stop(true);

    await passwordField(kit, fleet);

    // (f) Nowhere kept.
    const reads = await Promise.all(
      jobs.map((job) =>
        fetch(`${fleet.base}/api/machines/ssh/${job.id}`).then((r) => r.text())
      )
    );
    const log = await fleet.logs("hub");
    const dbDir = dirname(fleet.env.CAWCO_DB_PATH ?? "");
    const dbFiles = readdirSync(dbDir).filter((name) => name.includes(".db"));
    const inDb = dbFiles.filter((name) =>
      readFileSync(join(dbDir, name)).includes(PASSWORD)
    );
    const askpass = join(dbDir, "ssh-askpass");
    kit.check(
      "f: the password is in no job's lines, the hub's log, its database or the askpass helper",
      reads.every((text) => !text.includes(PASSWORD)) &&
        !log.includes(PASSWORD) &&
        inDb.length === 0 &&
        dbFiles.length > 0 &&
        existsSync(askpass) &&
        !readFileSync(askpass, "utf8").includes(PASSWORD),
      `jobs read ${reads.length}, holding it ${reads.filter((text) => text.includes(PASSWORD)).length}; hub log ${log.length} chars, holds it ${log.includes(PASSWORD)}; database files ${dbFiles.join(", ")}, holding it ${inDb.join(", ") || "none"}`
    );
  } finally {
    server.close();
    writeFileSync(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch((error: Error) => error.message)
    );
  }
}

export default { name: "ssh-password-join", run } satisfies Spec;
