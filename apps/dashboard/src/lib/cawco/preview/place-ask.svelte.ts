/**
 * A place in an artifact the person asked for from outside its pane (a
 * transcript's chip, core references.ts): pin N, or a decision card. Kept
 * until the pane showing that artifact has its page and its doc and takes
 * it, once, so a press made before the page is ready still lands, as the
 * own tab's `?pin=` does (PreviewPane `openLinkedPin`).
 */
export type PlaceAsked = { pin: number } | { card: string };

const asked = $state<Record<string, PlaceAsked>>({});

/** Asks the pane that shows artifact `artifact` to open `place` once it can; a later ask replaces it. */
export function askPlace(artifact: string, place: PlaceAsked): void {
  asked[artifact] = place;
}

/** The place asked of artifact `artifact`, or null; reading it is a dependency, so a pane hears a new ask. */
export const placeAsked = (artifact: string): PlaceAsked | null =>
  asked[artifact] ?? null;

/** The place asked of artifact `artifact` is taken: a second take answers nothing. */
export function placeTaken(artifact: string): void {
  delete asked[artifact];
}
