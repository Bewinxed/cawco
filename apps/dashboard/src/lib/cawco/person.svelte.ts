/**
 * The person's presence as this dashboard holds it (hub notifications.ts):
 * here, on which chat, or away, the machines that can count toward it, and
 * what this browser lets the presence model use. The presence menu (rail
 * footer, PresenceMenu.svelte) and Needs you's onboarding row read it.
 *
 * - Appear away and each machine's opt-in are the hub's: a press asks the
 *   hub, and the view changes when it answers (its `person` frame, or the
 *   answer itself), so a reload or another screen shows the same.
 * - A desk alert (`desk_alert`) names one tab, the one the person uses: that
 *   tab shows it as a desktop notification, the item's real words, a click
 *   opening the session it is about, and answers the hub it did.
 * - This browser is asked only for what it can grant and what adds
 *   something ({@link deskAsks}): Idle Detection where it has one and the
 *   computer it runs on has no agent already reading its desktop (the hub
 *   ties the browser to its machine by the address it asks from,
 *   `thisMachine`), notifications while still to answer.
 */
import {
  type DeskAck,
  type DeskAckHow,
  type DeskAlertFrame,
  type PersonRead,
  type PersonView,
  PRESENCE_ONBOARDING_SKIPPED,
  presenceWords,
} from "@cawco/core";
import { goto } from "$app/navigation";
import { failureWords } from "./hub-read";
import { conversationHref, type InstanceIndex } from "./links";
import {
  allowDesk,
  type DeskAsk,
  type DeskPermissions,
  deskPermissions,
  presenceClientId,
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
  /** A press on its way: Appear away (`away`), a machine by id, or this browser (`allow`). */
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

/** The hub's word on the person: its read, or a frame. */
export function takePerson(view: PersonView): void {
  state.view = view;
}

/** Reads the person and this browser's permissions: on connect and again after every reconnect. */
export async function readPerson(): Promise<void> {
  state.skipped = stored("local", SKIPPED.key) === SKIPPED.value;
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
    state.view = view;
    state.thisMachine = thisMachine;
  }
  state.permissions = permissions;
}

/** Runs one press against the hub: its answer is the view, its refusal said in words. */
async function press(
  key: string,
  url: string,
  body: Record<string, boolean>
): Promise<void> {
  state.pending = key;
  state.refusal = null;
  try {
    state.view = await askHub<PersonView>(url, json("POST", body));
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
  };
};

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
  return ask.idle || ask.notify;
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
  const shown = new Notification(frame.title, {
    body: frame.body,
    tag: frame.collapseId,
  });
  answerDesk(frame.collapseId, "notification");
  shown.onclick = () => {
    window.focus();
    shown.close();
    goto(frame.session ? conversationHref(frame.session, index) : "/").catch(
      () => undefined
    );
  };
}
