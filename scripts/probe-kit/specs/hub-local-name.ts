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
 *    "On this network · http://<held name>:<port>".
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
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import makeMdns from "multicast-dns";
import { browseMdns } from "../../../packages/agent/src/discovery";
import { readWithin } from "../../../packages/core/src/bounded";
import { lanInterfaces } from "../../../packages/hub/src/lan-interfaces";
import { freePortRange, until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";

const ROOT = join(import.meta.dir, "..", "..", "..");
const HUB_ENTRY = join(ROOT, "packages", "hub", "src", "index.ts");
const HELD = /^cawco(?:-(\d+))?\.local$/;
/** How long a query waits for answers: mDNS responders answer within 500 ms. */
const LISTEN_MS = 2000;

interface Health {
  localName?: string | null;
}

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

/**
 * Leg 5's device: asks for `name`'s A and AAAA records from `from`, an
 * address on the LAN, on an ephemeral port, so each responder that hears the
 * question answers it by unicast to `from` (RFC 6762 §6.7). Asks every
 * second until something answers, then listens {@link LISTEN_MS} more, and
 * answers every address heard.
 */
const askFromLan = async (name: string, from: string): Promise<string[]> => {
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
  return [...heard];
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
`;

interface IpAddr {
  addr_info: { local: string }[];
  ifname: string;
}

/** A hub's own ports: one for its listener, the rest for its previews. */
const ports = async () => {
  const [first, last] = (await freePortRange(13)).split("-").map(Number) as [
    number,
    number,
  ];
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
  const answered = (
    read("answers.json") ? JSON.parse(read("answers.json")) : []
  ) as string[];
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
  kit.note(`leg 5's links, hub log and answers: ${dir}`);
};

const spec: Spec = {
  host: "leg 5 makes a user and network namespace (unshare), and legs 1-4 announce on the machine's own interfaces",
  name: "hub-local-name",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    // mDNS on, and every interface bound: a loopback hub announces nothing.
    const announcing = { CAWCO_NO_MDNS: "0", HOST: "0.0.0.0" };
    const own = await answerable();
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

    // 5. A device on the LAN hears the LAN's addresses alone.
    await lanLeg(kit, fleet.env, fleet.sandbox);
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
