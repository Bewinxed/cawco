/**
 * Connect a machine › Over SSH, from a network with no way to the hub (hub
 * join.ts, ssh-tunnels.ts). Owner: a machine added over SSH "needs to work
 * even when it's on a different network or no tailscale, over ssh". The hub
 * holds its own SSH connection to the machine, carrying a port on the
 * machine's loopback to the hub; the install and the agent reach the hub
 * through that port alone.
 *
 * The box is a network namespace of its own (`bwrap --unshare-net`): its
 * loopback and nothing else, so no address of the hub's has a route from
 * it. The hub reaches it on its SSH ports alone: its `ssh` connects through
 * a ProxyCommand to a Unix socket the box bridges to each port (socat). In
 * the box, sharing one `authorized_keys`, each session under the box's own
 * HOME and the PATH of ssh-target.ts `machineBin` (no `tar`):
 * - {@link OPEN}: OpenSSH's sshd (this user's own, key sign-in only);
 * - {@link CLOSED}: the same with `AllowTcpForwarding no`;
 * - {@link PASSWORD_PORT}: the scratch password target (ssh-target.ts),
 *   since a non-root sshd cannot check a password.
 *
 * The box already has CawCo, so the hub's install script, downloaded through
 * the hub's port, takes its own rejoin branch: `cawco binary-rejoin --hub
 * <that port>`. The box has no systemd and no way to GitHub, so its `cawco`
 * is a stand-in for the service manager ({@link standIn}): it does what
 * rejoin does with the agent's unit, with this checkout's agent, and says
 * `joined as` once the hub lists the machine online, as rejoin does.
 * Everything on the hub's side is the product's: the connection, the
 * download through it, the add's end, the machine's socket.
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
 * (f) A machine whose sshd says `AllowTcpForwarding no`: the add fails with
 *     words naming that setting, and no connection or record is kept.
 *
 * It makes namespaces, so it runs on the host, outside every workspace:
 *
 *   bun scripts/probe-kit/run.ts ssh-reach
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { SshJoinJob } from "../../../packages/core/src/join";
import { until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { machineBin } from "../ssh-target";

/** The box's OpenSSH sshd, its sshd that refuses forwarding, and its password target, on the box's loopback. */
const OPEN = 2222;
const CLOSED = 2223;
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

const PROCESS_ID = /^\d+$/;
const FORWARD = /-R (127\.0\.0\.1:(\d+):127\.0\.0\.1:\d+)/;

/** Every live process's pid and argv, read from /proc. */
const processList = (): { argv: string; pid: number }[] =>
  readdirSync("/proc")
    .filter((entry) => PROCESS_ID.test(entry))
    .flatMap((entry) => {
      try {
        const argv = readFileSync(`/proc/${entry}/cmdline`, "utf8").replaceAll(
          "\0",
          " "
        );
        return argv ? [{ pid: Number(entry), argv }] : [];
      } catch {
        return [];
      }
    });

/** One shell word for `value`. */
const quoted = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

/** One add as a reviewer reads it in a PASS or FAIL line. */
const seen = (job: SshJoinJob) =>
  `${job.state} ${JSON.stringify(job.problem)}, exit ${job.exitCode}, hub ${job.hubUrl}; lines ${JSON.stringify(job.lines.slice(-8))}`;

/**
 * The box's `cawco`: `binary-rejoin --hub <url>` does what rejoin does
 * (packages/cli/src/binary-install.ts `rejoinBinary`) with the agent's
 * unit, on a box with no service manager: the hub is recorded, the agent
 * (this checkout's) restarted against it, and `joined as` said once the hub
 * lists the machine online through that address.
 */
