/**
 * What the page says to the pane: each message the overlay posts from the
 * page's own origin (wire.ts), answered by the engine that owns what it
 * changes.
 */

import {
  PAGE_TOUCHED_MESSAGE,
  PREVIEW_LOCKED_MESSAGE,
} from "@cawco/core/preview/routes";
import {
  STAGE_DIALS_WRITTEN,
  STAGE_DIFFERENCES,
  STAGE_FAULT,
  STAGE_LAID,
  STAGE_REACHED,
  STAGE_SCROLLED,
  STAGE_TIME,
  stageDialsWrittenOf,
  stageDifferencesOf,
  stageFaultOf,
  stageLaidOf,
  stageReachedOf,
  stageScrolledOf,
  stageTimeOf,
} from "@cawco/core/stage-graph";
import { sheetWords } from "@cawco/core/words/sheet";
import { lastInput } from "#lib/components/ui/fluid-tabs/last-input.js";
import { heardInput } from "../reload.svelte";
import { runShellShortcut } from "../shell-shortcut";
import type { ChangeTour } from "./change-tour.svelte";
import type { CommentKit } from "./comment-kit.svelte";
import { FrameLinks } from "./frame-links.svelte";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneKeys } from "./pane-keys.svelte";
import type { PaneMode } from "./pane-mode.svelte";
import type { PaneNotice } from "./pane-notice.svelte";
import type { PaneSheet } from "./pane-sheet.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import type { PinComposer } from "./pin-composer.svelte";
import type { PinPeek } from "./pin-peek.svelte";
import type { PinThread } from "./pin-thread.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";
import type { PreviewReach } from "./preview-reach.svelte";
import {
  type PageMessage,
  pageMessage,
  previewCompose,
  previewPickPlace,
  previewPinId,
  previewSheet,
  previewShortcut,
  previewTitle,
  previewUrl,
  SHORTCUT_MESSAGE,
} from "./wire";

/** The page's words on the comment being written ({@link PageWire.heardComposer}). */
export type ComposerMessage = PageMessage & {
  type: "cawco:compose" | "cawco:compose-at" | "cawco:comment-result";
};
const COMPOSER_MESSAGES: readonly string[] = [
  "cawco:compose",
  "cawco:compose-at",
  "cawco:comment-result",
] satisfies ComposerMessage["type"][];
export const isComposerMessage = (
  message: PageMessage
): message is ComposerMessage => COMPOSER_MESSAGES.includes(message.type);
export interface PageWireDeps {
  readonly changeTour: ChangeTour;
  readonly commentKit: CommentKit;
  readonly instanceId: () => string;
  readonly onScreen: () => boolean;
  readonly paneDoc: PaneDoc;
  readonly paneKeys: PaneKeys;
  readonly paneMode: PaneMode;
  readonly paneNotice: PaneNotice;
  readonly paneSheet: PaneSheet;
  readonly paneSubject: PaneSubject;
  readonly pinComposer: PinComposer;
  readonly pinPeek: PinPeek;
  readonly pinThread: PinThread;
  readonly previewFrame: PreviewFrame;
  readonly previewReach: PreviewReach;
}

export class PageWire {
  readonly #deps: PageWireDeps;

  /** The page's links, as its program names them (a page's only; none for one with no program): their faces said, and an ask to open one answered. */
  readonly links: FrameLinks;

  constructor(deps: PageWireDeps) {
    this.#deps = deps;
    this.links = new FrameLinks(deps.previewFrame.post, deps.instanceId, () => {
      const { artifact } = deps.paneSubject;
      return artifact?.kind === "page" ? artifact.id : null;
    });
  }

