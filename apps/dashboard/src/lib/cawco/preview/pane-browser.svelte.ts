/**
 * A browser artifact's row and machine, and its Take over and Hand back.
 */
import type { TakeoverLayout } from "@cawco/core/browser";
import { browserWords } from "@cawco/core/words/browser";
import type BrowserView from "./BrowserView.svelte";
import { handBackFromPanel, takeOverFromPanel } from "./browser-acts";
import type { PaneNotice } from "./pane-notice.svelte";
import type { PaneSubject } from "./pane-subject.svelte";

export interface PaneBrowserDeps {
  readonly instanceId: () => string;
  readonly paneNotice: PaneNotice;
  readonly paneSubject: PaneSubject;
}
export class PaneBrowser {
  readonly #deps: PaneBrowserDeps;

  readonly browserRow = $derived.by(() =>
    this.#deps.paneSubject.isBrowser
      ? this.#deps.paneSubject.fleet.browser(this.#deps.instanceId())
      : null
  );

  readonly browserMachine = $derived.by(() => {
    const machineId =
      this.#deps.paneSubject.owner?.machineId ??
      this.browserRow?.machineId ??
      "";
    const known = this.#deps.paneSubject.fleet.machines.find(
      (one) => one.machineId === machineId
    );
    return {
      machineId,
      name: this.browserRow?.machineName ?? known?.hostname ?? machineId,
      online: known?.online ?? false,
    };
  });

  /** The browser's stream is drawn in the well (BrowserView): there is a page to take over. */
  browserViewing = $state(false);

  /** The layout the taken-over page is in (BrowserView `form`): the head's switch. */
  browserForm = $state<TakeoverLayout["form"]>("desk");

  /** The browser's view, for the head's Reload page. */
  browserView = $state<BrowserView>();

  browserActing = $state(false);

  /** Take over from the panel, or Hand back while the person holds it; a refusal on the pane's line. */
  browserControl = async () => {
    const row = this.browserRow;
    if (!row) {
      return;
    }
    this.browserActing = true;
    const holding = !!row.takeover;
    const why = holding
      ? await handBackFromPanel(row.key, row.machineId)
      : await takeOverFromPanel(row.key, {
          instanceId: this.#deps.instanceId(),
          machineId: row.machineId,
        });
    this.browserActing = false;
    this.#deps.paneNotice.say(
      why
        ? {
            message: holding
              ? browserWords.cantHandBack(why)
              : browserWords.cantTakeOver(why),
            again: null,
          }
        : null
    );
  };
  constructor(deps: PaneBrowserDeps) {
    this.#deps = deps;
  }
}
