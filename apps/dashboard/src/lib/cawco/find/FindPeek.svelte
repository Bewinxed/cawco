<script lang="ts">
  import type { FindMoment, MomentAuthor } from "./find-client";
  /**
   * A row unfolded in place (→, or ⌄ on a phone): what tells it apart from a
   * sibling with the same title before he commits. Purpose, the last report,
   * up to three moments where the words were said (each one opens the
   * session at that line), and its delegates. Each moment is an option of
   * the finder's listbox, so ↑↓ walk into it and ↵ opens there.
   */
  import { age, excerptParts } from "./find-rows";
  import type { Spoken } from "./finder-state.svelte";

  let {
    id,
    result,
    moments,
    now,
    idOf,
    activeKey,
    keyOf,
    momentsState,
    phone = false,
    onopen,
    onretry,
  }: {
    /** The row names it as its description: `${rowId}-peek`. */
    id: string;
    result: Spoken;
    moments: FindMoment[];
    now: number;
    /** The DOM id of a stop, for the field's active descendant. */
    idOf: (key: string) => string;
    activeKey: string | null;
    keyOf: (i: number) => string;
    /** Whether its machine has been asked for these words yet, or failed to answer. */
    momentsState:
      | { state: "ok" }
      | { state: "asking"; machine: string }
      | { state: "missing"; machine: string };
    phone?: boolean;
    onopen: (moment: FindMoment) => void;
    onretry: () => void;
  } = $props();

  const AUTHOR: Record<MomentAuthor, string> = {
    owner: "you",
    agent: "agent",
    report: "report",
    injected: "injected",
    caw: "Caw",
  };

  const conversation = $derived(result.kind === "conversation" ? result : null);
</script>

<div data-slot="peek" {id} class={["peek", { phone }]}>
  {#if conversation?.purpose}
    <span data-slot="find-peek-label" class="label">purpose</span>
    <span data-slot="value" class="value">{conversation.purpose}</span>
  {/if}
  {#if conversation?.lastReport}
    <span data-slot="find-peek-label" class="label">last</span>
    <span data-slot="value" class="value"
      >report “{conversation.lastReport.headline}”<span class="sep">·</span
      ><span data-slot="num" class="num"
        >{age(conversation.lastReport.at, now)}</span
      ></span
    >
  {/if}
  {#if moments.length > 0}
    <span data-slot="find-peek-label" class="label">said</span>
    <span class="moments" role="presentation">
      {#each moments as moment, i (moment.docId)}
        {@const key = keyOf(i)}
        <button
          id={idOf(key)}
          class="moment"
          aria-selected={activeKey === key}
          data-active={activeKey === key ? "" : undefined}
          data-find-row
          onclick={() => onopen(moment)}
          role="option"
          tabindex="-1"
          type="button"
        >
          <span class="clip"
            >{AUTHOR[moment.author]}{#if moment.at !== null}<span class="sep"
                >·</span
              ><span data-slot="num" class="num">{age(moment.at, now)}</span
              >{/if}<span class="sep">·</span
            >“{#each excerptParts(moment.excerpt) as part, j (j)}{#if part.matched}<mark
                  >{part.text}</mark
                >{:else}{part.text}{/if}{/each}”</span
          >
          <span data-slot="enter" class="enter" aria-hidden="true">↵</span>
        </button>
      {/each}
    </span>
  {:else if momentsState.state === "asking"}
    <span data-slot="find-peek-label" class="label">said</span>
    <span data-slot="value" class="value muted"
      >Asking {momentsState.machine}…</span
    >
  {:else if momentsState.state === "missing"}
    <span data-slot="find-peek-label" class="label">said</span>
    <span data-slot="value" class="value muted"
      >{momentsState.machine} didn't answer<span class="sep">·</span><button
        class="link"
        onclick={onretry}
        type="button">Retry</button
      ></span
    >
  {/if}
  {#if conversation && conversation.children.count > 0}
    <span data-slot="find-peek-label" class="label">delegates</span>
    <span data-slot="value" class="value"
      ><span data-slot="num" class="num">{conversation.children.count}</span
      >{#if conversation.children.needsYou > 0}<span class="sep">·</span><span
          class="attn"
          ><span data-slot="num" class="num"
            >{conversation.children.needsYou}</span
          > needs you</span
        >{/if}</span
    >
  {/if}
  {#if !phone}
    <span data-slot="foot" class="foot" aria-hidden="true"
      >↵ open<span class="sep">·</span>← fold</span
    >
  {/if}
</div>

<style>
  .peek {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    column-gap: var(--space-3);
    row-gap: 2px;
    margin-inline-start: calc(var(--space-3) + var(--icon-md) + var(--space-2));
    margin-block: 0 var(--space-2);
    padding: 4px 0 4px var(--space-3);
    border-inline-start: 1px solid var(--border-control);
    font: var(--type-meta);
    line-height: 20px;
  }
  .label {
    color: var(--ink-subtle);
  }
  .value {
    min-inline-size: 0;
    color: var(--ink-row);
  }
  .muted {
    color: var(--ink-muted);
  }
  .attn {
    color: var(--status-attn-ink);
    font-weight: var(--weight-strong);
  }
  .sep {
    padding-inline: 0.35em;
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  .moments {
    display: grid;
    min-inline-size: 0;
  }
  .moment {
    position: relative;
    display: flex;
    inline-size: calc(100% + 2 * var(--space-1));
    border: 0;
    background: none;
    font: inherit;
    text-align: start;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    margin-inline: calc(-1 * var(--space-1));
    padding-inline: var(--space-1);
    border-radius: var(--radius-xs);
    color: var(--ink-row);
    cursor: default;

    & mark {
      background: none;
      color: var(--ink-strong);
      font-weight: var(--weight-strong);
    }
    &:active {
      background: var(--surface-fill);
    }
  }
  .clip {
    flex: 1;
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .enter {
    color: var(--ink-subtle);
    opacity: 0;
  }
  .moment[data-active] .enter {
    opacity: 1;
  }
  .foot {
    grid-column: 1 / -1;
    color: var(--ink-subtle);
  }
  .link {
    border: 0;
    padding: 0;
    background: none;
    font: inherit;
    color: var(--link-ink);
    cursor: pointer;
  }

  .phone {
    font: var(--type-label);
    font-weight: 400;
    line-height: 28px;
    margin-inline-start: calc(var(--space-3) + var(--icon-md) + var(--space-2));
  }
  .phone .moment {
    min-block-size: 44px;
  }
  .phone .moment .enter {
    opacity: 1;
  }
</style>
