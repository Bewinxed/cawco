/**
 * What the host's chrome covers of the page, and the room it takes at the page's foot and top, told to the page.
 */
import { frameObserver } from "#lib/platform/frame-observer.js";
import { numberOf } from "#lib/platform/motion/curves.svelte.js";
import type { ChangeTour } from "./change-tour.svelte";
import type { PaneLayout } from "./pane-layout.svelte";
import type { PinComposer } from "./pin-composer.svelte";
import type { PinThread } from "./pin-thread.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";

export interface PageCoverDeps {
  readonly changeTour: ChangeTour;
  readonly inset: () => boolean;
  readonly paneLayout: PaneLayout;
  readonly pinComposer: PinComposer;
  readonly pinThread: PinThread;
  readonly previewFrame: PreviewFrame;
}
export class PageCover {
  readonly #deps: PageCoverDeps;

  /**
   * What the sheet covers told again as it comes to rest (ThreadSheet
   * `onmoved`): measured as it mounts it stood below the well, covering
   * nothing, so no pin was lifted clear of it.
   */
  sayCovered: (() => void) | null = null;
  constructor(deps: PageCoverDeps) {
    this.#deps = deps;
    /**
     * What the host's chrome covers of the page, told to its overlay
     * (`cawco:covered`, the page's viewport px): on a phone, the thread or the
     * composer standing at the well's foot; at every width, Changed since you
     * looked floating at the foot. A pin the pane opens is brought out from
     * under them (pins.ts `reveal`). Told again as any resizes, and as
     * nothing once none stands. The rail's foot sheet holding its list is a
     * layer over the page that never moves it, so no pin is brought out from
     * under it; holding a thread (`threadPushed`), it is told, so that
     * thread's pin is.
     */
    $effect(() => {
      const frame = this.#deps.previewFrame.iframe;
      const floating = this.#deps.paneLayout.floatSheet
        ? (this.#deps.pinThread.cardFloat ??
          this.#deps.pinComposer.composerFloat ??
          null)
        : null;
      const sheetCard = this.#deps.pinThread.threadPushed
        ? (this.#deps.pinThread.railSurface ?? null)
        : floating;
      if (!(frame && this.#deps.previewFrame.connected)) {
        return;
      }
      const covering = [sheetCard, this.#deps.changeTour.changesTag].filter(
        (el): el is HTMLElement => !!el
      );
      if (covering.length === 0) {
        this.#deps.previewFrame.post({ type: "cawco:covered", boxes: [] });
        return;
      }
      // Said in the next frame (frameObserver), whatever moved it.
      const sayNow = () => {
        const framed = frame.getBoundingClientRect();
        const left = framed.left + frame.clientLeft;
        const top = framed.top + frame.clientTop;
        this.#deps.previewFrame.post({
          type: "cawco:covered",
          boxes: covering.map((el) => {
            const r = el.getBoundingClientRect();
            return {
              x: r.left - left,
              y: r.top - top,
              w: r.width,
              h: r.height,
            };
          }),
        });
      };
      const sized = frameObserver(sayNow);
      for (const el of covering) {
        sized.observe(el);
      }
      sized.request();
      this.sayCovered = sayNow;
      return () => {
        this.sayCovered = null;
        sized.disconnect();
      };
    });
    /**
     * Room under the page's foot while Changed since you looked floats over it
     * (`cawco:foot-room`, px): from the tag's top to the frame's foot and a
     * gap, so the page scrolls that much further and its last line comes clear
     * of the tag, as iOS insets content under a floating bottom bar; none once
     * the tag goes.
     */
    $effect(() => {
      const frame = this.#deps.previewFrame.iframe;
      const tag = this.#deps.changeTour.changesTag;
      if (!(frame && this.#deps.previewFrame.connected)) {
        return;
      }
      if (!tag) {
        this.#deps.previewFrame.post({ type: "cawco:foot-room", px: 0 });
        return;
      }
      const gap = numberOf("--space-2");
      const sayNow = () => {
        const foot = frame.getBoundingClientRect().bottom - frame.clientTop;
        this.#deps.previewFrame.post({
          type: "cawco:foot-room",
          px: Math.max(
            0,
            Math.ceil(foot - tag.getBoundingClientRect().top + gap)
          ),
        });
      };
      const sized = frameObserver(sayNow);
      sized.observe(tag);
      sized.observe(frame);
      sized.request();
      return () => sized.disconnect();
    });
    /**
     * The head's room over the page's top as the head is laid out now
     * (`cawco:head-room`, px), said again as it changes size (a finger's
     * taller controls): a document CawCo draws pads its scroller by it.
     */
    $effect(() => {
      const head = this.#deps.paneLayout.section?.querySelector<HTMLElement>(
        '[data-slot="side-head"]'
      );
      if (!(
        this.#deps.previewFrame.iframe &&
        this.#deps.previewFrame.connected &&
        head &&
        !this.#deps.inset()
      )) {
        return;
      }
      const sized = frameObserver(() =>
        this.#deps.previewFrame.post({
          type: "cawco:head-room",
          px: head.offsetHeight,
        })
      );
      sized.observe(head);
      sized.request();
      return () => sized.disconnect();
    });
  }
}
