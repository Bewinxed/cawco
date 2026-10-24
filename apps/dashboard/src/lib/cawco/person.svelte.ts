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
 * - Nothing reports before the person's yes ({@link deskAsks}): on a
 *   computer whose CawCo agent can read its desktop (the hub ties the
 *   browser to its machine by the address it asks from, `thisMachine`), the
 *   yes turns that agent's report on; else, where the browser has Idle
 *   Detection, the yes asks it; else the step says this browser can't.
 *   Notifications are asked while still to answer. A no is kept.
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
  deskAnswered,
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
  /** This browser's report was turned on here (presence.ts `deskReportOn`). */
  reportOn: false,
  /** This browser's report was answered here, yes or no (presence.ts `deskAnswered`). */
  answered: false,
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
  state.answered = deskAnswered();
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
 * This computer's CawCo agent, as the hub lists it (its agent could read
 * its desktop, `activityReadable`): the one the hub ties this browser to by
 * the address it asks from. Undefined when none is.
 */
const agentHere = () =>
  state.thisMachine === null
    ? undefined
    : (state.view?.devices ?? []).find(
        (device) => device.id === state.thisMachine
      );

/** What says whether the person is at this computer: its CawCo agent, this browser's Idle Detection, or nothing. */
export const deskSource = (): "agent" | "browser" | "none" => {
  if (agentHere()) {
    return "agent";
  }
  return state.permissions?.idle === "unsupported" ? "none" : "browser";
};

/**
 * What the consent step is still to ask here, nothing on before the yes:
 * this computer's agent's report while it is off (its agent can read the
 * desktop); else this browser's Idle Detection while not yet answered here
 * and not blocked; else, with neither, that this browser can't (Safari,
 * Firefox, Brave with no agent); and notifications while still to answer.
 */
export const deskAsks = (): DeskAsk => {
  const { permissions } = state;
  const source = deskSource();
  const agent = agentHere();
  return {
    agent: source === "agent" && agent && !agent.counts ? agent.name : null,
    idle:
      source === "browser" && permissions?.idle !== "denied" && !state.answered,
    notify: permissions?.notify === "default",
    unavailable: source === "none",
  };
};

/**
 * This device's report of whether the person is at this computer, as the
 * presence menu says it: on (its agent's report, or this browser's, turned
 * on by the person), off, blocked in the browser's site settings, or
 * unavailable (no agent here and no Idle Detection: Safari, Firefox, Brave).
 */
export const deskState = (): "on" | "off" | "blocked" | "unavailable" => {
  const source = deskSource();
  if (source === "agent") {
    return agentHere()?.counts ? "on" : "off";
  }
  if (source === "none") {
    return "unavailable";
  }
  if (state.permissions?.idle === "denied") {
    return "blocked";
  }
  return state.permissions?.idle === "granted" && state.reportOn ? "on" : "off";
};

/**
 * The presence menu's switch, on the person's press: this computer's
 * agent's report on or off on the hub; else this browser's, on asking the
 * browser where it still may and starting it, off stopping it, either kept.
 * A refusal names the setting and where to turn it on.
 */
export async function setAtComputer(on: boolean): Promise<void> {
  const agent = deskSource() === "agent" ? state.thisMachine : null;
  if (agent) {
    await setMachineCounts(agent, on);
    return;
  }
  state.pending = "desk";
  state.refusal = null;
  try {
    state.permissions = await setDeskReport(on);
    state.reportOn = deskReportOn();
    state.answered = deskAnswered();
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
  ...(after.idle === "denied" && deskSource() === "browser"
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
  // The browser's prompts first, in the press itself (presence.ts).
  const allowed = allowDesk(ask);
  const agent = ask.agent === null ? null : state.thisMachine;
  try {
    state.permissions = await allowed;
    if (agent) {
      takePerson(
        await askHub<PersonView>(
          `/api/person/devices/${encodeURIComponent(agent)}`,
          json("POST", { counts: true })
        )
      );
    }
    state.reportOn = deskReportOn();
    state.answered = deskAnswered();
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
  state.answered = true;
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
  return ask.agent !== null || ask.idle || ask.notify || ask.unavailable;
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
