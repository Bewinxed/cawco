<script lang="ts">
  /**
   * A member as a chip: its face and name in one pill. On a kind's card it
   * is who answers the kind, its chevron saying a press changes who; in the
   * team row it opens the member. A member that can't be reached wears the
   * attention dot on its face, why in its tooltip.
   */
  import type { Member } from "@cawco/core/decides";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { IconChevronDown } from "#lib/icons.js";
  import MemberFace from "./MemberFace.svelte";

  let {
    member,
    change = false,
    pressed = false,
    attention = false,
    ref = $bindable(),
    ...rest
  }: HTMLButtonAttributes & {
    member: Member;
    /** A press changes who: the chevron trails. */
    change?: boolean;
    /** What it opens stands open. */
    pressed?: boolean;
    /** It can't be reached now. */
    attention?: boolean;
    ref?: HTMLElement | null | undefined;
  } = $props();
</script>

<button
  bind:this={ref}
  {...rest}
  class={[
    "mark-line flex min-w-0 max-w-full items-center gap-space-2 rounded-pill py-space-1 ps-space-1 pe-space-3 text-start transition-control can-hover:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid",
    change && "pe-space-2",
    pressed && "bg-surface-pressed",
  ]}
  type="button"
>
  <span class="relative flex" data-box>
    <MemberFace {member} size={28} />
    {#if attention}
      <span
        aria-hidden="true"
        class="absolute -top-px -right-px size-(--status-dot-size) rounded-pill bg-status-attn-glyph ring-2 ring-surface-raised"
      ></span>
    {/if}
  </span>
  <span
    class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"
    >{member.name}</span
  >
  {#if change}
    <IconChevronDown
      aria-hidden="true"
      class="size-icon-sm flex-none text-ink-muted"
    />
  {/if}
</button>
