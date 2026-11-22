/**
 * How every frame that shows a preview origin hears that nothing serves its
 * page: the proxy's own page in it posts `cawco:down` to its parent (preview
 * proxy `downResponse`), naming the hop that didn't answer and the machine's
 * words for it. The frame draws that as its down state (FrameDown.svelte).
 *
 * Heard by its source alone, the frame's own window: the down page may be
 * served from another origin than the one the frame was pointed at (the
 * hub's answer for an origin it no longer holds, a port reassigned while the
 * frame stood), and nothing in the message is the page's own, so a frame
 * that also checked its origin let the bare page stand.
 */

import { pageSaid } from "@cawco/core/page-wire";
import type { PreviewDown } from "@cawco/core/preview/protocol";

/** A hop that didn't answer, and the machine's words for it. */
export interface Down {
  down: PreviewDown;
  why: string | null;
}

/** What `frame`'s page said in `event` of a hop that didn't answer; null for any other message, or one from another window. */
export function downIn(
  event: MessageEvent,
  frame: HTMLIFrameElement | null | undefined
): Down | null {
  if (!frame?.contentWindow || event.source !== frame.contentWindow) {
    return null;
  }
  const said = pageSaid(event.data);
  return said?.type === "cawco:down"
    ? { down: said.down, why: said.why }
    : null;
}

/** Hears each `cawco:down` of the frame `frame` returns, for as long as the returned stop isn't called (an `$effect`'s teardown). */
export function hearDown(
  frame: () => HTMLIFrameElement | null | undefined,
  heard: (down: Down) => void
): () => void {
  const listen = (event: MessageEvent) => {
    const down = downIn(event, frame());
    if (down) {
      heard(down);
    }
  };
  addEventListener("message", listen);
  return () => removeEventListener("message", listen);
}
