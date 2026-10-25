/**
 * The live card's module (comment-card.vite.ts builds it to
 * live-card/card.js and live-card/card.css): the dashboard's own stylesheet,
 * and `mountCard`, which mounts LiveCard into the preview's pin room and
 * hands back what moves it.
 */
import "../../../apps/dashboard/src/app.css";
import { mount, unmount } from "svelte";
import LiveCard from "./LiveCard.svelte";

/**
 * The live card in `target` (the preview's pin room: a size container, its
 * box the well's), first standing as `initial` says: `{ open, mark, box,
 * room, sheet, pin, onclose }`, the pill's and its element's boxes in the
 * well's px, as the overlay tells the pane.
 */
export function mountCard(target, initial) {
  const view = $state({ ...initial });
  const app = mount(LiveCard, { target, props: { view } });
  return {
    /** Where it stands now, or whether it is open: merged into what it was told. */
    set(next) {
      Object.assign(view, next);
    },
    /** Its element (the card, the composer or the foot sheet), once it stands. */
    get float() {
      return view.float ?? null;
    },
    unmount() {
      unmount(app);
    },
  };
}
