/**
 * Closing the pane: its Close, and the flight back into the tool row it opened from.
 */
import { dur } from "#lib/platform/motion/curves.svelte.js";
import { closeInto } from "#lib/platform/motion/share.svelte.js";
import { goto } from "$app/navigation";
import type { PaneLayout } from "./pane-layout.svelte";
import type { PaneSubject } from "./pane-subject.svelte";

export interface PaneCloseDeps {
  readonly instanceId: () => string;
  readonly paneLayout: PaneLayout;
  readonly paneSubject: PaneSubject;
  readonly sheet: () => boolean;
}
export class PaneClose {
  readonly #deps: PaneCloseDeps;

  shown: boolean;

  /** Close in the artifact's own tab: back to the session that made it. */
  backToSession = async () => {
    await goto(
      this.#deps.paneSubject.fleet.sessionHref(this.#deps.instanceId())
    );
  };

  /** Close: the panel goes in this tab alone (closed-here.ts). */
  close = () => {
    this.#deps.paneSubject.fleet.closePreview(this.#deps.instanceId());
  };
  constructor(deps: PaneCloseDeps) {
    this.#deps = deps;
    this.shown = false;
    $effect(() => {
      const open = this.#deps.paneSubject.preview?.state === "open";
      if (
        this.shown &&
        !open &&
        !this.#deps.sheet() &&
        this.#deps.paneLayout.section &&
        this.#deps.paneSubject.artifact
      ) {
        this.closeToRow(
          this.#deps.paneLayout.section,
          this.#deps.paneSubject.artifact.id
        );
      }
      this.shown = open;
    });
  }

  closeToRow(pane: HTMLElement, id: string) {
    const row = [
      ...document.querySelectorAll<HTMLElement>(
        `[data-slot="preview-tool"][data-share="preview:${CSS.escape(this.#deps.instanceId())}"][data-artifact="${CSS.escape(id)}"]`
      ),
    ].at(-1);
    if (!row) {
      return;
    }
    const box = row.getBoundingClientRect();
    if (box.height === 0 || box.bottom <= 0 || box.top >= innerHeight) {
      return;
    }
    const rect = pane.getBoundingClientRect();
    const stand = document.createElement("div");
    stand.setAttribute("aria-hidden", "true");
    stand.className = "preview-close-flight";
    Object.assign(stand.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      borderRadius: "var(--radius-lg)",
      background: "var(--surface-raised)",
      boxShadow: "var(--shadow-drawer)",
      pointerEvents: "none",
      zIndex: "var(--layer-flight)",
    });
    document.body.append(stand);
    const done = () => stand.remove();
    const flight = closeInto(stand, row, dur("--dur-panel"));
    if (flight) {
      flight.finished.then(done, done);
    } else {
      done();
    }
  }
}
