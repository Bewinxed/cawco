/**
 * The stream relay's guided journey (hub relay-journey.ts, agent
 * browser/relay*.ts, dashboard relay/), end to end on a scratch fleet with
 * local stand-ins only, so no request leaves the machine:
 *
 * - a STUN responder answering the router's public address (RFC 5389
 *   XOR-MAPPED-ADDRESS), named to the agent by `CAWCO_STUN_SERVER`;
 * - a DNS server answering the relay's name as the spec sets it, named to the
 *   hub by `CAWCO_RELAY_DNS`;
 * - Cloudflare's API and its IPv4 ranges, named by `CAWCO_CLOUDFLARE_API` and
 *   `CAWCO_CLOUDFLARE_IPS`;
 * - a UPnP gateway (IGD v1, then v2) whose table the spec reads, named to the
 *   agent by `CAWCO_UPNP_GATEWAY`, so neither SSDP nor NAT-PMP is asked;
 * - the browser's `RTCPeerConnection`, scripted per leg, so the page's proof
 *   reaches no relay;
 * - every page request through a domain, as Cloudflare's tunnel forwards it
 *   (`x-forwarded-host`, `x-forwarded-proto`, `cf-ray`, `cf-connecting-ip`).
 *
 * The relay's public address is 1.1.1.1 throughout: Cloudflare's public
 * resolver, which takes stray traffic on 443, so the hub's minute health
 * check, once the relay reads live, reaches no machine of anyone's network
 * it should not.
 *
 * Legs, in the design's order:
 * 0. the setup card: two options, Set up recommended through a domain, and
 *    its pick read back;
 * 1. the machine: one behind a router, picked by itself, ticked with its
 *    address and "behind a router";
 * 2. the name: suggested from the domain, checked (doesn't resolve,
 *    proxied, points elsewhere), Cloudflare refusing a token, then adding the
 *    record DNS only and ticking;
 * 3. the router: an IGD v1 router capping the range (443 mapped, the range a
 *    forward by hand), one refusing (the forwards), an IGD v2 one mapping all;
 * 4–6. no container runtime under the scratch agent (its `DOCKER_HOST` names a
 *    socket that isn't there, on every machine): the low ports not drawn,
 *    the certificate failing with that sentence and Retry, the name skipped
 *    and the start failing with it and Start again;
 * 7. the proof: the relay read live, this screen inside (its STUN answer the
 *    relay's own address), refused (a 401), then outside by its request's
 *    address; the summary;
 * and the Needs you row appearing, leaving on Later, coming back on Set up,
 * ticking once proven, and Remove taking the router's mappings and the
 * journey.
 *
 * Where this machine has a private interface (the host), the agent's own
 * STUN read makes the machine behind a router; inside a workspace boundary,
 * which leaves only loopback, the spec writes the capability report the agent
 * sends from such a machine, and says so on that line.
 *
 *   bun scripts/probe-kit/run.ts relay-journey
 */
import { createSocket, type Socket } from "node:dgram";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { MachineCapabilities } from "../../../packages/core/src/capabilities";
import {
  type RelayAnswer,
  type RelayStep,
  STREAM_RELAY_WORDS as words,
} from "../../../packages/core/src/stream-relay";
import {
  RELAY_CARD,
  relayCard,
  relayPickOf,
} from "../../../packages/hub/src/fleet-choices";
import { applySetupPicks } from "../../../packages/hub/src/setup";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec, settle } from "../kit";

const DOMAIN = "outpost.cawco-probe.dev";
const ZONE = "cawco-probe.dev";
const NAME = `turn.${ZONE}`;
/** The router's public address, as the STUN stand-in answers it. */
const PUBLIC = "1.1.1.1";
/** The machine's address on its router's network, where the workspace has none of its own. */
const LAN_STAND_IN = "192.168.50.20";
/** A screen off the relay's network, by its public address. */
const PHONE = "81.2.69.160";
const GOOD_TOKEN = "probe-token-edit-zone-dns";
const BAD_TOKEN = "probe-token-revoked";
const ZONE_ID = "zone-probe-1";
/** One address inside Cloudflare's ranges, as the stand-in lists them. */
const CLOUDFLARE_ANSWER = "104.16.1.1";
const ELSEWHERE = "203.0.113.9";
/** How long a name check has to answer: the hub asks every 30 s. */
const NAME_MS = 45_000;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/* ------------------------------------------------------------------ */
/* Stand-ins                                                            */
/* ------------------------------------------------------------------ */

/** STUN's magic cookie (RFC 5389 §6), the key XOR-MAPPED-ADDRESS is masked with. */
const COOKIE = Buffer.from([0x21, 0x12, 0xa4, 0x42]);

/** `bytes` masked with the cookie's first bytes, byte by byte (RFC 5389 §15.2). */
const masked = (bytes: number[]): Buffer =>
  Buffer.from(
    // biome-ignore lint/suspicious/noBitwiseOperators: XOR-MAPPED-ADDRESS is the address XOR the cookie (RFC 5389 §15.2).
    bytes.map((byte, at) => byte ^ (COOKIE[at] ?? 0))
  );

