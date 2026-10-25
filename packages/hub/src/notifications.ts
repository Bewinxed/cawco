/**
 * One gate for every notification about a session, and one ledger of the
 * ones that are over (core notifications.ts has the shapes).
 *
 * **Presence and the gate.** Each client (a dashboard tab, the iOS app, the
 * Mac app) says which session it has in front and whether it is truly
 * foreground, visible and focused (`POST /api/presence`). Only a focused
 * foreground client counts: Matrix's push bugs came from a backgrounded app
 * counting as viewing. A notification about a session (a finished turn, an
 * ask, a task's attempt, fleet watch's notice, a session's message) shows in
 * that session, so the owner saw it if some client was active on the session
 * at any moment from when it landed to when it is offered: the gate drops it
 * and never sends it later. The hub settles this from the
 * presence it holds, not from a client remembering to post a look. Anything
 * else goes at once. Items that land while nobody is in front keep Zulip's
 * hold-then-recheck in their outlet: a finished turn waits a grace and goes
 * only if nobody looked at its session meanwhile (push.ts `turnEnded`), and
 * the push outlet holds what isn't an ask for its burst and asks the gate
 * again as the burst goes out (push.ts `arrive`).
 * A client is active until it says otherwise or is silent for
 * {@link PRESENCE_TTL_MS}; every change of a client's presence is logged.
 *
 * **The person.** Every device's facts roll up to one {@link Person}
 * ({@link rollup}): a tab's or an app's chat in front and the person's last
 * input there, a tab's Idle Detection reading, and a machine's desktop from
 * its agent's heartbeat (only for a machine the person opted in:
 * `presence_devices`). Input decides it, never a beat: a tab open, visible
 * and focused with nobody at it is no input. Appear away comes first; then
 * a lock or sleep newer than every input means away at once; then no input
 * on any device for the away clock (the person's setting,
 * {@link AWAY_AFTER_DEFAULT_MS} until they set it) means away since the
 * last; else here, on the chat in front on the device that had the newest input, so
 * two clients on two chats never take it in turn on their beats. A
 * device silent past its time is unknown, never gone: its last input still
 * counts toward the clock. Each device's last word and the last away
 * stretch are kept on the hub (`presence_clients`, `presence_settings`),
 * so a restart reads the person back as they were; never a history. Each
 * change goes to every dashboard (`person`), to the push outlet (push.ts
 * holds a phone push while the person is at a desk) and to the hand of
 * each send (server.ts, the presence line, and the recap on the person's
 * first message to a session after a real return).
 *
 * **Clears.** A notification is over when its ask settles, its session is
 * looked at (`/api/seen` `look`), or a device acted on, opened or dismissed
 * it (`POST /api/notifications/dismiss`; a dismissal that names when the
 * device delivered an id leaves it standing if the hub sent it again since).
 * Only what was shown is cleared, so
 * looking at a session no notification named sends nothing anywhere. Each
 * clear is written down (`notification_cleared`, kept three days) and goes
 * out at once on the socket (`notificationsCleared`); the push outlet hears
 * it too: it queues a background push per device and carries the cleared ids
 * on every visible push. iOS cannot remove a delivered notification without waking the
 * app, which is why the clear goes every way at once.
 */
import { createHash } from "node:crypto";
import { networkInterfaces } from "node:os";
import {
  AWAY_AFTER_DEFAULT_MS,
  AWAY_AFTER_MAX_MS,
  AWAY_AFTER_MIN_MS,
  DEVICE_TTL_MS,
  type DeskAck,
  type DismissVia,
  MACHINE_TTL_MS,
  type MachineActivity,
  type MachineState,
  machineLabel,
  type NotificationsClearedFrame,
  type Person,
  type PersonRead,
  type PersonView,
  PRESENCE_TTL_MS,
  type PresenceBeat,
  type PresenceClient,
  type PresenceDevice,
  presenceLogWords,
} from "@cawco/core";
import { plainAddress } from "@cawco/core/public-address";
import { Elysia, t } from "elysia";
import type { AwayStretch, DbShape, PresenceClientRow } from "./db";
import { addressOf } from "./hub-auth";
import type { HubLifetimeShape } from "./lifetime";
import type { RegistryShape } from "./registry";
import { askedFrom } from "./relay-journey";

/** How often expired clients are swept, and the away clock read. */
const SWEEP_MS = 10_000;
/**
 * Two beats whose input lands this close on the hub's clock say the same
 * input: a beat's travel moves `now - idleMs` by a few milliseconds, and a
 * beat with no new input must move nothing. Our call.
 */
const SAME_INPUT_MS = 2000;
/** How long a client silent since is kept, unknown: a day. */
const CLIENT_KEPT_MS = 24 * 60 * 60_000;
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

/** An ask's collapse id, the same on every device. */
export const askCollapseId = (requestId: string): string =>
  collapseOf("ask", requestId);
/** A session's finished turn: one per session, a newer turn replaces the older. */
export const turnCollapseId = (instanceId: string): string =>
  collapseOf("turn", instanceId);
/** An artifact a turn left waiting on the person: one per artifact, a revision's push replaces the older, and a look at it takes it down. */
export const artifactCollapseId = (artifactId: string): string =>
  collapseOf("artifact", artifactId);
/** A session's message to the person (`send_to_user`): one per session, a newer replaces the older. */
export const messageCollapseId = (instanceId: string): string =>
  collapseOf("message", instanceId);
/** A task waiting on the owner: its move and its failed attempt are one notification. */
export const taskCollapseId = (projectId: string, taskId: string): string =>
  collapseOf("task", `${projectId}:${taskId}`);
