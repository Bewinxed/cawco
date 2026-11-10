/**
 * What stands over the page while its stage starts, compiles or fails: the cover's waiting, the down page's words, and the never-drawn time limit.
 */
import { detach } from "@cawco/core/detach";
import {
  STAGE_CLONE_MS,
  STAGE_READY_MS,
  type StageErrorKind,
} from "@cawco/core/stage";
import { previewWords } from "@cawco/core/words/preview";
import { sheetWords } from "@cawco/core/words/sheet";
import { removeArtifact } from "../artifact-api";
import { Asker, type AskHereRequest } from "../ask-here.svelte";
import type { CoverWaiting } from "./CoverState.svelte";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";

/** A compile error's place, `file:line:column` as far as the toolchain's Vite payload names it (Astro and Nuxt run Vite inside). */
export const errorPlace = (error: {
  column: number | null;
  file: string;
  line: number | null;
}) =>
  `${error.file}${error.line ? `:${error.line}` : ""}${error.column ? `:${error.column}` : ""}`;
/** The error card's title by its kind (core `StageError`): a missing states file is no compile error. */
export const errorTitle = (kind: StageErrorKind | undefined) => {
  switch (kind) {
    case "missing":
      return sheetWords.missingTitle;
    case "page":
      return sheetWords.pageTitle;
    case "compile":
    case undefined:
      return sheetWords.errorTitle;
  }
};
export interface StageCoverDeps {
  readonly instanceId: () => string;
  readonly paneDoc: PaneDoc;
  readonly paneId: () => string;
  readonly paneSubject: PaneSubject;
  readonly previewFrame: PreviewFrame;
}
export class StageCover {
  readonly #deps: StageCoverDeps;

  readonly downTitle = $derived.by(() => {
    switch (this.shownDown) {
      case "server":
        return "The page's server stopped answering";
      case "workspace":
        return "That workspace isn't running";
      case "reach":
        return `${this.#deps.paneSubject.ownerMachine} couldn't reach the page's server`;
      case "closed":
        return "This preview is closed";
      case "gone":
        return previewWords.goneTitle;
      case "error":
        return previewWords.errorTitle;
      case "crashed":
        return previewWords.crashedTitle;
      case "machine":
      case null:
        break;
    }
    return previewWords.machineNotAnswering(
      this.#deps.paneSubject.ownerMachine
    );
  });

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
   * answered is the stage serving. One that answered and then went silent is
   * the proxy's `down` and the doc's `docDown`, never a wait again.
   */
  readonly awaited = $derived.by(() =>
    this.#deps.previewFrame.connected ? null : this.staged
  );

  /**
   * The hub's last read couldn't reach the stage (the doc's `meta.unreached`,
   * which the agent's read says too): said as the proxy's own down is, with
   * its why and since when, once this pane's own load has had its say and
   * the page did not answer (`silentKey`, PAGE_SILENT_MS after it loaded).
   * While a load is on its way, an earlier read is no word on it: the cover
   * stands, and a page its stage answers through the hub's relay clears the
   * doc's word (hub artifacts `stageAnswered`).
   */
  readonly docDown = $derived.by(() =>
    this.staged &&
    !this.#deps.previewFrame.connected &&
    this.#deps.previewFrame.silentKey === this.#deps.previewFrame.frameKey &&
    this.#deps.paneDoc.view?.unreached
      ? this.#deps.paneDoc.view.unreached
      : null
  );

  readonly shownDown = $derived.by(
    () => this.#deps.previewFrame.down ?? this.docDown?.down ?? null
  );

  readonly shownWhy = $derived.by(() =>
    this.#deps.previewFrame.down
      ? this.#deps.previewFrame.downWhy
      : (this.docDown?.why ?? null)
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
    // A failure the proxy named says its own words (`down`).
    if (this.#deps.previewFrame.down) {
      return null;
    }
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

  /** What the stage last said of a page never drawn: its own message, else the first compile error's line. */
  readonly stageSaid = $derived(
    this.staged?.message ??
      this.compileErrors[0]?.message.split("\n")[0] ??
      null
  );

  /** The never-drawn canvas's Remove: destructive, so asked in place under it (AskHere, The Open Page Rule), as the inspector's Remove is. */
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
      }, budget);
      return () => {
        clearTimeout(timer);
        this.neverDrawn = false;
      };
    });
  }
}
