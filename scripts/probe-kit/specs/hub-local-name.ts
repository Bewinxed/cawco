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
 *    Then it types the name: `GET http://cawco.local/session?from=lan` at the
 *    address it was answered with is a 307 to the dashboard's port at the
 *    same host, its path and query kept (hub local-name.ts), and port 80
 *    listens on `lan0`'s addresses alone.
 * 6. Where Linux keeps port 80 from the hub (`ip_unprivileged_port_start`
 *    above it, the hub without CAP_NET_BIND_SERVICE), a hub in a network of
 *    its own says so in one line, naming the command at 80, and nothing
 *    listens on port 80, across more than two of its reads.
 * 7. The stream relay's certificate through the hub's port 80, against a
 *    scratch ACME (probe-kit pebble.ts: pebble with real HTTP-01 validation
 *    on port 80, its DNS answering every name with one address). At that
 *    address, in a rootless Podman container on pebble's network, the hub's
 *    own port 80 (hub local-name.ts) runs as a user with
 *    `ip_unprivileged_port_start` at 80 there, its webroot a folder of this
 *    leg's. The agent's own `relay.certify` (agent browser/relay.ts), run
 *    here with that webroot, issues through `--webroot`; certbot finds
 *    pebble by the `cli.ini` certbot reads from its config folder (the
 *    relay's certificate volume): `server` and `no-verify-ssl`. Asserted:
 *    the agent's line `certificate for <name> stands (HTTP through the hub's
 *    port 80)`, the certificate in the volume verifying against pebble's
 *    intermediate, and no container publishing port 80 while it ran. It
 *    runs only where this machine has no relay (its volume is the leg's).
 * 8. macOS only: the first hub holds port 80 on the wildcard address, as a
 *    user. A request to this Mac's LAN address is a 307 to the dashboard's
 *    port at the host it named; a request from an address on no shared
 *    network (the tailnet's, when there is one) is a 404; nothing else
 *    listens on port 80.
 *
 * 9. macOS only, what decides legs 1 to 4 there: one question for the name
 *    obelisk's hub holds (`cawco.local`), asked of the LAN three ways, and
 *    who answered from another device: the system's own responder
 *    (`dns-sd -G v4`), a Bun dgram socket joined to the LAN address, and a
 *    node one running the same code. macOS gates LAN multicast behind Local
 *    Network privacy ("Receiving an incoming UDP multicast | yes", TN3179),
 *    which it grants to "Command-line tools run from Terminal or over SSH"
 *    but not to a launchd agent.
 *
 * Legs 5 to 7 run on Linux, legs 8 and 9 on macOS; legs 1 to 4 on both.
 *
 * Multicast needs an interface that carries it: inside a workspace there is
 * only loopback, and leg 5 makes namespaces, so this runs on the host. A hub
 * already on the network (the machine's own) holds `cawco.local` first; then
 * the scratch hubs hold the next two names, which is the same proof.
 *
 *   bun scripts/probe-kit/run.ts hub-local-name
 */
import { createSocket } from "node:dgram";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces, platform } from "node:os";
import { join } from "node:path";
import makeMdns from "multicast-dns";
import { browseMdns } from "../../../packages/agent/src/discovery";
import { readWithin } from "../../../packages/core/src/bounded";
import { reachableLinks } from "../../../packages/core/src/reachable-links";
import { lanInterfaces } from "../../../packages/hub/src/lan-interfaces";
import { leasePortRange, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { ACME_NETWORK, podmanRun, startPebble } from "../pebble";

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
/** What leg 5's device found: the addresses it heard, and what `GET http://<name>/…` answered. */
interface Asked {
  heard: string[];
  /** curl's `<status> <redirect url>`. */
  redirect: string;
}
/** The path leg 5's device types after the name. */
const TYPED = "/session?from=lan";
/** Leg 6's one line: the hub's word for a port 80 Linux keeps from it. */
const FLOOR_LINE =
  /^\[hub\] port 80 not opened on 192\.168\.77\.1: it is below this machine's ip_unprivileged_port_start \(\d+\)/;
