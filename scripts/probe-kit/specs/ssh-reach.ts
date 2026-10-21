/**
 * Connect a machine › Over SSH, from a network with no way to the hub (hub
 * join.ts, ssh-tunnels.ts, ssh-door.ts). Owner: a machine added over SSH
 * "needs to work even when it's on a different network or no tailscale,
 * over ssh". The hub holds its own SSH connection to the machine, carrying
 * a port on the machine's loopback to the hub's door for SSH forwards; the
 * install and the agent reach the hub through that port alone, and nothing
 * there gets in without the machine's own key.
 *
 * The box is a network namespace of its own (`bwrap --unshare-net`): its
 * loopback and nothing else, so no address of the hub's has a route from
 * it. The hub reaches it on its SSH ports alone: its `ssh` connects through
 * a ProxyCommand to a Unix socket the box bridges to each port (socat). In
 * the box, sharing one `authorized_keys`, each session under the box's own
 * HOME and the PATH of ssh-target.ts `machineBin` (no `tar`):
 * - {@link OPEN}: OpenSSH's sshd (this user's own, key sign-in only);
 * - {@link CLOSED}: the same with `AllowTcpForwarding no`;
 * - {@link GATEWAY}: the same with `GatewayPorts yes`;
 * - {@link PASSWORD_PORT}: the scratch password target (ssh-target.ts),
 *   since a non-root sshd cannot check a password.
 *
 * The box already has CawCo, so the hub's install script, downloaded through
 * the hub's port, takes its own rejoin branch: `cawco binary-rejoin --hub
 * <that port>`. The box has no systemd and no way to GitHub, so its `cawco`
 * is a stand-in for the service manager ({@link standIn}): it does what
 * rejoin does with the agent's unit, with this checkout's agent under the
 * box's HOME (where the hub put the machine's key), and says `joined as`
 * once the hub, asked with that key, lists the machine online. Everything
 * on the hub's side is the product's: the connection, the key, the download
 * through it, the add's end, the machine's socket, its git.
 *
 * (a) From the box nothing answers on the hub's address, nor on GitHub; here
 *     the hub does.
 * (b) Password once: the hub's key lands in the box's `authorized_keys`
 *     once, the hub's connection comes up on a port the box allocated, the
 *     install runs through it and the machine registers through it: the add
 *     is done, its hub address `http://127.0.0.1:<that port>`.
 * (c) Then by key, on OpenSSH: the machine moves to that connection, and the
 *     hub holds one connection for it, on the port it was given.
 * (d) The connection killed: the machine goes offline, the hub opens the
 *     connection again on the same port, and the machine registers again.
 * (e) The hub restarted: the connection comes back on the same port, the
 *     dead hub's ended, and the machine with it.
 * (g) A silent drop: the box-side bridge of the hub's connection frozen, so
 *     no word reaches the box's sshd and its session keeps the port. The
 *     hub's keepalive ends the connection, the next one ends that stale
 *     session, and the machine is online again within {@link SILENT_MS}.
 * (i) Nothing gets in without the machine's key: a process on the box with
 *     none is refused (401) an owner route and an attached file through the
 *     forward; with the machine's key the file comes, and a clone of a
 *     project on the hub's remote pushes through it.
 * (h) A machine whose sshd says `GatewayPorts yes`: the add fails with words
 *     naming it before the hub is forwarded there, and no forward of the
 *     box's sshd listens beyond its loopback.
 * (f) A machine whose sshd says `AllowTcpForwarding no`: the add fails with
 *     words naming that setting, and no connection or record is kept.
 * (j) The owner's stuck add: the machine's agent already runs and is held
 *     for the person (it knocked before the add wrote its key), and the
 *     install leaves it running. The add ends done and online, no Admit
 *     click, no Admit row ({@link heldAgentAdd}). (b) and (c) say neither of
 *     their adds held the machine either.
 * (k) A box process with no key, knocking through the forward as a machine
 *     joining by itself, is still held; its Admit row names the SSH target's
 *     host, never 127.0.0.1; refused, it hears the refusal, then the close.
 * (l) A failing CLI command prints `cawco: <message>`, no source frame.
 * (m) Refused while its installer waits, the machine's installer ends with
 *     the person's refusal in the hub's words, which its agent kept.
 * (n) Then nothing knocks: no row for 10 s, and a keyless register as that
 *     machine is refused at once, never held.
 * (o) A new SSH add of the refused machine clears the refusal.
 * (p) Added by a public IP literal, the machine is recorded by that host,
 *     and the stream relay's candidates are as before the box joined.
 *
 * The stand-in runs the installer's own wait (`awaitJoined`); what it cannot
 * run is the service manager: a first install's restart of an agent already
 * running (binary-install.ts `bringUp`, systemd) has no leg here, nor in any
 * spec, which runs no real install.
 *
 * It makes namespaces, so it runs on the host, outside every workspace:
 *
 *   bun scripts/probe-kit/run.ts ssh-reach
 */
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { SshJoinJob } from "../../../packages/core/src/join";
import {
  listedPid,
  ownPid,
  type Pid,
  signal,
  spawnedPid,
} from "../../../packages/core/src/signal";
import type { RelayAnswer } from "../../../packages/core/src/stream-relay";
import { until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { machineBin } from "../ssh-target";

/** The box's OpenSSH sshd, its sshd that refuses forwarding, its sshd that binds forwards wide, and its password target, on the box's loopback. */
const OPEN = 2222;
const CLOSED = 2223;
const GATEWAY = 2225;
const PASSWORD_PORT = 2224;
/** The box's machine id: its agent's `CAWCO_MACHINE_ID`. */
const BOX = "ssh-reach-box";
/** The password target's user and password. */
const TARGET_USER = "probe";
const PASSWORD = `reach '1" $HOME !x ${crypto.randomUUID()}`;
/** How long an add that installs and registers gets: the agent's start, from source. */
const ADD_MS = 150_000;
/** How long the machine gets to come back: the agent's reconnect backoff caps at 30 s (agent daemon.ts `reconnect`). */
const BACK_MS = 90_000;
/** How long a silently dropped machine may be away: the hub's 10 s keepalive asked three times, and its next connection. */
const SILENT_MS = 60_000;
/** How long the installer's wait may run on the box before the spec calls it hung. */
const WAIT_BOUND_MS = 140_000;
/** How long a refused machine is watched for a row it should never get again. */
const REFUSED_QUIET_MS = 10_000;
/**
 * An SSH target named by a public IP literal, as the owner's was. The box's
 * ssh config sends every host through its ProxyCommand to the box's socket,
 * so nothing is ever sent to this address; it is only the name the hub
 * records the machine by ({@link relayUnchanged}).
 */
const PUBLIC_TARGET_HOST = "1.1.1.1";

const PROCESS_ID = /^\d+$/;
/** The hub's connection to a machine: the master of its control socket (ssh-tunnels.ts `master`). */
const MASTER = / -N .* -M -S /;
const LOOPBACK_HOST = /^(?:127\.[\d.]+|\[::1\]|::1)$/;
const WHITESPACE = /\s+/;
/** A line of Bun's source frame for an error it printed itself: `312 |   throw …`. */
const SOURCE_FRAME = /^\s*\d+ \| /;

/** Whether the hub's log says `machineId` was held for the person (hub-auth.ts `hold`). */
const heldIn = (log: string, machineId: string): boolean =>
  log
    .split("\n")
    .some(
      (line) =>
        line.includes(`machine ${machineId} (`) &&
        line.includes("waits to be admitted")
    );

/** Every live process's pid, parent and argv, read from /proc. */
const processList = (): { argv: string; pid: number; ppid: number }[] =>
  readdirSync("/proc")
    .filter((entry) => PROCESS_ID.test(entry))
    .flatMap((entry) => {
      try {
        const argv = readFileSync(`/proc/${entry}/cmdline`, "utf8").replaceAll(
          "\0",
          " "
        );
        const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
        const ppid = Number(
          stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]
        );
        return argv ? [{ pid: Number(entry), ppid, argv }] : [];
      } catch {
        return [];
      }
    });