  /**
   * The page's word on the comment being written: a press (or a radial's
   * Comment on ink) opened its composer, where its pill stands, and its
   * answer to Comment. The pane's page says it through `receive`, a
   * canvas's through its stage (CanvasStages, `SlotActions.composer`).
   */
  heardComposer = (message: ComposerMessage) => {
    const { commentKit, pinComposer, pinPeek, pinThread } = this.#deps;
    switch (message.type) {
      case "cawco:compose": {
        // A press on the page (or a radial's Comment) opened a comment's composer: nothing is written yet.
        const said = previewCompose(message);
        if (!said) {
          return;
        }
        if (pinThread.openPin) {
          pinThread.closeCard();
        }
        commentKit.loadKit();
        pinPeek.dropPeek();
        // The press was the page's, which the host never hears: the page's last input is it.
        lastInput.current = message.via === "key" ? "key" : "pointer";
        pinComposer.opened(said, message);
        break;
      }
      case "cawco:compose-at":
        pinComposer.heardAt(message);
        break;
      case "cawco:comment-result":
        pinComposer.heardComment(message);
        break;
    }
  };

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one validated dispatch for the overlay's wire protocol.
  receive = (event: MessageEvent) => {
    const {
      changeTour,
      paneDoc,
      paneKeys,
      paneMode,
      paneNotice,
      paneSheet,
      paneSubject,
      pinComposer,
      pinPeek,
      pinThread,
      previewFrame,
      previewReach,
    } = this.#deps;
    // The page's own frame, from its own origin: nothing else is heard.
    if (
      !previewReach.paneOrigin ||
      event.source !== previewFrame.iframe?.contentWindow ||
      event.origin !== previewReach.paneOrigin
    ) {
      return;
    }
    previewFrame.heard();
    if (event.data?.type === PAGE_TOUCHED_MESSAGE) {
      heardInput();
      return;
    }
    if (event.data?.type === "cawco:down") {
      previewFrame.heardDown(event.data);
      return;
    }
    if (event.data?.type === PREVIEW_LOCKED_MESSAGE) {
      previewFrame.turnedAway();
      return;
    }
    // A reference in a decision page's words, its Canvas's Open to draw,
    // its Preview's Open full: opened only when the page links to it.
    if (this.links.heard(event.data)) {
      return;
    }
    const ask = previewPickPlace(event.data);
    if (ask !== null) {
      previewFrame.askedPick(ask);
      return;
    }
    const message = pageMessage(event.data);
    if (!message) {
      return;
    }
    switch (message.type) {
      case "cawco:ready":
      case "cawco:navigated": {
        const at = previewUrl(message.url, previewReach.paneOrigin);
        if (!at) {
          return;
        }
        previewFrame.answered();
        const parsed = new URL(at);
        previewReach.keepAt(parsed);
        if (paneSubject.preview) {
          paneSubject.preview.title = previewTitle(message.title) ?? "";
        }
        if (message.type === "cawco:ready") {
          previewFrame.ready(event.origin);
          // A new page holds no drawing: the design graph reaches its state again.
          paneSheet.link?.loaded();
          previewFrame.letIn();
          if (paneNotice.failure?.again === "reload") {
            paneNotice.say(null);
          }
          // A page loaded again holds no comment being written.
          pinComposer.composing = null;
          paneMode.setMode(paneMode.mode, paneMode.placing);
          if (!paneMode.pinsShown) {
            paneMode.showPins(false);
          }
          pinThread.openLinkedPin();
          pinComposer.restoreDraft();
          if (pinThread.openPin) {
            previewFrame.post({
              type: "cawco:track-pin",
              id: pinThread.openPin,
            });
          }
          previewFrame.post({
            type: "cawco:pin-marks",
            live: [...pinThread.live],
            unread: [...pinThread.unread],
          });
          if (!this.#deps.onScreen()) {
            // Loaded while its tab is off screen: held from the start.
            previewFrame.post({ type: "cawco:hold" });
          }
        }
        break;
      }
      case "cawco:held":
        previewFrame.heardHeld(message);
        break;
      case "cawco:head-room":
        previewFrame.heardHeadRoom(message);
        break;
      case "cawco:captured":
        previewFrame.heardCaptured(message);
        break;
      case "cawco:pin-open": {
        const id = previewPinId(message.id);
        if (!id) {
          return;
        }
        paneMode.placedAgain(id);
        // The pin as the page holds it: the card draws from it while the pane's doc doesn't hold it yet.
        if (
          message.pin !== undefined &&
          !paneDoc.view?.pins.some((one) => one.id === id)
        ) {
          paneDoc.pageSays(id, message.pin);
        }
        pinThread.openCard(id, message.via === "key" ? "key" : "pointer");
        break;
      }
      case "cawco:compose":
      case "cawco:compose-at":
      case "cawco:comment-result":
        if (isComposerMessage(message)) {
          this.heardComposer(message);
        }
        break;
      case "cawco:pin-chain":
        pinThread.heardChain(message);
        break;
      case "cawco:peek":
        pinPeek.heardPeek(message);
        break;
      case "cawco:change-stops":
        changeTour.heardStops(message);
        break;
      // The page's own foot bar over the viewport's foot (its Send): Changed since you looked stands above it.
      case "cawco:page-foot":
        changeTour.heardFoot(message);
        break;
      case "cawco:change-pressed":
        changeTour.changePressed(message.anchor);
        break;
      // What the page said of a write the pane sent it for a pin it holds alone.
      case "cawco:reply-result":
      case "cawco:resolve-result":
      case "cawco:delete-result":
        pinThread.heardPageWrite(message.type, message);
        break;
      case "cawco:page-pins":
        paneDoc.heardPagePins(message);
        break;
      case "cawco:sync":
        paneDoc.heardSync(message);
        break;
      case "cawco:press":
        // A press on the page, outside the composer: the outside-press rule,
        // heard from the page's own process. A thread stays: it closes by its
        // Close or Esc alone. The design graph's open layers close on it, a
        // press on its stage being outside them.
        pinComposer.cancelComposer();
        if (paneSheet.link) {
          paneSheet.link.presses += 1;
          // A press brings the tools back, as a tap does an iOS toolbar.
          paneSheet.link.scrolledDown = false;
        }
        break;
      case "cawco:pin-at":
        pinThread.heardPinAt(message);
        break;
      case "cawco:key":
        paneKeys.heardKey(message);
        break;
      case "cawco:escape":
        // The page left Comment or Draw on its own Esc: the pane follows, and keeps it.
        pinComposer.cancelComposer();
        paneMode.setMode("interact");
        break;
      case SHORTCUT_MESSAGE: {
        // A shell combo the page left unhandled: the shell's, as from its own keys.
        const name = previewShortcut(message);
        if (name) {
          runShellShortcut(name);
        }
        break;
      }
      case "cawco:error":
        previewFrame.heardError(message);
        break;
      case "cawco:resolved":
        if (paneNotice.failure && paneNotice.failure.again === null) {
          paneNotice.say(null);
        }
        break;
      case "cawco:sheet": {
        // A sheet's page said its stories and props: the design graph's model, and the props on its Dials card.
        const said = previewSheet(message.sheet);
        if (said) {
          paneSheet.link?.heardSheet(said.sheet);
          if (said.cut.length > 0) {
            paneNotice.say({
              message: sheetWords.sheetCut(
                said.cut
                  .map((one) =>
                    sheetWords.sheetCutOf(one.kept, one.of, one.what)
                  )
                  .join(", ")
              ),
              again: null,
            });
          }
        }
        break;
      }
      case STAGE_REACHED: {
        // The stage reached the state the design graph asked for.
        const said = stageReachedOf(message);
        if (said && paneSheet.link) {
          paneSheet.link.reached = said;
        }
        break;
      }
      case STAGE_LAID: {
        // The stage laid its drawing out: the design graph's split gives it what it needs.
        const said = stageLaidOf(message);
        if (said && paneSheet.link) {
          paneSheet.link.laid = said;
        }
        break;
      }
      case STAGE_SCROLLED: {
        // Which way the drawing's page scrolled: the tools over its foot step aside going down.
        const said = stageScrolledOf(message);
        if (said && paneSheet.link) {
          paneSheet.link.scrolledDown = said.down;
        }
        break;
      }
      case STAGE_FAULT: {
        // The component threw as it mounted: the page says so in the stage.
        const said = stageFaultOf(message);
        if (said && paneSheet.link) {
          paneSheet.link.fault = said;
        }
        break;
      }
      case STAGE_DIFFERENCES: {
        // What differs from the state the design graph compares with: its lines at the stage's head.
        const said = stageDifferencesOf(message);
        if (said && paneSheet.link) {
          paneSheet.link.heardDifferences(said);
        }
        break;
      }
      case STAGE_TIME: {
        // The move's clock: the Animation face's playhead runs from it.
        const said = stageTimeOf(message);
        if (said && paneSheet.link) {
          paneSheet.link.heardTime(said);
        }
        break;
      }
      case STAGE_DIALS_WRITTEN: {
        // The agent's dials as written, read off the drawing: the Dials face stands on them.
        const said = stageDialsWrittenOf(message);
        if (said && paneSheet.link) {
          paneSheet.link.dialsWritten = said.values;
        }
        break;
      }
    }
  };
}
