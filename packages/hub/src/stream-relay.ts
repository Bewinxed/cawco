/**
 * The fleet's stream relay (Projects spec §5.11, build items 4 and 5): one
 * TURN server, coturn, run by the agent of a machine with a public address
 * (agent browser/relay.ts). The hub keeps its record (`stream_relay`): the
 * machine, the address and DNS name it is reached by, and the shared secret,
 * sealed (secret-box.ts). From that secret it mints each credential a browser
 * or a viewer is given, in the TURN REST API scheme coturn's
 * `use-auth-secret` checks (turnserver.conf: "usercombo -> "timestamp:userid"
 * … turn password -> base64(hmac(secret key, usercombo))").
 *
 * - **Setup** picks the address from the machine's `public-address`
 *   capability (its first global IPv4), or the public address the hub sees
 *   its agent connect from where that differs (then coturn's `external-ip`
 *   maps it), makes the secret (32 random bytes) and sends `relay.start`.
 * - **Health**: every 60 s one STUN binding request per transport on the
 *   relay's one port, 443: UDP, TCP, and TLS while a certificate stands; each
 *   answered within 3 s is up, with the request's error kept otherwise.
 * - **Renewal** (`stream-relay-renew`): with a DNS name, `relay.renew` once a
 *   day, and certbot renews only when the certificate is due. A fixed 60 days
 *   would not hold: Let's Encrypt moves to 64-day certificates on 2027-02-10
 *   and 45-day ones on 2028-02-16, and says "renewing at a hardcoded interval
 *   of 60 days will no longer be sufficient"
 *   (https://letsencrypt.org/2025/12/02/from-90-to-45).
 * - **Remove** stops the container and forgets the record; credentials
 *   already minted lapse at their TTL.
 */
import { createHmac, randomBytes } from "node:crypto";
import type { Bounded } from "@cawco/core/bounded";
import type { BrowserRelay } from "@cawco/core/browser";
import type { MachineCapabilities } from "@cawco/core/capabilities";
import { isPublicAddress, plainAddress } from "@cawco/core/public-address";
import {
  RELAY_REMOVE,
  RELAY_RENEW,
  RELAY_START,
  RELAY_STOP,
  type RelayCandidate,
  type RelayFrame,
  type RelayPortHealth,
  type RelayPortName,
  type RelayRenewed,
  type RelayStartArgs,
  STREAM_RELAY_PORT,
  STREAM_RELAY_PORTS,
  type StreamRelayAnswer,
  type StreamRelayView,
  streamRelayUrls,
} from "@cawco/core/stream-relay";
import { Elysia, t } from "elysia";
import { getPublicIP } from "turn-server";
import type { StoredRelay, StreamRelayDb } from "./db/stream-relay";

/** How long a STUN binding request has to be answered. */
const STUN_MS = 3000;
/** How often the relay's ports are asked. */
const HEALTH_MS = 60_000;
/** How often a relay with a DNS name is asked to renew its certificate (certbot decides). */
const RENEW_MS = 24 * 60 * 60_000;
/** How long a relay start may take: two pulls and a certificate's issue. */
const START_MS = 240_000;
const STOP_MS = 30_000;
const RENEW_CALL_MS = 240_000;
/** A DNS name the relay's certificate is issued for. */
const DNS_NAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/i;

/** One TURN REST API password: base64 of HMAC-SHA1 over the username, keyed by the shared secret. */
export const turnCredential = (secret: string, username: string): string =>
  createHmac("sha1", secret).update(username).digest("base64");

/**
 * A credential good for `ttlMs` from now: the username `<expiry, unix
 * seconds>:<userId>` (coturn's `rest-api-separator` is `:`), its password,
 * and the relay's URLs.
 */
export const mintCredential = (
  relay: { secret: string; address: string; hostname: string | null },
  userId: string,
  ttlMs: number,
  now = Date.now()
): BrowserRelay => {
  const username = `${Math.floor((now + ttlMs) / 1000)}:${userId}`;
  return {
    username,
    credential: turnCredential(relay.secret, username),
    urls: streamRelayUrls(relay.address, relay.hostname),
  };
};

/** One machine as the relay's choices read it. */
export interface RelayMachine {
  capabilities?: MachineCapabilities;
  machineId: string;
  name: string;
  online: boolean;
  /** The address the hub sees its agent connect from. */
  seen?: string;
}

/** A call to a machine's agent, answered or not in time. */
export type RelayCall = (
  machineId: string,
  method: string,
  args: unknown[],
  timeoutMs: number
) => Promise<Bounded<{ ok: boolean; result?: unknown; error?: string }>>;

