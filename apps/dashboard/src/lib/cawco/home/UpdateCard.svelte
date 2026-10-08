<script lang="ts">
  /**
   * An update the person has not seen, left on Home until they dismiss it:
   * the title, the release notes as their sections and lists, and Dismiss, with Reload
   * beside it when this tab is older than the dashboard the update brought.
   * Nothing installs from here. The card recipe is NeedsCard's.
   *
   * Reload turns the card into its goodbye (../updates/goodbye): Caw at the
   * toast's size, waiting on his `loading`, beside "See you in a bit", and
   * nothing else, until the tab goes. The card is a `reflow` box, so its
   * edge travels to the goodbye's height and what is under it follows.
   */
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { arrive, GOODBYE, leaveInPlace } from "../updates/goodbye";
  import type { Notice } from "../updates/model";
  import ReleaseNotes from "../updates/ReleaseNotes.svelte";
  import Caw from "./Caw.svelte";
  import CawMark from "./CawMark.svelte";

  let {
    notice,
    ondismiss,
    onreload,
  }: {
    /** Null only once Reload was chosen and the acknowledgement dropped it: the goodbye needs none. */
    notice: Notice | null;
    ondismiss: () => void;
    /** Given while this tab is older than the dashboard serving it. */
    onreload?: () => void;
  } = $props();

  /** Reload was chosen: the card says its goodbye until the tab goes. */
  let leaving = $state(false);
  let card = $state<HTMLElement>();
  let layer = $state<HTMLElement>();

  function reload(reloadNow: () => void): void {
    if (card && layer) {
      const away = layer;
      leaveInPlace(
        [...card.children].filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child !== away
        ),
        away
      );
    }
    leaving = true;
    reloadNow();
  }
</script>

<article
  aria-label={leaving ? GOODBYE : notice?.title}
  class="card"
  data-flip="box"
  bind:this={card}
>
  <!-- What the card showed, copied where it stood, leaving. -->
  <div aria-hidden="true" class="leaving" inert bind:this={layer}></div>
  {#if leaving}
    <div class="bye">
      <!-- His wait: the page can't show its content until the tab is back. -->
      <div aria-hidden="true" class="caw">
        {#if motionOk.current}
          <Caw size={48} status="loading" />
        {:else}
          <CawMark size={48} status="loading" />
        {/if}
      </div>
      <span class="line" {@attach arrive}>{GOODBYE}</span>
    </div>
  {:else if notice}
    <h2 class="title">{notice.title}</h2>
    {#if notice.notes}
      <div class="notes"><ReleaseNotes source={notice.notes.full} /></div>
    {/if}
    <div class="actions">
      <Button onclick={ondismiss} size="sm" variant="secondary">Dismiss</Button>
      {#if onreload}
        <Button onclick={() => reload(onreload)} size="sm">Reload</Button>
      {/if}
    </div>
  {/if}
</article>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .leaving {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .title {
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .notes {
    font: var(--type-body);
    color: var(--ink-row);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
  /* The goodbye: Caw at the toast's size, the one line beside him. */
  .bye {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .caw {
    flex: none;
    inline-size: 48px;
    block-size: 48px;
  }
  .line {
    font: var(--type-label);
    color: var(--ink-strong);
  }
</style>
