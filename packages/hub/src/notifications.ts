/**
 * One gate for every notification about a session, and one ledger of the
 * ones that are over (core notifications.ts has the shapes).
 *
 * **Presence and the gate.** Each client (a dashboard tab, the iOS app, the
 * Mac app) says which session it has in front and whether it is truly
 * foreground, visible and focused (`POST /api/presence`). Only a focused
 * foreground client counts: Matrix's push bugs came from a backgrounded app
 * counting as viewing. A notification about a session (a finished turn, an
 * ask, a task's attempt, fleet watch's notice; push or Telegram) shows in
 * that session, so the owner saw it if some client was active on the session
 * at any moment from when it landed to when it is offered: the gate drops it,
 * on every outlet, and never sends it later. The hub settles this from the
 * presence it holds, not from a client remembering to post a look. Anything
 * else goes at once. Items that land while nobody is in front keep Zulip's
 * hold-then-recheck in their outlet: a finished turn waits a grace and goes
 * only if nobody looked at its session meanwhile (push.ts `turnEnded`), and
 * the push outlet holds what isn't an ask for its burst and asks the gate
 * again as the burst goes out (push.ts `arrive`).
 * A client is active until it says otherwise or is silent for
 * {@link PRESENCE_TTL_MS}; every change of a client's presence is logged.
 *
 * **Clears.** A notification is over when its ask settles, its session is
 * looked at (`/api/seen` `look`), or a device acted on, opened or dismissed
 * it (`POST /api/notifications/dismiss`; a dismissal that names when the
 * device delivered an id leaves it standing if the hub sent it again since).
 * Only what was shown is cleared, so
 * looking at a session no notification named sends nothing anywhere. Each
 * clear is written down (`notification_cleared`, kept three days) and goes
 * out at once on the socket (`notificationsCleared`); the outlets that showed
 * it hear it too: the push outlet queues a background push per device and
 * carries the cleared ids on every visible push, Telegram deletes its
 * message. iOS cannot remove a delivered notification without waking the
 * app, which is why the clear goes every way at once.
 */
import { createHash } from "node:crypto";
import {
  type DismissVia,
  type NotificationsClearedFrame,
  PRESENCE_TTL_MS,
  type PresenceBeat,
  type PresenceClient,
} from "@cawco/core";
import { Elysia, t } from "elysia";
import type { DbShape } from "./db";
import type { HubLifetimeShape } from "./lifetime";
import type { RegistryShape } from "./registry";

/** How often expired clients are swept. */
const SWEEP_MS = 10_000;
/**
 * How long a session's last moment in front is kept: far longer than any
 * outlet takes from an item landing to offering it (a turn's grace, a task's
 * read).
 */
const FRONT_KEPT_MS = 10 * 60_000;
/** How far back a push's `cawco.cleared` reaches, and how many it carries. */
const CARRIED_MS = 24 * 60 * 60_000;
const CARRIED_IDS = 50;
/** How long sends and clears are kept. */
const KEPT_MS = 3 * 24 * 60 * 60_000;
const PRUNE_MS = 60 * 60_000;
/**
 * How far a device's clock may run behind the hub's: a dismissal's
 * `deliveredAt` is the device's time, `sent_at` the hub's.
 */
const DEVICE_SKEW_MS = 120_000;

/** A collapse id fits APNs' 64 bytes: long ids go as their hash. */
const collapseOf = (prefix: string, id: string): string =>
  `${prefix}-${id}`.length <= 64
    ? `${prefix}-${id}`
    : `${prefix}-${createHash("sha256").update(id).digest("hex").slice(0, 40)}`;

/** An ask's collapse id, the same on every device and in Telegram. */
export const askCollapseId = (requestId: string): string =>
  collapseOf("ask", requestId);
/** A session's finished turn: one per session, a newer turn replaces the older. */
export const turnCollapseId = (instanceId: string): string =>
  collapseOf("turn", instanceId);
/** A task waiting on the owner: its move and its failed attempt are one notification. */
export const taskCollapseId = (projectId: string, taskId: string): string =>
  collapseOf("task", `${projectId}:${taskId}`);
/** A burst of things that need you shown as one notification (push.ts), by when it began. */
export const needsCollapseId = (firstAt: number): string =>
  collapseOf("needs", firstAt.toString(36));

/** Where a notification is shown. */
type Outlet = "push" | "telegram";

/** One notification about a session, offered to the gate by its outlet. */
export interface Offer {
  readonly collapseId: string;
  /** The session it is about; null goes at once, nobody can be reading it. */
  readonly instanceId: string | null;
  /** When it happened in its session (a turn's end, an ask parking), epoch ms on the hub's clock. */
  readonly landedAt: number;
  readonly outlet: Outlet;
  /** Shows it; the outlet calls {@link Notifications.shown} once it has. */
  readonly send: () => void;
}

