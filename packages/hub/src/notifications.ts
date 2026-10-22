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
 * ({@link rollup}): a tab's or an app's chat in front, a tab's Idle
 * Detection reading, and a machine's desktop from its agent's heartbeat
 * (only for a machine the person opted in: `presence_devices`). Appear away
 * comes first; then any device in use means here, on the chat in front
 * there; then a lock or sleep newer than every input means away at once;
 * then here until {@link AWAY_AFTER_MS} pass with no input anywhere. A
 * device silent past its time is unknown, never gone: its last input still
 * counts toward the clock. Only state words and the switches are kept,
 * never a history. Each change goes to every dashboard (`person`), to the
 * push outlet (push.ts holds a phone push while the person is at a desk)
 * and to the hand of each send (server.ts, the presence line).
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
import {
  AWAY_AFTER_MS,
  DEVICE_TTL_MS,
  type DismissVia,
  MACHINE_TTL_MS,
  type MachineActivity,
  type MachineState,
  machineLabel,
  type NotificationsClearedFrame,
  type Person,
  type PersonView,
  PRESENCE_TTL_MS,
  type PresenceBeat,
  type PresenceClient,
  type PresenceDevice,
} from "@cawco/core";
import { Elysia, t } from "elysia";
import type { DbShape } from "./db";
import type { HubLifetimeShape } from "./lifetime";
import type { RegistryShape } from "./registry";

/** How often expired clients are swept, and the away clock read. */
const SWEEP_MS = 10_000;
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
/** A session's message to the person (`send_to_user`): one per session, a newer replaces the older. */
export const messageCollapseId = (instanceId: string): string =>
  collapseOf("message", instanceId);
/** A workflow run's note to the person: one per run, a newer replaces the older. */
export const runCollapseId = (runId: string): string =>
  collapseOf("run", runId);
/** A task waiting on the owner: its move and its failed attempt are one notification. */
export const taskCollapseId = (projectId: string, taskId: string): string =>
  collapseOf("task", `${projectId}:${taskId}`);
/** A device asking to pair (hub-auth.ts), by the code it shows: one per pairing. */
export const pairingCollapseId = (userCode: string): string =>
  collapseOf("pairing", userCode);
/** An install of a machine that ended (installs.ts): one per install. */
export const installCollapseId = (id: string): string =>
  collapseOf("install", id);
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
  /** The person's last input on it, on the hub's clock; null when it never said. */
  readonly inputAt: number | null;
  /** Since when it has said locked or asleep, on the hub's clock. */
  readonly lockedAt: number | null;
  /** Its machine's word (Idle Detection); null when it says none. */
  readonly machine: MachineState | null;
  /** The client's own clock when it said this beat. */
  readonly saidAt: number;
  readonly sessionId: string | null;
}

/** A machine's desktop as its agent last said it. */
interface MachineWord {
  readonly at: number;
  readonly inputAt: number;
  readonly lockedAt: number | null;
  readonly source: string;
  readonly state: MachineState;
}

/**
 * One device's facts as the rollup reads them, on the hub's clock: a tab, an
 * app install, or a machine through its agent.
 */
export interface DeviceFacts {
  /** When it last said anything. */
  readonly at: number;
  /** The chat it has in front and read, or null. */
  readonly front: string | null;
  readonly id: string;
  /** When the person last touched it; null when it never said. */
  readonly inputAt: number | null;
  /** What it is, for where a desk alert or a push goes. */
  readonly kind: PresenceClient | "machine";
  /** Since when it has said locked or asleep. */
  readonly lockedAt: number | null;
  /** Its machine's word; null when it says none. */
  readonly machine: MachineState | null;
}

/** The person, and what the outlets read beside: their last input and the device in use. */
export interface Rolled extends Person {
  /** The device the person touched last, while here; null when away. */
  readonly inUse: DeviceFacts | null;
  /** The newest input on any device, the lock aside; null when none ever said. */
  readonly lastInputAt: number | null;
}

/** A lock or sleep: the device says nothing of the person but that they left it. */
const gone = (machine: MachineState | null): boolean =>
  machine === "locked" || machine === "asleep";

/** How long a device's machine word holds: a machine's agent beats every 15 s, a hidden tab once a minute. */
const wordHolds = (device: Pick<DeviceFacts, "kind">): number =>
  device.kind === "machine" ? MACHINE_TTL_MS : DEVICE_TTL_MS;

/**
 * The person's last input on a client, as its beat says it: the idle time a
 * tab reads, else now for an app with a chat in front and read, else what
 * it said before.
 */
const inputOf = (
  beat: PresenceBeat,
  before: Client | undefined,
  now: number
): number | null => {
  if (beat.idleMs !== undefined) {
    return now - beat.idleMs;
  }
  return beat.active ? now : (before?.inputAt ?? null);
};

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

