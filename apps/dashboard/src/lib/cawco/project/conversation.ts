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
import { checkoutOf } from "../projects";
import { spawnPrefs } from "../spawnPrefs.svelte";

/** Starts it; its session's id. Throws the hub's refusal, or why it can't start, in words. */
export async function startConversation(
  projectId: string,
  prompt: string,
  extras: SendExtras = {}
): Promise<string> {
  const project = cawco.project(projectId);
  const place = project ? checkoutOf(project) : undefined;
  if (!place) {
    throw new Error(conversationWords.noCheckout);
  }
  const { harness } = spawnPrefs;
  const machine = cawco.machines.find(
    (one) => one.machineId === place.machineId
  );
  const mode = machine?.chosenModes?.[harness] ?? spawnPrefs.permissionMode;
  const started = await spawnSession({
    machineId: place.machineId,
    cwd: place.path,
    prompt,
    extras,
    harness,
    ...(mode ? { permissionMode: mode } : {}),
    ...(spawnPrefs.model ? { model: spawnPrefs.model } : {}),
    ...(spawnPrefs.effort ? { effort: spawnPrefs.effort } : {}),
    projectId,
  });
  return answeredOr(place.machineId, started, spawnWords.form.startUnknown);
}