const SPACES = /\s+/;
/** An IPv6 address's brackets, as `ss` writes a local address. */
const BRACKETS = /^\[|\]$/g;

/**
 * Leg 5's device: asks for `name`'s A and AAAA records from `from`, an
 * address on the LAN, on an ephemeral port, so each responder that hears the
 * question answers it by unicast to `from` (RFC 6762 §6.7). Asks every
 * second until something answers, then listens {@link LISTEN_MS} more. Then
 * types the name in as a browser does: `GET http://<name>{@link TYPED}` at
 * the first IPv4 address heard, from `from`. Answers both.
 */
const askFromLan = async (name: string, from: string): Promise<Asked> => {
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
  // The hub opens port 80 on the read that follows its interfaces, its
  // name probed beside it: retried while refused, as a browser's user would.
  const redirect = at
    ? await Bun.$`curl -s --noproxy ${"*"} --interface ${from} --resolve ${`${name}:80:${at}`} --retry 20 --retry-connrefused --retry-delay 1 -o /dev/null -w ${"%{http_code} %{redirect_url}"} ${`http://${name}${TYPED}`}`
        .nothrow()
        .text()
    : "no IPv4 address heard";
  return { heard: [...heard], redirect };
};

/**
 * Leg 5's network, built inside the namespace as its root: `lan0` and `lan1`
 * are dummies with multicast on (an interface of its own, as a NIC is), `br9`
 * a bridge with a veth port. Then the hub, and once `br9` is up, the device
 * at 192.168.77.2 asking. `$1` the leg's folder, `$2` bun, `$3` the hub,
 * `$4` this file.
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
"$2" "$4" ${ASK} cawco.local 192.168.77.2 > "$1/answers.json"
ip -json addr show > "$1/addresses.json"
ss -ltnH > "$1/listening.txt"
`;

/**
 * Leg 6's network: `lan0` alone, `ip_unprivileged_port_start` at 1024 (a
 * new network namespace's own default, written again), and the hub run
 * without CAP_NET_BIND_SERVICE (setpriv(1): dropped from its bounding and
 * inheritable sets, so the root of this user namespace binds as any user
 * does). It runs past three of the hub's reads (mdns.ts's 10 s), then the
 * sockets listening are read. `$1` the leg's folder, `$2` bun, `$3` the hub.
 */
const FLOOR_SCRIPT = `set -eu
ip link set lo up
ip link add lan0 type dummy
ip link set lan0 multicast on
ip addr add 192.168.77.1/24 dev lan0
ip link set lan0 up
ip route add default via 192.168.77.254 dev lan0
echo 1024 > /proc/sys/net/ipv4/ip_unprivileged_port_start || true
cat /proc/sys/net/ipv4/ip_unprivileged_port_start > "$1/floor.txt"
setpriv --bounding-set -net_bind_service --inh-caps -net_bind_service -- "$2" "$3" > "$1/hub.log" 2>&1 &
trap "kill $!" EXIT
for _ in $(seq 120); do grep -q 'ip_unprivileged_port_start' "$1/hub.log" && break; sleep 0.5; done
sleep 25
ss -ltnH > "$1/listening.txt"
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
      : { heard: [], redirect: "" }
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
  // The name typed in: a 307 to the leg's hub's own dashboard port (the
  // fleet's, which it inherits; hub config.ts `DASHBOARD_PORT`) at the same host.
  const dashboardPort = env.CAWCO_DASHBOARD_PORT;
  const location = `http://cawco.local:${dashboardPort}${TYPED}`;
  kit.check(
    `5: a LAN device's GET http://cawco.local${TYPED} is a 307 to ${location}`,
    asked.redirect === `307 ${location}`,
    `curl said "${asked.redirect}"; hub.log ${read("hub.log")
      .split("\n")
      .filter((line) => line.includes("port 80"))
      .join(" | ")}`
  );
  const on80 = listeningOn80(read("listening.txt"));
  const off = on80.filter((address) => !lan.includes(address));
  kit.check(
    "5: port 80 listens on lan0's addresses alone, none of br9's or lan1's, no wildcard",
    on80.length > 0 && off.length === 0,
    `port 80 on ${on80.join(", ") || "nothing"}; not lan0's: ${off.join(", ") || "none"}`
  );
  kit.note(`leg 5's links, hub log and answers: ${dir}`);
};