/** A device asking to pair (hub-auth.ts), by the code it shows: one per pairing. */
export const pairingCollapseId = (userCode: string): string =>
  collapseOf("pairing", userCode);
/** An install of a machine that ended (installs.ts): one per install. */
export const installCollapseId = (id: string): string =>
  collapseOf("install", id);
/** A fleet MCP server whose sign-in ended without the person (fleet-mcp.ts): one per server. */
export const mcpCollapseId = (name: string): string => collapseOf("mcp", name);
/** A machine the hub lost (machine-contact.ts): one per machine. */
export const machineCollapseId = (machineId: string): string =>
  collapseOf("machine", machineId);
/** A burst of things that need you shown as one notification (push.ts), by when it began. */
export const needsCollapseId = (firstAt: number): string =>
  collapseOf("needs", firstAt.toString(36));

/** One notification about a session, offered to the gate by the push outlet. */
export interface Offer {
  readonly collapseId: string;
  /** The session it is about; null goes at once, nobody can be reading it. */
  readonly instanceId: string | null;
  /** When it happened in its session (a turn's end, an ask parking), epoch ms on the hub's clock. */
  readonly landedAt: number;
}

/** Why ids cleared: a device's own `via`, an ask settling, or its session looked at. */
export type ClearedVia = DismissVia | "settled" | "look";

/** What an outlet hears when ids clear. */
export type ClearListener = (collapseIds: string[], via: ClearedVia) => void;

interface Client {
  readonly active: boolean;
  /** It can show a desktop notification (web). */
  readonly alerts: boolean;
  readonly at: number;
  readonly client: PresenceClient;
  /**
   * The last input on its computer, anywhere on it, as the tab's Idle
   * Detection reads it (`deskIdleMs`), on the hub's clock; null while it
   * reads none (not granted, turned off, not in this browser).
   */
  readonly deskInputAt: number | null;
  /** It runs on a phone or tablet: the iOS app, or a tab under a coarse pointer. */
  readonly handheld: boolean;
  /** The person's last input on it, on the hub's clock; null when it never said. */
  readonly inputAt: number | null;
  /** Since when it has said locked or asleep, on the hub's clock. */
  readonly lockedAt: number | null;
  /** Its machine's word (Idle Detection); null when it says none. */
  readonly machine: MachineState | null;
  /** The machine it runs on, as the hub ties its address (`machineAt`); null when no one machine is. */
  readonly machineId: string | null;
  /** The client's own clock when it said this beat. */
  readonly saidAt: number;
  readonly sessionId: string | null;
}

/** A machine's desktop as its agent last said it. */
interface MachineWord {
  readonly at: number;
  /** The last keyboard or pointer input there, as its desktop read it. */
  readonly inputAt: number;
  readonly lockedAt: number | null;
  readonly source: string;
  readonly state: MachineState;
}

/**
 * One device's facts as the rollup reads them, on the hub's clock: a tab, an
 * app install, a machine through its agent, or a send from a device that
 * names none.
 */
export interface DeviceFacts {
  /** When it last said anything. */
  readonly at: number;
  /** The chat it has in front and read, or null. */
  readonly front: string | null;
  /** A phone or tablet: what needs the person goes to the phone while it is the one in use. */
  readonly handheld: boolean;
  /** How long its machine word holds after it said it: an agent's 15 s beats, a hidden tab's minute. */
  readonly holdsMs: number;
  readonly id: string;
  /** When the person last touched it; null when it never said. */
  readonly inputAt: number | null;
  /**
   * What it is, for where a desk alert or a push goes. A `machine` is a
   * computer's desktop as something reads it: its agent, or a tab's Idle
   * Detection; one rule reads both.
   */
  readonly kind: PresenceClient | "machine" | "send";
  /** Since when it has said locked or asleep. */
  readonly lockedAt: number | null;
  /** Its machine's word; null when it says none. */
  readonly machine: MachineState | null;
  /** The machine it is, or runs on; null when no one machine is known. */
  readonly machineId: string | null;
}

/** The person, and what the outlets read beside: their last input and the device in use. */
export interface Rolled extends Person {
  /** The device the person touched last, while here; null when away. */
  readonly inUse: DeviceFacts | null;
  /** The newest input on any device, the lock aside; null when none ever said. */
  readonly lastInputAt: number | null;
  /** Why, in words, for the log. */
  readonly why: string;
}

/** A lock or sleep: the device says nothing of the person but that they left it. */
const gone = (machine: MachineState | null): boolean =>
  machine === "locked" || machine === "asleep";

/** An input said again: the one kept, when the new reading lands within {@link SAME_INPUT_MS} of it. */
const sameInput = (said: number, kept: number | null): number =>
  kept !== null && Math.abs(said - kept) < SAME_INPUT_MS ? kept : said;

/**
 * The person's last input on a client, as its beat says it:
 * - a tab's `idleMs` (its page's own last input), the same input said again
 *   kept as it was ({@link sameInput});
 * - a tab saying none (no input since it loaded): what it said before;
 * - an app that says no input time (the iOS and Mac apps today): its coming
 *   to a chat, from none, another or inactive, is the person's tap; a beat
 *   saying the same again, or a first beat the hub already kept from before
 *   its restart, is no input.
 */
