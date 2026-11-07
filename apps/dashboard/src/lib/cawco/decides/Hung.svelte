<script lang="ts">
  /**
   * A panel opened from a control on the page: a kind's hand-over from its
   * face, a member's card from its chip. On a desk it hangs from what
   * opened it in the kit's popover, nothing on the page moving; under the
   * phone line (640px) it is the kit's bottom sheet, named by `label`
   * (DESIGN.md, Dialog, sheet and drawer). Escape, a press elsewhere or the
   * sheet's Close puts it away. In a states file's frame
   * (drawPopoversInPlace) it draws in place under its anchor, every control
   * in it working as on the page.
   */
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
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
    flush = false,
    trigger,
    children,
  }: {
    open: boolean;
    /** Opens or closes it. */
    onopen: (open: boolean) => void;
    /** What it hangs from; its trigger when null. */
    anchor: HTMLElement | null;
    align?: "start" | "end";
    /** Its width on a desk, a token's length. */
    width: string;
    /** Its accessible name, and the sheet's title on a phone. */
    label: string;
    /** It pads itself and scrolls its own body (a member's card); the panel adds no padding. */
    flush?: boolean;
    /** The control that opens it, given the props that tie it to the panel. */
    trigger: Snippet<[Record<string, unknown>]>;
    children: Snippet;
  } = $props();

  const uid = $props.id();
  const still = drawnInPlace();
  const phone = new MediaQuery("width < 640px");
  /** It was opened by a press here: the focus goes into it. Standing open as it mounts, it takes none. */
  let pressed = false;

  const own = $derived({
    "aria-expanded": open,
    "aria-haspopup": "dialog",
    "aria-controls": open ? `${uid}-panel` : undefined,
    onclick: () => onopen(!open),
  });
</script>

{#if still}
  {@render trigger(own)}
  {#if open && anchor}
    <section
      aria-label={label}
      class={[
        floatingSurface({ motion: "pop" }),
        "absolute z-(--layer-float) w-(--pop-w) overflow-clip",
        flush && "p-0",
      ]}
      data-state="open"
      data-still-popover
      id="{uid}-panel"
      role="dialog"
      style:--pop-w={width}
      {@attach placeUnder(() => anchor, align)}
    >
      {@render children()}
    </section>
  {/if}
{:else if phone.current}
  {@render trigger(own)}
  <Drawer.Root bind:open={() => open, (next) => onopen(next)}>
    <Drawer.Content id="{uid}-panel" pad="safe-bottom" title={label}>
      <div
        class={[
          "min-h-0 overflow-y-auto",
          Drawer.scroller,
          !flush && "px-space-4 pb-space-4",
        ]}
      >
        {@render children()}
      </div>
    </Drawer.Content>
  </Drawer.Root>
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
        {@render trigger({ ...props, "aria-haspopup": "dialog" })}
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
      overflow={flush ? "clip" : "scroll"}
      pad={flush ? "none" : undefined}
      role="dialog"
      side="bottom"
      style="--pop-w: min({width}, var(--bits-popover-content-available-width, 100vw)); --pop-max-h: var(--bits-popover-content-available-height)"
      width="room"
    >
      {@render children()}
    </Popover.Content>
  </Popover.Root>
{/if}
