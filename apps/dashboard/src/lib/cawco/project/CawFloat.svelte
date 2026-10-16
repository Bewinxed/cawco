<script lang="ts">
  /**
   * Caw's panel (CawThread), floating over the project's page: the page
   * keeps its width and its scroll under it, nothing beside it moves. One
   * panel for the page, opened from whichever seat stands (CawSeat, its
   * `lead.anchor`), so it moves to the head with him when he sits down.
   *
   * Wider than a phone it is the kit popover under his seat, a conversation's width
   * (--c-panel-w) and as tall as the room under him allows, up to
   * --c-caw-panel-h; opening puts the caret in its composer. On a phone it is
   * the kit's bottom sheet, laid out as the phone's views bar is (ViewBar):
   * rising from the foot over the page, --space-3 in from each side and
   * --space-4 over the foot, on the composer's glass (app.css
   * `.kit-dock-shell`). A press outside, or Escape, puts it away; a press
   * on his seat does too, and only once.
   */
  import { MediaQuery } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import CawThread from "./CawThread.svelte";
  import type { CawLead } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
  }: { lead: CawLead; projectId: string; projectName: string } = $props();

  /** A phone: the page is one scroller with the views bar at its foot (ViewBar's line). */
  const phone = new MediaQuery("(max-width: 639px)");
  const fine = new MediaQuery("(hover: hover) and (pointer: fine)");
  const open = $derived(lead.open && lead.anchor !== null);
  const setOpen = (next: boolean) => {
    lead.open = next;
  };
  /**
   * A press on a seat is the seat's own toggle, and a press on a starter
   * that asks him (`data-caw-asks`, lead.ask) puts its words in the panel:
   * neither is a press outside.
   */
  const onSeat = (target: EventTarget | null) =>
    target instanceof Element &&
    target.closest(".caw-seat, [data-caw-asks]") !== null;
</script>

{#if phone.current}
  <Drawer.Root onOpenChange={setOpen} {open}>
    <Drawer.Content class="caw-float-sheet">
      <Drawer.Title class="sr-only">Caw, lead of {projectName}</Drawer.Title>
      <div class="sheet-body">
        {#key projectId}
          <CawThread {lead} {projectId} {projectName} />
        {/key}
      </div>
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Popover.Root onOpenChange={setOpen} {open}>
    <Popover.Content
      align="start"
      aria-label="Caw, lead of {projectName}"
      class="caw-float-pop"
      collisionPadding={12}
      customAnchor={lead.anchor}
      onCloseAutoFocus={(event) => {
        // Focus goes back to him without the ring: a ring left on him at
        // rest reads as a state he is in.
        event.preventDefault();
        lead.anchor?.focus({ focusVisible: false } as FocusOptions);
      }}
      onInteractOutside={(event) => {
        if (onSeat(event.target)) {
          event.preventDefault();
        }
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        // The caret in his composer, where a keyboard is at hand: on touch
        // it would raise the screen's keyboard over the page.
        if (fine.current) {
          lead.draft.focusWanted = true;
        }
      }}
      side="bottom"
      sideOffset={4}
      trapFocus={false}
    >
      {#key projectId}
        <CawThread {lead} {projectId} {projectName} />
      {/key}
    </Popover.Content>
  </Popover.Root>
{/if}

<style>
  /* css-scope .caw-float-pop: the kit popover this component opens */
  /* A conversation's width, as tall as the room under his seat allows up to
     the panel's height; its content runs edge to edge, the well clipped by
     the popover's radius. */
  :global(.kit-pop.caw-float-pop) {
    display: flex;
    inline-size: var(--c-panel-w);
    block-size: min(
      var(--c-caw-panel-h),
      calc(var(--bits-popover-content-available-height, 85dvh) - 2px)
    );
    padding: 0;
    overflow: hidden;
  }
  /* css-scope .caw-float-sheet: the kit sheet this component opens */
  /* The views bar's place (ViewBar `.view-dock`): --space-3 in from each
     side, --space-4 over the foot and its safe area. The sheet's surface
     (its ::before) is the composer's shell: the panel's glass, the control
     edge all round, the 12px radius and the tile shadow. */
  :global([data-slot="drawer-content"].caw-float-sheet) {
    --drawer-max-height: 85dvh;
    inset-inline: var(--space-3);
    block-size: 85dvh;
    padding: 0 0 calc(var(--space-4) + var(--safe-bottom));
  }
  :global([data-slot="drawer-content"].caw-float-sheet)::before {
    inset: 0 0 calc(var(--space-4) + var(--safe-bottom));
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--material-panel);
    -webkit-backdrop-filter: blur(var(--material-blur))
      saturate(var(--material-saturate));
    backdrop-filter: blur(var(--material-blur))
      saturate(var(--material-saturate));
    box-shadow: var(--shadow-tile);

    @media (prefers-reduced-transparency: reduce) {
      background: var(--surface-raised);
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }
  /* The panel inside the shell, under the grab, clipped by its radius. */
  .sheet-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    overflow: hidden;
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
  }
</style>
