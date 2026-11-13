import type {
  DeskAck,
  DeskAckHow,
  DeskAlertFrame,
  PersonView,
} from "@cawco/core/notifications";
import { PRESENCE_ONBOARDING_SKIPPED } from "@cawco/core/presence-onboarding";
import { type DeskState, presenceWords } from "@cawco/core/words/presence";
import { MediaQuery } from "svelte/reactivity";
import { hub } from "#lib/platform/hub.js";
import {
  failureWords,
  hubData,
  hubReached,
  refusedOrUnreached,
} from "#lib/platform/hub-read.js";
import { store, stored } from "#lib/platform/storage.js";
import { goto } from "$app/navigation";
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

/** Per browser: the onboarding row put away with Skip (core presence-onboarding.ts). */
const SKIPPED = PRESENCE_ONBOARDING_SKIPPED;

/** A refusal's words; `blocked` when it is this browser's, naming the setting. */
interface Refusal {
  readonly blocked: boolean;
  readonly message: string;
  readonly title: string;
}

interface PersonState {
  /** This browser's report was answered here, yes or no (presence.ts `deskAnswered`). */
  answered: boolean;
  /** What the last press asked this browser for: the row says it until the row leaves. */
  asked: DeskAsk | null;
  /** A press on its way: Appear away (`away`), the away clock (`clock`), this browser's report (`desk`), a machine by id, or this browser (`allow`). */
  pending: string | null;
  /** This browser's permissions; null until read. */
  permissions: DeskPermissions | null;
  /** The hub's or the browser's refusal of the last press: its words, and what refused. */
  refusal: Refusal | null;
  /** This browser's report was turned on here (presence.ts `deskReportOn`). */
  reportOn: boolean;
  /** The onboarding row was put away in this browser. */
  skipped: boolean;
  /** The machine this browser is on, as the hub tied it; null when none is. */
  thisMachine: string | null;
  /** This browser's permissions were just granted from the row: it ticks a moment, then leaves. */
  ticked: boolean;
  /** The person as the hub last said; null until read. */
  view: PersonView | null;
}

const state = $state<PersonState>({
  view: null,
  permissions: null,
  pending: null,
  refusal: null,
  asked: null,
  thisMachine: null,
  skipped: false,
  ticked: false,
  reportOn: false,
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
    hubData(hub.api.person.get(), refusedOrUnreached).catch(
      (error: unknown) => {
        console.error("[cawco] /api/person failed:", error);
        return null;
      }
    ),
  ]);
  if (read) {
    const { thisMachine, ...view } = read;
    takePerson(view);
    state.thisMachine = thisMachine;
  }
  state.permissions = permissions;
}

/** Runs one press against the hub: its answer is the view, its refusal said in words. */
async function press(key: string, view: Promise<PersonView>): Promise<void> {
  state.pending = key;
  state.refusal = null;
  try {
    takePerson(await view);
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
  press("away", hubData(hub.api.person.away.post({ on }), refusedOrUnreached));

/** The away clock, ms: how long without input on any device before the person is away. */
export const setAwayAfter = (awayAfterMs: number): Promise<void> =>
  press(
    "clock",
    hubData(
      hub.api.person["away-clock"].post({ awayAfterMs }),
      refusedOrUnreached
    )
  );

/** Whether a machine's desktop counts toward whether the person is here. */
export const setMachineCounts = (
  machineId: string,
  counts: boolean
): Promise<void> =>
  press(
    machineId,
    hubData(
      hub.api.person.devices({ machineId }).post({ counts }),
      refusedOrUnreached
    )
  );

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
const deskSource = (): "agent" | "browser" | "none" => {
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
 * What the onboarding row asks for: on a phone notifications alone, never
 * whether the person is using it; elsewhere all {@link deskAsks} names.
 */
export const rowAsks = (): DeskAsk =>
  onPhone()
    ? {
        agent: null,
        idle: false,
        notify: state.permissions?.notify === "default",
        unavailable: false,
      }
    : deskAsks();

/**
 * This device's report of whether the person is at this computer, as the
 * presence menu says it: on (its agent's report, or this browser's, turned
 * on by the person), off, blocked in the browser's site settings, or
 * unavailable (no agent here and no Idle Detection: Safari, Firefox, Brave).
 */
export const deskState = (): DeskState => {
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
 * Idle Detection only where it counts ({@link deskAsks}' rule) and was
 * offered (`idle`: not the phone's row), notifications always.
 */
const blockedNames = (after: DeskPermissions, idle: boolean): string[] => [
  ...(idle && after.idle === "denied" && deskSource() === "browser"
    ? [presenceWords.deviceUse]
    : []),
  ...(after.notify === "denied"
    ? [presenceWords.notifications(after.place)]
    : []),
];

/**
 * What this browser blocks and where to turn it on; null when nothing is.
 * `idle` false leaves Idle Detection out: the phone's row never offered it.
 */
export const blockedHere = (idle = true): Refusal | null => {
  const { permissions } = state;
  const names = permissions ? blockedNames(permissions, idle) : [];
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
 * Asks this browser, on the person's press, for what its place offers: the
 * onboarding row's {@link rowAsks} (`row`), the presence menu's
 * {@link deskAsks} (`menu`); the browser's own prompts. A refusal names
 * each setting it blocks and where to turn it on.
 */
export async function allowHere(from: "row" | "menu"): Promise<void> {
  const ask = from === "row" ? rowAsks() : deskAsks();
  // The row says what the press asked for and ticks it; on a phone it
  // never says the menu's presence, so a menu press there leaves it be.
  const inRow = from === "row" || !onPhone();
  if (inRow) {
    state.asked = ask;
  }
  state.pending = "allow";
  state.refusal = null;
  // The browser's prompts first, in the press itself (presence.ts).
  const allowed = allowDesk(ask);
  const agent = ask.agent === null ? null : state.thisMachine;
  try {
    state.permissions = await allowed;
    if (agent) {
      const answer = await hubData(
        hub.api.person.devices({ machineId: agent }).post({ counts: true }),
        refusedOrUnreached
      );
      takePerson(answer);
    }
    state.reportOn = deskReportOn();
    state.answered = deskAnswered();
    const blocked = blockedHere(from === "menu" || !onPhone());
    if (blocked) {
      state.refusal = blocked;
      return;
    }
    if (!inRow) {
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
  const ask = rowAsks();
  // A browser that can't read presence, with notifications answered, has
  // nothing to allow: the presence menu says so ("not available here").
  return ask.agent !== null || ask.idle || ask.notify;
};

const phoneQuery = new MediaQuery("(pointer: coarse) and (hover: none)");
/**
 * The dashboard is on a phone (a touch screen with no hover): the
 * presence words name the phone, its touches and its lock rather than this
 * computer's keys, pointer and tabs.
 */
export const onPhone = (): boolean => phoneQuery.current;

/** This tab's answer to a desk alert it was named for: the hub sends the item on when none comes. */
const answerDesk = (collapseId: string, how: DeskAckHow): void => {
  const ack: DeskAck = { clientId: presenceClientId(), collapseId, how };
  hubReached(
    hub.api.presence["desk-ack"].post(ack, { fetch: { keepalive: true } })
  ).catch((error: unknown) => {
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
  });
  answerDesk(frame.collapseId, "notification");
  shown.onclick = () => {
    window.focus();
    shown.close();
    goto(
      frame.path ??
        (frame.session ? conversationHref(frame.session, index) : "/")
    ).catch(() => undefined);
  };
}
