/**
 * A hub's `.local` name (hub mdns.ts), on two scratch hubs announcing on this
 * machine's networks:
 *
 * 1. The first hub holds a `cawco[-<n>].local` name: `/health` reports it,
 *    and an mDNS query for it answers with addresses of the interfaces
 *    lan-interfaces.ts picks (and loopback's, the query being this
 *    machine's own): never a container bridge's or a VPN tunnel's.
 * 2. A second hub started beside it probes, finds that name answered and
 *    holds the next one (`cawco.local` → `cawco-2.local`, RFC 6762 §8), its
 *    own query answering too. Never one name for two hubs.
 * 3. Each hub's `_cawco._tcp` service names its held name as its SRV
 *    target, and the agent's own browse (discovery.ts `browseMdns`) still
 *    reads an address off the announcements.
 * 4. Each hub's Connect a machine list (`/api/join`) carries
 *    "On this network · http://<held name>:<port>", and every row named for
 *    an interface names one another machine reaches this one on (core
 *    reachable-links.ts): never a container bridge's, a veth's or a port's.
 * 5. A device on the LAN is answered with the LAN's addresses alone (RFC
 *    6762 §14). A third hub runs in a network of its own (`unshare
 *    --map-root-user --net`: a user and network namespace whose root may
 *    configure its interfaces, unshare(1)) holding `lan0` (192.168.77.1/24,
 *    the default route's network), `lan1` on another network
 *    (192.168.88.1/24), and `br9`
 *    (10.89.77.1/24), a bridge whose one port is a veth, as Podman's and
 *    Docker's are. The hub listens on `::`, so AAAA records answer too. A
 *    device at 192.168.77.2 on `lan0` asks for `cawco.local` (A and AAAA)
 *    from a port other than 5353, so every answer comes back by unicast
 *    (§6.7), as the QU answers macOS asks for do. Each record answering it
 *    is one of `lan0`'s addresses: none of `br9`'s, none of `lan1`'s.
 *    Then it opens the name: `GET http://cawco.local:<hub port>/health` at
 *    the address it was answered with reaches the hub, which names
 *    `cawco.local` as its own. Nothing in that network listens on a port
 *    below 1024.
 * 6. The name's address carries its port, and CawCo binds no privileged
 *    port for it: `/api/local-name` says the name held and the dashboard at
 *    `http://<held name>:<dashboard port>`, with no command and no other
 *    field. On Linux, the built dashboard served at the fleet's dashboard
 *    port on this machine's LAN address answers `GET http://<held name>:<dashboard
 *    port>/` at the address mDNS gave the name, and neither hub holds a
 *    socket on a port below 1024.
 * 7. macOS only, first, the Local Network grant legs 1 to 4 stand on there:
 *    one question for `cawco.local` (another hub's on the LAN), asked by the
 *    system's own responder (`dns-sd -G v4`) and by CawCo Agent, and who
 *    answered from another device. macOS gates LAN multicast behind Local
 *    Network privacy ("Receiving an incoming UDP multicast | yes"; "The
 *    exception for launchd daemons doesn't apply to launchd agents", TN3179)
 *    and has no API that reports the grant ("There's no general API that
 *    returns whether the current process has local network access"), so it
 *    is read from what CawCo Agent's socket hears while the system's does.
 *    Without it, the leg says so in one line and legs 1 to 4 are not run.
 *
 * On macOS every hub and every question of legs 1 to 4, 6 and 7 runs as the
 * product does: the installed release's `CawCo Agent.app` executable
 * (`cawco hub`; `BUN_BE_BUN=1` for a question, the executable as bun) in a
 * scratch launchd agent of this user's (probe-kit launch-agent.ts),
 * attributed to the bundle by `AssociatedBundleIdentifiers`, never the
 * probe's own process.
 *
 * Leg 5 and 6's dashboard and sockets run on Linux, leg 7 on macOS; legs 1
 * to 4 and 6's `/api/local-name` on both.
 *
 * Multicast needs an interface that carries it: inside a workspace there is
 * only loopback, and leg 5 makes namespaces, so this runs on the host. A hub
 * already on the network (the machine's own) holds `cawco.local` first; then
 * the scratch hubs hold the next two names, which is the same proof.
 *
 *   bun scripts/probe-kit/run.ts hub-local-name
 */
