<script lang="ts">
  /**
   * A card the design graph's tools open over the stage (the Map, the
   * Animation face, the Controls): the kit's popover, grown out of the bar
   * button that opened it (its `anchor`) and standing above it, on its side
   * of the bar, held inside the stage (the owner's pick, Design graph
   * Controls card fixes, `card-placement`). It closes on Escape, on a press
   * outside it and its button, and on its button pressed again (the
   * button's own press, which the press outside leaves to it). The focus
   * goes back to the button unless it already stands on a control outside
   * the card: one a press outside put it on, or the next card opened. A press in a layer the card opened
   * (a select's list, a colour's picker) is that layer's, never outside.
   * Escape a row or field of the card keeps for itself (the Animation
   * face's open row, a field being typed in) stays with it.
   *
   * `whole`: the Map's height, half the stage; else it takes its content's
   * height, up to half the stage. Its width is `measure`, never past the
   * stage less its inset each side. Under the phone line the graph opens the
   * same faces in its bottom sheet instead (ThreadSheet).
   */
  import type { Snippet } from "svelte";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { numberOf } from "#lib/platform/motion/curves.svelte.js";
  import { browser } from "$app/env";

  let {
    open,
    onclose,
    anchor,
    boundary,
    stage,
    label,
    id,
    align = "center",
    whole = false,
    measure,
    inPlace = false,
    children,
  }: {
    open: boolean;
    /** Escape or a press outside: the card goes. */
    onclose: () => void;
    /** The bar button it grows out of, and goes back to. */
    anchor: HTMLElement | null;
    /** The stage it stands inside. */
    boundary: HTMLElement | null;
    /** The stage's size, px. */
    stage: { width: number; height: number };
    /** What it holds, read out. */
    label: string;
    /** Its id, which its button names while it stands (`aria-controls`). */
    id: string;
    /** Which of its edges stands on its button's: the bar's side it is on. */
    align?: "start" | "center" | "end";
    whole?: boolean;
    /** Its width as a CSS length (a token, or a `min()` of them). */
    measure: string;
    /** Drawn where it stands, not portalled to the page's body: a states file's frame, which reads its own root alone (its stage holds it with `contain: layout`). */
    inPlace?: boolean;
    children: Snippet;
  } = $props();

  let ref = $state<HTMLElement | null>(null);

  /** What a field or a row of the card does with Escape, by its own handler, stays its own. */
  const FIELD = "input, textarea, select, [contenteditable='true']";
  function keepsEscape(event: KeyboardEvent) {
    if (event.key !== "Escape") {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    if (event.defaultPrevented || target?.closest(FIELD)) {
      event.stopPropagation();
    }
  }

  /** The step it stands from the stage's edges and from its button. */
  const inset = $derived(browser ? numberOf("--spacing-space-3") : 0);
  const width = $derived(
    `min(${Math.max(0, stage.width - 2 * inset)}px, ${measure})`
  );
  const height = $derived(`${Math.round(stage.height / 2)}px`);
</script>

<Popover.Root
  onOpenChange={(next: boolean) => {
    if (!next) {
      onclose();
    }
  }}
  open={open && anchor !== null}
>
  <Popover.Content
    {align}
    aria-label={label}
    collisionBoundary={boundary ?? undefined}
    collisionPadding={inset}
    customAnchor={anchor}
    gap="none"
    height={whole ? "whole" : "room"}
    {id}
    onCloseAutoFocus={(event: Event) => {
      event.preventDefault();
      const at = document.activeElement;
      const elsewhere = at && at !== document.body && !ref?.contains(at);
      if (!elsewhere) {
        anchor?.focus({ preventScroll: true });
      }
    }}
    onInteractOutside={(event: PointerEvent) => {
      // A press on its button is the button's: it closes it, or opens the
      // menu it stands in (View, where the tools fold).
      if (event.target instanceof Node && anchor?.contains(event.target)) {
        event.preventDefault();
      }
    }}
    onkeydown={keepsEscape}
    onOpenAutoFocus={(event: Event) => {
      // The card takes the focus, not its first control: a field focused
      // as it opens took the keys meant for the card.
      event.preventDefault();
      ref?.focus({ preventScroll: true });
    }}
    overflow="clip"
    pad={whole ? undefined : "card"}
    portalProps={{ disabled: inPlace }}
    ownWidth
    role="dialog"
    side="top"
    sideOffset={inset}
    style={`--pop-w: ${width}; --pop-max-h: ${height};`}
    tabindex={-1}
    width="room"
    bind:ref
  >
    {@render children()}
  </Popover.Content>
</Popover.Root>