/** A STUN binding responder on `bind`: every binding request answered with `address` and the request's own source port. */
export const stunStandIn = (
  address: string,
  bind: string
): Promise<{ port: number; socket: Socket }> =>
  new Promise((resolve) => {
    const socket = createSocket("udp4");
    socket.on("message", (message, remote) => {
      if (message.length < 20 || message.readUInt16BE(0) !== 0x00_01) {
        return;
      }
      const answer = Buffer.alloc(32);
      answer.writeUInt16BE(0x01_01, 0);
      answer.writeUInt16BE(12, 2);
      COOKIE.copy(answer, 4);
      message.copy(answer, 8, 8, 20);
      // XOR-MAPPED-ADDRESS: reserved, family IPv4, port and address under the cookie.
      answer.writeUInt16BE(0x00_20, 20);
      answer.writeUInt16BE(8, 22);
      answer.writeUInt16BE(0x00_01, 24);
      const port = Buffer.alloc(2);
      port.writeUInt16BE(remote.port, 0);
      masked([...port]).copy(answer, 26);
      masked(address.split(".").map(Number)).copy(answer, 28);
      socket.send(answer, remote.port, remote.address);
    });
    socket.bind(0, bind, () =>
      resolve({ port: socket.address().port, socket })
    );
  });

/** A DNS server for A queries: each name answers what `table` holds now, NXDOMAIN when absent. */
const dnsStandIn = (
  table: Map<string, string[]>
): Promise<{ port: number; socket: Socket; asked: string[] }> =>
  new Promise((resolve) => {
    const socket = createSocket("udp4");
    const asked: string[] = [];
    socket.on("message", (message, remote) => {
      let at = 12;
      const labels: string[] = [];
      while (at < message.length && message[at] !== 0) {
        const size = message[at] ?? 0;
        labels.push(message.subarray(at + 1, at + 1 + size).toString());
        at += size + 1;
      }
      const questionEnd = at + 5;
      const name = labels.join(".").toLowerCase();
      const type = message.readUInt16BE(at + 1);
      asked.push(name);
      const answers = type === 1 ? (table.get(name) ?? null) : [];
      const header = Buffer.alloc(12);
      message.copy(header, 0, 0, 2);
      header.writeUInt16BE(answers === null ? 0x81_83 : 0x81_80, 2);
      header.writeUInt16BE(1, 4);
      header.writeUInt16BE(answers?.length ?? 0, 6);
      const records = (answers ?? []).map((address) => {
        const record = Buffer.alloc(16);
        record.writeUInt16BE(0xc0_0c, 0);
        record.writeUInt16BE(1, 2);
        record.writeUInt16BE(1, 4);
        record.writeUInt32BE(5, 6);
        record.writeUInt16BE(4, 10);
        address.split(".").forEach((octet, index) => {
          record[12 + index] = Number(octet);
        });
        return record;
      });
      socket.send(
        Buffer.concat([header, message.subarray(12, questionEnd), ...records]),
        remote.port,
        remote.address
      );
    });
    socket.bind(0, "127.0.0.1", () =>
      resolve({ port: socket.address().port, socket, asked })
    );
  });

/** Cloudflare's API and its ranges: one token good, every record it was asked to make kept. */
const cloudflareStandIn = () => {
  const records: unknown[] = [];
  const asked: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const url = new URL(request.url);
      asked.push(`${request.method} ${url.pathname}${url.search}`);
      if (url.pathname === "/ips-v4") {
        return new Response("104.16.0.0/13\n172.64.0.0/13\n");
      }
      const good =
        request.headers.get("authorization") === `Bearer ${GOOD_TOKEN}`;
      if (!good) {
        return Response.json(
          {
            success: false,
            errors: [{ code: 1000, message: "Invalid API Token" }],
          },
          { status: 401 }
        );
      }
      if (url.pathname === "/client/v4/user/tokens/verify") {
        return Response.json({
          success: true,
          result: { id: "t", status: "active" },
        });
      }
      if (url.pathname === "/client/v4/zones") {
        return Response.json({
          success: true,
          result:
            url.searchParams.get("name") === ZONE
              ? [{ id: ZONE_ID, name: ZONE }]
              : [],
        });
      }
      if (
        url.pathname === `/client/v4/zones/${ZONE_ID}/dns_records` &&
        request.method === "POST"
      ) {
        const body = await request.json();
        records.push(body);
        return Response.json({
          success: true,
          result: { id: "r1", ...(body as object) },
        });
      }
      return Response.json(
        { success: false, errors: [{ code: 7003, message: "No route" }] },
        { status: 404 }
      );
    },
  });
  return { server, records, asked, base: `http://127.0.0.1:${server.port}` };
};

/** A SOAPAction header's action: `"urn:…:WANIPConnection:2#AddAnyPortMapping"`. */
const SOAP_ACTION = /#(\w+)"?$/;
/** An address a router's network hands out. */
const PRIVATE_V4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
/** Caw's head, by what it says of Needs you. */
const NEEDS_HEAD = /^Needs you, \d+|^All caught up/;
/** The certificate's and the start's failure on a machine with no container runtime. */
const NO_RUNTIME =
  /could not start on .+: it runs in a container, and this machine has no container runtime/;

/** One mapping in the stand-in gateway's table. */
interface Mapping {
  client: string;
  lease: number;
  port: number;
  protocol: string;
}