import { createSocket } from "node:dgram";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { networkInterfaces, platform } from "node:os";
import { join } from "node:path";
import makeMdns from "multicast-dns";
import { browseMdns } from "../../../packages/agent/src/discovery";
import { currentExecutable } from "../../../packages/core/src/binary-installation";
import { readWithin } from "../../../packages/core/src/bounded";
import { reachableLinks } from "../../../packages/core/src/reachable-links";
import { lanInterfaces } from "../../../packages/hub/src/lan-interfaces";
import { leasePortRange, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { type LaunchAgents, launchAgents, RESULT_MARK } from "../launch-agent";

const ROOT = join(import.meta.dir, "..", "..", "..");
const HUB_ENTRY = join(ROOT, "packages", "hub", "src", "index.ts");
const HELD = /^cawco(?:-(\d+))?\.local$/;
/** How long a query waits for answers: mDNS responders answer within 500 ms. */
const LISTEN_MS = 2000;

interface Health {
  localName?: string | null;
}

/** Connect a machine's rows that name no interface (hub join.ts). */
const OWN_ROWS = new Set(["Tailscale", "Tailscale DNS", "On this network"]);

/** The number a held name carries: `cawco.local` is the first. */
const numberOf = (name: string): number => Number(HELD.exec(name)?.[1] ?? 1);

/**
 * Each of this machine's addresses, with the interface holding it and
 * whether a hub may answer with it: the interfaces lan-interfaces.ts picks,
 * and loopback, which answers this machine's own questions.
 */
const answerable = async () => {
  const shared = await lanInterfaces();
  const holder = new Map<string, string>();
  const allowed = new Set<string>();
  const lan = new Set<string>();
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      const address = entry.address.split("%")[0] ?? "";
      holder.set(address, name);
      if (entry.internal || shared.includes(name)) {
        allowed.add(address);
      }
      if (shared.includes(name)) {
        lan.add(address);
      }
    }
  }
  return { shared, holder, allowed, lan };
};

interface Srv {
  port: number;
  target: string;
}

/**
 * One mDNS question, and the data of every `type` record heard in answer for
 * {@link LISTEN_MS}, answers and additionals both (a PTR's SRV rides in the
 * additionals).
 */
const ask = async <T>(
  question: { name: string; type: "A" | "PTR" },
  type: "A" | "SRV"
): Promise<T[]> => {
  const mdns = makeMdns();
  const heard: T[] = [];
  mdns.on("response", (packet) => {
    for (const record of [...packet.answers, ...packet.additionals]) {
      if (
        record.type === type &&
        (type === "SRV" || record.name.toLowerCase() === question.name)
      ) {
        heard.push(record.data as T);
      }
    }
  });
  mdns.query({ questions: [question] });
  // Every responder on the link answers in the window: what came is the answer.
  await Bun.sleep(LISTEN_MS);
  mdns.destroy();
  return heard;
};

/** The flag that runs this file as leg 5's device: `--ask <name> <from>`. */
const ASK = "--ask";
/** How long leg 5's device keeps asking while the hub probes its name. */
const ASK_MS = 60_000;
/** What leg 5's device found: the addresses it heard, and the name the hub at the first one said it holds. */
interface Asked {
  heard: string[];
  /** `/health`'s `localName` at `http://<name>:<port>`, or what curl said instead. */
  opened: string;
}
const SPACES = /\s+/;
/** The first privileged port: CawCo listens on none below it. */
const PRIVILEGED = 1024;
/** `/api/local-name`'s fields while a name is held: the name and its address, no step. */
const LOCAL_NAME_FIELDS = "dashboardPort,host,name,state,url";

/**
 * Leg 5's device: asks for `name`'s A and AAAA records from `from`, an
 * address on the LAN, on an ephemeral port, so each responder that hears the
 * question answers it by unicast to `from` (RFC 6762 §6.7). Asks every
 * second until something answers, then listens {@link LISTEN_MS} more. Then
 * opens the name with its port: `GET http://<name>:<port>/health` at the
 * first IPv4 address heard, from `from`. Answers both.
 */
