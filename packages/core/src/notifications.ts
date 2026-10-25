/**
 * Where the owner is, and which notifications are over: the shapes the hub,
 * the dashboard and the apps share (hub notifications.ts).
 *
 * Each device says three things apart: which chat it has in front and read
 * (`active` and `sessionId`), when the person last gave it input (`idleMs`),
 * and what its machine is doing, in use, idle, locked or asleep (`machine`,
 * from Chromium's Idle Detection on a tab, the desktop on a machine's
 * agent). The hub rolls every device up to one {@link Person}: here, on
 * which chat, or away. Input decides it: a chat merely open, visible and
 * focused is no input, and a machine's word can only make them away sooner.
 *
 * A notification about a session is dropped when a client had that session
 * in front, foreground and focused, at any moment since it landed: the owner
 * saw it there. One that is over is cleared on every device, by its collapse
 * id.
 */

/** Which client reports presence. */
export type PresenceClient = "web" | "ios" | "mac";

/** What a machine's own desktop says of it. */
export type MachineState = "active" | "idle" | "locked" | "asleep";

/**
 * `POST /api/presence`, sent on every change and every
 * {@link PRESENCE_BEAT_MS}. A client is active on a session while `active`
 * and `sessionId` is it, until {@link PRESENCE_TTL_MS} pass without a beat.
 * The iOS and Mac apps send the first five fields alone: the chat in front,
 * and no input time, so the hub counts their coming to a chat (from none,
 * from another, from inactive) as their input, and a beat that says the
 * same again as none (hub notifications.ts `inputOf`).
 */
export interface PresenceBeat {
  /** The chat `sessionId` is in front and read: the window visible, focused and taking input. */
  readonly active: boolean;
  /**
   * This tab may show desktop notifications (the Notification permission is
   * granted): the hub hands its desk alerts only to a tab that can show
   * them. Web only.
   */
  readonly alerts?: boolean;
  readonly client: PresenceClient;
  /** Stable per browser tab or app install. */
  readonly clientId: string;
  /**
   * How long since the last input anywhere on this computer, ms as of
   * `saidAt`, as Chromium's Idle Detection reads it once the person granted
   * it and left it on (its threshold the away clock): 0 while it says the
   * person is active, the clock plus the time since it said idle after.
   * The hub reads it as it reads an opted-in machine's desktop: it keeps the
   * person here (elsewhere, with the tab hidden) while the computer sees
   * input. Absent while Idle Detection does not run, and while locked.
   */
  readonly deskIdleMs?: number;
  /**
   * This tab runs on a phone or tablet (a coarse pointer that can't hover):
   * while it has the person's newest input, what needs them goes to the
   * phone, never to a desk tab. The iOS app is one by its `client`. Web only.
   */
  readonly handheld?: boolean;
  /**
   * How long since the person's last input on this client, ms as of
   * `saidAt`: on a tab, the page's own last key, pointer press or move,
   * wheel or touch, a preview frame's included (dashboard reload.svelte.ts
   * `watchInput`); absent while it has had none since it loaded. Never the
   * machine's idle reading: that is `machine`. Web only, for now.
   */
  readonly idleMs?: number;
  /**
   * The machine, as Chromium's Idle Detection reads it once the person
   * allowed it; absent where the browser has none (Safari, Firefox) or it
   * is not allowed.
   */
  readonly machine?: MachineState;
  /**
   * When the client said this, epoch ms on its own clock. Beats can land out
   * of order (two connections, a page's last beacon), so the hub keeps the
   * newest said and drops an older one.
   */
  readonly saidAt: number;
  /** The session in front, or null when none is. */
  readonly sessionId: string | null;
}

/**
 * A machine's activity as its desktop reads it (agent activity.ts), on its
 * agent's heartbeat. `idleMs` is the time since the last keyboard or pointer
 * input there; `source` names what read it, for the hub's log.
 */
export interface MachineActivity {
  readonly idleMs: number;
  readonly source: string;
  readonly state: MachineState;
}

/** How often a client beats. */
export const PRESENCE_BEAT_MS = 30_000;
/** A client silent this long no longer has its chat in front. */
export const PRESENCE_TTL_MS = 60_000;
/**
 * A device silent this long says nothing of the machine any more: unknown,
 * its last input still counting toward the away clock. Longer than a beat
 * because a hidden tab's timers run at most once a minute (Chrome's
 * intensive throttling).
 */
export const DEVICE_TTL_MS = 150_000;
/**
 * A machine's agent silent this long says nothing of its desktop any more:
 * three of its 15 s heartbeats missed, as a Mac asleep stops beating.
 */
