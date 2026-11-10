/**
 * The pane's mode, whether the Comments rail is open and in what order, whether pins are shown, and where a moved pin is placed again; each kept per session.
 */
import { type PreviewMode, previewMode } from "@cawco/core/comments/model";
import type { FrameSays } from "@cawco/core/page-wire";
import { untrack } from "svelte";
import { store, stored } from "#lib/platform/storage.js";
import { NOT_REACHING } from "./artifact-doc";
import type { RailSort } from "./comment-rows";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PinComposer } from "./pin-composer.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";

export interface PaneModeDeps {
  readonly instanceId: () => string;
  readonly openPin: () => string | null;
  readonly paneDoc: PaneDoc;
  readonly pinComposer: PinComposer;
  readonly previewFrame: PreviewFrame;
}
export class PaneMode {
  readonly #deps: PaneModeDeps;

  /**
   * The pane's mode, its head's segmented control, kept per session (core
   * `PreviewMode`): Interact (V), the page gets every press and its pins
   * stay pressable; Comment (C), a tap pins a comment to what it lands on;
   * Draw (D), any pointer inks. Esc goes back to Interact. A pen inks in
   * every mode.
   */
  mode = $state<PreviewMode>("interact");

  readonly modeKey = $derived.by(
    () => `cawco-preview-mode:${this.#deps.instanceId()}`
  );

  /**
   * The Comments rail beside the page, from the head's Comments, its pressed
   * toggle; shut until opened, then kept per session as the mode is, with
   * its order. It closes only by its Close or by Comments.
   */
  listOpen = $state(false);

  railSort = $state<RailSort>("newest");

  readonly listKey = $derived.by(
    () => `cawco-preview-comments:${this.#deps.instanceId()}`
  );

  readonly sortKey = $derived.by(
    () => `cawco-preview-comments-sort:${this.#deps.instanceId()}`
  );

  /** ⇧C: every pin on the page hidden, or shown (Figma's own key). */
  pinsShown = $state(true);

  /** The Comments control's title: why the comments aren't reaching the agent, else what ⇧C does. */
  readonly commentsTitle = $derived.by(() => {
    if (this.#deps.paneDoc.linkDown) {
      return `${NOT_REACHING}. Open them to try again.`;
    }
    return this.pinsShown
      ? "Comments (⇧C hides the pins)"
      : "Comments (⇧C shows the pins)";
  });

  /** The pane's mode, kept for the session and told to the page; `place` is the moved pin the next tap in Comment places again. */
  setMode = (next: PreviewMode, place: string | null = null) => {
    // A mode switch leaves nothing of a comment being written.
    if (next !== this.mode) {
      this.#deps.pinComposer.cancelComposer();
    }
    this.mode = next;
    this.placing = next === "comment" ? place : null;
    store("local", this.modeKey, next);
    this.#deps.previewFrame.post({
      type: "cawco:mode",
      mode: next,
      place: this.placing,
    } satisfies FrameSays);
  };

  /** The moved pin a tap places again, and the mode the pane goes back to once it is placed. */
  placing = $state<string | null>(null);

  placingFrom: PreviewMode | null = null;

  /**
   * The open thread's Pin it somewhere else: Comment mode, its thread still
   * open, until the next tap on the page pins the gone pin anew; Cancel
   * (or the thread closing) puts the mode back as it was.
   */
  placeElsewhere = (on: boolean) => {
    if (on && this.#deps.openPin()) {
      this.placingFrom = this.mode;
      this.setMode("comment", this.#deps.openPin());
      return;
    }
    if (this.placingFrom && this.placingFrom !== "comment") {
      this.setMode(this.placingFrom);
    } else {
      this.setMode(this.mode);
    }
    this.placingFrom = null;
  };
  constructor(deps: PaneModeDeps) {
    this.#deps = deps;
    $effect.pre(() => {
      const keys = {
        mode: this.modeKey,
        list: this.listKey,
        sort: this.sortKey,
      };
      untrack(() => {
        this.mode = previewMode(stored("local", keys.mode)) ?? "interact";
        this.listOpen = stored("local", keys.list) === "open";
        this.railSort = stored("local", keys.sort) === "top" ? "top" : "newest";
      });
    });
    $effect(() => {
      store("local", this.sortKey, this.railSort);
    });
  }

  showList(open: boolean) {
    this.listOpen = open;
    store("local", this.listKey, open ? "open" : "shut");
  }

  /** ⇧C: every pin shown on the page, or hidden. */
  showPins(visible: boolean) {
    this.pinsShown = visible;
    this.#deps.previewFrame.post({ type: "cawco:pins-shown", shown: visible });
  }

  /** The page pinned a pin (`cawco:pin-open`) while one was being placed again: the mode goes back to how it was before. */
  placedAgain(id: string) {
    if (id === this.placing || this.placing) {
      // Placed again: the mode goes back to how it was before.
      if (this.placingFrom && this.placingFrom !== "comment") {
        this.setMode(this.placingFrom);
      } else {
        this.placing = null;
      }
      this.placingFrom = null;
    }
  }
}