const askFromLan = async (
  name: string,
  from: string,
  port: string
): Promise<Asked> => {
  const socket = createSocket("udp4");
  await new Promise<void>((bound) => socket.bind(0, from, bound));
  socket.setMulticastInterface(from);
  const mdns = makeMdns({ socket, bind: false, multicast: false });
  const heard = new Set<string>();
  mdns.on("response", (packet) => {
    for (const record of [...packet.answers, ...packet.additionals]) {
      if (
        (record.type === "A" || record.type === "AAAA") &&
        record.name.toLowerCase() === name
      ) {
        heard.add(String(record.data).split("%")[0] ?? "");
      }
    }
  });
  const question = {
    questions: [
      { name, type: "A" as const },
      { name, type: "AAAA" as const },
    ],
  };
  const deadline = Date.now() + ASK_MS;
  while (heard.size === 0 && Date.now() < deadline) {
    mdns.query(question, { port: 5353, address: "224.0.0.251" });
    // biome-ignore lint/performance/noAwaitInLoops: one question a second until the hub has probed its name
    await Bun.sleep(1000);
  }
  await Bun.sleep(LISTEN_MS);
  mdns.destroy();
  const at = [...heard].find((address) => !address.includes(":"));
  const said = at
    ? await Bun.$`curl -s --noproxy ${"*"} --interface ${from} --resolve ${`${name}:${port}:${at}`} --retry 5 --retry-connrefused --retry-delay 1 ${`http://${name}:${port}/health`}`
        .nothrow()
        .text()
    : "";
  let opened = at
    ? `curl said "${said.slice(0, 200)}"`
    : "no IPv4 address heard";
  try {
    opened = String((JSON.parse(said) as Health).localName);
  } catch {
    // Not the hub's JSON: what curl said stands.
  }
  return { heard: [...heard], opened };
};

/**
 * Leg 5's network, built inside the namespace as its root: `lan0` and `lan1`
 * are dummies with multicast on (an interface of its own, as a NIC is), `br9`
 * a bridge with a veth port. Then the hub, and once `br9` is up, the device
 * at 192.168.77.2 asking, then opening the name at the hub's port
 * (`$CAWCO_HUB_PORT`). `$1` the leg's folder, `$2` bun, `$3` the hub, `$4`
 * this file.
 */
const LAN_SCRIPT = `set -eu
ip link set lo up
ip link add lan0 type dummy
ip link set lan0 multicast on
ip addr add 192.168.77.1/24 dev lan0
ip addr add 192.168.77.2/24 dev lan0
ip link set lan0 up
ip route add default via 192.168.77.254 dev lan0
ip link add lan1 type dummy
ip link set lan1 multicast on
ip addr add 192.168.88.1/24 dev lan1
ip link set lan1 up
ip link add br9 type bridge forward_delay 0
ip link add ct0 type veth peer name ct1
ip link set ct0 master br9
ip addr add 10.89.77.1/24 dev br9
ip link set br9 up
ip link set ct0 up
ip link set ct1 up
for _ in $(seq 50); do ip -o link show br9 | grep -q LOWER_UP && break; sleep 0.2; done
ip -d -o link show > "$1/links.txt"
"$2" "$3" > "$1/hub.log" 2>&1 &
trap "kill $!" EXIT
"$2" "$4" ${ASK} cawco.local 192.168.77.2 "$CAWCO_HUB_PORT" > "$1/answers.json"
ip -json addr show > "$1/addresses.json"
ss -ltnuH > "$1/listening.txt"
`;

interface IpAddr {
  addr_info: { local: string }[];
  ifname: string;
}

/** A hub's own ports: one for its listener, the rest for its previews. */
const ports = async () => {
  const [first, last] = (await leasePortRange(13)).range
    .split("-")
    .map(Number) as [number, number];
  return {
    CAWCO_HUB_PORT: String(first),
    CAWCO_PREVIEW_PORTS: `${first + 1}-${last}`,
  };
};

/**
 * Leg 5: a hub in a network of its own (LAN_SCRIPT), asked from its LAN.
 * Its folder keeps the namespace's links, the hub's log and what was heard.
 */