const inputOf = (
  beat: PresenceBeat,
  before: Client | undefined,
  now: number
): number | null => {
  const kept = before?.inputAt ?? null;
  if (beat.idleMs !== undefined) {
    return sameInput(now - beat.idleMs, kept);
  }
  if (beat.client === "web") {
    return kept;
  }
  const came =
    beat.active &&
    beat.sessionId !== null &&
    (before === undefined ||
      !before.active ||
      before.sessionId !== beat.sessionId);
  return came ? now : kept;
};

/**
 * A tab's computer's last input while its Idle Detection runs (`deskIdleMs`),
 * the same input said again kept as it was; none said, none counts (not
 * granted, turned off, locked).
 */
const deskInputOf = (
  beat: PresenceBeat,
  before: Client | undefined,
  now: number
): number | null =>
  beat.deskIdleMs === undefined
    ? null
    : sameInput(now - beat.deskIdleMs, before?.deskInputAt ?? null);

/** Since when a device has said locked or asleep: kept from the word before while it still says so. */
const lockSince = (
  before: { readonly lockedAt: number | null } | undefined,
  machine: MachineState | null,
  now: number
): number | null => {
  if (!gone(machine)) {
    return null;
  }
  return before?.lockedAt ?? now;
};

/** A device as the log names it. */
const labelOf = (device: DeviceFacts): string =>
  device.kind === "send"
    ? "a send from no device that beats"
    : `${device.kind} ${device.id.slice(0, 8)}`;

/** The device with the newest input, or null when none has said any. */
const newestOf = (devices: readonly DeviceFacts[]): DeviceFacts | null =>
  devices.reduce<DeviceFacts | null>(
    (best, device) =>
      device.inputAt !== null &&
      (best === null || best.inputAt === null || device.inputAt > best.inputAt)
        ? device
        : best,
    null
  );

/**
 * THE ROLLUP: every device's facts to one person, at `now`, in order. Input
 * decides; a beat alone never does.
 *
 * 1. Appear away (`manualAt`): away, whatever any device says.
 * 2. A device whose machine is locked or asleep (and still said so within
 *    {@link MACHINE_TTL_MS} for a machine, {@link DEVICE_TTL_MS} for a tab)
 *    counts for nothing: neither its chat in front nor its input.
 * 3. A lock or sleep newer than every other input: away since it.
 * 4. THE AWAY CLOCK: no input on any device for `awayAfterMs` (the
 *    person's setting) is away since the last input, whatever tabs stand
 *    open, visible and focused. No input ever said is away.
 * 5. Else here. The chat is the one in front on the client (a tab, an app,
 *    the iPhone) that had the newest input, while it still has it in front
 *    and beats ({@link PRESENCE_TTL_MS}); a hidden or blurred tab has none
 *    in front, so the person is here, elsewhere. A computer's desktop (a
 *    machine the person opted in, through its agent; a tab's Idle
 *    Detection, once granted) counts with its input: it keeps them here,
 *    its lock or sleep is rule 3, and input on another known computer newer
 *    than that client's moves them off its chat. A beat with no new input
 *    never moves the chat.
 */
export const rollup = (
  devices: readonly DeviceFacts[],
  manualAt: number | null,
  awayAfterMs: number,
  now: number
): Rolled => {
  const usable = devices.filter(
    (device) => !(gone(device.machine) && now - device.at < device.holdsMs)
  );
  const newest = newestOf(usable);
  const lastInputAt = newest?.inputAt ?? null;
  const away = (since: number | null, why: string, manual = false): Rolled => ({
    state: "away",
    manual,
    on: null,
    since,
    inUse: null,
    lastInputAt,
    why,
  });
  if (manualAt !== null) {
    return away(manualAt, "Appear away is on", true);
  }
  const locks = devices.flatMap((device) =>
    gone(device.machine) &&
    device.lockedAt !== null &&
    now - device.at < device.holdsMs
      ? [{ device, at: device.lockedAt }]
      : []
  );
  const lock = locks.reduce<(typeof locks)[number] | null>(
    (best, one) => (best === null || one.at > best.at ? one : best),
    null
  );
  if (lock !== null && (lastInputAt === null || lock.at >= lastInputAt)) {
    return away(
      lock.at,
      `${labelOf(lock.device)} said ${lock.device.machine}, after the last input`
    );
  }
  if (newest === null || lastInputAt === null) {
    return away(null, "no device has said of any input");
  }
  const quiet = now - lastInputAt;
  if (quiet >= awayAfterMs) {
    return away(
      lastInputAt,
      `no input on any device for ${Math.round(awayAfterMs / 60_000)} min; the last was on ${labelOf(newest)}`
    );
  }
  const reader = newestOf(usable.filter((device) => device.kind !== "machine"));
  const movedOff =
    reader !== null &&
    newest.kind === "machine" &&
    newest.machineId !== null &&
    reader.machineId !== null &&
    newest.machineId !== reader.machineId &&
    (newest.inputAt ?? 0) - (reader.inputAt ?? 0) > SAME_INPUT_MS;
  const front =
    reader !== null && !movedOff && now - reader.at < PRESENCE_TTL_MS
      ? reader.front
      : null;
  let where = "no chat in front there";
  if (front) {
    where = "its chat in front";
  } else if (movedOff) {
    where = "newer than any chat's input";
  }
  return {
    state: "here",
    manual: false,
    on: front,
    since: null,
    inUse: newest,
    lastInputAt,
    why: `the newest input was on ${labelOf(newest)}, ${Math.round(quiet / 1000)}s ago, ${where}`,
  };
};

/** What hears the person change. */
export type PersonListener = (now: Rolled, before: Rolled) => void;