export interface StreamRelayDeps {
  call: RelayCall;
  db: StreamRelayDb;
  machines: () => RelayMachine[];
}

/** A refusal the routes answer with its status and the sentence. */
export class RelayRefusal extends Error {
  readonly status: 400 | 404 | 409 | 503;
  constructor(status: 400 | 404 | 409 | 503, message: string) {
    super(message);
    this.status = status;
  }
}

/** Where a machine's relay would be reached: its candidate row, or undefined when it has no public address. */
export const candidateOf = (
  machine: RelayMachine
): RelayCandidate | undefined => {
  const addresses =
    machine.capabilities?.items.find((item) => item.id === "public-address")
      ?.addresses ?? [];
  const seen =
    machine.seen && isPublicAddress(machine.seen)
      ? plainAddress(machine.seen)
      : undefined;
  const own = addresses.find((one) => !one.includes(":")) ?? addresses[0];
  if (!(own || seen)) {
    return;
  }
  const differs = seen !== undefined && seen !== own;
  // The hub sees it from another public address (a cloud NAT in front of
  // it): the relay is reached at that one, and coturn reports it for its
  // allocations, mapped onto the interface's (`external-ip=<public>/<private>`).
  const address = differs ? seen : (own as string);
  return {
    machineId: machine.machineId,
    name: machine.name,
    online: machine.online,
    address,
    addresses,
    ...(differs ? { seen } : {}),
    ...(differs ? { externalIp: own ? `${seen}/${own}` : seen } : {}),
  };
};

