<script lang="ts">
  /**
   * One account in its provider's group, in the live list's row recipe (a
   * flat row under a hairline): the account's colour as a 10px dot, its
   * name, and the chevron (HIG's disclosure indicator for a drill-in row) in
   * one fixed trailing column, the whole row one link to the account. The
   * provider's mark is the group header's alone. A second line only when
   * something is wrong, in the attention ink behind the warning glyph; it
   * tints in and its words morph as the problem changes (the board state
   * pill's recipe). Opening it, the name flies into the account page's title
   * (motion/share).
   */
  import { type Account, accountsWords as words } from "@cawco/core";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconChevronRight, IconWarningTriangle } from "#lib/icons.js";
  import { hueVar, nameOf, problemOf } from "./model.svelte";

  let { account }: { account: Account } = $props();

  const href = $derived(`/config/accounts/${account.id}`);
  const name = $derived(
    account.label || account.email ? nameOf(account) : words.notSignedInYet
  );
  const problem = $derived(problemOf(account));
</script>

<!-- literal: 56px -->
<li
  class="@container/arow flex min-h-(--row-min) min-w-0 border-t border-t-border-hairline"
  data-flip
  style:--row-min="56px"
>
  <!-- literal: 10px 16px 2px -->
  <a
    class="link grid min-w-0 flex-auto grid-cols-(--link-cols) items-center gap-x-space-4 gap-y-space-row px-space-2 py-space-3 text-inherit no-underline transition-control focus-visible:outline-solid focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset) active:bg-surface-fill"
    data-two={Boolean(problem) || undefined}
    {href}
    style:--link-cols="10px minmax(0, 1fr) 16px"
  >
    <!-- literal: 10px, 50% -->
    <i
      data-slot="dot"
      aria-hidden="true"
      class="size-(--dot) rounded-(--dot-r) bg-(--c) transition-[background-color] dur-fade ease-out"
      style:--area="dot"
      style:--c={hueVar(account.hue)}
      style:--dot="10px"
      style:--dot-r="50%"
    ></i>
    <span
      data-slot="name"
      class="type-label flex min-w-0 text-ink-row"
      style:--area="name"
      ><span data-slot="words" class="truncate" data-share="title:{href}"
        >{name}</span
      ></span
    >
    {#if problem}
      <span
        class="mark-line flex min-w-0 items-center gap-space-1 type-meta text-status-attn-ink transition-[color] dur-panel ease-out"
        data-flip
        style:--area="problem"
      >
        <IconWarningTriangle
          aria-hidden="true"
          class="size-icon-sm flex-none"
        />
        <span><MorphText text={problem} /></span>
      </span>
    {/if}
    <span
      data-slot="chev"
      aria-hidden="true"
      class="flex text-ink-subtle"
      style:--area="chev"><IconChevronRight class="size-icon-md" /></span
    >
  </a>
</li>

<style>
  /* residual: unmapped */
  .link {
    grid-template-areas: "dot name chev";
  }
  .link[data-two] {
    grid-template-areas:
      "dot name chev"
      ". problem chev";
  }
  .link > * {
    grid-area: var(--area);
  }
  /* At a phone's width the chevron stands on the name's line. */
  @container arow (width < 480px) {
    [data-slot="chev"] {
      grid-row: 1;
    }
  }
</style>
