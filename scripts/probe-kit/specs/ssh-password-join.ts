/**
 * Connect a machine › Over SSH with a password (hub join.ts): the password
 * signs in one connection, which adds the hub's key to the machine's
 * `~/.ssh/authorized_keys` as `ssh-copy-id` does; the hub's own connection
 * to the machine (ssh-tunnels.ts) and the install sign in with that key, and
 * so does every later add. The password is never in an argv, an
 * environment, a job's lines, the hub's log or its database.
 *
 * The scratch target is an SSH server on loopback (the maintained `ssh2`
 * package's): a non-root OpenSSH `sshd` cannot check a password, which needs
 * /etc/shadow or PAM. It takes one throwaway user and a random password full
 * of shell-hostile characters, signs in by password, keyboard-interactive or
 * a key in its own `authorized_keys`, forwards a port to the client as
 * OpenSSH does (`tcpip-forward`), and runs each command with `sh -c` under a
 * HOME of its own. The hub's `ssh` is system OpenSSH, through a wrapper on
 * the hub's PATH that names the scratch HOME's key and known_hosts: OpenSSH
 * reads `~` from the password database, never $HOME, so the scratch hub's
 * own `~/.ssh` would otherwise be the host user's.
 *
 * The machine's commands run with a PATH that has no `tar` ({@link machineBin}):
 * the install script, downloaded through the hub's connection, runs and
 * stops at its first check ("tar is needed"), before it fetches or places
 * anything. That line is the proof the install ran on the machine through
 * the hub's port, without installing a build on this host.
 *
 * (a) Before any password, a key add is refused: the machine does not trust
 *     the hub's key yet. It fails on the sign-in step, ssh's words below it.
 * (b) A wrong password is refused on the sign-in step, nothing added.
 * (c) The right password: the target's `authorized_keys` holds the hub's key
 *     once (`.ssh` 700, the file 600), and the install ran with that key,
 *     through the port the hub's connection carries.
 *     No process's argv or environment held the password while it signed in.
 * (d) The right password again: the key is still there once.
 * (e) A key add with no password now signs in with the key (BatchMode).
 * (g) An add stopped while it signs in: the stop answers `stopped`, its
 *     `ssh` and every process of its group are gone, and a fresh add works.
 * (h) A wrong password the machine answers with silence (as a firewall that
 *     bans the address after a failed password) ends the add within
 *     {@link SILENT_MS}, on the sign-in step: the hub reached its port.
 * (l) On a real OpenSSH sshd, Stop ends the command on the machine too
 *     (sshd signals none started without a terminal), and an add that runs
 *     to its end leaves no watchdog behind.
 * (k) Add machine's password field, masked, with its show/hide toggle.
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
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { AuthContext } from "ssh2";
import type { SshJoinJob } from "../../../packages/core/src/join";
import { listedPid, signal } from "../../../packages/core/src/signal";
import { connectWords } from "../../../packages/core/src/words/connect";
import { until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";
import {
  HELD,
  keyAccepted,
  machineBin,
  serveTarget,
  WAYS,
} from "../ssh-target";

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
/** The hub's step once its connection carries a port on the machine to it. */
const CARRYING = "cawco-install: carrying this hub to the machine on its port ";
/** The install script's own first refusal on a machine with no `tar`. */
const NO_TAR = "cawco: tar is needed";

const PROCESS_ID = /^\d+$/;
/** The locale the hub runs under: ssh's words, in any language, decide nothing. */
const HUB_LOCALE = "de_DE.UTF-8";
/** The step join.ts `refusalStep` names for a machine whose sshd refuses forwarding. */
const FORWARDING_REFUSED =
  "forwarding a port on the machine to this hub, which its SSH server refuses";

/** A process's group, from /proc/<pid>/stat (the third field after the name). */
const groupOf = (pid: number): number | null => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[2]);
  } catch {
    return null;
  }
};

/** Whether `pid`'s environment holds `entry` (`NAME=value`), read from /proc. */
const environHolds = (pid: number, entry: string): boolean => {
  try {
    return readFileSync(`/proc/${pid}/environ`, "utf8")
      .split("\0")
      .includes(entry);
  } catch {
    return false;
  }
};