/** One port's STUN binding: answered within {@link STUN_MS}, or why not. */
const bind = (url: string): Promise<{ up: boolean; error?: string }> =>
  new Promise((resolve) => {
    try {
      getPublicIP(url, { timeout: STUN_MS }, (error, address) => {
        if (error || !address) {
          resolve({
            up: false,
            error: error?.message ?? "answered with no mapped address",
          });
          return;
        }
        resolve({ up: true });
      });
    } catch (error) {
      resolve({
        up: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

/** The relay's listener asked once on each transport, all at once: UDP, TCP, and TLS with a name. */
export const probeRelay = (
  address: string,
  tlsName: string | null
): Promise<RelayPortHealth[]> => {
  const host = address.includes(":") ? `[${address}]` : address;
  const on = STREAM_RELAY_PORT;
  const ports: [RelayPortName, string][] = [
    ["udp 443", `stun:${host}:${on}?transport=udp`],
    ["tcp 443", `stun:${host}:${on}?transport=tcp`],
    ...(tlsName
      ? [
          ["tls", `stuns:${tlsName}:${on}?transport=tcp`] as [
            RelayPortName,
            string,
          ],
        ]
      : []),
  ];
  return Promise.all(
    ports.map(async ([port, url]) => ({ port, ...(await bind(url)) }))
  );
};

/** The relay's machine's answer, or its refusal in its own words. */
/** Each outcome a call asks for, as the act it names. */
const ACT: Record<string, string> = {
  started: "start",
  stopped: "stop",
  renewed: "renewal",
};

const answered = <T>(
  read: Bounded<{ ok: boolean; result?: unknown; error?: string }>,
  machine: string,
  what: string
): T => {
  if (read.kind === "unanswered") {
    throw new RelayRefusal(
      503,
      read.reason === "dead"
        ? `The relay was not ${what} on ${machine}: ${machine} is not connected. ${what === "started" ? `It starts when ${machine} connects again.` : `Try again once ${machine} is back.`}`
        : `The relay's ${ACT[what] ?? what} on ${machine} did not answer in time: it may still be at work there. Settings › Browsers shows what it says next.`
    );
  }
  if (!read.value.ok) {
    throw new RelayRefusal(
      409,
      read.value.error ?? `The relay was not ${what}.`
    );
  }
  return read.value.result as T;
};

export interface StreamRelay {
  /** What Settings › Browsers and the onboarding card read. */
  answer: () => StreamRelayAnswer;
  /** The relay's machine connected: a relay that should run is started again (kept as it is when it runs already). */
  connected: (machineId: string) => void;
  /** A machine's relay frame: the record follows it. */
  heard: (frame: RelayFrame) => void;
  /** A credential for `userId`, good for `ttlMs`; null while the fleet has no relay, or none that runs. */
  mint: (userId: string, ttlMs: number) => BrowserRelay | null;
  remove: () => Promise<void>;
  setup: (pick: { machineId: string; hostname?: string }) => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  /** The health and renewal timers; the returned function ends them. */
  watch: () => () => void;
}

export const createStreamRelay = (deps: StreamRelayDeps): StreamRelay => {
  const { db, call } = deps;
  /** The latest progress of a pull, which the record does not keep. */
  let progress: { done: number; total: number } | undefined;

  const machineName = (machineId: string): string =>
    deps.machines().find((one) => one.machineId === machineId)?.name ??
    machineId;

  const startArgs = (relay: StoredRelay): RelayStartArgs => {
    if (!relay.secret) {
      throw new RelayRefusal(
        409,
        "The relay could not start: its secret no longer opens under the hub's key. Remove the relay and set it up again."
      );
    }
    return {
      secret: relay.secret,
      address: relay.address,
      relayRange: STREAM_RELAY_PORTS.relayRange,
      ...(relay.hostname ? { hostname: relay.hostname } : {}),
      ...(relay.externalIp ? { externalIp: relay.externalIp } : {}),
    };
  };

  const send = async (relay: StoredRelay): Promise<void> => {
    db.update({
      wanted: true,
      state: "starting",
      why: null,
      whyCommand: null,
    });
    const read = await call(
      relay.machineId,
      RELAY_START,
      [startArgs(relay)],
      START_MS
    );
    try {
      const frame = answered<RelayFrame>(
        read,
        machineName(relay.machineId),
        "started"
      );
      heard(frame);
    } catch (error) {
      if (error instanceof RelayRefusal && read.kind === "answered") {
        db.update({ state: "failed", why: error.message });
      }
      throw error;
    }
    await check();
  };

  const heard = (frame: RelayFrame): void => {
    const relay = db.read();
    if (!relay || relay.machineId !== frame.machineId) {
      return;
    }
    ({ progress } = frame);
    db.update({
      state: frame.state,
      ports: frame.ports,
      why: frame.why ?? null,
      whyCommand: frame.command ?? null,
    });
  };

  /** Each port asked, while the relay should be running. */
  const check = async (): Promise<void> => {
    const relay = db.read();
    if (!(relay?.wanted && relay.state === "live")) {
      return;
    }
    const health = await probeRelay(
      relay.address,
      relay.ports?.tls && relay.hostname ? relay.hostname : null
    );
    db.update({ health, checkedAt: Date.now() });
  };

  /** `stream-relay-renew`: the certificate renewed when certbot says it is due. */
  const renew = async (): Promise<void> => {
    const relay = db.read();
    if (!(relay?.wanted && relay.hostname && relay.state === "live")) {
      return;
    }
    const read = await call(relay.machineId, RELAY_RENEW, [], RENEW_CALL_MS);
    const done = answered<RelayRenewed>(
      read,
      machineName(relay.machineId),
      "renewed"
    );
    db.update({ certificateEndsAt: done.expiresAt || null });
    console.info(
      `[stream-relay] stream-relay-renew: ${done.renewed ? "renewed" : "not due"}; the certificate ends ${new Date(done.expiresAt).toISOString()}`
    );
  };

  const view = (relay: StoredRelay): StreamRelayView => ({
    machineId: relay.machineId,
    machineName: machineName(relay.machineId),
    address: relay.address,
    hostname: relay.hostname,
    state: relay.state,
    ports: relay.ports,
    why: relay.why,
    whyCommand: relay.whyCommand,
    health: relay.health,
    checkedAt: relay.checkedAt,
    certificateEndsAt: relay.certificateEndsAt,
    urls: streamRelayUrls(relay.address, relay.hostname),
    ...(progress && relay.state === "pulling" ? { progress } : {}),
  });

  return {
    answer: () => {
      const relay = db.read();
      return {
        relay: relay ? view(relay) : null,
        candidates: deps
          .machines()
          .flatMap((machine) => candidateOf(machine) ?? []),
      };
    },
    heard,
    mint: (userId, ttlMs) => {
      const relay = db.read();
      if (!(relay?.secret && relay.wanted)) {
        return null;
      }
      return mintCredential(
        {
          secret: relay.secret,
          address: relay.address,
          hostname: relay.hostname,
        },
        userId,
        ttlMs
      );
    },
    setup: async ({ machineId, hostname }) => {
      const name = hostname?.trim().toLowerCase() || undefined;
      if (name && !DNS_NAME.test(name)) {
        throw new RelayRefusal(
          400,
          `The relay was not set up: ${name} is not a DNS name. Give a name like relay.example.com, or leave the field empty, then start it again.`
        );
      }
      const machine = deps
        .machines()
        .find((one) => one.machineId === machineId);
      if (!machine) {
        throw new RelayRefusal(404, `No machine ${machineId} is in the fleet.`);
      }
      const candidate = candidateOf(machine);
      if (!candidate) {
        throw new RelayRefusal(
          409,
          `The relay was not set up on ${machine.name}: it has no public address, so nothing outside would reach the relay there. Pick a machine that has one.`
        );
      }
      const before = db.read();
      if (before && before.machineId !== machineId) {
        // One relay for the fleet: the one before goes from its own machine,
        // its certificate volume with it.
        await call(before.machineId, RELAY_REMOVE, [], STOP_MS);
      }
      db.set({
        machineId,
        address: candidate.address,
        hostname: name ?? null,
        externalIp: candidate.externalIp ?? null,
        secret: randomBytes(32).toString("base64url"),
      });
      db.asked();
      const relay = db.read();
      if (relay) {
        await send(relay);
      }
    },
    start: async () => {
      const relay = db.read();
      if (!relay) {
        throw new RelayRefusal(404, "The fleet has no stream relay to start.");
      }
      await send(relay);
    },
    stop: async () => {
      const relay = db.read();
      if (!relay) {
        throw new RelayRefusal(404, "The fleet has no stream relay to stop.");
      }
      const read = await call(relay.machineId, RELAY_STOP, [], STOP_MS);
      const frame = answered<RelayFrame>(
        read,
        machineName(relay.machineId),
        "stopped"
      );
      db.update({ wanted: false });
      heard(frame);
    },
    remove: async () => {
      const relay = db.read();
      if (!relay) {
        return;
      }
      // Its container and its certificate volume go from the machine.
      const read = await call(relay.machineId, RELAY_REMOVE, [], STOP_MS);
      // A machine that is gone holds nothing the hub could remove; the record
      // goes either way, and every credential minted from it lapses.
      if (read.kind === "answered" && !read.value.ok) {
        throw new RelayRefusal(
          409,
          read.value.error ?? "The relay was not removed, so it was kept."
        );
      }
      db.forget();
    },
    connected: (machineId) => {
      const relay = db.read();
      if (!(relay?.wanted && relay.machineId === machineId)) {
        return;
      }
      send(relay).catch((error: unknown) =>
        console.warn(
          `[stream-relay] not started again on ${machineName(machineId)}: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    },
    watch: () => {
      const said = (what: string) => (error: unknown) =>
        console.warn(
          `[stream-relay] ${what}: ${error instanceof Error ? error.message : String(error)}`
        );
      const health = setInterval(() => {
        check().catch(said("health not checked"));
      }, HEALTH_MS);
      const renewal = setInterval(() => {
        renew().catch(said("stream-relay-renew failed"));
      }, RENEW_MS);
      health.unref();
      renewal.unref();
      return () => {
        clearInterval(health);
        clearInterval(renewal);
      };
    },
  };
};

/** Answers a refusal with its status and sentence; anything else goes on as an error. */
const refused = (error: unknown): Response => {
  if (error instanceof RelayRefusal) {
    return new Response(error.message, { status: error.status });
  }
  throw error;
};

/** Runs `work`, then answers what Settings reads, or the refusal. */
const answering =
  (relay: StreamRelay) =>
  async (work: () => Promise<void>): Promise<StreamRelayAnswer | Response> => {
    try {
      await work();
      return relay.answer();
    } catch (error) {
      return refused(error);
    }
  };

/**
 * `GET /api/stream-relay`, `POST /api/stream-relay` (setup: `{ machineId,
 * hostname? }`), `POST /api/stream-relay/start`, `/stop`, and `DELETE
 * /api/stream-relay`. Every one is the person's: hub-auth.ts lists none for
 * sessions.
 */
export const streamRelayRoutes = (relay: StreamRelay) => {
  const run = answering(relay);
  return new Elysia()
    .get("/api/stream-relay", () => relay.answer())
    .post(
      "/api/stream-relay",
      {
        body: t.Object({
          machineId: t.String({ minLength: 1 }),
          hostname: t.Optional(t.String({ maxLength: 253 })),
        }),
      },
      ({ body }) => run(() => relay.setup(body))
    )
    .post("/api/stream-relay/start", () => run(() => relay.start()))
    .post("/api/stream-relay/stop", () => run(() => relay.stop()))
    .delete("/api/stream-relay", () => run(() => relay.remove()));
};