const standIn = (root: string, agentEnv: string): string => `#!/bin/sh
set -u
[ "\${1:-}" = binary-rejoin ] && [ "\${2:-}" = --hub ] || { echo "cawco (ssh-reach stand-in): only binary-rejoin --hub <url>" >&2; exit 2; }
hub=$3
binary="$HOME/.local/share/cawco/binary"
printf '{"role":"agent","hubUrl":"%s","installedVersion":"ssh-reach"}\\n' "$hub" > "$binary/installation.json"
[ -f "$binary/agent.pid" ] && /usr/bin/kill "$(/usr/bin/cat "$binary/agent.pid")" 2>/dev/null
. ${quoted(agentEnv)}
cd ${quoted(root)} || exit 1
CAWCO_HUB_URL="ws://\${hub#http://}/ws" /usr/bin/setsid ${quoted(process.execPath)} ${quoted(join(root, "packages/agent/src/cli.ts"))} </dev/null >>"$binary/agent.log" 2>&1 &
echo $! > "$binary/agent.pid"
i=0
while [ $i -lt 120 ]; do
  /usr/bin/curl -fsS -m 3 "$hub/api/agents/${BOX}" 2>/dev/null | /usr/bin/grep -q '"status":"online"' && { echo "cawco-install: joined as ${BOX}"; exit 0; }
  i=$((i + 1))
  /usr/bin/sleep 1
done
echo "cawco: the agent did not come online at $hub" >&2
exit 1
`;

/** Where a run keeps the box and what the hub reaches it with. */
interface Box {
  authorized: string;
  bin: string;
  binary: string;
  boxScript: string;
  /** The hub's control sockets (ssh-tunnels.ts `controlDir`): every `ssh` of its connections names one. */
  controlDir: string;
  dir: string;
  home: string;
  hubBlob: string;
  hubPort: number;
  user: string;
}

/** The box's files: the hub's key and `ssh`, the box's sshds, password target, CawCo stand-in and script. */
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

  // The hub's key and its `ssh`: OpenSSH reads `~` from the password
  // database, never $HOME, so a wrapper names the scratch key, known_hosts
  // and the way into the box.
  mkdirSync(join(fleet.home, ".ssh"), { recursive: true, mode: 0o700 });
  const hubKey = join(fleet.home, ".ssh", "id_ed25519");
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -C cawco-ssh-reach -f ${hubKey}`.quiet();
  await Bun.$`ssh-keygen -q -t ed25519 -N "" -f ${join(dir, "host_key")}`.quiet();
  writeFileSync(
    join(dir, "ssh_config"),
    `UserKnownHostsFile ${join(dir, "known_hosts")}\nIdentityFile ${hubKey}\nIdentitiesOnly yes\nProxyCommand /usr/bin/socat - UNIX-CONNECT:${join(dir, "ssh-%p.sock")}\n`
  );
  writeFileSync(
    join(bin, "ssh"),
    `#!/bin/sh\nexec /usr/bin/ssh -F ${join(dir, "ssh_config")} "$@"\n`
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
  const agentEnv = join(dir, "agent.env");
  writeFileSync(
    agentEnv,
    Object.entries({ ...fleet.env, CAWCO_MACHINE_ID: BOX })
      .filter(([name]) => name !== "CAWCO_HUB_URL")
      .map(([name, value]) => `export ${name}=${quoted(value ?? "")}\n`)
      .join("")
  );
  writeFileSync(
    join(binary, "installation.json"),
    '{"role":"agent","hubUrl":"http://not-joined.invalid","installedVersion":"ssh-reach"}\n'
  );
  writeFileSync(join(binary, "current", "cawco"), standIn(root, agentEnv));
  chmodSync(join(binary, "current", "cawco"), 0o755);
  const boxScript = join(dir, "box.sh");
  writeFileSync(
    boxScript,
    `#!/bin/sh
D=${quoted(dir)}
{ /usr/bin/curl -sS -m 5 http://127.0.0.1:${hubPort}/health; echo " exit $?"; } > "$D/reach-hub.txt" 2>&1
{ /usr/bin/curl -sS -m 5 -o /dev/null https://github.com/; echo " exit $?"; } > "$D/reach-github.txt" 2>&1
/usr/sbin/sshd -D -f "$D/sshd-${OPEN}.conf" -E "$D/sshd-${OPEN}.log" &
/usr/sbin/sshd -D -f "$D/sshd-${CLOSED}.conf" -E "$D/sshd-${CLOSED}.log" &
${quoted(process.execPath)} ${quoted(join(root, "scripts/probe-kit/ssh-target.ts"))} "$(/usr/bin/cat "$D/target.json")" > "$D/target.log" 2>&1 &
for port in ${OPEN} ${CLOSED} ${PASSWORD_PORT}; do
  /usr/bin/socat UNIX-LISTEN:"$D/ssh-$port.sock",fork,unlink-early TCP:127.0.0.1:$port &
done
echo up > "$D/box-up"
wait
`
  );
  chmodSync(boxScript, 0o755);
  return {
    authorized,
    bin,
    binary,
    boxScript,
    controlDir: join(fleet.env.XDG_RUNTIME_DIR ?? "", "cawco-ssh"),
    dir,
    home,
    hubBlob: readFileSync(`${hubKey}.pub`, "utf8")
      .trim()
      .split(" ")
      .slice(0, 2)
      .join(" "),
    hubPort,
    user: (await Bun.$`id -un`.text()).trim(),
  };
}

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
      `sshd-${OPEN}.pid`,
      `sshd-${CLOSED}.pid`,
      `ssh-${OPEN}.sock`,
      `ssh-${CLOSED}.sock`,
      `ssh-${PASSWORD_PORT}.sock`,
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
    "the box is up: its two sshds, its password target and the sockets the hub reaches them by",
    up === true,
    `box.err: ${existsSync(err) ? readFileSync(err, "utf8").slice(-800) : "none"}; files ${JSON.stringify(readdirSync(box.dir))}`
  );
  if (up !== true) {
    child.kill();
    return;
  }
  return child;
}

