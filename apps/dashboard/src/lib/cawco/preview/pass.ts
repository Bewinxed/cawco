/**
 * Host mode's way in, from the dashboard (hub preview-access.ts). Every
 * frame loads its preview's own address; the browser's one pass (core
 * `PREVIEW_PASS_COOKIE`, set on the domain every name stands under) lets it
 * through, the frames inside it too. Only a frame turned away
 * (`cawco:locked`) enters: one ticket, spent at `/__cawco/enter` on its
 * origin beside the frames, never in one, then the frame loads again. One
 * entry stands in flight per domain, so frames turned away together spend
 * one ticket, and an entry that landed after a frame last stood without
 * a pass (its load, or its page's word that it was let in) stands for that
 * frame too.
 */
import {
  hostModeDomain,
  type PreviewTicket,
  previewEnterUrl,
} from "@cawco/core/frames";
import { hubRefusal } from "#lib/cawco/hub-read.js";

interface Entry {
  done: Promise<string | null>;
  /** When it landed (`performance.now()`); unset while in flight. */
  landed?: number;
  /** Why it opened nothing; null once the pass is set. */
  refused?: string | null;
}

/** The newest entry by domain. */
const entries = new Map<string, Entry>();

/** A ticket from the hub, spent on `origin`: null once spent, else why not. */
async function enter(origin: string): Promise<string | null> {
  const answer = await fetch("/api/preview-ticket", { method: "POST" }).catch(
    () => null
  );
  if (!answer?.ok) {
    return answer
      ? (await hubRefusal(answer)).message
      : "The hub didn't give this browser a pass to its previews.";
  }
  const { ticket } = (await answer.json()) as PreviewTicket;
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
 * Enters the previews under `origin`'s domain for a frame turned away that
 * last stood without a pass at `since` (`performance.now()`): null once it
 * may load again, else the hub's words for why it can't.
 */
export function enterPreviews(
  origin: string,
  since: number
): Promise<string | null> {
  const domain = hostModeDomain(origin);
  const held = entries.get(domain);
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
  entries.set(domain, entry);
  return entry.done;
}