/** Why ids cleared: a device's own `via`, an ask settling, or its session looked at. */
export type ClearedVia = DismissVia | "settled" | "look";

/** What an outlet hears when ids clear. */
export type ClearListener = (collapseIds: string[], via: ClearedVia) => void;

interface Client {
  readonly active: boolean;
  readonly at: number;
  readonly client: PresenceClient;
  /** The client's own clock when it said this beat. */
  readonly saidAt: number;
  readonly sessionId: string | null;
}

export interface NotificationsServices {
  readonly db: DbShape;
  readonly lifetime: HubLifetimeShape;
  readonly registry: RegistryShape;
}

export const createNotifications = ({
  db,
  lifetime,
  registry,
}: NotificationsServices) => {
  const clients = new Map<string, Client>();
  /**
   * Per session, the last moment a client was known active on it, epoch ms:
   * stamped on every active beat, when a client leaves it, and when one
   * lapses (its last beat plus {@link PRESENCE_TTL_MS}, as long as it counted).
   */
  const frontAt = new Map<string, number>();
  const listeners: ClearListener[] = [];
  /** Counts clears: an outlet compares it to what it last told a device. */
  let clears = 0;

  /**
   * The gate's word on one notification: false, said in the log, when a
   * client was active on its session at any moment since it landed.
   */
  const passes = (offer: Omit<Offer, "send">): boolean => {
    if (offer.instanceId && inFrontSince(offer.instanceId, offer.landedAt)) {
      console.log(
        `[notify] ${offer.outlet} ${offer.collapseId}: dropped, ${offer.instanceId} was in front since it landed ${Math.round((Date.now() - offer.landedAt) / 1000)}s ago`
      );
      return false;
    }
    return true;
  };

  const isActive = (client: Client, now: number): boolean =>
    client.active &&
    client.sessionId !== null &&
    now - client.at < PRESENCE_TTL_MS;

  const markFront = (instanceId: string, at: number): void => {
    frontAt.set(instanceId, Math.max(frontAt.get(instanceId) ?? 0, at));
  };

  /** A client active on the session now, or one was at some moment since `since`. */
  const inFrontSince = (instanceId: string, since: number): boolean => {
    const now = Date.now();
    for (const client of clients.values()) {
      if (client.sessionId === instanceId && isActive(client, now)) {
        return true;
      }
    }
    return (frontAt.get(instanceId) ?? 0) >= since;
  };

  const said = (clientId: string, client: Client): string =>
    `[presence] ${client.client} ${clientId.slice(0, 8)}: ${client.active && client.sessionId ? `active on ${client.sessionId}` : `inactive (${client.sessionId ?? "no session"} in front)`}`;

  lifetime.every(SWEEP_MS, () => {
    const now = Date.now();
    for (const [clientId, client] of clients) {
      if (now - client.at < PRESENCE_TTL_MS) {
        continue;
      }
      clients.delete(clientId);
      if (client.active && client.sessionId) {
        markFront(client.sessionId, client.at + PRESENCE_TTL_MS);
        console.log(
          `[presence] ${client.client} ${clientId.slice(0, 8)}: lapsed, no beat for ${PRESENCE_TTL_MS / 1000}s while active on ${client.sessionId}`
        );
      }
    }
    for (const [instanceId, at] of frontAt) {
      if (now - at > FRONT_KEPT_MS) {
        frontAt.delete(instanceId);
      }
    }
  });
  const prune = () => db.notifications.prune(new Date(Date.now() - KEPT_MS));
  prune();
  lifetime.every(PRUNE_MS, prune);

  /** Clears ids and tells everyone that has them; answers the ids newly cleared. */
  const clear = (
    collapseIds: readonly string[],
    via: ClearedVia,
    any = false
  ): string[] => {
    const newly = db.notifications.clear([...collapseIds], new Date(), any);
    if (newly.length === 0) {
      return newly;
    }
    clears += 1;
    console.log(`[notify] cleared (${via}): ${newly.join(", ")}`);
    const frame: NotificationsClearedFrame = {
      type: "notificationsCleared",
      collapseIds: newly,
    };
    registry.broadcastTyped(frame);
    for (const listener of listeners) {
      listener(newly, via);
    }
    return newly;
  };

  return {
    /** A client's beat: who it is, what it has in front, and whether it is active. */
    presence(beat: PresenceBeat): void {
      const now = Date.now();
      const before = clients.get(beat.clientId);
      // Said before the beat already kept: it landed late, and is over.
      if (before !== undefined && beat.saidAt < before.saidAt) {
        console.log(
          `[presence] ${beat.client} ${beat.clientId.slice(0, 8)}: a beat said ${before.saidAt - beat.saidAt}ms before the one kept landed late; dropped`
        );
        return;
      }
      const counted = before !== undefined && isActive(before, now);
      // It was in front up to this beat, whatever this beat says.
      if (counted && before.sessionId) {
        markFront(before.sessionId, now);
      }
      const client: Client = {
        client: beat.client,
        sessionId: beat.sessionId,
        active: beat.active,
        saidAt: beat.saidAt,
        at: now,
      };
      clients.set(beat.clientId, client);
      if (isActive(client, now) && client.sessionId) {
        markFront(client.sessionId, now);
      }
      // A change: a new client, another session or state, or one that had
      // lapsed (silent past the TTL, not yet swept) beating again.
      if (
        before === undefined ||
        before.sessionId !== client.sessionId ||
        before.active !== client.active ||
        (before.active && !counted)
      ) {
        console.log(said(beat.clientId, client));
      }
    },

    /**
     * The one way a notification about a session goes out: dropped when a
     * client was active on its session at any moment since it landed (the
     * owner saw it there), sent now otherwise.
     */
    offer(offer: Offer): void {
      if (passes(offer)) {
        offer.send();
      }
    },

    /** The gate alone, for an outlet that sends several at once (push.ts, a burst). */
    passes,

    /** An outlet showed this notification: it is outstanding until it clears, and no longer cleared. */
    shown(collapseId: string): void {
      db.notifications.sent(collapseId, new Date());
    },

    clear,

    /**
     * A device let go of these itself, so they are over however they were
     * shown; answers the ids newly cleared. A device can report late (a
     * "Clear All" found by absence at its next sweep), and a collapse id is
     * reused on a re-push: an id with `deliveredAt` (epoch ms on the
     * device's clock) that the hub has sent again since that delivery is a
     * newer notification the device never saw, and stays.
     */
    dismiss(
      collapseIds: readonly string[],
      via: DismissVia,
      deliveredAt: Readonly<Record<string, number>> = {}
    ): string[] {
      const delivered = new Map(Object.entries(deliveredAt));
      const sent = db.notifications.sentAt(
        collapseIds.filter((id) => delivered.has(id))
      );
      const resent = collapseIds.filter((id) => {
        const at = delivered.get(id);
        const sentAt = sent.get(id)?.getTime();
        return (
          at !== undefined &&
          sentAt !== undefined &&
          sentAt > at + DEVICE_SKEW_MS
        );
      });
      if (resent.length > 0) {
        console.log(
          `[notify] dismiss (${via}) kept ${resent
            .map(
              (id) =>
                `${id} (sent ${sent.get(id)?.toISOString()}, delivered there ${new Date(delivered.get(id) ?? 0).toISOString()})`
            )
            .join(", ")}: sent again since that device had it`
        );
      }
      return clear(
        collapseIds.filter((id) => !resent.includes(id)),
        via,
        true
      );
    },

    /** The cleared ids every visible push carries: the last day's, newest first, at most {@link CARRIED_IDS}. */
    carried(): string[] {
      return db.notifications
        .clearedSince(new Date(Date.now() - CARRIED_MS))
        .slice(0, CARRIED_IDS)
        .map((row) => row.collapseId);
    },

    /** How many clears there have been: an outlet that told a device at this count has told it all. */
    clearCount(): number {
      return clears;
    },

    /** An outlet hears every clear. */
    onCleared(listener: ClearListener): void {
      listeners.push(listener);
    },
  };
};

