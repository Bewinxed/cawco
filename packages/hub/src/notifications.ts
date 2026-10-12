/**
 * One gate for every notification about a session, and one ledger of the
 * ones that are over (core notifications.ts has the shapes).
 *
 * **Presence and the hold.** Each client (a dashboard tab, the iOS app, the
 * Mac app) says which session it has in front and whether it is truly
 * foreground, visible and focused (`POST /api/presence`). While any client is
 * active on a session, every notification about it (a push, a Telegram
 * needs-you message) is held, keyed by its outlet and collapse id; nothing is
 * shown on another device for the conversation the owner is reading. When the
 * session stops having an active client (a beat that says so, or a client
 * silent for {@link PRESENCE_TTL_MS}), each held item is re-checked and sent
 * if it still needs the owner, else dropped: Zulip's rule (hold, then check
 * the message is still unread at send time). Only a focused foreground client
 * counts: Matrix's push bugs came from a backgrounded app counting as viewing.
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
import { detach } from "@cawco/core/detach";
import { Elysia, t } from "elysia";
import type { DbShape } from "./db";
import type { HubLifetimeShape } from "./lifetime";
import type { RegistryShape } from "./registry";

/** How often expired clients are swept. */
const SWEEP_MS = 10_000;
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
/** The supervisor's escalation about a session (Telegram only). */
export const supervisorCollapseId = (instanceId: string): string =>
  collapseOf("supervisor", instanceId);

/** Where a notification is shown: one held item per outlet and collapse id. */
type Outlet = "push" | "telegram";

/** One notification about a session, offered to the gate by its outlet. */
export interface Offer {
  readonly collapseId: string;
  /**
   * Whether it still needs the owner when its hold lifts: an ask still
   * pending, a turn whose session nobody looked at since. False drops it.
   */
  readonly due: () => boolean | Promise<boolean>;
  /** The session it is about; null goes at once, nobody can be reading it. */
  readonly instanceId: string | null;
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
  /** Held items by `outlet:collapseId`. */
  const held = new Map<string, Offer>();
  const listeners: ClearListener[] = [];
  /** The sessions some client was active on at the last look: a session that leaves it releases. */
  let watched = new Set<string>();
  /** Counts clears: an outlet compares it to what it last told a device. */
  let clears = 0;

  const isActive = (client: Client, now: number): boolean =>
    client.active &&
    client.sessionId !== null &&
    now - client.at < PRESENCE_TTL_MS;

  const activeSessions = (now: number): Set<string> => {
    const sessions = new Set<string>();
    for (const client of clients.values()) {
      if (isActive(client, now) && client.sessionId) {
        sessions.add(client.sessionId);
      }
    }
    return sessions;
  };

  /** Re-checks what was held for a session nobody is active on any more: still due, it goes; else it drops. */
  const release = (instanceId: string): void => {
    for (const [key, offer] of held) {
      if (offer.instanceId !== instanceId) {
        continue;
      }
      held.delete(key);
      detach(
        Promise.resolve(offer.due()).then((due) => {
          console.log(
            `[notify] ${offer.outlet} ${offer.collapseId}: hold lifted, ${due ? "sent" : "dropped (no longer needs you)"}`
          );
          if (due) {
            offer.send();
          }
        }),
        "notification release"
      );
    }
  };

  /** Compares who is active now with the last look and releases every session that lost its last client. */
  const settlePresence = (): void => {
    const now = Date.now();
    const active = activeSessions(now);
    const lost = [...watched].filter((id) => !active.has(id));
    watched = active;
    for (const instanceId of lost) {
      release(instanceId);
    }
  };

  lifetime.every(SWEEP_MS, () => {
    const now = Date.now();
    for (const [clientId, client] of clients) {
      if (now - client.at >= PRESENCE_TTL_MS) {
        clients.delete(clientId);
      }
    }
    settlePresence();
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
    // A device's dismiss or a settled ask is over for good: what is still
    // held for it never goes. A look leaves the hold to its own check.
    if (via !== "look") {
      for (const [key, offer] of held) {
        if (collapseIds.includes(offer.collapseId)) {
          held.delete(key);
        }
      }
    }
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
      clients.set(beat.clientId, {
        client: beat.client,
        sessionId: beat.sessionId,
        active: beat.active,
        at: Date.now(),
      });
      settlePresence();
    },

    /** Whether some client is active on the session now. */
    activeOn(instanceId: string): boolean {
      return activeSessions(Date.now()).has(instanceId);
    },

    /**
     * The one way a notification about a session goes out: held while a
     * client is active on its session (a newer offer under the same outlet
     * and collapse id replaces the held one), sent now otherwise.
     */
    offer(offer: Offer): void {
      if (
        offer.instanceId &&
        activeSessions(Date.now()).has(offer.instanceId)
      ) {
        held.set(`${offer.outlet}:${offer.collapseId}`, offer);
        console.log(
          `[notify] ${offer.outlet} ${offer.collapseId}: held, ${offer.instanceId} is in front`
        );
        return;
      }
      offer.send();
    },

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
