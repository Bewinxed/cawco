/**
 * The hub's part of a browser's stream (Projects spec §5.11, build item 4)
 * and the stream relay's relay-to-relay path: a viewer reaches neko's REST
 * and signaling, and the local host's take-over view, on the hub's own origin
 * (hub browser-routes.ts), through the machine's browser listener (agent
 * preview.ts `listenBrowsers`).
 *
 * On a scratch fleet (real hub, agent and sessiond), with a headless
 * Chromium (playwright-core) as the viewer on a page of the hub's origin:
 *
 * - container host: `GET /ws/browser/<i>/<a>/api/whoami` through the hub,
 *   sent with a token neko never made, answers a viewer session of neko's
 *   (the hub swapped its own in);
 * - 6 · neko's own ICE servers are exactly what agent relay-urls.ts composes
 *   for this machine (on the relay's machine `turn:<coturn's media
 *   address>:443?transport=udp` alone), with the credential minted for
 *   `browser:<key>`, then the fleet's STUN server, nothing of Google's; and
 *   coturn's log shows neko's allocation from its slot's address (.10 + s)
 *   on the media network;
 * - the viewer's `signal/provide` carries `iceservers` the hub minted for
 *   it: the relay's URLs, `<expiry>:viewer:<neko session>` good for 12 h,
 *   and the credential HMAC-SHA1 of that under the relay's secret; then the
 *   fleet's STUN server, alone; that credential allocates on coturn;
 * - 7 · the viewer connects; its selected pair is host/host on the LAN;
 * - 8 · the same viewer with `iceTransportPolicy: "relay"` connects relay to
 *   relay inside the one coturn: getStats' selected pair local relay, remote
 *   relay, both addresses P. Failed, it prints what decides the hop: the
 *   viewer's getStats() (its candidates, neko's, every pair with its checks
 *   each way), coturn's lines for its sessions (`--verbose`) and neko's ICE
 *   lines, and names the hop in the failure line;
 * - 9 · another fleet machine's browser, stood up by this spec: a neko of the
 *   same image on a bridge network of its own (not the media network), given
 *   the URL list relay-urls.ts composes for another machine (the relay's LAN
 *   URL first, then its public ones), each reaching this machine through the
 *   runtime's host-gateway and the published listener, reached by a
 *   relay-only viewer straight on its own signaling: the selected pair relay
 *   to relay, both addresses P;
 * - the daemon is told the view count as a socket opens (1) and closes (0);
 * - local host (`DOCKER_HOST=unix:///nonexistent`): the `/cdp` view of a
 *   take-over carries frames whose header reads 1280x800, and a tap sent up
 *   it lands on the page.
 *
 * The relay is this spec's own coturn, made as the agent makes the relay
 * (agent relay.ts): its image and arguments, a secret made here, on the
 * runtime's media network at the relay's own address (.2), its listener (443
 * inside) published on a stand-in port picked as browser-relay.ts picks one.
 * So it runs only where this runtime has no relay (no `cawco-relay`). The hub
 * is given a relay record for it under this fleet's own machine, with this
 * machine's LAN address as P and its reach, state `stopped`: the hub mints
 * from it and never starts, stops or probes it. The record's URLs name 443,
 * so a viewer's page points them at the stand-in before its peer connection
 * reads them. The fleet's STUN server is a stand-in (relay-journey.ts
 * `stunStandIn`) on every address of this machine, answering its LAN address,
 * named to the hub and the agent by `CAWCO_STUN_SERVER`. No real relay,
 * router, DNS name, STUN server or Cloudflare is touched.
 *
 * With `--relay-address <R> --relay-secret <S>` the relay is another fleet
 * machine's instead: browser-relay run there with `--address <R> --secret <S>
 * --hold <s>`. Then this spec starts no coturn, the record names a machine
 * that is not this one (P = R, its LAN reach R), this machine's browser is
 * given the other-machine URL list by the agent itself, and legs 6–8 run
 * against that relay on 443 (6 without coturn's log, which stays there); leg
 * 9's stand-in is not run.
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket and the browser's ports):
 *
 *   bun scripts/probe-kit/run.ts browser-stream [--address <this machine's LAN address>] [--relay-address <R> --relay-secret <S>]
 */
