/**
 * The hub's part of a browser's stream (Projects spec §5.11, build item 4):
 * a viewer reaches neko's REST and signaling, and the local host's take-over
 * view, on the hub's own origin (hub browser-routes.ts), through the
 * machine's browser listener (agent preview.ts `listenBrowsers`).
 *
 * On a scratch fleet (real hub, agent and sessiond), with a headless
 * Chromium (playwright-core) as the viewer on a page of the hub's origin:
 *
 * - container host: `GET /ws/browser/<i>/<a>/api/whoami` through the hub,
 *   sent with a token neko never made, answers a viewer session of neko's
 *   (the hub swapped its own in);
 * - the viewer's `signal/provide` carries `iceservers` the hub minted for
 *   it: the relay's URLs, `<expiry>:viewer:<neko session>` good for 12 h,
 *   and the credential HMAC-SHA1 of that under the relay's secret; then the
 *   fleet's STUN server, alone;
 * - neko's own ICE servers name that STUN server and nothing else (never
 *   neko's default, Google's), and it gives viewers none of its own;
 * - that credential allocates on coturn;
 * - the viewer connects; its selected pair is host/host on the LAN;
 * - the same viewer with `iceTransportPolicy: "relay"` connects through
 *   coturn over UDP;
 * - the daemon is told the view count as a socket opens (1) and closes (0);
 * - local host (`DOCKER_HOST=unix:///nonexistent`): the `/cdp` view of a
 *   take-over carries frames whose header reads 1280x800, and a tap sent up
 *   it lands on the page.
 *
 * The relay is this spec's own coturn (the relay's image and arguments, a
 * secret made here), on a stand-in for 443 picked as browser-relay.ts picks
 * one, with `--allowed-peer-ip=<address>` added so it relays to this
 * machine's own LAN address, which the relay's arguments deny. The hub is
 * given a relay record for it under a machine that never connects, its
 * state `stopped`: the hub mints from it and never starts, stops or probes
 * it. The record's URLs name 443, so the viewer's page points them at the
 * stand-in before its peer connection reads them; the browser is started
 * before the record is written, so neko holds no relay of its own. The
 * fleet's STUN server is a stand-in (relay-journey.ts `stunStandIn`) on
 * every address of this machine, answering its LAN address, named to the hub
 * and the agent by `CAWCO_STUN_SERVER`. No real relay, router, DNS name,
 * STUN server or Cloudflare is touched.
 *
 * That coturn runs as the agent runs the relay (agent relay.ts): on the host
 * network where the runtime's is this machine's own (obelisk's Podman),
 * else published through the runtime's VM forwarder (a Mac's OrbStack,
 * Colima or Docker Desktop), the forwarder's address let through once its
 * first binding shows it. Colima must run its grpc forwarder for UDP
 * (`colima stop && colima start --port-forwarder grpc`).
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket and the browser's ports):
 *
 *   bun scripts/probe-kit/run.ts browser-stream [--address <this machine's LAN address>]
 */
import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { Runtime } from "../../../packages/agent/src/browser/runtime";
import type { BrowserKey } from "../../../packages/core/src/browser";
import { STREAM_RELAY_PORT } from "../../../packages/core/src/stream-relay";
import { until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { binding, freeStandIn, onPort, turn } from "./browser-relay";
import { stunStandIn } from "./relay-journey";

/** This spec's coturn: never the relay's own `cawco-relay`. */
const COTURN = "cawco-relay-stream-probe";
/** The machine the hub's relay record names: none of the fleet's, so nothing ever starts or probes it. */
const RELAY_MACHINE = "browser-stream-probe";
/** How long a viewer's credential lasts (hub browser-routes.ts). */
const VIEWER_TTL_S = 12 * 60 * 60;
const TAP_PAGE =
  "data:text/html,<title>untapped</title><button style='position:fixed;inset:0' onclick=\"document.title='tapped'\">tap</button>";

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};

const HTTP_SCHEME = /^http/;

const PRIVATE_V4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

