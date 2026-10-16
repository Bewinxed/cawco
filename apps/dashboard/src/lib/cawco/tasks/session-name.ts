/**
 * What a task names the session that worked it by: its title as the sidebar
 * resolves it, else its harness; `Its session` while the fleet store has no
 * row for it.
 */
import { cawco } from "../client.svelte";
import { resolveSessionTitle } from "../links";

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
