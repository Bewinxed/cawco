import type {
  RelayMapHow,
  RelayPortHealth,
  RelayPorts,
  StreamRelayState,
} from "@cawco/core/stream-relay";
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  streamRelay,
  streamRelayJourney,
  streamRelayProofs,
  supervisorConfig,
} from "./schema";

/** The fleet's stream relay as stored; its secret opened (null when the hub's key does not open it). */
export interface StoredRelay {
  address: string;
  checkedAt: number | null;
  externalIp: string | null;
  health: RelayPortHealth[];
  hostname: string | null;
  machineId: string;
  ports: RelayPorts | null;
  secret: string | null;
  state: StreamRelayState;
  wanted: boolean;
  why: string | null;
  /** The command `why` names as its fix, word for word inside it. */
  whyCommand: string | null;
}

/** What a change to the record names; the rest stays. */
export type RelayChange = Partial<
  Pick<
    StoredRelay,
    | "state"
    | "ports"
    | "why"
    | "whyCommand"
    | "health"
    | "checkedAt"
    | "wanted"
  >
>;

/** The journey as stored (schema.ts `streamRelayJourney`); its token opened. */
export interface StoredJourney {
  address: string | null;
  certificateEndsAt: number | null;
  certificateName: string | null;
  certificateWhy: string | null;
  closed: "later" | "done-for-now" | null;
  cloudflareToken: string | null;
  domain: string | null;
  lan: string | null;
  liveAt: number | null;
  lowPorts: boolean;
  machineId: string | null;
  name: string | null;
  nameState: "open" | "pointed" | "skipped";
  router: "mapped" | "partial" | "refused" | null;
  routerHow: RelayMapHow | null;
}

/** One device's last proof of the relay (schema.ts `streamRelayProofs`). */
export interface StoredProof {
  address: string | null;
  at: number;
  device: string;
  deviceId: string;
  outside: boolean;
  ports: string[];
  refused: boolean;
}

/** The rows stream-relay.ts and relay-journey.ts keep: the relay's one row, the journey's, each device's proof, and when the setup card was answered. */
export interface StreamRelayDb {
  /** The relay card was answered now (Set up, or Later). */
  readonly asked: () => void;
  /** When the relay card was last answered; null while never. */
  readonly askedAt: () => number | null;
  /** The fleet has no relay. */
  readonly forget: () => void;
  /** The journey's row, made when absent. */
  readonly journey: () => StoredJourney | null;
  /** The journey begun (or begun again), through `domain` when one was seen. */
  readonly journeyOpen: (domain: string | null) => void;
  readonly journeyUpdate: (change: Partial<StoredJourney>) => void;
  /** The journey gone with the relay, its proofs with it. */
  readonly journeyForget: () => void;
  readonly proofs: () => StoredProof[];
  readonly proved: (proof: StoredProof) => void;
  readonly proofsForget: () => void;
  readonly read: () => StoredRelay | null;
  /** The fleet's relay is this one, from now: any before it is replaced. */
  readonly set: (relay: {
    machineId: string;
    address: string;
    hostname: string | null;
    externalIp: string | null;
    secret: string;
  }) => void;
  readonly update: (change: RelayChange) => void;
}

const ID = "relay";
const JOURNEY_ID = "journey";
const CONFIG_ID = "supervisor";

const time = (at: Date | null): number | null => at?.getTime() ?? null;
const toDate = (ms: number | null): Date | null =>
  ms === null ? null : new Date(ms);