/** What a view read: neko's words, the offer's ICE servers, and the pair it connected on. */
interface ViewRead {
  closed?: string;
  error?: string;
  iceservers?: { urls: string[]; username?: string; credential?: string }[];
  pair?: {
    local: {
      type?: string;
      relayProtocol?: string;
      address?: string;
      /** The ICE server it was obtained from: a local relay (or relay-made prflx) candidate's TURN URL. */
      url?: string;
    };
    remote: { type?: string; address?: string };
  };
  said: string[];
  session?: string;
}

/**
 * One view in the page: neko's signaling through the hub, the offer
 * answered with ICE servers whose port `from` reads `to`, until the peer
 * connects (its selected pair read from `getStats()`) or fails.
 */
const view = (args: {
  url: string;
  policy: RTCIceTransportPolicy;
  from: number;
  to: number;
}): Promise<ViewRead> =>
  new Promise((resolve) => {
    const read: ViewRead = { said: [] };
    let pc: RTCPeerConnection | undefined;
    let settled = false;
    const held: RTCIceCandidateInit[] = [];
    const ws = new WebSocket(args.url);
    const done = (error?: string) => {
      if (settled) {
        return;
      }
      settled = true;
      if (error) {
        read.error = error;
      }
      pc?.close();
      ws.close();
      resolve(read);
    };
    const timer = setTimeout(
      () =>
        done(`not connected within 45 s (${pc?.connectionState ?? "no peer"})`),
      45_000
    );
    const send = (event: string, payload: unknown) =>
      ws.send(JSON.stringify({ event, payload }));
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialised into the page with its view, so it calls nothing outside it.
    const selected = async (peer: RTCPeerConnection) => {
      const stats = await peer.getStats();
      let pairId: string | undefined;
      for (const one of stats.values()) {
        if (one.type === "transport" && one.selectedCandidatePairId) {
          pairId = one.selectedCandidatePairId;
        }
      }
      let pair = pairId ? stats.get(pairId) : undefined;
      if (!pair) {
        for (const one of stats.values()) {
          if (
            one.type === "candidate-pair" &&
            one.nominated &&
            one.state === "succeeded"
          ) {
            pair = one;
          }
        }
      }
      const local = pair ? stats.get(pair.localCandidateId) : undefined;
      const remote = pair ? stats.get(pair.remoteCandidateId) : undefined;
      return {
        local: {
          type: local?.candidateType,
          relayProtocol: local?.relayProtocol,
          address: local?.address,
          url: local?.url,
        },
        remote: { type: remote?.candidateType, address: remote?.address },
      };
    };
    ws.onclose = (event) => {
      read.closed = `${event.code} ${event.reason}`;
      clearTimeout(timer);
      done(read.pair ? undefined : `the socket closed: ${read.closed}`);
    };
    ws.onmessage = async (event) => {
      const message = JSON.parse(String(event.data)) as {
        event: string;
        payload?: Record<string, unknown>;
      };
      read.said.push(message.event);
      if (message.event === "system/init") {
        read.session = message.payload?.session_id as string | undefined;
        send("signal/request", { video: {}, audio: {} });
      } else if (message.event === "signal/candidate") {
        const candidate = message.payload as RTCIceCandidateInit;
        if (pc?.remoteDescription) {
          pc.addIceCandidate(candidate).catch(() => undefined);
        } else {
          held.push(candidate);
        }
      } else if (message.event === "signal/provide") {
        read.iceservers = message.payload?.iceservers as ViewRead["iceservers"];
        const servers = (read.iceservers ?? []).map((server) => ({
          ...server,
          urls: server.urls.map((url) =>
            url.replace(`:${args.from}?`, `:${args.to}?`)
          ),
        }));
        const peer = new RTCPeerConnection({
          iceServers: servers,
          iceTransportPolicy: args.policy,
        });
        pc = peer;
        peer.onicecandidate = (found) => {
          if (found.candidate) {
            send("signal/candidate", found.candidate.toJSON());
          }
        };
        peer.onconnectionstatechange = async () => {
          if (peer.connectionState === "connected") {
            read.pair = await selected(peer);
            clearTimeout(timer);
            done();
          } else if (peer.connectionState === "failed") {
            clearTimeout(timer);
            done("ICE failed");
          }
        };
        await peer.setRemoteDescription({
          type: "offer",
          sdp: message.payload?.sdp as string,
        });
        for (const candidate of held.splice(0)) {
          peer.addIceCandidate(candidate).catch(() => undefined);
        }
        await peer.setLocalDescription(await peer.createAnswer());
        send("signal/answer", { sdp: peer.localDescription?.sdp });
      }
    };
  });