/**
 * Signals one process this spec started or found running for it, through
 * core's wall: a pid made by the wall's makers from that live process (its
 * spawn, or /proc read now), and never this process.
 */
const signalOwn = (pid: Pid, sig: NodeJS.Signals): boolean =>
  pid !== ownPid() && signal(pid, sig) === "sent";

/** One shell word for `value`. */
const quoted = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

/** One add as a reviewer reads it in a PASS or FAIL line. */
const seen = (job: SshJoinJob) =>
  `${job.state} ${JSON.stringify(job.problem)}, exit ${job.exitCode}, hub ${job.hubUrl}; lines ${JSON.stringify(job.lines.slice(-12))}`;

/**
 * The box's `cawco`: `binary-rejoin --hub <url>` does what rejoin does
 * (packages/cli/src/binary-install.ts `rejoinBinary`) with the agent's
 * unit, on a box with no service manager: the hub is recorded, the agent
 * (this checkout's, only its own pid ended) restarted against it, then the
 * installer's own wait (`awaitJoined`, run by `wait.ts`), and `joined as`
 * once it ends with the machine online. When it does not, its words and the
 * agent's last lines go to stderr, into the add's output.
 */
const standIn = (root: string, agentEnv: string, wait: string): string => {
  const agent = join(root, "packages/agent/src/cli.ts");
  return `#!/bin/sh
set -u
[ "\${1:-}" = binary-rejoin ] && [ "\${2:-}" = --hub ] || { echo "cawco (ssh-reach stand-in): only binary-rejoin --hub <url>" >&2; exit 2; }
hub=$3
binary="$HOME/.local/share/cawco/binary"
printf '{"role":"agent","hubUrl":"%s","installedVersion":"ssh-reach"}\\n' "$hub" > "$binary/installation.json"
old=$(/usr/bin/cat "$binary/agent.pid" 2>/dev/null || :)
running=0
case "$old" in
  ''|*[!0-9]*) ;;
  *) if [ "$old" -gt 1 ] && /usr/bin/grep -qa ${quoted(agent)} "/proc/$old/cmdline" 2>/dev/null; then running=1; fi ;;
esac
. ${quoted(agentEnv)}
cd ${quoted(root)} || exit 1
# With keep-running, an agent that runs is left be, as a first install's
# \`systemctl --user enable --now\` leaves a unit that is already active.
if [ "$running" = 1 ] && [ -e "$binary/keep-running" ]; then
  echo "cawco (ssh-reach stand-in): the running agent $old is left running" >&2
else
  [ "$running" = 1 ] && /usr/bin/kill "$old"
  CAWCO_HUB_URL="ws://\${hub#http://}/ws" /usr/bin/setsid ${quoted(process.execPath)} ${quoted(agent)} </dev/null >>"$binary/agent.log" 2>&1 &
  echo $! > "$binary/agent.pid"
fi
${quoted(process.execPath)} ${quoted(wait)} "$hub" && { echo "cawco-install: joined as ${BOX}"; exit 0; }
echo "cawco (ssh-reach stand-in): the agent did not come online at $hub; its last lines:" >&2
/usr/bin/tail -n 40 "$binary/agent.log" >&2
exit 1
`;
};

/** Where a run keeps the box and what the hub reaches it with. */
interface Box {
  /** Runs a TypeScript file of the spec's on the box as its agent: under its HOME, with its key and machine id. */
  asMachine: string;
  authorized: string;
  bin: string;
  binary: string;
  boxScript: string;
  /** The hub's control sockets (ssh-tunnels.ts `controlDir`): every `ssh` of its connections names one. */
  controlDir: string;
  dir: string;
  /** The box's own `ssh` command, as the hub's: what the spec runs on the box with. */
  enter: (
    port: number,
    command: string
  ) => Promise<{ code: number; out: string; err: string }>;
  home: string;
  hubBlob: string;
  hubPort: number;
  root: string;
  /** The agent's environment sourced, as a shell's first command: its HOME, its runtime dir, its machine id. */
  sourced: string;
  user: string;
  /** The installer's wait, run on the box as its machine (`wait.ts <hub>`). */
  wait: string;
}

