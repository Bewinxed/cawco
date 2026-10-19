/**
 * The fleet's two answers about the session that worked a task, read from
 * the fleet store: its name and where it works. A task's views take them
 * as props (`NameOf`, `PlaceOf`), so a sheet hands its fixture's instead
 * and never loads the store.
 */
import { cawco } from "../client.svelte";
import { resolveSessionTitle } from "../links";

/** Its title as the sidebar resolves it, else its harness; `Its session` while the store has no row for it. */
export function sessionName(instanceId: string): string {
  const row = cawco.instanceIndex.byId.get(instanceId);
  if (!row) {
    return "Its session";
  }
  return (
    resolveSessionTitle({ title: row.title, cwd: row.cwd, id: row.id }) ||
    row.harness ||
    "Its session"
  );
}

/** Where it works, as the fleet's index has it: its mark's hue; its id while unknown. */
export const sessionPlace = (instanceId: string): string =>
  cawco.instanceIndex.byId.get(instanceId)?.cwd ?? instanceId;