/** The take-over view in the page: frames read off it, a tap sent up it after the first. */
const cdpView = (args: {
  url: string;
}): Promise<{
  closed?: string;
  error?: string;
  frames: { width: number; height: number; bytes: number }[];
}> =>
  new Promise((resolve) => {
    const frames: { width: number; height: number; bytes: number }[] = [];
    const ws = new WebSocket(args.url);
    ws.binaryType = "arraybuffer";
    let settled = false;
    const done = (more: { closed?: string; error?: string } = {}) => {
      if (!settled) {
        settled = true;
        ws.close();
        resolve({ frames, ...more });
      }
    };
    const timer = setTimeout(
      () => done({ error: "fewer than three frames within 20 s" }),
      20_000
    );
    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        return;
      }
      const header = new DataView(event.data as ArrayBuffer, 0, 4);
      frames.push({
        width: header.getUint16(0),
        height: header.getUint16(2),
        bytes: (event.data as ArrayBuffer).byteLength - 4,
      });
      if (frames.length === 1) {
        ws.send(JSON.stringify({ t: "tap", x: 200, y: 200 }));
      }
      if (frames.length === 3) {
        clearTimeout(timer);
        setTimeout(() => done(), 1000);
      }
    };
    ws.onclose = (event) => {
      clearTimeout(timer);
      done({ closed: `${event.code} ${event.reason}` });
    };
  });

const post = async (fleet: KitFleet, path: string, body: object) => {
  const response = await fetch(`${fleet.base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, text: await response.text() };
};

/** A project on a repo of its own and one session in it. */
const sessionIn = async (fleet: KitFleet, name: string) => {
  const repo = join(fleet.sandbox, name);
  await mkdir(repo, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git -c user.name=O -c user.email=o@probe.test add -A && git -c user.name=O -c user.email=o@probe.test commit -qm 'First commit'`
    .cwd(repo)
    .quiet();
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name,
    machineId: "scratch-fleet",
    cwd: repo,
    caw: false,
  });
  const instance = await fleet.spawn("claude", name, repo, {
    projectId: project.id,
  });
  return { key: `project:${project.id}` as BrowserKey, instance };
};

/** The browser started on its machine, then the session's browser artifact, as its panel lists it. */
const browserOf = async (
  fleet: KitFleet,
  key: BrowserKey,
  instance: string
): Promise<string | undefined> => {
  const started = await post(
    fleet,
    `/api/browsers/${encodeURIComponent(key)}/start`,
    { machineId: "scratch-fleet" }
  );
  if (started.status !== 200) {
    throw new Error(`${key} did not start: ${started.status} ${started.text}`);
  }
  const listed = (await (
    await fetch(`${fleet.base}/api/instances/${instance}/artifacts`)
  ).json()) as { id: string; kind: string }[];
  return listed.find((one) => one.kind === "browser")?.id;
};

/** How many times the agent's logs, every file of every launch, say `line`. */
const said = async (fleet: KitFleet, line: string): Promise<number> =>
  (await fleet.logs("agent")).split(line).length - 1;

/**
 * The agent's logs say `line` more than the `before` times they had. Counted,
 * not read from an offset: `fleet.logs` joins a launch's `.err` and `.log`
 * in the order the directory lists them, so a line the `.log` gains can land
 * before an offset taken in the text joined.
 */
const saidAgain = (fleet: KitFleet, line: string, before: number) =>
  until(
    `the agent's log says "${line}" again`,
    () => said(fleet, line),
    (times) => times > before,
    30_000
  ).then(
    () => true,
    () => false
  );