/** The box's files: the hub's key and `ssh`, the box's sshds, password target, CawCo stand-in, its machine's scripts and its own script. */
async function furnish(fleet: KitFleet): Promise<Box> {
  const root = resolve(import.meta.dir, "../../..");
  const dir = join(fleet.sandbox, "box");
  const home = join(dir, "home");
  const bin = join(dir, "hub-bin");
  const binary = join(home, ".local", "share", "cawco", "binary");
  mkdirSync(join(binary, "current"), { recursive: true });
  mkdirSync(join(home, ".ssh"), { recursive: true, mode: 0o700 });
  mkdirSync(bin, { recursive: true });
  const path = machineBin(join(dir, "machine-bin"));
  const authorized = join(home, ".ssh", "authorized_keys");
  const hubPort = Number(new URL(fleet.base).port);
  const user = (await Bun.$`id -un`.text()).trim();

  // The hub's key and its `ssh`: OpenSSH reads `~` from the password
  // database, never $HOME, so a wrapper names the scratch key, known_hosts
  // and the way into the box.
  mkdirSync(join(fleet.home, ".ssh"), { recursive: true, mode: 0o700 });
  const hubKey = join(fleet.home, ".ssh", "id_ed25519");
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -C cawco-ssh-reach -f ${hubKey}`.quiet();
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -f ${join(dir, "host_key")}`.quiet();
  const sshConfig = join(dir, "ssh_config");
  writeFileSync(
    sshConfig,
    `UserKnownHostsFile ${join(dir, "known_hosts")}\nIdentityFile ${hubKey}\nIdentitiesOnly yes\nStrictHostKeyChecking accept-new\nProxyCommand /usr/bin/socat - UNIX-CONNECT:${join(dir, "ssh-%p.sock")}\n`
  );
  writeFileSync(
    join(bin, "ssh"),
    `#!/bin/sh\nexec /usr/bin/ssh -F ${sshConfig} "$@"\n`
  );
  chmodSync(join(bin, "ssh"), 0o755);

  const sshdConfig = (port: number, extra: string) =>
    `Port ${port}\nListenAddress 127.0.0.1\nHostKey ${join(dir, "host_key")}\nPidFile ${join(dir, `sshd-${port}.pid`)}\nAuthorizedKeysFile ${authorized}\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nUsePAM no\nStrictModes no\nSetEnv HOME=${home} PATH=${path}\n${extra}`;
  writeFileSync(join(dir, `sshd-${OPEN}.conf`), sshdConfig(OPEN, ""));
  writeFileSync(
    join(dir, `sshd-${CLOSED}.conf`),
    sshdConfig(CLOSED, "AllowTcpForwarding no\n")
  );
  writeFileSync(
    join(dir, `sshd-${GATEWAY}.conf`),
    sshdConfig(GATEWAY, "GatewayPorts yes\n")
  );
  writeFileSync(
    join(dir, "target.json"),
    JSON.stringify({
      authorized,
      home,
      host: "127.0.0.1",
      hostKey: join(dir, "host_key"),
      password: PASSWORD,
      path,
      port: PASSWORD_PORT,
      user: TARGET_USER,
    })
  );
  // The agent's environment: the fleet's (its sessiond, its ports), under
  // the box's HOME, where the hub wrote the machine's key.
  const machineEnv: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(fleet.env).flatMap(([name, value]) =>
        value === undefined || name === "CAWCO_HUB_URL" ? [] : [[name, value]]
      )
    ),
    HOME: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    CAWCO_MACHINE_ID: BOX,
  };
  const agentEnv = join(dir, "agent.env");
  writeFileSync(
    agentEnv,
    Object.entries(machineEnv)
      .map(([name, value]) => `export ${name}=${quoted(value)}\n`)
      .join("")
  );
  // The installer's own wait for the machine to be online (CLI
  // await-joined.ts `awaitJoined`, which binary-install.ts runs), bounded
  // for the spec, loaded inside its try so any failure, its import's too,
  // is said in the CLI's words; and what the machine asks the hub with its key (core
  // machine-key.ts `machineFetch`): a file's bytes.
  const wait = join(dir, "wait.ts");
  writeFileSync(
    wait,
    `setTimeout(() => {\n  console.error("cawco (ssh-reach): still waiting after ${WAIT_BOUND_MS / 1000} s");\n  process.exit(3);\n}, ${WAIT_BOUND_MS});\ntry {\n  const { awaitJoined } = await import(${JSON.stringify(join(root, "packages/cli/src/await-joined.ts"))});\n  await awaitJoined(process.argv[2] ?? "");\n} catch (error) {\n  console.error(\`cawco: \${error instanceof Error ? error.message : String(error)}\`);\n  process.exit(1);\n}\nprocess.exit(0);\n`
  );
  writeFileSync(
    join(dir, "ask-file.ts"),
    `import { createHash } from "node:crypto";\nimport { machineFetch } from ${JSON.stringify(join(root, "packages/core/src/machine-key.ts"))};\nconst answer = await machineFetch(process.env.ASK ?? "");\nconst bytes = new Uint8Array(await answer.arrayBuffer());\nconsole.log(answer.status, createHash("sha256").update(bytes).digest("hex"));\n`
  );
  // A machine knocking by itself, through the forward, with no key: its
  // register names `argv[3]` and proves nothing; each admission word it
  // hears is a line, then how the hub closed it.
  writeFileSync(
    join(dir, "knock.ts"),
    `const [url, id] = process.argv.slice(2);
const socket = new WebSocket(url ?? "");
const bound = setTimeout(() => socket.close(), 90_000);
socket.addEventListener("message", (event) => {
  const frame = JSON.parse(String(event.data)) as { verb?: string; payload?: { kind?: string; message?: string } };
  if (frame.verb !== "admission") {
    return;
  }
  if (frame.payload?.kind === "challenge") {
    socket.send(JSON.stringify({ verb: "register", machineId: id, payload: { hostname: id, os: "linux" } }));
    return;
  }
  console.log(\`\${frame.payload?.kind} \${frame.payload?.message ?? ""}\`);
});
socket.addEventListener("close", (event) => {
  clearTimeout(bound);
  console.log(\`closed \${event.code}\`);
  process.exit(0);
});
`
  );
  const sourced = `. ${quoted(agentEnv)};`;
  const asMachine = `${sourced} ${quoted(process.execPath)}`;
  writeFileSync(
    join(binary, "installation.json"),
    '{"role":"agent","hubUrl":"http://not-joined.invalid","installedVersion":"ssh-reach"}\n'
  );
  writeFileSync(
    join(binary, "current", "cawco"),
    standIn(root, agentEnv, wait)
  );
  chmodSync(join(binary, "current", "cawco"), 0o755);
  const boxScript = join(dir, "box.sh");
  writeFileSync(
    boxScript,
    `#!/bin/sh
D=${quoted(dir)}
{ /usr/bin/curl -sS -m 5 http://127.0.0.1:${hubPort}/health; echo " exit $?"; } > "$D/reach-hub.txt" 2>&1
{ /usr/bin/curl -sS -m 5 -o /dev/null https://github.com/; echo " exit $?"; } > "$D/reach-github.txt" 2>&1
for port in ${OPEN} ${CLOSED} ${GATEWAY}; do
  /usr/sbin/sshd -D -f "$D/sshd-$port.conf" -E "$D/sshd-$port.log" &
done
${quoted(process.execPath)} ${quoted(join(root, "scripts/probe-kit/ssh-target.ts"))} "$(/usr/bin/cat "$D/target.json")" > "$D/target.log" 2>&1 &
for port in ${OPEN} ${CLOSED} ${GATEWAY} ${PASSWORD_PORT}; do
  /usr/bin/socat UNIX-LISTEN:"$D/ssh-$port.sock",fork,unlink-early TCP:127.0.0.1:$port &
done
echo up > "$D/box-up"
wait
`
  );
  chmodSync(boxScript, 0o755);
  const enter = async (port: number, command: string) => {
    const child = Bun.spawn(
      [
        "/usr/bin/ssh",
        "-F",
        sshConfig,
        "-o",
        "BatchMode=yes",
        "-p",
        String(port),
        `${user}@ssh-reach-box`,
        command,
      ],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" }
    );
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { code, out: out.trim(), err: err.trim() };
  };
  return {
    asMachine,
    sourced,
    authorized,
    bin,
    binary,
    boxScript,
    controlDir: join(fleet.env.XDG_RUNTIME_DIR ?? "", "cawco-ssh"),
    dir,
    enter,
    home,
    hubBlob: readFileSync(`${hubKey}.pub`, "utf8")
      .trim()
      .split(" ")
      .slice(0, 2)
      .join(" "),
    hubPort,
    root,
    user,
    wait,
  };
}

/** Everything a failed leg is read by: the box agent's log, the box's servers', the hub's. Kept the moment a leg fails. */
const keepLogs = async (kit: Kit, fleet: KitFleet, box: Box): Promise<void> => {
  const files: [string, string][] = [
    [join(box.binary, "agent.log"), "box-agent.log"],
    [join(box.dir, "box.err"), "box.err"],
    [join(box.dir, "target.log"), "box-target.log"],
    ...[OPEN, CLOSED, GATEWAY].map((port): [string, string] => [
      join(box.dir, `sshd-${port}.log`),
      `box-sshd-${port}.log`,
    ]),
  ];
  for (const [from, name] of files) {
    if (existsSync(from)) {
      copyFileSync(from, join(kit.out, name));
    }
  }
  writeFileSync(
    join(kit.out, "hub.log"),
    await fleet.logs("hub").catch((error: Error) => error.message)
  );
};

