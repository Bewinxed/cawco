/**
 * The fleet's stream relay (Projects spec §5.11, build items 4 and 5): one
 * TURN server, coturn, run by the agent of a machine the internet reaches
 * (agent browser/relay.ts). The hub keeps its record (`stream_relay`): the
 * machine, the address and DNS name it is reached by, and the shared secret,
 * sealed (secret-box.ts). From that secret it mints each credential a browser
 * or a viewer is given, in the TURN REST API scheme coturn's
 * `use-auth-secret` checks (turnserver.conf: "usercombo -> "timestamp:userid"
 * … turn password -> base64(hmac(secret key, usercombo))").
 *
 * The guided journey (relay-journey.ts) brings it up: it picks the machine
 * and its address (an interface's, the hub's view of it, or the one its
 * router maps it to, by STUN), has the certificate issued, and calls
 * {@link StreamRelay.setup} with all of it.
 *
 * - **Health**: every 60 s one STUN binding request per listener: UDP and
 *   TCP on 3478, and TLS on 5349 while a certificate stands; each answered
 *   within 3 s is up, with the request's error kept otherwise.
 * - **Renewal** (`stream-relay-renew`): with a DNS name, `relay.renew` once a
 *   day by DNS with the person's Cloudflare token, and certbot renews only
 *   when the certificate is due. A fixed 60 days
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
import type { ChoiceEntry } from "@cawco/core/choices";
import { isPublicAddress, plainAddress } from "@cawco/core/public-address";
import { RelayPortsSchema, RelayReachSchema } from "@cawco/core/stored-shapes";
import {
  RELAY_CERTIFY,
  RELAY_REMOVE,
  RELAY_RENEW,
  RELAY_START,
  RELAY_STOP,
  type RelayCandidate,
  type RelayCertified,
  type RelayCertifyArgs,
  type RelayFrame,
  type RelayPortHealth,
  type RelayPortName,
  type RelayReach,
  type RelayRenewArgs,
  type RelayRenewed,
  type RelayStartArgs,
  STREAM_RELAY_PORT,
  STREAM_RELAY_PORTS,
  STREAM_RELAY_TLS_PORT,
  streamRelayUrls,
} from "@cawco/core/stream-relay";
import { DAY_MS } from "@cawco/core/time";
import { STREAM_RELAY_WORDS } from "@cawco/core/words/stream-relay";
import { ElysiaStatus } from "elysia";
import { getPublicIP } from "turn-server";
import type { StoredRelay, StreamRelayDb } from "./db/stream-relay";
import type { HubLifetimeShape } from "./lifetime";
import { type RefusalOf, refusal } from "./refusal";
import { received } from "./stored-json";

/** How long a STUN binding request has to be answered. */
const STUN_MS = 3000;
/** How often the relay's ports are asked. */
const HEALTH_MS = 60_000;
/** How often a relay with a DNS name is asked to renew its certificate (certbot decides). */
const RENEW_MS = DAY_MS;
/** How long a relay start may take: a pull of coturn's image and its bind. */
const START_MS = 240_000;
/** How long a certificate's issue may take: certbot's pull and its challenge. */
const CERTIFY_MS = 240_000;
const STOP_MS = 30_000;
const RENEW_CALL_MS = 240_000;

/** One TURN REST API password: base64 of HMAC-SHA1 over the username, keyed by the shared secret. */
const turnCredential = (secret: string, username: string): string =>
  createHmac("sha1", secret).update(username).digest("base64");

/**
 * A credential good for `ttlMs` from now: the username `<expiry, unix
 * seconds>:<userId>` (coturn's `rest-api-separator` is `:`), its password,
 * the relay's URLs, and with the relay's machine its `reach`: that machine
 * and its own LAN and tailnet addresses, which a browser of the fleet
 * composes its URLs from (agent relay-urls.ts).
 */
