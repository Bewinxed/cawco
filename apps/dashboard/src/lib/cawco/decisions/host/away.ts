/**
 * A decision page's pane put away or brought back, as the dashboard says
 * it (core `CANVAS_AWAY`, from motion/rest.ts `holdSkipped`), passed on to
 * every Preview's canvas, one that loads while the pane is away too: the
 * canvas holds its stories' animation-frame callbacks while away (agent
 * canvas runtime).
 */
import { awaySaid, CANVAS_AWAY } from "@cawco/core/stage";

export function relayAway(): void {
  let away = false;
  const tell = (frame: HTMLIFrameElement) =>
    frame.contentWindow?.postMessage({ type: CANVAS_AWAY, away }, "*");
  addEventListener("message", (event) => {
    const said =
      event.source === window.parent ? awaySaid(event.data) : undefined;
    if (said === undefined) {
      return;
    }
    away = said;
    for (const frame of document.querySelectorAll("iframe")) {
      tell(frame);
    }
  });
  // `load` reaches no ancestor of a frame but in its capture phase.
  document.addEventListener(
    "load",
    (event) => {
      if (away && event.target instanceof HTMLIFrameElement) {
        tell(event.target);
      }
    },
    true
  );
}