export const MACHINE_TTL_MS = 45_000;
/**
 * The away clock until the person sets their own (the owner's pick: 5
 * minutes, "configurable"): no input on any device this long, and the
 * person is away. The same clock says how far back a push held at a desk
 * follows them to the phone once they are away (the owner's "only items
 * from the last 10 min", on this clock): it went only if it landed at most
 * one away clock before their last input.
 */
export const AWAY_AFTER_DEFAULT_MS = 5 * 60_000;
/** The shortest away clock the person can set. Our call. */
export const AWAY_AFTER_MIN_MS = 60_000;
/** The longest away clock the person can set. Our call. */
export const AWAY_AFTER_MAX_MS = 4 * 60 * 60_000;
/** The away clocks the presence menu offers, ms. Our call, the default among them. */
export const AWAY_AFTER_CHOICES_MS = [
  5 * 60_000,
  10 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
] as const;

/** `POST /api/person/away-clock`: the person's away clock, ms. */
export interface AwayClockSet {
  readonly awayAfterMs: number;
}
/**
 * How long the tab a desk alert went to has to answer it: a tab that says
 * nothing in this time is gone (closed without its last beacon, its
 * machine asleep), is no longer an alert target, and the item goes on to
 * the next place. Our call: a live tab's socket hears a frame within
 * milliseconds, hidden or not.
 */
export const DESK_ACK_MS = 5000;

/**
 * How a tab took a desk alert (`POST /api/presence/desk-ack`): shown as a
 * desktop notification, seen in the page itself (the person is on the
 * tab), or refused (this browser may not show one).
 */
export type DeskAckHow = "notification" | "page" | "refused";

/** A tab's answer to a desk alert it was named for. */
export interface DeskAck {
  readonly clientId: string;
  readonly collapseId: string;
  readonly how: DeskAckHow;
}

/** One device as the person's presence menu lists it: a machine whose agent reads its desktop. */
export interface PresenceDevice {
  /** It counts toward whether you're here: the person turned it on (off until they do). */
  readonly counts: boolean;
  /** The machine's id. */
  readonly id: string;
  /** The machine's name, as the fleet shows it. */
  readonly name: string;
  /** What its desktop says now; null when it hasn't said for {@link MACHINE_TTL_MS}. */
  readonly state: MachineState | null;
}

/**
 * The person, as the hub rolls every device up (hub notifications.ts
 * `rollup`), in order: Appear away first; then a lock or sleep newer than
 * every input means away at once; then away once the away clock
 * passes with no input on any device, whatever is open; else here, on the
 * chat in front on the device that had the newest input.
 */
export interface Person {
  /** The person turned Appear away on. */
  readonly manual: boolean;
  /** The chat in front and read on the device that had the newest input, when here on one. */
  readonly on: string | null;
  /** Away: since their last input or the lock, epoch ms; null when here, or no device has ever said. */
  readonly since: number | null;
  readonly state: "here" | "away";
}

/** The socket's `person` frame, and `GET /api/person` beside its {@link PersonRead}: the person, their away clock, and the machines that can count toward it. */
export interface PersonView extends Person {
  /** The away clock, ms: the person's setting, else {@link AWAY_AFTER_DEFAULT_MS}. */
  readonly awayAfterMs: number;
  readonly devices: readonly PresenceDevice[];
}

/**
 * `GET /api/person`: the view, and the machine the asking browser is on, as
 * the hub ties it by the address the request came from (hub
 * notifications.ts `machineAt`); null when no one machine is. Each browser
 * reads its own: the `person` frame, the same to every dashboard, never
 * carries it.
 */
export interface PersonRead extends PersonView {
  readonly thisMachine: string | null;
}

/** Hub-originated: the person and the machines that count, whole, on each change. */
export interface PersonFrame {
  instanceId?: undefined;
  kind: "person";
  person: PersonView;
}

/**
 * The socket frame that shows something that needs the person on the
 * desk they are at, in place of a phone push (hub push.ts): the tab named
 * `to` shows it as a desktop notification, and answers with a
 * {@link DeskAck}. Its words are the real ones: it never leaves the
 * person's network.
 */
export interface DeskAlertFrame {
  body: string;
  /** The notification's tag: a newer one under it replaces the older. */
  collapseId: string;
  instanceId?: undefined;
  kind: "desk_alert";
  /**
   * A newer alert under its tag alerts again rather than replacing the older
   * in silence: an artifact's (one tag per artifact, hub push.ts `pinAsked`).
   */
  renotify: boolean;
  /** Where it opens: the session it is about; null opens Needs you. */
  session: string | null;
  title: string;
  /** The tab to show it: the one in use, by its presence id. */
  to: string;
}

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
