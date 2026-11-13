/**
 * Recent's stored transcripts as the hub keeps them (its `stored` frame):
 * the transcripts in a project's folder that no session wraps, the sessions
 * behind them that the board no longer lists, and one a page asked its
 * machine for; and what a stored transcript resumes with when the person's
 * first send on its page resumes it as a session of CawCo's.
 */

import { detach } from "@cawco/core/detach";
import {
  type EffortLevel,
  type HarnessKind,
  isEffortLevel,
  type PermissionMode,
  WIRE_PERMISSION_MODES,
} from "@cawco/core/harness/kinds";
import type { StoredRecent, StoredTranscript } from "@cawco/core/protocol";
import { CONTROL_STORED_RUN } from "@cawco/core/session/controls";
import type {
  NeutralSessionInfo,
  StoredRun,
} from "@cawco/core/session-messages";
import { transcriptWords } from "@cawco/core/words/transcript";
import { untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import { newId } from "#lib/platform/id.js";
import { answeredOr } from "../hub/control";
import type { FrameOf } from "../hub/frames";
import type { SendExtras } from "../send-store";
import { localUserMessage } from "../transcript/local";
import type { Message } from "../types";
import { holdActivities } from "./asks.svelte";
import {
  boardStore,
  holdOlderRows,
  machineConnected,
  machineName,
  rowById,
  servedBoard,
} from "./board.svelte";
import { machineControl } from "./machines";
import { type ForkSource, forkSession } from "./session-start.svelte";
import { session } from "./sessions.svelte";
import { addNote, place } from "./transcripts.svelte";

/**
 * Recent's stored transcripts as the hub last told them (core
 * `StoredRecent`, its `stored` frame); null until the first, while the
 * served board's stand ({@link storedNow}).
 */
let storedHeard = $state.raw<StoredRecent | null>(null);
/** Who waits on the next `stored` frame ({@link olderMoved}). */
const storedWaiters = new Set<() => void>();

/**
 * Transcripts stored on a machine that no list holds, each as its machine
 * answered for it when a page opened on it (a search result, an old
 * address: {@link readStoredInfo}), by session id.
 */
const storedInfos = new SvelteMap<
  string,
  { machineId: string; info: NeutralSessionInfo }
>();

/** Recent's stored transcripts as drawn: the hub's last word, else the served board's. */
const storedNow = (): StoredRecent =>
  storedHeard ?? servedBoard()?.stored ?? { rows: [], transcripts: [] };

/**
 * Recent's stored transcripts as the hub told them (its `stored` frame):
 * each older session into the board's index (board.svelte.ts
 * `holdOlderRows`), each one it no longer holds out of it.
 */
export function holdStored(stored: StoredRecent): void {
  const moved = holdOlderRows(stored.rows);
  if (moved) {
    holdActivities(moved);
  }
  storedHeard = stored;
  for (const waiter of storedWaiters) {
    waiter();
  }
  storedWaiters.clear();
}

export function takeStored(frame: FrameOf<"stored">): void {
  holdStored(frame.stored);
}

/** How long a change to a session the board no longer lists waits on the hub's word on it ({@link olderMoved}). */
const OLDER_MOVED_WAIT_MS = 5000;

/**
 * A session the board no longer lists changed on the hub (Done pressed on
 * it): the board says nothing of it, so this settles with the hub's next
 * word on the stored list, which holds it as it is now, or after
 * {@link OLDER_MOVED_WAIT_MS} without one. A session the board lists is
 * heard of on its frame.
 */
async function olderMoved(id: string): Promise<void> {
  if (!boardStore.olderInstances.some((row) => row.id === id)) {
    return;
  }
  await new Promise<void>((settled) => {
    const done = (): void => {
      clearTimeout(timer);
      storedWaiters.delete(done);
      settled();
    };
    const timer = setTimeout(done, OLDER_MOVED_WAIT_MS);
    storedWaiters.add(done);
  });
}

/** The stored transcripts a page asked their machine for, by session id ({@link readStoredInfo}). */
const storedInfoAsked = new Set<string>();

/** Where a page holds a stored transcript to be: its machine, its folder and its harness. */
export interface StoredWhere {
  cwd: string;
  harness: HarnessKind;
  machineId: string;
}

/**
 * Asks the machine `where` names for the stored transcript `sessionId` a
 * page opened on that no list holds (a search result, an old address),
 * once: what it answers is what the page resumes it by
 * (`storedStore.storedSource`).
 */
function readStoredInfo(where: StoredWhere, sessionId: string): void {
  const { machineId } = where;
  if (storedInfoAsked.has(sessionId) || !machineConnected(machineId)) {
    return;
  }
  storedInfoAsked.add(sessionId);
  detach(
    machineControl<NeutralSessionInfo | undefined>(
      machineId,
      "getSessionInfo",
      [sessionId, { dir: where.cwd || undefined }],
      undefined,
      where.harness
    ).then((answer) => {
      if (answer.kind === "answered" && answer.value) {
        storedInfos.set(sessionId, { machineId, info: answer.value });
      } else {
        storedInfoAsked.delete(sessionId);
      }
    }),
    "readStoredInfo"
  );
}

/**
 * What a stored transcript's first send resumes it with: what its machine
 * read it ran with (core `StoredRun`), under what the person picked in its
 * tab's details since. A value nothing names is null, and the resume names
 * none: its harness takes its own, as resuming it there would.
 */
export interface ResumePlan {
  /** The account it starts on; null: the machine's own sign-in, which the hub places. */
  account: string | null;
  effort: EffortLevel | null;
  model: string | null;
  permissionMode: PermissionMode | null;
  /** What its machine read, each value with where it was read; null until it has answered. */
  run: StoredRun | null;
}

/** What each stored transcript ran with, as its machine answered, by its harness key. */
const storedRuns = $state<Record<string, StoredRun>>({});
/** What the person picked for each one's resume since, over what it ran with. */
const resumePicks = $state<Record<string, Partial<Omit<ResumePlan, "run">>>>(
  {}
);
/** The reads asked of the machines, by harness key: each transcript is read once. */
const storedRunAsked = new Map<string, Promise<StoredRun>>();

/**
 * Asks `source`'s machine what the transcript ran with
 * ({@link CONTROL_STORED_RUN}), once; a read its machine refused or did not
 * answer is asked again the next time it is wanted.
 */
function readStoredRun(source: ForkSource): Promise<StoredRun> {
  const key = source.sessionId;
  let asked = storedRunAsked.get(key);
  if (!asked) {
    asked = machineControl<StoredRun>(
      source.machineId,
      CONTROL_STORED_RUN,
      [source.sessionId, { dir: source.cwd || undefined }],
      undefined,
      source.harness
    ).then((answer) => {
      const run = answeredOr(
        source.machineId,
        answer,
        transcriptWords.ranWithUnknown
      );
      storedRuns[key] = run;
      return run;
    });
    asked.catch(() => storedRunAsked.delete(key));
    storedRunAsked.set(key, asked);
  }
  return asked;
}

const ranValue = <T extends string>(
  value: { value: string } | undefined,
  is: (one: unknown) => one is T
): T | null => (value && is(value.value) ? value.value : null);

/** The plan for the stored transcript `key` names, as it stands: what it ran with, under the picks. */
function planOf(key: string): ResumePlan {
  const run = storedRuns[key] ?? null;
  const picks = resumePicks[key] ?? {};
  return {
    run,
    account:
      picks.account === undefined ? (run?.account ?? null) : picks.account,
    model: picks.model ?? run?.model?.value ?? null,
    effort: picks.effort ?? ranValue(run?.effort, isEffortLevel),
    permissionMode:
      picks.permissionMode ??
      ranValue(run?.permissionMode, (one): one is PermissionMode =>
        WIRE_PERMISSION_MODES.includes(one as PermissionMode)
      ),
  };
}

/** The refusal each stored transcript's last first message left in it ({@link resumeStored}): the next one takes it away. */
const resumeRefusals = new Map<string, Message>();

/**
 * The first send on a stored transcript's page (`viewId`, a transcript no
 * session wraps): it is resumed as a session of CawCo's, on its machine and
 * in its folder, with what it ran with ({@link ResumePlan}), `text` its
 * first prompt, through the one start on a stored conversation
 * ({@link forkSession}). His words stand in the transcript at once, and
 * under them, where its working line stands once it runs, a line says it
 * is being resumed. Once its machine has taken the start, `land` makes the
 * page the new session's (its tab re-addressed), where the same words
 * stand as its first prompt and the session works. A start its machine
 * refused or did not answer throws why, the words taken back for the
 * caller to put in the field.
 *
 * A transcript whose sign-in is no account of CawCo's on its machine (its
 * run's `account` null, none picked in its tab's details) is `refused`
 * before anything runs: nothing picks an account for it. The transcript
 * says so, with the sign-in and the ways on, and the words are the
 * caller's to put back.
 */
export async function resumeStored(
  source: ForkSource,
  text: string,
  extras: SendExtras,
  commandId: string,
  land: (instanceId: string) => void
): Promise<"resumed" | "refused"> {
  const viewId = source.sessionId;
  const target = session(viewId);
  const said = resumeRefusals.get(viewId);
  if (said) {
    resumeRefusals.delete(viewId);
    target.notes = target.notes.filter((held) => held.message.id !== said.id);
    place(target);
  }
  const run = await readStoredRun(source);
  const plan = planOf(viewId);
  if (run.account === null && !plan.account) {
    // Its sign-in is no account of CawCo's, and nothing picks one for it:
    // said where the resume would have stood, before anything runs.
    const refusal: Message = {
      id: newId(),
      instanceId: viewId,
      type: "ui.error",
      content: run.signIn
        ? transcriptWords.noAccount(machineName(source.machineId), run.signIn)
        : transcriptWords.noSignIn(machineName(source.machineId)),
      metadata: { errorTitle: transcriptWords.notResumed },
      timestamp: new Date().toISOString(),
    };
    resumeRefusals.set(viewId, refusal);
    addNote(target, refusal);
    return "refused";
  }
  // His words, then the line that says what is happening to them, where
  // the session's own working line stands once it runs: the transcript
  // works at nothing until then.
  const sent = localUserMessage(viewId, commandId, text, extras);
  const resuming: Message = {
    id: newId(),
    instanceId: viewId,
    type: "ui.system_note",
    content: transcriptWords.resuming,
    timestamp: new Date().toISOString(),
  };
  target.local.push(sent, resuming);
  place(target);
  try {
    const resumed = await forkSession({
      ...source,
      prompt: text,
      extras,
      commandId,
      ...(plan.account ? { account: plan.account } : {}),
      ...(plan.model ? { model: plan.model } : {}),
      ...(plan.effort ? { effort: plan.effort } : {}),
      ...(plan.permissionMode ? { permissionMode: plan.permissionMode } : {}),
    });
    if (resumed.kind === "unchosen") {
      // Its harness has modes and its machine named none: never guessed here.
      throw new Error(
        transcriptWords.noModeRead(machineName(source.machineId))
      );
    }
    land(answeredOr(source.machineId, resumed, transcriptWords.resumeUnknown));
    return "resumed";
  } finally {
    // The words go on in the session's own transcript, or back to the field.
    target.local = target.local.filter(
      (held) => held.id !== sent.id && held.id !== resuming.id
    );
    place(target);
  }
}

/** A stored transcript by its session id, where this page knows it: Recent's, or one a page asked its machine for. */
function storedOf(
  id: string
): { machineId: string; info: NeutralSessionInfo } | undefined {
  return (
    storedNow().transcripts.find((one) => one.info.sessionId === id) ??
    storedInfos.get(id)
  );
}

/**
 * The transcript stored on a machine that view `id` is of, as a session
 * could resume it, when the hub holds no row under that id: a transcript
 * no session wraps (a tab of one a session wraps takes that session's id
 * as it opens, workspace `enter`). One no list holds is asked of the
 * machine its page holds it on (`where`), and is this once it answers.
 * Null for any other view.
 */
function storedSource(
  id: string,
  where?: StoredWhere | null
): ForkSource | null {
  if (rowById(id) !== undefined) {
    return null;
  }
  const known = storedOf(id);
  if (known) {
    return {
      machineId: known.machineId,
      cwd: known.info.cwd ?? "",
      harness: known.info.harness,
      sessionId: id,
      resumes: true,
    };
  }
  if (where) {
    untrack(() => readStoredInfo(where, id));
  }
  return null;
}

/** Recent's stored transcripts, a stored transcript by its id, and what one resumes with. */
export const storedStore = {
  /**
   * The transcripts in a project's folder that a person started outside
   * CawCo and no session wraps (the hub's `StoredRecent`): Recent's stored
   * rows.
   */
  get storedTranscripts(): StoredTranscript[] {
    return storedNow().transcripts;
  },
  storedOf,
  /** The stored transcripts this page knows on one machine ({@link storedOf}). */
  storedOn(machineId: string): NeutralSessionInfo[] {
    return [
      ...storedNow().transcripts.filter((one) => one.machineId === machineId),
      ...[...storedInfos.values()].filter((one) => one.machineId === machineId),
    ].map((one) => one.info);
  },
  storedSource,
  /**
   * What view `id`, a stored transcript no session wraps, resumes with
   * ({@link ResumePlan}), its machine asked what it ran with the first time
   * this is read; null for any other view.
   */
  resumePlan(id: string, where?: StoredWhere | null): ResumePlan | null {
    const source = storedSource(id, where);
    if (!source) {
      return null;
    }
    if (!(id in storedRuns) && machineConnected(source.machineId)) {
      detach(
        untrack(() => readStoredRun(source)),
        "readStoredRun"
      );
    }
    return planOf(id);
  },
  /** Picks what a stored transcript resumes with, over what it ran with. */
  pickResume(id: string, pick: Partial<Omit<ResumePlan, "run">>): void {
    resumePicks[id] = { ...resumePicks[id], ...pick };
  },
  /** Settles with the hub's word on a session the board no longer lists, after a change to it the hub took. */
  olderMoved,
};