/** The local addresses `ss -ltnH` lists listening on port 80. */
const listeningOn80 = (listing: string): string[] =>
  listing
    .split("\n")
    .map((line) => line.trim().split(SPACES)[3] ?? "")
    .filter((local) => local.endsWith(":80"))
    .map((local) => local.slice(0, -":80".length).replace(BRACKETS, ""));

/**
 * Leg 6: a hub Linux keeps port 80 from (FLOOR_SCRIPT). Its folder keeps the
 * floor read, the hub's log and the sockets listening.
 */
const floorLeg = async (
  kit: Kit,
  env: Record<string, string>,
  sandbox: string
): Promise<void> => {
  const unshare = Bun.which("unshare");
  const setpriv = Bun.which("setpriv");
  kit.check(
    "6: the host has unshare and setpriv, to run a hub without the right to bind port 80",
    unshare !== null && setpriv !== null,
    `unshare ${unshare ?? "missing"}; setpriv ${setpriv ?? "missing"}`
  );
  if (!(unshare && setpriv)) {
    return;
  }
  const dir = join(sandbox, "floor-leg");
  mkdirSync(dir, { recursive: true });
  const box = Bun.spawn(
    [
      unshare,
      "--map-root-user",
      "--net",
      "--pid",
      "--mount-proc",
      "--kill-child",
      "--",
      "sh",
      "-c",
      FLOOR_SCRIPT,
      "sh",
      dir,
      process.execPath,
      HUB_ENTRY,
    ],
    {
      cwd: ROOT,
      env: {
        ...env,
        ...(await ports()),
        CAWCO_NO_MDNS: "0",
        HOST: "0.0.0.0",
        CAWCO_DB_PATH: join(dir, "hub.db"),
      },
      stdout: "ignore",
      stderr: "pipe",
    }
  );
  const exit = await readWithin(120_000, () => box.exited);
  if (exit.kind === "unanswered") {
    box.kill("SIGKILL");
  }
  const read = (name: string) =>
    existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "";
  const err = await new Response(box.stderr).text();
  const floor = read("floor.txt").trim();
  const lines = read("hub.log")
    .split("\n")
    .filter((line) => line.includes("port 80"));
  const said = lines.filter((line) => FLOOR_LINE.test(line));
  kit.check(
    `6: with ip_unprivileged_port_start at ${floor || "?"}, the hub says it in one line, naming the command at 80, and says nothing else of port 80`,
    exit.kind === "answered" &&
      exit.value === 0 &&
      said.length === 1 &&
      lines.length === 1 &&
      (said[0] ?? "").includes(
        "net.ipv4.ip_unprivileged_port_start=80 > /etc/sysctl.d/90-cawco-relay.conf"
      ),
    `exit ${exit.kind === "answered" ? exit.value : "timed out"}; port 80 lines: ${lines.join(" | ") || "none"}; stderr ${err.slice(-400)}`
  );
  const on80 = listeningOn80(read("listening.txt"));
  kit.check(
    "6: nothing listens on port 80 there",
    read("listening.txt") !== "" && on80.length === 0,
    `port 80 on ${on80.join(", ") || "nothing"}; listening: ${read("listening.txt").trim().split("\n").length} sockets`
  );
  kit.note(`leg 6's floor, hub log and sockets: ${dir}`);
};

/** Leg 7's name for the relay's certificate: any name, pebble's DNS answers every one. */
const ACME_NAME = "relay.cawco-probe.test";
/** The agent's certificate volume and certbot image (agent browser/relay.ts `CERTS_VOLUME`, `CERTBOT_IMAGE`), in full for the Podman CLI. */
const CERTS_VOLUME = "cawco-relay-certs";
const CERTBOT = "docker.io/certbot/dns-cloudflare:v5.8.0";
/** The image leg 7's hub runs in: the host's own bun, mounted. */
const HUB_IMAGE = "docker.io/library/debian:bookworm-slim";
const ACME_HUB = "cawco-probe-acme-hub";