/** A UPnP gateway: IGD v1 or v2 by `mode.version`, refusing every mapping, or every one past `mode.cap`. */
const gatewayStandIn = () => {
  const mode = {
    version: 1 as 1 | 2,
    refuse: false as boolean,
    cap: null as number | null,
  };
  const table = new Map<string, Mapping>();
  const actions: string[] = [];
  const envelope = (inner: string) =>
    `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>${inner}</s:Body></s:Envelope>`;
  const xml = (text: string, status = 200) =>
    new Response(text, {
      status,
      headers: { "content-type": 'text/xml; charset="utf-8"' },
    });
  const fault = (code: number, said: string) =>
    xml(
      envelope(
        `<s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring><detail><UPnPError xmlns="urn:schemas-upnp-org:control-1-0"><errorCode>${code}</errorCode><errorDescription>${said}</errorDescription></UPnPError></detail></s:Fault>`
      ),
      500
    );
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one stand-in router answering each SOAP action its control URL is asked, as a router does.
    fetch: async (request) => {
      const url = new URL(request.url);
      const v = mode.version;
      const service = `urn:schemas-upnp-org:service:WANIPConnection:${v}`;
      if (url.pathname === "/rootDesc.xml") {
        return xml(
          `<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><specVersion><major>1</major><minor>0</minor></specVersion><device><deviceType>urn:schemas-upnp-org:device:InternetGatewayDevice:${v}</deviceType><friendlyName>probe gateway</friendlyName><UDN>uuid:probe-igd-${v}</UDN><deviceList><device><deviceType>urn:schemas-upnp-org:device:WANDevice:${v}</deviceType><UDN>uuid:probe-wan</UDN><deviceList><device><deviceType>urn:schemas-upnp-org:device:WANConnectionDevice:${v}</deviceType><UDN>uuid:probe-conn</UDN><serviceList><service><serviceType>${service}</serviceType><serviceId>urn:upnp-org:serviceId:WANIPConn1</serviceId><controlURL>/ctl</controlURL><eventSubURL>/evt</eventSubURL><SCPDURL>/scpd.xml</SCPDURL></service></serviceList></device></deviceList></device></deviceList></device></root>`
        );
      }
      if (url.pathname !== "/ctl") {
        return new Response("", { status: 404 });
      }
      const action =
        SOAP_ACTION.exec(request.headers.get("soapaction") ?? "")?.[1] ?? "";
      const body = await request.text();
      const arg = (name: string) =>
        new RegExp(`<${name}>([^<]*)</${name}>`).exec(body)?.[1] ?? "";
      actions.push(
        `${action} ${arg("NewProtocol")} ${arg("NewExternalPort")}`.trim()
      );
      if (action === "GetExternalIPAddress") {
        return xml(
          envelope(
            `<u:GetExternalIPAddressResponse xmlns:u="${service}"><NewExternalIPAddress>${PUBLIC}</NewExternalIPAddress></u:GetExternalIPAddressResponse>`
          )
        );
      }
      if (action === "AddPortMapping" || action === "AddAnyPortMapping") {
        const key = `${arg("NewProtocol").toLowerCase()}:${arg("NewExternalPort")}`;
        if (mode.refuse) {
          return fault(718, "ConflictInMappingEntry");
        }
        if (mode.cap !== null && !table.has(key) && table.size >= mode.cap) {
          return fault(728, "NoPortMapsAvailable");
        }
        table.set(key, {
          protocol: arg("NewProtocol").toLowerCase(),
          port: Number(arg("NewExternalPort")),
          client: arg("NewInternalClient"),
          lease: Number(arg("NewLeaseDuration")),
        });
        return xml(
          envelope(
            action === "AddAnyPortMapping"
              ? `<u:AddAnyPortMappingResponse xmlns:u="${service}"><NewReservedPort>${arg("NewExternalPort")}</NewReservedPort></u:AddAnyPortMappingResponse>`
              : `<u:AddPortMappingResponse xmlns:u="${service}"></u:AddPortMappingResponse>`
          )
        );
      }
      if (action === "DeletePortMapping") {
        const protocol = arg("NewProtocol").toLowerCase();
        for (const one of protocol ? [protocol] : ["udp", "tcp"]) {
          table.delete(`${one}:${arg("NewExternalPort")}`);
        }
        return xml(
          envelope(
            `<u:DeletePortMappingResponse xmlns:u="${service}"></u:DeletePortMappingResponse>`
          )
        );
      }
      return fault(401, "Invalid Action");
    },
  });
  return {
    server,
    mode,
    table,
    actions,
    descriptor: `http://127.0.0.1:${server.port}/rootDesc.xml`,
  };
};

/**
 * The browser's `RTCPeerConnection`, scripted by localStorage's `relay-fake`
 * (so a reload keeps it): a relay candidate for every URL (`answer`), a 401
 * and no candidate (`refuse`), or nothing (`none`); and through a STUN-only
 * connection, a server-reflexive candidate at `seenAs`. Each connection's
 * configuration is kept in `window.relayPeers`.
 */
function fakePeers(): void {
  interface Fake {
    mode: "answer" | "refuse" | "none";
    seenAs: string | null;
  }
  const scope = window as unknown as {
    relayPeers: RTCConfiguration[];
    RTCPeerConnection: unknown;
  };
  scope.relayPeers = [];
  const fakeNow = (): Fake =>
    JSON.parse(
      localStorage.getItem("relay-fake") ?? '{"mode":"none","seenAs":null}'
    ) as Fake;
  class Peer {
    config: RTCConfiguration;
    onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
    onicecandidateerror:
      ((event: { errorCode: number; url: string }) => void) | null = null;
    constructor(config: RTCConfiguration) {
      this.config = config;
      scope.relayPeers.push(config);
    }
    createDataChannel() {
      return {};
    }
    createOffer() {
      return Promise.resolve({ type: "offer", sdp: "" });
    }
    setLocalDescription() {
      const fake = fakeNow();
      const url = String(this.config.iceServers?.[0]?.urls ?? "");
      setTimeout(() => {
        if (this.config.iceTransportPolicy === "relay") {
          if (fake.mode === "answer") {
            this.onicecandidate?.({
              candidate: { type: "relay", address: "1.1.1.1" },
            });
            return;
          }
          if (fake.mode === "refuse") {
            this.onicecandidateerror?.({ errorCode: 401, url });
          }
          this.onicecandidate?.({ candidate: null });
          return;
        }
        if (fake.seenAs) {
          this.onicecandidate?.({
            candidate: { type: "srflx", address: fake.seenAs },
          });
        }
        this.onicecandidate?.({ candidate: null });
      }, 50);
      return Promise.resolve();
    }
    close() {
      // nothing open
    }
  }
  scope.RTCPeerConnection = Peer;
}

