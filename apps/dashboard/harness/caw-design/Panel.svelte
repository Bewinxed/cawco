<script lang="ts">
  /**
   * Caw's floating panel as it ships (CawFloat), in the form its frame
   * names (`form`), never the window's:
   *
   * - `desk`: the kit popover at --c-panel-w by --c-caw-panel-h.
   * - `phone`: a 390 × 844 phone's screen with the sheet CawFloat opens on
   *   it (`.caw-float-sheet`): --space-3 in from each side, --space-4 over
   *   the foot, 85% of the screen tall, the composer's shell for a surface,
   *   over the kit's scrim.
   *
   * Inside, under the proposed title bar (HeadBar), the thread's recessed
   * room, whose content stands on the composer's own column, and the real
   * Composer docked at its foot in a place of its own (ThreadPane's
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
  import type { Form } from "./form";
  import { lead } from "./lead.svelte";
  import { PROJECT_NAME } from "./states/fixtures";
  import HeadBar from "./states/HeadBar.svelte";

  let {
    form,
    threads,
    current = "",
    children,
    foot,
    wide = false,
    composer = null,
    draft = new ComposerDraft(),
    extra,
  }: {
    /** The panel's form: the desk's popover or the phone's sheet. */
    form: Form;
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

{#snippet inside()}
  <HeadBar
    {current}
    {form}
    {lead}
    projectName={PROJECT_NAME}
    {threads}
    {wide}
  />
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
{/snippet}

{#if form === "phone"}
  <div class="screen" data-design-form="phone" data-design-screen>
    <div
      class="sheet panel"
      data-caw-panel
      data-design-form="phone"
      data-design-panel
    >
      {@render inside()}
    </div>
  </div>
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
  /* CawFloat's `.kit-pop.caw-float-pop`: a conversation's width, edge to
     edge inside, clipped by the popover's radius. */
  .panel {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;

    /* The composer's column, as Composer sets it on a desk: --c-composer-w
       (min(720px, 100% − 50px)). */
    --column: min(720px, calc(100cqi - 50px));
  }
  .desk {
    inline-size: var(--c-panel-w);
    block-size: var(--c-caw-panel-h);
  }
  /* A 390 × 844 phone's screen, the kit's scrim over the page. */
  .screen {
    container: screen / size;
    position: relative;
    inline-size: 390px;
    block-size: 844px;
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--surface-page);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
  .screen::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--scrim);
  }
  /* CawFloat `.caw-float-sheet` on it: --space-3 in from each side,
     --space-4 over the foot, 85% of the screen tall less that foot; its
     surface the composer's shell (the panel's glass, the control edge all
     round, the 12px radius and the tile shadow). Up to 900px wide the
     composer runs the room less --space-3 a side (Composer), so its column
     does too. */
  .sheet {
    position: absolute;
    inset-inline: var(--space-3);
    inset-block-end: var(--space-4);
    block-size: calc(85cqb - var(--space-4));
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--material-panel);
    -webkit-backdrop-filter: blur(var(--material-blur))
      saturate(var(--material-saturate));
    backdrop-filter: blur(var(--material-blur))
      saturate(var(--material-saturate));
    box-shadow: var(--shadow-tile);

    --column: calc(100cqi - var(--space-3) * 2);

    @media (prefers-reduced-transparency: reduce) {
      background: var(--surface-raised);
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
     Composer's own, --space-4 on a desk and --space-2 on a phone, and the
     Composer picks it by the window's width, not the frame's: the room
     keeps the larger, so the box never stands over a line in either. */
  .composed {
    padding-block-end: calc(
      var(--c-composer-panel) + var(--c-tray-row) + var(--space-4)
    );
  }
  /* Taken on the room rather than the scroller, so a scrollbar never moves
     its start edge off the composer's. */
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