/**
 * THE ROLLUP: every device's facts to one person, at `now`, in order.
 *
 * 1. Appear away (`manualAt`): away, whatever any device says.
 * 2. A device whose machine is locked or asleep (and still said so within
 *    {@link MACHINE_TTL_MS} for a machine, {@link DEVICE_TTL_MS} for a tab)
 *    counts for nothing: neither its chat in front nor its input.
 * 3. Any device in use means here: a machine active, or a chat in front and
 *    read (within {@link PRESENCE_TTL_MS}) whose machine is not idle. `on`
 *    is the chat in front on the one that beat last.
 * 4. A lock or sleep newer than every other input: away since it.
 * 5. Here while the newest input is under {@link AWAY_AFTER_MS} old; then
 *    away since it.
 */
export const rollup = (
  devices: readonly DeviceFacts[],
  manualAt: number | null,
  now: number
): Rolled => {
  const usable = devices.filter(
    (device) => !(gone(device.machine) && now - device.at < wordHolds(device))
  );
  const inputs = usable.flatMap((device) =>
    device.inputAt === null ? [] : [device.inputAt]
  );
  const lastInputAt = inputs.length > 0 ? Math.max(...inputs) : null;
  if (manualAt !== null) {
    return {
      state: "away",
      manual: true,
      on: null,
      since: manualAt,
      inUse: null,
      lastInputAt,
    };
  }
  const inUse = usable
    .filter((device) => {
      const fresh = now - device.at;
      const machineActive =
        device.machine === "active" && fresh < wordHolds(device);
      const reading =
        device.front !== null &&
        fresh < PRESENCE_TTL_MS &&
        device.machine !== "idle";
      return machineActive || reading;
    })
    .sort((a, b) => b.at - a.at);
  if (inUse.length > 0) {
    const reading = inUse.find((device) => device.front !== null);
    return {
      state: "here",
      manual: false,
      on: reading?.front ?? null,
      since: null,
      inUse: reading ?? inUse[0],
      lastInputAt: now,
    };
  }
  const locks = devices.flatMap((device) =>
    gone(device.machine) &&
    device.lockedAt !== null &&
    now - device.at < wordHolds(device)
      ? [device.lockedAt]
      : []
  );
  const lockedAt = locks.length > 0 ? Math.max(...locks) : null;
  if (lockedAt !== null && (lastInputAt === null || lockedAt >= lastInputAt)) {
    return {
      state: "away",
      manual: false,
      on: null,
      since: lockedAt,
      inUse: null,
      lastInputAt,
    };
  }
  if (lastInputAt !== null && now - lastInputAt < AWAY_AFTER_MS) {
    const touched = usable.find((device) => device.inputAt === lastInputAt);
    return {
      state: "here",
      manual: false,
      on: null,
      since: null,
      inUse: touched ?? null,
      lastInputAt,
    };
  }
  return {
    state: "away",
    manual: false,
    on: null,
    since: lastInputAt,
    inUse: null,
    lastInputAt,
  };
};

/** What hears the person change. */
export type PersonListener = (now: Rolled, before: Rolled) => void;

