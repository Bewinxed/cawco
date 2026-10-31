<script lang="ts" module>
  import { getContext, setContext } from "svelte";

  const STILL = Symbol("decides:still-setup");

  /**
   * The settings below draw in place, under the card that opened them, as
   * a picture of the open popover: a component canvas's frame (the states
   * files' fixture), where a floating layer standing open as its frame
   * mounts is placed against the canvas's window, not the frame, and moves
   * the canvas to bring itself into sight. Every control in them works as
   * it does on the page.
   */
  export const drawSetupInPlace = (): void => {
    setContext(STILL, true);
  };
</script>

<script lang="ts">
  /**
   * A member's settings, or Add a member, hung from the card that opened
   * them in the kit's popover, as a kind's hand-over hangs from its tile:
   * nothing on the page moves and nothing is held. ×, Escape or a press
   * elsewhere closes it and parks a changed draft (WhoDecides `closeSetup`).
   */
  import type { Snippet } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import type { WhoDecides } from "./decides.svelte";
  import MemberSetup from "./MemberSetup.svelte";

  let {
    who,
    at,
    anchor,
    project,
    trigger,
  }: {
    who: WhoDecides;
    /** Whose settings: a member's id, or Add a member's key. */
    at: string;
    /** The card it hangs from. */
    anchor: HTMLElement | null;
    project: string | null;
    /** The control that opens it, given the popover's trigger props. */
    trigger: Snippet<[Record<string, unknown>]>;
  } = $props();

  const uid = $props.id();
  const still = getContext<boolean | undefined>(STILL) === true;
  const open = $derived(who.setup?.from === at);
  /** It was opened by a press here: the focus goes into it. Standing open as it mounts, it takes none. */
  let pressed = false;

  /**
   * In place: the panel stands under its card, at the card's start, never
   * past the side of the page holding it, as the popover would; it is the
   * page's own flow's to hold (the fixture keeps room for it).
   */
  function under(panel: HTMLElement) {
    const place = () => {
      const page = panel.offsetParent;
      if (!(anchor && page instanceof HTMLElement)) {
        return;
      }
      const ratio = page.getBoundingClientRect().width / page.offsetWidth || 1;
      const card = anchor.getBoundingClientRect();
      const box = page.getBoundingClientRect();
      const width = Math.min(panel.offsetWidth, page.clientWidth);
      const left = Math.min(
        (card.left - box.left) / ratio,
        page.clientWidth - width
      );
      panel.style.insetInlineStart = `${Math.max(0, left)}px`;
      panel.style.insetBlockStart = `${(card.bottom - box.top) / ratio + 4}px`;
    };
    place();
    const watch = frameObserver(place);
    watch.observe(panel);
    if (anchor) {
      watch.observe(anchor);
    }
    return () => watch.disconnect();
  }
</script>

{#if still}
  {@render trigger({
    "aria-expanded": open,
    "aria-controls": open ? `${uid}-panel` : undefined,
    onclick: () => {
      if (open) {
        who.closeSetup();
      } else {
        who.openSetup(at);
      }
    },
  })}
  {#if who.setup && open && anchor}
    <section
      aria-labelledby="{uid}-head"
      class={[
        floatingSurface({ motion: "pop" }),
        "absolute z-(--layer-float) w-(--pop-w) overflow-clip p-0",
      ]}
      data-state="open"
      data-still-setup
      id="{uid}-panel"
      style="--pop-w: min(var(--c-member-setup-max-w), 100%)"
      {@attach under}
    >
      <MemberSetup headId="{uid}-head" {project} setup={who.setup} {who} />
    </section>
  {/if}
{:else}
  <Popover.Root
    bind:open={
      () => open,
      (next) => {
        if (next && !open) {
          pressed = true;
          who.openSetup(at);
        } else if (open) {
          who.closeSetup();
        }
      }
    }
  >
    <Popover.Trigger>
      {#snippet child({ props })}
        {@render trigger(props)}
      {/snippet}
    </Popover.Trigger>
    <Popover.Content
      align="start"
      aria-labelledby="{uid}-head"
      customAnchor={anchor}
      gap="none"
      height="room"
      onOpenAutoFocus={(event) => {
        if (!pressed) {
          event.preventDefault();
        }
        pressed = false;
      }}
      overflow="clip"
      pad="none"
      side="bottom"
      style="--pop-w: min(var(--c-member-setup-max-w), var(--bits-popover-content-available-width, 100vw)); --pop-max-h: var(--bits-popover-content-available-height)"
      width="room"
    >
      {#if who.setup && open}
        <MemberSetup headId="{uid}-head" {project} setup={who.setup} {who} />
      {/if}
    </Popover.Content>
  </Popover.Root>
{/if}
