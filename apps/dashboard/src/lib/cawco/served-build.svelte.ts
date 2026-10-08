/**
 * Whether the dashboard now serving this tab is a newer build than the tab
 * itself. Nothing here shows anything: the one update notice
 * (updates/update-notice.svelte.ts) says it, as the landing that replaced
 * the dashboard or, with no landing to announce, as the reload alone, and
 * the tab reloads itself once the operator isn't using it (reload.svelte.ts).
 *
 * The build bakes its version (the commit, `kit.version.name` in
 * vite.config.ts) into the page. The comparison is with the build the
 * dashboard's server is RUNNING, `_app/running-version.json` (serve.js),
 * which is the build a reload is answered with. SvelteKit's own
 * `updated.check()` reads `_app/version.json` off the disk instead, and a
 * deploy swaps the new build onto the disk before the server restarts into
 * it: a tab asked to reload then was handed the old build again and asked a
 * second time.
 *
 * It runs on every socket open. The socket is relayed through the dashboard's
 * own server (serve.js), so a dashboard restart always drops it and the
 * reconnect is the moment to ask.
 *
 * A build that also raises the wire (`WIRE_PROTOCOL`) reloads the same way
 * (reload.svelte.ts): a tab built for the older wire misreads the hub, so
 * it also stops reading it while it waits.
 */
import { version } from "$app/env";

let newer = $state<string | null>(null);

/** The build the dashboard serves, when it is not this tab's; otherwise null. */
export const newerBuild = (): string | null => newer;

/** The build a reload loads now, or null when the server can't be reached. */
export async function runningBuild(): Promise<string | null> {
  const response = await fetch("/_app/running-version.json", {
    cache: "no-store",
  }).catch(() => null);
  if (!response?.ok) {
    return null;
  }
  return ((await response.json()) as { version: string }).version;
}

export async function checkServedBuild(): Promise<void> {
  const running = await runningBuild();
  if (running !== null && running !== version) {
    newer = running;
  }
}