const lanLeg = async (
  kit: Kit,
  env: Record<string, string>,
  sandbox: string
): Promise<void> => {
  const unshare = Bun.which("unshare");
  kit.check(
    "5: the host has unshare, to give a hub a network of its own",
    unshare !== null,
    unshare ?? "unshare is not on PATH"
  );
  if (!unshare) {
    return;
  }
  const dir = join(sandbox, "lan-leg");
  mkdirSync(dir, { recursive: true });
  const box = Bun.spawn(
    [
      // Root of a user namespace of its own, so `ip link add` may run in
      // its network; its own PID namespace, so --kill-child takes the hub
      // and the device with the shell when the spec gives up (unshare(1)).
      unshare,
      "--map-root-user",
      "--net",
      "--pid",
      "--mount-proc",
      "--kill-child",
      "--",
      "sh",
      "-c",
      LAN_SCRIPT,
      "sh",
      dir,
      process.execPath,
      HUB_ENTRY,
      import.meta.path,
    ],
    {
      cwd: ROOT,
      env: {
        ...env,
        ...(await ports()),
        CAWCO_NO_MDNS: "0",
        HOST: "::",
        CAWCO_DB_PATH: join(dir, "hub.db"),
      },
      stdout: "ignore",
      stderr: "pipe",
    }
  );
  // The hub's boot, its probe and the device's asking: well inside this.
  const exit = await readWithin(ASK_MS + 60_000, () => box.exited);
  if (exit.kind === "unanswered") {
    box.kill("SIGKILL");
  }
  const ended = exit.kind === "answered" ? exit.value : undefined;
  const read = (name: string) =>
    existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "";
  const err = await new Response(box.stderr).text();
  const asked = (
    read("answers.json")
      ? JSON.parse(read("answers.json"))
      : { heard: [], opened: "" }
  ) as Asked;
  const answered = asked.heard;
  const addresses = (
    read("addresses.json") ? JSON.parse(read("addresses.json")) : []
  ) as IpAddr[];
  const of = (ifname: string) =>
    addresses
      .find((entry) => entry.ifname === ifname)
      ?.addr_info.map((info) => info.local) ?? [];
  const lan = of("lan0");
  kit.check(
    "5: the namespace stood up and its device was answered for cawco.local",
    ended === 0 && answered.includes("192.168.77.1"),
    `exit ${ended ?? "timed out"}; heard ${answered.join(", ") || "nothing"}; stderr ${err.slice(-600)}; hub.log ${read(
      "hub.log"
    )
      .split("\n")
      .filter((line) => line.includes("mDNS") || line.includes("holding"))
      .join(" | ")}`
  );
  const foreign = answered.filter((address) => !lan.includes(address));
  kit.check(
    "5: every A and AAAA record a LAN device is answered with is lan0's, none of br9's or lan1's",
    answered.length > 0 && foreign.length === 0,
    `heard ${answered.join(", ") || "nothing"}; lan0 ${lan.join(", ")}; br9 ${of("br9").join(", ")}; lan1 ${of("lan1").join(", ")}; not lan0's: ${foreign.join(", ") || "none"}`
  );
  kit.check(
    "5: a LAN device's GET http://cawco.local:<hub port>/health at the address it heard reaches the hub, which holds cawco.local",
    asked.opened === "cawco.local",
    asked.opened
  );
  const low = privilegedListeners(read("listening.txt"));
  kit.check(
    `5: nothing in the hub's network listens on a port below ${PRIVILEGED}`,
    read("listening.txt") !== "" && low.length === 0,
    `below ${PRIVILEGED}: ${low.join(" | ") || "none"}`
  );
  kit.note(`leg 5's links, hub log and answers: ${dir}`);
};

/** The port of a local address as `ss` writes it (`[::]:3455`, `0.0.0.0:5353`, `*:22`). */
const portOf = (local: string): number =>
  Number(local.slice(local.lastIndexOf(":") + 1));

/**
 * The rows of `ss -ltnu[p]H` listening (TCP) or bound (UDP) on a port below
 * {@link PRIVILEGED}; with `pids`, only those held by one of them.
 */
const privilegedListeners = (listing: string, pids?: number[]): string[] =>
  listing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => portOf(line.split(SPACES)[4] ?? "") < PRIVILEGED)
    .filter(
      (line) => !pids || pids.some((pid) => line.includes(`pid=${pid},`))
    );

/**
 * Leg 6: `/api/local-name` on the hub at `base`, holding `name`, with the
 * fleet's `dashboardPort`: the name held and the dashboard's address at it,
 * its port in it, and no field beyond those. Answers that address.
 */