/**
 * Leg 7's hub: the hub's own port 80 (local-name.ts), held on the
 * container's one interface. `$CAWCO_LOCAL_NAME` is the module's path.
 */
const ACME_HUB_SCRIPT = `const { createLocalName } = await import(process.env.CAWCO_LOCAL_NAME);
const name = createLocalName({ dashboardPort: 3000 });
await name.hold(["eth0"]);
console.log(JSON.stringify(name.state()));
setInterval(() => name.hold(["eth0"]), 10_000);
`;

/**
 * `url` read from pebble's network, its TLS unchecked (pebble's own test
 * CA): the body, or undefined. What the last read said, an error or the
 * body, is written to `said` when given.
 */
const readOnAcme = async (
  podman: string,
  url: string,
  said?: string
): Promise<string | undefined> => {
  const read = await podmanRun(podman, [
    "run",
    "--rm",
    "--network",
    ACME_NETWORK.name,
    "--entrypoint",
    "python3",
    CERTBOT,
    "-c",
    "import ssl,sys,urllib.request;print(urllib.request.urlopen(sys.argv[1],context=ssl._create_unverified_context(),timeout=5).read().decode())",
    url,
  ]);
  if (said) {
    writeFileSync(said, `GET ${url}: exit ${read.code}\n${read.out}\n`);
  }
  return read.code === 0 ? read.out : undefined;
};

/** Every container `podman ps` lists now: its names, labels and published ports. */
interface Listed {
  Labels?: Record<string, string> | null;
  Names?: string[];
  Ports?: { host_port?: number }[] | null;
}

/** Leg 7's hub in its container, at the address pebble's DNS gives every name: its port 80 held as a user, the floor at 80. */
const startAcmeHub = async (
  podman: string,
  dir: string,
  webroot: string,
  script: string
): Promise<void> => {
  const hub = await podmanRun(podman, [
    "run",
    "-d",
    "--name",
    ACME_HUB,
    "--network",
    ACME_NETWORK.name,
    "--ip",
    ACME_NETWORK.target,
    "--user",
    "65534:65534",
    "--sysctl",
    "net.ipv4.ip_unprivileged_port_start=80",
    "-e",
    "HOME=/tmp",
    "-e",
    "XDG_DATA_HOME=/data",
    "-e",
    "HOST=0.0.0.0",
    "-e",
    `CAWCO_LOCAL_NAME=${join(ROOT, "packages", "hub", "src", "local-name.ts")}`,
    "-v",
    `${process.execPath}:/usr/local/bin/bun:ro`,
    "-v",
    `${ROOT}:${ROOT}:ro`,
    "-v",
    `${dir}:${dir}:ro`,
    "-v",
    `${webroot}:/data/cawco/acme:z`,
    "-w",
    ROOT,
    HUB_IMAGE,
    "/usr/local/bin/bun",
    script,
  ]);
  if (hub.code !== 0) {
    throw new Error(`the hub's container didn't start: ${hub.out}`);
  }
};

/** Every container `podman ps` lists from now until `stop`: whether certbot's was seen, and any that published port 80. */
const watchPort80 = (podman: string) => {
  const published: string[] = [];
  const seen: { certbot: boolean; watching: boolean } = {
    certbot: false,
    watching: true,
  };
  const listing = (async () => {
    while (seen.watching) {
      // biome-ignore lint/performance/noAwaitInLoops: one listing at a time, while certbot runs
      const listed = await podmanRun(podman, ["ps", "--format", "json"]);
      for (const one of JSON.parse(listed.out || "[]") as Listed[]) {
        seen.certbot ||= one.Labels?.["dev.cawco.relay"] === "certbot";
        for (const port of one.Ports ?? []) {
          if (port.host_port === 80) {
            published.push(`${one.Names?.join(",")} ${JSON.stringify(port)}`);
          }
        }
      }
      await Bun.sleep(250);
    }
  })();
  return {
    async stop() {
      seen.watching = false;
      await listing;
      return { certbotSeen: seen.certbot, published };
    },
  };
};

