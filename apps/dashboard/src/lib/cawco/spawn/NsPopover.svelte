<script lang="ts">
  /**
   * The modal's popover shell: a portaled bits-ui Popover standing on its
   * trigger (or the element its site names) by CSS anchor positioning (kit
   * anchored.svelte.ts), turned where it would not fit, scaled from the trigger side,
   * and capped rather than full-screen on small screens. Decision §8.6: the design's
   * `fixedOrigin` maths is unnecessary here because the content is portaled.
   *
   * Out of a group, its surface is kept as NsPopoverGroup keeps a member's:
   * built the first time it opens, or while the page is idle before any
   * press (`prebuild`), and kept shut (bits-ui's forceMount, unseen and
   * inert), so a press draws it as it was left, nothing mounted. Built on
   * each press, the session card's account list (its rows, their tips, its
   * popover's layers) held the press's frame about 20ms at 4x CPU, frames
   * dropped before the surface's entrance began (LimitPickerChecks
   * AccountsOpen). It is laid out while shut (hidden, not skipped), so
   * the press only turns it visible.
   */
  import { Popover as PopoverPrimitive } from "bits-ui";
  import type { Snippet } from "svelte";
  import {
    type AnchorSpot,
    layerProps,
  } from "#lib/components/ui/anchored.svelte.js";
  import {
    drawn,
    own,
    pressable,
  } from "#lib/components/ui/floating-presence.js";
  import { glidePopoverVariants } from "#lib/components/ui/glide-popover/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import PopoverRoot from "#lib/components/ui/popover/popover.svelte";
  import { whenIdle } from "#lib/platform/idle-build.svelte.js";
  import { morph } from "#lib/platform/motion/morph.svelte.js";
  import { cn } from "#lib/utils.js";
  import {
    type PopoverMember,
    type PopoverWidth,
    popoverGroup,
    popoverWidth,
    screenInset,
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
    tall = false,
    pad = "roomy",
    anchor = null,
    label,
    triggerClass = "",
    triggerData = {},
    haspopup,
    rows,
    prebuild = false,
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
     * As tall as the room on its side of its trigger, past the form's cap: a
     * surface whose list is its subject (the location's repositories), so
     * the list scrolls alone, never inside a scrolling surface.
     */
    tall?: boolean;
    /**
     * The surface's inset: the sheet's own (`roomy`), or the ladder's 4px
     * round a menu whose rows carry their own (`snug`, the trigger menu).
     */
    pad?: "roomy" | "snug";
    anchor?: HTMLElement | AnchorSpot | null;
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
    "aria-label"?: string;
    /** Its content is built while the page is idle, before any press opens it: in a group, the group's surface builds it (`PopoverMember.prebuild`); alone, its own. */
    prebuild?: boolean;
  } = $props();

  /** Its inset from the screen's edge (`screenInset`). */
  const inset = $derived(screenInset());
  /** Its layer's box: on its trigger, or the element its site names (kit anchored.svelte.ts). */
  const layer = layerProps(() => ({
    side: "bottom",
    sideOffset: 6,
    align,
    collisionPadding: inset,
    customAnchor: anchor ?? undefined,
  }));

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
    get prebuild() {
      return prebuild;
    },
    get tall() {
      return tall;
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

  /** Its surface is built: opened once, or built ahead while the page was idle (`prebuild`). */
  let built = $state(false);
  $effect(() => {
    if (open) {
      built = true;
    }
  });
  $effect(() => {
    if (group || built || !prebuild) {
      return;
    }
    return whenIdle(() => {
      built = true;
    });
  });
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
      class={cn("touch-hit select-none", triggerClass)}
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
        class={cn("touch-hit select-none", triggerClass)}
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
      {#if built || open}
        <PopoverPrimitive.ContentStatic
          forceMount
          preventOverflowTextSelection={false}
          data-ns-pop
          data-fit={fit || undefined}
          aria-label={rest["aria-label"]}
          class={cn(
            "ns-theme",
            glidePopoverVariants({ pad, height: tall ? "room" : "cap" })
          )}
          id={`${id}-popover`}
          onCloseAutoFocus={(event) => {
            if (onclosefocus?.()) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            // A press on the element it stands on keeps it, as on its trigger.
            if (
              anchor instanceof HTMLElement &&
              event.target instanceof Node &&
              anchor.contains(event.target)
            ) {
              event.preventDefault();
            }
          }}
          onOpenAutoFocus={(event) => {
            if (!trapFocus) {
              event.preventDefault();
            }
          }}
          style={`--ns-pop-width:${popoverWidth(width)};--ns-pop-gap:${gap}px`}
          {trapFocus}
        >
          {#snippet child({ props, open })}
            {@const seen = open || drawn(props)}
            <!-- Closing, it lets presses through to the page (floating-presence).
               Shut and kept, it stands unseen and out of reach. -->
            <div
              {...layer}
              class={seen ? undefined : "invisible"}
              inert={!seen}
              style:pointer-events={pressable(open)}
            >
              <div
                {...own(props)}
                id={`${id}-popover`}
                role="presentation"
                style:pointer-events={pressable(open)}
                {@attach rows ? highlight({ rows }) : undefined}
                {@attach morph({ followUnfolds: true })}
              >
                {@render children()}
              </div>
            </div>
          {/snippet}
        </PopoverPrimitive.ContentStatic>
      {/if}
    </PopoverPrimitive.Portal>
  </PopoverRoot>
{/if}
