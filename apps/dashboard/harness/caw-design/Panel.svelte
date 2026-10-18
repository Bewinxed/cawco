<script lang="ts">
  /**
   * Caw's panel in the form its frame names (`form`), never the window's,
   * with each open decision's part as its prop, each defaulting to the
   * recommended option.
   *
   * - `desk`: the kit popover at --c-panel-w by --c-caw-panel-h, its
   *   content 7px in from its drawn edge (DESIGN.md, Caw's panel).
   * - `phone`, `frame` (E): a phone's screen (PhoneScreen) with the panel
   *   as DESIGN.md's Drawer (`sheet`: full-bleed, flush on the screen's
   *   foot, 85% tall, 12px top corners, a hairline on the top edge only,
   *   over the scrim, its content 16px in and 16px plus the safe area over
   *   the foot) or hanging from his tucked glass under the top bar (`hang`:
   *   DESIGN.md, Caw's panel on the phone).
   * - `head` (A): HeadBar's A1 or A2; with A2 the thread is the
   *   conversation's first line (ThreadSwitch `row`).
   * - The message box (decided: the panel's last row): the real Composer as
   *   the panel's last grid row, an opaque shell (no glass: nothing passes
   *   under it) the inset in from the panel's edge at every window width,
   *   the body ending against it with the house's 40px edge fade at its
   *   head and foot while more is past them.
   * - `notice` stands in the foot over the message box (a can't-start row).
   * - `end`: the body scrolled this far short of its end, so its foot is
   *   drawn mid-scroll; unset, it rests at its top.
   */
  import type { ThreadSummary } from "@cawco/core";
  import type { Snippet } from "svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import type { Form } from "./form";
  import { lead } from "./lead.svelte";
  import PhoneScreen from "./PhoneScreen.svelte";
  import { PROJECT_NAME } from "./states/fixtures";
  import HeadBar from "./states/HeadBar.svelte";
  import ThreadSwitch from "./states/ThreadSwitch.svelte";

  let {
    form,
    frame = "sheet",
    head = "who",
    threads,
    current = "",
    children,
    notice,
    end,
    wide = false,
    composer = null,
    draft = new ComposerDraft(),
    extra,
  }: {
    /** The panel's form: the desk's popover or the phone's panel. */
    form: Form;
    /** On a phone: a sheet from the foot, or hanging from his tab (E). */
    frame?: "sheet" | "hang";
    /** The head (A). */
    head?: "who" | "name";
    threads: ThreadSummary[];
    current?: string;
    children?: Snippet;
    /** What stands in the foot over the message box. */
    notice?: Snippet;
    /** Scrolled this many px short of the body's end. */
    end?: number;
    /** Wide panel in the head's More menu (the resize option that puts it there). */
    wide?: boolean;
    /** The thread's message box and its hint; none where it can't stand. */
    composer?: { placeholder: string } | null;
    draft?: ComposerDraft;
    /** What stands against the panel's own box (a resize grip or edge). */
    extra?: Snippet;
  } = $props();

  const phone = $derived(form === "phone");
  const hang = $derived(phone && frame === "hang");

  let scroller = $state<HTMLElement | null>(null);
  $effect(() => {
    const box = scroller;
    if (!box || end === undefined) {
      return;
    }
    const short = end;
    const place = () => {
      box.scrollTop = box.scrollHeight - box.clientHeight - short;
    };
    place();
    document.fonts.ready.then(place);
    const watch = new ResizeObserver(place);
    for (const child of box.children) {
      watch.observe(child);
    }
    return () => watch.disconnect();
  });
</script>

