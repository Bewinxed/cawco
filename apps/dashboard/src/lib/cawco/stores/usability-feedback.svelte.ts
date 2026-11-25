/**
 * Usability feedback's consent (core usability-feedback.ts), read on connect
 * (`/api/usability-feedback`) and written by the first run's step and
 * Configure › Feedback to CawCo:
 * null until a person answers, so the dashboard asks. An answer saves at
 * once and shows at once; one given while a save is on its way is saved
 * when that one settles, so the latest answer holds. A failed save puts the
 * hub's answer back and says why.
 */
import { detach } from "@cawco/core/detach";
import type { FeedbackState } from "@cawco/core/usability-feedback";
import { usabilityFeedbackWords as words } from "@cawco/core/words/usability-feedback";
import { hub } from "#lib/platform/hub.js";
import {
  failureClause,
  hubAsk,
  hubData,
  savedSetting,
} from "#lib/platform/hub-read.js";
import type { SavePhase } from "./own-tools.svelte";

const state = $state<{
  /** What the hub holds; null until read. */
  held: FeedbackState | null;
  /** The answer on screen: the hub's, or the one being saved. */
  shown: boolean | null;
  /** An answer given while a save was on its way. */
  next: boolean | null;
  phase: SavePhase;
  /** Why the last save didn't hold, in words. */
  fault: string | null;
  /** Why it couldn't be read. */
  unread: string | null;
}>({
  held: null,
  shown: null,
  next: null,
  phase: "idle",
  fault: null,
  unread: null,
});

/** Reads the hub's answer; says why when it can't. */
export async function readFeedback(): Promise<void> {
  try {
    const read = await hubData(hub.api["usability-feedback"].get());
    state.held = read;
    state.shown = read.consent;
    state.unread = null;
  } catch (error) {
    state.unread = words.unread(failureClause(error));
  }
}

async function save(consent: boolean): Promise<void> {
  state.phase = "saving";
  state.fault = null;
  const saved = await savedSetting(
    hubAsk(hub.api["usability-feedback"].put({ consent })),
    words
  );
  if (saved.ok) {
    state.held = saved.value;
  }
  const fault = saved.ok ? null : saved.fault;
  const later = state.next;
  state.next = null;
  if (later !== null && later !== state.held?.consent) {
    await save(later);
    return;
  }
  state.shown = state.held?.consent ?? null;
  state.fault = fault;
  state.phase = fault ? "failed" : "saved";
}

/** The person's answer, saved at once. */
export function chooseFeedback(consent: boolean): void {
  if (!state.held) {
    return;
  }
  state.shown = consent;
  if (state.phase === "saving") {
    state.next = consent;
    return;
  }
  detach(save(consent), "saveFeedbackConsent");
}

/** The fleet's answer, as read and as being saved. */
export const feedbackStore = {
  /** Whether the hub has answered. */
  get read(): boolean {
    return state.held !== null;
  },
  /** The answer on screen; null while no person has given one. */
  get shown(): boolean | null {
    return state.shown;
  },
  /** Whether a machine of the fleet signs in to GitHub, which sends the feedback. */
  get signedIn(): boolean {
    return state.held?.signedIn ?? false;
  },
  get phase(): SavePhase {
    return state.phase;
  },
  get fault(): string | null {
    return state.fault;
  },
  get unread(): string | null {
    return state.unread;
  },
};
