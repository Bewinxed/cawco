<script lang="ts" module>
  /** Where the failure stands, each the place it is wired in the dashboard. */
  export type Place =
    "side" | "sheet" | "comments" | "decision" | "page" | "tabs" | "composer";
</script>

<script lang="ts">
  /**
   * The failure states' frames (FailedParts.stories.ts): each a part of the
   * dashboard stopped on a render error, drawn by the real boundary and face
   * in the real place it is wired, with what stands round it working.
   *
   * - `side`: the real SideSplit beside a conversation on a desk, a task
   *   standing in its card; the task's pane throws (Throws). Its Close puts
   *   the task away, and the card goes.
   * - `sheet`: the preview's sheet on a phone (SideSplit's sheets): the
   *   boundary and the card round its face as SideSplit draws them.
   * - `comments`: the real Comments rail given three comments, the middle
   *   one's reply carrying no words, so its row throws and fails as one
   *   line, its siblings standing.
   * - `decision`: the real renderer drawing a decision page's three cards,
   *   the middle one throwing (ThrowingDecision), with the host's fault
   *   in its place (decisions/host/Host).
   * - `page`, `tabs`, `composer`: a page's body, a pane's tab strip under
   *   the phone's bar, the composer's pill (RegionBoundary's faces).
   *
   * `stuck`: every rebuild throws the same way, so Try again turns the face
   * to Reload page at once.
   */
  import type { Pin } from "@cawco/core/comments";
  import { decisionLibrary } from "@cawco/core/decisions-library";
  import Badge from "../../decisions/host/Badge.svelte";
  import Canvas from "../../decisions/host/Canvas.svelte";
  import Column from "../../decisions/host/Column.svelte";
  import Diagram from "../../decisions/host/Diagram.svelte";
  import Dials from "../../decisions/host/Dials.svelte";
  import { decisionFault } from "../../decisions/host/Host.svelte";
  import Image from "../../decisions/host/Image.svelte";
  import Option from "../../decisions/host/Option.svelte";
  import Preview from "../../decisions/host/Preview.svelte";
  import Row from "../../decisions/host/Row.svelte";
  import Section from "../../decisions/host/Section.svelte";
  import Text from "../../decisions/host/Text.svelte";
  import CommentRail from "../../preview/CommentRail.svelte";
  import RegionBoundary from "../../RegionBoundary.svelte";
  import FailedSurface from "../../side/FailedSurface.svelte";
  import SideSplit from "../../side/SideSplit.svelte";
  import { besideOf, standBeside } from "../../tasks/beside.svelte";
  import OpenUiRenderer, {
    type OpenUIComponent,
  } from "../../views/openui/OpenUiRenderer.svelte";
  import DecisionColumn from "./DecisionColumn.svelte";
  import ThrowingDecision from "./ThrowingDecision.svelte";
  import Throws from "./Throws.svelte";

  let {
    place,
    stuck = false,
    height,
  }: {
    place: Place;
    stuck?: boolean;
    /** The window's height, as the story's frame. */
    height: number;
  } = $props();

  /** The conversation the side card stands beside. */
  const VIEW = "failed-parts";
  if (!besideOf(VIEW)) {
    standBeside(VIEW, { projectId: "cawco-dev", taskId: "tsk-165" });
  }
  const builds = { n: 0 };

  const LIBRARY = decisionLibrary<OpenUIComponent>({
    Decisions: DecisionColumn,
    Section,
    Decision: ThrowingDecision,
    Option,
    Image,
    Diagram,
    Canvas,
    Preview,
    Dials,
    Text,
    Badge,
    Row,
    Column,
  });
  /** caw-off-calls, as the hub keeps it: its second card throws. */
  const PROGRAM = `root = Decisions("Turning Caw off: the tray you asked for", [build, throws, keeps])
build = Decision("build", "Build this tray for turning Caw off?", [yes, later], "When you turn Caw off, it lists every session and task Caw started, all checked.", [], [], false, null, "scope")
yes = Option("yes", "Yes, build it", "The tray lists what Caw started.", true, [], "One more step before Caw is off.")
later = Option("later", "Not yet", "Caw turns off as today.", false, [], "What Caw started keeps running unseen.")
throws = Decision("throws", "With many sessions running, does the list stop at about ten rows?", [ten, all], "A long list scrolls inside the tray.", [], [], false, null, "look")
ten = Option("ten", "About ten rows", "The rest scroll.", true, [], "Some rows are out of sight.")
all = Option("all", "Every row", "The tray grows.", false, [], "It can pass the screen.")
keeps = Decision("keeps", "Does an unchecked row say 'Keeps running'?", [box, words], "An unchecked row is one you let finish.", [], [], false, null, "look")
box = Option("box", "No, the empty box says it", "One mark per row.", true, [], "The box alone carries it.")
words = Option("words", "Yes, 'Keeps running' replaces its status", "The row says it in words.", false, [], "A second word per row.")`;

  const NOW = Date.parse("2026-10-30T21:17:00Z");
  const at = (minutes: number) =>
    new Date(NOW - minutes * 60_000).toISOString();
  const pin = (
    number: number,
    title: string,
    said: string,
    reply: string | undefined
  ): Pin =>
    ({
      id: `pin-${number}`,
      number,
      kind: "comment",
      by: "person",
      at: at(40 - number),
      title,
      anchor: { selector: `#part-${number}`, source: null },
      elements: [],
      thread: [
        { id: `e-${number}-1`, by: "person", at: at(40 - number), text: said },
        { id: `e-${number}-2`, by: "agent", at: at(30 - number), text: reply },
      ],
    }) as unknown as Pin;
  /** goo-card's comments that night; the second one's reply was kept with no words. */
  const PINS: Pin[] = [
    pin(
      1,
      "Comment card",
      "The neck doubles when I scroll.",
      "Fixed: one shape draws both."
    ),
    pin(2, "Pin 2", "Can the card open from the pin?", undefined),
    pin(
      3,
      "Thread",
      "Replies should stand under the comment.",
      "They do now, oldest first."
    ),
  ];