{#snippet inside()}
  <HeadBar
    {current}
    {form}
    grabber={phone && !hang}
    kind={head}
    {lead}
    projectName={PROJECT_NAME}
    {threads}
    {wide}
  />
  <div class="body">
    <div
      bind:this={scroller}
      class="scroll kit-edge-fade-block"
      data-design-room
    >
      <div class="column" data-design-column>
        {#if head === "name"}
          <ThreadSwitch {current} look="row" {threads} />
        {/if}
        {@render children?.()}
      </div>
    </div>
  </div>
  {#if notice || composer}
    <div class="foot" data-design-foot>
      {@render notice?.()}
      {#if composer}
        <div class="docked" data-design-composer="dock">
          <Composer
            agentName="Caw"
            commands={[]}
            {draft}
            mentionsFrom={null}
            oninterruptsend={() => undefined}
            onmenu={() => undefined}
            onstop={() => undefined}
            onsubmit={() => undefined}
            placeholder={composer.placeholder}
            recallOf="caw-design"
          />
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

{#if phone}
  <PhoneScreen {hang}>
    <div class="panel phone-panel" data-caw-panel data-design-panel>
      {@render inside()}
    </div>
  </PhoneScreen>
{:else}
  <div
    class="kit-pop caw-float-pop panel desk"
    data-caw-panel
    data-design-form="desk"
    data-design-panel
  >
    {@render inside()}
    {@render extra?.()}
  </div>
{/if}

<style>
  /* Three rows: the head, the body that scrolls, the foot. */
  .panel {
    --lead-col: 28px;
    --inset: var(--space-2);
    --head-inset: var(--space-3);
    --safe: 0px;

    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    padding: 0;
    overflow: hidden;
  }
  .desk {
    inline-size: var(--c-panel-w);
    block-size: var(--c-caw-panel-h);
  }
  /* DESIGN.md, Drawer: full-bleed, flush on the screen's foot, 12px top
     corners, the hairline on the top edge only, 85% tall; its content 16px
     in from the sides, 16px plus the safe area over the foot. */
  .phone-panel {
    --inset: var(--space-4);
    --head-inset: var(--space-4);
    --safe: var(--home-bar);

    position: absolute;
    inset-inline: 0;
    inset-block-end: 0;
    block-size: 85cqb;
    border-block-start: 1px solid var(--border-hairline);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--surface-raised);
    box-shadow: var(--shadow-drawer);
  }
  /* Hanging (DESIGN.md, Caw's panel): its top edge on the bar's floor, its
     trailing side the screen's edge with no edge drawn there, its leading
     side the 12px margin; never taller than the room over the home bar. */
  :global(.hang) .phone-panel {
    --safe: 0px;

    inset-inline: var(--c-bar-phone-edge) 0;
    inset-block: calc(var(--status-bar) + var(--c-top-bar-h)) auto;
    block-size: min(
      var(--c-caw-panel-h),
      calc(
        100cqb - var(--status-bar) - var(--c-top-bar-h) - var(--home-bar) -
          var(--c-bar-phone-edge)
      )
    );
    border: 1px solid var(--border-control);
    border-inline-end: 0;
    border-radius: 0 0 0 var(--radius-lg);
    box-shadow: var(--shadow-overlay-hung);
  }
  /* The thread's room: the recessed field the conversation stands on. */
  .body {
    position: relative;
    display: grid;
    min-block-size: 0;
    background: var(--surface-recess);
  }
  .scroll {
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-block-size: 100%;
    padding: var(--space-4) var(--inset) var(--space-2);
    min-inline-size: 0;
  }
  /* The foot, a grid row of the panel on the body's field. */
  .foot {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
    padding: var(--space-2) var(--inset) calc(var(--inset) + var(--safe));
    background: var(--surface-recess);
  }
  /* The real Composer in the foot: its dock in the flow at the foot's
     width, no tray row over it (the panel has none), and its shell opaque:
     nothing passes under it, so it claims no glass. */
  .docked {
    --c-composer-w: 100%;
    min-inline-size: 0;
  }
  .docked :global([data-slot="dock"]) {
    position: static;
    inset: auto;
    z-index: auto;
  }
  /* Composer's own narrow-window margins (max-width 900px reads the
     window, not this frame) would stand it off the panel's inset. */
  .docked :global([data-slot="composer"]) {
    margin-inline: 0;
    width: 100%;
  }
  .docked :global([data-slot="lift"]),
  .docked :global([data-slot="dock"] > .prompts) {
    display: none;
  }
  .docked :global(.kit-dock-shell) {
    background: var(--surface-raised);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
</style>