/** The box in a network of its own, once its sshds, password target and sockets are up; undefined when it could not stand. */
async function standUp(
  kit: Kit,
  box: Box
): Promise<ReturnType<typeof Bun.spawn> | undefined> {
  const bwrap = Bun.which("bwrap");
  kit.check(
    "the host has bwrap, to give the box a network of its own",
    bwrap !== null,
    "bwrap is not on PATH"
  );
  if (!bwrap) {
    return;
  }
  const child = Bun.spawn(
    [
      bwrap,
      "--dev-bind",
      "/",
      "/",
      "--unshare-user",
      "--unshare-net",
      "--die-with-parent",
      "--",
      box.boxScript,
    ],
    {
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", HOME: box.home },
      stdout: Bun.file(join(box.dir, "box.log")),
      stderr: Bun.file(join(box.dir, "box.err")),
      detached: true,
    }
  );
  const ready = () =>
    [
      "box-up",
      ...[OPEN, CLOSED, GATEWAY].map((port) => `sshd-${port}.pid`),
      ...[OPEN, CLOSED, GATEWAY, PASSWORD_PORT].map(
        (port) => `ssh-${port}.sock`
      ),
    ].every((name) => existsSync(join(box.dir, name))) &&
    readFileSync(join(box.dir, "target.log"), "utf8").includes(
      "ssh-target listening"
    );
  const up = await until(
    "the box's sshds, password target and SSH sockets up",
    () => (ready() ? true : undefined),
    Boolean,
    30_000
  ).catch(() => false);
  const err = join(box.dir, "box.err");
  kit.check(
    "the box is up: its three sshds, its password target and the sockets the hub reaches them by",
    up === true,
    `box.err: ${existsSync(err) ? readFileSync(err, "utf8").slice(-800) : "none"}; files ${JSON.stringify(readdirSync(box.dir))}`
  );
  if (up !== true) {
    child.kill();
    return;
  }
  return child;
}

