<script lang="ts">
  /**
   * One popover surface for a row of triggers. Opening a sibling while one is
   * open glides the surface to the new trigger — position, width and height —
   * and fades the new content in, instead of closing one popover and opening
   * the next. The triggers are NsPopovers rendered anywhere inside `children`.
   */
  import { Popover } from "bits-ui";
  import type { Snippet } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { MediaQuery } from "svelte/reactivity";
  import type { TransitionConfig } from "svelte/transition";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  import {
    type PopoverMember,
    providePopoverGroup,
  } from "./popover-group.svelte";

  let { children }: { children: Snippet } = $props();

  const group = providePopoverGroup();
  const active = $derived(group.members.find((member) => member.open));
  /** What the surface shows; it outlives `active` so the exit plays with content. */
  let shown = $state.raw<PopoverMember | undefined>(undefined);
  /** Set once the open surface retargets a sibling, cleared when it closes. */
  let morphing = $state(false);
  let height = $state(0);

  /** The member the surface was last open on; cleared when it closes. */
  let last: PopoverMember | undefined;
  $effect.pre(() => {
    const next = active;
    if (!next) {
      morphing = false;
      last = undefined;
      return;
    }
    if (last && last !== next) {
      morphing = true;
    }
    last = next;
    shown = next;
  });
  const open = $derived(active !== undefined);

  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  function panelIn(_node: Element): TransitionConfig {
    if (!morphing || reduceMotion.current) {
      return { duration: 0 };
    }
    return {
      duration: 180,
      delay: 60,
      easing: cubicOut,
      css: (t) => `opacity: ${t}`,
    };
  }
  /** A retargeted surface focuses its new content the way a fresh open does. */
  function focusFirst(node: HTMLElement) {
    if (morphing && shown?.trapFocus) {
      node
        .querySelector<HTMLElement>(
          'input:not([disabled]), button:not([disabled]), [tabindex="0"]'
        )
        ?.focus();
    }
  }
</script>

{@render children()}
<Popover.Root
  onOpenChange={(value) => { if (!value) { active?.onchange(false); } }}
  {open}
>
  <Popover.Portal>
    {#if shown}
      <Popover.Content
        align={shown.align}
        aria-label={shown.label}
        class="ns-theme ns-pop"
        collisionPadding={8}
        customAnchor={shown.trigger}
        data-morph={morphing ? '' : undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (shown?.onclosefocus?.()) {
            return;
          }
          const focused = document.activeElement;
          if (!focused || focused === document.body || focused.closest('.ns-pop')) {
            shown?.trigger?.focus();
          }
        }}
        onInteractOutside={(event) => {
          const { target } = event;
          if (target instanceof Node && group.members.some((member) => member.trigger?.contains(target))) {
            event.preventDefault();
          }
        }}
        onOpenAutoFocus={(event) => { if (!shown?.trapFocus) { event.preventDefault(); } }}
        side="bottom"
        sideOffset={6}
        style={`--ns-pop-width:${shown.width}px`}
        trapFocus={shown.trapFocus}
      >
        {#snippet child({ props, wrapperProps })}
          <div {...wrapperProps}>
            <div
              {...props}
              id={`${shown?.id}-popover`}
              role="presentation"
              {@attach shown?.rows ? highlight({ rows: shown.rows }) : undefined}
            >
              <div
                class="ns-morph"
                style:height={height ? `${height}px` : undefined}
              >
                <div class="ns-measure" bind:offsetHeight={height}>
                  {#key shown?.id}
                    <div
                      class="ns-panel-set"
                      style={`--ns-pop-gap:${shown?.gap ?? 0}px`}
                      use:focusFirst
                      in:panelIn
                    >
                      {#if shown}
                        {@render shown.children()}
                      {/if}
                    </div>
                  {/key}
                </div>
              </div>
            </div>
          </div>
        {/snippet}
      </Popover.Content>
    {/if}
  </Popover.Portal>
</Popover.Root>
