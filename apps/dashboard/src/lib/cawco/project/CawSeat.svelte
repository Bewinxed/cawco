<script lang="ts">
  /**
   * Caw in the project's head: the page's one live Caw, at 48px, as a
   * button. A press opens his dock beside the page (CawDock) and a second
   * press puts it away; whether it stands open is kept per project
   * (caw-dock). His face keeps saying what he is doing either way. His
   * settings are the project's, under the head's `⋯`.
   */
  import { cawLoop } from "#lib/cawco/feel.svelte.js";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import { land } from "#lib/cawco/motion/share.svelte.js";
  import { cawDock } from "./caw-dock.svelte";
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
  const open = $derived(cawDock.isOpen(projectId));
</script>

<button
  aria-label="Caw, lead of {projectName}. {lead.sentence}"
  aria-pressed={open}
  class="caw-seat press-tint"
  data-share="caw:{projectId}"
  onclick={() => cawDock.toggle(projectId)}
  type="button"
  style:--seat="{size}px"
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
