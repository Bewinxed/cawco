<script lang="ts">
  /**
   * Caw's panel (CawThread) on the project's page. One panel for the page,
   * opened from whichever seat stands (CawSeat, its `lead.anchor`), the
   * same whether the board is empty or full, so it never jumps between the
   * two and never covers a column of the board or the head.
   *
   * Wider than a phone it is docked: a column of its own beside the page,
   * a conversation's width (--c-panel-w), where the page has the room for
   * both; a row of its own under the page, the column's width, where it has
   * not (the page's grid places it, `.caw-docked`). The page yields it that
   * room, so whatever Caw files lands on a board that stays in sight. It is
   * the card recipe (DESIGN.md, Cards: 12px radius, raised surface, the tile
   * shadow, no border). Drawn, it puts the caret in its composer where a
   * keyboard is at hand. Escape inside it, or a press on his seat, puts it
   * away; a press elsewhere on the page is the page's.
   *
   * On a phone it is the kit's bottom sheet (DESIGN.md, Drawer): full-bleed,
   * flush on the screen's foot, its grabber, then the panel. A press outside,
   * Escape or a drag down puts it away.
   */
  import type { Attachment } from "svelte/attachments";
  import { MediaQuery } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
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
   * Docked: drawn, the caret goes to his composer (on touch it would raise
   * the screen's keyboard over the page); an Escape that nothing inside it
   * took puts it away, the focus back on his seat without the ring (a ring
   * left on him at rest reads as a state he is in).
   */
  const dock: Attachment<HTMLElement> = (node) => {
    if (fine.current) {
      lead.draft.focusWanted = true;
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }
      event.preventDefault();
      lead.open = false;
      lead.anchor?.focus({ focusVisible: false } as FocusOptions);
    };
    node.addEventListener("keydown", onEscape);
    return () => node.removeEventListener("keydown", onEscape);
  };
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
{:else if open}
  <aside
    aria-label="Caw, lead of {projectName}"
    class="caw-dock"
    data-caw-dock
    {@attach dock}
  >
    {#key projectId}
      <CawThread {lead} {projectId} {projectName} />
    {/key}
  </aside>
{/if}

<style>
  /* The card recipe, its content edge to edge and clipped by its radius; it
     fills the place the page's grid gives it. It comes in as a sheet does,
     from its own side by --pop-rise as it fades, over --dur-panel on the
     drawer curve; with less motion it only fades. */
  .caw-dock {
    grid-area: dock;
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    min-inline-size: 0;
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    transition:
      opacity var(--dur-panel) var(--ease-drawer),
      translate var(--dur-panel) var(--ease-drawer);

    @starting-style {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .caw-dock {
      @starting-style {
        translate: var(--pop-rise) 0;
      }
    }
  }
  /* css-scope .caw-float-sheet: the kit sheet this component opens */
  /* The kit's bottom sheet as its recipe draws it (ui/drawer): full-bleed
     and flush on the screen's foot, its top corners rounded, its hairline
     along the top edge. The panel runs edge to edge inside it, from under
     the grabber to the foot, which keeps the safe area clear itself
     (ThreadPane's docked composer). */
  :global([data-slot="drawer-content"].caw-float-sheet) {
    --drawer-max-height: 85dvh;
    block-size: 85dvh;
    padding: 0;
  }
  .sheet-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    overflow: hidden;
  }
</style>
