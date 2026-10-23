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
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { ChipPanel } from "./chip-panel.svelte";
  import { cawco } from "./client.svelte";
  import HoverPanel from "./HoverPanel.svelte";
  import CawFace from "./home/CawFace.svelte";
  import { sessionName } from "./home/home-state.svelte";
  import { conversationHref } from "./links";
  import { markHue, sessionSprite } from "./mark";
  import SessionCard, { readThreadCard, tailOf } from "./SessionCard.svelte";
  import { sessionAnswer, sessionPlace } from "./session-names.svelte";
  import { threadIdOf } from "./thread-tabs";

  /**
   * The session, as the instance index holds it or the hub's names answered
   * it (references.ts `find`, session-names.svelte.ts). The written label
   * goes unused: a session is drawn by its title as it stands now.
   */
  let { id }: { id: string; label?: string } = $props();

  const panelId = $props.id();
  const row = $derived(cawco.instanceIndex.byId.get(id));
  const thread = $derived(cawco.threadOf(id));
  /** The hub's answer, for a session this browser holds no row of. */
  const answer = $derived(row || thread ? undefined : sessionAnswer(id));
  const title = $derived(sessionName(id));
  const caw = $derived(
    thread?.status ?? (answer?.kind === "thread" ? answer.state : null)
  );
  const Sprite = $derived(sessionSprite(id));

  // A thread's card reads its messages as it opens.
  const panel = new ChipPanel(panelId, () => {
    const threadId = threadIdOf(id);
    if (threadId) {
      readThreadCard(threadId);
    }
  });
</script>

<!-- The chip stands in a line of text as a word does (ui/chip `inline`),
     and nothing stands between it and the panel's portal, or the line would
     draw a space before the words after it. -->
<button
  aria-controls={panelId}
  aria-expanded={panel.open}
  aria-haspopup="dialog"
  class={chipVariants({ variant: "inline" })}
  data-session-chip={id}
  onclick={panel.press}
  type="button"
  bind:this={panel.chip}
>
  <span
    data-slot="mark"
    aria-hidden="true"
    class="grid size-c-row-mark flex-none place-items-center rounded-xs bg-(--mark-bg) bg-mark-overlay"
    style:--mark-bg="var(--mark-{markHue(sessionPlace(id))})"
    data-box
  >
    {#if caw}
      <CawFace size={14} status={caw} />
    {:else}
      <Sprite class="block size-icon-sm text-mark-glyph" />
    {/if}
  </span>
  <span data-slot="label">{title}</span>
</button><Portal>
  <HoverPanel
    aria-label={title}
    id={panelId}
    key={panel.open ? id : null}
    role="dialog"
    side="right"
    style="--x: {panel.place.x}px; --y: {panel.place.y}px; --origin: {panel
      .place
      .origin}px; --room: var(--c-session-hover-room); --span: calc(100vw - 2 * var(--hover-panel-inset))"
    watch={panel.open ? tailOf(id) : null}
  >
    {#snippet children(shown)}
      <SessionCard
        id={shown}
        open={conversationHref(shown, cawco.instanceIndex)}
      />
    {/snippet}
  </HoverPanel>
</Portal>
