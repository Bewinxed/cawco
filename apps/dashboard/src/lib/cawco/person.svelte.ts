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
 *   tab shows it as a desktop notification, the item's real words, and a
 *   click opens the session it is about.
 */
import {
  type DeskAlertFrame,
  type PersonView,
  presenceWords,
} from "@cawco/core";
import { goto } from "$app/navigation";
import { failureWords } from "./hub-read";
import { conversationHref, type InstanceIndex } from "./links";
import {
  allowDesk,
  type DeskPermissions,
  deskPermissions,
  presenceClientId,
} from "./presence";
import { send as askHub, json } from "./project-tasks";
import { store, stored } from "./storage";

/** Per browser: the onboarding row put away with Skip. */
const SKIPPED_KEY = "cawco-presence-onboarding";

const state = $state({
  /** The person as the hub last said; null until read. */
  view: null as PersonView | null,
  /** This browser's permissions; null until read. */
  permissions: null as DeskPermissions | null,
  /** A press on its way: Appear away (`away`), a machine by id, or this browser (`allow`). */
  pending: null as string | null,
  /** The hub's or the browser's refusal of the last press: its words, and what refused. */
  refusal: null as { message: string; title: string } | null,
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
  get refusal(): { message: string; title: string } | null {
    return state.refusal;
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
  state.skipped = stored("local", SKIPPED_KEY) === "skipped";
  state.permissions = await deskPermissions();
  try {
    state.view = await askHub<PersonView>("/api/person");
  } catch (error) {
    console.error("[cawco] /api/person failed:", error);
  }
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
 * Asks this browser for Idle Detection and desktop notifications, on the
 * person's press. A refusal names what the browser kept and where to change it.
 */
export async function allowHere(): Promise<void> {
  state.pending = "allow";
  state.refusal = null;
  try {
    const after = await allowDesk();
    state.permissions = after;
    if (after.idle === "denied" || after.notify === "denied") {
      state.refusal = {
        message: blockedWords(after),
        title: presenceWords.blocked,
      };
      return;
    }
    state.ticked = true;
    setTimeout(() => {
      state.ticked = false;
    }, TICK_MS);
  } catch (error) {
    state.refusal = {
      message: error instanceof Error ? error.message : String(error),
      title: presenceWords.blocked,
    };
  } finally {
    state.pending = null;
  }
}

/** What the browser refused, and the way out. */
const blockedWords = (after: DeskPermissions): string => {
  const refused = [
    after.idle === "denied" ? "telling CawCo when you're at this computer" : "",
    after.notify === "denied" ? "desktop notifications" : "",
  ].filter(Boolean);
  return `This browser blocked ${refused.join(" and ")}. Allow ${refused.length > 1 ? "them" : "it"} in the site settings by the address bar, then reload.`;
};

/** Puts the onboarding row away in this browser; the presence menu still offers it. */
export function skipHere(): void {
  store("local", SKIPPED_KEY, "skipped");
  state.skipped = true;
  state.refusal = null;
}

/**
 * The onboarding row stands: this browser can use something it hasn't been
 * granted yet (Idle Detection, or notifications) and the row wasn't put away.
 */
export const asksHere = (): boolean => {
  const { permissions } = state;
  if (!permissions || state.skipped) {
    return false;
  }
  return permissions.idle === "prompt" || permissions.notify === "default";
};

/**
 * A desk alert for this tab: shown as a desktop notification while this
 * browser allows them and the person is not on this tab (visible and
 * focused, its Needs you already shows it), the hub's words as they are; a
 * click brings the tab forward at the session it is about.
 */
export function showDeskAlert(
  frame: DeskAlertFrame,
  index: InstanceIndex
): void {
  if (
    frame.to !== presenceClientId() ||
    typeof Notification === "undefined" ||
    Notification.permission !== "granted" ||
    (document.visibilityState === "visible" && document.hasFocus())
  ) {
    return;
  }
  const shown = new Notification(frame.title, {
    body: frame.body,
    tag: frame.collapseId,
  });
  shown.onclick = () => {
    window.focus();
    shown.close();
    goto(frame.session ? conversationHref(frame.session, index) : "/").catch(
      () => undefined
    );
  };
}
