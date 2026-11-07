<script lang="ts">
  /**
   * The composer grown for find (frame, shaping only): Command-F, or Find
   * in Attach's menu, grows the pill a find field on its top, the words
   * and the place, Previous, Next and Close; the message being written
   * stays where it is under it, the caret free to go back to it. Close,
   * Escape or Command-F again folds the find field back into the pill and
   * leaves the conversation at the place found; Back where you were takes
   * it back to where it was being read.
   *
   * The pill's edge moves on `morph()`, the field unfolds (`unfold`): a
   * press plays it, a key lands it (The Frequency Rule, motion/keyed).
   */
  import type { Snippet } from "svelte";
  import { crossIn, crossOut, rise } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { dockShellVariants } from "#lib/components/ui/dock-shell/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconArrowDownDuotone,
    IconChevronDown,
    IconChevronUp,
    IconClose,
    IconListRows,
    IconPlus,
    IconSearch,
    IconSend,
  } from "#lib/icons.js";
  import AttachItems from "./AttachItems.svelte";

  let {
    box,
    finding,
    words,
    placeNo,
    total,
    draft,
    narrow = false,
    listOpen = false,
    back = false,
    field = $bindable(null),
    message = $bindable(null),
    onopen,
    onclose,
    onstep,
    onlist,
    onback,
    layer,
  }: {
    /** Where the conversation's own composer stands: the pill takes its place. */
    box: { x: number; y: number; w: number; h: number };
    finding: boolean;
    words: string;
    placeNo: number;
    total: number;
    draft: string;
    /** A phone or Caw's panel: the places are the composer's layer, opened from the count. */
    narrow?: boolean;
    listOpen?: boolean;
    /** Find has just closed somewhere else in the conversation: the way back. */
    back?: boolean;
    field?: HTMLInputElement | null;
    message?: HTMLInputElement | null;
    onopen: () => void;
    onclose: () => void;
    onstep: (by: 1 | -1) => void;
    onlist: () => void;
    onback: () => void;
    /** What rises out of the composer over the transcript's foot: the places, narrow. */
    layer?: Snippet;
  } = $props();

  let attachOpen = $state(false);
  const none = $derived(total === 0);
</script>

<div
  class="fixed start-(--pill-x) bottom-(--pill-bottom) w-(--pill-w) z-(--layer-float)"
  style:--pill-x="{box.x}px"
  style:--pill-bottom="calc(100dvh - {box.y + box.h}px)"
  style:--pill-w="{box.w}px"
