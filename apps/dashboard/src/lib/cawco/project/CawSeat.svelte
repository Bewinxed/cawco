<script lang="ts">
  /**
   * Caw in the project's head: the page's one live Caw, at 48px, as a
   * button. A press opens his panel floating over the page (CawFloat) and
   * a second press puts it away. The seat on screen is the panel's anchor
   * (`lead.anchor`): over an empty board he stands at 80, and when he sits
   * down in the head the open panel moves with him. His face keeps saying
   * what he is doing either way. His on/off is the project's, under the
   * head's `⋯`.
   */
  import { cawLoop } from "#lib/cawco/feel.svelte.js";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import { land } from "#lib/cawco/motion/share.svelte.js";
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

  /** He holds his still: idle, the done hold, and working when his loop is off. */
  const still = $derived(
    lead.holds || (lead.status === "working" && !cawLoop.on)
  );

  /** The seat on screen anchors his panel; the one leaving hands it on. */
  function anchors(node: HTMLElement) {
    lead.anchor = node;
    return () => {
      if (lead.anchor === node) {
        lead.anchor = null;
      }
    };
  }
</script>

<button
  aria-expanded={lead.open}
  aria-haspopup="dialog"
  aria-label="Caw, lead of {projectName}. {lead.sentence}"
  class="caw-seat press-tint"
  data-share="caw:{projectId}"
  onclick={() => {
    lead.open = !lead.open;
  }}
  type="button"
  style:--seat="{size}px"
  {@attach anchors}
  {@attach land(() => `caw:${projectId}`, { uniform: true })}
>
  {#if lead.shown}
    <Caw next={HEAD_NEXT} {size} status={lead.status} {still} />
  {/if}
</button>

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
</style>