/**
 * Every live process whose argv holds all of `parts`, or whose group is
 * `group`; with `run`, only those whose environment holds it (leg (l)'s
 * {@link RUN_ENV} marker, so a process an earlier run left behind is never
 * read as this run's).
 */
const processes = (
  match: ({ parts: string[] } | { group: number }) & { run?: string }
): number[] =>
  readdirSync("/proc")
    .filter((entry) => PROCESS_ID.test(entry))
    .map(Number)
    .filter((pid) => {
      if (match.run !== undefined && !environHolds(pid, match.run)) {
        return false;
      }
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

/**
 * The variable leg (l)'s sshd sets on every session (`SetEnv`), with a value
 * of its own run: every process of the session inherits it, an orphan the
 * watchdog failed to end included, and nothing an earlier run left holds it.
 */
const RUN_ENV = "CAWCO_PROBE_RUN";

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

/** The step an add fails on when ssh ended before the machine ran anything (hub join.ts `SIGN_IN_STEP`). */
const SIGN_IN = "signing in over SSH";

/** An add ssh ended before its remote command spoke: the sign-in step, no step line of the machine's. */
const refusedSignIn = (job: SshJoinJob): boolean =>
  job.state === "failed" &&
  job.problem?.kind === "step" &&
  job.problem.step === SIGN_IN &&
  !job.lines.some((line) => line.startsWith("cawco-install: "));

/**
 * The install ran on the machine through the hub's connection: the hub's
 * carry step, the job's hub address that port on the machine's loopback,
 * and the install script's own refusal there ({@link machineBin}).
 */
const installed = (job: SshJoinJob): boolean => {
  const carried = job.lines.find((line) => line.startsWith(CARRYING));
  return (
    carried !== undefined &&
    job.hubUrl === `http://127.0.0.1:${carried.slice(CARRYING.length)}` &&
    job.lines.some((line) => line.startsWith(NO_TAR))
  );
};

/**
 * (l) On a real OpenSSH sshd (this user's own, unprivileged: key sign-in
 * only, the scratch target's `authorized_keys`, which holds the hub's key
 * by now; its sessions given the scratch HOME and {@link machineBin}'s PATH by
 * `SetEnv`): Stop ends what the add runs on the machine, not only the
 * hub's `ssh`, and an add that runs to its end leaves nothing behind. Every
 * process it reads is this run's own ({@link RUN_ENV}), and whatever of this
 * run still lives at the end is killed, so a failure here never fails the
 * next run. A second real sshd, `AllowTcpForwarding no`, refuses the
 * forward: the add ends naming that setting, read from the forward's own
 * exit and the master still answering, not from `ssh`'s words (the hub runs
 * under {@link HUB_LOCALE} throughout).
 */
async function realSshd(
  kit: Kit,
  fleet: KitFleet,
  dir: string,
  machine: { authorized: string; bin: string; home: string }
): Promise<void> {
  const marker = `${RUN_ENV}=${crypto.randomUUID()}`;
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -f ${join(dir, "sshd_host_key")}`.quiet();
  /** A real sshd named `name` on a free port of its own, with `extra` in its config. */
  const startSshd = (name: string, extra: string) => {
    const lease = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: { data: () => undefined },
    });
    const { port } = lease;
    lease.stop(true);
    const config = join(dir, `${name}_config`);
    const pidFile = join(dir, `${name}.pid`);
    writeFileSync(
      config,
      `Port ${port}\nListenAddress 127.0.0.1\nHostKey ${join(dir, "sshd_host_key")}\nPidFile ${pidFile}\nAuthorizedKeysFile ${machine.authorized}\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nUsePAM no\nStrictModes no\nSetEnv HOME=${machine.home} PATH=${machine.bin} ${marker}\n${extra}`
    );
    const proc = Bun.spawn(
      ["/usr/sbin/sshd", "-D", "-f", config, "-E", join(dir, `${name}.log`)],
      { stdout: "ignore", stderr: "ignore" }
    );
    const listening = until(
      `the real sshd ${name} listening`,
      () => existsSync(pidFile) || undefined,
      Boolean,
      10_000
    );
    return { port, proc, listening };
  };
  const sshd = startSshd("sshd", "");
  const closed = startSshd("sshd-closed", "AllowTcpForwarding no\n");
  const { port } = sshd;
  const user = (await Bun.$`id -un`.text()).trim();
  const beginOn = (on: number) =>
    fleet.api<SshJoinJob>("/api/machines/ssh", {
      target: `${user}@127.0.0.1`,
      port: on,
    });
  const begin = () => beginOn(port);
  const read = (id: string) => fleet.api<SshJoinJob>(`/api/machines/ssh/${id}`);
  const holding = () => processes({ parts: HELD, run: marker });
  const watchdogs = () => processes({ parts: ["while ps -p"], run: marker });
  const inGroup = (group: number | null) =>
    group === null ? [] : processes({ group, run: marker });
  const hold = join(machine.home, ".hold");
  try {
    await Promise.all([sshd.listening, closed.listening]);
    writeFileSync(hold, "");
    const held = await begin();
    const step = await until(
      "the machine's install step held",
      () => holding().at(0),
      Boolean,
      30_000
    ).catch(() => undefined);
    const stepGroup = step === undefined ? null : groupOf(step);
    const stopped = await stopAdd(fleet, held.id);
    const gone = await until(
      "the machine's step and its group gone",
      () =>
        holding().length === 0 && inGroup(stepGroup).length === 0
          ? true
          : undefined,
      Boolean,
      10_000
    ).catch(() => false);
    kit.check(
      "l: on a real sshd, Stop ends what the add runs on the machine: its held step and every process of that group are gone within 10 s",
      stopped.job?.state === "stopped" && step !== undefined && gone === true,
      `stop answered ${stopped.said}; machine's step ${step} (group ${stepGroup}); left ${JSON.stringify(holding())} and in the group ${JSON.stringify(inGroup(stepGroup))}`
    );
    rmSync(hold, { force: true });
    const ran = await begin();
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
      "l: on a real sshd, an add that runs to its end ran the install through the hub's connection, exits with its own failure and leaves no watchdog behind",
      ended.state === "failed" && installed(ended) && strays === true,
      `${seen(ended)}; watchdogs left ${JSON.stringify(watchdogs())}`
    );
    const refused = await beginOn(closed.port);
    const said = await until(
      "the add on the forwarding-refusing sshd ended",
      () => read(refused.id),
      (job) => job.state !== "running",
      30_000
    ).catch(() => read(refused.id));
    kit.check(
      `l: on a real sshd with AllowTcpForwarding no, under LC_ALL=${HUB_LOCALE}, the add fails naming that setting, as a refusal and not a failed step`,
      said.state === "failed" &&
        said.problem?.kind === "step" &&
        said.problem.step.startsWith(FORWARDING_REFUSED),
      seen(said)
    );
  } finally {
    sshd.proc.kill();
    closed.proc.kill();
    // Whatever of this run still lives (a watchdog that failed, its step):
    // it goes, by the pid /proc lists now.
    for (const pid of processes({ parts: [], run: marker })) {
      signal(listedPid(pid), "SIGKILL");
    }
  }
}

