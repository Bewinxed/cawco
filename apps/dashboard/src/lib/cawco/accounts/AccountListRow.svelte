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
  import type { Account } from "@cawco/core";
  import { TextMorph } from "torph/svelte";
  import { morphMs } from "#lib/cawco/motion/curves.svelte.js";
  import { IconChevronRight, IconWarningTriangle } from "#lib/icons.js";
  import { hueVar, nameOf, problemOf } from "./model.svelte";

  let { account }: { account: Account } = $props();

  const href = $derived(`/config/accounts/${account.id}`);
  const name = $derived(
    account.label || account.email ? nameOf(account) : "Not signed in yet"
  );
  const problem = $derived(problemOf(account));
</script>

<li class="arow" data-flip>
  <a class={["link", problem && "two"]} {href}>
    <i aria-hidden="true" class="dot" style:--c={hueVar(account.hue)}></i>
    <span class="name"
      ><span class="words" data-share="title:{href}">{name}</span></span
    >
    {#if problem}
      <span class="problem" data-flip>
        <IconWarningTriangle aria-hidden="true" />
        <TextMorph as="span" duration={morphMs()} text={problem} />
      </span>
    {/if}
    <span aria-hidden="true" class="chev"><IconChevronRight /></span>
  </a>
</li>

<style>
  /* The live Accounts row: a hairline above every row, 11px by 7px of
     padding, 56px tall, its parts 14px apart. */
  .arow {
    container: arow / inline-size;
    display: flex;
    min-width: 0;
    min-height: 56px;
    border-block-start: 1px solid var(--border-hairline);
  }
  .link {
    flex: 1 1 auto;
    min-width: 0;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) 16px;
    grid-template-areas: "dot name chev";
    align-items: center;
    column-gap: var(--space-4);
    row-gap: 2px;
    padding: var(--space-3) var(--space-2);
    color: inherit;
    text-decoration: none;
    transition: var(--transition-control);
  }
  .link.two {
    grid-template-areas:
      "dot name chev"
      ". problem chev";
  }
  /* A wide row tints under the press and moves nothing (The Press Rule). */
  .link:active {
    background-color: var(--surface-fill);
  }
  .link:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-inset);
  }
  .dot {
    grid-area: dot;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--c);
    transition: background-color var(--dur-fade) var(--ease-out);
  }
  .name {
    grid-area: name;
    display: flex;
    min-width: 0;
    font: var(--type-label);
    color: var(--ink-row);
  }
  .words {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .problem {
    grid-area: problem;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    font: var(--type-meta);
    color: var(--status-attn-ink);
    transition: color var(--dur-panel) var(--ease-out);
  }
  .problem :global(svg) {
    flex: none;
    width: 12px;
    height: 12px;
  }
  .chev {
    grid-area: chev;
    display: flex;
    color: var(--ink-subtle);
  }
  .chev :global(svg) {
    width: 16px;
    height: 16px;
  }
  /* At a phone's width the chevron stands on the name's line. */
  @container arow (width < 480px) {
    .chev {
      grid-row: 1;
    }
  }
</style>
