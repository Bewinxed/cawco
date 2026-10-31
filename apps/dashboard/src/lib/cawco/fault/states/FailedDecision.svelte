<script lang="ts">
  /**
   * A decision page that can't draw two of its parts
   * (FailedDecision.stories.ts): the real renderer drawing caw-off-calls'
   * cards as the page's host does (decisions/host/Host: `cardOf`, the
   * kit's still Caw). Its middle card throws (ThrowingDecision) and stands
   * as its card; the first card's diagram throws (ThrowingDiagram) and
   * stands as a line in its place. The library's Image, Canvas, Preview and
   * Dials are in no statement of this program, so their places take its
   * Text and their files are not loaded.
   */
  import { decisionLibrary } from "@cawco/core/decisions-library";
  import Badge from "../../decisions/host/Badge.svelte";
  import Column from "../../decisions/host/Column.svelte";
  import { decisionCardOf } from "../../decisions/host/card-fault";
  import Option from "../../decisions/host/Option.svelte";
  import Row from "../../decisions/host/Row.svelte";
  import Section from "../../decisions/host/Section.svelte";
  import { stillCaw } from "../../decisions/host/StillCaw.svelte";
  import Text from "../../decisions/host/Text.svelte";
  import OpenUiRenderer, {
    type OpenUIComponent,
  } from "../../views/openui/OpenUiRenderer.svelte";
  import DecisionColumn from "./DecisionColumn.svelte";
  import ThrowingDecision from "./ThrowingDecision.svelte";
  import ThrowingDiagram from "./ThrowingDiagram.svelte";

  let {
    width,
    height,
  }: {
    /** The window's size, as the story's frame. */
    width: number;
    height: number;
  } = $props();

  const LIBRARY = decisionLibrary<OpenUIComponent>({
    Decisions: DecisionColumn,
    Section,
    Decision: ThrowingDecision,
    Option,
    Image: Text,
    Diagram: ThrowingDiagram,
    Canvas: Text,
    Preview: Text,
    Dials: Text,
    Text,
    Badge,
    Row,
    Column,
  });
  /** caw-off-calls, as the hub keeps it: its second card throws, and the first card's diagram. */
  const PROGRAM = `root = Decisions("Turning Caw off: the tray you asked for", [build, throws, keeps])
build = Decision("build", "Build this tray for turning Caw off?", [yes, later], "When you turn Caw off, it lists every session and task Caw started, all checked.", [flow], [], false, null, "scope")
flow = Diagram("flowchart LR\nTray --> ")
yes = Option("yes", "Yes, build it", "The tray lists what Caw started.", true, [], "One more step before Caw is off.")
later = Option("later", "Not yet", "Caw turns off as today.", false, [], "What Caw started keeps running unseen.")
throws = Decision("throws", "With many sessions running, does the list stop at about ten rows?", [ten, all], "A long list scrolls inside the tray.", [], [], false, null, "look")
ten = Option("ten", "About ten rows", "The rest scroll.", true, [], "Some rows are out of sight.")
all = Option("all", "Every row", "The tray grows.", false, [], "It can pass the screen.")
keeps = Decision("keeps", "Does an unchecked row say 'Keeps running'?", [box, words], "An unchecked row is one you let finish.", [], [], false, null, "look")
box = Option("box", "No, the empty box says it", "One mark per row.", true, [], "The box alone carries it.")
words = Option("words", "Yes, 'Keeps running' replaces its status", "The row says it in words.", false, [], "A second word per row.")`;
</script>

<div
  class="flex h-(--frame-h) w-(--frame-w) min-w-0 flex-col overflow-hidden bg-surface-recess"
  style:--frame-h="{height}px"
  style:--frame-w="{width}px"
>
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    <OpenUiRenderer
      cardOf={decisionCardOf}
      caw={stillCaw}
      label="the failure states' decision page"
      library={LIBRARY}
      response={PROGRAM}
    ></OpenUiRenderer>
  </div>
</div>
