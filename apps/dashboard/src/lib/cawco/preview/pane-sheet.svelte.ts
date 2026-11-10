/**
 * A component artifact's sheet: the props of its state (the inspector), what its design graph hands the head, and the graph's line to its stage page.
 */

import { canvasOf } from "@cawco/core/stage";
import { stageDialsOf } from "@cawco/core/stage-graph";
import { untrack } from "svelte";
import { writeSheet } from "../artifact-api";
import type { GraphHead } from "../graph/graph-head";
import { inspectKept, StageLink } from "../graph/stage-link.svelte";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneNotice } from "./pane-notice.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";
import type { PreviewReach } from "./preview-reach.svelte";
import { SheetInspector } from "./sheet-inspector.svelte";

/** The design graph's room face the address names (`?face=move`, `map` or `dials`), opened on: the states when it names none. */
const GRAPH_FACES = ["map", "move", "dials"] as const;
export interface PaneSheetDeps {
  readonly instanceId: () => string;
  readonly paneDoc: PaneDoc;
  readonly paneNotice: PaneNotice;
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
   * The props of the state on a component canvas's stage (live components
   * spec §5), from the sheet its page says (`cawco:sheet`): the design
   * graph's Dials card lists them under the agent's dials. One per sheet:
   * another sheet starts with nothing unsaved.
   */
  readonly inspector = $derived.by(() => {
    const id = this.#deps.paneSubject.artifactId;
    const session = this.#deps.instanceId();
    return id && this.#deps.paneSubject.isSheet
      ? new SheetInspector(
          this.#deps.previewFrame.post,
          (change) => writeSheet(session, id, change),
          // A state saved as new: the design graph keeps it.
          (file, story) => this.link?.want(file, story),
          (why) => {
            this.#deps.paneNotice.say({ message: why, again: null });
          }
        )
      : null;
  });

  /** What a component artifact's design graph hands the head: its state's title, its steps, its view, its components (graph-head.ts). */
  graphHead = $state<GraphHead | null>(null);

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
    // The Dials card's props are for the story the stage stands at.
    inspectKept(
      () => this.link,
      () => this.inspector
    );
  }
}