export type Notifications = ReturnType<typeof createNotifications>;

export const notificationRoutes = (db: DbShape, notifications: Notifications) =>
  new Elysia()
    .post(
      "/api/presence",
      {
        body: t.Object({
          clientId: t.String({ minLength: 1, maxLength: 200 }),
          client: t.Union([
            t.Literal("web"),
            t.Literal("ios"),
            t.Literal("mac"),
          ]),
          sessionId: t.Nullable(t.String({ minLength: 1 })),
          active: t.Boolean(),
          saidAt: t.Number({ minimum: 0 }),
        }),
      },
      ({ body }) => {
        notifications.presence(body);
        return { ok: true };
      }
    )
    .post(
      "/api/notifications/dismiss",
      {
        body: t.Object({
          collapseIds: t.Array(t.String({ minLength: 1, maxLength: 64 }), {
            maxItems: 200,
          }),
          via: t.Union([
            t.Literal("open"),
            t.Literal("action"),
            t.Literal("dismiss"),
          ]),
          deliveredAt: t.Optional(
            t.Record(
              t.String({ minLength: 1, maxLength: 64 }),
              t.Number({ minimum: 0 })
            )
          ),
        }),
      },
      ({ body }) => {
        notifications.dismiss(body.collapseIds, body.via, body.deliveredAt);
        return { ok: true };
      }
    )
    .get(
      "/api/notifications/cleared",
      { query: t.Object({ since: t.Numeric({ minimum: 0 }) }) },
      ({ query }) => ({
        cleared: db.notifications
          .clearedSince(new Date(query.since))
          .map((row) => ({
            collapseId: row.collapseId,
            at: row.clearedAt.getTime(),
          })),
      })
    );
