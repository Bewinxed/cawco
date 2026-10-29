<script lang="ts">
  /**
   * How far a conversation's plan has got — the progress ring and its figure
   * — as the control that opens the plan over the composer's row
   * (PlanPane), and shuts it again. A chip on
   * the tray row (ui/chip, `variant: "tray"`), the delegate chips' own
   * recipe, so the row is one height on one line.
   *
   * While the plan holds away notes the person hasn't opened (the hub's
   * `awayUnseen`), its glyph wears the needs-you dot on its top-end corner,
   * the glyph cut away round it, its echo three loops and then still: the
   * mark a pin's unread answer wears (DESIGN.md, Status dot; A pin's pill).
   * The dot is decoration: the chip's name says it.
   */
  import { planWords } from "@cawco/core/words/plan";
  import { presenceWords } from "@cawco/core/words/presence";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { IconToolTodo } from "#lib/icons.js";
  import TaskRing from "../TaskRing.svelte";

  let {
    done,
    total,
    open,
    onopen,
    unseen = null,
  }: {
    done: number;
    total: number;
    /** The plan is open over the composer's row. */
    open: boolean;
    onopen: () => void;
    /** The away notes' HH:MM while the person hasn't opened them (core plan.ts `awayUnseen`); null once seen. */
    unseen?: string | null;
  } = $props();

  const label = $derived(
    unseen
      ? `${planWords.ringLabel(done, total)}, ${presenceWords.awayNotesUnseen(unseen)}`
      : planWords.ringLabel(done, total)
  );
</script>

<button
  data-slot="plan-ring"
  aria-label={label}
  aria-pressed={open}
  class={chipVariants({
    variant: "tray",
    class:
      "touch-hit text-ink-muted aria-pressed:text-ink-strong aria-pressed:before:bg-surface-pressed",
  })}
  data-away-unseen={unseen ? "" : undefined}
  data-tray-chip
  onclick={onopen}
  type="button"
>
  <!-- The glyph's box. With the dot, the glyph is cut away round the corner
       the dot stands on (a hole in its mask), so the chip's own fill shows
       round the dot at rest, under the pointer and pressed. -->
  <span class="relative inline-grid flex-none place-items-center" data-box>
    <span
      data-slot="plan-glyph"
      class="inline-grid place-items-center data-dot:mask-(--hole-mask) rtl:data-dot:mask-(--hole-mask-rtl)"
      data-dot={unseen ? "" : undefined}
      style:--hole="calc(var(--status-dot-size) / 2 + var(--status-dot-cut))"
      style:--hole-mask={"radial-gradient(circle at 100% 0, transparent calc(var(--hole) - var(--c-tree-mark-hole-edge)), var(--mask-opaque) calc(var(--hole) + var(--c-tree-mark-hole-edge)))"}
      style:--hole-mask-rtl={"radial-gradient(circle at 0 0, transparent calc(var(--hole) - var(--c-tree-mark-hole-edge)), var(--mask-opaque) calc(var(--hole) + var(--c-tree-mark-hole-edge)))"}
    >
      {#if total > 0}
        <TaskRing {done} size="md" {total} />
      {:else}
        <IconToolTodo aria-hidden="true" class="size-icon-md" />
      {/if}
    </span>
    {#if unseen}
      <!-- mark-line: the dot stands on the glyph's top-end corner, absolutely, not beside the words -->
      <span
        aria-hidden="true"
        class="pointer-events-none absolute -top-(--dot-off) -end-(--dot-off) size-(--status-dot-size) rounded-pill bg-status-attn-glyph"
        data-dot="unseen"
        style:--dot-off="calc(var(--status-dot-size) / 2)"
      >
        <!-- The needs-you dot's echo: three loops, then still. -->
        <span
          class="absolute inset-0 rounded-pill bg-status-attn-glyph opacity-0 motion-safe:opacity-100 motion-safe:animate-attn-echo"
          data-echo
        ></span>
      </span>
    {/if}
  </span>
  <span>{planWords.plan}</span>
  {#if total > 0}
    <span data-slot="num" class="num">{planWords.figure(done, total)}</span>
  {/if}
</button>
