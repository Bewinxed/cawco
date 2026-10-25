<!--
  The stage strip (D2, and D1 when its columns can't fit; the phone's P1): a
  chip per stage with its count and the hand on the you-kind stage, the
  kit's option chip on its wrapping row (a chip cloud, never a scroller).
  `chosen` is the stage a phone shows; on a desk a press snaps the board to
  its column, so none is chosen. The chosen chip is a place chosen, not an
  answer picked: it wears the house selected state (`selected-bg`,
  `selected-ink`, the rail's chosen row), never the option chip's coral edge,
  so the view's one coral stays its act.
-->
<script>
  import { STAGES } from "./data.js";
  import { chipsVariants, chipVariants, IconNeedsYou } from "./kit.js";

  let { counts, chosen = null, class: className = "" } = $props();
</script>

<nav data-strip aria-label="Stages" class={chipsVariants({ class: className })}>
  {#each STAGES as stage (stage.key)}
    <button
      data-chip={stage.key}
      aria-pressed={chosen === null ? undefined : chosen === stage.key}
      class={chipVariants({
        variant: "option",
        class: "aria-pressed:border-transparent aria-pressed:bg-selected-bg aria-pressed:text-selected-ink",
      })}
      type="button"
    >
      {#if stage.kind === "you"}
        <IconNeedsYou aria-hidden="true" class="-me-space-1 size-icon-md flex-none text-ink-strong" />
      {/if}
      <span>{stage.name}</span>
      {#if counts[stage.key] > 0}
        <span data-slot="num" class="num type-meta text-ink-muted group-aria-pressed/option:text-selected-ink">{counts[stage.key]}</span>
      {/if}
    </button>
  {/each}
</nav>
