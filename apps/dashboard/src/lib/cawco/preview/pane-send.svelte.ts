/**
 * What the person sends to the session: Send, and each comment's Try again.
 */
import { type Pin, pinUnsent, writeAgain } from "@cawco/core/comments/model";
import { commentWords } from "@cawco/core/words/comments";
import { failureWords } from "#lib/platform/hub-read.js";
import { retryComment, sendArtifact } from "./artifact-doc";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneNotice } from "./pane-notice.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";

/** How long a comment only the page holds is given to reach the hub, once its link is opened again, before its Try again says it didn't. Our call. */
const REACH_HUB_MS = 10_000;
export interface PaneSendDeps {
  readonly instanceId: () => string;
  readonly paneDoc: PaneDoc;
  readonly paneNotice: PaneNotice;
  readonly paneSubject: PaneSubject;
  readonly previewFrame: PreviewFrame;
}
export class PaneSend {
  readonly #deps: PaneSendDeps;

  sending = $state(false);

  /** The comments whose Try again is on its way. */
  pinsRetrying = $state.raw<ReadonlySet<string>>(new Set());

  /**
   * Why comment `id` hasn't reached the session, in words, when it is
   * owed for a reason: a delivery of it no one took (the hub's `notSent`),
   * or it stands only in the page's doc while the page's link has stood down
   * past its grace ({@link linkDown}): the hub can't be reached, and it goes
   * once the hub is back. Inside the grace a reopening link says nothing,
   * and no close code is ever his to read here. Said while it is unsent,
   * and on a sent one too while a resolve, reopen or delete of it the hub
   * refused is kept (core `keepAside`): that act hasn't reached the hub.
   */
  readonly notSentWhy = (pin: Pin): string | null => {
    const kept =
      this.#deps.paneDoc.refusedReplies[pin.id] ??
      this.#deps.paneDoc.pageReplies[pin.id];
    if (kept && (kept.resolved !== undefined || kept.deleted)) {
      return kept.why;
    }
    if (pin.resolvedAt || !pinUnsent(pin)) {
      return null;
    }
    return (
      kept?.why ??
      pin.notSent?.why ??
      (this.#deps.paneDoc.onlyOnPage(pin.id) && this.#deps.paneDoc.linkDown
        ? commentWords.hubUnreached
        : null)
    );
  };

  /** Resolves once the pane's doc holds comment `id` (the page's link carried it to the hub); rejects, saying why, when it doesn't within {@link REACH_HUB_MS}. */
  readonly reachedHub = (id: string) =>
    new Promise<void>((resolve, reject) => {
      const started = Date.now();
      const look = setInterval(() => {
        if (this.#deps.paneDoc.view?.pins.some((pin) => pin.id === id)) {
          clearInterval(look);
          resolve();
        } else if (Date.now() - started > REACH_HUB_MS) {
          clearInterval(look);
          reject(new Error(commentWords.notReachedHub));
        }
      }, 200);
    });

  /**
   * A comment's Try again (its row's, its thread's), for one not sent. One
   * only the page holds yet has its link opened again, and goes by itself
   * once it is on the hub. One whose delivery no one took goes now. A Try
   * again no one took says why on the pin itself (the hub's `notSent`,
   * which the doc brings back) as well as in the band over the page.
   */
  retryPin = async (id: string) => {
    if (!this.#deps.paneSubject.artifact || this.pinsRetrying.has(id)) {
      return;
    }
    this.pinsRetrying = new Set([...this.pinsRetrying, id]);
    try {
      if (
        this.#deps.paneDoc.refusedReplies[id] ||
        this.#deps.paneDoc.pageReplies[id]
      ) {
        // The page's are written into its doc again, which tells what it still keeps; the pane's into the pane's.
        if (this.#deps.paneDoc.pageReplies[id]) {
          this.#deps.previewFrame.post({ type: "cawco:resend-pin", id });
        }
        if (this.#deps.paneDoc.refusedReplies[id]) {
          this.retryRefused(this.#deps.paneSubject.artifact.id, id);
        }
      } else if (this.#deps.paneDoc.onlyOnPage(id)) {
        // One the hub refused is written into the page's doc again; one its link held back goes as the link opens.
        this.#deps.previewFrame.post({ type: "cawco:resend-pin", id });
        this.#deps.paneDoc.relink();
        await this.reachedHub(id);
      } else {
        await retryComment(
          this.#deps.instanceId(),
          this.#deps.paneSubject.artifact.id,
          id
        );
      }
    } catch (error) {
      this.#deps.paneNotice.say({ message: failureWords(error), again: null });
    } finally {
      this.pinsRetrying = new Set(
        [...this.pinsRetrying].filter((one) => one !== id)
      );
    }
  };
  constructor(deps: PaneSendDeps) {
    this.#deps = deps;
  }

  /*
   * The setup page is done once the person sends it from the page (its own
   * `cawco.send`, which stamps the doc's `sentAt`): on a phone its sheet
   * stands over the thread, where Caw answers with the files and "Open the
   * board". The `sentAt` it opened with is not a send.
   */
  /**
   * Send: the hub's send, which applies a setup page's name, shape and
   * place first and tells the session of the page's picks. A refusal is
   * said in the band over the page, and the picks stay unsent.
   */
  async sendAll(control: "panel-head" | "panel-more") {
    if (!this.#deps.paneSubject.artifact || this.sending) {
      return;
    }
    this.sending = true;
    try {
      await sendArtifact(
        this.#deps.instanceId(),
        this.#deps.paneSubject.artifact.id,
        control
      );
    } catch (error) {
      this.#deps.paneNotice.say({ message: failureWords(error), again: null });
    } finally {
      this.sending = false;
    }
  }

  /**
   * A refused write's Try again on pin `id`: its delete, or its resolve or
   * reopen, and each of its replies' words written into the pane's doc
   * again, now the hub's (artifact-doc.ts `again`), and let go of once
   * written; one still refused stays with why.
   */
  retryRefused(artifactKey: string, id: string) {
    const kept = this.#deps.paneDoc.refusedReplies[id];
    if (!(kept && this.#deps.paneDoc.doc)) {
      throw new Error(
        "The pane lost the page's document, so it wasn't written again. Reload, then try again."
      );
    }
    const { left, why } = writeAgain(
      this.#deps.paneDoc.refusedReplies,
      id,
      this.#deps.paneDoc.doc
    );
    this.#deps.paneDoc.keepReplies(artifactKey, left);
    if (why) {
      throw new Error(why);
    }
  }
}
