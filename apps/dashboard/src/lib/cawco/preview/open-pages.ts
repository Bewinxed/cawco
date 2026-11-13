/**
 * The frames in this tab that hold a page live now (the panel's
 * PreviewPane, the Decisions tab's PageFrame), by artifact, so a Send the
 * dashboard makes (the panel head's, a Needs you row's, I'm done picking)
 * carries what the person sees picked there: each open frame's page hands
 * over what its doc holds that the hub isn't known to (overlay artifact.ts
 * `writes`, core `SendBody.writes`), and the hub applies it before it reads
 * the picks. With no frame open, the hub's doc is all there is to send.
 */
import { base64ToBytes, bytesToBase64 } from "@cawco/core/base64";
import { readWithin } from "@cawco/core/bounded";
import { commentWords } from "@cawco/core/words/comments";
import { mergeUpdates } from "yjs";

/** One open frame's hand: its page's writes, base64; null when its page joined no doc. It lets go once `signal` aborts. */
type Hand = (signal: AbortSignal) => Promise<string | null>;

const open = new Map<string, Set<Hand>>();

/** How long a frame's page has to hand its writes over, ms. Our call: the page answers from its worker in a few ms. */
const HAND_WITHIN_MS = 5000;

/** Frame `hand` holds page `artifactId` live until the call it answers is made. */
export function holdOpen(artifactId: string, hand: Hand): () => void {
  let hands = open.get(artifactId);
  if (!hands) {
    hands = new Set();
    open.set(artifactId, hands);
  }
  hands.add(hand);
  return () => {
    hands.delete(hand);
    if (hands.size === 0 && open.get(artifactId) === hands) {
      open.delete(artifactId);
    }
  };
}

/**
 * What every frame open on page `artifactId` in this tab holds that the
 * hub isn't known to, merged into one base64 update; undefined when none
 * is open (or none joined its doc), and the hub's doc is the truth. A
 * frame that doesn't answer in time fails the Send, saying so, rather than
 * sending without what it shows.
 */
export async function openPageWrites(
  artifactId: string
): Promise<string | undefined> {
  const hands = [...(open.get(artifactId) ?? [])];
  if (hands.length === 0) {
    return undefined;
  }
  const handed = await Promise.all(
    hands.map(async (hand) => {
      const read = await readWithin(HAND_WITHIN_MS, hand);
      if (read.kind === "unanswered") {
        throw new Error(commentWords.sendPageSilent(HAND_WITHIN_MS / 1000));
      }
      return read.value;
    })
  );
  const updates = handed.flatMap((one) => {
    const bytes = one ? base64ToBytes(one) : null;
    return bytes ? [bytes] : [];
  });
  if (updates.length === 0) {
    return undefined;
  }
  return bytesToBase64(
    updates.length === 1 ? updates[0] : mergeUpdates(updates)
  );
}

/** A frame's last ask of its page for its writes. */
let lastAsk = 0;

/**
 * The hand of the frame `frame()` shows, its page on `origin()`: asks the
 * page (`cawco:writes`) and takes its answer, from that frame and origin
 * alone. Null from a frame not loaded.
 */
export function frameHand(
  frame: () => HTMLIFrameElement | null | undefined,
  origin: () => string | null
): Hand {
  return (signal) => {
    const target = frame()?.contentWindow;
    const at = origin();
    if (!(target && at)) {
      return Promise.resolve(null);
    }
    lastAsk += 1;
    const id = lastAsk;
    return new Promise((resolve) => {
      const heard = (event: MessageEvent) => {
        const told: {
          id?: unknown;
          type?: unknown;
          writes?: unknown;
        } | null = event.data;
        if (
          event.source !== target ||
          event.origin !== at ||
          told?.type !== "cawco:writes" ||
          told.id !== id
        ) {
          return;
        }
        window.removeEventListener("message", heard);
        resolve(typeof told.writes === "string" ? told.writes : null);
      };
      window.addEventListener("message", heard);
      signal.addEventListener(
        "abort",
        () => window.removeEventListener("message", heard),
        { once: true }
      );
      target.postMessage({ type: "cawco:writes", id }, at);
    });
  };
}
