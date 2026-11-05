/**
 * A new conversation in a project: a session in its checkout, scoped to the
 * project, on the New Session form's last harness, model and effort, in
 * the mode last chosen for that harness on that machine. Its panel's New
 * conversation and first words on its hero start one, and so does the
 * Routines tab's Ask Caw. The words go as its first prompt.
 */

import { conversationWords } from "@cawco/core/words/project-conversation";
import { spawnWords } from "@cawco/core/words/spawn";
import {
  answeredOr,
  cawco,
  type SendExtras,
  spawnSession,
} from "../client.svelte";
import { continuationStageWords } from "../continue.svelte";
import type { DraftContent } from "../draft-store";
import { newId } from "../id";
import { checkoutOf } from "../projects";
import {
  askedFor,
  beginStart,
  dropStart,
  type ParkedStart,
  parked,
  planAsks,
} from "../spawn/parked.svelte";
import { spawnPrefs } from "../spawnPrefs.svelte";

/**
 * Starts it; its session's id. Throws the hub's refusal, or why it can't
 * start, in words. Parked as the New Session form's starts are
 * (spawn/parked), marked as Caw's (`caw`), its session's id minted before it
 * is asked for: a reload while the hub answers finds the session on the
 * board and sends the first prompt the draft store kept, or says it did not
 * start, and his panel says which ({@link cawStartsOf}). A start this page
 * sees through is its caller's to show: it is let go as it answers.
 */
export async function startConversation(
  projectId: string,
  prompt: string,
  extras: SendExtras = {},
  /** What the composer held as it sent, kept for a reload to send. */
  content?: DraftContent
): Promise<string> {
  const project = cawco.project(projectId);
  const place = project ? checkoutOf(project) : undefined;
  if (!place) {
    throw new Error(conversationWords.noCheckout);
  }
  const { harness, model, effort } = spawnPrefs;
  const machine = cawco.machines.find(
    (one) => one.machineId === place.machineId
  );
  const mode = machine?.chosenModes?.[harness] ?? spawnPrefs.permissionMode;
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
      baseCwd: place.path,
      cwd: place.path,
      prompt,
      extras,
      harness,
      permissionMode: mode ?? null,
      model,
      effort,
      projectId,
      summarizer: { harness, model: "" },
      asks: false,
      usedModel: model,
    },
    prefill: { machineId: place.machineId, cwd: place.path, projectId },
    replacing: null,
    stage: continuationStageWords.starting,
  });
  planAsks(id, [
    { instanceId, machineId: place.machineId, asked: false, sent: false },
  ]);
  askedFor(id, instanceId);
  try {
    const started = await spawnSession({
      instanceId,
      machineId: place.machineId,
      cwd: place.path,
      prompt,
      extras,
      harness,
      ...(mode ? { permissionMode: mode } : {}),
      ...(model ? { model } : {}),
      ...(effort ? { effort } : {}),
      projectId,
    });
    return answeredOr(place.machineId, started, spawnWords.form.startUnknown);
  } finally {
    dropStart(id);
  }
}

/** The project's Caw starts parked in this tab (reactive): those running, and those a reload settled. */
export const cawStartsOf = (projectId: string): ParkedStart[] =>
  parked.list.filter((one) => one.caw === projectId);