/** What the legs read: the hub's adds, the machine's row, the records, the hub's connections. */
const readers = (fleet: KitFleet, box: Box, jobs: SshJoinJob[]) => {
  const read = (id: string) => fleet.api<SshJoinJob>(`/api/machines/ssh/${id}`);
  return {
    add: async (target: string, sshPort: number, password?: string) => {
      const started = await fleet.api<SshJoinJob>("/api/machines/ssh", {
        target,
        port: sshPort,
        ...(password === undefined ? {} : { password }),
      });
      const ended = await until(
        `the add ${started.id} ended`,
        () => read(started.id),
        (job) => job.state !== "running",
        ADD_MS
      ).catch(() => read(started.id));
      jobs.push(ended);
      return ended;
    },
    status: () =>
      fetch(`${fleet.base}/api/agents/${BOX}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((row: { status?: string } | null) => row?.status ?? "absent"),
    rows: () =>
      fleet.query<{
        box_port: number | null;
        machine_id: string | null;
        ssh_port: number | null;
      }>("SELECT ssh_port, box_port, machine_id FROM ssh_machines"),
    tunnels: () =>
      processList().filter(
        ({ argv }) => argv.includes(box.controlDir) && FORWARD.test(argv)
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
  kit: Kit,
  fleet: KitFleet,
  box: Box,
  { add, status, rows, tunnels, keyLines }: Readers
): Promise<number> {
  // (a) No way from the box to the hub, nor out.
  const fromBox = readFileSync(join(box.dir, "reach-hub.txt"), "utf8").trim();
  const outward = readFileSync(
    join(box.dir, "reach-github.txt"),
    "utf8"
  ).trim();
  const here = await fetch(`${fleet.base}/health`).then((r) => r.ok);
  kit.check(
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
  kit.check(
    "b: the password add puts the hub's key on the box once, and the box downloads the install and registers through the hub's connection: done, online, its hub address a port on the box's loopback",
    first.state === "done" &&
      first.machineId === BOX &&
      keyLines().length === 1 &&
      firstPort > 0 &&
      firstPort !== box.hubPort &&
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
  kit.check(
    "c: by key on OpenSSH the machine moves to that connection: done, online, one record and one connection for it, on the port the box allocated",
    second.state === "done" &&
      second.machineId === BOX &&
      port > 0 &&
      (await status()) === "online" &&
      JSON.stringify(rows()) ===
        JSON.stringify([{ ssh_port: OPEN, box_port: port, machine_id: BOX }]) &&
      held.length === 1 &&
      // The connection that allocated the port asked for port 0: the
      // record holds what the box gave it, and every reconnect asks for that.
      ["0", String(port)].includes(
        FORWARD.exec(held[0]?.argv ?? "")?.[2] ?? ""
      ),
    `${seen(second)}; records ${JSON.stringify(rows())}; connections ${JSON.stringify(held.map(({ pid, argv }) => [pid, FORWARD.exec(argv)?.[1]]))}`
  );
  return port;
}

/** (d) and (e): the connection killed, then the hub restarted. */
async function reconnects(
  kit: Kit,
  fleet: KitFleet,
  box: Box,
  { status, tunnels }: Readers,
  port: number
): Promise<void> {
  const onPort = (argv: string) => argv.includes(`-R 127.0.0.1:${port}:`);
  const online = (what: string) =>
    until(
      what,
      () => status(),
      (now) => now === "online",
      BACK_MS
    ).catch(() => status());

  // (d) The connection killed.
  const killed = tunnels()[0]?.pid ?? -1;
  try {
    process.kill(killed, "SIGKILL");
  } catch {
    // Reported below: nothing was held.
  }
  const offline = await until(
    "the machine offline once its connection is gone",
    () => status(),
    (now) => now === "offline",
    30_000
  ).catch(() => status());
  const reopened = await until(
    "the hub's connection open again",
    () => tunnels().find(({ pid, argv }) => pid !== killed && onPort(argv)),
    Boolean,
    30_000
  ).catch(() => undefined);
  const back = await online("the machine online again");
  kit.check(
    "d: with its connection killed the machine goes offline, the hub opens the connection again on the same port, and the machine registers again",
    offline === "offline" &&
      reopened !== undefined &&
      tunnels().length === 1 &&
      back === "online",
    `killed ${killed}; then ${offline}; reopened ${reopened ? `${reopened.pid} ${FORWARD.exec(reopened.argv)?.[1]}` : "none"}; connections ${tunnels().length}; then ${back}`
  );

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
      return now.length === 1 &&
        only &&
        !before.includes(only.pid) &&
        onPort(only.argv)
        ? now
        : undefined;
    },
    Boolean,
    60_000
  ).catch(() => undefined);
  const backAgain = await online("the machine online after the hub's restart");
  kit.check(
    "e: after a hub restart its connection comes back on the same port, the dead hub's is gone, and the machine is online again",
    restored !== undefined && backAgain === "online",
    `before ${JSON.stringify(before)}; after ${JSON.stringify(tunnels().map(({ pid, argv }) => [pid, FORWARD.exec(argv)?.[1]]))}; machine ${backAgain}`
  );
}

/** (f) A machine whose sshd refuses forwarding. */
async function refusal(
  kit: Kit,
  box: Box,
  { add, rows, tunnels }: Readers
): Promise<void> {
  const refused = await add(`${box.user}@ssh-reach-box`, CLOSED);
  kit.check(
    "f: a machine whose sshd says AllowTcpForwarding no fails to add, with words naming that setting, and no record or connection is kept for it",
    refused.state === "failed" &&
      refused.problem?.kind === "step" &&
      refused.problem.step.includes("AllowTcpForwarding") &&
      !rows().some((row) => row.ssh_port === CLOSED) &&
      tunnels().length === 1,
    `${seen(refused)}; records ${JSON.stringify(rows())}; connections ${tunnels().length}`
  );
}

/** The box's processes, its agent and the hub's connections, whatever the run left. */
const sweep = (box: Box): void => {
  const pidFile = join(box.binary, "agent.pid");
  const agent = existsSync(pidFile)
    ? Number(readFileSync(pidFile, "utf8").trim())
    : null;
  for (const { pid, argv } of processList()) {
    const ours = argv.includes(box.dir) || argv.includes(box.controlDir);
    if (pid === agent || (pid !== process.pid && ours)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Gone already.
      }
    }
  }
};

async function run(kit: Kit): Promise<void> {
  const fleet: KitFleet = await kit.fleet(() => ({
    everyMs: 5,
    words: ["ok"],
  }));
  const box = await furnish(fleet);
  const jobs: SshJoinJob[] = [];
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
    const read = readers(fleet, box, jobs);
    const port = await joins(kit, fleet, box, read);
    await reconnects(kit, fleet, box, read, port);
    await refusal(kit, box, read);
  } finally {
    writeFileSync(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch((error: Error) => error.message)
    );
    const agentLog = join(box.binary, "agent.log");
    if (existsSync(agentLog)) {
      writeFileSync(join(kit.out, "box-agent.log"), readFileSync(agentLog));
    }
    if (child) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Gone already.
      }
    }
    sweep(box);
  }
}

export default { name: "ssh-reach", run } satisfies Spec;
