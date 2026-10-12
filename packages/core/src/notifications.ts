/**
 * Where the owner is, and which notifications are over: the shapes the hub,
 * the dashboard and the apps share (hub notifications.ts).
 *
 * A notification about a session is held while a client has that session in
 * front, foreground and focused, and goes when none does (Zulip's rule: hold,
 * then re-check the item still needs you). One that is over is cleared on
 * every device, by its collapse id.
 */

/** Which client reports presence. */
export type PresenceClient = "web" | "ios" | "mac";

/**
 * `POST /api/presence`, sent on every change and every
 * {@link PRESENCE_BEAT_MS} while active. A client is active on a session
 * while `active` and `sessionId` is it, until {@link PRESENCE_TTL_MS} pass
 * without a beat.
 */
export interface PresenceBeat {
  readonly active: boolean;
  readonly client: PresenceClient;
  /** Stable per browser tab or app install. */
  readonly clientId: string;
  /** The session in front, or null when none is. */
  readonly sessionId: string | null;
}

/** How often an active client beats. */
export const PRESENCE_BEAT_MS = 30_000;
/** A client silent this long is gone. */
export const PRESENCE_TTL_MS = 60_000;

/** How a device let go of a notification. */
export type DismissVia = "open" | "action" | "dismiss";

/** `POST /api/notifications/dismiss`: a device acted on, opened or individually dismissed these. */
export interface NotificationsDismiss {
  readonly collapseIds: readonly string[];
  /**
   * When this device delivered each id, epoch ms on its own clock. The hub
   * keeps an id it has sent again since (more than 120 s after, for clock
   * drift): that newer notification is not the one dismissed. Ids without
   * one (a live open, action or swipe of an unrecorded id) clear as given.
   */
  readonly deliveredAt?: Readonly<Record<string, number>>;
  readonly via: DismissVia;
}

/** `GET /api/notifications/cleared?since=<ms>`: everything cleared since then, newest first. */
export interface NotificationsClearedRead {
  readonly cleared: readonly {
    readonly at: number;
    readonly collapseId: string;
  }[];
}

/** The socket frame every connected client gets as soon as ids clear. */
export interface NotificationsClearedFrame {
  readonly collapseIds: readonly string[];
  readonly type: "notificationsCleared";
}