const localNameRead = async (
  kit: Kit,
  base: string,
  name: string,
  dashboardPort: string
): Promise<string> => {
  const url = `http://${name}:${dashboardPort}`;
  const read = (await fetch(`${base}/api/local-name`).then((r) =>
    r.json()
  )) as Record<string, unknown>;
  kit.check(
    `6: /api/local-name on ${base} says ${name} is held, the dashboard at ${url}, and carries no command`,
    read.state === "held" &&
      read.name === name &&
      read.url === url &&
      read.dashboardPort === Number(dashboardPort) &&
      Object.keys(read).sort().join(",") === LOCAL_NAME_FIELDS,
    JSON.stringify(read)
  );
  return url;
};

/**
 * Leg 6 on Linux: the built dashboard, served at the fleet's dashboard port
 * on the LAN address the fleet's hub is reached at, answers at `url` (the
 * held name with its port) at the address mDNS gives the name; then neither
 * hub (`pids`) holds a socket on a port below {@link PRIVILEGED}.
 */
const dashboardAtName = async (
  kit: Kit,
  fleet: { dashboard: () => Promise<string> },
  name: string,
  url: string,
  pids: number[]
): Promise<void> => {
  const { hostname: at } = new URL(await fleet.dashboard());
  const answered = await ask<string>({ name, type: "A" }, "A");
  kit.check(
    `6: ${name} resolves over mDNS to ${at}, where the dashboard is served`,
    answered.includes(at),
    `heard ${answered.join(", ") || "nothing"}`
  );
  const { port } = new URL(url);
  const body = join(process.env.TMPDIR ?? "/tmp", `local-name-${port}.html`);
  const status =
    await Bun.$`curl -s --noproxy ${"*"} --resolve ${`${name}:${port}:${at}`} -o ${body} -w ${"%{http_code}"} ${`${url}/`}`
      .nothrow()
      .text();
  const page = existsSync(body) ? readFileSync(body, "utf8") : "";
  kit.check(
    `6: GET ${url}/ answers the dashboard`,
    status === "200" && page.includes("<html"),
    `status ${status}; ${page.slice(0, 160).replaceAll("\n", " ")}`
  );
  const listing = await Bun.$`ss -ltnupH`.nothrow().text();
  const low = privilegedListeners(listing, pids);
  kit.check(
    `6: neither hub (pids ${pids.join(", ")}) holds a socket on a port below ${PRIVILEGED}`,
    listing !== "" && low.length === 0,
    low.join(" | ") || "none"
  );
};

/**
 * Leg 7's question, run as CawCo Agent (the bundle's executable as bun,
 * `-e`): one mDNS A question for the name, sent from the LAN address on a
 * socket bound to 5353 beside the system's responder and joined to the
 * group there; every source heard for 4 s, and what refused (the
 * membership, the send), on its {@link RESULT_MARK} line.
 */
const ASK_LAN = `const dgram = require("node:dgram");
const [name, from] = process.argv.slice(-2);
const heard = new Set();
let refused = "";
const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
socket.on("message", (_message, remote) => heard.add(remote.address));
socket.on("error", (error) => { refused = "socket: " + (error.code || error.message); });
socket.bind(5353, () => {
  try {
    socket.addMembership("224.0.0.251", from);
    socket.setMulticastInterface(from);
  } catch (error) {
    refused = "membership: " + (error.code || error.message);
  }
  const labels = name.split(".").map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)]));
  const question = Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]), ...labels, Buffer.from([0, 0, 1, 0, 1])]);
  socket.send(question, 5353, "224.0.0.251", (error) => { if (error) refused = "send: " + (error.code || error.message); });
});
setTimeout(() => { console.log(${JSON.stringify(RESULT_MARK)} + JSON.stringify({ refused, heard: [...heard] })); process.exit(0); }, 4000);
`;

