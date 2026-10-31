<script lang="ts">
  /**
   * The panel's one bar (DESIGN.md, The Title Bars Follow Liquid Glass
   * Rule): leading, the component under review as a menu; centre, what the
   * structure puts there (its way of seeing); trailing, bare symbols for the
   * view settings, Adjust, Comment and the remarks, then the structure's one
   * prominent action where it has one. View settings and Adjust are
   * popovers (Xcode Previews' Device Settings): changed a few times a visit,
   * they earn no permanent width beside the component.
   */
  import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
  import type { Snippet } from "svelte";
  import GlassGroup from "#lib/cawco/preview/graph/GlassGroup.svelte";
  import { SYMBOL } from "#lib/cawco/preview/graph/symbol.js";
  import PinMark from "#lib/cawco/preview/PinMark.svelte";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconChat, IconChevronDown, IconPin } from "#lib/icons.js";
  import Adjust from "./Adjust.svelte";
  import type { Judge } from "./judge.svelte";
  import { COMPONENT_NAME, stateOf } from "./review.svelte";
  import ViewSettings from "./ViewSettings.svelte";

  let {
    judge,
    centre,
    action,
    compact = false,
  }: {
    judge: Judge;
    /** The structure's way of seeing, in the bar's middle. */
    centre?: Snippet;
    /** The structure's one prominent action. */
    action?: Snippet;
    /** A phone's bar: View settings and Adjust leave it for the foot. */
    compact?: boolean;
  } = $props();

  const open = $derived(judge.remarks.length);
</script>

<header
  class="flex h-c-top-bar-h flex-none items-center gap-space-2 px-space-3"
  data-proto-bar
>
  <GlassGroup class="min-w-0" label={words.components}>
    <DropdownMenu.Root>
      <!-- Its own layer over the group's glass, as the group's symbols stand. -->
      <span class="relative flex min-w-0">
        <DropdownMenu.Trigger face="title">
          <span
            data-box
            class="mark-line inline-flex min-w-0 items-center gap-space-1 whitespace-nowrap"
          >
            <span class="overflow-clip text-ellipsis whitespace-nowrap"
              >{COMPONENT_NAME}</span
            >
            <IconChevronDown class="size-icon-sm flex-none text-ink-muted" />
          </span>
        </DropdownMenu.Trigger>
      </span>
      <DropdownMenu.Content align="start">
        <DropdownMenu.Label>{words.components}</DropdownMenu.Label>
        <DropdownMenu.Item>
          <span class="flex-1">{COMPONENT_NAME}</span>
          <span class="type-meta text-ink-subtle"
            >{words.openRemarks(open)}</span
          >
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </GlassGroup>
  <div class="flex min-w-0 flex-1 justify-center">
    {@render centre?.()}
  </div>
  <GlassGroup class="flex-none" label={words.viewSettings}>
    {#if !compact}
      <ViewSettings {judge} />
      <Adjust {judge} />
    {/if}
    <button
      aria-label={words.commentTip}
      aria-pressed={judge.commenting}
      class={SYMBOL}
      onclick={() => {
        judge.commenting = !judge.commenting;
      }}
      title={words.commentTip}
      type="button"><IconPin /></button
    >
    <Popover.Root>
      <Popover.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            aria-label="{words.remarks}, {words.openRemarks(open)}"
            class="{SYMBOL} mark-line w-auto grid-flow-col gap-space-1 px-space-2"
            title={words.remarks}
            type="button"
            ><IconChat />{#if open > 0}<span
                class="type-label text-ink-strong tabular-nums">{open}</span
              >{/if}</button
          >
        {/snippet}
      </Popover.Trigger>
      <Popover.Content align="end" width="widest">
        <div class="flex flex-col gap-space-2 p-space-1" data-remarks>
          {#if judge.remarks.length === 0}
            <p class="m-0 type-body text-ink-muted">{words.nothingMarked}</p>
          {/if}
          {#each judge.remarks as remark (remark.id)}
            <button
              class="flex w-full items-start gap-space-2 rounded-sm p-space-2 text-start hover:bg-surface-hover focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
              onclick={() => judge.go(remark.story)}
              type="button"
            >
              <PinMark number={remark.id} />
              <span class="flex min-w-0 flex-col gap-space-row">
                <span class="type-label text-ink-row"
                  >{stateOf(remark.story).name} · {remark.element}</span
                >
                <span class="line-clamp-2 type-body text-ink-strong"
                  >{remark.words}</span
                >
                <span class="type-meta text-ink-subtle"
                  >{words.onState(judge.pathOf(remark))}</span
                >
              </span>
            </button>
          {/each}
        </div>
      </Popover.Content>
    </Popover.Root>
  </GlassGroup>
  {@render action?.()}
</header>
