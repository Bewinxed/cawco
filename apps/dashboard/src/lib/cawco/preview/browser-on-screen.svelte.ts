/**
 * Which browser surfaces stand on this screen: a browser ask's card (its
 * session's transcript, Prompt.svelte) and a browser's view (the session's
 * artifact panel, BrowserView). One surface owns each thing (DESIGN.md,
 * "Browser view"): the view the origin, who drives and Take over; the card
 * the reason and Deny. When both are on screen each sheds what the other
 * owns, so each asks this whether the other stands. A surface counts while
 * it is mounted in this document: the head-less `/browser/<id>` tab has no
 * card, so its view stands alone.
 */
import type { BrowserKey } from "@cawco/core/browser";
import { untrack } from "svelte";

/** A browser view on screen: the session whose panel shows it, its artifact and browser. */
interface ViewOnScreen {
  artifactId: string;
  instanceId: string;
  key: BrowserKey;
}

/** A browser ask on screen: its card, by request. */
interface CardOnScreen {
  instanceId: string;
  requestId: string;
}

/**
 * Each list as it stands, replaced whole on every change: an entry is kept
 * as it was given (a deep `$state` would hold a proxy of it, which the
 * entry itself never equals), and removed by that identity.
 */
let on = $state.raw<{ cards: CardOnScreen[]; views: ViewOnScreen[] }>({
  cards: [],
  views: [],
});

/**
 * Keeps `entry` in list `which` until the returned function takes it out.
 * Called from an effect, it reads nothing there, so the effect never comes
 * to depend on what it writes.
 */
const standing = <K extends keyof typeof on>(
  which: K,
  entry: (typeof on)[K][number]
): (() => void) => {
  untrack(() => {
    on = { ...on, [which]: [...on[which], entry] };
  });
  return () =>
    untrack(() => {
      on = {
        ...on,
        [which]: (on[which] as unknown[]).filter((one) => one !== entry),
      };
    });
};

/** A browser view stands on screen until the returned function is called (its unmount). */
export const viewOnScreen = (view: ViewOnScreen): (() => void) =>
  standing("views", view);

/** A browser ask's card stands on screen until the returned function is called (its unmount). */
export const cardOnScreen = (card: CardOnScreen): (() => void) =>
  standing("cards", card);

/**
 * Whether session `instanceId`'s panel shows the browser `ask` names: its
 * artifact, or its key (the match `BrowserPanel.ask` makes).
 */
export const askViewOnScreen = (
  instanceId: string,
  ask: { artifactId?: string | null; key?: BrowserKey | null }
): boolean =>
  on.views.some(
    (view) =>
      view.instanceId === instanceId &&
      (view.artifactId === ask.artifactId || view.key === ask.key)
  );

/** Whether the card of browser ask `requestId` stands on screen. */
export const askCardOnScreen = (requestId: string): boolean =>
  on.cards.some((card) => card.requestId === requestId);