const run = async (kit: Kit): Promise<void> => {
  const realHome = homedir();
  const { findRuntime } =
    await import("../../../packages/agent/src/browser/runtime");
  const runtime = await findRuntime();
  if ("missing" in runtime) {
    kit.check(
      "a container runtime answers on this host",
      false,
      runtime.missing
    );
    return;
  }
  const { machineAddresses } =
    await import("../../../packages/agent/src/browser/media-forwarding");
  const v4 = (await machineAddresses()).filter((one) => !one.includes(":"));
  const address =
    flag("address") ?? v4.find((one) => PRIVATE_V4.test(one)) ?? v4[0];
  if (!(
    kit.check(
      `this machine's LAN address: ${address ?? "none found (name one with --address)"}`,
      !!address
    ) && address
  )) {
    return;
  }

  const standIn = await freeStandIn();
  if (
    !kit.check(
      `a stand-in for 443 free on UDP and TCP, outside the hub's preview ports and the relay's: ${standIn ?? "none found"}`,
      standIn !== undefined
    ) ||
    standIn === undefined
  ) {
    return;
  }
  const secret = randomBytes(32).toString("base64url");
  const where = ` (this spec's coturn on ${address}:${standIn}, a stand-in for 443${runtime.ownNetwork ? "" : `, published through ${runtime.endpoint}`})`;
  const coturn = await startCoturn(kit, runtime, {
    address,
    secret,
    standIn,
    where,
  });
  if (!coturn) {
    return;
  }
  try {
    await legs(kit, {
      address,
      docker: runtime.docker,
      realHome,
      runtime: runtime.endpoint,
      secret,
      standIn,
      where,
    });
  } finally {
    await coturn.remove({ force: true }).catch(() => undefined);
  }
};

/** A binding's answer, `up (<ip>:<port>)`: the address coturn saw it from. */
const SEEN_FROM = /^up \((.+):\d+\)$/;

/**
 * This spec's coturn, the relay's image and arguments on a stand-in for 443,
 * once it answers a binding: on the host network where the runtime's is the
 * machine's own, else published through its VM's forwarder as the agent
 * publishes the relay (agent relay.ts), the forwarder's address let through
 * once a binding shows it.
 */
const startCoturn = async (
  kit: Kit,
  runtime: Runtime,
  on: { address: string; secret: string; standIn: number; where: string }
) => {
  const { address, secret, standIn, where } = on;
  const { docker } = runtime;
  const relay = await import("../../../packages/agent/src/browser/relay");
  const { STREAM_RELAY_PORTS } =
    await import("../../../packages/core/src/stream-relay");
  const { isPublicAddress } =
    await import("../../../packages/core/src/public-address");
  const { pullImage } =
    await import("../../../packages/agent/src/browser/image");
  await pullImage(docker, relay.RELAY_IMAGE, (step) =>
    kit.note(`${relay.RELAY_IMAGE}: ${step.done}/${step.total} layers`)
  );
  const { relayRange } = STREAM_RELAY_PORTS;
  const [first, last] = relayRange;
  const ports = runtime.ownNetwork
    ? []
    : [
        `${standIn}/udp`,
        `${standIn}/tcp`,
        ...Array.from(
          { length: last - first + 1 },
          (_, at) => `${first + at}/udp`
        ),
      ];
  const made = async (forwarder?: string) => {
    await docker
      .getContainer(COTURN)
      .remove({ force: true })
      .catch(() => undefined);
    const container = await docker.createContainer({
      name: COTURN,
      Image: relay.RELAY_IMAGE,
      Cmd: [
        ...relay
          .coturnArgs(
            { secret, address, relayRange },
            false,
            runtime.ownNetwork
              ? { kind: "host" }
              : { kind: "published", forwarder }
          )
          .map(onPort(standIn)),
        `--allowed-peer-ip=${address}`,
      ],
      ...(runtime.ownNetwork
        ? { HostConfig: { NetworkMode: "host" } }
        : {
            ExposedPorts: Object.fromEntries(ports.map((port) => [port, {}])),
            HostConfig: {
              PortBindings: Object.fromEntries(
                ports.map((port) => [
                  port,
                  [{ HostIp: "0.0.0.0", HostPort: port.split("/")[0] }],
                ])
              ),
            },
          }),
    });
    await container.start();
    // A VM's forwarder binds a moment after the guest does (Lima: every 3 s).
    const bound = await until(
      "coturn answers a STUN binding",
      () => binding(`stun:${address}:${standIn}?transport=udp`),
      (answer) => answer.startsWith("up"),
      30_000
    ).catch((error: unknown) => String(error));
    return { container, bound };
  };
  let coturn = await made();
  const seen = SEEN_FROM.exec(coturn.bound)?.[1];
  if (
    !runtime.ownNetwork &&
    seen &&
    !isPublicAddress(seen) &&
    seen !== address
  ) {
    kit.note(
      `the forwarder hands coturn every peer as ${seen}: let through its denied ranges, as the agent's relay does`
    );
    coturn = await made(seen);
  }
  if (
    kit.check(
      `coturn answers on udp ${standIn}: ${coturn.bound}${where}`,
      coturn.bound.startsWith("up")
    )
  ) {
    return coturn.container;
  }
  await coturn.container.remove({ force: true }).catch(() => undefined);
};