/** (k) Add machine's password field (connect/PasswordField): masked, and its toggle flips it. */
async function passwordField(kit: Kit, fleet: KitFleet): Promise<void> {
  const page = await kit.page("desk");
  // Add machine's window on Reach, over SSH, signing in with a password once.
  await fetch(`${fleet.base}/api/installs/draft`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stamp: { page: "probe-kit", seq: 1 },
      draft: {
        route: "ssh",
        target: "",
        port: "",
        signIn: "password",
        address: null,
      },
    }),
  });
  await open(
    page,
    `${await fleet.dashboard()}/?install=new`,
    "[data-connect-window]"
  );
  await page.waitForSelector("#connect-password");
  const fieldNow = () =>
    page.evaluate(() => {
      const input =
        document.querySelector<HTMLInputElement>("#connect-password");
      const toggle = document.querySelector<HTMLButtonElement>(
        'button[aria-controls="connect-password"]'
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
  await page.getByRole("button", { name: connectWords.showPassword }).click();
  const shown = await fieldNow();
  await page.getByRole("button", { name: connectWords.hidePassword }).click();
  const maskedAgain = await fieldNow();
  kit.check(
    "k: the password field is masked with its attributes, and its toggle inside it flips type, name and aria-pressed",
    masked.type === "password" &&
      masked.autocomplete === "current-password" &&
      masked.spellcheck === "false" &&
      masked.autocapitalize === "off" &&
      masked.name === connectWords.showPassword &&
      masked.pressed === "false" &&
      masked.inside &&
      shown.type === "text" &&
      shown.name === connectWords.hidePassword &&
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
  const path = machineBin(join(dir, "machine-bin"));

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
        answer(keyAccepted(authorized, ctx, () => signedIn.push("publickey")));
        break;
      default:
        answer(false);
    }
  };
  const { port, server } = await serveTarget({
    authenticate,
    home,
    host: "127.0.0.1",
    hostKey: readFileSync(join(dir, "host_key")),
    path,
    port: 0,
  });

  const jobs: SshJoinJob[] = [];
  try {
    // ssh's own words never decide an outcome: the hub runs every add under
    // German, compiled here into the scratch dir (glibc reads it through
    // LOCPATH, so a host that never installed it runs it all the same), and
    // proven in effect before any add.
    const locales = join(dir, "locale");
    mkdirSync(locales, { recursive: true });
    await Bun.$`localedef -i de_DE -f UTF-8 ${join(locales, "de_DE.utf8")}`.quiet();
    const localeEnv = {
      LOCPATH: locales,
      LC_ALL: HUB_LOCALE,
      LANG: HUB_LOCALE,
    };
    const sunday = (
      await Bun.$`date -d 2026-10-18 +%A`
        .env({ ...process.env, ...localeEnv })
        .text()
    ).trim();
    kit.check(
      `the hub runs under ${HUB_LOCALE}, in effect: 2026-10-18 reads as Sonntag`,
      sunday === "Sonntag",
      `date said ${sunday}`
    );
    fleet.launch("hub", [], {
      PATH: `${bin}:${fleet.env.PATH}`,
      ...localeEnv,
    });
    await fleet.hubUp();
    const begin = (password?: string) =>
      fleet.api<SshJoinJob>("/api/machines/ssh", {
        target: `${USER}@127.0.0.1`,
        port,
        ...(password === undefined ? {} : { password }),
      });
    const read = (id: string) =>
      fleet.api<SshJoinJob>(`/api/machines/ssh/${id}`);
    /**
     * One add through the hub API, read until it ends, and how long that
     * took. One still running after {@link ADD_MS} is answered as it reads.
     */
    const timedAdd = async (password?: string) => {
      const from = Date.now();
      const started = await begin(password);
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

    // (a) The hub's key is not trusted yet.
    const before = await add();
    kit.check(
      "a: before a password, the machine refuses the hub's key: the sign-in step, ssh's words below it",
      refusedSignIn(before) && keyLines().length === 0,
      seen(before)
    );

    // (b) A wrong password.
    const { job: wrong, ms: wrongMs } = await timedAdd(WRONG);
    kit.check(
      `b: a wrong password is refused within ${REFUSED_MS / 1000} s on the sign-in step, and nothing is added`,
      refusedSignIn(wrong) &&
        wrong.passwordProblem === undefined &&
        wrongMs < REFUSED_MS &&
        triedPasswords.includes(WRONG) &&
        keyLines().length === 0,
      `${seen(wrong)}; ended after ${wrongMs} ms; passwords tried ${triedPasswords.length}`
    );

    // (c) The right password.
    const first = await add(PASSWORD);
    const modes = modesOf(join(home, ".ssh"), authorized);
    kit.check(
      "c: the password signs in, the hub's key is added once (.ssh 700, the file 600), and the install runs with that key through the port the hub's connection carries",
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
      `h: a sign-in the machine stops answering ends within ${SILENT_MS / 1000} s, on the sign-in step: the hub reached its port`,
      refusedSignIn(silent) && silentMs < SILENT_MS,
      `${seen(silent)}; ended after ${silentMs} ms`
    );

    await realSshd(kit, fleet, dir, { authorized, bin: path, home });

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
