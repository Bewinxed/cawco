/**
 * Whether the dashboard now serving this tab is a newer build than the tab
 * itself. Nothing here shows anything: the one update notice
 * (updates/update-notice.svelte.ts) says it, as the landing that replaced
 * the dashboard or, with no landing to announce, as the reload alone. A
 * second box for the same event is what this used to be.
 *
 * The comparison is SvelteKit's own: the build bakes its version (the commit,
 * `kit.version.name` in svelte.config.js) into the page and serves the same
 * string as `_app/version.json`, and `updated.check()` fetches that file and
 * compares. It used to compare the page with the hub's commit instead, but a
 * release can replace the dashboard while the hub keeps running the older
 * commit, so every tab, even one loaded a second ago, was told to reload.
 *
 * It runs on every socket open. The socket is relayed through the dashboard's
 * own server (serve.js), so a dashboard update always drops it and the
 * reconnect is the moment to ask.
 *
 * A build that also raises the wire (`WIRE_PROTOCOL`) does not ask: a tab
 * built for the older wire misreads the hub, so it reloads itself with its
 * drafts kept (protocol-reload.ts).
 */
import { updated } from "$app/state";

let stale = $state(false);

/** This tab is older than the dashboard serving it. */
export const servedNewer = (): boolean => stale;

export async function checkServedBuild(): Promise<void> {
  if (!stale && (await updated.check())) {
    stale = true;
  }
}
