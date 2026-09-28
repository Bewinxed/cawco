/**
 * Toasts when the dashboard now serving this tab is a newer build than the
 * tab itself.
 *
 * The comparison is SvelteKit's own: the build bakes its version (the commit,
 * `kit.version.name` in svelte.config.js) into the page and serves the same
 * string as `_app/version.json`, and `updated.check()` fetches that file and
 * compares. It used to compare the page with the hub's commit instead, but the
 * deploy poller restarts only the services a change touches: after a
 * dashboard-only deploy the hub keeps running the older commit, so every tab,
 * even one loaded a second ago, was told to reload, and the toast (it never
 * times out) sat over whatever the board had in its bottom-right corner.
 *
 * It runs on every socket open. The socket is relayed through the dashboard's
 * own server (serve.js), so a dashboard deploy always drops it and the
 * reconnect is the moment to ask. One toast per tab.
 */
import { toast } from "svelte-sonner";
import { updated } from "$app/state";

let toasted = false;

export async function checkDeployToast(): Promise<void> {
  if (toasted || !(await updated.check())) {
    return;
  }
  toasted = true;
  toast.info("Whiffle updated — reload to get the new version.", {
    id: "deploy-update",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Reload",
      onClick: () => location.reload(),
    },
  });
}
