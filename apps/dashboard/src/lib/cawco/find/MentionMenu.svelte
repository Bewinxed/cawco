<script lang="ts">
  /**
   * The @ menu (DESIGN.md, Composer, "Slash and @ menu"): a floating surface
   * above the field and matched to its width, growing from its bottom edge,
   * flat rows in one group. Its rows are the finder's rows, whole: a long
   * title clips on the desk only past the menu's width, and wraps on a phone.
   * It is placed by its host: the composer's own box, `position: relative`.
   *
   * States: candidates; a skeleton row once a wait outlasts the grace; "No
   * sessions for …" on its one row; "Can't reach the hub" on its one row.
   * The "@" and what follows stay plain text whatever it says.
   */
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    dur,
    easeDrawer,
    easeOut,
    motionOk,
  } from "../motion/curves.svelte.js";
  import { dragToDismiss } from "../motion/drag.svelte.js";
  import { morph } from "../motion/morph.svelte.js";
  import { reflow } from "../motion/rows.svelte.js";
  import FindRow from "./FindRow.svelte";
  import type { FindResult } from "./find-client";
  import { rowOf } from "./find-rows";
  import { GRACE_MS } from "./finder-state.svelte";
  import type { MentionState } from "./mention.svelte";

  let {
    mention,
    id,
    phone = false,
    onpick,
    ondismiss,
  }: {
    mention: MentionState;
    /** The listbox's id; each row's is `${id}-${key}`. */
    id: string;
    phone?: boolean;
    onpick: (result: FindResult) => void;
    ondismiss: () => void;
  } = $props();

  const keyOf = (r: FindResult) => `${r.kind}:${r.id}`;
  const activeKey = $derived(mention.active ? keyOf(mention.active) : null);

  let late = $state(false);
  const waiting = $derived(mention.answer.state === "asking");
  $effect(() => {
    if (!waiting) {
      late = false;
      return;
    }
    const t = setTimeout(() => {
      late = true;
    }, GRACE_MS);
    return () => clearTimeout(t);
  });

  /** Grows from its bottom edge as it fades in; leaves the same way, faster. */
  function grow(
    _node: Element,
    _p: unknown,
    { direction }: { direction: "in" | "out" | "both" }
  ) {
    const out = direction === "out";
    const travel = motionOk.current;
    return {
      duration: dur(out ? "--dur-exit" : "--dur-pop"),
      easing: out ? easeOut : easeDrawer,
      css: (t: number) =>
        travel
          ? `opacity: ${t}; transform: translateY(${(1 - t) * 6}px) scale(${0.96 + 0.04 * t})`
          : `opacity: ${t}`,
    };
  }
</script>

<!-- Focus never leaves the field: the menu swallows the mousedown that would
     blur it, so a picked row lands its chip where the words were typed. -->
<!-- biome-ignore lint/a11y/noStaticElementInteractions: the mousedown handler only keeps the focus in the field; the rows are its controls -->
<div
  class={["menu", { phone }]}
  onmousedown={(event) => event.preventDefault()}
  role="presentation"
  transition:grow
  {@attach morph({ rows: true })}
  {@attach phone
    ? dragToDismiss({ edge: "bottom", dismiss: ondismiss })
    : undefined}
>
  <div
    {id}
    class="rows"
    aria-label="Name a session, thread or machine"
    role="listbox"
    {@attach reflow()}
    {@attach highlight({ rows: "[data-find-row]", hovered: "data-active" })}
  >
    {#if mention.answer.state === "unreached"}
      <p class="line" data-flip>
        Can't reach the hub. Nothing can be named until it's back.
        <button class="link" onclick={() => mention.retry()} type="button"
          >Retry</button
        >
      </p>
    {:else if mention.answer.state === "refused"}
      <p class="line" data-flip>{mention.answer.detail}</p>
    {:else if mention.candidates.length > 0}
      {#each mention.candidates as result (keyOf(result))}
        {@const key = keyOf(result)}
        <FindRow
          id={`${id}-${key}`}
          active={activeKey === key}
          now={mention.now}
          onhover={() => {
            mention.chosen = key;
          }}
          onpick={() => onpick(result)}
          {phone}
          row={rowOf(result, mention.now)}
        />
      {/each}
    {:else if mention.current && mention.answer.state === "ok"}
      <p class="line" data-flip>No sessions for “{mention.words}”</p>
    {:else if late}
      <Skeleton class="menu-skeleton" />
    {/if}
  </div>
</div>

<style>
  .menu {
    position: absolute;
    inset-inline: 0;
    inset-block-end: calc(100% + var(--space-2));
    z-index: 2;
    transform-origin: bottom center;
    overflow: hidden;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);
  }
  .rows {
    isolation: isolate;
    display: flex;
    flex-direction: column;
    padding: 6px;
  }
  .line {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    font: var(--type-label);
    font-weight: 400;
    color: var(--ink-muted);
  }
  .link {
    border: 0;
    padding: 0;
    background: none;
    font: inherit;
    color: var(--link-ink);
    cursor: pointer;
  }
  .menu :global(.menu-skeleton) {
    block-size: 36px;
    margin: 8px var(--space-3);
  }
  .phone .line {
    font-size: 16px;
    line-height: 24px;
  }
</style>