import { Database } from "bun:sqlite";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Page } from "playwright-core";
import type { Runtime } from "../../../packages/agent/src/browser/runtime";
import type {
  BrowserKey,
  BrowserRelay,
} from "../../../packages/core/src/browser";
import {
  STREAM_RELAY_PORT,
  STREAM_RELAY_PORTS,
  streamRelayUrls,
} from "../../../packages/core/src/stream-relay";
import { type LogMark, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import {
  freeStandIn,
  type MadeHere,
  madeOn,
  startProbeCoturn,
  turn,
} from "./browser-relay";
import { stunStandIn } from "./relay-journey";

/** This spec's coturn: never the relay's own `cawco-relay`. */
const COTURN = "cawco-relay-stream-probe";
/** The machine the hub's record names in `--relay-address` mode: none of this fleet's. */
const OTHER_RELAY_MACHINE = "browser-stream-relay";
/** Leg 9's stand-in for another fleet machine: its bridge network and its neko. */
const OTHER_NETWORK = "cawco-stream-probe-other";
const OTHER_NEKO = "cawco-stream-probe-neko";
/** The neko's media port inside its container: never published. */
const OTHER_MEDIA_PORT = 52_000;
/** The rootless Podman that resolves host-gateway through pasta's --map-guest-addr. */
const PODMAN_MAP_GUEST = [5, 3] as const;

/** Whether a version `major.minor…` is older than `[major, minor]`. */
const olderThan = (
  version: string,
  [major, minor]: readonly [number, number]
): boolean => {
  const [have = 0, haveMinor = 0] = version.split(".").map(Number);
  return have < major || (have === major && haveMinor < minor);
};

/** The name leg 9's neko reaches this machine by: the runtime's host-gateway. */
const HOST_ALIAS = "cawco-relay-host";
/** The host part of a `stun:<address>:` URL. */
const STUN_HOST = /^stun:[^:]+:/;
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

/** A failed view's ICE as the viewer had it when it gave up: its getStats() and the events before. */
interface IceEvidence {
  /** Each `type address:port protocol` (a relay one with its TURN URL), the viewer's own and neko's. */
  candidates: { local: string[]; remote: string[] };
  /** `icecandidateerror` events: a TURN server's refusal of the allocation. */
  errors: string[];
  /** Every candidate pair: its state, and the checks each way with their answers. */
  pairs: {
    local: string;
    nominated: boolean;
    /** Checks neko sent the viewer, and the viewer's answers to them. */
    received: number;
    receivedAnswered: number;
    remote: string;
    /** Checks the viewer sent, and neko's answers to them. */
    sent: number;
    sentAnswered: number;
    state: string;
  }[];
  /** The ICE and connection states, in the order they came. */
  states: string[];
  transport?: { dtls?: string; ice?: string };
}

/** What a view read: neko's words, the offer's ICE servers, and the pair it connected on. */
interface ViewRead {
  closed?: string;
  error?: string;
  /** Read when the view failed. */
  ice?: IceEvidence;
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
    const states: string[] = [];
    const errors: string[] = [];
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: serialised into the page with its view, so it calls nothing outside it.
    const evidenceOf = async (peer: RTCPeerConnection) => {
      const stats = await peer.getStats();
      const named = new Map<string, string>();
      const evidence: IceEvidence = {
        candidates: { local: [], remote: [] },
        pairs: [],
        states,
        errors,
      };
      for (const one of stats.values()) {
        if (one.type === "local-candidate" || one.type === "remote-candidate") {
          const said = `${one.candidateType} ${one.address || "?"}:${one.port} ${one.protocol}${one.url ? ` from ${one.url}` : ""}`;
          named.set(one.id, said);
          evidence.candidates[
            one.type === "local-candidate" ? "local" : "remote"
          ].push(said);
        } else if (one.type === "transport") {
          evidence.transport = { ice: one.iceState, dtls: one.dtlsState };
        }
      }
      for (const one of stats.values()) {
        if (one.type === "candidate-pair") {
          evidence.pairs.push({
            local: named.get(one.localCandidateId) ?? one.localCandidateId,
            remote: named.get(one.remoteCandidateId) ?? one.remoteCandidateId,
            state: one.state,
            nominated: !!one.nominated,
            sent: one.requestsSent ?? 0,
            sentAnswered: one.responsesReceived ?? 0,
            received: one.requestsReceived ?? 0,
            receivedAnswered: one.responsesSent ?? 0,
          });
        }
      }
      return evidence;
    };
    const timer = setTimeout(async () => {
      if (pc) {
        read.ice = await evidenceOf(pc).catch(() => undefined);
      }
      done(`not connected within 45 s (${pc?.connectionState ?? "no peer"})`);
    }, 45_000);
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
        peer.oniceconnectionstatechange = () =>
          states.push(`ice ${peer.iceConnectionState}`);
        peer.onicecandidateerror = (refused) =>
          errors.push(
            `${refused.url}: ${refused.errorCode} ${refused.errorText}`
          );
        peer.onconnectionstatechange = async () => {
          states.push(`connection ${peer.connectionState}`);
          if (peer.connectionState === "connected") {
            read.pair = await selected(peer);
            clearTimeout(timer);
            done();
          } else if (peer.connectionState === "failed") {
            clearTimeout(timer);
            read.ice = await evidenceOf(peer).catch(() => undefined);
            done(`connection failed (ice ${peer.iceConnectionState})`);
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

/** The agent's logs say `line` since `before` ({@link LogMark}). */
const saidAgain = (line: string, before: LogMark) =>
  until(
    `the agent's log says "${line}" again`,
    () => before.since(),
    (since) => since.includes(line),
    30_000
  ).then(
    () => true,
    () => false
  );

/** Where the relay is, as every leg reads it. */
interface RelayAt {
  /** P: the address every allocation is reported at, the record's address. */
  address: string;
  /** This spec's coturn; absent when the relay is another machine's. */
  coturn?: Container;
  /** The machine the record names: this fleet's own, or another's. */
  machineId: string;
  /** coturn's address on the media network, on this machine's runtime. */
  media: string;
  /** The listener's port as a viewer reaches it: a stand-in, or 443. */
  port: number;
  /** The relay's machine's LAN addresses, as the record's reach says them. */
  reachLan: string[];
  secret: string;
  where: string;
}

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
  // What this run makes on the runtime, removed however it ends (a stop
  // signal included): its coturn, leg 9's neko and network, the scratch
  // agent's browsers, and the media network when this run makes it.
  const made = madeOn(runtime.docker);
  try {
    await runOn(kit, runtime, made, realHome);
  } finally {
    await made.end();
  }
};

/** Every leg on `runtime`, each thing it makes there recorded in `made`. */
const runOn = async (
  kit: Kit,
  runtime: Runtime,
  made: MadeHere,
  realHome: string
): Promise<void> => {
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
  const media =
    await import("../../../packages/agent/src/browser/media-network");
  await made.network(media.MEDIA_NETWORK);
  await made.network(OTHER_NETWORK);
  made.container(COTURN);
  made.container(OTHER_NEKO);
  const network = await media.ensureMediaNetwork(runtime.docker);
  const here: Here = {
    address,
    made,
    network: network.name,
    realHome,
    relayMedia: media.relayMediaAddress(network),
    runtime,
  };
  const otherAddress = flag("relay-address");
  const otherSecret = flag("relay-secret");
  if (!(otherAddress || otherSecret)) {
    await ownCoturnRun(kit, here);
    return;
  }
  if (
    kit.check(
      `--relay-address and --relay-secret given together: ${otherAddress ?? "no address"}`,
      !!(otherAddress && otherSecret)
    ) &&
    otherAddress &&
    otherSecret
  ) {
    await legs(kit, {
      realHome,
      runtime,
      lan: address,
      made,
      relay: {
        address: otherAddress,
        machineId: OTHER_RELAY_MACHINE,
        media: here.relayMedia,
        port: STREAM_RELAY_PORT,
        reachLan: [otherAddress],
        secret: otherSecret,
        where: ` (the relay on another fleet machine at ${otherAddress})`,
      },
    });
  }
};

/** This machine as the run found it: its LAN address, its runtime and media network, coturn's seat there. */
interface Here {
  address: string;
  made: MadeHere;
  network: string;
  realHome: string;
  relayMedia: string;
  runtime: Runtime;
}

/** Every leg against this spec's own coturn, at the relay's seat on this runtime. */
const ownCoturnRun = async (kit: Kit, here: Here): Promise<void> => {
  const { address, realHome, relayMedia, runtime } = here;
  const network = { name: here.network };
  const { MACHINE } = await import("../../scratch-fleet");
  const relay = await import("../../../packages/agent/src/browser/relay");
  const held = await runtime.docker
    .getContainer(relay.RELAY_CONTAINER)
    .inspect()
    .then(
      () => true,
      () => false
    );
  if (
    !kit.check(
      `no relay on this runtime (container ${relay.RELAY_CONTAINER} ${held ? "present: its .2 is the one this spec's coturn takes; stop it in Settings › Browsers first" : "absent"})`,
      !held
    )
  ) {
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
  const where = ` (this spec's coturn at ${relayMedia} on ${network.name}, P ${address}, its listener published on ${standIn}, a stand-in for 443${runtime.ownNetwork ? "" : ` through ${runtime.endpoint}`})`;
  const { pullImage } =
    await import("../../../packages/agent/src/browser/image");
  await pullImage(runtime.docker, relay.RELAY_IMAGE, (step) =>
    kit.note(`${relay.RELAY_IMAGE}: ${step.done}/${step.total} layers`)
  );
  const coturn = await startProbeCoturn(runtime.docker, {
    name: COTURN,
    args: {
      secret,
      address,
      relayRange: STREAM_RELAY_PORTS.relayRange,
    },
    certified: false,
    seat: { media: relayMedia, otherPublic: [] },
    network: network.name,
    port: standIn,
    // Each request's answer, each permission, and each session's peer
    // traffic at its end ("peer usage"), read when a relay-only leg fails.
    extra: ["--verbose"],
  });
  try {
    if (
      !kit.check(
        `coturn answers on udp ${standIn}: ${coturn.bound}${where}`,
        coturn.bound.startsWith("up")
      )
    ) {
      return;
    }
    await legs(kit, {
      realHome,
      runtime,
      lan: address,
      made: here.made,
      relay: {
        address,
        coturn: coturn.container,
        machineId: MACHINE,
        media: relayMedia,
        port: standIn,
        reachLan: [address],
        secret,
        where,
      },
    });
  } finally {
    await coturn.container.remove({ force: true }).catch(() => undefined);
  }
};

/** A container on the runtime. */
type Container = ReturnType<Runtime["docker"]["getContainer"]>;

interface At {
  /** This machine's LAN address. */
  lan: string;
  /** What the run makes on the runtime, removed however it ends. */
  made: MadeHere;
  realHome: string;
  relay: RelayAt;
  runtime: Runtime;
}

/** Every leg, with the fleet's STUN server this spec's stand-in on every address, answering this machine's LAN one. */
const legs = async (kit: Kit, at: At): Promise<void> => {
  const stun = await stunStandIn(at.lan, "0.0.0.0");
  try {
    await legsWith(kit, at, `stun:${at.lan}:${stun.port}`);
  } finally {
    stun.socket.close();
  }
};

const legsWith = async (kit: Kit, at: At, stun: string): Promise<void> => {
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
  await agentOn(`unix://${at.runtime.endpoint}`);
  await fleet.accountSignedIn();
  process.env.XDG_DATA_HOME = fleet.env.XDG_DATA_HOME as string;
  // The scratch agent's browsers (its owner, read where it keeps it) go
  // before the media network they stand on.
  const { browserOwner } =
    await import("../../../packages/agent/src/browser/state");
  at.made.owner(await browserOwner());
  const ws = fleet.base.replace(HTTP_SCHEME, "ws");
  const page = await kit.page("desk");
  await page.goto(`${fleet.base}/health`);

  const leg: ContainerLegAt = {
    fleet,
    page,
    ws,
    docker: at.runtime.docker,
    relay: at.relay,
    runtime: at.runtime,
    stun,
  };
  const image = await containerLeg(kit, leg);
  if (image && at.relay.coturn) {
    await otherMachineLeg(kit, leg, image);
  }
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

interface ContainerLegAt extends Leg {
  docker: Runtime["docker"];
  relay: RelayAt;
  /** The runtime, by kind and version: leg 9 names what it needs of it. */
  runtime: Runtime;
  /** The fleet's STUN server, as the hub and the agent are told it. */
  stun: string;
}

/** The hub's relay record for the relay, under the machine it names, with its reach; state `stopped`, so the hub never starts nor probes it. */
const writeRelay = async (fleet: KitFleet, relay: RelayAt): Promise<void> => {
  const { makeSecretBox } =
    await import("../../../packages/hub/src/secret-box");
  const db = new Database(join(fleet.sandbox, "hub", "hub.db"));
  try {
    db.exec("PRAGMA busy_timeout = 15000");
    // The record may name a machine that is not in the fleet.
    db.exec("PRAGMA foreign_keys = OFF");
    db.query(
      "INSERT INTO stream_relay (id, machine_id, address, hostname, secret, wanted, state, health, reach, created_at) VALUES ('relay', ?, ?, NULL, ?, 1, 'stopped', '[]', ?, ?)"
    ).run(
      relay.machineId,
      relay.address,
      makeSecretBox(join(fleet.sandbox, "hub", "secrets.key")).seal(
        relay.secret
      ),
      JSON.stringify({ lan: relay.reachLan, tailnet: [] }),
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
  const openedBefore = await fleet.logMark("agent");
  await page.evaluate((at: string) => {
    const socket = new WebSocket(at);
    (window as unknown as { probeView: WebSocket }).probeView = socket;
    return new Promise<void>((opened) => {
      socket.onmessage = () => opened();
    });
  }, url);
  const one = await saidAgain(openLine, openedBefore);
  const closedBefore = await fleet.logMark("agent");
  await page.evaluate(() =>
    (window as unknown as { probeView: WebSocket }).probeView.close()
  );
  const none = await saidAgain(closeLine, closedBefore);
  kit.check(
    `viewers counted: open → browser.viewers ${one ? 1 : "?"}, close → ${none ? 0 : "?"}`,
    one && none
  );
};

/**
 * Container host: the relay record first, so neko is given the relay; its
 * ICE servers as relay-urls.ts composes them; neko's REST and signaling
 * through the hub; the viewer's credential; the direct pair and the
 * relay-to-relay pair; coturn's view of neko's allocation; the count. Answers
 * the browser's image, for leg 9's neko.
 */
const containerLeg = async (
  kit: Kit,
  leg: ContainerLegAt
): Promise<string | undefined> => {
  const { fleet, page, ws, relay, stun } = leg;
  await writeRelay(fleet, relay);
  const since = Math.floor(Date.now() / 1000) - 1;
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
  const { readBrowser } =
    await import("../../../packages/agent/src/browser/state");
  const made = (await readBrowser(boxed.key))?.container;
  await nekoIce(kit, leg, boxed.key);
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
    to: relay.port,
  });
  const [server, stunEntry] = direct.iceservers ?? [];
  const username = server?.username ?? "";
  const [expiry, kind, session] = username.split(":");
  const lasts = Number(expiry) - Math.floor(Date.now() / 1000);
  kit.check(
    `signal/provide relayed with iceservers=${JSON.stringify(direct.iceservers)}`,
    direct.iceservers?.length === 2 &&
      JSON.stringify(stunEntry) === JSON.stringify({ urls: [stun] }) &&
      server?.urls.join(" ") === streamRelayUrls(relay.address).join(" ") &&
      kind === "viewer" &&
      !!session &&
      session === direct.session &&
      Math.abs(lasts - VIEWER_TTL_S) < 120 &&
      server.credential === turnCredential(relay.secret, username),
    JSON.stringify(direct)
  );
  await allocates(kit, relay, username, server?.credential ?? "");
  // Direct on the LAN, no relay: the local candidate carries no
  // `relayProtocol` ("only present for local relay candidates",
  // webrtc-stats; libwebrtc sets it on a prflx made from a relay candidate
  // too), and the remote is neko's host candidate on this machine's
  // address. The local side may read `prflx`: libwebrtc makes one of the
  // local candidate whenever the peer's mapped address in its binding
  // response matches no local candidate (p2p/base/connection.cc
  // `MaybeUpdateLocalCandidate`), as the runtime's port forwarding into
  // neko's container rewrites the viewer's source.
  const lanAddresses = await lanOf();
  kit.check(
    `7 · a headless Chromium viewer connects; getStats() selected pair ${direct.pair?.local.type}/${direct.pair?.remote.type} on the LAN, no relay (local relayProtocol ${direct.pair?.local.relayProtocol ?? "absent"} → remote ${direct.pair?.remote.type} ${direct.pair?.remote.address})`,
    !!direct.pair &&
      direct.pair.local.relayProtocol === undefined &&
      direct.pair.remote.type === "host" &&
      lanAddresses.includes(direct.pair.remote.address ?? ""),
    JSON.stringify(direct)
  );
  const relayed = await page.evaluate(view, {
    url: `${ws}${base}/api/ws`,
    policy: "relay" as const,
    from: STREAM_RELAY_PORT,
    to: relay.port,
  });
  await relayPair(kit, leg, {
    label: `8 · a relay-only viewer of this machine's browser${relay.coturn ? ", on the relay's machine" : ", the relay on another fleet machine"}`,
    relayed,
    since,
    neko: made?.id,
  });
  if (relay.coturn && made?.address) {
    // neko allocates as its peer connection gathers: by now, once.
    const lines = await coturnLines(relay.coturn, since);
    const from = lines.filter((line) => line.includes(`${made.address}:`));
    kit.check(
      `6 · coturn's log shows neko's allocation from its slot's address ${made.address} on the media network: ${
        from
          .slice(0, 2)
          .map((line) => line.trim())
          .join(" | ") || "no line"
      }${relay.where}`,
      from.length > 0,
      lines.slice(-30).join("\n")
    );
  }

  await countLeg(kit, leg, boxed.key, `${ws}${base}/api/ws`);
  await post(fleet, `/api/browsers/${encodeURIComponent(boxed.key)}/stop`, {
    machineId: "scratch-fleet",
  });
  return made?.image;
};

/** This machine's own IPv4 addresses on its LAN and tailnet: where neko's host candidates are advertised. */
const lanOf = async (): Promise<string[]> => {
  const { machineAddresses } =
    await import("../../../packages/agent/src/browser/media-forwarding");
  return (await machineAddresses()).filter((one) => !one.includes(":"));
};

/** coturn's lines since `since` (s epoch). */
const coturnLines = async (
  coturn: Container,
  since: number
): Promise<string[]> => {
  const { logsOf } = await import("../../../packages/agent/src/browser/relay");
  return (await logsOf(coturn, { since }).catch(() => "")).split("\n");
};

/**
 * 6 · neko's own ICE servers as its container was made: the relay at the
 * URLs agent relay-urls.ts composes for this machine, with the credential the
 * hub minted for `browser:<key>`; then the fleet's STUN server; none for its
 * viewers, and nothing of Google's, neko's default.
 */
const nekoIce = async (
  kit: Kit,
  { docker, relay, stun }: ContainerLegAt,
  key: BrowserKey
): Promise<void> => {
  const { readBrowser } =
    await import("../../../packages/agent/src/browser/state");
  const { relayUrlsFor } =
    await import("../../../packages/agent/src/browser/relay-urls");
  const { turnCredential } =
    await import("../../../packages/hub/src/stream-relay");
  const { MACHINE } = await import("../../scratch-fleet");
  const made = (await readBrowser(key))?.container;
  const env = made
    ? ((await docker.getContainer(made.id).inspect()).Config.Env ?? [])
    : [];
  const named = (name: string) =>
    env.find((one) => one.startsWith(`${name}=`))?.slice(name.length + 1);
  const backend = named("NEKO_WEBRTC_ICESERVERS_BACKEND");
  const frontend = named("NEKO_WEBRTC_ICESERVERS_FRONTEND");
  const [given, stunEntry] = JSON.parse(backend ?? "[]") as BrowserRelay[];
  const expected = relayUrlsFor(
    {
      username: "",
      credential: "",
      urls: streamRelayUrls(relay.address),
      reach: { machineId: relay.machineId, lan: relay.reachLan, tailnet: [] },
    },
    { machineId: MACHINE, relayMedia: relay.media }
  );
  const username = given?.username ?? "";
  kit.check(
    `6 · neko's own ICE servers: backend ${backend}, frontend ${frontend}; relay-urls.ts says ${JSON.stringify(expected)} for this machine; the record's STUN server ${made?.stun}; no Google server in its env`,
    given?.urls.join(" ") === expected.join(" ") &&
      username.split(":").slice(1).join(":") === `browser:${key}` &&
      given.credential === turnCredential(relay.secret, username) &&
      JSON.stringify(stunEntry) === JSON.stringify({ urls: [stun] }) &&
      frontend === "[]" &&
      made?.stun === stun &&
      !env.some((one) => one.includes("google")),
    JSON.stringify(env.filter((one) => one.startsWith("NEKO_WEBRTC")))
  );
};

/** The viewer's credential allocates on the relay, its relayed address P. */
const allocates = async (
  kit: Kit,
  relay: RelayAt,
  username: string,
  credential: string
): Promise<void> => {
  const allocated = await turn(
    `turn:${relay.address}:${relay.port}?transport=udp`,
    { username, credential }
  );
  kit.check(
    `the minted credential allocates on coturn (relayed ${allocated.relayed ?? `nothing: ${allocated.error ?? allocated.allocateCode}`})${relay.where}`,
    allocated.allocated && allocated.relayed?.split(":")[0] === relay.address,
    JSON.stringify(allocated)
  );
};

/** coturn's session ids in `line`: `(session 001000000000000001)`. */
const SESSION = /session (\d+)/g;
/** What this spec reads of neko's log: its ICE, its peer connection, its media path. */
const NEKO_ICE =
  /\bice\b|candidate|pair|connection state|webrtc|dtls|turn|stun/i;
/** How many of each container's lines a failure prints. */
const LINES = 60;

/**
 * coturn's lines since `since` for every session of `username`: its requests
 * and their answers (a refused permission reads `error 403: Forbidden IP`),
 * each permission, and each session's traffic with its client and its peers
 * at its end (`peer usage: … rp=<received> … sp=<sent>`), read once the
 * viewer's close has ended them (Chromium releases its allocation as it
 * closes) or 5 s have passed.
 */
const coturnSaid = async (
  coturn: Container,
  since: number,
  username: string
): Promise<string[]> => {
  const { logsOf } = await import("../../../packages/agent/src/browser/relay");
  const read = async () => {
    const lines = (await logsOf(coturn, { since })).split("\n");
    const sessions = new Set(
      lines
        .filter((line) => line.includes(`<${username}>`))
        .flatMap((line) => [...line.matchAll(SESSION)].map((one) => one[1]))
    );
    return lines.filter(
      (line) =>
        line.includes(username) ||
        [...line.matchAll(SESSION)].some((one) => sessions.has(one[1] ?? ""))
    );
  };
  return await until(
    "coturn reports the viewer's sessions' peer traffic",
    read,
    (lines) => lines.some((line) => line.includes("peer usage")),
    5000
  ).catch(() => read());
};

/** neko's lines since `since` about ICE and its peer connections, or the one viewer `session`. */
const nekoSaid = async (
  docker: Runtime["docker"],
  neko: string | undefined,
  since: number,
  session: string | undefined
): Promise<string[]> => {
  if (!neko) {
    return ["neko's container is not on the browser's record"];
  }
  const { logsOf } = await import("../../../packages/agent/src/browser/relay");
  return (await logsOf(docker.getContainer(neko), { since }))
    .split("\n")
    .filter(
      (line) => (!!session && line.includes(session)) || NEKO_ICE.test(line)
    );
};

/**
 * Which hop a failed relay-only view broke at, read from the viewer's pairs
 * and coturn's answers, in one sentence.
 */
const iceVerdict = (
  ice: IceEvidence | undefined,
  coturn: string[],
  address: string
): string => {
  if (!ice) {
    return "the viewer's getStats() was not read";
  }
  const relayLocal = ice.candidates.local.some((one) =>
    one.startsWith("relay")
  );
  if (!relayLocal) {
    return `the viewer gathered no relay candidate (${ice.errors.join("; ") || "no candidate error"})`;
  }
  const refused = coturn.filter((line) => line.includes("error 403"));
  const granted = coturn.some(
    (line) =>
      line.includes("CREATE_PERMISSION processed, success") ||
      line.includes("CHANNEL_BIND processed, success")
  );
  if (coturn.length > 0 && !granted) {
    return `coturn granted the viewer no permission${refused.length ? `, and refused: ${refused.join(" | ")}` : ""}`;
  }
  const remoteRelay = ice.candidates.remote.filter((one) =>
    one.startsWith("relay")
  );
  if (remoteRelay.length === 0) {
    return "neko gave the viewer no relay candidate: its allocation on the relay never came (its ICE lines say why)";
  }
  const toNeko = ice.pairs.filter((pair) => pair.remote.includes(address));
  const checked = ice.pairs.some((pair) => pair.sent > 0);
  const heard = ice.pairs.some(
    (pair) => pair.sentAnswered > 0 || pair.received > 0
  );
  if (!checked) {
    return "no check left the viewer";
  }
  if (!heard) {
    return `the viewer's checks left through coturn (to ${toNeko.map((pair) => pair.remote).join(", ") || "no candidate of neko's"}) and nothing of neko's came back: coturn's peer usage says whether it sent them on (sp) and heard neko (rp)`;
  }
  const succeeded = ice.pairs.filter((pair) => pair.state === "succeeded");
  if (succeeded.length === 0) {
    return "neko's packets reached the viewer and no pair succeeded both ways";
  }
  return `a pair succeeded (${succeeded.map((pair) => `${pair.local} ↔ ${pair.remote}${pair.nominated ? " nominated" : ""}`).join(", ")}), ice ${ice.transport?.ice}, dtls ${ice.transport?.dtls}`;
};

/**
 * A relay-only view's verdict: its selected pair relay to relay inside the
 * one coturn, both addresses P (a remote `prflx` at P is neko's relayed
 * address met by a check before its candidate). Failed, the evidence printed
 * and the hop it broke at named.
 */
const relayPair = async (
  kit: Kit,
  { docker, relay }: ContainerLegAt,
  shown: { label: string; relayed: ViewRead; since: number; neko?: string }
): Promise<void> => {
  const { relayed } = shown;
  const local = relayed.pair?.local;
  const remote = relayed.pair?.remote;
  const ok =
    (local?.type === "relay" || local?.type === "prflx") &&
    local.relayProtocol === "udp" &&
    local.address === relay.address &&
    (remote?.type === "relay" || remote?.type === "prflx") &&
    remote.address === relay.address;
  const line = `${shown.label}: selected pair ${local?.type} ${local?.address} (relayProtocol ${local?.relayProtocol}, via ${local?.url}) ↔ ${remote?.type} ${remote?.address}; P ${relay.address}`;
  if (ok) {
    kit.check(`${line}${relay.where}`, true, JSON.stringify(relayed));
    return;
  }
  const username = relayed.iceservers?.[0]?.username ?? "";
  const turnLines = relay.coturn
    ? await coturnSaid(relay.coturn, shown.since, username)
    : [];
  const nekoLines = await nekoSaid(
    docker,
    shown.neko,
    shown.since,
    relayed.session
  );
  const { ice } = relayed;
  for (const text of [
    `viewer's states: ${ice?.states.join(" → ") || "none"}`,
    `viewer's candidates: ${ice?.candidates.local.join(", ") || "none"}`,
    `neko's candidates, as the viewer has them: ${ice?.candidates.remote.join(", ") || "none"}`,
    ...(ice?.errors.map((one) => `viewer's candidate error: ${one}`) ?? []),
    ...(ice?.pairs.map(
      (pair) =>
        `pair ${pair.local} ↔ ${pair.remote}: ${pair.state}${pair.nominated ? " nominated" : ""}, the viewer's checks ${pair.sent} (answered ${pair.sentAnswered}), neko's checks ${pair.received} (answered ${pair.receivedAnswered})`
    ) ?? []),
    `viewer's transport: ice ${ice?.transport?.ice}, dtls ${ice?.transport?.dtls}`,
    ...turnLines.slice(-LINES).map((one) => `coturn: ${one.trim()}`),
    ...nekoLines.slice(-LINES).map((one) => `neko: ${one.trim()}`),
  ]) {
    kit.note(`${shown.label}: ${text}`);
  }
  kit.check(
    `${line}; ${relayed.error ?? "no error"}; broke at ${iceVerdict(ice, turnLines, relay.address)}${relay.where}`,
    false,
    JSON.stringify({ ...relayed, coturn: turnLines, neko: nekoLines })
  );
};

/** What a member may do in neko, as the agent's own neko profile says (container-host.ts). */
const PROFILE = {
  name: "",
  can_login: true,
  can_connect: true,
  can_watch: true,
  can_host: true,
  can_share_media: false,
  can_access_clipboard: true,
  sends_inactive_cursor: false,
  can_see_inactive_cursors: false,
};

/**
 * 9 · Another fleet machine's browser, stood up here: a neko of the agent's
 * image on a bridge network of its own, at a fixed address, given the URL
 * list relay-urls.ts composes for a machine that is not the relay's (the
 * relay's LAN URL, then its public ones, each through the published
 * listener's stand-in), and a relay-only viewer on its own signaling. Its
 * allocations reach coturn through the published listener, as another
 * machine's do; the pair must still be relay to relay.
 */
const otherMachineLeg = async (
  kit: Kit,
  leg: ContainerLegAt,
  image: string
): Promise<void> => {
  const { docker, page, relay, runtime, stun } = leg;
  // A rootless Podman resolves host-gateway to the host from 5.3 on, through
  // pasta's --map-guest-addr ("Podman now uses the pasta --map-guest-addr
  // option by default which is used for the host.containers.internal entry
  // to allow the container to reach the host by default", podman #23791);
  // before it, a container reaches its host's own address not at all ("Since
  // pasta copies the IP address of the main interface, connections to that
  // IP from containers do not work", podman rootless.md).
  if (
    runtime.kind === "podman" &&
    runtime.rootless &&
    olderThan(runtime.version, PODMAN_MAP_GUEST)
  ) {
    kit.check(
      `9 · the stand-in for another machine reaches this one through host-gateway, which a rootless Podman gives from ${PODMAN_MAP_GUEST.join(".")} on (with passt from 2024-08-14): this runtime is Podman ${runtime.version}`,
      false
    );
    return;
  }
  const media =
    await import("../../../packages/agent/src/browser/media-network");
  const { relayUrlsFor } =
    await import("../../../packages/agent/src/browser/relay-urls");
  const { mintCredential } =
    await import("../../../packages/hub/src/stream-relay");
  const network = await media.ensureMediaNetwork(docker, OTHER_NETWORK);
  const address = media.slotAddress(network, 0);
  const http = await freeStandIn();
  if (http === undefined) {
    kit.check("9 · a free port for the stand-in neko's HTTP", false);
    return;
  }
  const record = {
    secret: relay.secret,
    address: relay.address,
    hostname: null,
    machineId: relay.machineId,
    reach: { lan: relay.reachLan, tailnet: [] },
  };
  const browser = mintCredential(record, "browser:other-machine", 60 * 60_000);
  const viewer = mintCredential(
    { ...record, machineId: undefined },
    "viewer:other-machine",
    60 * 60_000
  );
  const composed = relayUrlsFor(browser, {
    machineId: "another-fleet-machine",
    relayMedia: relay.media,
  });
  // The relay's machine is this one, so the stand-in neko names this
  // machine's address the way a container reaches its own host: through the
  // runtime's host-gateway ("This resolves to an IP address the container
  // can use to connect to the host", podman-run(1) --add-host), not the
  // LAN address itself, which a rootless Podman's pasta copies into the
  // container ("IPv4 and IPv6 addresses and routes ... are copied from the
  // host"). Each URL still comes in through the published listener, 443
  // read as its stand-in. Another fleet machine names the LAN address as
  // composed; this leg checks that order below.
  // Each once, as relay-urls.ts gives them: the LAN and the public URL name
  // the same host here once both read as the alias.
  const urls = [
    ...new Set(
      composed.map((url) =>
        url
          .replace(`:${STREAM_RELAY_PORT}?`, `:${relay.port}?`)
          .replace(`turn:${relay.reachLan[0]}:`, `turn:${HOST_ALIAS}:`)
          .replace(`turn:${relay.address}:`, `turn:${HOST_ALIAS}:`)
      )
    ),
  ];
  const nekoStun = stun.replace(STUN_HOST, `stun:${HOST_ALIAS}:`);
  const passwords = {
    admin: randomBytes(18).toString("base64url"),
    user: randomBytes(18).toString("base64url"),
  };
  const placed = media.onMediaNetwork(network.name, address);
  await docker
    .getContainer(OTHER_NEKO)
    .remove({ force: true })
    .catch(() => undefined);
  const since = Math.floor(Date.now() / 1000) - 1;
  const neko = await docker.createContainer({
    name: OTHER_NEKO,
    Image: image,
    Env: [
      "NEKO_DESKTOP_SCREEN=1280x800@30",
      "NEKO_SERVER_BIND=0.0.0.0:8080",
      "NEKO_MEMBER_PROVIDER=multiuser",
      `NEKO_MEMBER_MULTIUSER_ADMIN_PASSWORD=${passwords.admin}`,
      `NEKO_MEMBER_MULTIUSER_USER_PASSWORD=${passwords.user}`,
      `NEKO_MEMBER_MULTIUSER_ADMIN_PROFILE=${JSON.stringify({ ...PROFILE, is_admin: true })}`,
      `NEKO_MEMBER_MULTIUSER_USER_PROFILE=${JSON.stringify({ ...PROFILE, is_admin: false })}`,
      "NEKO_SESSION_IMPLICIT_HOSTING=false",
      "NEKO_SESSION_COOKIE_ENABLED=false",
      "NEKO_CAPTURE_VIDEO_CODEC=vp8",
      "NEKO_WEBRTC_ICELITE=false",
      `NEKO_WEBRTC_UDPMUX=${OTHER_MEDIA_PORT}`,
      `NEKO_WEBRTC_TCPMUX=${OTHER_MEDIA_PORT}`,
      `NEKO_WEBRTC_NAT1TO1=${address}`,
      `NEKO_WEBRTC_ICESERVERS_BACKEND=${JSON.stringify([
        { urls, username: browser.username, credential: browser.credential },
        { urls: [nekoStun] },
      ])}`,
      `NEKO_WEBRTC_ICESERVERS_FRONTEND=${JSON.stringify([
        {
          urls: viewer.urls,
          username: viewer.username,
          credential: viewer.credential,
        },
      ])}`,
    ],
    ExposedPorts: { "8080/tcp": {} },
    NetworkingConfig: placed.NetworkingConfig,
    HostConfig: {
      NetworkMode: placed.NetworkMode,
      ExtraHosts: [`${HOST_ALIAS}:host-gateway`],
      PortBindings: {
        "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: String(http) }],
      },
      ShmSize: 2 * 1024 ** 3,
    },
  });
  try {
    await neko.start();
    await until(
      "the stand-in neko answers",
      () =>
        fetch(`http://127.0.0.1:${http}/health`).then(
          (answer) => answer.ok,
          () => false
        ),
      (up) => up,
      90_000
    );
    const login = (await (
      await fetch(`http://127.0.0.1:${http}/api/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "viewer", password: passwords.user }),
      })
    ).json()) as { token?: string };
    const relayed = await page.evaluate(view, {
      url: `ws://127.0.0.1:${http}/api/ws?token=${login.token ?? ""}`,
      policy: "relay" as const,
      from: STREAM_RELAY_PORT,
      to: relay.port,
    });
    kit.note(
      `9 · the stand-in neko at ${address} on ${network.name} (${network.subnet}), given ${JSON.stringify(urls)} (relay-urls.ts for another machine: ${JSON.stringify(composed)}, 443 read as the stand-in ${relay.port}, this machine named as ${HOST_ALIAS}, the runtime's host-gateway)`
    );
    const repeated = composed.filter((url, at) => composed.indexOf(url) !== at);
    kit.check(
      `9 · relay-urls.ts names the relay's LAN URL first for another machine on its LAN, each URL once (${composed.length} URLs${repeated.length ? `, repeated: ${repeated.join(", ")}` : ""}): ${composed[0]}`,
      composed[0] ===
        `turn:${relay.reachLan[0]}:${STREAM_RELAY_PORT}?transport=udp` &&
        repeated.length === 0,
      JSON.stringify(composed)
    );
    await relayPair(kit, leg, {
      label:
        "9 · a relay-only viewer of another fleet machine's browser (a neko on its own bridge network)",
      relayed,
      since,
      neko: neko.id,
    });
  } finally {
    await neko.remove({ force: true }).catch(() => undefined);
    await docker
      .getNetwork(OTHER_NETWORK)
      .remove()
      .catch(() => undefined);
  }
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