/** The scripted connections' next answers, kept over a reload. */
const fakeAs = (
  page: Page,
  fake: { mode: "answer" | "refuse" | "none"; seenAs: string | null }
) =>
  page.evaluate((value) => {
    localStorage.setItem("relay-fake", JSON.stringify(value));
  }, fake);

/* ------------------------------------------------------------------ */
/* Reading the journey                                                  */
/* ------------------------------------------------------------------ */

const journeyOf = (fleet: KitFleet) =>
  fleet.api<RelayAnswer>("/api/stream-relay");

const stepOf = <K extends RelayStep["step"]>(answer: RelayAnswer, kind: K) =>
  answer.journey.steps.find((one) => one.step === kind) as
    Extract<RelayStep, { step: K }> | undefined;

/** The journey until `ok` holds of it, or the last read named in the failure. */
const journeyUntil = async (
  fleet: KitFleet,
  what: string,
  ok: (answer: RelayAnswer) => boolean,
  ms = 30_000
): Promise<RelayAnswer> => {
  let last: RelayAnswer | undefined;
  try {
    return await until(
      what,
      async () => {
        last = await journeyOf(fleet);
        return last;
      },
      ok,
      ms
    );
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}; the journey last read ${JSON.stringify(last?.journey)}`,
      { cause: error }
    );
  }
};

/** One act on the journey, as the card sends it through the dashboard. */
const act = (fleet: KitFleet, body: unknown) =>
  fleet.api<RelayAnswer>("/api/stream-relay/act", body);

/** A step's words on the page: its label, and its note and controls when it is open. */
const stepWords = (page: Page, kind: string) =>
  page.evaluate(
    (step) =>
      document
        .querySelector(`[data-relay-journey] [data-step="${step}"]`)
        ?.textContent?.replace(/\s+/g, " ")
        .trim() ?? null,
    kind
  );

/**
 * Every request the page makes to the journey, as a Cloudflare tunnel
 * forwards it for `domain`, from `client`: a read goes through the
 * dashboard's own proxy with the tunnel's headers (`x-forwarded-host`,
 * `x-forwarded-proto`, `cf-ray`, `cf-connecting-ip`), which carries them to
 * the hub; an act goes to the hub as that proxy sends it (the page's public
 * origin beside the tunnel's headers), since the browser keeps the page's own
 * Origin, which the dashboard's gate holds to the forwarded one.
 */
const throughDomain = async (
  page: Page,
  client: { address: string },
  hub: string
) => {
  const tunnel = () => ({
    "x-forwarded-proto": "https",
    "cf-ray": "8f00000000000000-LHR",
    "cf-connecting-ip": client.address,
  });
  await page.route("**/api/stream-relay**", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.continue({
        headers: {
          ...request.headers(),
          ...tunnel(),
          "x-forwarded-host": DOMAIN,
        },
      });
      return;
    }
    const url = new URL(request.url());
    const response = await route.fetch({
      url: `${hub}${url.pathname}${url.search}`,
      method: request.method(),
      headers: {
        "content-type": "application/json",
        "user-agent": request.headers()["user-agent"],
        "x-cawco-page-origin": `https://${DOMAIN}`,
        ...tunnel(),
      },
      postData: request.postData() ?? undefined,
    });
    await route.fulfill({ response });
  });
};

/** Settings › Browsers' own card, apart from the one Caw's Needs you draws from the same journey. */
const settings = (page: Page) => page.locator("[data-stream-relay]");

/** Waits until the step's words on the page include `text` (a frame from the hub has landed). */
const stepSays = async (
  page: Page,
  kind: string,
  text: string,
  ms = 15_000
) => {
  await page
    .waitForFunction(
      ([step, wanted]) =>
        document
          .querySelector(
            `[data-stream-relay] [data-relay-journey] [data-step="${step}"]`
          )
          ?.textContent?.replace(/\s+/g, " ")
          .includes(wanted) ?? false,
      [kind, text] as const,
      { timeout: ms }
    )
    .catch(() => undefined);
  return stepWords(page, kind);
};

/** Caw's Needs you panel opened, and whether the relay's row stands in it with its meta line. */
const needsRow = async (page: Page) => {
  const head = page.getByRole("button", { name: NEEDS_HEAD }).first();
  await head.click();
  await settle(page, 400);
  const read = await page.evaluate(() => {
    const row = document.querySelector('[data-kind="relay"]');
    return row
      ? {
          meta:
            row.querySelector("[data-relay-meta]")?.textContent?.trim() ?? null,
          done: row.querySelector("[data-relay-done]") !== null,
        }
      : null;
  });
  await page.keyboard.press("Escape");
  await settle(page, 300);
  return read;
};

/** A private IPv4 address of this machine's own, as a router's network gives one. */
const lanHere = (): string | undefined =>
  Object.values(networkInterfaces())
    .flatMap((addresses) => addresses ?? [])
    .find(
      (one) =>
        one.family === "IPv4" && !one.internal && PRIVATE_V4.test(one.address)
    )?.address;

/* ------------------------------------------------------------------ */
/* Legs                                                                 */
/* ------------------------------------------------------------------ */

