/**
 * A press on an artifact's chip, a pin's or a decision card's (core
 * references.ts): the artifact comes to the front of the panel of the
 * session whose conversation the chip stands in, else of its own session's
 * (the hub's show, which every view of that panel follows, the phone's
 * sheet too), and the pane holding it opens it at the place the chip names
 * once its page is ready (artifact-names.svelte.ts `askOpen`). In an
 * artifact's own tab, a chip of another artifact opens that artifact's own
 * tab at the place (`?pin=<n>`, `?card=<id>`, `?change=<anchor>`), as a
 * pin's Copy link does.
 */
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { showArtifact } from "./artifact-api";
import { artifactNamed, askOpen, type OpenAt } from "./artifact-names.svelte";
import { barGlass } from "./bar-glass.svelte";
import { cawco, revealPreview } from "./client.svelte";
import { failureClause } from "./hub-read";
import { askPlan, type Thing } from "./reference-things.svelte";
import { refusals } from "./refusals.svelte";

/** The address of artifact `id`'s own tab, opening at `at`. */
const ownTab = (id: string, at: OpenAt): string => {
  const base = `/artifact/${encodeURIComponent(id)}`;
  if ("pin" in at) {
    return `${base}?pin=${at.pin}`;
  }
  if ("card" in at) {
    return `${base}?card=${encodeURIComponent(at.card)}`;
  }
  if ("change" in at) {
    return `${base}?change=${encodeURIComponent(at.change)}`;
  }
  return base;
};

/**
 * Artifact `id` opened in the panel at `at`: the panel of `here`, the
 * session whose conversation the chip was pressed in (session-here.ts),
 * where there is one, so it opens on the session on screen (the hub shows
 * one there that session owns, made, or its delegation tree holds); else
 * the panel of the session it belongs to. Answers the hub's refusal in the
 * error formula, for the chip that was pressed to say beside itself with
 * Try again (never a toast: DESIGN.md, The Work Outlives Its Surface Rule),
 * or null once it opened.
 */
export async function openReference(
  id: string,
  at: OpenAt,
  here?: string
): Promise<string | null> {
  const named = artifactNamed(id);
  if (!named) {
    return null;
  }
  if (page.route.id === "/artifact/[id]" && page.params.id !== id) {
    await goto(ownTab(id, at));
    return null;
  }
  const session = here ?? named.instanceId;
  askOpen(id, at);
  // Already in front: the pane opens the place where the page stands, with no show to load it again.
  const panel = cawco.previews[session];
  if (panel?.state === "open" && panel.artifact.id === id) {
    revealPreview(session);
    return null;
  }
  try {
    await showArtifact(session, id);
    revealPreview(session);
    return null;
  } catch (error) {
    return `${named.name} was not opened: ${failureClause(error)}. The panel stays as it was.`;
  }
}

/** Where an artifact's refused open is said: its Needs-you row and its notice (refusals.svelte.ts). */
export const artifactOpenKey = (id: string): string => `artifact-open:${id}`;

/**
 * Artifact `id` in session `instanceId`'s panel, opened at `at`: a
 * Needs-you row's or notice's press, and its address
 * (`?artifact=<id>&stop=…`, core `artifactStopHref`) wherever it is
 * followed from. The hub's refusal is kept at {@link artifactOpenKey}, where
 * the row says it with Try again (never a toast), and answered; null once
 * it opened, which takes a refusal said before away.
 */
export async function openArtifactIn(
  instanceId: string,
  id: string,
  at: OpenAt
): Promise<string | null> {
  const key = artifactOpenKey(id);
  askOpen(id, at);
  const panel = cawco.previews[instanceId];
  if (panel?.state === "open" && panel.artifact.id === id) {
    revealPreview(instanceId);
    refusals.delete(key);
    return null;
  }
  try {
    await showArtifact(instanceId, id);
    revealPreview(instanceId);
    refusals.delete(key);
    return null;
  } catch (error) {
    const name = artifactNamed(id)?.name ?? "The artifact";
    const reason = `${name} was not opened: ${failureClause(error)}. The panel stays as it was.`;
    refusals.set(key, { reason, asked: { instanceId, id, at } });
    return reason;
  }
}

/**
 * A thing's chip pressed (a task's, a to-do's, a plan's, a step's, a
 * routine's, a project's, a machine's): its page opens; a
 * plan or a step opens over its session's composer, at the step; a machine opens
 * the machines onto its row, where the dashboard keeps them (the bar's card,
 * a phone's sidebar).
 */
export async function openThing(thing: Thing): Promise<void> {
  const { place } = thing;
  if ("machines" in place) {
    barGlass.showMachine(place.machines);
    return;
  }
  if ("plan" in place) {
    askPlan(place.plan, place.step);
    const at = `/session/${encodeURIComponent(place.plan)}`;
    if (page.url.pathname !== at) {
      await goto(at);
    }
    return;
  }
  await goto(place.href);
}