/**
 * Leg 7: the relay's certificate over HTTP through the hub's port 80,
 * issued by a scratch pebble. Its folder keeps pebble's config, the hub's
 * webroot and log, the certificate and pebble's intermediate.
 */
/** Leg 7's podman and openssl, where both stand and this machine has no stream relay; null, said, otherwise. */
const acmeTools = async (
  kit: Kit
): Promise<{ podman: string; openssl: string } | null> => {
  const podman = Bun.which("podman");
  const openssl = Bun.which("openssl");
  kit.check(
    "7: the host has podman and openssl",
    podman !== null && openssl !== null,
    `podman ${podman ?? "missing"}; openssl ${openssl ?? "missing"}`
  );
  if (!(podman && openssl)) {
    return null;
  }
  const [volume, container] = await Promise.all([
    podmanRun(podman, ["volume", "exists", CERTS_VOLUME]),
    podmanRun(podman, ["container", "exists", "cawco-relay"]),
  ]);
  const free = volume.code !== 0 && container.code !== 0;
  kit.check(
    "7: this machine has no stream relay (its certificate volume is the leg's)",
    free,
    free
      ? "no cawco-relay container, no cawco-relay-certs volume"
      : "a stream relay stands here: run the leg on a machine without one"
  );
  if (!free) {
    return null;
  }
  return { podman, openssl };
};