/** 0 · The setup card: two options, Set up recommended through a domain, the pick read back and applied. */
const setupCard = async (kit: Kit): Promise<void> => {
  const plain = relayCard(null);
  const through = relayCard(DOMAIN);
  const picked: string[] = [];
  await applySetupPicks(
    { kind: "page", name: "setup" },
    "project-probe",
    { [RELAY_CARD.id]: { options: [RELAY_CARD.setUp] } } as never,
    {
      fleet: () => undefined,
      place: async () => undefined,
      relay: (pick) => {
        picked.push(pick);
      },
    }
  );
  kit.check(
    `0 · the setup card offers \`${RELAY_CARD.setUp}\` "${words.setUp}" and \`${RELAY_CARD.later}\` "${words.later}" and no field; through ${DOMAIN} Set up is recommended under the domain's lead; picks read back (${relayPickOf({ [RELAY_CARD.id]: { options: ["later"] } } as never)}), and a sent page's Set up reaches the hub (${picked.join(", ")})`,
    plain.includes(`\`${RELAY_CARD.setUp}\` labelled "${words.setUp}"`) &&
      plain.includes(`\`${RELAY_CARD.later}\` labelled "${words.later}"`) &&
      !plain.includes("(recommended)") &&
      !plain.includes("cawco.set") &&
      through.includes(`"${words.setUp}" (recommended)`) &&
      through.includes(words.leadDomain(DOMAIN)) &&
      relayPickOf({ [RELAY_CARD.id]: { options: ["later"] } } as never) ===
        "later" &&
      relayPickOf({}) === undefined &&
      picked.join() === "set-up",
    JSON.stringify({ plain, through })
  );
};

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the journey's legs in the design's order, one fleet, one page and one set of stand-ins carried through them.
const run = async (kit: Kit): Promise<void> => {
  await setupCard(kit);

  const stun = await stunStandIn(PUBLIC, "127.0.0.1");
  const names = new Map<string, string[]>();
  const dns = await dnsStandIn(names);
  const cloudflare = cloudflareStandIn();
  const gateway = gatewayStandIn();
  try {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub", [], {
      CAWCO_CLOUDFLARE_API: `${cloudflare.base}/client/v4`,
      CAWCO_CLOUDFLARE_IPS: `${cloudflare.base}/ips-v4`,
      CAWCO_RELAY_DNS: `127.0.0.1:${dns.port}`,
    });
    await fleet.hubUp();
    fleet.launch("agent", [], {
      CAWCO_STUN_SERVER: `stun:127.0.0.1:${stun.port}`,
      CAWCO_UPNP_GATEWAY: gateway.descriptor,
      // No container runtime on any machine: set, `DOCKER_HOST` is the one
      // socket the agent tries (runtime.ts `findRuntime`), and none answers
      // at this path. So no certbot or coturn ever runs here against Let's
      // Encrypt or Cloudflare, on the host as in a workspace, and legs 4–6
      // read the same everywhere.
      DOCKER_HOST: `unix://${join(fleet.sandbox, "no-runtime.sock")}`,
    });
    await fleet.agentUp();

    // 1 · The machine, behind a router: the agent's own STUN read, or its report written where no router's network is.
    const lan = lanHere();
    if (!lan) {
      const [row] = await until(
        "the agent's capability report",
        async () =>
          fleet.query<{ caps: string | null }>(
            "SELECT machine_capabilities AS caps FROM agents WHERE machine_id = ?",
            MACHINE
          ),
        (rows) => !!rows[0]?.caps?.includes("public-address"),
        60_000
      );
      const caps = JSON.parse(row?.caps ?? "{}") as MachineCapabilities;
      for (const item of caps.items) {
        if (item.id === "public-address") {
          item.available = true;
          item.nat = { address: PUBLIC, lan: LAN_STAND_IN };
        }
      }
      fleet.write(
        "UPDATE agents SET machine_capabilities = ? WHERE machine_id = ?",
        JSON.stringify(caps),
        MACHINE
      );
      kit.note(
        `this machine has no private interface (a workspace boundary leaves only loopback): the agent's report from behind a router is written as it sends it, public-address nat ${PUBLIC} / ${LAN_STAND_IN}; on the host the agent's own STUN read against the stand-in makes it`
      );
    }
    const routerLan = lan ?? LAN_STAND_IN;
    const before = await journeyUntil(
      fleet,
      "one machine that can run the relay",
      (answer) => answer.journey.candidates === 1
    );
    kit.check(
      `1 · before anyone set it up: not open, ${before.journey.candidates} machine can run it${lan ? ` (the agent's own STUN read: ${PUBLIC} behind a router at ${lan}, its STUN server the stand-in, ${stun.port})` : ""}, no step drawn`,
      !before.journey.open &&
        before.journey.steps.length === 0 &&
        !before.journey.asks,
      JSON.stringify(before)
    );

    const base = await fleet.dashboard();
    const page = await kit.page("desk", { init: [fakePeers] });
    const client = { address: PHONE };
    await throughDomain(page, client, fleet.base);
    await open(page, `${base}/config/browsers`, "[data-relay-set-up]");
    await settle(page, 300);
    const lead = await page.evaluate(
      () =>
        document.querySelector("[data-relay-start] p")?.textContent?.trim() ??
        null
    );
    kit.check(
      `Settings › Browsers before Set up, reached through ${DOMAIN}: the lead names it ("${lead}"), and Set up`,
      lead === words.leadDomain(DOMAIN),
      String(lead)
    );

    await settings(page).locator("[data-relay-set-up]").click();
    await settle(page, 1500);
    const setUpRefusal = await page.evaluate(
      () =>
        document.querySelector("[data-relay-refusal]")?.textContent?.trim() ??
        null
    );
    if (setUpRefusal) {
      kit.note(`Set up was refused: ${setUpRefusal}`);
    }
    const opened = await journeyUntil(
      fleet,
      "the machine picked by itself and the name checked",
      (answer) =>
        stepOf(answer, "machine")?.state === "done" &&
        stepOf(answer, "name")?.state === "needs"
    );
    const { machine } = opened.journey;
    const nameStep = stepOf(opened, "name");
    const kept = fleet.query<{ domain: string | null }>(
      "SELECT domain FROM stream_relay_journey"
    )[0]?.domain;
    kit.check(
      `1 · Set up opened the journey through ${DOMAIN} (the journey keeps ${kept}); the one machine picked by itself: "${words.machineDone(machine ?? { name: "", address: "", lan: null })}"`,
      kept === DOMAIN &&
        opened.journey.open &&
        machine?.address === PUBLIC &&
        machine.lan === routerLan,
      JSON.stringify(opened.journey.machine)
    );
    const machineLabel = await stepSays(page, "machine", "Runs on");
    kit.check(
      `1 · the card ticks it: "${machineLabel}"`,
      machineLabel ===
        `${words.stepDone} ${words.machineDone(machine ?? { name: "", address: "", lan: null })}`,
      String(machineLabel)
    );

    // Needs you holds its row, with the machine in its meta line; Later puts it away, Set up brings it back.
    const row = await needsRow(page);
    kit.check(
      `Needs you holds the relay's row, its meta "${row?.meta}"`,
      row !== null && row.meta === words.rowMeta(machine?.name ?? null, 1),
      JSON.stringify(row)
    );
    await act(fleet, { act: "later" });
    await settle(page, 600);
    const gone = await needsRow(page);
    await act(fleet, { act: "set-up" });
    await settle(page, 600);
    const back = await needsRow(page);
    kit.check(
      "Later puts the row away; Set up brings it back",
      gone === null && back !== null,
      JSON.stringify({ gone, back })
    );

    // 2 · The name: suggested from the domain, then each finding as DNS answers.
    kit.check(
      `2 · the name suggested from the domain: ${nameStep?.name}, and it doesn't resolve yet (finding ${nameStep?.finding}; DNS asked for ${dns.asked.filter((one) => one === NAME).length > 0 ? NAME : "nothing"})`,
      nameStep?.name === NAME &&
        nameStep.finding === "unresolved" &&
        dns.asked.includes(NAME),
      JSON.stringify(nameStep)
    );
    await page.reload();
    await open(
      page,
      `${base}/config/browsers`,
      '[data-step="name"][data-open]'
    );
    const unresolved = await stepWords(page, "name");
    kit.check(
      "2 · the card says it, with the record to add and Let CawCo add it",
      unresolved?.includes(words.nameUnresolved(NAME)) === true &&
        unresolved.includes(words.letCawCoAdd) &&
        unresolved.includes(words.skipName),
      String(unresolved)
    );
    names.set(NAME, [CLOUDFLARE_ANSWER]);
    const proxied = await journeyUntil(
      fleet,
      "the name read proxied",
      (answer) => stepOf(answer, "name")?.finding === "proxied",
      NAME_MS
    );
    names.set(NAME, [ELSEWHERE]);
    const elsewhere = await journeyUntil(
      fleet,
      "the name read pointing elsewhere",
      (answer) => stepOf(answer, "name")?.finding === "elsewhere",
      NAME_MS
    );
    const elsewhereWords = await stepSays(
      page,
      "name",
      words.nameElsewhere(
        NAME,
        ELSEWHERE,
        machine ?? { name: "", address: "", lan: null }
      )
    );
    kit.check(
      `2 · answering ${CLOUDFLARE_ANSWER} (Cloudflare's) it reads proxied; answering ${ELSEWHERE}, elsewhere: "${words.nameElsewhere(NAME, ELSEWHERE, machine ?? { name: "", address: "", lan: null })}"`,
      stepOf(proxied, "name")?.finding === "proxied" &&
        stepOf(elsewhere, "name")?.answers === ELSEWHERE &&
        elsewhereWords?.includes(
          words.nameElsewhere(
            NAME,
            ELSEWHERE,
            machine ?? { name: "", address: "", lan: null }
          )
        ) === true,
      String(elsewhereWords)
    );

    // Let CawCo add it: a refused token, then a good one.
    await settings(page)
      .getByRole("button", { name: words.letCawCoAdd })
      .click();
    await settings(page).locator("[data-relay-token]").fill(BAD_TOKEN);
    await settings(page).getByRole("button", { name: words.addRecord }).click();
    await page.waitForSelector("[data-stream-relay] [data-relay-token-why]");
    const tokenWhy = await page.evaluate(
      () =>
        document
          .querySelector("[data-stream-relay] [data-relay-token-why]")
          ?.textContent?.trim() ?? null
    );
    kit.check(
      `2 · Cloudflare refused the token: "${tokenWhy}"`,
      tokenWhy === words.tokenRefused(ZONE, "Invalid API Token, code 1000") &&
        cloudflare.records.length === 0,
      String(tokenWhy)
    );
    await settings(page).locator("[data-relay-token]").fill(GOOD_TOKEN);
    await settings(page).getByRole("button", { name: words.addRecord }).click();
    const pointed = await journeyUntil(
      fleet,
      "the name ticked",
      (answer) => stepOf(answer, "name")?.state === "done"
    );
    const sealed = fleet.query<{ token: string | null }>(
      "SELECT cloudflare_token AS token FROM stream_relay_journey"
    )[0]?.token;
    kit.check(
      `2 · Let CawCo add it made ${NAME} at Cloudflare DNS only (${JSON.stringify(cloudflare.records[0])}), the token kept sealed (its column is no plain token), and the step ticks: "${words.nameDone(NAME)}"`,
      stepOf(pointed, "name")?.state === "done" &&
        JSON.stringify(cloudflare.records) ===
          JSON.stringify([
            { type: "A", name: NAME, content: PUBLIC, ttl: 1, proxied: false },
          ]) &&
        typeof sealed === "string" &&
        !sealed.includes(GOOD_TOKEN),
      JSON.stringify({ calls: cloudflare.asked })
    );

    // 3 · The router: v1 capping the range, then refusing, then v2 mapping all.
    gateway.mode.version = 1;
    gateway.mode.cap = 10;
    const routerAsk = await stepSays(page, "router", words.routerAsk);
    await settings(page).getByRole("button", { name: words.openPorts }).click();
    const partial = await journeyUntil(
      fleet,
      "the router answered",
      (answer) => stepOf(answer, "router")?.state === "partial",
      90_000
    );
    const partialWords = await stepSays(
      page,
      "router",
      words.routerPartial("UPnP")
    );
    const listener = [...gateway.table.keys()].sort();
    kit.check(
      `3 · an IGD v1 router capping its table: "${routerAsk?.slice(0, 60)}…" asked only on Open the ports; it opened UDP and TCP 443 (${listener.join(", ")}, to ${routerLan}) and took the range back; the card shows the range to forward by hand`,
      routerAsk?.includes(words.routerAsk) === true &&
        stepOf(partial, "router")?.how === "UPnP" &&
        listener.join() === "tcp:443,udp:443" &&
        [...gateway.table.values()].every((one) => one.client === routerLan) &&
        gateway.actions.some((one) => one.startsWith("AddPortMapping")) &&
        partialWords?.includes(words.routerPartial("UPnP")) === true &&
        partialWords.includes(
          words.rangeForward(routerLan).split(" ")[0] ?? ""
        ),
      JSON.stringify({ partialWords, table: listener })
    );
    gateway.mode.refuse = true;
    await act(fleet, { act: "open-ports" });
    const refused = await journeyOf(fleet);
    const refusedWords = await stepSays(page, "router", words.routerRefused);
    kit.check(
      `3 · a router refusing every mapping: the forwards to make by hand, "${words.forwards(routerLan, false)}"`,
      stepOf(refused, "router")?.state === "refused" &&
        gateway.table.size === 0 &&
        refusedWords?.includes(words.routerRefused) === true,
      String(refusedWords)
    );
    gateway.mode.refuse = false;
    gateway.mode.cap = null;
    gateway.mode.version = 2;
    gateway.actions.length = 0;
    await act(fleet, { act: "open-ports" });
    const mapped = await journeyOf(fleet);
    const udp = [...gateway.table.values()].filter(
      (one) => one.protocol === "udp"
    ).length;
    kit.check(
      `3 · an IGD v2 router: AddAnyPortMapping for UDP and TCP 443 and all ${udp - 1} ports of the range; the step ticks "${words.routerDone("UPnP")}"`,
      stepOf(mapped, "router")?.state === "done" &&
        gateway.table.has("tcp:443") &&
        udp === 250 &&
        gateway.actions.every((one) => !one.startsWith("AddPortMapping")) &&
        gateway.actions.some((one) => one.startsWith("AddAnyPortMapping")),
      JSON.stringify({
        size: gateway.table.size,
        first: gateway.actions.slice(0, 3),
      })
    );

    // 4–5 · No container runtime under the scratch agent: no low-ports step, and the certificate fails with that sentence.
    const certificate = await journeyUntil(
      fleet,
      "the certificate's issue answered",
      (answer) => stepOf(answer, "certificate")?.state === "failed",
      90_000
    );
    const certWhy = stepOf(certificate, "certificate")?.why ?? "";
    const noRuntime = NO_RUNTIME;
    kit.check(
      `4 · the scratch agent has no container runtime: the low-ports step is not drawn (steps ${certificate.journey.steps.map((one) => one.step).join(", ")}); 5 · the certificate failed with its sentence: "${certWhy.slice(0, 120)}…"`,
      stepOf(certificate, "runtime") === undefined && noRuntime.test(certWhy),
      certWhy
    );
    await settle(page, 400);
    await settings(page).getByRole("button", { name: words.retry }).click();
    const retried = await journeyUntil(
      fleet,
      "Retry answered",
      (answer) => stepOf(answer, "certificate")?.state === "failed",
      90_000
    );
    kit.check(
      "5 · Retry asks again, and the failure stands in place",
      noRuntime.test(stepOf(retried, "certificate")?.why ?? ""),
      JSON.stringify(stepOf(retried, "certificate"))
    );

    // 6 · The name skipped: no certificate step, the start runs and fails with its sentence and command.
    await act(fleet, { act: "skip-name" });
    const started = await journeyUntil(
      fleet,
      "the start answered",
      (answer) => stepOf(answer, "start")?.state === "failed",
      90_000
    );
    const startStep = stepOf(started, "start");
    const startWords = await stepSays(page, "start", words.startAgain);
    kit.check(
      `6 · the name skipped ("${words.nameSkipped}"): no certificate step; the start failed with its sentence and its command in code, and Start again`,
      stepOf(started, "name")?.state === "skipped" &&
        stepOf(started, "certificate") === undefined &&
        noRuntime.test(startStep?.why ?? "") &&
        !!startStep?.command &&
        startWords?.includes(words.startAgain) === true,
      JSON.stringify(startStep)
    );
    await Promise.all([
      page.waitForResponse(
        (response) => response.url().includes("/api/stream-relay/act"),
        { timeout: 90_000 }
      ),
      settings(page).getByRole("button", { name: words.startAgain }).click(),
    ]);
    const again = await journeyUntil(
      fleet,
      "Start again answered",
      (answer) => stepOf(answer, "start")?.state === "failed",
      90_000
    );
    kit.check(
      "6 · Start again starts it again, and the failure stands in place",
      noRuntime.test(stepOf(again, "start")?.why ?? ""),
      JSON.stringify(stepOf(again, "start"))
    );
    // 7 · The proof: the relay read live (the agent's live frame, as the hub stores it).
    await fakeAs(page, { mode: "answer", seenAs: PUBLIC });
    fleet.write(
      `UPDATE stream_relay SET state = 'live', why = NULL, why_command = NULL, ports = '{"udp443":true,"tcp443":true,"tls":false}', health = '[{"port":"udp 443","up":true},{"port":"tcp 443","up":true}]'`
    );
    const inside = await journeyUntil(
      fleet,
      "this screen's proof from inside",
      (answer) => stepOf(answer, "prove")?.state === "inside",
      60_000
    );
    const peers = await page.evaluate(
      () => (window as unknown as { relayPeers: RTCConfiguration[] }).relayPeers
    );
    const relayPeers = peers.filter(
      (one) => one.iceTransportPolicy === "relay"
    );
    kit.check(
      `7 · the start's tick proves it from this screen by itself: one RTCPeerConnection per URL (${relayPeers.map((one) => String(one.iceServers?.[0]?.urls)).join(", ")}) with iceTransportPolicy relay and a credential minted for this screen, and one STUN-only for its own address; the relay saw it at the relay's own address: inside`,
      relayPeers.length === inside.journey.urls.length &&
        relayPeers.every(
          (one) =>
            typeof one.iceServers?.[0]?.credential === "string" &&
            String(one.iceServers?.[0]?.username).includes(":proof:")
        ) &&
        peers.length === relayPeers.length + 1 &&
        stepOf(inside, "prove")?.state === "inside",
      JSON.stringify({ peers, prove: stepOf(inside, "prove") })
    );
    const insideWords = await stepSays(page, "prove", words.doneForNow);
    kit.check(
      `7 · the card: "${insideWords?.slice(0, 140)}…", and Done for now in Later's place`,
      insideWords?.includes("Works from here") === true &&
        insideWords.includes(words.doneForNow),
      String(insideWords)
    );
    // The page proves by itself once per load: loaded again, a relay refusing its credential.
    await fakeAs(page, { mode: "refuse", seenAs: null });
    await page.reload();
    await open(page, `${base}/config/browsers`, "[data-relay-journey]");
    const refusedProof = await journeyUntil(
      fleet,
      "a refused credential",
      (answer) =>
        stepOf(answer, "prove")?.state === "failed" &&
        stepOf(answer, "prove")?.refused === true,
      30_000
    );
    const proveRefusedWords = await stepSays(page, "prove", words.proveRefused);
    kit.check(
      `7 · a relay that refused this screen's credential (a 401) is told apart from one that did not answer: "${proveRefusedWords?.slice(0, 100)}…", and Check again`,
      stepOf(refusedProof, "prove")?.refused === true &&
        proveRefusedWords?.includes(words.proveRefused) === true &&
        proveRefusedWords.includes(words.checkAgain),
      String(proveRefusedWords)
    );
    await fakeAs(page, { mode: "answer", seenAs: null });
    client.address = PHONE;
    await settings(page)
      .getByRole("button", { name: words.checkAgain })
      .click();
    const outside = await journeyUntil(
      fleet,
      "this screen's proof from outside",
      (answer) => stepOf(answer, "prove")?.state === "done",
      30_000
    ).catch((error: unknown) => {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; the proofs stored ${JSON.stringify(fleet.query("SELECT * FROM stream_relay_proofs"))}`,
        { cause: error }
      );
    });
    await settle(page, 800);
    const summary = await page.evaluate(
      () =>
        document.querySelector("[data-relay-proven]")?.textContent?.trim() ??
        null
    );
    kit.check(
      `7 · Check again with no STUN answer, its request from ${PHONE} through Cloudflare: outside; the journey is done, and Settings shows the summary: "${summary}"`,
      outside.journey.done &&
        !outside.journey.asks &&
        summary?.startsWith("Proven from outside by") === true,
      JSON.stringify({ prove: stepOf(outside, "prove"), summary })
    );
    const ticked = await needsRow(page);
    kit.check(
      `Needs you's row ticks once proven while the page stood (${JSON.stringify(ticked)}), and is gone on the next open`,
      ticked?.done === true,
      JSON.stringify(ticked)
    );
    await page.reload();
    await open(page, `${base}/config/browsers`, "[data-relay-summary]");
    const after = await needsRow(page);
    kit.check("…gone after a reload", after === null, JSON.stringify(after));

    // Remove: the router's mappings and the journey go; Settings asks Set up again.
    gateway.actions.length = 0;
    await settings(page).locator("[data-relay-remove]").click();
    await page.waitForSelector('section[data-ask="relay-remove"]');
    await settings(page)
      .getByRole("button", { name: words.remove })
      .last()
      .click();
    await page
      .waitForSelector("[data-stream-relay] [data-relay-set-up]", {
        timeout: 60_000,
      })
      .catch(async (error: unknown) => {
        const tile = await page.evaluate(
          () =>
            document
              .querySelector('section[data-ask="relay-remove"]')
              ?.textContent?.trim() ?? null
        );
        throw new Error(
          `Settings did not offer Set up after Remove: the ask reads ${JSON.stringify(tile)}; the journey reads ${JSON.stringify((await journeyOf(fleet)).journey)}; the relay row ${JSON.stringify(fleet.query("SELECT state, machine_id FROM stream_relay"))}`,
          { cause: error }
        );
      });
    const removed = await journeyOf(fleet);
    kit.check(
      `Remove relay, asked in place: the agent unmapped the router (${gateway.actions.filter((one) => one.startsWith("DeletePortMapping")).length} deletes, ${gateway.table.size} left), the journey is gone, and Settings offers Set up`,
      !removed.journey.open &&
        removed.journey.summary === null &&
        gateway.table.size === 0,
      JSON.stringify({ table: gateway.table.size, journey: removed.journey })
    );
  } finally {
    stun.socket.close();
    dns.socket.close();
    cloudflare.server.stop(true);
    gateway.server.stop(true);
  }
};

const spec: Spec = {
  name: "relay-journey",
  run,
};

export default spec;