export const streamRelayDb = (db: BunSQLiteDatabase): StreamRelayDb => ({
  read: () => {
    const row = db
      .select()
      .from(streamRelay)
      .where(eq(streamRelay.id, ID))
      .get();
    return row
      ? {
          machineId: row.machineId,
          address: row.address,
          hostname: row.hostname,
          externalIp: row.externalIp,
          secret: row.secret,
          wanted: row.wanted,
          state: row.state,
          ports: row.ports,
          why: row.why,
          whyCommand: row.whyCommand,
          health: row.health,
          checkedAt: time(row.checkedAt),
        }
      : null;
  },
  set: ({ machineId, address, hostname, externalIp, secret }) => {
    const fresh = {
      machineId,
      address,
      hostname,
      externalIp,
      secret,
      wanted: true,
      state: "starting" as const,
      ports: null,
      why: null,
      whyCommand: null,
      health: [],
      checkedAt: null,
      createdAt: new Date(),
    };
    db.insert(streamRelay)
      .values({ id: ID, ...fresh })
      .onConflictDoUpdate({ target: streamRelay.id, set: fresh })
      .run();
  },
  update: (change) => {
    const { checkedAt, ...rest } = change;
    const set = {
      ...rest,
      ...(checkedAt === undefined ? {} : { checkedAt: toDate(checkedAt) }),
    };
    if (Object.keys(set).length === 0) {
      return;
    }
    db.update(streamRelay).set(set).where(eq(streamRelay.id, ID)).run();
  },
  forget: () => {
    db.delete(streamRelay).where(eq(streamRelay.id, ID)).run();
  },
  journey: () => {
    const row = db
      .select()
      .from(streamRelayJourney)
      .where(eq(streamRelayJourney.id, JOURNEY_ID))
      .get();
    return row
      ? {
          machineId: row.machineId,
          address: row.address,
          lan: row.lan,
          domain: row.domain,
          name: row.name,
          nameState: row.nameState,
          cloudflareToken: row.cloudflareToken,
          router: row.router,
          routerHow: row.routerHow,
          lowPorts: row.lowPorts,
          certificateName: row.certificateName,
          certificateEndsAt: time(row.certificateEndsAt),
          certificateWhy: row.certificateWhy,
          closed: row.closed,
          liveAt: time(row.liveAt),
        }
      : null;
  },
  journeyOpen: (domain) => {
    db.insert(streamRelayJourney)
      .values({ id: JOURNEY_ID, domain, createdAt: new Date() })
      .onConflictDoUpdate({
        target: streamRelayJourney.id,
        set: { closed: null },
      })
      .run();
  },
  journeyUpdate: (change) => {
    const { certificateEndsAt, liveAt, ...rest } = change;
    const set = {
      ...rest,
      ...(certificateEndsAt === undefined
        ? {}
        : { certificateEndsAt: toDate(certificateEndsAt) }),
      ...(liveAt === undefined ? {} : { liveAt: toDate(liveAt) }),
    };
    if (Object.keys(set).length === 0) {
      return;
    }
    db.update(streamRelayJourney)
      .set(set)
      .where(eq(streamRelayJourney.id, JOURNEY_ID))
      .run();
  },
  journeyForget: () => {
    db.delete(streamRelayJourney)
      .where(eq(streamRelayJourney.id, JOURNEY_ID))
      .run();
    db.delete(streamRelayProofs).run();
  },
  proofs: () =>
    db
      .select()
      .from(streamRelayProofs)
      .all()
      .map((row) => ({ ...row, at: row.at.getTime() })),
  proved: (proof) => {
    const row = { ...proof, at: new Date(proof.at) };
    db.insert(streamRelayProofs)
      .values(row)
      .onConflictDoUpdate({ target: streamRelayProofs.deviceId, set: row })
      .run();
  },
  proofsForget: () => {
    db.delete(streamRelayProofs).run();
  },
  askedAt: () =>
    time(
      db
        .select({ at: supervisorConfig.relayAskedAt })
        .from(supervisorConfig)
        .where(eq(supervisorConfig.id, CONFIG_ID))
        .get()?.at ?? null
    ),
  asked: () => {
    const at = new Date();
    db.insert(supervisorConfig)
      .values({ id: CONFIG_ID, relayAskedAt: at })
      .onConflictDoUpdate({
        target: supervisorConfig.id,
        set: { relayAskedAt: at },
      })
      .run();
  },
});
