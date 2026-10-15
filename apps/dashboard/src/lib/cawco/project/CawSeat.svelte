<script lang="ts">
  /**
   * Caw in the project's head: the page's one live Caw, at 48px, as a
   * button. A press opens his panel, the conversation with him (CawThread),
   * floating over the page in the kit popover, and a second press puts it
   * away; on touch it is the kit's bottom sheet. A press outside, or
   * Escape, closes it too. A starter pressed on the empty board opens it
   * with the starter's words in its composer (`lead.ask`). Off, he sleeps
   * between your words: no event wakes him.
   */
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { cawLoop } from "#lib/cawco/feel.svelte.js";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import { land } from "#lib/cawco/motion/share.svelte.js";
  import type { Starter } from "#lib/cawco/project-tasks.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import CawThread from "./CawThread.svelte";
  import { type CawLead, HEAD_NEXT } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
    starters,
    size = 48,
  }: {
    lead: CawLead;
    projectId: string;
    projectName: string;
    /** The project's starters, offered under him in his panel. */
    starters: Starter[];
    size?: number;
  } = $props();

  const touch = new MediaQuery(
    "(hover: none), (pointer: coarse), (max-width: 640px)"
  );
  let open = $state(false);
  let anchor = $state<HTMLButtonElement | null>(null);

  /** He holds his still: idle, the done hold, and working when his loop is off. */
  const still = $derived(
    lead.holds || (lead.status === "working" && !cawLoop.on)
  );

  /**
   * The panel was opened by the pointer. Closing it gives focus back to Caw
   * without the focus ring: a ring is for a reader on the keyboard, and one
   * left on him at rest reads as a state he is in.
   */
  let byPointer = false;

  function press(event: MouseEvent) {
    // A click from Enter or Space has no pointer behind it (detail 0).
    byPointer = event.detail > 0;
    open = !open;
  }

  // Asked open from outside (a starter on the empty board).
  let askedSeen = untrack(() => lead.asked);
  $effect(() => {
    const { asked } = lead;
    if (asked !== askedSeen) {
      askedSeen = asked;
      byPointer = true;
      open = true;
    }
  });
</script>

<button
  aria-expanded={open}
  aria-haspopup="dialog"
  aria-label="Caw, lead of {projectName}. {lead.sentence}"
  class="caw-seat press-tint"
  data-share="caw:{projectId}"
  onclick={press}
  type="button"
  bind:this={anchor}
  style:--seat="{size}px"
  {@attach land(() => `caw:${projectId}`, { uniform: true })}
>
  {#if lead.shown}
    <Caw next={HEAD_NEXT} {size} status={lead.status} {still} />
  {/if}
</button>

{#if touch.current}
  <Drawer.Root
    onOpenChange={(next) => {
      open = next;
    }}
    {open}
  >
    <Drawer.Content class="caw-thread-sheet">
      <Drawer.Title class="sr-only">Caw, lead of {projectName}</Drawer.Title>
      <CawThread {lead} {projectId} {projectName} {starters} />
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Popover.Root
    onOpenChange={(next) => {
      open = next;
    }}
    {open}
  >
    <Popover.Content
      align="start"
      aria-label="Caw, lead of {projectName}"
      class="caw-thread-pop"
      collisionPadding={12}
      customAnchor={anchor}
      onCloseAutoFocus={(event) => {
        if (byPointer) {
          event.preventDefault();
          anchor?.focus({ focusVisible: false } as FocusOptions);
        }
      }}
      onInteractOutside={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest(".caw-seat")
        ) {
          event.preventDefault();
        }
      }}
      side="bottom"
      sideOffset={4}
    >
      <CawThread {lead} {projectId} {projectName} {starters} />
    </Popover.Content>
  </Popover.Root>
{/if}

<style>
  /* His still's box is the button; his acting spills past it, unclipped,
     and never takes the pointer (Caw.svelte). */
  .caw-seat {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--seat);
    block-size: var(--seat);
    padding: 0;
    border: 0;
    border-radius: var(--radius-md);
    background: transparent;
    cursor: pointer;
  }
  /* His panel floats over the page at Caw's panel's width (c-panel-w),
     as tall as the room under him allows up to a conversation's height;
     its content runs edge to edge. */
  :global(.kit-pop.caw-thread-pop) {
    display: flex;
    inline-size: var(--c-panel-w);
    block-size: min(
      40rem,
      calc(var(--bits-popover-content-available-height, 85dvh) - 2px)
    );
    padding: 0;
    overflow: hidden;
  }
  /* In the sheet: the sheet's height, less its grab. */
  :global(.caw-thread-sheet) {
    display: flex;
    flex-direction: column;
    block-size: 85dvh;
    padding-block-end: var(--safe-bottom);
  }
</style>