const acmeLeg = async (kit: Kit, sandbox: string): Promise<void> => {
  const tools = await acmeTools(kit);
  if (!tools) {
    return;
  }
  const { podman, openssl } = tools;
  const dir = join(sandbox, "acme-leg");
  const webroot = join(dir, "webroot");
  mkdirSync(webroot, { recursive: true });
  const script = join(dir, "hub.ts");
  writeFileSync(script, ACME_HUB_SCRIPT);
  const said: string[] = [];
  const { info } = console;
  let pebble: Awaited<ReturnType<typeof startPebble>> | undefined;
  try {
    pebble = await startPebble(podman, dir, {
      containers: [ACME_HUB],
      volumes: [CERTS_VOLUME],
    });
    for (const image of [HUB_IMAGE, CERTBOT]) {
      // biome-ignore lint/performance/noAwaitInLoops: one pull at a time
      const pulled = await podmanRun(podman, ["pull", "-q", image]);
      if (pulled.code !== 0) {
        throw new Error(`podman pull ${image}: ${pulled.out}`);
      }
    }
    // The hub's port 80 at the address pebble's DNS gives every name.
    await startAcmeHub(podman, dir, webroot, script);
    const serving = await until(
      "the hub serving port 80 on pebble's network",
      async () => (await podmanRun(podman, ["logs", ACME_HUB])).out,
      (log) => log.includes('"state":"serving"'),
      60_000
    ).catch((error: Error) => error.message);
    kit.check(
      `7: the hub holds port 80 at ${ACME_NETWORK.target}, as a user, with ip_unprivileged_port_start at 80`,
      serving.includes('"state":"serving"'),
      serving.split("\n").slice(-4).join(" | ")
    );
    await until(
      "pebble's directory answering",
      () =>
        readOnAcme(
          podman,
          pebble?.directory ?? "",
          join(dir, "directory-read.txt")
        ),
      (body) => body?.includes("newOrder") ?? false,
      60_000
    );
    // certbot reads its config folder's cli.ini: pebble, not Let's Encrypt.
    const made = await podmanRun(podman, [
      "volume",
      "create",
      "--label",
      "dev.cawco.relay=certs",
      CERTS_VOLUME,
    ]);
    const ini = await podmanRun(podman, [
      "run",
      "--rm",
      "-v",
      `${CERTS_VOLUME}:/etc/letsencrypt`,
      "--entrypoint",
      "sh",
      CERTBOT,
      "-c",
      'printf "server = %s\nno-verify-ssl = true\n" "$1" > /etc/letsencrypt/cli.ini',
      "sh",
      pebble.directory,
    ]);
    if (made.code !== 0 || ini.code !== 0) {
      throw new Error(
        `the certificate volume's cli.ini: ${made.out} ${ini.out}`
      );
    }
    // Every container while it runs: certbot's seen, none publishing 80.
    const watch = watchPort80(podman);
    console.info = (...words: unknown[]) => {
      said.push(words.map(String).join(" "));
      info(...words);
    };
    const relay = await import("../../../packages/agent/src/browser/relay");
    const issued = await relay
      .certifyRelay({ hostname: ACME_NAME, webroot })
      .then(
        (done) => `ends ${new Date(done.expiresAt).toISOString()}`,
        (error: Error) => `refused: ${error.message}`
      );
    console.info = info;
    const { certbotSeen, published } = await watch.stop();
    const line = said.find((one) =>
      one.startsWith(
        `[relay] certificate for ${ACME_NAME} stands (HTTP through the hub's port 80)`
      )
    );
    kit.check(
      `7: the agent says the certificate for ${ACME_NAME} stands, through the hub's port 80`,
      line !== undefined,
      `${issued}; said: ${said.join(" | ") || "nothing"}`
    );
    const cert = await podmanRun(podman, [
      "run",
      "--rm",
      "-v",
      `${CERTS_VOLUME}:/etc/letsencrypt:ro`,
      "--entrypoint",
      "cat",
      CERTBOT,
      `/etc/letsencrypt/live/${ACME_NAME}/cert.pem`,
    ]);
    const intermediate = await readOnAcme(
      podman,
      `${pebble.management}/intermediates/0`
    );
    writeFileSync(join(dir, "cert.pem"), cert.out);
    writeFileSync(join(dir, "intermediate.pem"), intermediate ?? "");
    const verified =
      await Bun.$`${openssl} verify -partial_chain -CAfile ${join(dir, "intermediate.pem")} ${join(dir, "cert.pem")}`
        .nothrow()
        .quiet();
    const issuer =
      await Bun.$`${openssl} x509 -noout -issuer -subject -in ${join(dir, "cert.pem")}`
        .nothrow()
        .text();
    kit.check(
      "7: the certificate in the relay's volume was issued by this pebble's CA",
      cert.code === 0 && verified.exitCode === 0,
      `${verified.stdout.toString().trim()}${verified.stderr.toString().trim()}; ${issuer.trim().replaceAll("\n", "; ")}`
    );
    kit.check(
      "7: certbot ran, and no container published port 80 while it did",
      certbotSeen && published.length === 0,
      `certbot ${certbotSeen ? "seen" : "never seen"}; port 80 published by: ${published.join("; ") || "none"}`
    );
  } catch (error) {
    kit.check("7: the scratch ACME leg ran to its end", false, String(error));
  } finally {
    console.info = info;
    // Every container's own words, kept before they go: pebble's, its DNS's, the hub's.
    await pebble?.keepLogs();
    await pebble?.stop();
    kit.note(
      `leg 7's config, webroot, certificate, each container's log and the directory's last read: ${dir}`
    );
  }
};

/**
 * Leg 9's question, the same code under bun and node (`-e`): one mDNS A
 * question for the name, sent from the LAN address on a socket bound to
 * 5353 beside the system's responder and joined to the group there; every
 * source heard for 4 s, and what refused (the membership, the send).
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
setTimeout(() => { console.log(JSON.stringify({ refused, heard: [...heard] })); process.exit(0); }, 4000);
`;

/** What leg 9's question heard under `runtime`, or why it didn't run. */
const askedBy = async (
  runtime: string,
  name: string,
  from: string
): Promise<{ refused: string; heard: string[] }> => {
  const ran = await Bun.$`${runtime} -e ${ASK_LAN} ${name} ${from}`
    .nothrow()
    .quiet();
  try {
    return JSON.parse(ran.stdout.toString().trim().split("\n").at(-1) ?? "");
  } catch {
    return {
      refused: `exit ${ran.exitCode}: ${ran.stderr.toString().trim().slice(-300)}`,
      heard: [],
    };
  }
};

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

