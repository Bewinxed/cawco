/**
 * The person's presence as this dashboard holds it (hub notifications.ts):
 * here, on which chat, or away, the machines that can count toward it, and
 * what this browser lets the presence model use. The presence menu (rail
 * footer, PresenceMenu.svelte) and Needs you's onboarding row read it.
 *
 * - Appear away, the away clock and each machine's opt-in are the hub's: a
 *   press asks the hub, and the view changes when it answers (its `person`
 *   frame, or the answer itself), so a reload or another screen shows the
 *   same.
 * - A desk alert (`desk_alert`) names one tab, the one the person uses: that
 *   tab shows it as a desktop notification, the item's real words, a click
 *   opening the session it is about, and answers the hub it did.
 * - This browser is asked only for what it can grant and what adds
 *   something ({@link deskAsks}): Idle Detection where it has one and the
 *   computer it runs on has no agent already reading its desktop (the hub
 *   ties the browser to its machine by the address it asks from,
 *   `thisMachine`), notifications while still to answer.
 */
import type {
  DeskAck,
  DeskAckHow,
  DeskAlertFrame,
  PersonRead,
  PersonView,
} from "@cawco/core/notifications";
import { PRESENCE_ONBOARDING_SKIPPED } from "@cawco/core/presence-onboarding";
import { presenceWords } from "@cawco/core/words/presence";
import { goto } from "$app/navigation";
import { failureWords } from "./hub-read";
import { conversationHref, type InstanceIndex } from "./links";
import {
  allowDesk,
  type DeskAsk,
  type DeskPermissions,
  declineDesk,
  deskPermissions,
  deskReportOn,
  presenceClientId,
  setDeskReport,
  setDeskThreshold,
} from "./presence";
import { send as askHub, json } from "./project-tasks";
import { store, stored } from "./storage";

/** Per browser: the onboarding row put away with Skip (core presence-onboarding.ts). */
const SKIPPED = PRESENCE_ONBOARDING_SKIPPED;

/** A refusal's words; `blocked` when it is this browser's, naming the setting. */
interface Refusal {
  readonly blocked: boolean;
  readonly message: string;
  readonly title: string;
}

const state = $state({
  /** The person as the hub last said; null until read. */
  view: null as PersonView | null,
  /** This browser's permissions; null until read. */
  permissions: null as DeskPermissions | null,
  /** A press on its way: Appear away (`away`), the away clock (`clock`), this browser's report (`desk`), a machine by id, or this browser (`allow`). */
  pending: null as string | null,
  /** The hub's or the browser's refusal of the last press: its words, and what refused. */
  refusal: null as Refusal | null,
  /** What the last press asked this browser for: the row says it until the row leaves. */
  asked: null as DeskAsk | null,
  /** The machine this browser is on, as the hub tied it; null when none is. */
  thisMachine: null as string | null,
  /** The onboarding row was put away in this browser. */
  skipped: false,
  /** This browser's permissions were just granted from the row: it ticks a moment, then leaves. */
  ticked: false,
  /** This browser's report is not turned off here (presence.ts `deskReportOn`). */
  reportOn: true,
});

export const person = {
  get view(): PersonView | null {
    return state.view;
  },
  get permissions(): DeskPermissions | null {
    return state.permissions;
  },
  get pending(): string | null {
    return state.pending;
  },
  get refusal(): Refusal | null {
    return state.refusal;
  },
  get asked(): DeskAsk | null {
    return state.asked;
  },
  get skipped(): boolean {
    return state.skipped;
  },
  get ticked(): boolean {
    return state.ticked;
  },
};

/** The hub's word on the person: its read, or a frame. Its away clock is Idle Detection's threshold. */
export function takePerson(view: PersonView): void {
  state.view = view;
  setDeskThreshold(view.awayAfterMs);
}

