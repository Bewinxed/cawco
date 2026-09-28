/**
 * Toasts when the hub runs a different build from this page.
 *
 * The hub's first frame on every connection is an `instances` frame carrying
 * its {@link BuildInfo}, and every later board frame repeats it. This page's
 * own commit is baked in at build time (`__WHIFFLE_COMMIT__`, vite.config.ts),
 * so a tab that first connects to an already-newer hub is told on that first
 * frame, and a tab left open across a deploy is told on the reconnect. One
 * toast per new commit, never per reconnect.
 */
import type { BuildInfo } from "@whiffle/core";
import { toast } from "svelte-sonner";

/** The last commit we toasted for, so the same deploy never fires twice. */
let toastedCommit: string | undefined;

/**
 * Called on every board frame with the hub's build. Toasts exactly once per
 * hub commit that differs from the one this page was built from.
 */
export function checkDeployToast(hubBuild: BuildInfo | undefined): void {
  const commit = hubBuild?.commit;
  if (!commit || commit === __WHIFFLE_COMMIT__ || commit === toastedCommit) {
    return;
  }

  toastedCommit = commit;
  toast.info("Whiffle updated — reload to get the new version.", {
    id: "deploy-update",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Reload",
      onClick: () => location.reload(),
    },
  });
}
