import type {
  RelayPortHealth,
  RelayPorts,
  StreamRelayState,
} from "@cawco/core/stream-relay";
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { streamRelay, supervisorConfig } from "./schema";

/** The fleet's stream relay as stored; its secret opened (null when the hub's key does not open it). */
export interface StoredRelay {
  address: string;
  certificateEndsAt: number | null;
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
}

/** What a change to the record names; the rest stays. */
export type RelayChange = Partial<
  Pick<
    StoredRelay,
    | "state"
    | "ports"
    | "why"
    | "health"
    | "checkedAt"
    | "certificateEndsAt"
    | "wanted"
  >
>;

/** The rows stream-relay.ts keeps: the relay's one row, and when its card was answered. */
export interface StreamRelayDb {
  /** The relay card was answered now (a machine picked, or Later). */
  readonly asked: () => void;
  /** When the relay card was last answered; null while never. */
  readonly askedAt: () => number | null;
  /** The fleet has no relay. */
  readonly forget: () => void;
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
          health: row.health,
          checkedAt: time(row.checkedAt),
          certificateEndsAt: time(row.certificateEndsAt),
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
      health: [],
      checkedAt: null,
      certificateEndsAt: null,
      createdAt: new Date(),
    };
    db.insert(streamRelay)
      .values({ id: ID, ...fresh })
      .onConflictDoUpdate({ target: streamRelay.id, set: fresh })
      .run();
  },
  update: (change) => {
    const { checkedAt, certificateEndsAt, ...rest } = change;
    const set = {
      ...rest,
      ...(checkedAt === undefined ? {} : { checkedAt: toDate(checkedAt) }),
      ...(certificateEndsAt === undefined
        ? {}
        : { certificateEndsAt: toDate(certificateEndsAt) }),
    };
    if (Object.keys(set).length === 0) {
      return;
    }
    db.update(streamRelay).set(set).where(eq(streamRelay.id, ID)).run();
  },
  forget: () => {
    db.delete(streamRelay).where(eq(streamRelay.id, ID)).run();
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