const mintCredential = (
  relay: {
    secret: string;
    address: string;
    hostname: string | null;
    machineId?: string;
    reach?: RelayReach | null;
  },
  userId: string,
  ttlMs: number,
  now = Date.now()
): BrowserRelay => {
  const username = `${Math.floor((now + ttlMs) / 1000)}:${userId}`;
  return {
    username,
    credential: turnCredential(relay.secret, username),
    urls: streamRelayUrls(relay.address, relay.hostname),
    ...(relay.machineId
      ? {
          reach: {
            machineId: relay.machineId,
            lan: relay.reach?.lan ?? [],
            tailnet: relay.reach?.tailnet ?? [],
          },
        }
      : {}),
  };
};

/** One machine as the relay's choices read it. */
export interface RelayFleetMachine {
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
  /** The record changed: the journey's view follows. */
  changed: () => void;
  /** The person's Cloudflare token, for the renewal by DNS; null without one. */
  cloudflareToken: () => string | null;
  db: StreamRelayDb;
  /** The hub's lifetime: the health and renewal timers run on it. */
  lifetime: HubLifetimeShape;
  machines: () => RelayFleetMachine[];
  /** A renewal said when the certificate ends now. */
  renewed: (expiresAt: number) => void;
}

/** The relay's machine's refusal: away or late (503), or refusing in its own words (409). */
export type RelayMachineRefusal =
  | RefusalOf<503, "stream-relay-machine-away">
  | RefusalOf<503, "stream-relay-machine-late">
  | RefusalOf<409, "stream-relay-machine-refused">;

/** Why the relay did not start: its machine's refusal, or a secret that no longer opens. */
export type RelayStartRefusal =
  RelayMachineRefusal | RefusalOf<409, "stream-relay-secret-unsealed">;

/** The fleet has no relay to start or stop. */
type RelayNone = RefusalOf<404, "stream-relay-none">;

/**
 * Where a machine's relay would be reached: its candidate row, or undefined
 * when the internet reaches it nowhere the hub knows. An interface's public
 * address first; else the public address the hub sees its agent connect from;
 * else the one its router maps it to, as a STUN binding answered it ("behind
 * a router", its address on the router's network beside it for the forwards).
 */
