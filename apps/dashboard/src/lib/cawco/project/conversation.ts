/**
 * A new conversation in a project, started as every start of it is (hub
 * caw.ts `startOf`, which the hub answers here): where its checkout is
 * online, else its folder on the hub or a folder of its own, scoped to the
 * project, on the project's harness and model, in the project's mode, else
 * the one last chosen for that harness on that machine. Its panel's New
 * conversation and first words on its hero start one, and so does the
 * Routines tab's Ask Caw. The words go as its first prompt.
 */

import { detach } from "@cawco/core/detach";
import { spawnWords } from "@cawco/core/words/spawn";
import { newId } from "#lib/platform/id.js";
import {
  conversationStart,
  drawFirstPrompt,
  type HeldSend,
  nameConversation,
  type SendExtras,
  spawnSession,
  withdrawFirstPrompt,
} from "../client.svelte";
import { continuationStageWords } from "../continue.svelte";
import type { DraftContent } from "../draft-store";
import { answeredOr } from "../hub/control";
import {
  askedFor,
  beginStart,
  dropStart,
  type ParkedStart,
  parked,
  planAsks,
} from "../spawn/parked.svelte";

/**
 * Starts it; its session's id. Throws the hub's refusal, or why it can't
 * start, in words. How it starts is the hub's to say, the one rule every start of the project's
 * conversation takes (hub caw.ts `startOf`), asked for first: a project
 * with no checkout still has a place. Parked as the New Session form's starts are
 * (spawn/parked), marked as Caw's (`caw`), its session's id minted before it
 * is asked for: a reload while the hub answers finds the session on the
 * board and sends the first prompt the draft store kept, or says it did not
 * start, and his panel says which ({@link cawStartsOf}). A start this page
 * sees through is its caller's to show: it is let go as it answers.
 *
 * The person's words are drawn in the conversation before its spawn is
 * asked for, as theirs, the session at work after them (client
 * `drawFirstPrompt`): `drawn` hands the caller the session's id then, so it
 * shows the conversation from the first moment. What the person writes to
 * it meanwhile is drawn and held, and goes after them (client
 * `holdForStart`). A start that fails takes all of it back before it
 * throws, the held sends handed to `withdrawn` for the caller to put back.
 */
export async function startConversation(
  projectId: string,
  prompt: string,
  extras: SendExtras = {},
  /** What the composer held as it sent, kept for a reload to send. */
  content?: DraftContent,
  /** The conversation's session id, as its first words are drawn in it. */
  drawn?: (instanceId: string) => void,
  /** A start that failed: what was written to it while it started, oldest first. */
  withdrawn?: (held: HeldSend[]) => void
): Promise<string> {
  const place = await conversationStart(projectId);
  const { harness } = place;
  const model = place.model ?? "";
  const mode = place.permissionMode;
  const id = newId();
  const instanceId = newId();
  beginStart({
    id,
    caw: projectId,
    content: content ?? {
      text: prompt,
      images: [],
      texts: [],
      files: [],
      canvas: null,
    },
    draft: {
      machineIds: [place.machineId],
      baseCwd: place.cwd,
      cwd: place.cwd,
      prompt,
      extras,
      harness,
      permissionMode: mode,
      model,
      effort: null,
      projectId,
      summarizer: { harness, model: "" },
      asks: false,
      usedModel: model,
    },
    prefill: { machineId: place.machineId, cwd: place.cwd, projectId },
    replacing: null,
    stage: continuationStageWords.starting,
  });
  planAsks(id, [
    { instanceId, machineId: place.machineId, asked: false, sent: false },
  ]);
  askedFor(id, instanceId);
  const commandId = newId();
  drawFirstPrompt(instanceId, commandId, prompt, extras, {
    machineId: place.machineId,
    cwd: place.cwd,
    harness,
  });
  drawn?.(instanceId);
  try {
    const started = await spawnSession({
      firstCommandId: commandId,
      instanceId,
      machineId: place.machineId,
      cwd: place.cwd,
      prompt,
      extras,
      harness,
      ...(mode ? { permissionMode: mode } : {}),
      ...(model ? { model } : {}),
      projectId,
    });
    const made = answeredOr(
      place.machineId,
      started,
      spawnWords.form.startUnknown
    );
    makeHis(projectId, made);
    return made;
  } catch (error) {
    withdrawn?.(withdrawFirstPrompt(instanceId, commandId));
    throw error;
  } finally {
    dropStart(id);
  }
}

/**
 * The conversation a start of his made is the project's conversation (hub
 * caw.ts `name`): the one its row names, which his panel shows (CawLead
 * `conversation`) and his events reach. A session merely in the project is
 * none of his. A refusal is logged; the panel that started it shows it on.
 */
export const makeHis = (projectId: string, instanceId: string): void => {
  detach(nameConversation(projectId, instanceId), "name Caw's conversation");
};

/** The project's Caw starts parked in this tab (reactive): those running, and those a reload settled. */
export const cawStartsOf = (projectId: string): ParkedStart[] =>
  parked.list.filter((one) => one.caw === projectId);
