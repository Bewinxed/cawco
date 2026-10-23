/**
 * The canvas's own Yjs doc: a replica of the artifact's doc, which the
 * overlay keeps in its worker and never brings into the page's realm
 * (preview-overlay artifact.ts). This page's bundle carries its one copy of
 * Yjs; the doc's whole state and every change come from the overlay as
 * updates (`window.cawcoArtifact.replicate`), and each change Excalidraw's
 * binding makes here goes back the same way (`send`), so the doc it binds
 * is the doc the overlay syncs with the hub.
 *
 * The page the hub serves carries the doc in the overlay's tag
 * (`data-state`), so the replica opens on it before the first look
 * (host.tsx `firstLook`), as the overlay's own doc did; the overlay's
 * whole state, merged in after, adds what came since.
 */
import { applyUpdate, Doc } from "yjs";
import type { ArtifactGlobal, ArtifactHold } from "../preview-overlay/artifact";

/** The doc as the canvas binds it: the overlay's hold, with this page's replica of the doc. */
export interface CanvasHold extends ArtifactHold {
  doc: Doc;
}

/** The origin of what the overlay hands the replica: never sent back. */
const OVERLAY = Symbol("overlay");

const shared = (window as unknown as { cawcoArtifact: ArtifactGlobal })
  .cawcoArtifact;

let doc = new Doc();
let generation = 0;
let last: ArtifactHold | null = null;
const holders = new Set<(hold: CanvasHold) => void>();

/** Each change made here to doc `at`, to the overlay. */
const sendOf = (at: number) => (update: Uint8Array, origin: unknown) => {
  if (origin !== OVERLAY) {
    shared.send(at, update);
  }
};
doc.on("update", sendOf(generation));

// The hub's copy embedded in the overlay's tag: the replica opens on it.
const embedded = document.querySelector<HTMLScriptElement>(
  "script[data-artifact][data-state]"
)?.dataset.state;
if (embedded) {
  try {
    applyUpdate(
      doc,
      Uint8Array.from(atob(embedded), (char) => char.charCodeAt(0)),
      OVERLAY
    );
  } catch {
    // Not a Yjs update: the overlay's whole state brings the doc instead.
  }
}

const hand = () => {
  if (!last) {
    return;
  }
  const now: CanvasHold = { ...last, generation, doc };
  for (const holder of holders) {
    holder(now);
  }
};

/** The replica for doc `at`: a fresh one once the overlay's doc is replaced. */
const docFor = (at: number): boolean => {
  if (at <= generation) {
    return false;
  }
  doc.destroy();
  doc = new Doc();
  generation = at;
  doc.on("update", sendOf(at));
  return true;
};

shared.replicate((at, update) => {
  if (at < generation) {
    return;
  }
  const fresh = docFor(at);
  applyUpdate(doc, update, OVERLAY);
  if (fresh) {
    hand();
  }
});
shared.subscribe((hold) => {
  last = hold;
  docFor(hold.generation);
  hand();
});

// What a probe reads the canvas's doc from: this page's replica now.
Object.defineProperty(window, "cawcoCanvasDoc", { get: () => doc });

/** Calls back with the canvas's hold now and on every change of it: the overlay's link, or a new replica. */
export function subscribeHold(holder: (hold: CanvasHold) => void): void {
  holders.add(holder);
  hand();
}