export const candidateOf = (
  machine: RelayFleetMachine
): RelayCandidate | undefined => {
  const reach = machine.capabilities?.items.find(
    (item) => item.id === "public-address"
  );
  const addresses = reach?.addresses ?? [];
  const seen =
    machine.seen && isPublicAddress(machine.seen)
      ? plainAddress(machine.seen)
      : undefined;
  const own = addresses.find((one) => !one.includes(":")) ?? addresses[0];
  const base = {
    machineId: machine.machineId,
    name: machine.name,
    online: machine.online,
  };
  if (own) {
    // The hub sees it from another public address (a cloud NAT in front of
    // it): the relay is reached at that one.
    return seen && seen !== own
      ? { ...base, address: seen, lan: null }
      : { ...base, address: own, lan: null };
  }
  const nat = reach?.nat;
  if (nat) {
    return { ...base, address: nat.address, lan: nat.lan };
  }
  return seen ? { ...base, address: seen, lan: null } : undefined;
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

/** The relay's listeners asked once each, all at once: UDP and TCP 3478, and TLS on 5349 with a name. */
const probeRelay = (
  address: string,
  tlsName: string | null
): Promise<RelayPortHealth[]> => {
  const host = address.includes(":") ? `[${address}]` : address;
  const on = STREAM_RELAY_PORT;
  const ports: [RelayPortName, string][] = [
    ["udp 3478", `stun:${host}:${on}?transport=udp`],
    ["tcp 3478", `stun:${host}:${on}?transport=tcp`],
    ...(tlsName
      ? [
          [
            "tls 5349",
            `stuns:${tlsName}:${STREAM_RELAY_TLS_PORT}?transport=tcp`,
          ] as [RelayPortName, string],
        ]
      : []),
  ];
  return Promise.all(
    ports.map(async ([port, url]) => ({ port, ...(await bind(url)) }))
  );
};

/** Each outcome a call asks for, as the act it names. */
const ACT: Record<string, string> = {
  started: "start",
  stopped: "stop",
  renewed: "renewal",
  issued: "certificate's issue",
};

/** The relay's machine's answer, or its refusal in its own words. */
const answered = <T>(
  read: Bounded<{ ok: boolean; result?: unknown; error?: string }>,
  machine: string,
  what: string
): T | RelayMachineRefusal => {
  if (read.kind === "unanswered") {
    return read.reason === "dead"
      ? refusal(
          503,
          "stream-relay-machine-away",
          STREAM_RELAY_WORDS.machineAway(machine)
        )
      : refusal(
          503,
          "stream-relay-machine-late",
          `The stream relay's ${ACT[what] ?? what} on ${machine} did not answer in time: it may still be at work there. The journey shows what it says next.`
        );
  }
  if (!read.value.ok) {
    return refusal(
      409,
      "stream-relay-machine-refused",
      read.value.error ?? `The stream relay was not ${what}.`
    );
  }
  return read.value.result as T;
};

/** What the journey hands a start: the machine, where it is reached, its name. */
interface RelaySetup {
  address: string;
  hostname: string | null;
  machineId: string;
}

export interface StreamRelay {
  /** `relay.certify` on `machineId`: the certificate's end, or the refusal in its machine's words. */
  certify: (
    machineId: string,
    args: RelayCertifyArgs
  ) => Promise<number | RelayMachineRefusal>;
  /** The relay's machine connected: a relay that should run is started again (kept as it is when it runs already). */
  connected: (machineId: string) => void;
  /** A machine's relay frame: the record follows it. */
  heard: (frame: RelayFrame) => void;
  /** A credential for `userId`, good for `ttlMs`; null while the fleet has no relay, or none that runs. */
  mint: (userId: string, ttlMs: number) => BrowserRelay | null;
  /** How far its image pull is, while it pulls. */
  progress: () => { done: number; total: number } | undefined;
  /** The fleet's relay, as stored; null with none. */
  read: () => StoredRelay | null;
  /** The relay gone from its machine and the record; refused, and kept, when its machine would not remove it. */
  remove: () => Promise<undefined | RefusalOf<409, "stream-relay-not-removed">>;
  /** The relay set up as the journey picked it, and started; the one before goes from its machine. */
  setup: (setup: RelaySetup) => Promise<undefined | RelayStartRefusal>;
  start: () => Promise<undefined | RelayNone | RelayStartRefusal>;
  stop: () => Promise<undefined | RelayNone | RelayMachineRefusal>;
  /** The health and renewal timers, on the hub's lifetime (lifetime.ts); the returned function ends them. */
  watch: () => () => void;
}

export const createStreamRelay = (deps: StreamRelayDeps): StreamRelay => {
  const { db, call, changed } = deps;
  /** The latest progress of a pull, which the record does not keep. */
  let progress: { done: number; total: number } | undefined;

  const machineName = (machineId: string): string =>
    deps.machines().find((one) => one.machineId === machineId)?.name ??
    machineId;

  const startArgs = (relay: StoredRelay) => {
    if (!relay.secret) {
      return refusal(
        409,
        "stream-relay-secret-unsealed",
        "The stream relay could not start: its secret no longer opens under the hub's key. Remove it and set it up again."
      );
    }
    const args: RelayStartArgs = {
      secret: relay.secret,
      address: relay.address,
      relayRange: STREAM_RELAY_PORTS.relayRange,
      ...(relay.hostname ? { hostname: relay.hostname } : {}),
    };
    return args;
  };

  const update: StreamRelayDb["update"] = (change) => {
    db.update(change);
    changed();
  };

  /** The relay's start failed: its refusal stands on the start step. */
  const failed = (refused: RelayStartRefusal) => {
    const { detail } = refused.response;
    const relayNow = db.read();
    update({
      state: "failed",
      why: detail,
      whyCommand: relayNow?.why === detail ? relayNow.whyCommand : null,
    });
    return refused;
  };

  const send = async (relay: StoredRelay) => {
    update({
      wanted: true,
      state: "starting",
      why: null,
      whyCommand: null,
    });
    const args = startArgs(relay);
    if (args instanceof ElysiaStatus) {
      return failed(args);
    }
    const read = await call(relay.machineId, RELAY_START, [args], START_MS);
    const frame = answered<RelayFrame>(
      read,
      machineName(relay.machineId),
      "started"
    );
    // A refusal in the machine's words (its frame said the command
    // already), or the machine away: either stands on the start step.
    if (frame instanceof ElysiaStatus) {
      return failed(frame);
    }
    heard(frame);
    await check();
  };

  const heard = (frame: RelayFrame): void => {
    const relay = db.read();
    if (!relay || relay.machineId !== frame.machineId) {
      return;
    }
    ({ progress } = frame);
    // The machine's word on its relay, taken into CawCo's types as it is kept.
    update({
      state: frame.state,
      ports: received(RelayPortsSchema, frame.ports, "a machine's relay frame"),
      why: frame.why ?? null,
      whyCommand: frame.command ?? null,
      ...(frame.reach
        ? {
            reach: received(
              RelayReachSchema,
              frame.reach,
              "a machine's relay frame"
            ),
          }
        : {}),
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
    update({ health, checkedAt: Date.now() });
  };

  /** `stream-relay-renew`: the certificate renewed when certbot says it is due, by DNS with the token the journey keeps. */
  const renew = async () => {
    const relay = db.read();
    if (!(relay?.wanted && relay.hostname && relay.state === "live")) {
      return;
    }
    const token = deps.cloudflareToken();
    if (!token) {
      // The certificate is renewed only by DNS: the journey's certificate
      // step asks for the token, and the one standing serves until it ends.
      console.warn(
        `[stream-relay] stream-relay-renew: no Cloudflare token for ${relay.hostname}, so its certificate is not renewed until the journey has one`
      );
      return;
    }
    const args: RelayRenewArgs = { cloudflareToken: token };
    const read = await call(
      relay.machineId,
      RELAY_RENEW,
      [args],
      RENEW_CALL_MS
    );
    const done = answered<RelayRenewed>(
      read,
      machineName(relay.machineId),
      "renewed"
    );
    if (done instanceof ElysiaStatus) {
      return done;
    }
    if (done.expiresAt) {
      deps.renewed(done.expiresAt);
    }
    console.info(
      `[stream-relay] stream-relay-renew: ${done.renewed ? "renewed" : "not due"}; the certificate ends ${new Date(done.expiresAt).toISOString()}`
    );
  };

  return {
    read: () => db.read(),
    progress: () => {
      const relay = db.read();
      return relay?.state === "pulling" ? progress : undefined;
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
          machineId: relay.machineId,
          reach: relay.reach,
        },
        userId,
        ttlMs
      );
    },
    certify: async (machineId, args) => {
      const read = await call(machineId, RELAY_CERTIFY, [args], CERTIFY_MS);
      const certified = answered<RelayCertified>(
        read,
        machineName(machineId),
        "issued"
      );
      return certified instanceof ElysiaStatus
        ? certified
        : certified.expiresAt;
    },
    setup: async ({ machineId, address, hostname }) => {
      const before = db.read();
      if (before && before.machineId !== machineId) {
        // One relay for the fleet: the one before goes from its own machine,
        // its certificate volume and router mappings with it.
        await call(before.machineId, RELAY_REMOVE, [], STOP_MS);
      }
      db.set({
        machineId,
        address,
        hostname,
        // The secret a relay already had stays: a credential minted from it
        // still answers while the relay starts again on its new settings.
        secret:
          before?.machineId === machineId && before.secret
            ? before.secret
            : randomBytes(32).toString("base64url"),
      });
      changed();
      const relay = db.read();
      return relay ? await send(relay) : undefined;
    },
    start: async () => {
      const relay = db.read();
      if (!relay) {
        return refusal(
          404,
          "stream-relay-none",
          "The fleet has no stream relay to start."
        );
      }
      return await send(relay);
    },
    stop: async () => {
      const relay = db.read();
      if (!relay) {
        return refusal(
          404,
          "stream-relay-none",
          "The fleet has no stream relay to stop."
        );
      }
      const read = await call(relay.machineId, RELAY_STOP, [], STOP_MS);
      const frame = answered<RelayFrame>(
        read,
        machineName(relay.machineId),
        "stopped"
      );
      if (frame instanceof ElysiaStatus) {
        return frame;
      }
      update({ wanted: false });
      heard(frame);
    },
    remove: async () => {
      const relay = db.read();
      if (!relay) {
        return;
      }
      // Its container, its certificate volume and its router mappings go
      // from the machine.
      const read = await call(relay.machineId, RELAY_REMOVE, [], STOP_MS);
      // A machine that is gone holds nothing the hub could remove; the record
      // goes either way, and every credential minted from it lapses.
      if (read.kind === "answered" && !read.value.ok) {
        return refusal(
          409,
          "stream-relay-not-removed",
          read.value.error ??
            "The stream relay was not removed, so it was kept."
        );
      }
      db.forget();
      changed();
    },
    connected: (machineId) => {
      const relay = db.read();
      if (!(relay?.wanted && relay.machineId === machineId)) {
        return;
      }
      const notStarted = (why: string) =>
        console.warn(
          `[stream-relay] not started again on ${machineName(machineId)}: ${why}`
        );
      send(relay)
        .then((sent) => {
          if (sent instanceof ElysiaStatus) {
            notStarted(sent.response.detail);
          }
        })
        .catch((error: unknown) =>
          notStarted(error instanceof Error ? error.message : String(error))
        );
    },
    watch: () => {
      const said = (what: string) => (error: unknown) =>
        console.warn(
          `[stream-relay] ${what}: ${error instanceof Error ? error.message : String(error)}`
        );
      const health = deps.lifetime.every(HEALTH_MS, () => {
        check().catch(said("health not checked"));
      });
      const renewal = deps.lifetime.every(RENEW_MS, () => {
        renew()
          .then((renewed) => {
            if (renewed instanceof ElysiaStatus) {
              said("stream-relay-renew failed")(
                new Error(renewed.response.detail)
              );
            }
          })
          .catch(said("stream-relay-renew failed"));
      });
      return () => {
        deps.lifetime.cancel(health);
        deps.lifetime.cancel(renewal);
      };
    },
  };
};

/** The relay card's id and its two options. */
const RELAY_CARD = {
  id: "fleet-relay",
  setUp: "set-up",
  later: "later",
} as const;

/**
 * The `fleet-relay` card, for the first-run row's relay step: the step's
 * lead (core `STREAM_RELAY_WORDS`), and two options, Set up the stream relay
 * and Later; Set up recommended when the person reached CawCo through a
 * domain, which carries pages and not streams.
 *
 * @public Kept for the first-run row's relay step, the build after the one
 * that took the card off the setup page.
 */
export const relayCard = (domain: string | null): string => {
  const words = STREAM_RELAY_WORDS;
  const lead = domain ? words.leadDomain(domain) : words.leadPlain;
  return `- \`${RELAY_CARD.id}\`: "${words.title}" — ${lead} Options \`${RELAY_CARD.setUp}\` labelled "${words.setUp}"${domain ? " (recommended)" : ""} and \`${RELAY_CARD.later}\` labelled "${words.later}". Say on the card that Set up opens a short guided set-up in Needs you, each step ticking by itself, and that Settings › Browsers is where it is finished and seen. It is the fleet's, asked once: say so on the card.`;
};

/**
 * What the person picked on the relay card: Set up, Later, or nothing.
 *
 * @public Kept for the first-run row's relay step, as {@link relayCard} is.
 */
export const relayPickOf = (
  state: Record<string, ChoiceEntry>
): "set-up" | "later" | undefined => {
  const card: ChoiceEntry | undefined = state[RELAY_CARD.id];
  const [option] = card?.options ?? [];
  if (option === RELAY_CARD.setUp || option === RELAY_CARD.later) {
    return option;
  }
};
