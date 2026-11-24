/**
 * A component artifact's sheet: the props of its state (the inspector), what its design graph hands the head, and the graph's line to its stage page.
 */

import { madeViewOf, type Unplaced } from "@cawco/core/comments/made-view";
import type { Pin } from "@cawco/core/comments/model";
import { canvasOf } from "@cawco/core/stage";
import { shownName, stageDialsOf, stageLeftOut } from "@cawco/core/stage-graph";
import { graphWords } from "@cawco/core/words/graph";
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
/**
 * The design graph shown as pin `pin` was made, for a pin this view can't
 * draw because it shows another state, or the pin's state at another width
 * or scheme (`away`, pane-doc `awayOf`): its state, width and scheme set
 * through the graph's own controls (StageLink `showMade`). Null off a
 * design graph (no `link`: a page preview has no such controls), and for a
 * pin that stands nowhere for another reason.
 */
export const showMadeAction = (
  link: StageLink | null,
  pin: Pin,
  away: Unplaced | undefined
): (() => void) | null => {
  const anchor = "selector" in pin.anchor ? pin.anchor : null;
  const sheet = anchor?.sheet;
  if (
    !(link && anchor && sheet) ||
    (away?.why !== "story" && away?.why !== "elsewhere")
  ) {
    return null;
  }
  const made = madeViewOf(anchor) ?? { scheme: "page", width: null };
  return () => link.showMade(sheet.file, sheet.story, made);
};

export class PaneSheet {
  readonly #deps: PaneSheetDeps;

  /** His dial values as the artifact's doc keeps them (`dials`), by name: the design graph stands them again on open. */
  readonly keptDials = $derived.by(() => {
    const kept = this.#deps.paneDoc.view?.choices.dials?.value;
    if (kept === undefined) {
      return {};
    }
    const dials = stageDialsOf({ values: kept });
    if (!dials) {
      throw new Error(
        `The artifact's doc keeps its dials as ${JSON.stringify(kept)}, not a map of dial names to numbers, words or switches`
      );
    }
    return dials.values;
  });

  /** The direction he picked, by its states file, as the artifact's doc keeps it (`picked`); null while none is. */
  readonly keptPick = $derived.by(() => {
    const kept = this.#deps.paneDoc.view?.choices.picked?.value;
    return typeof kept === "string" ? kept : null;
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
    // A design folder's pages have no props to inspect, nor a states file to save them into.
    return id &&
      this.#deps.paneSubject.isSheet &&
      !this.#deps.paneSubject.design
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
      ? untrack(
          () =>
            new StageLink((message) => {
              // What the page's readers will drop from it for its length: said on the pane's line.
              const left = stageLeftOut(message.type, message);
              if (left) {
                this.#deps.paneNotice.say({
                  again: null,
                  message: graphWords.leftOut(left),
                });
              }
              this.#deps.previewFrame.post(message);
            })
        )
      : null;
  });

  /** The name sheet `file`'s state `story` is shown by, as the design graph's States menu says it (core `shownName`); null where the stage page hasn't said that sheet. */
  readonly stateName = (file: string, story: string): string | null => {
    const sheet = this.link?.sheets[file];
    const one = sheet?.stories.find((each) => each.name === story);
    return sheet && one ? shownName(one, sheet.stories) : null;
  };

  /** The design graph shown as pin `pin` was made ({@link showMadeAction}), through this pane's line to its stage. */
  readonly showMadeOf = (pin: Pin, away: Unplaced | undefined) =>
    showMadeAction(this.link, pin, away);

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