/** What the system's responder answers for `name` within 4 s: `dns-sd -G v4`'s address column. */
const systemAnswers = async (name: string): Promise<string[]> => {
  const asked = Bun.spawn(["dns-sd", "-G", "v4", name], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const timer = setTimeout(() => asked.kill(), 4000);
  const said = await new Response(asked.stdout).text();
  clearTimeout(timer);
  return said
    .split("\n")
    .filter((line) => line.includes(" Add "))
    .map((line) => line.trim().split(SPACES).at(-2) ?? "");
};

/** The bundle's executable, as bun: what a question run as CawCo Agent needs of its environment. */
const asBun = (): Record<string, string> => ({
  BUN_BE_BUN: "1",
  HOME: process.env.HOME ?? "",
  PATH: process.env.PATH ?? "",
  TMPDIR: process.env.TMPDIR ?? "/tmp",
});

/**
 * Leg 7: the Local Network grant, read from what CawCo Agent's socket hears
 * of another device on the LAN while the system's responder hears it. True
 * when legs 1 to 4 can stand on it.
 */
const grantLeg = async (
  kit: Kit,
  agents: LaunchAgents,
  bundle: string
): Promise<boolean> => {
  const own = await answerable();
  const from = [...own.lan].find((address) => !address.includes(":"));
  const version = (
    await Bun.$`sw_vers -productVersion`.nothrow().text()
  ).trim();
  if (!from) {
    kit.check("7: this Mac has a LAN IPv4 address", false, "none");
    return false;
  }
  const mine = new Set(own.holder.keys());
  const others = (addresses: string[]) =>
    addresses.filter((address) => address && !mine.has(address));
  const system = await systemAnswers("cawco.local");
  if (
    !kit.check(
      `7: macOS ${version}: the system's responder hears cawco.local from another device on the LAN (a hub there to hear)`,
      others(system).length > 0,
      `answers: ${system.join(", ") || "none"}`
    )
  ) {
    return false;
  }
  const asked = await agents
    .result<{ refused: string; heard: string[] }>(
      "ask-lan",
      [bundle, "-e", ASK_LAN, "cawco.local", from],
      asBun(),
      30_000
    )
    .catch((error: Error) => ({ refused: error.message, heard: [] }));
  const heard = others(asked.heard);
  if (asked.refused === "" && heard.length === 0) {
    kit.check(
      "7: CawCo Agent has Local Network access on this Mac",
      false,
      `the system's responder hears cawco.local from ${others(system).join(", ")} and CawCo Agent's socket on ${from} hears nobody: macOS has not given CawCo Agent Local Network access. Allow "CawCo Agent" in the alert macOS shows when the hub starts, or in System Settings › Privacy & Security › Local Network, then run this again. (No API reports the grant, TN3179: "There's no general API that returns whether the current process has local network access"; it is read from what the socket hears.)`
    );
    return false;
  }
  return kit.check(
    `7: CawCo Agent's socket on ${from} hears mDNS from another device on the LAN (its Local Network grant)`,
    asked.refused === "" && heard.length > 0,
    `refused: ${asked.refused || "nothing"}; heard from ${asked.heard.join(", ") || "nobody"}`
  );
};

/** mDNS on, and every interface bound: a loopback hub announces nothing. */
const ANNOUNCING = { CAWCO_NO_MDNS: "0", HOST: "0.0.0.0" };

/** The hub at `base` once it holds a `.local` name: the name. */
const heldBy = (base: string) =>
  until(
    `${base} holding its .local name`,
    async () =>
      ((await fetch(`${base}/health`).then((r) => r.json())) as Health)
        .localName ?? undefined,
    (name) => HELD.test(name),
    60_000
  );

/** What legs 1 to 4 read of the network, from wherever their questions run. */
interface Asker {
  ask: <T>(
    question: { name: string; type: "A" | "PTR" },
    type: "A" | "SRV"
  ) => Promise<T[]>;
  browse: () => Promise<unknown>;
}

/** The two hubs legs 1 to 4 stand up: each one's held name and listener. */
interface Held {
  base: string;
  name: string;
}

/**
 * Legs 2 to 4 on the two hubs, the next name, each one's answers, service and
 * Connect a machine rows, and the agent's browse, read by `asker`.
 */
const nameChecks = async (
  kit: Kit,
  asker: Asker,
  hubs: [Held, Held]
): Promise<void> => {
  const own = await answerable();
  const reachable = new Set((await reachableLinks()).map((link) => link.name));
  const [first, next] = hubs;
  kit.check(
    "the second hub holds the next name, never the first hub's",
    next.name !== first.name &&
      numberOf(next.name) === numberOf(first.name) + 1,
    `${first.name}, then ${next.name}`
  );
  const services = await asker.ask<Srv>(
    { name: "_cawco._tcp.local", type: "PTR" },
    "SRV"
  );
  for (const { name, base } of hubs) {
    const port = Number(new URL(base).port);
    // biome-ignore lint/performance/noAwaitInLoops: one mDNS question at a time
    const answered = await asker.ask<string>({ name, type: "A" }, "A");
    const listed = (
      (await fetch(`${base}/api/join`).then((r) => r.json())) as {
        addresses: { label: string; url: string }[];
      }
    ).addresses;
    const named = (ips: string[]) =>
      ips
        .map((ip) => `${ip} (${own.holder.get(ip) ?? "not this machine's"})`)
        .join(", ");
    const foreign = answered.filter((ip) => !own.allowed.has(ip));
    kit.check(
      `an mDNS query for ${name} answers with the shared LAN's addresses (${own.shared.join(", ")}) and loopback's alone, never a bridge's or a tunnel's`,
      answered.some((ip) => own.lan.has(ip)) && foreign.length === 0,
      `heard ${named(answered) || "nothing"}; not the shared LAN's: ${named(foreign) || "none"}`
    );
    // 3. Its service points at the name it holds.
    kit.check(
      `the hub on :${port} advertises _cawco._tcp with ${name} as its target`,
      services.some((srv) => srv.port === port && srv.target === name),
      JSON.stringify(services)
    );
    // 4. Connect a machine offers it.
    const row = `http://${name}:${port}`;
    kit.check(
      `Connect a machine on :${port} lists "On this network · ${row}"`,
      listed.some(
        (address) => address.label === "On this network" && address.url === row
      ),
      JSON.stringify(listed)
    );
    const unreachable = listed.filter(
      (address) =>
        !(OWN_ROWS.has(address.label) || reachable.has(address.label))
    );
    kit.check(
      `Connect a machine on :${port} offers no address on a link no other machine reaches (reachable: ${[...reachable].join(", ")})`,
      unreachable.length === 0,
      `not reachable: ${unreachable.map((address) => `${address.label} · ${address.url}`).join(", ") || "none"}; listed ${listed.map((address) => address.label).join(", ")}`
    );
  }
  const browsed = (await asker.browse()) as {
    kind: string;
    value?: unknown[];
  };
  kit.check(
    "the agent's browse reads a hub's address off the announcements",
    browsed.kind === "answered" && (browsed.value?.length ?? 0) > 0,
    JSON.stringify(browsed)
  );
};

/** This process's own questions: the probe's, on Linux. */
const ASK_HERE: Asker = { ask, browse: browseMdns };

/** The flags this file runs a question by as CawCo Agent (macOS legs 1 to 4). */
const MDNS_ASK = "--mdns-ask";
const MDNS_BROWSE = "--mdns-browse";

/** Legs 1 to 4 and 6 on macOS: every hub and question as CawCo Agent, once leg 7 finds its grant. */
const macLegs = async (
  kit: Kit,
  fleet: { env: Record<string, string>; sandbox: string }
): Promise<void> => {
  const bundle = currentExecutable();
  if (
    !kit.check(
      "macOS: a release's CawCo Agent.app is installed here, to run the hubs and questions as",
      existsSync(bundle),
      bundle
    )
  ) {
    return;
  }
  const agents = launchAgents(join(fleet.sandbox, "launch-agents"));
  let asked = 0;
  const asker: Asker = {
    ask: <T>(
      question: { name: string; type: "A" | "PTR" },
      type: "A" | "SRV"
    ) => {
      asked += 1;
      return agents.result<T[]>(
        `ask-${asked}`,
        [
          bundle,
          import.meta.path,
          MDNS_ASK,
          JSON.stringify({ question, type }),
        ],
        asBun(),
        30_000
      );
    },
    browse: () =>
      agents.result(
        "browse",
        [bundle, import.meta.path, MDNS_BROWSE],
        asBun(),
        30_000
      ),
  };
  try {
    // 7. The Local Network grant everything after it stands on.
    if (!(await grantLeg(kit, agents, bundle))) {
      return;
    }
    const hubAt = async (n: number): Promise<Held> => {
      const leased = await ports();
      await agents.start(`hub-${n}`, [bundle, "hub"], {
        ...fleet.env,
        ...leased,
        ...ANNOUNCING,
        CAWCO_DB_PATH: join(fleet.sandbox, `mac-hub-${n}.db`),
      });
      const base = `http://127.0.0.1:${leased.CAWCO_HUB_PORT}`;
      return { base, name: await heldBy(base) };
    };
    // 1. The first hub holds a name; 2. a second takes the next.
    const first = await hubAt(1);
    kit.note(`the first hub (CawCo Agent) holds ${first.name}`);
    const next = await hubAt(2);
    await nameChecks(kit, asker, [first, next]);
    // 6. Each hub's name with the dashboard's port, and no command.
    for (const hub of [first, next]) {
      // biome-ignore lint/performance/noAwaitInLoops: one hub at a time
      await localNameRead(
        kit,
        hub.base,
        hub.name,
        fleet.env.CAWCO_DASHBOARD_PORT
      );
    }
  } finally {
    agents.stopAll();
  }
};

const spec: Spec = {
  host: "leg 5 makes user and network namespaces (unshare), legs 1-4 and 6 announce on the machine's own interfaces, and on macOS the hubs run as launchd agents of the installed CawCo Agent.app",
  name: "hub-local-name",
  run: async (kit: Kit) => {
    const own = await answerable();
    const lan = [...own.lan].find((address) => !address.includes(":"));
    kit.check(
      "lan-interfaces.ts picks an interface here that other devices share, with an IPv4 address",
      lan !== undefined,
      own.shared.length > 0
        ? `${own.shared.join(", ")}: ${[...own.lan].join(", ")}`
        : "none: loopback only, run this on the host"
    );
    if (!lan) {
      return;
    }
    // The hub on every address, reached (and its dashboard served) at the
    // LAN one: where a device on the network opens the name.
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }), {
      bind: "0.0.0.0",
      at: lan,
    });
    if (platform() === "darwin") {
      await macLegs(kit, fleet);
      return;
    }

    // 1. The first hub holds a name.
    const hub = fleet.launch("hub", [], ANNOUNCING);
    await fleet.hubUp();
    const first = await heldBy(fleet.base);
    kit.note(`the first hub holds ${first}`);

    // 2. A second hub on the same network takes the next one.
    const second = await ports();
    const secondBase = `http://127.0.0.1:${second.CAWCO_HUB_PORT}`;
    const other = Bun.spawn([process.execPath, HUB_ENTRY], {
      cwd: ROOT,
      env: {
        ...fleet.env,
        ...second,
        ...ANNOUNCING,
        CAWCO_DB_PATH: join(fleet.sandbox, "second-hub.db"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const secondName = await heldBy(secondBase);
      await nameChecks(kit, ASK_HERE, [
        { base: fleet.base, name: first },
        { base: secondBase, name: secondName },
      ]);
      // 6. The name with the dashboard's port, the dashboard at it, no low port.
      const url = await localNameRead(
        kit,
        fleet.base,
        first,
        String(fleet.dashboardPort)
      );
      await localNameRead(
        kit,
        secondBase,
        secondName,
        String(fleet.dashboardPort)
      );
      await dashboardAtName(kit, fleet, first, url, [hub.pid, other.pid]);
    } finally {
      other.kill("SIGKILL");
      await other.exited;
      const said = await new Response(other.stdout).text();
      kit.note(
        `second hub: ${said
          .split("\n")
          .filter((line) => line.includes("[hub]"))
          .join(" | ")}`
      );
    }

    // 5. A device on the LAN hears the LAN's addresses alone, and opens the hub at the name.
    await lanLeg(kit, fleet.env, fleet.sandbox);
  },
};

export default spec;

if (import.meta.main && process.argv[2] === ASK) {
  const [name, from, port] = process.argv.slice(3);
  if (!(name && from && port)) {
    throw new Error(
      `usage: bun ${import.meta.path} ${ASK} <name> <from> <hub port>`
    );
  }
  console.log(JSON.stringify(await askFromLan(name, from, port)));
}

// A question of legs 1 to 4, run as CawCo Agent (macLegs): its answer on the RESULT_MARK line.
if (import.meta.main && process.argv[2] === MDNS_ASK) {
  const { question, type } = JSON.parse(process.argv[3] ?? "{}") as {
    question: { name: string; type: "A" | "PTR" };
    type: "A" | "SRV";
  };
  console.log(`${RESULT_MARK}${JSON.stringify(await ask(question, type))}`);
  process.exit(0);
}
if (import.meta.main && process.argv[2] === MDNS_BROWSE) {
  console.log(`${RESULT_MARK}${JSON.stringify(await browseMdns())}`);
  process.exit(0);
}
