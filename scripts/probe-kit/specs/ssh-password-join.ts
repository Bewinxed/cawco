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
 * (f) The password is in no job's lines, the hub's log or its database.
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
import type { Kit, Spec } from "../kit";

const USER = "probe";
/** Quotes, `$`, a backslash, `!` and spaces: any shell that read it would change it. */
const PASSWORD = `pw '1" $HOME \\ !x ${crypto.randomUUID()}`;
const WRONG = `wrong ${crypto.randomUUID()}`;
/** How long one add gets to end: a refused sign-in or a failed download. */
const ADD_MS = 60_000;

const PROCESS_ID = /^\d+$/;

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
    `UserKnownHostsFile ${join(dir, "known_hosts")}\nIdentityFile ${hubKey}\nIdentitiesOnly yes\nLogLevel ERROR\n`
  );
  writeFileSync(
    join(bin, "ssh"),
    `#!/bin/sh\nexec /usr/bin/ssh -F ${join(dir, "ssh_config")} "$@"\n`
  );
  chmodSync(join(bin, "ssh"), 0o755);
  // Inside a workspace boundary the hub's machine has no address but
  // loopback, so `/api/join` lists none to choose. This `tailscale` gives it
  // one, 127.0.0.2, where the hub (bound to 127.0.0.1) does not answer: the
  // target's `curl` of the install script is refused, which shows the
  // install ran in the session without installing a build there.
  writeFileSync(
    join(bin, "tailscale"),
    `#!/bin/sh\ncase "$1" in ip) echo 127.0.0.2 ;; *) echo '{}' ;; esac\n`
  );
  chmodSync(join(bin, "tailscale"), 0o755);

  const authorized = join(home, ".ssh", "authorized_keys");
  const signedIn: string[] = [];
  const triedPasswords: string[] = [];
  const holdersAtSignIn: string[] = [];
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
              Promise.all([
                new Response(child.stdout).text(),
                new Response(child.stderr).text(),
                child.exited,
              ]).then(([out, err, code]) => {
                channel.write(out);
                channel.stderr.write(err);
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
    kit.check(
      "the hub lists an address to hand the install",
      hubUrl !== "",
      JSON.stringify(info.addresses)
    );
    /** One add through the hub API, read until it ends. */
    const add = async (password?: string): Promise<SshJoinJob> => {
      const started = await fleet.api<SshJoinJob>("/api/machines/ssh", {
        target: `${USER}@127.0.0.1`,
        port,
        hubUrl,
        ...(password === undefined ? {} : { password }),
      });
      const ended = await until(
        `the add ${started.id} ended`,
        () => fleet.api<SshJoinJob>(`/api/machines/ssh/${started.id}`),
        (job) => job.state !== "running",
        ADD_MS
      );
      jobs.push(ended);
      return ended;
    };
    const seen = (job: SshJoinJob) =>
      `${job.state} ${JSON.stringify(job.problem)} ${JSON.stringify(job.passwordProblem)}, exit ${job.exitCode}; lines ${JSON.stringify(job.lines.slice(-6))}`;
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
    const wrong = await add(WRONG);
    kit.check(
      "b: a wrong password is refused and classified as the password (asked, beside a null problem while the bridge stands), and nothing is added",
      wrong.problem === null &&
        wrong.passwordProblem?.asked === true &&
        triedPasswords.includes(WRONG) &&
        keyLines().length === 0,
      `${seen(wrong)}; passwords tried ${triedPasswords.length}`
    );

    // (c) The right password.
    const first = await add(PASSWORD);
    const sshDir = join(home, ".ssh");
    const modes = existsSync(authorized)
      ? `${statSync(sshDir).mode.toString(8).slice(-3)} ${statSync(authorized).mode.toString(8).slice(-3)}`
      : "none";
    kit.check(
      "c: the password signs in, the hub's key is added once (.ssh 700, the file 600), and the install runs in the same session",
      signedIn.includes("password") || signedIn.includes("keyboard-interactive")
        ? keyLines().length === 1 &&
            keyLines()[0] === hubPublic &&
            modes === "700 600" &&
            installed(first)
        : false,
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
