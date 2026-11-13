<script lang="ts" module>
  import type { CawStatus } from "@cawco/core/project-conversation";

  /** The statuses the head Caw changes between, fetched once he is on screen. */
  const HEAD_NEXT: CawStatus[] = [
    "working",
    "needs-you",
    "done",
    "trying",
    "idle",
    "loading",
    "reconnecting",
  ];
</script>

<script lang="ts">
  import Caw from "#lib/cawco/home/Caw.svelte";
  import { IconFolder } from "#lib/icons.js";
  /**
   * Caw in the project's head: the page's one live Caw, at 48px, as a
   * button. A press opens his panel floating over the page (CawFloat) and
   * a second press puts it away. The seat on screen is the panel's anchor
   * (`lead.anchor`): over an empty board he stands at 80, and when he sits
   * down in the head the open panel moves with him. His face keeps saying
   * what he is doing either way. His on/off is the project's, under the
   * head's `⋯`. While he works on a project's setup in his panel
   * (`lead.inPanel`, SetupWell) he is there, not here: the seat stays (it
   * is his panel's anchor, and a press still puts the panel away) and
   * shows the project's folder glyph, so every seat draws something to
   * press, at any size and wherever it stands.
   */
  import { cawLoop } from "#lib/platform/feel.svelte.js";
  import { land } from "#lib/platform/motion/share.svelte.js";
  import type { SeatedLead } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
    size = 48,
  }: {
    lead: SeatedLead;
    projectId: string;
    projectName: string;
    size?: number;
  } = $props();

  /** He holds his still: idle, the done hold, and working when his loop is off. */
  const still = $derived(
    lead.holds || (lead.status === "working" && !cawLoop.on)
  );

  /** The seat on screen anchors his panel while it stands (CawLead `seat`). */
  function anchors(node: HTMLElement) {
    return lead.seat(node);
  }
</script>

<button
  data-slot="caw-seat"
  aria-expanded={lead.open}
  aria-haspopup="dialog"
  aria-label="Caw, {projectName}. {lead.sentence}"
  class="select-none press-tint grid size-(--seat) flex-none place-items-center rounded-md border-none border-current bg-transparent p-0"
  data-share="caw:{projectId}"
  onclick={() => {
    lead.open = !lead.open;
  }}
  type="button"
  style:--seat="{size}px"
  {@attach anchors}
  {@attach land(() => `caw:${projectId}`, { uniform: true })}
>
  {#if lead.inPanel}
    <IconFolder aria-hidden="true" class="size-icon-lg text-ink-muted" />
  {:else if lead.shown}
    <Caw next={HEAD_NEXT} {size} status={lead.status} {still} />
  {/if}
</button>
