<script lang="ts">
  /**
   * Caw in the project's head: the page's one live Caw, at 48px, as a
   * button. A press opens his panel and keeps it; a pointer resting on him
   * for 350ms opens it too, and it closes 250ms after the pointer leaves
   * both him and the panel, as a session tab's details card does
   * (PaneTabs). On touch the panel is a bottom sheet. Off, he sleeps; the
   * panel holds the switch that wakes him.
   */
  import { MediaQuery } from "svelte/reactivity";
  import { cawLoop } from "#lib/cawco/feel.svelte.js";
  import Caw from "#lib/cawco/home/Caw.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import CawPanel from "./CawPanel.svelte";
  import { type CawLead, HEAD_NEXT } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
    size = 48,
  }: {
    lead: CawLead;
    projectId: string;
    projectName: string;
    size?: number;
  } = $props();

  const touch = new MediaQuery(
    "(hover: none), (pointer: coarse), (max-width: 640px)"
  );
  let open = $state(false);
  let pinned = $state(false);
  let anchor = $state<HTMLButtonElement | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** He holds his still: idle, the done hold, and working when his loop is off. */
  const still = $derived(
    lead.holds || (lead.status === "working" && !cawLoop.on)
  );

  function close() {
    clearTimeout(timer);
    open = false;
    pinned = false;
  }
  function rest(event: PointerEvent) {
    if (touch.current || event.pointerType !== "mouse" || pinned) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      open = true;
    }, 350);
  }
  function leave() {
    clearTimeout(timer);
    if (!pinned) {
      timer = setTimeout(close, 250);
    }
  }
  function press() {
    clearTimeout(timer);
    if (open && pinned) {
      close();
      return;
    }
    open = true;
    pinned = true;
  }
  $effect(() => () => clearTimeout(timer));
</script>

<button
  aria-expanded={open}
  aria-haspopup="dialog"
  aria-label="Caw, lead of {projectName}. {lead.sentence}"
  class="caw-seat press-tint"
  data-share="caw:{projectId}"
  onclick={press}
  onpointerenter={rest}
  onpointerleave={leave}
  type="button"
  bind:this={anchor}
  style:--seat="{size}px"
>
  {#if lead.shown}
    <Caw next={HEAD_NEXT} {size} status={lead.status} {still} />
  {/if}
</button>

{#if touch.current}
  <Drawer.Root
    onOpenChange={(next) => {
      if (!next) {
        close();
      }
    }}
    {open}
  >
    <Drawer.Content class="caw-sheet">
      <Drawer.Title class="sr-only">Caw, lead of {projectName}</Drawer.Title>
      <CawPanel {lead} {projectId} {projectName} />
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Popover.Root
    onOpenChange={(next) => {
      if (!next) {
        close();
      }
    }}
    {open}
  >
    <Popover.Content
      align="start"
      aria-label="Caw, lead of {projectName}"
      class="caw-pop"
      collisionPadding={12}
      customAnchor={anchor}
      onfocusin={() => {
        clearTimeout(timer);
        pinned = true;
      }}
      onInteractOutside={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest(".caw-seat")
        ) {
          event.preventDefault();
        }
      }}
      onOpenAutoFocus={(event) => {
        if (!pinned) {
          event.preventDefault();
        }
      }}
      onpointerdowncapture={() => {
        clearTimeout(timer);
        pinned = true;
      }}
      onpointerenter={() => clearTimeout(timer)}
      onpointerleave={leave}
      side="bottom"
      sideOffset={6}
      trapFocus={pinned}
    >
      <CawPanel {lead} {projectId} {projectName} />
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
  :global(.caw-pop) {
    inline-size: auto;
    padding: 0;
  }
  :global(.caw-sheet) {
    padding-block-end: env(safe-area-inset-bottom);
  }
</style>
