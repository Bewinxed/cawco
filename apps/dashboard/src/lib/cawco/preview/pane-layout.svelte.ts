/**
 * Where the pane stands: its card and well, their widths as laid out, the media queries, and where the Comments rail and the inspector stand because of them.
 */
import { MediaQuery } from "svelte/reactivity";
import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
import { frameObserver } from "#lib/platform/frame-observer.js";
import { floor as visibleFloor } from "#lib/platform/visible-viewport.svelte.js";
import { inspectorBesideLine } from "../graph/beside";

/** A pane this wide or wider holds the rail beside its page (the artifact panel's surface brief, The Comments rail: "a pane under 640px" takes it as the foot sheet). */
const RAIL_BESIDE_FROM = 640;
export interface PaneLayoutDeps {
  readonly sheet: () => boolean;
}
export class PaneLayout {
  readonly #deps: PaneLayoutDeps;

  well = $state<HTMLDivElement>();

  /** A phone's screen (DESIGN.md's phone line). */
  readonly phone = new MediaQuery(PHONE_QUERY);

  /**
   * The inspector: a right panel beside the page where the well holds the
   * stage at its least and the inspector (graph/beside.ts), picked from the
   * pane's own width, never the window's alone; else a sheet over the
   * page's foot (the spec's §5), as on a phone, in the pane's sheet over the
   * conversation, or in a narrow pane on a desk.
   */
  readonly inspectorLayout = $derived.by((): "panel" | "sheet" => {
    if (this.#deps.sheet() || this.phone.current) {
      return "sheet";
    }
    return this.wellW > 0 && this.wellW < inspectorBesideLine()
      ? "sheet"
      : "panel";
  });

  /** The well's width, px: where the design graph's room stands beside its stage (graph/beside.ts). */
  wellW = $state(0);

  /** The pane's own width, px: the rail's room is the pane's, not the window's. */
  paneW = $state(0);

  /** The rail is the well's foot sheet: on a phone, and in a pane under 640px. */
  readonly railSheet = $derived.by(
    () =>
      this.#deps.sheet() ||
      this.phone.current ||
      (this.paneW > 0 && this.paneW < RAIL_BESIDE_FROM)
  );

  /**
   * Where the rail stands is known: on a phone or in the drawer at once,
   * else once the pane's width is read. Until then neither rail is drawn,
   * so a narrow pane never draws the rail beside its page for a frame and
   * trades it for the foot sheet.
   */
  readonly railPlaced = $derived.by(
    () => this.#deps.sheet() || this.phone.current || this.paneW > 0
  );

  /** A composer and a thread are the well's foot sheet: on a phone, and under a finger (comment design §3). */
  readonly coarse = new MediaQuery("(pointer: coarse)");

  readonly floatSheet = $derived.by(
    () => this.#deps.sheet() || this.phone.current || this.coarse.current
  );

  /**
   * Closing goes back where it came from: the preview opened out of its tool
   * row's box (`preview:<session>`), so as it closes, a stand-in the size of
   * the pane shrinks into that row and fades (closeInto, --ease-drawer) while
   * the pane itself leaves. A row scrolled away or not mounted has nothing
   * to land in, and the pane simply leaves. In the phone's sheet the sheet
   * sliding down is its one exit (SideSheet), so nothing flies.
   */
  section = $state<HTMLElement>();
  constructor(deps: PaneLayoutDeps) {
    this.#deps = deps;
    $effect(() => {
      const node = this.well;
      if (!node) {
        return;
      }
      const read = () => {
        this.wellW = node.clientWidth;
      };
      read();
      const watch = frameObserver(read);
      watch.observe(node);
      return () => watch.disconnect();
    });
    $effect(() => {
      const pane = this.section;
      if (!pane) {
        return;
      }
      const read = () => {
        this.paneW = pane.clientWidth;
      };
      read();
      const watch = frameObserver(read);
      watch.observe(pane);
      return () => watch.disconnect();
    });
    /**
     * How much of the well's foot a software keyboard covers, px: what stands
     * at the foot over the page (the Comments sheet, a thread's or the
     * composer's foot sheet, the inspector's sheet) is lifted by it, so the
     * field being typed in stands over the keyboard while the page under them
     * keeps its box (a phone's preview sheet holds its place for a field of
     * its own: SideSheet). Written on the well as `--keyboard-lift`; 0 with
     * no keyboard (visible-viewport's `data-keyboard`), and under a pinch
     * zoom (`floor.bottom` 0). Read as the visible area is published and as
     * the well resizes, in the frame after. With no keyboard up it is 0
     * wherever the well stands: read while a phone's sheet stood at its
     * first stop, the well's foot below the screen, it lifted the inspector
     * 168px off the foot once the sheet stood at full, the sheet's move
     * resizing nothing.
     */
    $effect(() => {
      const node = this.well;
      const { bottom } = visibleFloor;
      if (!node) {
        return;
      }
      const read = () => {
        const covered =
          bottom > 0 && document.documentElement.hasAttribute("data-keyboard")
            ? Math.max(
                0,
                Math.round(node.getBoundingClientRect().bottom - bottom)
              )
            : 0;
        node.style.setProperty("--keyboard-lift", `${covered}px`);
      };
      read();
      const watch = frameObserver(read);
      watch.observe(node);
      return () => {
        watch.disconnect();
        node.style.removeProperty("--keyboard-lift");
      };
    });
  }

  /** The floating head's room over the well's top, px: its own height as laid out; none without a head. */
  headRoomPx(): number {
    return (
      this.section?.querySelector<HTMLElement>('[data-slot="side-head"]')
        ?.offsetHeight ?? 0
    );
  }
}
