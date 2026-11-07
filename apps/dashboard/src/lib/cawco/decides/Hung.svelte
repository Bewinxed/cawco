<script lang="ts">
  /**
   * A panel hung from what opened it in the kit's popover: a kind's
   * hand-over from its face, a member's card from its chip. Nothing on the
   * page moves and nothing is held; Escape or a press elsewhere closes it.
   * In a states file's frame (drawPopoversInPlace) it draws in place under
   * its anchor, every control in it working as on the page.
   */
  import type { Snippet } from "svelte";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { drawnInPlace, placeUnder } from "./in-place";

  let {
    open,
    onopen,
    anchor,
    align = "start",
    width,
    label,
    trigger,
    children,
  }: {
    open: boolean;
    /** Opens or closes it. */
    onopen: (open: boolean) => void;
    /** What it hangs from; its trigger when null. */
    anchor: HTMLElement | null;
    align?: "start" | "end";
    /** Its width, a token's length. */
    width: string;
    /** Its accessible name. */
    label: string;
    /** The control that opens it, given the popover's trigger props. */
    trigger: Snippet<[Record<string, unknown>]>;
    children: Snippet;
  } = $props();

  const uid = $props.id();
  const still = drawnInPlace();
  /** It was opened by a press here: the focus goes into it. Standing open as it mounts, it takes none. */
  let pressed = false;
</script>

{#if still}
  {@render trigger({
    "aria-expanded": open,
    "aria-controls": open ? `${uid}-panel` : undefined,
    onclick: () => onopen(!open),
  })}
  {#if open && anchor}
    <section
      aria-label={label}
      class={[
        floatingSurface({ motion: "pop" }),
        "absolute z-(--layer-float) w-(--pop-w) overflow-clip",
      ]}
      data-state="open"
      data-still-popover
      id="{uid}-panel"
      style:--pop-w={width}
      {@attach placeUnder(() => anchor, align)}
    >
      {@render children()}
    </section>
  {/if}
{:else}
  <Popover.Root
    bind:open={
      () => open,
      (next) => {
        if (next && !open) {
          pressed = true;
        }
        onopen(next);
      }
    }
  >
    <Popover.Trigger>
      {#snippet child({ props })}
        {@render trigger(props)}
      {/snippet}
    </Popover.Trigger>
    <Popover.Content
      {align}
      aria-label={label}
      customAnchor={anchor}
      height="room"
      onOpenAutoFocus={(event) => {
        if (!pressed) {
          event.preventDefault();
        }
        pressed = false;
      }}
      overflow="scroll"
      side="bottom"
      style="--pop-w: min({width}, var(--bits-popover-content-available-width, 100vw)); --pop-max-h: var(--bits-popover-content-available-height)"
      width="room"
    >
      {@render children()}
    </Popover.Content>
  </Popover.Root>
{/if}
