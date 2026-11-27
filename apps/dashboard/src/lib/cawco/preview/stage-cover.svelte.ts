/**
 * What stands over the page while its stage starts, compiles or fails: the cover's waiting and the never-drawn time limit.
 */
import { detach } from "@cawco/core/detach";
import {
  STAGE_CLONE_MS,
  STAGE_READY_MS,
  stageErrorReason,
} from "@cawco/core/stage";
import { sheetWords } from "@cawco/core/words/sheet";
import { removeArtifact } from "../artifact-api";
import { Asker, type AskHereRequest } from "../ask-here.svelte";
import type { CoverWaiting } from "./CoverState.svelte";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";
import type { PreviewReach } from "./preview-reach.svelte";
import { type WellState, wellState } from "./well-state";

export interface StageCoverDeps {
  readonly instanceId: () => string;
  readonly paneDoc: PaneDoc;
  readonly paneId: () => string;
  readonly paneSubject: PaneSubject;
  readonly previewFrame: PreviewFrame;
  readonly previewReach: PreviewReach;
}
export class StageCover {
  readonly #deps: StageCoverDeps;

  /**
   * An unrecorded port preview's server stopped (pane-subject.svelte.ts
   * `unrecorded`): its machine said nothing answers its port, or the frame
   * got no page at all. Nothing can start it, so its cover says so and asks
   * its session to make it again, in place of the down page's Try again or
   * the frame's "didn't load".
   */
  readonly unrecordedDown = $derived.by(
    () =>
      this.#deps.paneSubject.unrecorded &&
      (this.#deps.previewFrame.down === "server" ||
        this.#deps.previewFrame.notLoaded)
  );

  readonly staged = $derived.by(() =>
    this.#deps.paneSubject.artifact?.kind === "component" ||
    this.#deps.paneSubject.served
      ? (this.#deps.paneDoc.view?.stage ?? null)
      : null
  );

  /**
   * The stage the cover waits on: none once this load's page answered
   * (`connected`, its overlay's `cawco:ready`), whatever the doc last said of
   * the stage. The doc's word is the agent's last frame, which can trail the
   * stage (a frame missed, a version opened over another's); a page that
   * answered is the stage serving. Nor once the frame settled without it: the
   * proxy's page or the hub named a hop that is `down`, or the frame loaded
   * and its page never said a word (`notLoaded`); the pane says that at once,
   * and the never-drawn time stops. Nor while the hub opened no origin, or
   * this tab can't reach the page's origin: no frame stands, and the pane
   * says that cause in the frame's place; the stage's time starts again once
   * a frame is made.
   */
  readonly awaited = $derived.by(() =>
    this.#deps.previewFrame.connected ||
    this.#deps.previewFrame.down !== null ||
    this.#deps.previewFrame.notLoaded ||
    this.#deps.previewReach.unopened ||
    this.#deps.previewReach.unreached
      ? null
      : this.staged
  );

  /** A down stage's own words stand unfolded (Show details). */
  stageDetails = $state(false);

  readonly stageDetailsId: string;

  /**
   * What the cover says while the page is on its way; null when nothing is,
   * or once it has stood past its time ({@link neverDrawn}). A sheet's stage
   * starting names its folder, which CoverState holds on one row.
   */
  readonly stageWaiting = $derived.by((): CoverWaiting | null => {
    if (this.neverDrawn) {
      return null;
    }
    switch (this.awaited?.status) {
      case "starting":
        return this.#deps.paneSubject.served
          ? { line: sheetWords.serverStarting }
          : { dir: this.awaited.dir };
      case "waking":
      case "asleep":
        return { line: sheetWords.waking };
      case "live":
        return this.compiling ? { line: sheetWords.compiling } : null;
      case "error":
      case undefined:
        break;
    }
    return null;
  });

  readonly compileErrors = $derived(
    this.staged?.status === "live" ? this.staged.errors : []
  );

  /** A sheet's page still compiling: its stage serves, the page hasn't said it is ready, and no compile error has ended the compile. */
  readonly compiling = $derived.by(
    () =>
      this.awaited?.status === "live" &&
      !this.#deps.paneSubject.served &&
      this.compileErrors.length === 0
  );

  /**
   * How long the cover may stand: the time the daemon gives a stage to serve
   * once started (core `STAGE_READY_MS`), and a place's stage its clone and
   * install first (`STAGE_CLONE_MS`), counted on this pane's clock from when
   * it began waiting; none once the page answered ({@link awaited}). A page
   * still on its way past it was never drawn: the stage's word stopped
   * coming, or the page never compiled, and the pane says so with the ways
   * out, never an endless cover.
   */
  readonly waitingFor = $derived.by(() => {
    switch (this.awaited?.status) {
      case "starting":
        return STAGE_CLONE_MS + STAGE_READY_MS;
      case "waking":
      case "asleep":
        return STAGE_READY_MS;
      case "live":
        return this.compiling ? STAGE_READY_MS : null;
      case "error":
      case undefined:
        return null;
    }
  });

  neverDrawn = $state(false);

  /** What occupies the well, one state at a time (well-state.ts): PreviewPane draws from it alone. */
  readonly well = $derived.by((): WellState =>
    wellState({
      framed: !(
        this.#deps.paneSubject.isCanvas || this.#deps.paneSubject.isBrowser
      ),
      unrecordedDown: this.unrecordedDown,
      hubHeld: this.#deps.previewFrame.hubHeld,
      down: this.#deps.previewFrame.down,
      staged: this.staged,
      neverDrawn: this.neverDrawn,
      unopened: this.#deps.previewReach.unopened,
      unreached: this.#deps.previewReach.unreached,
      notLoaded: this.#deps.previewFrame.notLoaded,
      waiting: this.stageWaiting,
      drawn:
        this.#deps.previewFrame.loaded ||
        this.#deps.previewFrame.standing !== null,
    })
  );

  /** What the stage last said of a page never drawn: its own message, else the first compile error's reason. */
  readonly stageSaid = $derived(
    this.staged?.message ??
      (this.compileErrors[0]
        ? stageErrorReason(this.compileErrors[0].message)
        : null)
  );

  /** The never-drawn canvas's Remove: destructive, so asked in place under it (AskHere, The Open Page Rule). */
  readonly removeAsks = new Asker<AskHereRequest>();

  removeShown = () => {
    const shown = this.#deps.paneSubject.artifact;
    if (!shown) {
      return;
    }
    detach(
      this.removeAsks.ask({
        at: "never-drawn-remove",
        title: sheetWords.removeTitle(shown.title),
        body: sheetWords.removeBody,
        confirmLabel: sheetWords.removeConfirm,
        pendingLabel: sheetWords.removing,
        destructive: true,
        run: () => removeArtifact(this.#deps.instanceId(), shown.id),
      }),
      "ask"
    );
  };
  constructor(deps: StageCoverDeps) {
    this.#deps = deps;
    this.stageDetailsId = `${this.#deps.paneId()}-stage-details`;
    // The cover is opaque while it waits: a frame standing in for the next
    // one bridges no paint under it, so it goes, and only the frame the
    // cover waits on stays mounted.
    $effect.pre(() => {
      if (this.stageWaiting && this.#deps.previewFrame.standing !== null) {
        this.#deps.previewFrame.standing = null;
      }
    });
    $effect(() => {
      const budget = this.waitingFor;
      // Read so that a Try again (`reload`) or another artifact starts the wait over.
      if (
        budget === null ||
        this.#deps.previewFrame.reload < 0 ||
        this.#deps.paneSubject.artifactId === undefined
      ) {
        this.neverDrawn = false;
        return;
      }
      const timer = setTimeout(() => {
        this.neverDrawn = true;
        // A Try again still pending has its outcome: the page never drew.
        this.#deps.previewFrame.retrying = false;
      }, budget);
      return () => {
        clearTimeout(timer);
        this.neverDrawn = false;
      };
    });
  }
}
