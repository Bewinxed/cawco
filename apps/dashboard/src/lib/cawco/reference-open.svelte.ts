/**
 * A press on an artifact's chip, a pin's or a decision card's (core
 * references.ts): the artifact comes to the front of its session's panel
 * (the hub's show, which every view of that panel follows, the phone's
 * sheet too), and the pane holding it opens it at the place the chip names
 * once its page is ready (artifact-names.svelte.ts `askOpen`). In an
 * artifact's own tab, a chip of another artifact opens that artifact's own
 * tab at the place (`?pin=<n>`, `?card=<id>`), as a pin's Copy link does.
 */
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { showArtifact } from "./artifact-api";
import { artifactNamed, askOpen, type OpenAt } from "./artifact-names.svelte";
import { cawco, revealPreview } from "./client.svelte";
import { failureWords } from "./hub-read";
import { toast } from "./toasts";

/** The address of artifact `id`'s own tab, opening at `at`. */
const ownTab = (id: string, at: OpenAt): string => {
  const base = `/artifact/${encodeURIComponent(id)}`;
  if ("pin" in at) {
    return `${base}?pin=${at.pin}`;
  }
  if ("card" in at) {
    return `${base}?card=${encodeURIComponent(at.card)}`;
  }
  return base;
};

/** Artifact `id` opened in the panel at `at`; a refusal is said in a toast. */
export async function openReference(id: string, at: OpenAt): Promise<void> {
  const named = artifactNamed(id);
  if (!named) {
    return;
  }
  if (page.route.id === "/artifact/[id]" && page.params.id !== id) {
    await goto(ownTab(id, at));
    return;
  }
  askOpen(id, at);
  // Already in front: the pane opens the place where the page stands, with no show to load it again.
  const panel = cawco.previews[named.instanceId];
  if (panel?.state === "open" && panel.artifact.id === id) {
    revealPreview(named.instanceId);
    return;
  }
  try {
    await showArtifact(named.instanceId, id);
    revealPreview(named.instanceId);
  } catch (error) {
    toast.error(failureWords(error));
  }
}