/** Reads the person and this browser's permissions: on connect and again after every reconnect. */
export async function readPerson(): Promise<void> {
  state.skipped = stored("local", SKIPPED.key) === SKIPPED.value;
  state.reportOn = deskReportOn();
  // The permissions land with the hub's tie to this machine, never before
  // it: read alone, a row would flash its ask on a computer whose agent
  // already reads it.
  const [permissions, read] = await Promise.all([
    deskPermissions(),
    askHub<PersonRead>("/api/person").catch((error: unknown) => {
      console.error("[cawco] /api/person failed:", error);
      return null;
    }),
  ]);
  if (read) {
    const { thisMachine, ...view } = read;
    takePerson(view);
    state.thisMachine = thisMachine;
  }
  state.permissions = permissions;
}

/** Runs one press against the hub: its answer is the view, its refusal said in words. */
async function press(
  key: string,
  url: string,
  body: Record<string, boolean | number>
): Promise<void> {
  state.pending = key;
  state.refusal = null;
  try {
    takePerson(await askHub<PersonView>(url, json("POST", body)));
  } catch (error) {
    state.refusal = {
      blocked: false,
      message: failureWords(error),
      title: presenceWords.refused,
    };
  } finally {
    state.pending = null;
  }
}

/** Appear away on or off: agents go quiet and the phone gets pushes while it is on. */
export const setAppearAway = (on: boolean): Promise<void> =>
  press("away", "/api/person/away", { on });

/** The away clock, ms: how long without input on any device before the person is away. */
export const setAwayAfter = (awayAfterMs: number): Promise<void> =>
  press("clock", "/api/person/away-clock", { awayAfterMs });

/** Whether a machine's desktop counts toward whether the person is here. */
export const setMachineCounts = (
  machineId: string,
  counts: boolean
): Promise<void> =>
  press(machineId, `/api/person/devices/${encodeURIComponent(machineId)}`, {
    counts,
  });

/** How long the row's tick stands before it leaves. */
const TICK_MS = 2400;

/**
 * The machine this browser is on has its agent reading its desktop: the
 * hub hears the person there already, so the browser's Idle Detection adds
 * nothing.
 */
const agentReadsHere = (): boolean =>
  state.thisMachine !== null &&
  (state.view?.devices ?? []).some(
    (device) => device.id === state.thisMachine && device.state !== null
  );

/**
 * What this browser is still to be asked for: Idle Detection while it can
 * grant it and no agent reads this computer, notifications while still to
 * answer. A browser that can't grant one (Brave, Safari and Firefox for
 * Idle Detection) is never asked for it.
 */
export const deskAsks = (): DeskAsk => {
  const { permissions } = state;
  return {
    idle: permissions?.idle === "prompt" && !agentReadsHere(),
    notify: permissions?.notify === "default",
    unavailable: permissions?.idle === "unsupported" && !agentReadsHere(),
  };
};

/**
 * This browser's report of whether the person is at this computer, as the
 * presence menu says it: on (granted, and not turned off here), off,
 * blocked in the browser's site settings, or unavailable (no Idle
 * Detection: Safari, Firefox, Brave).
 */
export const deskState = (): "on" | "off" | "blocked" | "unavailable" => {
  const idle = state.permissions?.idle;
  if (idle === "unsupported") {
    return "unavailable";
  }
  if (idle === "denied") {
    return "blocked";
  }
  return idle === "granted" && state.reportOn ? "on" : "off";
};

/**
 * The machine this browser's computer can count by instead, by its name:
 * the one the hub ties this browser to, when an agent runs there; null
 * when none is known.
 */
export const machineHere = (): string | null =>
  (state.view?.devices ?? []).find((device) => device.id === state.thisMachine)
    ?.name ?? null;

/**
 * The presence menu's switch, on the person's press: on asks the browser
 * where it still may and starts the report, off stops it and is kept. A
 * refusal names the setting and where to turn it on.
 */
export async function setAtComputer(on: boolean): Promise<void> {
  state.pending = "desk";
  state.refusal = null;
  try {
    state.permissions = await setDeskReport(on);
    state.reportOn = deskReportOn();
    if (on) {
      state.refusal = blockedHere();
    }
  } catch (error) {
    state.refusal = {
      blocked: true,
      message: error instanceof Error ? error.message : String(error),
      title: presenceWords.notAsked,
    };
  } finally {
    state.pending = null;
  }
}

