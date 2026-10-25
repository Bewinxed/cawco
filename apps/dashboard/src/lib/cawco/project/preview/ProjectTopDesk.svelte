<script lang="ts">
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import TaskFilterPopover from "#lib/cawco/tasks/TaskFilterPopover.svelte";
  import { NO_FILTER } from "#lib/cawco/tasks/task-filter.js";
  /**
   * The top of the project page on a desk, as a design fixture (the
   * project page's states files): the shell's 44px bar with no ground,
   * holding the view strip where the crumb would stand and the bar's glass
   * group at its end, then the project's head, from the page's real parts
   * (ViewTabs, TaskFilterPopover, the kit's Button, OsMark, Caw's still) on
   * Cawco-Dev's live data (project-data.ts). No store is read.
   *
   * What the design questions turn:
   * - `head`: "row", the one-row head under the bar (its name, the place as
   *   an OS-mark item, Caw's 48px seat and one glass capsule of Ask Caw,
   *   Spin off and More); "bar", no head: the name leads the bar before the
   *   views, Spin off and More end the strip, and Caw stands on the page's
   *   axis under the bar.
   * - `askGlyph`: Ask Caw's glyph, in the strip and the head's capsule.
   * - `strip`: the strip's actions loose as bare symbols, or in a capsule of
   *   the bar's glass.
   * - `decisionsDot`: the Decisions tab's count wears the Needs you dot, as
   *   the views' ⋯ count does.
   * - `width`: the page's width beside the rail, px.
   */
  import type { TaskFind } from "#lib/cawco/tasks/task-find.svelte.js";
  import BarGlass from "#lib/components/ui/bar-glass/bar-glass.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconFork,
    IconMore,
    IconPlus,
    IconSearch,
    IconServer,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import ViewTabs from "../ViewTabs.svelte";
  import { DOT_ON_MORE, DOT_ON_TAB, GLASS_CAPSULE } from "./glass";
  import { ASK_GLYPHS, type AskGlyph, PROJECT, VIEWS } from "./project-data";

  let {
    width,
    head = "row",
    askGlyph = "chat-add",
    strip = "loose",
    decisionsDot = false,
  }: {
    width: number;
    head?: "row" | "bar";
    askGlyph?: AskGlyph;
    strip?: "loose" | "capsule";
    decisionsDot?: boolean;
  } = $props();

  const IconAsk = $derived(ASK_GLYPHS[askGlyph]);
  const SEAT = 48;
  let current = $state("board");
  /** The filter's find, standing still: no words asked. */
  const find = { finding: false, problem: null, ids: null } as TaskFind;
</script>