interface At {
  address: string;
  docker: Runtime["docker"];
  realHome: string;
  runtime: string;
  secret: string;
  standIn: number;
  where: string;
}

/** Both legs, with the fleet's STUN server this spec's stand-in on every address, answering this machine's LAN one. */
const legs = async (kit: Kit, at: At): Promise<void> => {
  const stun = await stunStandIn(at.address, "0.0.0.0");
  try {
    await legsWith(kit, at, `stun:${at.address}:${stun.port}`);
  } finally {
    stun.socket.close();
  }
};

const legsWith = async (kit: Kit, at: At, stun: string): Promise<void> => {
  const { address, docker, secret, standIn, where } = at;
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  const browsersPath =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    join(
      at.realHome,
      process.platform === "darwin" ? "Library/Caches" : ".cache",
      "ms-playwright"
    );
  const agentOn = async (dockerHost: string) => {
    fleet.launch("agent", [], {
      CAWCO_STUN_SERVER: stun,
      DOCKER_HOST: dockerHost,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    });
    await fleet.agentUp();
  };
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub", [], { CAWCO_STUN_SERVER: stun });
  await fleet.hubUp();
  fleet.fileAccount();
  await agentOn(`unix://${at.runtime}`);
  await fleet.accountSignedIn();
  process.env.XDG_DATA_HOME = fleet.env.XDG_DATA_HOME as string;
  const ws = fleet.base.replace(HTTP_SCHEME, "ws");
  const page = await kit.page("desk");
  await page.goto(`${fleet.base}/health`);

  await containerLeg(kit, {
    fleet,
    page,
    ws,
    address,
    docker,
    secret,
    standIn,
    stun,
    where,
  });
  // The local leg mints nothing: the record goes.
  fleet.write("DELETE FROM stream_relay");
  // Local host: the runtime hidden, the agent again.
  await fleet.stop("agent");
  await agentOn("unix:///nonexistent");
  await localLeg(kit, { fleet, page, ws });
};

interface Leg {
  fleet: KitFleet;
  page: Page;
  /** The hub's origin as a WebSocket URL's. */
  ws: string;
}

/** The hub's relay record for this spec's coturn, under a machine that never connects. */
const writeRelay = async (
  fleet: KitFleet,
  address: string,
  secret: string
): Promise<void> => {
  const { makeSecretBox } =
    await import("../../../packages/hub/src/secret-box");
  const db = new Database(join(fleet.sandbox, "hub", "hub.db"));
  try {
    db.exec("PRAGMA busy_timeout = 15000");
    // The record names a machine that is not in the fleet.
    db.exec("PRAGMA foreign_keys = OFF");
    db.query(
      "INSERT INTO stream_relay (id, machine_id, address, hostname, external_ip, secret, wanted, state, health, created_at) VALUES ('relay', ?, ?, NULL, NULL, ?, 1, 'stopped', '[]', ?)"
    ).run(
      RELAY_MACHINE,
      address,
      makeSecretBox(join(fleet.sandbox, "hub", "secrets.key")).seal(secret),
      Date.now()
    );
  } finally {
    db.close();
  }
};