/**
 * Site settings this browser blocks for CawCo, by the names it shows them:
 * Idle Detection only where it counts ({@link deskAsks}' rule), notifications
 * always.
 */
const blockedNames = (after: DeskPermissions): string[] => [
  ...(after.idle === "denied" && !agentReadsHere()
    ? [presenceWords.deviceUse]
    : []),
  ...(after.notify === "denied"
    ? [presenceWords.notifications(after.place)]
    : []),
];

/** What this browser blocks and where to turn it on; null when nothing is. */
export const blockedHere = (): Refusal | null => {
  const { permissions } = state;
  const names = permissions ? blockedNames(permissions) : [];
  if (!permissions || names.length === 0) {
    return null;
  }
  return {
    blocked: true,
    title: presenceWords.blocked(names),
    message: presenceWords.unblock(permissions.place, names.length > 1),
  };
};

/**
 * Asks this browser for what it is still to be asked ({@link deskAsks}), on the
 * person's press: the browser's own prompts. A refusal names each setting
 * it blocks and where to turn it on.
 */
export async function allowHere(): Promise<void> {
  const ask = deskAsks();
  state.asked = ask;
  state.pending = "allow";
  state.refusal = null;
  try {
    state.permissions = await allowDesk(ask);
    state.reportOn = deskReportOn();
    const blocked = blockedHere();
    if (blocked) {
      state.refusal = blocked;
      return;
    }
    state.ticked = true;
    setTimeout(() => {
      state.ticked = false;
      state.asked = null;
    }, TICK_MS);
  } catch (error) {
    state.refusal = {
      blocked: true,
      message: error instanceof Error ? error.message : String(error),
      title: presenceWords.notAsked,
    };
  } finally {
    state.pending = null;
  }
}

/** Puts the onboarding row away in this browser; the presence menu still offers it. */
export function skipHere(): void {
  store("local", SKIPPED.key, SKIPPED.value);
  declineDesk();
  state.reportOn = false;
  state.skipped = true;
  state.refusal = null;
  state.asked = null;
}

/**
 * The onboarding row stands: this browser is still to be asked for
 * something ({@link deskAsks}) and the row wasn't put away.
 */
export const asksHere = (): boolean => {
  if (state.skipped) {
    return false;
  }
  const ask = deskAsks();
  return ask.idle || ask.notify || ask.unavailable;
};

/** This tab's answer to a desk alert it was named for: the hub sends the item on when none comes. */
const answerDesk = (collapseId: string, how: DeskAckHow): void => {
  const ack: DeskAck = { clientId: presenceClientId(), collapseId, how };
  fetch("/api/presence/desk-ack", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ack),
    keepalive: true,
  }).catch((error: unknown) => {
    // Unanswered, the hub sends it to the next place itself.
    console.warn("[cawco] desk alert not answered:", error);
  });
};

/**
 * A desk alert for this tab: shown as a desktop notification while this
 * browser allows them and the person is not on this tab (visible and
 * focused, its Needs you already shows it), the hub's words as they are; a
 * click brings the tab forward at the session it is about. Each is
 * answered: shown, seen in the page, or refused when this browser may not
 * show one, so the hub sends it to the next place.
 */
export function showDeskAlert(
  frame: DeskAlertFrame,
  index: InstanceIndex
): void {
  if (frame.to !== presenceClientId()) {
    return;
  }
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    answerDesk(frame.collapseId, "refused");
    return;
  }
  if (document.visibilityState === "visible" && document.hasFocus()) {
    answerDesk(frame.collapseId, "page");
    return;
  }
  // MDN: `renotify` "specifying whether the user should be notified after a
  // new notification replaces an old one"; it needs the tag, which is always set.
  const shown = new Notification(frame.title, {
    body: frame.body,
    tag: frame.collapseId,
    renotify: frame.renotify,
  } as NotificationOptions & { renotify: boolean });
  answerDesk(frame.collapseId, "notification");
  shown.onclick = () => {
    window.focus();
    shown.close();
    goto(frame.session ? conversationHref(frame.session, index) : "/").catch(
      () => undefined
    );
  };
}