</script>

{#snippet stand()}
  <div class="size-full bg-surface-well"></div>
{/snippet}

{#snippet transcript()}
  <div
    class="flex min-h-0 flex-1 flex-col justify-end gap-space-4 bg-tab-sheet px-space-6 pb-space-4"
  >
    <p class="m-0 max-w-c-measure text-pretty text-ink-strong type-body">
      The side panel crash: your console shows a list that got two items with
      the same key.
    </p>
    <div
      class="flex h-c-input-h max-w-c-composer-w items-center rounded-lg border border-border-control bg-surface-raised px-space-3 text-ink-subtle shadow-tile type-body"
    >
      Write to Claude Code
    </div>
  </div>
{/snippet}

<div
  data-slot="failed-parts"
  class="relative flex h-(--frame-h) w-full min-w-0 flex-col overflow-hidden bg-surface-recess text-ink-strong"
  style:--frame-h="{height}px"
>
  {#if place === "side"}
    <SideSplit
      active
      phone={false}
      taskOpen={!!besideOf(VIEW)}
      viewId={VIEW}
      visible
    >
      {@render transcript()}
      {#snippet task()}
        <Throws {builds} {stuck}>{@render stand()}</Throws>
      {/snippet}
    </SideSplit>
  {:else if place === "sheet"}
    {@render transcript()}
    <div class="absolute inset-x-0 top-2/5 bottom-0 flex flex-col">
      <div
        data-preview-sheet
        class="relative flex min-h-0 flex-1 flex-col rounded-t-lg bg-surface-raised pt-space-3 shadow-drawer"
      >
        <span
          aria-hidden="true"
          class="mx-auto mb-space-1 block h-c-grabber-h w-c-grabber-w flex-none rounded-full bg-border-control"
        ></span>
        <RegionBoundary part="preview">
          <Throws {builds} {stuck}>{@render stand()}</Throws>
          {#snippet chrome(face)}
            <FailedSurface viewId={VIEW} what="preview"
              >{@render face()}</FailedSurface
            >
          {/snippet}
        </RegionBoundary>
      </div>
    </div>
  {:else if place === "comments"}
    <div class="flex min-h-0 flex-1 justify-end p-space-2">
      <div
        class="flex min-h-0 w-c-comments-w max-w-full flex-col rounded-lg bg-surface-raised shadow-drawer"
      >
        <CommentRail
          down={null}
          focused={null}
          hold="ready"
          layout="beside"
          live={new Set()}
          onclose={() => undefined}
          onhover={() => undefined}
          onopen={() => undefined}
          onpage={() => undefined}
          onresolve={() => undefined}
          onretry={() => undefined}
          onretrypin={() => undefined}
          open={null}
          pins={PINS}
          unread={new Set()}
        />
      </div>
    </div>
  {:else if place === "decision"}
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <OpenUiRenderer
        fault={decisionFault}
        label="the failure states' decision page"
        library={LIBRARY}
        response={PROGRAM}
      ></OpenUiRenderer>
    </div>
  {:else if place === "page"}
    <header
      class="flex h-c-top-bar-h flex-none items-center px-space-3 text-ink-strong type-label"
    >
      Sessions
    </header>
    <div class="flex min-h-0 flex-1 flex-col">
      <RegionBoundary face="page" part="workspace">
        <Throws {builds} {stuck}>{@render stand()}</Throws>
      </RegionBoundary>
    </div>
  {:else if place === "tabs"}
    <RegionBoundary barOver face="strip" part="tabs">
      <Throws {builds} {stuck} />
    </RegionBoundary>
    {@render transcript()}
  {:else}
    <div class="relative flex min-h-0 flex-1 flex-col">
      {@render transcript()}
      <div class="pointer-events-none absolute inset-0 z-1">
        <RegionBoundary face="composer" part="composer">
          <Throws {builds} {stuck} />
        </RegionBoundary>
      </div>
    </div>
  {/if}
</div>