/** Leg 9: who on the LAN answers `cawco.local` here, asked by the system, by Bun and by node. */
const lanMdnsLeg = async (kit: Kit): Promise<void> => {
  const own = await answerable();
  const from = [...own.lan].find((address) => !address.includes(":"));
  const version = (
    await Bun.$`sw_vers -productVersion`.nothrow().text()
  ).trim();
  if (!from) {
    kit.check("9: this Mac has a LAN IPv4 address", false, "none");
    return;
  }
  const mine = new Set(own.holder.keys());
  const others = (addresses: string[]) =>
    addresses.filter((address) => address && !mine.has(address));
  const system = await systemAnswers("cawco.local");
  kit.check(
    `9: macOS ${version}: the system's responder hears cawco.local from another device on the LAN`,
    others(system).length > 0,
    `answers: ${system.join(", ") || "none"}`
  );
  for (const runtime of [process.execPath, Bun.which("node")]) {
    if (!runtime) {
      kit.note("9: no node on PATH: its question is not asked");
      continue;
    }
    // biome-ignore lint/performance/noAwaitInLoops: one 5353 socket at a time
    const asked = await askedBy(runtime, "cawco.local", from);
    kit.check(
      `9: ${runtime.includes("node") ? "node" : "bun"}'s dgram socket on ${from} hears mDNS from another device on the LAN`,
      asked.refused === "" && others(asked.heard).length > 0,
      `refused: ${asked.refused || "nothing"}; heard from ${asked.heard.join(", ") || "nobody"}`
    );
  }
};

/** An address of this Mac's that is on no shared network (the tailnet's, a VPN's), when it has one. */
const offNetworkAddress = (shared: string[]): string | undefined =>
  Object.entries(networkInterfaces())
    .filter(([name]) => !shared.includes(name))
    .flatMap(([, entries]) => entries ?? [])
    .find((entry) => !entry.internal && entry.family === "IPv4")?.address;

/**
 * Leg 8 (macOS): the first hub's port 80 on the wildcard address. `name`
 * is the name it holds, `base` its listener, `dashboardPort` the fleet's.
 */
const macLeg = async (
  kit: Kit,
  name: string,
  dashboardPort: string
): Promise<void> => {
  const own = await answerable();
  const lan = [...own.lan].find((address) => !address.includes(":"));
  if (!lan) {
    kit.check("8: this Mac has a LAN address", false, "none");
    return;
  }
  const typed = "/session?from=mac";
  const get = (address: string, from?: string) =>
    Bun.$`curl -s --noproxy ${"*"} ${from ? ["--interface", from] : []} --retry 15 --retry-connrefused --retry-delay 1 -o /dev/null -w ${"%{http_code} %{redirect_url}"} -H ${`Host: ${name}`} ${`http://${address}${typed}`}`
      .nothrow()
      .text();
  const answered = await get(lan);
  const location = `http://${name}:${dashboardPort}${typed}`;
  kit.check(
    `8: GET http://${lan}${typed} (Host ${name}) is a 307 to ${location}`,
    answered === `307 ${location}`,
    `curl said "${answered}"`
  );
  const off = offNetworkAddress(own.shared);
  if (off) {
    const refused = await get(off, off);
    kit.check(
      `8: a request from ${off}, on no shared network, is a 404`,
      refused.startsWith("404"),
      `curl said "${refused}"`
    );
  } else {
    kit.note(
      "8: this Mac has no address off its shared networks: the 404 leg is not run"
    );
  }
  const listening = await Bun.$`lsof -nP -iTCP:80 -sTCP:LISTEN`
    .nothrow()
    .text();
  const rows = listening
    .split("\n")
    .slice(1)
    .filter(Boolean)
    .map((row) => row.trim().split(SPACES));
  const owners = new Set(rows.map((row) => row[1]));
  const wildcard = rows.every((row) => (row[8] ?? "").startsWith("*:80"));
  kit.check(
    "8: one process listens on port 80, on the wildcard address alone",
    rows.length > 0 && owners.size === 1 && wildcard,
    listening.trim().replaceAll("\n", " | ") || "nothing listens on port 80"
  );
};