/** The person's log line: their state, where, and why. */
const personLine = (person: Rolled): string => {
  if (person.state === "here") {
    return person.on
      ? `here, on ${person.on}`
      : `here (${person.inUse ? `${person.inUse.kind} ${person.inUse.id.slice(0, 8)}` : "no device in use"})`;
  }
  const since = person.since
    ? new Date(person.since).toISOString()
    : "never seen";
  return person.manual
    ? `away (Appear away, since ${since})`
    : `away since ${since}`;
};

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
  /** Each machine's desktop, as its agent last said it, by machine id. */
  const machines = new Map<string, MachineWord>();
  /** Clients whose lapse was said: a lapsed client stays, unknown, its last input counting. */
  const lapsed = new Set<string>();
  const personListeners: PersonListener[] = [];

  /** Every device's facts, as the rollup reads them: each client, and each machine the person opted in. */
  const facts = (): DeviceFacts[] => {
    const counted = db.presence.counted();
    return [
      ...[...clients].map(([id, client]): DeviceFacts => ({
        id,
        kind: client.client,
        at: client.at,
        front: client.active ? client.sessionId : null,
        inputAt: client.inputAt,
        lockedAt: client.lockedAt,
        machine: client.machine,
      })),
      ...[...machines]
        .filter(([id]) => counted.has(id))
        .map(([id, word]): DeviceFacts => ({
          id,
          kind: "machine",
          at: word.at,
          front: null,
          inputAt: word.inputAt,
          lockedAt: word.lockedAt,
          machine: word.state,
        })),
    ];
  };

  const manualAt = (): number | null =>
    db.presence.appearAway()?.getTime() ?? null;

  const rolled = (now = Date.now()): Rolled => rollup(facts(), manualAt(), now);

  /** The machines that can count: each one whose agent reads its desktop, and each one opted in. */
  const devices = (now: number): PresenceDevice[] => {
    const counted = db.presence.counted();
    const names = new Map(
      db.listAgents().map((agent) => [agent.machineId, agent.hostname])
    );
    return [...new Set([...machines.keys(), ...counted])]
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
    devices: devices(now),
  });

  /** The person as last told, and the view the dashboards were last sent. */
  let told: Rolled = rolled();
  let toldView = JSON.stringify(viewOf(told, Date.now()));

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
      console.log(`[presence] the person: ${personLine(person)}`);
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
   * client was active on its session at any moment since it landed.
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
    `[presence] ${client.client} ${clientId.slice(0, 8)}: ${client.active && client.sessionId ? `active on ${client.sessionId}` : `inactive (${client.sessionId ?? "no session"} in front)`}${client.machine ? `, machine ${client.machine}` : ""}`;

  lifetime.every(SWEEP_MS, () => {
    const now = Date.now();
    for (const [clientId, client] of clients) {
      if (now - client.at < PRESENCE_TTL_MS) {
        continue;
      }
      // Unknown, not gone: kept a day, its last input counting meanwhile.
      if (now - client.at > CLIENT_KEPT_MS) {
        clients.delete(clientId);
        lapsed.delete(clientId);
        continue;
      }
      if (lapsed.has(clientId)) {
        continue;
      }
      lapsed.add(clientId);
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
      const machine = beat.machine ?? null;
      const inputAt = inputOf(beat, before, now);
      const client: Client = {
        client: beat.client,
        sessionId: beat.sessionId,
        active: beat.active,
        alerts: beat.alerts ?? false,
        machine,
        inputAt,
        lockedAt: lockSince(before, machine, now),
        saidAt: beat.saidAt,
        at: now,
      };
      clients.set(beat.clientId, client);
      lapsed.delete(beat.clientId);
      if (isActive(client, now) && client.sessionId) {
        markFront(client.sessionId, now);
      }
      // A change: a new client, another session or state, or one that had
      // lapsed (silent past the TTL, not yet swept) beating again.
      if (
        before === undefined ||
        before.sessionId !== client.sessionId ||
        before.active !== client.active ||
        before.machine !== client.machine ||
        (before.active && !counted)
      ) {
        console.log(said(beat.clientId, client));
      }
      reroll();
    },

    /**
     * A machine's desktop, from its agent's heartbeat: in use, idle, locked
     * or asleep. It counts toward the person once they opt the machine in.
     */
    machine(machineId: string, activity: MachineActivity): void {
      const now = Date.now();
      const before = machines.get(machineId);
      machines.set(machineId, {
        state: activity.state,
        inputAt: now - activity.idleMs,
        lockedAt: lockSince(before, activity.state, now),
        source: activity.source,
        at: now,
      });
      if (before?.state !== activity.state) {
        console.log(
          `[presence] machine ${machineId.slice(0, 8)}: ${activity.state} (${activity.source}, idle ${Math.round(activity.idleMs / 1000)}s)${db.presence.counted().has(machineId) ? "" : ", not counted: not opted in"}`
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

    /** Appear away, on or off: kept on the hub until the person turns it off. */
    appearAway(on: boolean): PersonView {
      db.presence.setAppearAway(on, new Date());
      console.log(`[presence] Appear away ${on ? "on" : "off"}`);
      reroll();
      return viewOf(told, Date.now());
    },

    /** Whether a machine's desktop counts toward the person: the person's opt-in. */
    counts(machineId: string, on: boolean): PersonView {
      db.presence.setCounts(machineId, on);
      console.log(
        `[presence] machine ${machineId.slice(0, 8)}: ${on ? "counts" : "does not count"} toward the person`
      );
      reroll();
      return viewOf(told, Date.now());
    },

    /** The web tab a desk alert goes to: the one touched last that can show one; undefined when none can. */
    deskTab(): string | undefined {
      const now = Date.now();
      const [best] = [...clients]
        .filter(
          ([, client]) =>
            client.client === "web" &&
            client.alerts &&
            now - client.at < DEVICE_TTL_MS &&
            !gone(client.machine)
        )
        .sort(
          ([, a], [, b]) =>
            (b.inputAt ?? b.at) - (a.inputAt ?? a.at) || b.at - a.at
        );
      return best?.[0];
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
          idleMs: t.Optional(t.Number({ minimum: 0 })),
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
      ({ body }) => {
        notifications.presence(body);
        return { ok: true };
      }
    )
    .get("/api/person", () => notifications.view())
    .post(
      "/api/person/away",
      { body: t.Object({ on: t.Boolean() }) },
      ({ body }) => notifications.appearAway(body.on)
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