/** The person's state in the log's words: here on a chat, elsewhere, or away since when. */
const stateOf = (person: Rolled): string => {
  const since = person.since
    ? new Date(person.since).toISOString()
    : "never seen";
  if (person.state === "here") {
    return person.on
      ? presenceLogWords.hereOn(person.on)
      : presenceLogWords.elsewhere;
  }
  return person.manual
    ? presenceLogWords.appearingAway(since)
    : presenceLogWords.awaySince(since);
};

export interface NotificationsServices {
  readonly db: DbShape;
  /** The hub's own machine id, once read; null before. */
  readonly hubMachineId: () => string | null;
  readonly lifetime: HubLifetimeShape;
  readonly registry: RegistryShape;
}

/** 127.0.0.0/8 or ::1, as {@link plainAddress} leaves it. */
const LOOPBACK_V4 = /^127\./;
const isLoopback = (address: string): boolean =>
  address === "::1" || LOOPBACK_V4.test(address);

/** Every address the hub's own computer holds, on any interface. */
const ownAddresses = (): Set<string> =>
  new Set(
    Object.values(networkInterfaces()).flatMap((faces) =>
      (faces ?? []).map((face) => plainAddress(face.address))
    )
  );

export const createNotifications = ({
  db,
  hubMachineId,
  lifetime,
  registry,
}: NotificationsServices) => {
  const clients = new Map<string, Client>();
  /**
   * Per session, the last moment a client was known reading it, epoch ms:
   * stamped on every beat while one reads it, when a client leaves it, and
   * on each sweep up to the moment it stopped ({@link readUntil}).
   */
  const frontAt = new Map<string, number>();
  const listeners: ClearListener[] = [];
  /** Counts clears: an outlet compares it to what it last told a device. */
  let clears = 0;
  /** Each machine's desktop, as its agent last said it, by machine id: only a machine whose report the person turned on. */
  const machines = new Map<string, MachineWord>();
  /** The machines whose agent could read their desktop (`activityReadable`), on or off. */
  const readable = new Set<string>();
  /** Clients whose lapse was said: a lapsed client stays, unknown, its last input counting. */
  const lapsed = new Set<string>();
  /** The person's last send from a device that names none and beats on no chat it sent to, on the hub's clock. */
  let spokeAt: number | null = null;
  const personListeners: PersonListener[] = [];
  const ackListeners: ((ack: DeskAck) => void)[] = [];

  /** The away clock: the person's setting, else their pick. */
  const awayAfter = (): number =>
    db.presence.awayAfter() ?? AWAY_AFTER_DEFAULT_MS;

  /** A client's last word, kept on the hub: the restart reads it back. */
  const keepClient = (clientId: string, client: Client): void => {
    clients.set(clientId, client);
    db.presence.keepClient({
      clientId,
      kind: client.client,
      sessionId: client.sessionId,
      active: client.active,
      alerts: client.alerts,
      handheld: client.handheld,
      deskInputAt:
        client.deskInputAt === null ? null : new Date(client.deskInputAt),
      inputAt: client.inputAt === null ? null : new Date(client.inputAt),
      machine: client.machine,
      machineId: client.machineId,
      lockedAt: client.lockedAt === null ? null : new Date(client.lockedAt),
      source: null,
      saidAt: client.saidAt,
      at: new Date(client.at),
    });
  };

  const keepMachine = (machineId: string, word: MachineWord): void => {
    machines.set(machineId, word);
    db.presence.keepClient({
      clientId: machineId,
      kind: "machine",
      sessionId: null,
      active: false,
      alerts: false,
      handheld: false,
      deskInputAt: null,
      inputAt: new Date(word.inputAt),
      machine: word.state,
      machineId,
      lockedAt: word.lockedAt === null ? null : new Date(word.lockedAt),
      source: word.source,
      saidAt: word.at,
      at: new Date(word.at),
    });
  };

  const SEND_ID = "send";
  /** A tab's computer, as its Idle Detection reads it: the tab's id and this. */
  const DESK_OF = "#desk";
  const keepSpoke = (at: number): void => {
    spokeAt = at;
    db.presence.keepClient({
      clientId: SEND_ID,
      kind: "send",
      sessionId: null,
      active: false,
      alerts: false,
      handheld: false,
      deskInputAt: null,
      inputAt: new Date(at),
      machine: null,
      machineId: null,
      lockedAt: null,
      source: null,
      saidAt: at,
      at: new Date(at),
    });
  };

  /**
   * THE RESTART CHANGES NOTHING THE PERSON DID: each device's last word read
   * back as the hub last heard it. The hub heard nothing while it was down,
   * so each device's silence counts from the hub's last moment, not across
   * the gap (its beat time moves on by the gap); its input stays when it
   * was, so the away clock runs on through the restart as it would have.
   */
  const restore = (rows: readonly PresenceClientRow[]): void => {
    if (rows.length === 0) {
      return;
    }
    const now = Date.now();
    const heardLast = Math.max(...rows.map((row) => row.at.getTime()));
    const gap = Math.max(0, now - heardLast);
    for (const row of rows) {
      const at = row.at.getTime() + gap;
      const lockedAt = row.lockedAt?.getTime() ?? null;
      if (row.kind === "machine") {
        machines.set(row.clientId, {
          state: row.machine ?? "idle",
          inputAt: row.inputAt?.getTime() ?? row.at.getTime(),
          lockedAt,
          source: row.source ?? "kept",
          at,
        });
        continue;
      }
      if (row.kind === "send") {
        spokeAt = row.inputAt?.getTime() ?? null;
        continue;
      }
      clients.set(row.clientId, {
        client: row.kind,
        sessionId: row.sessionId,
        active: row.active,
        alerts: row.alerts,
        handheld: row.handheld,
        deskInputAt: row.deskInputAt?.getTime() ?? null,
        inputAt: row.inputAt?.getTime() ?? null,
        lockedAt,
        machine: row.machine,
        machineId: row.machineId,
        saidAt: row.saidAt,
        at,
      });
      if (now - at >= PRESENCE_TTL_MS) {
        lapsed.add(row.clientId);
      }
    }
    console.log(presenceLogWords.readBack(rows.length, Math.round(gap / 1000)));
  };
  restore(db.presence.clients());

  /**
   * Every device's facts, as the rollup reads them: each client; the
   * desktop of each machine the person opted in, as its agent reads it, and
   * of each tab's computer, as its Idle Detection reads it, one rule for
   * both; and a send from no device.
   */
  const facts = (): DeviceFacts[] => {
    const counted = db.presence.counted();
    return [
      ...[...clients].flatMap(([id, client]): DeviceFacts[] => [
        {
          id,
          kind: client.client,
          at: client.at,
          front: client.active ? client.sessionId : null,
          handheld: client.handheld,
          holdsMs: DEVICE_TTL_MS,
          inputAt: client.inputAt,
          lockedAt: client.lockedAt,
          machine: client.machine,
          machineId: client.machineId,
        },
        ...(client.deskInputAt === null
          ? []
          : [
              {
                id: `${id}${DESK_OF}`,
                kind: "machine" as const,
                at: client.at,
                front: null,
                handheld: false,
                holdsMs: DEVICE_TTL_MS,
                inputAt: client.deskInputAt,
                lockedAt: client.lockedAt,
                machine: client.machine,
                machineId: client.machineId,
              },
            ]),
      ]),
      ...[...machines]
        .filter(([id]) => counted.has(id))
        .map(([id, word]): DeviceFacts => ({
          id,
          kind: "machine",
          at: word.at,
          front: null,
          handheld: false,
          holdsMs: MACHINE_TTL_MS,
          inputAt: word.inputAt,
          lockedAt: word.lockedAt,
          machine: word.state,
          machineId: id,
        })),
      ...(spokeAt === null
        ? []
        : [
            {
              id: SEND_ID,
              kind: "send" as const,
              at: spokeAt,
              front: null,
              handheld: false,
              holdsMs: DEVICE_TTL_MS,
              inputAt: spokeAt,
              lockedAt: null,
              machine: null,
              machineId: null,
            },
          ]),
    ];
  };

  const manualAt = (): number | null =>
    db.presence.appearAway()?.getTime() ?? null;

  const rolled = (now = Date.now()): Rolled =>
    rollup(facts(), manualAt(), awayAfter(), now);

  /** The machines that can count: each one whose agent reads its desktop, and each one opted in. */
  const devices = (now: number): PresenceDevice[] => {
    const counted = db.presence.counted();
    const names = new Map(
      db.listAgents().map((agent) => [agent.machineId, agent.hostname])
    );
    return [...new Set([...readable, ...machines.keys(), ...counted])]
      .flatMap((id) => {
        const name = names.get(id);
        if (!name) {
          return [];
        }
        const word = machines.get(id);
        return [
          {
            id,
            name: machineLabel(name),
            counts: counted.has(id),
            state: word && now - word.at < MACHINE_TTL_MS ? word.state : null,
          },
        ];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const viewOf = (person: Rolled, now: number): PersonView => ({
    state: person.state,
    manual: person.manual,
    on: person.on,
    since: person.since,
    awayAfterMs: awayAfter(),
    devices: devices(now),
  });

  /**
   * The person's last away stretch, kept on the hub: opened as they go
   * away, ended by their return, and which sessions were given that
   * return's recap.
   */
  let stretch: AwayStretch = db.presence.stretch();
  const keepStretch = (next: AwayStretch): void => {
    stretch = next;
    db.presence.setStretch(next);
  };

  /** The person as last told, and the view the dashboards were last sent. */
  let told: Rolled = rolled();
  let toldView = JSON.stringify(viewOf(told, Date.now()));
  console.log(presenceLogWords.atStart(stateOf(told), told.why));
  // Away now with no stretch open (the first start, or the clock ran out
  // while the hub was down): the stretch opens at their last input. A
  // stretch already open stays as it was.
  if (
    told.state === "away" &&
    (stretch.awaySince === null || stretch.backAt !== null)
  ) {
    keepStretch({
      awaySince: new Date(told.since ?? Date.now()),
      backAt: null,
      recapped: [],
    });
  }

  /** The person went away, or came back: the stretch opens, or ends. */
  const turned = (person: Rolled, before: Rolled, now: number): void => {
    if (person.state === "away" && before.state === "here") {
      keepStretch({
        awaySince: new Date(person.since ?? now),
        backAt: null,
        recapped: [],
      });
      return;
    }
    if (
      person.state === "here" &&
      before.state === "away" &&
      stretch.awaySince !== null &&
      stretch.backAt === null
    ) {
      keepStretch({ ...stretch, backAt: new Date(now), recapped: [] });
      console.log(presenceLogWords.back(stretch.awaySince.toISOString()));
    }
  };

  /** Rolls the devices up again and, when the person or a device's word changed, tells everyone. */
  const reroll = (): void => {
    const now = Date.now();
    const person = rolled(now);
    const view = viewOf(person, now);
    const said = JSON.stringify(view);
    const before = told;
    const moved =
      person.state !== before.state ||
      person.on !== before.on ||
      person.manual !== before.manual ||
      person.since !== before.since;
    told = person;
    if (moved) {
      console.log(presenceLogWords.turned(stateOf(person), person.why));
      turned(person, before, now);
      for (const listener of personListeners) {
        listener(person, before);
      }
    }
    if (said !== toldView) {
      toldView = said;
      registry.broadcast({
        verb: "frames",
        machineId: "hub",
        payload: { kind: "person", person: view },
      });
    }
  };

  /**
   * The gate's word on one notification: false, said in the log, when a
   * client was reading its session at any moment since it landed.
   */
  const passes = (offer: Offer): boolean => {
    if (offer.instanceId && inFrontSince(offer.instanceId, offer.landedAt)) {
      console.log(
        `[notify] push ${offer.collapseId}: dropped, ${offer.instanceId} was in front since it landed ${Math.round((Date.now() - offer.landedAt) / 1000)}s ago`
      );
      return false;
    }
    return true;
  };

  /**
   * Until when a client counts as the person reading the chat in front
   * there: while it beats ({@link PRESENCE_TTL_MS}) with that chat in front
   * and read, its machine not locked, and the person's last input on it
   * inside the away clock. A tab open and focused with nobody at it read
   * nothing: what lands there goes to the person where they are. 0 when it
   * reads nothing under its last beat.
   */
  const readUntil = (client: Client): number => {
    if (
      !client.active ||
      client.sessionId === null ||
      client.inputAt === null ||
      gone(client.machine)
    ) {
      return 0;
    }
    const until = Math.min(
      client.at + PRESENCE_TTL_MS,
      client.inputAt + awayAfter()
    );
    return until > client.at ? until : 0;
  };

  const markFront = (instanceId: string, at: number): void => {
    frontAt.set(instanceId, Math.max(frontAt.get(instanceId) ?? 0, at));
  };

  /** Each client's reading, stamped up to now or the moment it stopped. */
  const markReading = (now: number): void => {
    for (const client of clients.values()) {
      const until = readUntil(client);
      if (until > 0 && client.sessionId) {
        markFront(client.sessionId, Math.min(until, now));
      }
    }
  };

  /** A client reading the session now, or one was at some moment since `since`. */
  const inFrontSince = (instanceId: string, since: number): boolean => {
    const now = Date.now();
    for (const client of clients.values()) {
      if (client.sessionId === instanceId && readUntil(client) > now) {
        return true;
      }
    }
    return (frontAt.get(instanceId) ?? 0) >= since;
  };

  const ago = (at: number | null, now: number): string =>
    at === null
      ? "no input yet"
      : `input ${Math.round((now - at) / 1000)}s ago`;

  const said = (clientId: string, client: Client, now: number): string =>
    `[presence] ${client.client} ${clientId.slice(0, 8)}: ${client.active && client.sessionId ? `active on ${client.sessionId}` : `inactive (${client.sessionId ?? "no session"} in front)`}, ${ago(client.inputAt, now)}${client.machine ? `, machine ${client.machine}` : ""}${client.handheld ? ", handheld" : ""}`;

  /**
   * A beat worth a log line: a new client, another session or state, one
   * that had lapsed (silent past the TTL, not yet swept) beating again, or
   * the person's input there after a quiet minute.
   */
  const worthSaying = (
    before: Client | undefined,
    client: Client,
    now: number
  ): boolean => {
    if (before === undefined) {
      return true;
    }
    const quiet = before.inputAt === null ? null : now - before.inputAt;
    return (
      before.sessionId !== client.sessionId ||
      before.active !== client.active ||
      before.machine !== client.machine ||
      now - before.at >= PRESENCE_TTL_MS ||
      (client.inputAt !== before.inputAt &&
        (quiet === null || quiet > PRESENCE_TTL_MS))
    );
  };

  lifetime.every(SWEEP_MS, () => {
    const now = Date.now();
    markReading(now);
    for (const [clientId, client] of clients) {
      if (now - client.at < PRESENCE_TTL_MS) {
        continue;
      }
      // Unknown, not gone: kept a day, its last input counting meanwhile.
      if (now - client.at > CLIENT_KEPT_MS) {
        clients.delete(clientId);
        lapsed.delete(clientId);
        db.presence.dropClient(clientId);
        continue;
      }
      if (lapsed.has(clientId)) {
        continue;
      }
      lapsed.add(clientId);
      if (client.active && client.sessionId) {
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
    // The away clock and every lapse move with time alone.
    reroll();
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
    /**
     * A client's beat: who it is, what it has in front, whether it is
     * active, and when the person last gave it input. `machineId` is the
     * machine the hub ties its address to (`machineAt`).
     */
    presence(beat: PresenceBeat, machineId: string | null = null): void {
      const now = Date.now();
      const before = clients.get(beat.clientId);
      // Said before the beat already kept: it landed late, and is over.
      if (before !== undefined && beat.saidAt < before.saidAt) {
        console.log(
          `[presence] ${beat.client} ${beat.clientId.slice(0, 8)}: a beat said ${before.saidAt - beat.saidAt}ms before the one kept landed late; dropped`
        );
        return;
      }
      // It read its chat up to this beat, or up to when it stopped,
      // whatever this beat says.
      const until = before === undefined ? 0 : readUntil(before);
      if (until > 0 && before?.sessionId) {
        markFront(before.sessionId, Math.min(until, now));
      }
      const machine = beat.machine ?? null;
      const inputAt = inputOf(beat, before, now);
      const client: Client = {
        client: beat.client,
        sessionId: beat.sessionId,
        active: beat.active,
        alerts: beat.alerts ?? false,
        handheld: beat.client === "ios" || (beat.handheld ?? false),
        deskInputAt: deskInputOf(beat, before, now),
        machine,
        machineId: beat.client === "web" ? machineId : null,
        inputAt,
        lockedAt: lockSince(before, machine, now),
        saidAt: beat.saidAt,
        at: now,
      };
      keepClient(beat.clientId, client);
      lapsed.delete(beat.clientId);
      if (readUntil(client) > now && client.sessionId) {
        markFront(client.sessionId, now);
      }
      if (worthSaying(before, client, now)) {
        console.log(said(beat.clientId, client, now));
      }
      reroll();
    },

    /**
     * The person's own send to `instanceId`: input, now, on the device it
     * came from. A tab names its presence (`presenceId`); an app that names
     * none is the app beating with that chat in front; else the send counts
     * as input on no device, toward the clock alone.
     */
    spoke(presenceId: string | undefined, instanceId: string): void {
      const now = Date.now();
      const named = presenceId ? clients.get(presenceId) : undefined;
      const [found] =
        named && presenceId
          ? [[presenceId, named] as const]
          : [...clients]
              .filter(
                ([, client]) =>
                  client.client !== "web" &&
                  client.active &&
                  client.sessionId === instanceId &&
                  now - client.at < PRESENCE_TTL_MS
              )
              .sort(([, a], [, b]) => b.at - a.at);
      if (found) {
        const [clientId, client] = found;
        keepClient(clientId, { ...client, inputAt: now });
        console.log(
          `[presence] ${client.client} ${clientId.slice(0, 8)}: the person's send to ${instanceId.slice(0, 8)}, counted as input there`
        );
      } else {
        keepSpoke(now);
        console.log(
          `[presence] the person's send to ${instanceId.slice(0, 8)} from no device that beats on it: counted as input`
        );
      }
      reroll();
    },

    /**
     * A machine's desktop, from its agent's heartbeat: in use, idle, locked
     * or asleep, and its last input. It counts toward the person once they
     * opt the machine in: its input keeps them here, a lock or sleep makes
     * them away at once.
     */
    machine(machineId: string, activity: MachineActivity): void {
      // Before the person's yes to this machine's report, and from the
      // moment it is off, nothing of its desktop is kept, logged or used:
      // its agent reads none then (`reportActivity`), and a word that
      // crossed the switch is dropped here.
      if (!db.presence.counted().has(machineId)) {
        return;
      }
      const now = Date.now();
      const before = machines.get(machineId);
      keepMachine(machineId, {
        state: activity.state,
        inputAt: sameInput(now - activity.idleMs, before?.inputAt ?? null),
        lockedAt: lockSince(before, activity.state, now),
        source: activity.source,
        at: now,
      });
      if (before?.state !== activity.state) {
        console.log(
          `[presence] machine ${machineId.slice(0, 8)}: ${activity.state} (${activity.source}, idle ${Math.round(activity.idleMs / 1000)}s)`
        );
      }
      reroll();
    },

    /** The person as every device rolls up now ({@link rollup}). */
    person(): Rolled {
      return told;
    },

    /** The person and the machines that can count, as the dashboards read them. */
    view(): PersonView {
      return viewOf(told, Date.now());
    },

    /**
     * The machine a browser asking from `address` is on, or null when no
     * one machine is. Loopback, or an address of the hub's own computer, is
     * the hub's machine. Any other is the one machine whose agent's socket
     * came from that address: a browser on a machine reaches the hub from
     * the address its agent does, straight or through that agent's loopback
     * dashboard (agent hub-loopback.ts). Two machines behind one address
     * (one NAT) tie to neither. `address` is what a proxy in front says the
     * browser asked from ({@link askedFrom}), so a page through Cloudflare
     * ties to no machine.
     */
    machineAt(address: string | null): string | null {
      if (!address) {
        return null;
      }
      const plain = plainAddress(address);
      if (isLoopback(plain) || ownAddresses().has(plain)) {
        return hubMachineId();
      }
      const matched = registry.machineIds().filter((id) => {
        const from = registry.address(id);
        return from !== undefined && plainAddress(from) === plain;
      });
      return matched.length === 1 ? (matched[0] ?? null) : null;
    },

    /** Appear away, on or off: kept on the hub until the person turns it off. */
    appearAway(on: boolean): PersonView {
      db.presence.setAppearAway(on, new Date());
      console.log(`[presence] Appear away ${on ? "on" : "off"}`);
      reroll();
      return viewOf(told, Date.now());
    },

    /**
     * Whether a machine's agent could read its desktop (its beat's
     * `activityReadable`): the presence menu offers its switch. Nothing of
     * the desktop itself.
     */
    readable(machineId: string, can: boolean): void {
      if (readable.has(machineId) === can) {
        return;
      }
      if (can) {
        readable.add(machineId);
      } else {
        readable.delete(machineId);
      }
      reroll();
    },

    /** Whether this machine's agent reads its desktop now: the person said yes to its report. */
    reports: (machineId: string): boolean =>
      db.presence.counted().has(machineId),

    /**
     * The person's yes or no to a machine's report: its agent reads its
     * desktop from the next beat's answer, or stops; off, nothing it said
     * is kept or used from this moment.
     */
    counts(machineId: string, on: boolean): PersonView {
      db.presence.setCounts(machineId, on);
      if (!on) {
        // Off at once: what it said is no longer kept or used.
        machines.delete(machineId);
        db.presence.dropClient(machineId);
      }
      console.log(
        `[presence] machine ${machineId.slice(0, 8)}: ${on ? "counts" : "does not count"} toward the person`
      );
      reroll();
      return viewOf(told, Date.now());
    },

    /**
     * The web tab a desk alert goes to: a computer's tab that can show one,
     * on the machine the person touched last when one is known (an opted-in
     * machine's desktop, or that tab's own input), else the one touched
     * last; never a phone's or a tablet's. Undefined when none can.
     */
    deskTab(): string | undefined {
      const now = Date.now();
      const at = told.inUse?.machineId ?? null;
      const [best] = [...clients]
        .filter(
          ([, client]) =>
            client.client === "web" &&
            !client.handheld &&
            client.alerts &&
            now - client.at < DEVICE_TTL_MS &&
            !gone(client.machine)
        )
        .sort(
          ([, a], [, b]) =>
            Number(at !== null && b.machineId === at) -
              Number(at !== null && a.machineId === at) ||
            (b.inputAt ?? b.at) - (a.inputAt ?? a.at) ||
            b.at - a.at
        );
      return best?.[0];
    },

    /**
     * A tab that did not answer a desk alert, or refused it: it is no longer
     * an alert target until it beats again saying it can show one.
     */
    dropDeskTab(clientId: string): void {
      const client = clients.get(clientId);
      if (client?.alerts) {
        keepClient(clientId, { ...client, alerts: false });
      }
    },

    /** The away clock, ms: the person's setting, else their pick (5 minutes). */
    awayAfter,

    /** The person sets the away clock: every rule that reads it reads it from here on. */
    setAwayAfter(ms: number): PersonView {
      db.presence.setAwayAfter(ms);
      console.log(
        `[presence] the away clock: ${Math.round(ms / 60_000)} min without input on any device`
      );
      reroll();
      return viewOf(told, Date.now());
    },

    /**
     * The last return's recap for one session, once: when the person came
     * back after an away stretch, the first time this session is handed
     * their own message after it; null after that, and while there was no
     * return. Kept on the hub, so a restart gives it neither twice nor
     * again.
     */
    takeRecap(instanceId: string): { at: number; since: number } | null {
      const { awaySince, backAt, recapped } = stretch;
      if (!(awaySince && backAt) || recapped.includes(instanceId)) {
        return null;
      }
      keepStretch({ ...stretch, recapped: [...recapped, instanceId] });
      return { since: awaySince.getTime(), at: backAt.getTime() };
    },

    /** A tab's answer to a desk alert it was named for; the push outlet hears it. */
    deskAck(ack: DeskAck): void {
      for (const listener of ackListeners) {
        listener(ack);
      }
    },

    /** The push outlet hears every tab's answer to a desk alert. */
    onDeskAck(listener: (ack: DeskAck) => void): void {
      ackListeners.push(listener);
    },

    /** An outlet hears the person change: here, on another chat, or away. */
    onPerson(listener: PersonListener): void {
      personListeners.push(listener);
    },

    /**
     * The gate: false when a client was active on the notification's session
     * at any moment since it landed (the owner saw it there). Push asks it
     * for each item of a burst as the burst goes out (push.ts `arrive`).
     */
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
          alerts: t.Optional(t.Boolean()),
          handheld: t.Optional(t.Boolean()),
          idleMs: t.Optional(t.Number({ minimum: 0 })),
          deskIdleMs: t.Optional(t.Number({ minimum: 0 })),
          machine: t.Optional(
            t.Union([
              t.Literal("active"),
              t.Literal("idle"),
              t.Literal("locked"),
              t.Literal("asleep"),
            ])
          ),
        }),
      },
      ({ body, request, server }) => {
        notifications.presence(
          body,
          notifications.machineAt(
            askedFrom(
              request.headers,
              addressOf(server as Parameters<typeof addressOf>[0], request)
            )
          )
        );
        return { ok: true };
      }
    )
    .post(
      "/api/presence/desk-ack",
      {
        body: t.Object({
          clientId: t.String({ minLength: 1, maxLength: 200 }),
          collapseId: t.String({ minLength: 1, maxLength: 64 }),
          how: t.Union([
            t.Literal("notification"),
            t.Literal("page"),
            t.Literal("refused"),
          ]),
        }),
      },
      ({ body }) => {
        notifications.deskAck(body);
        return { ok: true };
      }
    )
    .get("/api/person", ({ request, server }): PersonRead => ({
      ...notifications.view(),
      thisMachine: notifications.machineAt(
        askedFrom(
          request.headers,
          addressOf(server as Parameters<typeof addressOf>[0], request)
        )
      ),
    }))
    .post(
      "/api/person/away",
      { body: t.Object({ on: t.Boolean() }) },
      ({ body }) => notifications.appearAway(body.on)
    )
    .post(
      "/api/person/away-clock",
      {
        body: t.Object({
          awayAfterMs: t.Integer({
            minimum: AWAY_AFTER_MIN_MS,
            maximum: AWAY_AFTER_MAX_MS,
          }),
        }),
      },
      ({ body }) => notifications.setAwayAfter(body.awayAfterMs)
    )
    .post(
      "/api/person/devices/:machineId",
      {
        params: t.Object({ machineId: t.String({ minLength: 1 }) }),
        body: t.Object({ counts: t.Boolean() }),
      },
      ({ params, body }) => notifications.counts(params.machineId, body.counts)
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
