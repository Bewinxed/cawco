<script lang="ts">
  /**
   * A session named in written words (`[title](cawco:session/<id>)`, core
   * references.ts), drawn as its chip: the inline chip (ui/chip `inline`)
   * with the session's mark and its title as the dashboard holds it now.
   * Pressing it opens the house hover panel (HoverPanel, chip-panel.svelte.ts)
   * beside it with the session's card (SessionCard: its state, its live
   * tail) and "Open session".
   *
   * The panel is portalled to the body: a transcript's rows clip and
   * isolate their stacking, so a panel drawn inside one would be cut off
   * or paint under the panes.
   */
  import { Portal } from "bits-ui";
  import { ChipPanel } from "./chip-panel.svelte";

  import HoverPanel from "./HoverPanel.svelte";
  import CawFace from "./home/CawFace.svelte";
  import { sessionName } from "./home/home-state.svelte";
  import { conversationHref } from "./links";
  import { markHue, sessionSprite } from "./mark";
  import ReferenceFace, { referenceChipClass } from "./ReferenceFace.svelte";
  import SessionCard from "./SessionCard.svelte";
  import { sessionPlace } from "./session-names.svelte";
  import { cawOf } from "./session-status";
  import { boardStore } from "./stores/board.svelte";

  /**
   * The session, as the instance index holds it or the hub's names answered
   * it (references.ts `find`, session-names.svelte.ts). The written label
   * goes unused: a session is drawn by its title as it stands now.
   */
  let { id }: { id: string; label?: string } = $props();

  const panelId = $props.id();
  const title = $derived(sessionName(id));
  /** A project's conversation's mark is Caw (session-status.ts `cawOf`). */
  const caw = $derived(cawOf(id));
  const Sprite = $derived(sessionSprite(id));

  const panel = new ChipPanel(panelId);
</script>

<!-- The chip stands in a line of text as a word does (ui/chip `inline`),
     and nothing stands between it and the panel's portal, or the line would
     draw a space before the words after it. -->
<button
  aria-controls={panelId}
  aria-expanded={panel.open}
  aria-haspopup="dialog"
  class={referenceChipClass(true)}
  data-session-chip={id}
  onclick={panel.press}
  type="button"
  bind:this={panel.chip}
>
  <ReferenceFace hue={markHue(sessionPlace(id))} words={title}>
    {#snippet mark()}
      {#if caw}
        <CawFace size={14} status={caw} />
      {:else}
        <Sprite class="block size-icon-sm text-mark-glyph" />
      {/if}
    {/snippet}
  </ReferenceFace>
</button><Portal>
  <HoverPanel
    aria-label={title}
    id={panelId}
    key={panel.open ? id : null}
    onclose={() => panel.close(false)}
    role="dialog"
    side="right"
    style="--x: {panel.place.x}px; --y: {panel.place.y}px; --origin: {panel
      .place
      .origin}px; --room: var(--spacing-c-session-hover-room); --span: calc(100vw - 2 * var(--hover-panel-inset))"
    watch={panel.open ? id : null}
  >
    {#snippet children(shown)}
      <SessionCard
        id={shown}
        open={conversationHref(shown, boardStore.instanceIndex)}
      />
    {/snippet}
  </HoverPanel>
</Portal>