/** The count the daemon is told, as one view opens and closes. */
const countLeg = async (
  kit: Kit,
  { fleet, page }: Leg,
  key: BrowserKey,
  url: string
): Promise<void> => {
  const openLine = `${key}: the hub counts 1 view`;
  const closeLine = `${key}: the hub counts 0 views`;
  const openedBefore = await said(fleet, openLine);
  await page.evaluate((at: string) => {
    const socket = new WebSocket(at);
    (window as unknown as { probeView: WebSocket }).probeView = socket;
    return new Promise<void>((opened) => {
      socket.onmessage = () => opened();
    });
  }, url);
  const one = await saidAgain(fleet, openLine, openedBefore);
  const closedBefore = await said(fleet, closeLine);
  await page.evaluate(() =>
    (window as unknown as { probeView: WebSocket }).probeView.close()
  );
  const none = await saidAgain(fleet, closeLine, closedBefore);
  kit.check(
    `viewers counted: open → browser.viewers ${one ? 1 : "?"}, close → ${none ? 0 : "?"}`,
    one && none
  );
};

/** Container host: neko's REST and signaling through the hub, the viewer's credential, both pairs, the count. */
const containerLeg = async (
  kit: Kit,
  leg: Leg & {
    address: string;
    docker: Runtime["docker"];
    secret: string;
    standIn: number;
    /** The fleet's STUN server, as the hub and the agent are told it. */
    stun: string;
    where: string;
  }
): Promise<void> => {
  const { fleet, page, ws, address, secret, standIn, stun } = leg;
  // Container host. The browser starts before the relay record is written:
  // neko is given no relay of its own, so nothing of it reaches 443.
  const boxed = await sessionIn(fleet, "stream-container");
  const artifact = await browserOf(fleet, boxed.key, boxed.instance);
  if (!(
    kit.check(
      `container: ${boxed.key} live, the session's browser artifact ${artifact ?? "missing"}`,
      !!artifact
    ) && artifact
  )) {
    return;
  }
  await nekoIce(kit, leg.docker, boxed.key, stun);
  await writeRelay(fleet, address, secret);
  const base = `/ws/browser/${boxed.instance}/${artifact}`;

  // As neko's client asks: its own token as its Bearer, which the hub's gate
  // reads as no credential here and the hub swaps for the viewer's session.
  const whoami = await fetch(`${fleet.base}${base}/api/whoami`, {
    headers: { Authorization: "Bearer not-a-neko-token" },
  });
  const who = (await whoami.json().catch(() => ({}))) as {
    id?: string;
    profile?: { is_admin?: boolean };
  };
  kit.check(
    `GET ${base}/api/whoami through the hub → neko session ${who.id} (token swapped)`,
    whoami.status === 200 &&
      !!who.id?.startsWith("viewer-") &&
      who.profile?.is_admin === false,
    JSON.stringify({ status: whoami.status, who })
  );

  const { turnCredential } =
    await import("../../../packages/hub/src/stream-relay");
  const direct = await page.evaluate(view, {
    url: `${ws}${base}/api/ws?token=not-a-neko-token`,
    policy: "all" as const,
    from: STREAM_RELAY_PORT,
    to: standIn,
  });
  const [server, stunEntry] = direct.iceservers ?? [];
  const username = server?.username ?? "";
  const [expiry, kind, session] = username.split(":");
  const lasts = Number(expiry) - Math.floor(Date.now() / 1000);
  kit.check(
    `signal/provide relayed with iceservers=${JSON.stringify(direct.iceservers)}`,
    direct.iceservers?.length === 2 &&
      JSON.stringify(stunEntry) === JSON.stringify({ urls: [stun] }) &&
      server?.urls.join(" ") ===
        `turn:${address}:${STREAM_RELAY_PORT}?transport=udp turn:${address}:${STREAM_RELAY_PORT}?transport=tcp` &&
      kind === "viewer" &&
      !!session &&
      session === direct.session &&
      Math.abs(lasts - VIEWER_TTL_S) < 120 &&
      server.credential === turnCredential(secret, username),
    JSON.stringify(direct)
  );
  await allocates(kit, leg, username, server?.credential ?? "");
  // Direct on the LAN, no relay: the local candidate carries no
  // `relayProtocol` ("only present for local relay candidates",
  // webrtc-stats; libwebrtc sets it on a prflx made from a relay candidate
  // too), and the remote is neko's host candidate on this machine's
  // address. The local side may read `prflx`: libwebrtc makes one of the
  // local candidate whenever the peer's mapped address in its binding
  // response matches no local candidate (p2p/base/connection.cc
  // `MaybeUpdateLocalCandidate`), as the runtime's port forwarding into
  // neko's container rewrites the viewer's source.
  kit.check(
    `a headless Chromium viewer connects; getStats() selected pair ${direct.pair?.local.type}/${direct.pair?.remote.type} on the LAN, no relay (local relayProtocol ${direct.pair?.local.relayProtocol ?? "absent"} → remote ${direct.pair?.remote.type} ${direct.pair?.remote.address})`,
    !!direct.pair &&
      direct.pair.local.relayProtocol === undefined &&
      direct.pair.remote.type === "host" &&
      direct.pair.remote.address === address,
    JSON.stringify(direct)
  );
  await relayPair(kit, leg, `${ws}${base}/api/ws`);

  await countLeg(kit, leg, boxed.key, `${ws}${base}/api/ws`);
  await post(fleet, `/api/browsers/${encodeURIComponent(boxed.key)}/stop`, {
    machineId: "scratch-fleet",
  });
};