/** What the legs read and check with: the hub's adds, the machine's row, the records, the hub's connections. */
const readers = (kit: Kit, fleet: KitFleet, box: Box) => {
  const read = (id: string) => fleet.api<SshJoinJob>(`/api/machines/ssh/${id}`);
  return {
    /** A leg's check; a failed one keeps every log it is read by, there and then. */
    check: async (name: string, ok: boolean, detail: string) => {
      kit.check(name, ok, detail);
      if (!ok) {
        await keepLogs(kit, fleet, box);
      }
    },
    add: async (target: string, sshPort: number, password?: string) => {
      const started = await fleet.api<SshJoinJob>("/api/machines/ssh", {
        target,
        port: sshPort,
        ...(password === undefined ? {} : { password }),
      });
      return until(
        `the add ${started.id} ended`,
        () => read(started.id),
        (job) => job.state !== "running",
        ADD_MS
      ).catch(() => read(started.id));
    },
    status: () =>
      fetch(`${fleet.base}/api/agents/${BOX}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((row: { status?: string } | null) => row?.status ?? "absent"),
    /** The machines held for the person, as the dashboard's Admit rows read them. */
    waiting: () =>
      fetch(`${fleet.base}/api/machines/waiting`).then(
        (r) =>
          r.json() as Promise<{ address: string | null; machineId: string }[]>
      ),
    rows: () =>
      fleet.query<{
        box_port: number | null;
        machine_id: string | null;
        ssh_port: number | null;
      }>("SELECT ssh_port, box_port, machine_id FROM ssh_machines"),
    /** The hub's connections: each the master of a control socket in its dir. */
    tunnels: () =>
      processList().filter(
        ({ argv }) => argv.includes(box.controlDir) && MASTER.test(argv)
      ),
    keyLines: () =>
      existsSync(box.authorized)
        ? readFileSync(box.authorized, "utf8")
            .split("\n")
            .filter((line) => line.startsWith(box.hubBlob))
        : [],
  };
};
type Readers = ReturnType<typeof readers>;

/** The port on the box's loopback an add's hub address names. */
const carriedPort = (job: SshJoinJob) =>
  Number(job.hubUrl.replace("http://127.0.0.1:", ""));

/** (a) to (c): no way from the box, then the joins. Answers the port the machine is held on. */
async function joins(
  fleet: KitFleet,
  box: Box,
  { check, add, status, rows, tunnels, keyLines, waiting }: Readers
): Promise<number> {
  // (a) No way from the box to the hub, nor out.
  const fromBox = readFileSync(join(box.dir, "reach-hub.txt"), "utf8").trim();
  const outward = readFileSync(
    join(box.dir, "reach-github.txt"),
    "utf8"
  ).trim();
  const here = await fetch(`${fleet.base}/health`).then((r) => r.ok);
  await check(
    `a: from the box nothing answers on the hub's address (127.0.0.1:${box.hubPort}) nor on GitHub; here the hub answers there`,
    here && !fromBox.endsWith(" exit 0") && !outward.endsWith(" exit 0"),
    `from the box: hub ${JSON.stringify(fromBox)}, github ${JSON.stringify(outward)}; here: ${here}`
  );

  // (b) Password once, on the password target.
  const first = await add(
    `${TARGET_USER}@ssh-reach-box`,
    PASSWORD_PORT,
    PASSWORD
  );
  const firstPort = carriedPort(first);
  const said = (prefix: string) =>
    first.lines.some((line) => line.startsWith(prefix));
  await check(
    "b: the password add puts the hub's key on the box once, gives the machine its own key, and the box downloads the install and registers through the hub's connection: done, online, its hub address a port on the box's loopback",
    first.state === "done" &&
      first.machineId === BOX &&
      keyLines().length === 1 &&
      firstPort > 0 &&
      firstPort !== box.hubPort &&
      said("cawco-install: giving the machine its key to this hub") &&
      existsSync(join(box.home, ".config", "cawco", "machine-key")) &&
      said(
        `cawco-install: downloading the install script from ${first.hubUrl}`
      ) &&
      said(
        `cawco-install: moving this machine from http://not-joined.invalid to the hub at ${first.hubUrl}`
      ) &&
      (await status()) === "online",
    `${seen(first)}; key lines ${keyLines().length}; machine ${await status()}`
  );

  // (c) By key, on OpenSSH: the machine moves to that connection.
  const second = await add(`${box.user}@ssh-reach-box`, OPEN);
  const port = carriedPort(second);
  const held = tunnels();
  const waitingRows = await waiting();
  const log = await fleet.logs("hub").catch((error: Error) => error.message);
  await check(
    "c: by key on OpenSSH the machine moves to that connection: done, online, one record and one connection for it, on the port the box allocated; neither add held it for the person, and no Admit row stands",
    second.state === "done" &&
      second.machineId === BOX &&
      port > 0 &&
      (await status()) === "online" &&
      JSON.stringify(rows()) ===
        JSON.stringify([{ ssh_port: OPEN, box_port: port, machine_id: BOX }]) &&
      held.length === 1 &&
      waitingRows.length === 0 &&
      !heldIn(log, BOX),
    `${seen(second)}; records ${JSON.stringify(rows())}; connections ${JSON.stringify(held.map(({ pid }) => pid))}; waiting ${JSON.stringify(waitingRows)}; the hub held it: ${heldIn(log, BOX)}`
  );
  return port;
}

/**
 * (j) The owner's add, 2026-10-21: the machine's agent already runs, its
 * connection held for the person (it knocked through the forward before
 * the add wrote its key), and the install leaves a running agent be, as a
 * first install's `systemctl --user enable --now` does. Held by the hub
 * before this change, the add failed after 90 s with the Admit row
 * standing. Now the install's own check, made with the key, closes the held
 * connection, the agent connects again with that key, and the add is done.
 */
async function heldAgentAdd(
  fleet: KitFleet,
  box: Box,
  read: Readers
): Promise<void> {
  const { check, add, status, waiting } = read;
  const name =
    'j: an SSH add whose machine already has CawCo and whose agent already runs, held for the person since before the add wrote its key, joins this hub again (no "Nothing was changed"), ends done and online with no Admit click, its held connection closed by the key\'s first proof, and no Admit row stands';
  const heldRow = await holdBox(fleet, box, read);
  writeFileSync(join(box.binary, "keep-running"), "");
  try {
    const job = await add(`${box.user}@ssh-reach-box`, OPEN);
    const after = await waiting();
    const log = await fleet.logs("hub").catch((error: Error) => error.message);
    await check(
      name,
      heldRow.some((row) => row.machineId === BOX) &&
        job.state === "done" &&
        job.lines.some((line) =>
          line.startsWith(
            `cawco-install: joining the hub at ${job.hubUrl} again`
          )
        ) &&
        !job.lines.some((line) => line.includes("Nothing was changed")) &&
        job.lines.some((line) => line.includes("is left running")) &&
        (await status()) === "online" &&
        after.length === 0 &&
        log.includes(`machine ${BOX}'s connection held since`),
      `held first: ${JSON.stringify(heldRow)}; ${seen(job)}; machine ${await status()}; waiting after ${JSON.stringify(after)}; the hub closed the held connection: ${log.includes(`machine ${BOX}'s connection held since`)}`
    );
  } finally {
    rmSync(join(box.binary, "keep-running"), { force: true });
  }
}

/**
 * The box's agent held for the person: its key gone on both sides and its
 * connection killed, so it comes back through the forward with nothing to
 * prove, as the owner's did. Answers the waiting rows once it is held.
 */
function holdBox(
  fleet: KitFleet,
  box: Box,
  { tunnels, waiting }: Readers
): Promise<{ address: string | null; machineId: string }[]> {
  rmSync(join(box.home, ".config", "cawco", "machine-key"), { force: true });
  fleet.write("DELETE FROM machine_keys WHERE machine_id = ?", BOX);
  const [master] = tunnels();
  if (master) {
    signalOwn(listedPid(master.pid), "SIGKILL");
  }
  return until(
    "the machine's agent held for the person",
    () => waiting(),
    (rows) => rows.some((row) => row.machineId === BOX),
    BACK_MS
  ).catch(() => waiting());
}

/** The hub's log lines, every launch's, whole. */
const logLines = async (fleet: KitFleet): Promise<string[]> =>
  (await fleet.logs("hub").catch((error: Error) => error.message)).split("\n");

/**
 * The hub's log lines from now on, whichever of its launch's files they go
 * to: a mark of each file's length (scratch-fleet `logMark`), read again
 * with what each gained. Never a count of the joined text's lines: a line
 * the running hub writes to its `.log` lands before its `.err` in that text,
 * where a count from the end never looks.
 */
const linesFrom = async (fleet: KitFleet): Promise<() => Promise<string[]>> => {
  const mark = await fleet.logMark("hub");
  return async () => (await mark.since()).split("\n");
};

/**
 * (m) A refusal ends the install that waits on it, end to end: the box's
 * agent held for the person, the installer's own wait (`awaitJoined`) run on
 * the box says it waits to be admitted; the person refuses; the agent keeps
 * the hub's words (`admission-refused.json`) and the wait ends with them,
 * exit 1.
 *
 * (n) Then the knocking ends: for {@link REFUSED_QUIET_MS} no row comes
 * back for the machine and the hub holds nothing of it, its agent saying it
 * waits for a key; and a register as that machine from a build that knocks
 * regardless (the knock script, no key) is refused at once, in the same
 * words, closed 4403, never held.
 */
async function refusalEnds(
  fleet: KitFleet,
  box: Box,
  read: Readers,
  port: number
): Promise<void> {
  const { check, waiting } = read;
  const held = await holdBox(fleet, box, read);
  const sinceWait = await linesFrom(fleet);
  const asked = `[hub-auth] refused anonymous GET /api/agents/${BOX}`;
  const waitingRun = box.enter(
    OPEN,
    `${box.asMachine} ${quoted(box.wait)} http://127.0.0.1:${port}`
  );
  const polling = await until(
    "the installer's wait asking the hub",
    async () => (await sinceWait()).some((line) => line.includes(asked)),
    Boolean,
    30_000
  ).catch(() => false);
  const refused = await fetch(
    `${fleet.base}/api/machines/waiting/${BOX}/refuse`,
    { method: "POST" }
  ).then((r) => r.status);
  const ended = await waitingRun;
  const kept = join(box.home, ".config", "cawco", "admission-refused.json");
  const stored = existsSync(kept) ? readFileSync(kept, "utf8") : "";
  await check(
    "m: a machine held for the person, its installer waiting: the person refuses, the agent keeps the hub's words, and the installer's wait ends with them, exit 1",
    held.some((row) => row.machineId === BOX) &&
      polling === true &&
      refused === 200 &&
      ended.code === 1 &&
      ended.out.includes("cawco-install: waiting to be admitted") &&
      ended.err.includes("The person refused this machine.") &&
      ended.err.includes("Nothing joined.") &&
      stored.includes("The person refused this machine."),
    `held ${JSON.stringify(held)}; the wait asked the hub: ${polling}; refuse answered ${refused}; the wait ${JSON.stringify(ended)}; kept ${JSON.stringify(stored)}`
  );

  // (n) Quiet for 10 s, then a knock that knocks regardless.
  const sinceQuiet = await linesFrom(fleet);
  const seenRows: string[] = [];
  const until10 = Date.now() + REFUSED_QUIET_MS;
  while (Date.now() < until10) {
    // biome-ignore lint/performance/noAwaitInLoops: a watch; each read must see the hub after the previous wait
    const rows = await waiting();
    if (rows.some((row) => row.machineId === BOX)) {
      seenRows.push(JSON.stringify(rows));
    }
    await Bun.sleep(500);
  }
  const quietLines = await sinceQuiet();
  const agentLog = existsSync(join(box.binary, "agent.log"))
    ? readFileSync(join(box.binary, "agent.log"), "utf8")
    : "";
  const knocked = await box.enter(
    OPEN,
    `${box.asMachine} ${quoted(join(box.dir, "knock.ts"))} ws://127.0.0.1:${port}/ws ${BOX}`
  );
  const words = knocked.out.split("\n");
  const after = await logLines(fleet);
  await check(
    "n: after the refusal no row comes back for the machine for 10 s and its agent waits for a key; a keyless register as it is refused at once in the same words, closed 4403, never held",
    seenRows.length === 0 &&
      !quietLines.some(
        (line) =>
          line.includes(`machine ${BOX} (`) &&
          line.includes("waits to be admitted")
      ) &&
      agentLog.includes("connects again once it is given a key") &&
      words[0] === "refused The person refused this machine." &&
      words.at(-1) === "closed 4403" &&
      after.some((line) =>
        line.includes(`register refused: the person refused machine ${BOX}`)
      ) &&
      !(await waiting()).some((row) => row.machineId === BOX),
    `rows seen ${JSON.stringify(seenRows)}; hub lines while quiet ${JSON.stringify(quietLines.filter((line) => line.includes(BOX)))}; the agent said it waits: ${agentLog.includes("connects again once it is given a key")}; the knock heard ${JSON.stringify(knocked)}`
  );
}

/**
 * (o) A new SSH add of the refused machine clears the refusal: its agent,
 * still running and waiting for a key, takes the one the add writes and
 * proves it; the add is done, the machine online, no row.
 */
async function refusedReAdd(
  fleet: KitFleet,
  box: Box,
  { check, add, status, waiting }: Readers
): Promise<void> {
  writeFileSync(join(box.binary, "keep-running"), "");
  try {
    const job = await add(`${box.user}@ssh-reach-box`, OPEN);
    const agentLog = existsSync(join(box.binary, "agent.log"))
      ? readFileSync(join(box.binary, "agent.log"), "utf8")
      : "";
    await check(
      "o: a new SSH add of the refused machine clears the refusal: its waiting agent takes the add's key and connects, the add is done, the machine online, no row",
      job.state === "done" &&
        job.lines.some((line) => line.includes("is left running")) &&
        agentLog.includes("this machine holds a new key: connecting again") &&
        (await status()) === "online" &&
        (await waiting()).length === 0,
      `${seen(job)}; the agent took the new key: ${agentLog.includes("this machine holds a new key: connecting again")}; machine ${await status()}; waiting ${JSON.stringify(await waiting())}; hub ${(
        await logLines(fleet)
      )
        .filter((line) => line.includes(BOX))
        .slice(-6)
        .join(" | ")}`
    );
  } finally {
    rmSync(join(box.binary, "keep-running"), { force: true });
  }
}

/**
 * How many machines could run the stream relay, and the one picked, as
 * `GET /api/stream-relay` answers them (core stream-relay.ts `RelayAnswer`:
 * its `journey`, a `RelayJourneyView`, `candidates` and `machine`).
 */
const relayChoice = (
  fleet: KitFleet
): Promise<{ candidates: number; machine: unknown } | undefined> =>
  fetch(`${fleet.base}/api/stream-relay`)
    .then((r) => r.json() as Promise<Partial<RelayAnswer>>)
    .then((answer) =>
      answer.journey
        ? {
            candidates: answer.journey.candidates,
            machine: answer.journey.machine,
          }
        : undefined
    );

/**
 * (p) The machine's record names the SSH target: added as
 * `user@<public IP>`, the hub records it by that host (its register line),
 * and the stream relay's choice is as it was before the box ever joined: a
 * machine reached through the hub's own forward is no relay candidate,
 * whatever address names it.
 */
async function relayUnchanged(
  fleet: KitFleet,
  box: Box,
  { check, add, status }: Readers,
  choiceBefore: Awaited<ReturnType<typeof relayChoice>>
): Promise<void> {
  const sinceAdd = await linesFrom(fleet);
  const job = await add(`${box.user}@${PUBLIC_TARGET_HOST}`, OPEN);
  const lines = await sinceAdd();
  const choiceAfter = await relayChoice(fleet);
  await check(
    `p: added as ${box.user}@${PUBLIC_TARGET_HOST}, the hub records the machine by that host, and the stream relay's choice (its candidates and the machine picked) is as it was before the box joined`,
    job.state === "done" &&
      (await status()) === "online" &&
      lines.some((line) =>
        line.includes(
          `[hub] machine ${BOX} registered from ${PUBLIC_TARGET_HOST}`
        )
      ) &&
      choiceBefore !== undefined &&
      JSON.stringify(choiceAfter) === JSON.stringify(choiceBefore),
    `${seen(job)}; register lines ${JSON.stringify(lines.filter((line) => line.includes(`machine ${BOX} registered`)))}; the relay's choice before ${JSON.stringify(choiceBefore)}, after ${JSON.stringify(choiceAfter)}`
  );
}

/** The id the keyless knock of (k) registers as. */
const STRANGER = "ssh-reach-stranger";

/**
 * (k) Admission keeps its protection: a box process knocking through the
 * forward with no key, as a machine joining by itself, is held for the
 * person, its row named by the SSH target the person gave the add (never
 * the forward's 127.0.0.1), and a refusal is said on its connection before
 * the hub closes it.
 */
async function strangerHeld(
  fleet: KitFleet,
  box: Box,
  { check, waiting }: Readers,
  port: number
): Promise<void> {
  const knocking = box.enter(
    OPEN,
    `${box.asMachine} ${quoted(join(box.dir, "knock.ts"))} ws://127.0.0.1:${port}/ws ${STRANGER}`
  );
  const held = await until(
    "the knock held for the person",
    () => waiting(),
    (rows) => rows.some((one) => one.machineId === STRANGER),
    30_000
  ).catch(() => waiting());
  const row = held.find((one) => one.machineId === STRANGER);
  const refused = row
    ? await fetch(`${fleet.base}/api/machines/waiting/${STRANGER}/refuse`, {
        method: "POST",
      }).then((r) => r.status)
    : 0;
  const heard = await knocking;
  const words = heard.out.split("\n");
  await check(
    "k: a box process knocking through the forward with no key is held for the person, its row named by the SSH target's host (ssh-reach-box), and refused: it hears the refusal, then the close",
    row?.address === "ssh-reach-box" &&
      refused === 200 &&
      words[0]?.startsWith("waiting ") === true &&
      words.includes("refused The person refused this machine.") &&
      words.at(-1) === "closed 4403" &&
      !(await waiting()).some((one) => one.machineId === STRANGER),
    `held ${JSON.stringify(held)}; refuse answered ${refused}; the knock heard ${JSON.stringify(heard)}`
  );
}

/**
 * (l) A failed CLI command says its error in the CLI's words and exits 1:
 * no line of the source around where it was thrown (Bun's `NNN | ` frame),
 * which a binary install printed from its minified bundle. A rejoin on a
 * machine with no installation, its data and config dirs the sandbox's.
 */
async function cliFailure(
  fleet: KitFleet,
  box: Box,
  { check }: Readers
): Promise<void> {
  const scratch = join(fleet.sandbox, "cli-failure");
  mkdirSync(scratch, { recursive: true });
  const child = Bun.spawn(
    [
      process.execPath,
      join(box.root, "packages/cli/src/cli.ts"),
      "binary-rejoin",
      "--hub",
      "http://127.0.0.1:9",
    ],
    {
      env: {
        ...process.env,
        XDG_DATA_HOME: join(scratch, "data"),
        XDG_CONFIG_HOME: join(scratch, "config"),
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const [err, code] = await Promise.all([
    new Response(child.stderr).text(),
    child.exited,
  ]);
  await check(
    "l: a failing CLI command's stderr is `cawco: <message>` with no source-frame (`NNN | `) line, and it exits 1",
    code === 1 &&
      err.trim() === "cawco: This machine has no binary installation" &&
      !err.split("\n").some((line) => SOURCE_FRAME.test(line)),
    `exit ${code}; stderr ${JSON.stringify(err)}`
  );
}

/** (d) and (e): the connection killed, then the hub restarted. */
async function reconnects(
  fleet: KitFleet,
  box: Box,
  { check, status, rows, tunnels }: Readers,
  port: number
): Promise<void> {
  const online = (what: string) =>
    until(
      what,
      () => status(),
      (now) => now === "online",
      BACK_MS
    ).catch(() => status());
  const samePort = () => rows().every((row) => row.box_port === port);

  // (d) The connection killed: the one master this spec found running, by its own pid.
  const [held] = tunnels();
  if (held) {
    signalOwn(listedPid(held.pid), "SIGKILL");
    const offline = await until(
      "the machine offline once its connection is gone",
      () => status(),
      (now) => now === "offline",
      30_000
    ).catch(() => status());
    const reopened = await until(
      "the hub's connection open again",
      () => tunnels().find(({ pid }) => pid !== held.pid),
      Boolean,
      30_000
    ).catch(() => undefined);
    const back = await online("the machine online again");
    await check(
      "d: with its connection killed the machine goes offline, the hub opens the connection again on the same port, and the machine registers again",
      offline === "offline" &&
        reopened !== undefined &&
        tunnels().length === 1 &&
        samePort() &&
        back === "online",
      `killed ${held.pid}; then ${offline}; reopened ${reopened?.pid ?? "none"}; connections ${tunnels().length}; records ${JSON.stringify(rows())}; then ${back}`
    );
  } else {
    await check(
      "d: with its connection killed the machine goes offline, the hub opens the connection again on the same port, and the machine registers again",
      false,
      "the hub held no connection to the machine, so nothing was killed"
    );
  }

  // (e) The hub restarted.
  const before = tunnels().map(({ pid }) => pid);
  await fleet.stop("hub");
  fleet.launch("hub", [], { PATH: `${box.bin}:${fleet.env.PATH}` });
  await fleet.hubUp();
  const restored = await until(
    "the hub's connection open again after its restart",
    () => {
      const now = tunnels();
      const [only] = now;
      return now.length === 1 && only && !before.includes(only.pid)
        ? now
        : undefined;
    },
    Boolean,
    60_000
  ).catch(() => undefined);
  const backAgain = await online("the machine online after the hub's restart");
  await check(
    "e: after a hub restart its connection comes back on the same port, the dead hub's is gone, and the machine is online again",
    restored !== undefined && samePort() && backAgain === "online",
    `before ${JSON.stringify(before)}; after ${JSON.stringify(tunnels().map(({ pid }) => pid))}; records ${JSON.stringify(rows())}; machine ${backAgain}`
  );
}

/**
 * (g) A silent drop. The box-side bridge of the hub's one connection (the
 * child the box's socat forked for it) is frozen: nothing reaches the box's
 * sshd, no end of the connection either, so its session keeps the
 * machine's port. The hub's keepalive ends its side, its next connection
 * ends that stale session, and the machine comes back.
 */
async function silentDrop(
  fleet: KitFleet,
  box: Box,
  { check, status, rows, tunnels }: Readers,
  port: number
): Promise<void> {
  const name =
    "g: a silent drop (the box-side bridge frozen) ends the hub's connection by its keepalive, the next ends the stale session holding the port, and the machine is online again within 60 s";
  const bridges = processList().filter(
    ({ argv }) =>
      argv.includes("UNIX-LISTEN:") &&
      argv.includes(join(box.dir, `ssh-${OPEN}.sock`))
  );
  const listenerPids = new Set(
    bridges
      .filter(({ ppid }) => !bridges.some(({ pid }) => pid === ppid))
      .map(({ pid }) => pid)
  );
  const forks = bridges.filter(({ ppid }) => listenerPids.has(ppid));
  const [before] = tunnels();
  const [fork] = forks;
  if (!(before && fork && forks.length === 1)) {
    await check(
      name,
      false,
      `nothing was frozen: the hub's connections ${JSON.stringify(tunnels().map(({ pid }) => pid))}, the box's bridges for it ${JSON.stringify(forks.map(({ pid }) => pid))}`
    );
    return;
  }
  const from = Date.now();
  signalOwn(listedPid(fork.pid), "SIGSTOP");
  try {
    const back = await until(
      "the machine online again on a new connection",
      async () => {
        const now = tunnels();
        return now.length === 1 &&
          now[0]?.pid !== before.pid &&
          (await status()) === "online"
          ? now
          : undefined;
      },
      Boolean,
      SILENT_MS + 30_000
    ).catch(() => undefined);
    const took = Date.now() - from;
    const log = await fleet.logs("hub").catch(() => "");
    await check(
      name,
      back !== undefined &&
        took <= SILENT_MS &&
        rows().every((row) => row.box_port === port) &&
        log.includes(`ended the stale session holding port ${port}`),
      `frozen bridge ${fork.pid}; connection ${before.pid} → ${JSON.stringify(tunnels().map(({ pid }) => pid))}; online again after ${took} ms; records ${JSON.stringify(rows())}; hub said the stale session ended: ${log.includes(`ended the stale session holding port ${port}`)}`
    );
  } finally {
    // The frozen bridge, which this spec found and froze: it goes.
    signalOwn(listedPid(fork.pid), "SIGKILL");
  }
}

/**
 * (i) Through the forward, nothing without the machine's key: a box
 * process with none is refused an owner route and an attached file; with
 * the key the file comes, and a clone of a project on the hub's remote
 * pushes with the machine's credential (`cawco git-credential`, which the
 * box agent answers).
 */
async function credentials(
  fleet: KitFleet,
  box: Box,
  { check }: Readers,
  port: number
): Promise<void> {
  const bytes = new TextEncoder().encode(`ssh-reach ${crypto.randomUUID()}\n`);
  const sha = createHash("sha256").update(bytes).digest("hex");
  const stored = await fetch(`${fleet.base}/api/files`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-file-name": "ssh-reach.txt",
    },
    body: bytes,
  }).then((r) => r.json() as Promise<{ ref?: string }>);
  const via = `http://127.0.0.1:${port}`;
  const code = (path: string) =>
    box.enter(OPEN, `curl -s -o /dev/null -w "%{http_code}" ${via}${path}`);
  const owner = await code("/api/agents");
  const fileBare = await code(`/api/files/${sha}`);
  const fileKeyed = await box.enter(
    OPEN,
    `ASK=${via}/api/files/${sha} sh -c ${quoted(`${box.asMachine} ${quoted(join(box.dir, "ask-file.ts"))}`)}`
  );
  await check(
    "i: through the forward, a box process with no key is refused (401) an owner route and an attached file; with the machine's key the file comes whole",
    stored.ref === `/api/files/${sha}` &&
      owner.out === "401" &&
      fileBare.out === "401" &&
      fileKeyed.out === `200 ${sha}`,
    `stored ${JSON.stringify(stored)}; owner route ${JSON.stringify(owner)}; file without a key ${JSON.stringify(fileBare)}; with the key ${JSON.stringify(fileKeyed)}`
  );

  // A project on the hub's remote, cloned and pushed to from the box.
  const project = await fleet.api<{ id?: string; project?: { id?: string } }>(
    "/api/projects",
    { name: `ssh-reach ${crypto.randomUUID().slice(0, 8)}` }
  );
  const id = project.project?.id ?? project.id ?? "";
  const bare = join(dirname(fleet.env.CAWCO_DB_PATH ?? ""), "git", `${id}.git`);
  if (!existsSync(bare)) {
    mkdirSync(dirname(bare), { recursive: true });
    await Bun.$`git init -q --bare ${bare}`.quiet();
  }
  const helper = `!${quoted(process.execPath)} ${quoted(join(box.root, "packages/cli/src/cli.ts"))} git-credential`;
  const work = join(box.home, `clone-${id}`);
  // As a terminal checkout on the box does: the agent's environment, and
  // git asking `cawco git-credential` for the hub's origin, the helper list
  // emptied first (agent git-credential.ts).
  const script = join(box.dir, "push.sh");
  writeFileSync(
    script,
    [
      "set -e",
      box.sourced,
      `g() { git -c credential.helper= -c ${quoted(`credential.helper=${helper}`)} -c user.name=probe -c user.email=probe@ssh-reach-box "$@"; }`,
      `g clone -q ${via}/git/${id}.git ${quoted(work)}`,
      `cd ${quoted(work)}`,
      'g commit -q --allow-empty -m "from the box"',
      "g push -q origin HEAD:refs/heads/main",
      "",
    ].join("\n")
  );
  const pushed = await box.enter(OPEN, `sh ${quoted(script)}`);
  const landed = existsSync(bare)
    ? (
        await Bun.$`git --git-dir=${bare} log --format=%s -1 main`
          .nothrow()
          .quiet()
          .text()
      ).trim()
    : "";
  await check(
    "i: a clone of a project on the hub's remote, made and pushed from the box through the forward with the machine's credential, lands on the hub",
    id !== "" && pushed.code === 0 && landed === "from the box",
    `project ${id}; clone and push ${JSON.stringify(pushed)}; on the hub's remote: ${JSON.stringify(landed)}`
  );
}

/** (h) and (f): machines whose sshd will not do what the forward needs. */
async function refusals(
  box: Box,
  { check, add, rows, tunnels }: Readers
): Promise<void> {
  // (h) GatewayPorts yes: refused before the hub is forwarded there.
  const exposed = await add(`${box.user}@ssh-reach-box`, GATEWAY);
  const listening = await box.enter(OPEN, "ss -ltnpH");
  const wide = listening.out
    .split("\n")
    .filter((line) => line.includes("sshd"))
    .map((line) => line.split(WHITESPACE)[3] ?? "")
    .filter(
      (address) =>
        !LOOPBACK_HOST.test(address.slice(0, address.lastIndexOf(":")))
    );
  await check(
    "h: a machine whose sshd says GatewayPorts yes fails to add, with words naming it, before the hub is forwarded there: no record or connection is kept, and no forward of the box's sshd listens beyond its loopback",
    exposed.state === "failed" &&
      exposed.problem?.kind === "step" &&
      exposed.problem.step.includes("GatewayPorts") &&
      !exposed.lines.some((line) =>
        line.includes("carrying this hub to the machine")
      ) &&
      !rows().some((row) => row.ssh_port === GATEWAY) &&
      tunnels().length === 1 &&
      listening.code === 0 &&
      wide.length === 0,
    `${seen(exposed)}; records ${JSON.stringify(rows())}; connections ${tunnels().length}; the box's sshd listeners beyond loopback ${JSON.stringify(wide)} (${listening.code === 0 ? "read" : listening.err})`
  );

  // (f) AllowTcpForwarding no.
  const refused = await add(`${box.user}@ssh-reach-box`, CLOSED);
  await check(
    "f: a machine whose sshd says AllowTcpForwarding no fails to add, with words naming that setting, and no record or connection is kept for it",
    refused.state === "failed" &&
      refused.problem?.kind === "step" &&
      refused.problem.step.includes("AllowTcpForwarding") &&
      !rows().some((row) => row.ssh_port === CLOSED) &&
      tunnels().length === 1,
    `${seen(refused)}; records ${JSON.stringify(rows())}; connections ${tunnels().length}`
  );
}

/**
 * The box's processes, its agent and the hub's connections, whatever the
 * run left: each one found running now by its own pid, whose argv names the
 * box's dir or the hub's control dir, or the box agent named by the pid it
 * wrote, while that pid still runs this checkout's agent.
 */
const sweep = (box: Box): void => {
  const pidFile = join(box.binary, "agent.pid");
  const written = existsSync(pidFile)
    ? Number(readFileSync(pidFile, "utf8").trim())
    : Number.NaN;
  const agentEntry = join(box.root, "packages/agent/src/cli.ts");
  for (const { pid, argv } of processList()) {
    const ours =
      argv.includes(box.dir) ||
      argv.includes(box.controlDir) ||
      (pid === written && argv.includes(agentEntry));
    if (ours) {
      signalOwn(listedPid(pid), "SIGKILL");
    }
  }
};

async function run(kit: Kit): Promise<void> {
  const fleet: KitFleet = await kit.fleet(() => ({
    everyMs: 5,
    words: ["ok"],
  }));
  const box = await furnish(fleet);
  let child: ReturnType<typeof Bun.spawn> | undefined;
  try {
    fleet.launch("hub", [], { PATH: `${box.bin}:${fleet.env.PATH}` });
    await fleet.hubUp();
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    child = await standUp(kit, box);
    if (!child) {
      return;
    }
    const read = readers(kit, fleet, box);
    // Before the box ever joins: what (p) compares the relay's choice with.
    const choiceBefore = await relayChoice(fleet);
    const port = await joins(fleet, box, read);
    await reconnects(fleet, box, read, port);
    await silentDrop(fleet, box, read, port);
    await credentials(fleet, box, read, port);
    await refusals(box, read);
    await heldAgentAdd(fleet, box, read);
    await refusalEnds(fleet, box, read, port);
    await refusedReAdd(fleet, box, read);
    await strangerHeld(fleet, box, read, port);
    await cliFailure(fleet, box, read);
    await relayUnchanged(fleet, box, read, choiceBefore);
  } finally {
    await keepLogs(kit, fleet, box);
    sweep(box);
    // The box's bwrap, which this spec started: its own pid.
    const bwrap = child ? spawnedPid(child) : undefined;
    if (bwrap) {
      signalOwn(bwrap, "SIGKILL");
    }
  }
}

export default {
  name: "ssh-reach",
  host: "it gives the box a network of its own (bwrap --unshare-net), which no workspace boundary starts",
  run,
} satisfies Spec;
