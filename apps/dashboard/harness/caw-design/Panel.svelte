<script lang="ts">
  /**
   * Caw's floating panel as it ships (CawFloat, d2cd27d1a): the kit popover
   * at --c-panel-w by --c-caw-panel-h on a desk, the sheet's width (the
   * viewport less --space-3 a side) on a phone. Under the proposed title bar
   * (HeadBar) the thread's recessed room, whose content stands on the
   * composer's own column (--c-composer-w, measured on the panel), and the
   * real Composer docked at its foot in a place of its own (ThreadPane's
   * composer room: the composer, its tray row and its lift), which the
   * room's scroll ends above, so nothing runs under it.
   *
   * `foot` stands where the composer would (a blocked state), or over the
   * one kept for you; `composer` is the thread's composer, its words in
   * `draft`. It takes no `suggest`: its chips stay off, as they are until
   * the hub's Jev setting answers, which a page with no hub never does.
   */
  import type { ThreadSummary } from "@cawco/core";
  import type { Snippet } from "svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { lead } from "./lead.svelte";
  import { PROJECT_NAME } from "./states/fixtures";
  import HeadBar from "./states/HeadBar.svelte";

  let {
    threads,
    current = "",
    children,
    foot,
    wide = false,
    composer = null,
    draft = new ComposerDraft(),
    extra,
  }: {
    threads: ThreadSummary[];
    current?: string;
    children?: Snippet;
    /** What stands where the composer would, or over the one kept. */
    foot?: Snippet;
    /** Wide panel in the bar's More menu (the resize option that puts it there). */
    wide?: boolean;
    /** The thread's composer: its hint, and whether the hub can carry it. */
    composer?: { placeholder: string; disabled?: boolean } | null;
    draft?: ComposerDraft;
    /** What stands against the panel's own box (a resize grip or edge). */
    extra?: Snippet;
  } = $props();
</script>

<div class="kit-pop caw-float-pop panel" data-caw-panel data-design-panel>
  <HeadBar {current} {lead} projectName={PROJECT_NAME} {threads} {wide} />
  <div class={["body", { composed: !!composer }]}>
    <div class="room" data-design-room>
      <div class="column" data-design-column>
        {@render children?.()}
      </div>
    </div>
    {#if foot}
      <div class="foot" data-design-foot>{@render foot()}</div>
    {/if}
    {#if composer}
      <div
        class={["dock", { resting: composer.disabled }]}
        data-design-composer
        inert={composer.disabled}
      >
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
  {@render extra?.()}
</div>

<style>
  /* CawFloat's `.kit-pop.caw-float-pop`: a conversation's width, edge to
     edge inside, clipped by the popover's radius; the sheet's width on a
     phone (CawFloat `.caw-float-sheet`: --space-3 in from each side). */
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    inline-size: var(--c-panel-w);
    block-size: var(--c-caw-panel-h);
    padding: 0;
    overflow: hidden;

    @media (width < 640px) {
      inline-size: 100%;
      block-size: min(var(--c-caw-panel-h), 85dvh);
    }
  }
  /* ThreadPane `.pane` and `.body`: the recessed room the composer docks in.
     It is the size container its column is measured on. */
  .body {
    container: room / inline-size;
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
    background: var(--surface-recess);
  }
  /* The composer's own place at the foot, outside the room's scroll: the
     composer, its tray row over it and its lift (ThreadPane's composer
     room), so no line of the room ever runs under it. The lift is the
     Composer's own: --space-4, and --space-2 up to 900px wide. */
  .composed {
    --lift: var(--space-4);
    padding-block-end: calc(
      var(--c-composer-panel) + var(--c-tray-row) + var(--lift)
    );

    @media (max-width: 900px) {
      --lift: var(--space-2);
    }
  }
  /* The composer's column, as Composer sets it: --c-composer-w (min(720px,
     100% − 50px)), and up to 900px wide the whole room less --space-3 a
     side. Taken on the room rather than the scroller, so a scrollbar never
     moves its start edge off the composer's. */
  .room,
  .foot {
    --column: min(720px, calc(100cqi - 50px));

    @media (max-width: 900px) {
      --column: calc(100cqi - var(--space-3) * 2);
    }
  }
  .room {
    flex: 1 1 auto;
    min-block-size: 0;
    padding-block: var(--space-4);
    padding-inline-start: calc((100cqi - var(--column)) / 2);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    inline-size: var(--column);
    min-inline-size: 0;
  }
  /* Where the composer stands when there is none (ThreadPane `.off`), or
     over the kept one, on its column and lift. */
  .foot {
    flex: none;
    inline-size: var(--column);
    margin-inline-start: calc((100cqi - var(--column)) / 2);
    padding-block-end: var(--space-4);
  }
  /* The composer's layer (ThreadPane `.composer-dock`): over the room,
     taking no press but the composer's own. */
  .dock {
    position: absolute;
    inset: 0;
    z-index: 1;
    pointer-events: none;
  }
  .resting {
    opacity: 0.5;
  }
</style>