/**
 * neko's own ICE servers as its container was made: the fleet's STUN server
 * alone (the browser started before the relay record, so no relay), none
 * for its viewers, and nothing of Google's, neko's default.
 */
const nekoIce = async (
  kit: Kit,
  docker: Runtime["docker"],
  key: BrowserKey,
  stun: string
): Promise<void> => {
  const { readBrowser } =
    await import("../../../packages/agent/src/browser/state");
  const made = (await readBrowser(key))?.container;
  const env = made
    ? ((await docker.getContainer(made.id).inspect()).Config.Env ?? [])
    : [];
  const named = (name: string) =>
    env.find((one) => one.startsWith(`${name}=`))?.slice(name.length + 1);
  const backend = named("NEKO_WEBRTC_ICESERVERS_BACKEND");
  const frontend = named("NEKO_WEBRTC_ICESERVERS_FRONTEND");
  kit.check(
    `neko's own ICE servers: backend ${backend}, frontend ${frontend}, the record's STUN server ${made?.stun}; no Google server in its env`,
    backend === JSON.stringify([{ urls: [stun] }]) &&
      frontend === "[]" &&
      made?.stun === stun &&
      !env.some((one) => one.includes("google")),
    JSON.stringify(env.filter((one) => one.startsWith("NEKO_WEBRTC")))
  );
};

/** Where this spec's coturn is, as a leg reads it. */
interface Relayed {
  address: string;
  standIn: number;
  where: string;
}

/** The viewer's credential allocates on this spec's coturn. */
const allocates = async (
  kit: Kit,
  { address, standIn, where }: Relayed,
  username: string,
  credential: string
): Promise<void> => {
  const allocated = await turn(`turn:${address}:${standIn}?transport=udp`, {
    username,
    credential,
  });
  kit.check(
    `the minted credential allocates on coturn (relayed ${allocated.relayed ?? `nothing: ${allocated.error ?? allocated.allocateCode}`})${where}`,
    allocated.allocated,
    JSON.stringify(allocated)
  );
};