>
  {#if back && !finding}
    <!-- Jump to latest, as find leaves it: the way back to where the
         conversation was being read when find opened. -->
    <button
      class="select-none mark-line pressable absolute bottom-full start-1/2 -translate-x-1/2 mb-space-3 inline-flex items-center gap-space-2 h-c-btn-h-sm py-0 px-space-3 border border-border-hairline rounded-md bg-surface-raised shadow-overlay text-size-label font-medium text-ink-strong whitespace-nowrap hover:bg-surface-hover"
      onclick={onback}
      type="button"
      in:rise={"--dur-panel"}
      out:rise={"--dur-exit"}
    >
      <IconArrowDownDuotone class="size-icon-md" data-box /><span
        >Back where you were</span
      >
    </button>
  {/if}
  {#if finding && narrow && listOpen && layer}
    <div
      class="absolute inset-x-0 bottom-full mb-space-2 flex flex-col"
      in:rise={"--dur-panel"}
      out:rise={"--dur-exit"}
    >
      {@render layer()}
    </div>
  {/if}
  <form
    data-find-frame
    data-finding={finding || undefined}
    class={dockShellVariants({
      class:
        "flex flex-col py-(--cin-pad) pe-(--cin-pad) ps-space-3 [--cin-pad:var(--c-composer-inset)]",
    })}
    aria-label="Message the agent"
    onsubmit={(event) => {
      event.preventDefault();
    }}
    {@attach morph()}
  >
    {#if finding}
      <!-- The find field, grown on the pill's top: its own line, a hairline
           under it, the message's line where it was. -->
      <!-- mark-line: the glyph leads a field, not words; the field sets its own line. -->
      <div
        class="flex items-center gap-space-2 pb-(--cin-pad) mb-(--cin-pad) border-b border-b-border-hairline"
        transition:unfold
      >
        <IconSearch
          class="flex-none size-icon-md text-ink-muted"
          aria-hidden="true"
        />
        <input
          bind:this={field}
          class="flex-1 min-w-0 h-c-btn-h border-none p-0 bg-transparent type-body text-ink-strong caret-brand-solid placeholder:text-ink-subtle outline-none"
          aria-label="Find in this conversation"
          placeholder="Find in this conversation"
          value={words}
          onkeydown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onstep(event.shiftKey ? -1 : 1);
            }
          }}
          in:crossIn
          out:crossOut
        />
        {#if narrow}
          <!-- Narrow, the place opens the places over the conversation. -->
          <!-- mark-line: a control's glyph and its count, centred in the control's box. -->
          <button
            class="select-none inline-flex items-center gap-space-1 h-c-btn-h px-space-2 border-none rounded-md bg-transparent type-label text-ink-muted tabular-nums aria-expanded:bg-surface-fill aria-expanded:text-ink-strong hover:not-aria-expanded:bg-surface-hover disabled:opacity-50"
            aria-expanded={listOpen}
            aria-label={none
              ? "No places"
              : `Place ${placeNo} of ${total}: the places`}
            disabled={none}
            onclick={onlist}
            type="button"
            ><IconListRows class="size-icon-md" data-box /><span class="num"
              >{none ? "0" : `${placeNo} of ${total}`}</span
            ></button
          >
        {:else}
          <span
            class="num flex-none type-label text-ink-muted tabular-nums"
            aria-live="polite">{none ? "0" : `${placeNo} of ${total}`}</span
          >
        {/if}
        <div class="flex flex-none items-center">
          <button
            class="select-none grid place-items-center size-c-btn-h border-none rounded-md bg-transparent text-ink-muted hover:not-active:bg-surface-hover active:bg-surface-fill disabled:opacity-50"
            aria-label="Previous place"
            disabled={none}
            onclick={() => onstep(-1)}
            title="Previous place"
            type="button"><IconChevronUp class="size-icon-md" /></button
          >
          <button
            class="select-none grid place-items-center size-c-btn-h border-none rounded-md bg-transparent text-ink-muted hover:not-active:bg-surface-hover active:bg-surface-fill disabled:opacity-50"
            aria-label="Next place"
            disabled={none}
            onclick={() => onstep(1)}
            title="Next place"
            type="button"><IconChevronDown class="size-icon-md" /></button
          >
          <button
            class="select-none grid place-items-center size-c-btn-h border-none rounded-md bg-transparent text-ink-muted hover:not-active:bg-surface-hover active:bg-surface-fill"
            aria-keyshortcuts="Escape"
            aria-label="Close find"
            onclick={onclose}
            title="Close find"
            type="button"><IconClose class="size-icon-md" /></button
          >
        </div>
      </div>
    {/if}
    <!-- The message being written, where it was: find never sets it aside. -->
    <div class="flex items-center gap-space-2">
      <input
        bind:this={message}
        class="flex-1 min-w-0 h-c-composer-field border-none p-0 bg-transparent type-body text-ink-strong caret-brand-solid placeholder:text-ink-subtle outline-none"
        aria-label="Message"
        placeholder="Message the agent… / for commands, @ to mention"
        value={draft}
      />
      <DropdownMenu.Root bind:open={attachOpen}>
        <DropdownMenu.Trigger
          aria-label="Attach, draw or find"
          look="attach"
          title="Attach, draw or find"
        >
          <IconPlus class="size-icon-md" />
        </DropdownMenu.Trigger>
        <AttachItems onfind={onopen} />
      </DropdownMenu.Root>
      <button
        class="select-none grid size-c-composer-field flex-none pressable place-items-center concentric-xs border-0 bg-(image:--action-surface) bg-action-solid text-on-action [&_svg]:size-icon-md"
        aria-label="Send"
        title="Send"
        type="button"
      >
        <IconSend />
      </button>
    </div>
  </form>
</div>
