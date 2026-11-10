/**
 * A component artifact's sheet: the inspector, the canvas view and the design graph's line to its stage page.
 */

import { canvasOf } from "@cawco/core/stage";
import { stageDialsOf } from "@cawco/core/stage-graph";
import { untrack } from "svelte";
import { store, stored } from "#lib/platform/storage.js";
import { writeSheet } from "../artifact-api";
import { besideLine } from "../graph/beside";
import { inspectKept, StageLink } from "../graph/stage-link.svelte";
import { CanvasViewState } from "./canvas-view.svelte";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneLayout } from "./pane-layout.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";
import type { PreviewReach } from "./preview-reach.svelte";
import { SheetInspector as Inspector } from "./sheet-inspector.svelte";

/** The design graph's room face the address names (`?face=move`, `map` or `dials`), opened on: the states when it names none. */
const GRAPH_FACES = ["map", "move", "dials"] as const;
export interface PaneSheetDeps {
  readonly instanceId: () => string;
  readonly paneDoc: PaneDoc;
  readonly paneLayout: PaneLayout;
  readonly paneSubject: PaneSubject;
  readonly previewFrame: PreviewFrame;
  readonly previewReach: PreviewReach;
}
export class PaneSheet {
  readonly #deps: PaneSheetDeps;

  /** His dial values as the artifact's doc keeps them (`dials`), by name: the design graph stands them again on open. */
  readonly keptDials = $derived.by(() => {
    const kept = this.#deps.paneDoc.view?.choices.dials?.value;
    return stageDialsOf({ values: kept })?.values ?? {};
  });

  /** His tuning of every move as the artifact's doc keeps it (its `tuned` map): the design graph puts it back on each move's first read. */
  readonly keptTuned = $derived.by(() => this.#deps.paneDoc.view?.tuned ?? []);

  readonly startFace =
    typeof location === "undefined"
      ? undefined
      : GRAPH_FACES.find(
          (one) => one === new URL(location.href).searchParams.get("face")
        );

  /*
   * A sheet's inspector (live components spec §5): the chosen story's props
   * as controls, from the sheet its page says (`cawco:sheet`). Opened from
   * the head's Inspect and kept per session, as Comments is; a right panel
   * beside the page on a desk and a tablet, a sheet over the page's foot on
   * a phone. One per sheet: another sheet starts with nothing unsaved.
   */
  inspectOpen = $state(false);

  readonly inspectKey = $derived.by(
    () => `cawco-preview-inspect:${this.#deps.instanceId()}`
  );

  readonly inspector = $derived.by(() => {
    const id = this.#deps.paneSubject.artifactId;
    const session = this.#deps.instanceId();
    return id && this.#deps.paneSubject.isSheet
      ? new Inspector(
          this.#deps.previewFrame.post,
          (change) => writeSheet(session, id, change),
          // A story he picked in the inspector: the design graph keeps its state.
          (file, story) => this.link?.want(file, story)
        )
      : null;
  });

  readonly inspecting = $derived(!!this.inspector && this.inspectOpen);

  /**
   * The inspector stands in the design graph's room, under its states,
   * where the room stands beside the stage (a desk's wide pane): the states
   * and the props stand together, and the stage keeps its width. Elsewhere
   * it is the pane's own panel or sheet.
   */
  readonly inspectorInRoom = $derived.by(
    () =>
      this.#deps.paneSubject.isSheet &&
      this.inspecting &&
      this.#deps.paneLayout.inspectorLayout === "panel" &&
      this.#deps.paneLayout.wellW > 0 &&
      this.#deps.paneLayout.wellW >= besideLine()
  );

  /** A component artifact's view in the head (Map, Verify), one for its head button and More's submenu alike. */
  readonly canvasView = $derived.by(() => {
    const session = this.#deps.instanceId();
    // Built untracked: the view depends on the session and the kind alone,
    // never on the state it holds (nightly 4202's crash was a view's effect
    // re-running on the state it wrote).
    return this.#deps.paneSubject.isSheet
      ? untrack(() => new CanvasViewState(session))
      : null;
  });

  /**
   * A component artifact's design graph's line to its stage page: what the
   * page said (its sheets, its drawing, its answers), and what the graph
   * asks of it, through `post`. One per session and kind, as the view.
   */
  readonly link = $derived.by(() => {
    const session = this.#deps.instanceId();
    return this.#deps.paneSubject.isSheet && session
      ? untrack(() => new StageLink(this.#deps.previewFrame.post))
      : null;
  });

  /** The component artifact's states files and the agent's spec, as its address carries them (core `canvasPath`). */
  readonly sheetCanvas = $derived.by(() =>
    this.#deps.paneSubject.isSheet
      ? canvasOf(this.#deps.previewReach.startAt)
      : null
  );

  /**
   * The frame stands in the design graph's stage, under the stage's own
   * head: the head's room is the graph page's, never the frame's.
   */
  readonly inGraph = $derived.by(
    () =>
      this.#deps.paneSubject.isSheet &&
      !!this.#deps.paneSubject.artifact &&
      !!this.link &&
      !!this.sheetCanvas
  );
  constructor(deps: PaneSheetDeps) {
    this.#deps = deps;
    $effect.pre(() => {
      const key = this.inspectKey;
      untrack(() => {
        this.inspectOpen = stored("local", key) === "open";
      });
    });
    // The inspector's controls are for the story the stage stands at.
    inspectKept(
      () => this.link,
      () => this.inspector
    );
  }

  showInspector(open: boolean) {
    this.inspectOpen = open;
    store("local", this.inspectKey, open ? "open" : "shut");
  }
}