const spec: Spec = {
  host: "legs 5 and 6 make user and network namespaces (unshare), leg 7 runs rootless Podman containers, and legs 1-4 announce on the machine's own interfaces",
  name: "hub-local-name",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    // mDNS on, and every interface bound: a loopback hub announces nothing.
    const announcing = { CAWCO_NO_MDNS: "0", HOST: "0.0.0.0" };
    const own = await answerable();
    const reachable = new Set(
      (await reachableLinks()).map((link) => link.name)
    );
    kit.check(
      "lan-interfaces.ts picks an interface here that other devices share",
      own.lan.size > 0,
      own.shared.length > 0
        ? `${own.shared.join(", ")}: ${[...own.lan].join(", ")}`
        : "none: loopback only, run this on the host"
    );

    const heldBy = (base: string) =>
      until(
        `${base} holding its .local name`,
        async () =>
          ((await fetch(`${base}/health`).then((r) => r.json())) as Health)
            .localName ?? undefined,
        (name) => HELD.test(name),
        60_000
      );

    // 1. The first hub holds a name.
    fleet.launch("hub", [], announcing);
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
        ...announcing,
        CAWCO_DB_PATH: join(fleet.sandbox, "second-hub.db"),
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const next = await heldBy(secondBase);
      kit.check(
        "the second hub holds the next name, never the first hub's",
        next !== first && numberOf(next) === numberOf(first) + 1,
        `${first}, then ${next}`
      );

      const services = await ask<Srv>(
        { name: "_cawco._tcp.local", type: "PTR" },
        "SRV"
      );
      const hubs = await Promise.all(
        (
          [
            [first, fleet.base],
            [next, secondBase],
          ] as const
        ).map(async ([name, base]) => ({
          name,
          port: Number(new URL(base).port),
          answered: await ask<string>({ name, type: "A" }, "A"),
          listed: (
            (await fetch(`${base}/api/join`).then((r) => r.json())) as {
              addresses: { label: string; url: string }[];
            }
          ).addresses,
        }))
      );
      for (const { name, port, answered, listed } of hubs) {
        const named = (ips: string[]) =>
          ips
            .map(
              (ip) => `${ip} (${own.holder.get(ip) ?? "not this machine's"})`
            )
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
            (address) =>
              address.label === "On this network" && address.url === row
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

      const browsed = await browseMdns();
      kit.check(
        "the agent's browse reads a hub's address off the announcements",
        browsed.kind === "answered" && browsed.value.length > 0,
        JSON.stringify(browsed)
      );
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

    if (platform() === "darwin") {
      // 8. The wildcard port 80 as a user, the first hub's.
      await macLeg(kit, first, fleet.env.CAWCO_DASHBOARD_PORT);
      // 9. Who answers on the LAN here: the system, Bun, node.
      await lanMdnsLeg(kit);
      return;
    }
    // 5. A device on the LAN hears the LAN's addresses alone, and typing the name opens the dashboard.
    await lanLeg(kit, fleet.env, fleet.sandbox);
    // 6. Where Linux keeps port 80 from the hub: one line, no listener.
    await floorLeg(kit, fleet.env, fleet.sandbox);
    // 7. The relay's certificate through the hub's port 80, from a scratch pebble.
    await acmeLeg(kit, fleet.sandbox);
  },
};

export default spec;

if (import.meta.main && process.argv[2] === ASK) {
  const [name, from] = process.argv.slice(3);
  if (!(name && from)) {
    throw new Error(`usage: bun ${import.meta.path} ${ASK} <name> <from>`);
  }
  console.log(JSON.stringify(await askFromLan(name, from)));
}
