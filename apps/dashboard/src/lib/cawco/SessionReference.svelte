<script lang="ts">
  /**
   * A session named in written words (`[title](cawco:session/<id>)`, core
   * references.ts), drawn as its chip: the tray's chip (ui/chip `tray`)
   * with the session's mark and its title as the dashboard holds it now.
   * Pressing it opens the house hover panel (HoverPanel) beside it with the
   * session's card (SessionCard: its state, its live tail) and "Open
   * session". A press outside, Escape, or the chip scrolling out of view
   * puts it away; while the text scrolls, the panel keeps to its chip.
   *
   * The panel is portalled to the body: a transcript's rows clip and
   * isolate their stacking, so a panel drawn inside one would be cut off
   * or paint under the panes.
   */
  import { Portal } from "bits-ui";
  import { tick } from "svelte";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { cawco } from "./client.svelte";
  import HoverPanel from "./HoverPanel.svelte";
  import CawFace from "./home/CawFace.svelte";
  import { sessionName } from "./home/home-state.svelte";
  import { conversationHref } from "./links";
  import { markHue, sessionSprite } from "./mark";
  import { pressOutside } from "./press-outside";
  import SessionCard, { readThreadCard, tailOf } from "./SessionCard.svelte";
  import { threadIdOf } from "./thread-tabs";

  /** The session, as the instance index holds it (references.ts `find`). */
  let { id }: { id: string } = $props();

  const panelId = $props.id();
  const row = $derived(cawco.instanceIndex.byId.get(id));
  const thread = $derived(cawco.threadOf(id));
  const title = $derived(sessionName(id));
  const Sprite = $derived(sessionSprite(id));

  let chip = $state<HTMLButtonElement>();
  let open = $state(false);
  let place = $state({ x: 0, y: 0, origin: 0 });

  /** A token's length in px, as the root computes it. */
  const px = (name: string): number =>
    Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(name)
    );

  /**
   * The panel stands to the chip's right, level with it, pulled back inside
   * the viewport when the room there is narrower than the panel can grow
   * (a chip at a line's end, a phone), where it covers the chip.
   */
  function stand(at: HTMLElement): void {
    const box = at.getBoundingClientRect();
    const inset = px("--hover-panel-inset");
    const widest = Math.min(px("--hover-panel-max"), innerWidth - 2 * inset);
    place = {
      x: Math.round(
        Math.max(inset, Math.min(box.right + 4, innerWidth - widest - inset))
      ),
      y: Math.round(box.top),
      origin: Math.round(box.height / 2),
    };
  }

  async function press(event: MouseEvent): Promise<void> {
    if (open || !chip) {
      open = false;
      return;
    }
    stand(chip);
    const threadId = threadIdOf(id);
    if (threadId) {
      readThreadCard(threadId);
    }
    open = true;
    // Opened from the keys (a click with no pointer), focus goes in with it.
    if (event.detail === 0) {
      await tick();
      document
        .getElementById(panelId)
        ?.querySelector<HTMLElement>('[data-slot="acts"] a')
        ?.focus();
    }
  }

  function close(refocus: boolean): void {
    open = false;
    if (refocus) {
      chip?.focus();
    }
  }

  // Open: a press outside the panel and the chip, or Escape, puts it away;
  // a scroll moves it with its chip, and away once the chip is out of view.
  $effect(() => {
    const at = chip;
    const panel = open ? document.getElementById(panelId) : null;
    if (!(at && panel)) {
      return;
    }
    const stopPress = pressOutside(panel, (event) => {
      if (!(event.target instanceof Node && at.contains(event.target))) {
        close(false);
      }
    });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        close(true);
      }
    };
    let frame = 0;
    const follow = (event: Event) => {
      if (
        frame ||
        (event.target instanceof Node && panel.contains(event.target))
      ) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = at.getBoundingClientRect();
        if (!at.isConnected || box.bottom <= 0 || box.top >= innerHeight) {
          close(false);
          return;
        }
        stand(at);
      });
    };
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    return () => {
      stopPress();
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", follow, { capture: true });
      cancelAnimationFrame(frame);
    };
  });
</script>

<!-- The chip stands in a line of text. Its margin box is pulled in to 1em,
     so the line keeps the text's own height around the taller chip, and
     nothing stands between it and the panel's portal, or the line would draw
     a space before the words after it. -->
<button
  aria-controls={panelId}
  aria-expanded={open}
  aria-haspopup="dialog"
  class={chipVariants({
    variant: "tray",
    class: "-my-[calc((var(--c-tray-chip)-1em)/2)] max-w-full align-middle",
  })}
  data-session-chip={id}
  onclick={press}
  type="button"
  bind:this={chip}
>
  <span
    data-slot="mark"
    aria-hidden="true"
    class="grid size-c-row-mark flex-none place-items-center rounded-xs bg-(--mark-bg) bg-mark-overlay"
    style:--mark-bg="var(--mark-{markHue(row?.cwd || id)})"
    data-box
  >
    {#if thread}
      <CawFace size={14} status={thread.status} />
    {:else}
      <Sprite class="block size-icon-sm text-mark-glyph" />
    {/if}
  </span>
  <span
    data-slot="title"
    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap">{title}</span
  >
</button><Portal>
  <HoverPanel
    aria-label={title}
    id={panelId}
    key={open ? id : null}
    role="dialog"
    side="right"
    style="--x: {place.x}px; --y: {place.y}px; --origin: {place.origin}px; --room: var(--c-session-hover-room); --span: calc(100vw - 2 * var(--hover-panel-inset))"
    watch={open ? tailOf(id) : null}
  >
    {#snippet children(shown)}
      <SessionCard
        id={shown}
        open={conversationHref(shown, cawco.instanceIndex)}
      />
    {/snippet}
  </HoverPanel>
</Portal>
