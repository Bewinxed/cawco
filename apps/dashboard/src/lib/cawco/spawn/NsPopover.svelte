<script lang="ts">
  /**
   * The modal's popover shell: a portaled bits-ui Popover anchored to its
   * trigger (or a caret rect), collision-handled, scaled from the trigger side,
   * and capped rather than full-screen on small screens. Decision §8.6: the design's
   * `fixedOrigin` maths is unnecessary here because the content is portaled.
   */
  import { Popover as PopoverPrimitive } from "bits-ui";
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import {
    glidePopoverVariants,
    popoverRoom,
  } from "#lib/components/ui/glide-popover/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import PopoverRoot from "#lib/components/ui/popover/popover.svelte";
  import { cn } from "#lib/utils.js";
  import { browser } from "$app/env";
  import {
    type PopoverMember,
    type PopoverWidth,
    popoverGroup,
    popoverWidth,
  } from "./popover-group.svelte";

  let {
    id,
    open,
    onchange,
    onclosefocus,
    trigger,
    children,
    width = 320,
    fit = false,
    gap = 0,
    align = "start",
    trapFocus = true,
    pad = "roomy",
    anchor = null,
    label,
    triggerClass = "",
    triggerData = {},
    haspopup,
    rows,
    follows = false,
    ...rest
  }: {
    id: string;
    open: boolean;
    onchange: (open: boolean) => void;
    /**
     * Where focus goes as the popover closes, when not back to the trigger:
     * true when it placed focus itself.
     */
    onclosefocus?: () => boolean;
    trigger?: Snippet;
    children: Snippet;
    /** Pixels, or a CSS length such as a token's `var(--c-…)`. */
    width?: PopoverWidth;
    /**
     * The surface takes its content's width, `width` at the least and the
     * viewport less its margins at the most, and its height uncapped: a list
     * sized to its widest row and scrolled in whole rows (SessionDetails'
     * model list).
     */
    fit?: boolean;
    gap?: number;
    align?: "start" | "end" | "center";
    trapFocus?: boolean;
    /**
     * The surface's inset: the sheet's own (`roomy`), or the ladder's 4px
     * round a menu whose rows carry their own (`snug`, the trigger menu).
     */
    pad?: "roomy" | "snug";
    anchor?: { getBoundingClientRect: () => DOMRect } | HTMLElement | null;
    label?: string;
    triggerClass?: string;
    /**
     * The trigger's own hooks, as data attributes the caller's neighbours
     * read: `data-tool` (a tool's chip, which a tools row sizes),
     * `data-account-chip` (the account's, which keeps its chevron).
     */
    triggerData?: Partial<Record<`data-${string}`, true>>;
    /** What the trigger opens, when it is not a dialog. */
    haspopup?: "listbox" | "menu";
    /** The rows the hover ghost glides between (components/ui/highlight). */
    rows?: string;
    /**
     * Its anchor moves by transform (a row in the transcript as it re-anchors
     * and unfolds), which no scroll or resize tells it of: placed again on
     * every frame while it is open (bits-ui `updatePositionStrategy`).
     */
    follows?: boolean;
    "aria-label"?: string;
  } = $props();

  /**
   * Its inset from the screen's edge, the kit popover's rule: the screen's
   * margin on a phone, the pages' gutter past it. Read in the browser, where
   * it opens.
   */
  const phone = new MediaQuery("(width < 640px)");
  const inset = $derived(
    browser ? numberOf(phone.current ? "--c-screen-margin" : "--space-5") : 0
  );
  /** The room floating-ui leaves the surface, a frame after it says so (glide-popover `popoverRoom`). */
  let room = $state<string>();
  const roomed = popoverRoom((next) => {
    room = next;
  });

  /**
   * Inside an NsPopoverGroup this is only a trigger: the group owns the one
   * surface and renders this popover's content on it when it is open. One
   * anchored to a caret (the `@` / `/` menu) has no trigger to glide to and
   * keeps its own surface.
   */
  const around = popoverGroup();
  const group = $derived(trigger ? around : undefined);
  let triggerEl = $state<HTMLElement | null>(null);
  const member: PopoverMember = {
    get align() {
      return align;
    },
    get children() {
      return children;
    },
    get gap() {
      return gap;
    },
    get id() {
      return id;
    },
    get label() {
      return label;
    },
    onchange: (value) => onchange(value),
    get rows() {
      return rows;
    },
    get onclosefocus() {
      return onclosefocus;
    },
    get open() {
      return open;
    },
    get trapFocus() {
      return trapFocus;
    },
    get trigger() {
      return triggerEl;
    },
    get width() {
      return width;
    },
  };
  $effect(() => group?.add(member));
  function toggle() {
    if (!open) {
      group?.opening(member);
    }
    onchange(!open);
  }
</script>

{#if group}
  {#if trigger}
    <button
      aria-controls={`${id}-popover`}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={label}
      class={cn("touch-hit", triggerClass)}
      {...triggerData}
      data-state={open ? "open" : "closed"}
      {id}
      onclick={toggle}
      type="button"
      bind:this={triggerEl}
    >
      {@render trigger()}
    </button>
  {/if}
{:else}
  <PopoverRoot onOpenChange={onchange} {open}>
    {#if trigger}
      <PopoverPrimitive.Trigger
        aria-label={label}
        class={cn("touch-hit", triggerClass)}
        {...triggerData}
        {id}
      >
        {#snippet child({ props })}
          <!-- bits-ui marks every trigger as opening a dialog; a list says so. -->
          <button {...props} aria-haspopup={haspopup ?? "dialog"} type="button">
            {@render trigger()}
          </button>
        {/snippet}
      </PopoverPrimitive.Trigger>
    {/if}
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-ns-pop
        data-fit={fit || undefined}
        {align}
        aria-label={rest["aria-label"]}
        class={cn("ns-theme", glidePopoverVariants({ pad }))}
        collisionPadding={inset}
        customAnchor={anchor}
        id={`${id}-popover`}
        onCloseAutoFocus={(event) => {
          if (onclosefocus?.()) {
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => {
          if (!trapFocus) {
            event.preventDefault();
          }
        }}
        side="bottom"
        sideOffset={6}
        style={`--ns-pop-width:${popoverWidth(width)};--ns-pop-gap:${gap}px`}
        {trapFocus}
        updatePositionStrategy={follows ? "always" : "optimized"}
      >
        {#snippet child({ props, wrapperProps, open })}
          <!-- Closing, it lets presses through to the page (floating-presence). -->
          <div {...wrapperProps} style:pointer-events={pressable(open)}>
            <div
              {...props}
              id={`${id}-popover`}
              role="presentation"
              style:--ns-pop-room={room}
              style:pointer-events={pressable(open)}
              {@attach roomed}
              {@attach rows ? highlight({ rows }) : undefined}
              {@attach morph()}
            >
              {@render children()}
            </div>
          </div>
        {/snippet}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverRoot>
{/if}
