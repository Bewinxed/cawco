/**
 * The fleet's helpers and step lists (core own-tools.ts), read on connect
 * (`/api/own-tools`) and written by the first run's two steps and Configure ›
 * Helpers & step lists: each null until a person has chosen it, so the first
 * run asks it. A pick saves at once; one made while that switch's save is on
 * its way is shown at once and saved when that one settles, so the latest
 * pick holds and no press is lost. A failed save puts the hub's choice back
 * and says why.
 */
import { detach } from "@cawco/core/detach";
import type {
  Helpers,
  OwnTools,
  OwnToolsChosen,
  StepLists,
} from "@cawco/core/own-tools";
import { ownToolsWords as words } from "@cawco/core/words/own-tools";
import { hub } from "#lib/platform/hub.js";
import {
  failureClause,
  failureWords,
  hubAsk,
  hubData,
  hubSaid,
} from "#lib/platform/hub-read.js";

export type OwnToolKey = keyof OwnTools;

/** One switch's pick. */
export type OwnToolPick =
  { key: "helpers"; value: Helpers } | { key: "stepLists"; value: StepLists };

/** A switch's save: none yet, on its way, just landed, or refused. */
export type SavePhase = "idle" | "saving" | "saved" | "failed";

interface SwitchState {
  /** Why its last save didn't hold, in words. */
  fault: string | null;
  /** A pick made while a save was on its way. */
  next: OwnToolPick | null;
  phase: SavePhase;
}

const idle = (): SwitchState => ({ fault: null, next: null, phase: "idle" });

const state = $state<{
  /** The hub's choices; null until read. */
  held: OwnToolsChosen | null;
  /** The choices on screen: the hub's, or the ones being saved. */
  shown: OwnToolsChosen;
  /** Why they couldn't be read. */
  unread: string | null;
  switches: Record<OwnToolKey, SwitchState>;
}>({
  held: null,
  shown: { helpers: null, stepLists: null },
  unread: null,
  switches: { helpers: idle(), stepLists: idle() },
});

/** Reads the fleet's choices; says why when it can't. */
export async function readOwnTools(): Promise<void> {
  try {
    const read = await hubData(hub.api["own-tools"].get());
    state.held = read;
    state.shown = { ...read };
    state.unread = null;
  } catch (error) {
    state.unread = words.unread(failureClause(error));
  }
}

/** The pick on screen at once. */
const show = (pick: OwnToolPick): void => {
  if (pick.key === "helpers") {
    state.shown.helpers = pick.value;
  } else {
    state.shown.stepLists = pick.value;
  }
};

const bodyOf = (pick: OwnToolPick): Partial<OwnTools> =>
  pick.key === "helpers" ? { helpers: pick.value } : { stepLists: pick.value };

async function save(pick: OwnToolPick): Promise<void> {
  const one = state.switches[pick.key];
  one.phase = "saving";
  one.fault = null;
  let fault: string | null = null;
  try {
    const answer = await hubAsk(hub.api["own-tools"].put(bodyOf(pick)));
    if (answer.ok) {
      state.held = answer.value;
    } else {
      fault = words.refused(hubSaid(answer.refused));
    }
  } catch (error) {
    fault = words.unsent(failureWords(error));
  }
  const later = one.next;
  one.next = null;
  if (later && later.value !== state.held?.[later.key]) {
    await save(later);
    return;
  }
  // What the hub holds for this switch, back on screen: the pick, or what
  // it kept. The other switch's pick on screen stays.
  if (pick.key === "helpers") {
    state.shown.helpers = state.held?.helpers ?? null;
  } else {
    state.shown.stepLists = state.held?.stepLists ?? null;
  }
  one.fault = fault;
  one.phase = fault ? "failed" : "saved";
}

/** Picks a side of one switch, saved at once. */
export function chooseOwnTool(pick: OwnToolPick): void {
  if (!state.held) {
    return;
  }
  show(pick);
  const one = state.switches[pick.key];
  if (one.phase === "saving") {
    one.next = pick;
    return;
  }
  detach(save(pick), "saveOwnTool");
}

/** The fleet's helpers and step lists, as read and as being saved. */
export const ownToolsStore = {
  /** Whether the hub has answered. */
  get read(): boolean {
    return state.held !== null;
  },
  get shown(): OwnToolsChosen {
    return state.shown;
  },
  get unread(): string | null {
    return state.unread;
  },
  phaseOf(key: OwnToolKey): SavePhase {
    return state.switches[key].phase;
  },
  faultOf(key: OwnToolKey): string | null {
    return state.switches[key].fault;
  },
};
