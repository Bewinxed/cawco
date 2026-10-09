<script lang="ts">
  /**
   * One account in its provider's card: its tile, its name, and the chevron,
   * the whole row one link to the account. A second line only when something
   * is wrong, in the attention ink behind the warning glyph; it tints in and
   * its words morph as the problem changes (the board state pill's recipe).
   * Opening it, the name flies into the account page's title and the tile
   * into its tile (motion/share).
   */
  import type { Account } from "@cawco/core";
  import { TextMorph } from "torph/svelte";
  import { morphMs } from "#lib/cawco/motion/curves.svelte.js";
  import { IconChevronRight, IconWarningTriangle } from "#lib/icons.js";
  import AccountTile from "./AccountTile.svelte";
  import { nameOf, problemOf } from "./model.svelte";

  let { account }: { account: Account } = $props();

  const href = $derived(`/config/accounts/${account.id}`);
  const name = $derived(
    account.label || account.email ? nameOf(account) : "Not signed in yet"
  );
  const problem = $derived(problemOf(account));
</script>

<li class="arow" data-flip>
  <a class={["link", problem && "two"]} {href}>
    <span class="tile" data-share="icon:{href}">
      <AccountTile hue={account.hue} provider={account.provider} />
    </span>
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
  .arow {
    container: arow / inline-size;
    min-width: 0;
  }
  /* By type, not child: the list's hover layers (spans) stand before the rows. */
  .arow:not(:first-of-type) {
    border-block-start: 1px solid var(--border-hairline);
  }
  .link {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) 16px;
    grid-template-areas: "tile name chev";
    align-items: center;
    column-gap: var(--space-3);
    row-gap: 2px;
    min-height: var(--c-btn-h-lg);
    padding: var(--space-1) var(--space-4) var(--space-1) var(--space-3);
    color: inherit;
    text-decoration: none;
    transition: var(--transition-control);
  }
  .link.two {
    grid-template-areas:
      "tile name chev"
      "tile problem chev";
    padding-block: var(--space-2);
  }
  .arow:first-of-type .link {
    border-start-start-radius: calc(var(--radius-lg) - 1px);
    border-start-end-radius: calc(var(--radius-lg) - 1px);
  }
  .arow:last-of-type .link {
    border-end-start-radius: calc(var(--radius-lg) - 1px);
    border-end-end-radius: calc(var(--radius-lg) - 1px);
  }
  /* A wide row tints under the press and moves nothing (The Press Rule). */
  .link:active {
    background-color: var(--surface-fill);
  }
  .link:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-inset);
  }
  .tile {
    grid-area: tile;
    display: flex;
    align-self: center;
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
    align-self: center;
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