/** The viewer connected through this spec's coturn alone. */
const relayPair = async (
  kit: Kit,
  { page, address, standIn, where }: Leg & Relayed,
  url: string
): Promise<void> => {
  const relayed = await page.evaluate(view, {
    url,
    policy: "relay" as const,
    from: STREAM_RELAY_PORT,
    to: standIn,
  });
  // Through this spec's coturn over UDP: the local candidate's
  // `relayProtocol` is "udp" and its `url` this coturn's. libwebrtc reports
  // both for a relay candidate and for a prflx it made of one
  // (pc/rtc_stats_collector.cc: `candidate.is_relay() ||
  // (candidate.is_prflx() && !relay_protocol.empty())`), the type it reads
  // when neko's mapped address for the relayed one matches none it knows.
  const turnUrl = `turn:${address}:${standIn}?transport=udp`;
  kit.check(
    `the same viewer with iceTransportPolicy relay: selected pair ${relayed.pair?.local.type} relayProtocol ${relayed.pair?.local.relayProtocol} via ${relayed.pair?.local.url}${where}`,
    (relayed.pair?.local.type === "relay" ||
      relayed.pair?.local.type === "prflx") &&
      relayed.pair.local.relayProtocol === "udp" &&
      relayed.pair.local.url === turnUrl,
    JSON.stringify(relayed)
  );
};

/** Local host: the take-over view through the hub, its frames and a tap. */
const localLeg = async (kit: Kit, { fleet, page, ws }: Leg): Promise<void> => {
  const local = await sessionIn(fleet, "stream-local");
  const localArtifact = await browserOf(fleet, local.key, local.instance);
  const { readBrowser, portsOf } =
    await import("../../../packages/agent/src/browser/state");
  const { CdpLink } =
    await import("../../../packages/agent/src/browser/cdp-takeover");
  const record = await readBrowser(local.key);
  if (!(
    kit.check(
      `local: ${local.key} on the ${record?.host} host, the session's browser artifact ${localArtifact ?? "missing"}`,
      record?.host === "local" && !!localArtifact
    ) &&
    record &&
    localArtifact
  )) {
    return;
  }
  // The tap page the browser's only page, so the take-over brings it to the front.
  const link = await CdpLink.open(
    `http://127.0.0.1:${portsOf(record).devtools}`
  );
  try {
    const made = await link.call("Target.createTarget", { url: TAP_PAGE });
    const targetId = made.targetId as string;
    const { targetInfos } = await link.call("Target.getTargets");
    for (const info of (targetInfos ?? []) as {
      targetId: string;
      type: string;
    }[]) {
      if (info.type === "page" && info.targetId !== targetId) {
        // biome-ignore lint/performance/noAwaitInLoops: each page closed in turn.
        await link.call("Target.closeTarget", { targetId: info.targetId });
      }
    }
    const taken = await post(
      fleet,
      `/api/browsers/${encodeURIComponent(local.key)}/takeover`,
      { instanceId: local.instance, machineId: "scratch-fleet" }
    );
    const read = await page.evaluate(cdpView, {
      url: `${ws}/ws/browser/${local.instance}/${localArtifact}/cdp`,
    });
    const attached = await link.attach(targetId);
    const title = await link.call(
      "Runtime.evaluate",
      { expression: "document.title", returnByValue: true },
      attached
    );
    const [first] = read.frames;
    const tapped = (title.result as { value?: unknown } | undefined)?.value;
    kit.check(
      `local host: /cdp bridge carries frames (header ${first?.width}x${first?.height}, ${read.frames.length} frames) and a tap (the page's title reads "${String(tapped)}")`,
      taken.status === 200 &&
        first?.width === 1280 &&
        first.height === 800 &&
        (first.bytes ?? 0) > 0 &&
        tapped === "tapped",
      JSON.stringify({ taken, read, title })
    );
  } finally {
    link.close();
    await post(
      fleet,
      `/api/browsers/${encodeURIComponent(local.key)}/handback`,
      { machineId: "scratch-fleet" }
    );
    await post(fleet, `/api/browsers/${encodeURIComponent(local.key)}/stop`, {
      machineId: "scratch-fleet",
    });
  }
};

const spec: Spec = {
  name: "browser-stream",
  host: "it runs the project's browser and a coturn of its own, whose runtime socket and ports no workspace boundary reaches",
  run,
};

export default spec;
