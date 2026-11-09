/**
 * A press on an artifact's chip, a pin's or a decision card's (core
 * references.ts): the artifact comes to the front of the panel of the
 * session whose conversation the chip stands in when that session holds it
 * (its own, one it made, or its delegation tree's), else of its own
 * session's, which opens as a tab beside the one on screen (on a phone in
 * its place, Back returning): the hub's show answers which (hub
 * artifacts/service.ts `show`), every view of that panel follows it, the
 * phone's sheet too, and the pane holding it opens it at the place the chip
 * names once its page is ready (artifact-names.svelte.ts `askOpen`). In an
 * artifact's own tab, a chip of another artifact opens that artifact's own
 * tab at the place (`?pin=<n>`, `?card=<id>`, `?change=<anchor>`), as a
 * pin's Copy link does. A project's setup page, which no panel or tab
 * opens, goes to its project's page at the page and the card (core
 * `setupPageAt`), which draws it where it stands: in Decisions at the card,
 * or the board's draft while the project is not set up and no card is
 * named (setup-progress.ts `setupLandsOnBoard`, core `setupLanding`). A
 * press made before the chip knew what it names waits for the hub's word,
 * so the first press lands.
 */
import { SETUP_PAGE, setupPageAt } from "@cawco/core/artifact-needs";
import { failureClause } from "#lib/platform/hub-read.js";
import { goto } from "$app/navigation";
import { page } from "$app/state";
import { showArtifact } from "./artifact-api";
import {
  artifactNamed,
  artifactNamedNow,
  askOpen,
  type NamedArtifact,
  type OpenAt,
} from "./artifact-names.svelte";
import { barGlass } from "./bar-glass.svelte";
import { cawco, revealPreview } from "./client.svelte";
import { askPlan, type Thing } from "./reference-things.svelte";
import { refusals } from "./refusals.svelte";

/** Whether `named` is a project's setup page, which opens in no panel (hub artifacts/service.ts `boardOf`). */
const isSetupPage = (named: NamedArtifact): boolean =>
  named.kind === "page" &&
  named.name === SETUP_PAGE &&
  named.project !== undefined;

/** The decision card `at` names, which a project's setup page lands at (core `setupLanding`). */
const cardOf = (at: OpenAt): string | null => ("card" in at ? at.card : null);

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
 * where there is one and it holds the artifact (owns it, made it, or its
 * delegation tree does), so it opens on the session on screen; else the
 * panel of the session it belongs to, which the hub's answer opens as a
 * tab beside the one on screen (`showArtifact`). Answers the hub's refusal in the
 * error formula, for the chip that was pressed to say beside itself with
 * Try again (never a toast: DESIGN.md, The Work Outlives Its Surface Rule),
 * or null once it opened.
 */
export async function openReference(
  id: string,
  at: OpenAt,
  here?: string
): Promise<string | null> {
  const named = await artifactNamedNow(id);
  if (!named) {
    return "It was not opened: the hub holds nothing by that link now.";
  }
  // A project's setup page opens in no panel and no tab of its own: its
  // project's page draws it, from wherever the chip stands. Through the
  // hub's show it was refused for any session but the page's own (a newer
  // conversation's chip), and from the project's own page went nowhere.
  if (isSetupPage(named) && named.project) {
    await goto(setupPageAt(named.project, cardOf(at)));
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
    const where = await showArtifact(session, id, at);
    if (where === "panel") {
      revealPreview(session);
    }
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
    const where = await showArtifact(instanceId, id, at);
    // A page drew it (a project's setup page): no panel to bring forward.
    if (where === "panel") {
      revealPreview(instanceId);
    }
    refusals.delete(key);
    return null;
  } catch (error) {
    const title = artifactNamed(id)?.title ?? "The artifact";
    const reason = `${title} was not opened: ${failureClause(error)}. The panel stays as it was.`;
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