{#snippet actions()}
  <TaskFilterPopover
    {find}
    filter={NO_FILTER}
    onchange={() => undefined}
    tasks={[]}
  />
  <Button
    aria-label="New task"
    layout="wide"
    press="pressable"
    size="sm"
    title="New task"
    variant="ghost"
  >
    <IconPlus />
    <span class="in-form-compact:hidden">New task</span>
  </Button>
  <Button
    aria-label="Ask Caw for a view"
    layout="wide"
    press="pressable"
    size="sm"
    title="Ask Caw for a view"
    variant="ghost"
  >
    <IconAsk />
    <span class="in-form-compact:hidden">Ask Caw for a view</span>
  </Button>
  {#if head === "bar"}
    <Button
      aria-label="Spin off"
      press="pressable"
      size="icon-sm"
      title="Spin off"
      variant="ghost"
    >
      <IconFork />
    </Button>
    <Button
      aria-label="More for {PROJECT.name}"
      press="pressable"
      size="icon-sm"
      title="More"
      variant="ghost"
    >
      <IconMore />
    </Button>
  {/if}
{/snippet}

<div
  data-slot="project-top"
  class={cn(
    "w-(--frame-w) bg-surface-recess pb-space-7",
    DOT_ON_MORE,
    decisionsDot && DOT_ON_TAB
  )}
  style:--frame-w="{width}px"
>
  <!-- The shell's bar: no ground of its own; the strip where the crumb
       would stand, the glass group at its end. -->
  <div class="flex h-c-top-bar-h items-center pe-space-6">
    <div
      data-slot="strip"
      class="flex min-w-0 shrink grow basis-0 items-center gap-space-3 self-stretch pe-space-3 ps-space-7"
    >
      {#if head === "bar"}
        <span
          data-slot="bar-title"
          class="min-w-0 max-w-48 flex-none overflow-hidden text-ellipsis whitespace-nowrap type-label text-ink-strong"
          title={PROJECT.name}>{PROJECT.name}</span
        >
      {/if}
      <ViewTabs
        {current}
        hrefOf={(view) => `#${view}`}
        onchoose={(view) => {
          current = view;
        }}
        views={VIEWS}
      />
      {#if strip === "capsule"}
        <div data-form="compact" class={GLASS_CAPSULE}>
          {@render actions()}
        </div>
      {:else}
        <span
          aria-hidden="true"
          class="h-c-btn-h-sm w-px flex-none bg-border-hairline"
        ></span>
        <div
          data-form="compact"
          class="flex flex-none items-center gap-space-2"
        >
          {@render actions()}
        </div>
      {/if}
    </div>
    <BarGlass>
      {#snippet head()}
        <button
          data-bar-item
          aria-label="Caw"
          class="select-none touch-hit press-tint"
          type="button"
        >
          <CawFace size={20} status="compacted" />
        </button>
      {/snippet}
      <button
        data-bar-item
        aria-label="Jump to session"
        class="select-none touch-hit press-tint"
        type="button"
      >
        <IconSearch aria-hidden="true" class="size-icon-md text-ink-muted" />
      </button>
      <button
        data-bar-item
        aria-label="Machines"
        class="select-none touch-hit press-tint"
        type="button"
      >
        <IconServer data-slot="bar-symbol" aria-hidden="true" />
      </button>
    </BarGlass>
  </div>

  {#if head === "row"}
    <!-- One row: the name truncates first, the place is a bare OS-mark item,
         then Caw's seat and one capsule of bare symbols. Nothing coral. -->
    <header
      data-slot="project-head"
      class="flex items-center gap-space-3 pt-space-6 pe-space-6 pb-space-4 ps-space-7"
    >
      <h1 class="min-w-0 type-title text-ink-strong">
        <span class="block overflow-hidden text-ellipsis whitespace-nowrap"
          >{PROJECT.name}</span
        >
      </h1>
      <button
        data-box
        aria-label="Project details"
        class="select-none press-tint grid size-c-bar-item flex-none place-items-center rounded-pill bg-transparent transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover"
        title={PROJECT.machine}
        type="button"
      >
        <OsMark class="size-c-bar-symbol text-ink-muted" os={PROJECT.os} />
      </button>
      <span class="flex-auto"></span>
      <button
        data-slot="caw-seat"
        aria-label="Caw, lead of {PROJECT.name}"
        class="select-none press-tint grid size-(--seat) flex-none place-items-center rounded-md bg-transparent"
        style:--seat="{SEAT}px"
        type="button"
      >
        <CawFace size={48} status="ready" />
      </button>
      <div data-slot="tools" class={GLASS_CAPSULE}>
        <button
          data-bar-item
          aria-label="Ask Caw"
          class="select-none touch-hit press-tint"
          title="Ask Caw"
          type="button"
        >
          <IconAsk data-slot="bar-symbol" aria-hidden="true" />
        </button>
        <button
          data-bar-item
          aria-label="Spin off"
          class="select-none touch-hit press-tint"
          title="Spin off"
          type="button"
        >
          <IconFork data-slot="bar-symbol" aria-hidden="true" />
        </button>
        <button
          data-bar-item
          aria-label="More for {PROJECT.name}"
          class="select-none touch-hit press-tint"
          title="More"
          type="button"
        >
          <IconMore data-slot="bar-symbol" aria-hidden="true" />
        </button>
      </div>
    </header>
  {:else}
    <!-- No head: Caw stands on the page's axis, centred over what he heads
         (The Caw Stands On The Axis Rule). -->
    <div class="grid place-items-center pt-space-6 pb-space-4">
      <button
        data-slot="caw-seat"
        aria-label="Caw, lead of {PROJECT.name}"
        class="select-none press-tint grid size-(--seat) place-items-center rounded-md bg-transparent"
        style:--seat="{SEAT}px"
        type="button"
      >
        <CawFace size={48} status="ready" />
      </button>
    </div>
  {/if}
</div>
