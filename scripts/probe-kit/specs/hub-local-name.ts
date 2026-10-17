/**
 * A hub's `.local` name (hub mdns.ts), on two scratch hubs announcing on this
 * machine's networks:
 *
 * 1. The first hub holds a `cawco[-<n>].local` name: `/health` reports it,
 *    and an mDNS query for it answers with this machine's own addresses.
 * 2. A second hub started beside it probes, finds that name answered and
 *    holds the next one (`cawco.local` → `cawco-2.local`, RFC 6762 §8), its
 *    own query answering too. Never one name for two hubs.
 * 3. Each hub's `_cawco._tcp` service names its held name as its SRV
 *    target, and the agent's own browse (discovery.ts `browseMdns`) still
 *    reads an address off the announcements.
 * 4. Each hub's Connect a machine list (`/api/join`) carries
 *    "On this network · http://<held name>:<port>".
 *
 * Multicast needs an interface that carries it: inside a workspace there is
 * only loopback, so this runs on the host. A hub already on the network (the
 * machine's own) holds `cawco.local` first; then the scratch hubs hold the
 * next two names, which is the same proof.
 *
 *   bun scripts/probe-kit/run.ts hub-local-name
 */
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import makeMdns from "multicast-dns";
import { browseMdns } from "../../../packages/agent/src/discovery";
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

/** Every non-loopback address this machine has, which a hub answers with. */
const ownAddresses = (): Set<string> =>
  new Set(
    Object.values(networkInterfaces())
      .flat()
      .filter((entry) => entry && !entry.internal)
      .map((entry) => entry?.address.split("%")[0] ?? "")
  );

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

const spec: Spec = {
  name: "hub-local-name",
  run: async (kit: Kit) => {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    // mDNS on, and every interface bound: a loopback hub announces nothing.
    const announcing = { CAWCO_NO_MDNS: "0", HOST: "0.0.0.0" };
    const own = ownAddresses();
    kit.check(
      "this machine has an interface besides loopback to announce on",
      own.size > 0,
      [...own].join(", ") || "loopback only: run this on the host"
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
        kit.check(
          `an mDNS query for ${name} answers with this machine's own addresses`,
          answered.length > 0 && answered.every((ip) => own.has(ip)),
          answered.join(", ") || "no answer"
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
  },
};

export default spec;
