<script lang="ts">
  /**
   * The modal's popover shell: a portaled bits-ui Popover anchored to its
   * trigger (or a caret rect), collision-handled, scaled from the trigger side,
   * and capped rather than full-screen on small screens. Decision §8.6: the design's
   * `fixedOrigin` maths is unnecessary here because the content is portaled.
   */
  import { Popover as PopoverPrimitive } from "bits-ui";
  import type { Snippet } from "svelte";
  import { morph } from "$lib/cawco/motion/morph.svelte";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  import { popoverGroup } from "./popover-group.svelte";

  let {
    id,
    open,
    onchange,
    onclosefocus,
    trigger,
    children,
    width = 320,
    gap = 0,
    align = "start",
    trapFocus = true,
    anchor = null,
    label,
    triggerClass = "",
    triggerStyle,
    haspopup,
    rows,
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
    width?: number;
    gap?: number;
    align?: "start" | "end" | "center";
    trapFocus?: boolean;
    anchor?: { getBoundingClientRect: () => DOMRect } | HTMLElement | null;
    label?: string;
    triggerClass?: string;
    triggerStyle?: string;
    /** What the trigger opens, when it is not a dialog. */
    haspopup?: "listbox" | "menu";
    /** The rows the hover ghost glides between (components/ui/highlight). */
    rows?: string;
    "aria-label"?: string;
  } = $props();

  /**
   * Inside an NsPopoverGroup this is only a trigger: the group owns the one
   * surface and renders this popover's content on it when it is open.
   */
  const group = popoverGroup();
  let triggerEl = $state<HTMLElement | null>(null);
  if (group) {
    $effect(() =>
      group.add({
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
      })
    );
  }
</script>

{#if group}
  {#if trigger}
    <button
      aria-controls={`${id}-popover`}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-label={label}
      class="touch-hit {triggerClass}"
      data-state={open ? 'open' : 'closed'}
      {id}
      onclick={() => onchange(!open)}
      style={triggerStyle}
      type="button"
      bind:this={triggerEl}
    >
      {@render trigger()}
    </button>
  {/if}
{:else}
  <PopoverPrimitive.Root onOpenChange={onchange} {open}>
    {#if trigger}
      <PopoverPrimitive.Trigger
        aria-label={label}
        class="touch-hit {triggerClass}"
        {id}
        style={triggerStyle}
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
        {align}
        aria-label={rest["aria-label"]}
        class="ns-theme ns-pop"
        collisionPadding={8}
        customAnchor={anchor}
        id={`${id}-popover`}
        onCloseAutoFocus={(event) => { if (onclosefocus?.()) { event.preventDefault(); } }}
        onOpenAutoFocus={(event) => { if (!trapFocus) { event.preventDefault(); } }}
        side="bottom"
        sideOffset={6}
        style={`--ns-pop-width:${width}px;--ns-pop-gap:${gap}px`}
        {trapFocus}
      >
        {#snippet child({ props, wrapperProps })}
          <div {...wrapperProps} class="ns-pop-shell">
            <div
              {...props}
              id={`${id}-popover`}
              role="presentation"
              {@attach rows ? highlight({ rows }) : undefined}
              {@attach morph()}
            >
              {@render children()}
            </div>
          </div>
        {/snippet}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  </PopoverPrimitive.Root>
{/if}
