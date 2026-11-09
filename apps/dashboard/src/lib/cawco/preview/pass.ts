import { hostModeDomain, previewEnterUrl } from "@cawco/core/preview/routes";
import { previewWords } from "@cawco/core/words/preview";
import { hub } from "#lib/platform/hub.js";
import { hubAsk, hubRefusal } from "#lib/platform/hub-read.js";

/**
 * Whether `origin` is an origin's own port: the dashboard's own host (core
 * `previewRoute` puts a port on the host the dashboard was reached at),
 * where host mode's names stand on names of their own.
 */
const byPort = (origin: string): boolean =>
  new URL(origin).hostname === location.hostname;

/** What one pass covers for `origin`: its host by its scheme on a port, else host mode's domain. */
const passScope = (origin: string): string => {
  const at = new URL(origin);
  return byPort(origin)
    ? `${at.protocol}//${at.hostname}`
    : hostModeDomain(origin);
};

/** Why a frame of `origin` was turned away twice, in the dashboard's words. */
export const turnedAwayWords = (origin: string): string =>
  byPort(origin)
    ? previewWords.portPassTurnedAway(new URL(origin).hostname)
    : previewWords.passTurnedAway(
        hostModeDomain(origin),
        location.protocol === "https:"
      );

interface Entry {
  done: Promise<string | null>;
  /** When it landed (`performance.now()`); unset while in flight. */
  landed?: number;
  /** Why it opened nothing; null once the pass is set. */
  refused?: string | null;
}

/** The newest entry by what its pass covers ({@link passScope}). */
const entries = new Map<string, Entry>();

/** A ticket from the hub, spent on `origin`: null once spent, else why not. */
async function enter(origin: string): Promise<string | null> {
  const answer = await hubAsk(hub.api["preview-ticket"].post()).catch(
    () => null
  );
  if (!answer?.ok) {
    return answer
      ? hubRefusal(answer.refused).message
      : "The hub didn't give this browser a pass to its previews.";
  }
  const { ticket } = answer.value;
  // The entry's answer is the preview's origin's, opaque to this page: its
  // pass is the browser's to keep, and the frame's next load says whether
  // it stood.
  return fetch(previewEnterUrl(origin, ticket), {
    mode: "no-cors",
    credentials: "include",
    cache: "no-store",
  }).then(
    () => null,
    () => `${new URL(origin).host} didn't answer the entry`
  );
}

/**
 * Enters the previews `origin`'s pass covers: null once a frame there may
 * load, else the hub's words for why it can't. Before a frame's first load
 * `since` is left out, and any entry of this page that let it in stands. For
 * a frame turned away, `since` is when it last stood without a pass
 * (`performance.now()`), and only an entry that landed after it stands.
 */
export function enterPreviews(
  origin: string,
  since = Number.NEGATIVE_INFINITY
): Promise<string | null> {
  const scope = passScope(origin);
  const held = entries.get(scope);
  if (
    held &&
    (held.landed === undefined ||
      (held.refused === null && held.landed > since))
  ) {
    return held.done;
  }
  const entry: Entry = { done: enter(origin) };
  entry.done.then((refused) => {
    entry.landed = performance.now();
    entry.refused = refused;
  });
  entries.set(scope, entry);
  return entry.done;
}
