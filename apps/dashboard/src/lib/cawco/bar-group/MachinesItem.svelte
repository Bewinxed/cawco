<script lang="ts">
  /**
   * MachinesButton with its fleet as a prop, for the bar group's states
   * files: the same item (Shell's `.bar-item`, its classes, its Tip, its
   * Solar `server-2` symbol). How a problem shows is the open choice:
   *
   * - `badge` (proposed): the symbol stays in the group's muted ink and a
   *   badge sits on its lower-trailing corner, Apple's own idiom for an
   *   object with a problem, its shape saying which: a cross when a machine
   *   is down (`externaldrive.badge.xmark`), in `status-fail-glyph`, and an
   *   exclamation mark when one needs attention, a sign-in say
   *   (`externaldrive.badge.exclamationmark`), in `status-attn-glyph`. The
   *   disc is 9px across, centred at (22.5, 22.5) of the 28px item. A 1.5px
   *   ring round it (radius 6) is cut from the symbol, and the glyph is cut
   *   from the disc, so the glass shows through both. It arrives scaled from
   *   0.25 with its opacity on `--dur-toggle` and `--ease-out`; with less
   *   motion it only fades.
   * - `tint`: the whole symbol in the status ink.
   *
   * `counted` draws the bar as it ships today: the number of machines beside
   * the symbol (Shell's item-with-a-number recipe, `data-counted`). The
   * words carry the rest in every form: the label and the tooltip naming
   * each machine and what is wrong.
   */
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconServer } from "#lib/icons.js";
  import { dur, easeOut, motionOk } from "../motion/curves.svelte";
  import { type FleetMachine, label, tip, toneOf } from "./fixtures";

  let {
    machines,
    mark,
    counted = false,
  }: {
    machines: readonly FleetMachine[];
    mark: "badge" | "tint";
    /** Today's number beside the symbol. */
    counted?: boolean;
  } = $props();

  const tone = $derived(toneOf(machines));
  const cut = $props.id();

  /** The badge's arrival: from a quarter of its size and clear; a fade alone with less motion. */
  const arrive = (_node: Element) => ({
    duration: dur("--dur-toggle"),
    easing: easeOut,
    css: (t: number) =>
      motionOk.current
        ? `opacity: ${t}; scale: ${0.25 + 0.75 * t}`
        : `opacity: ${t}`,
  });
</script>

<Tip label={tip(machines)}>
  {#snippet children(tipProps)}
    <button
      data-machines
      data-bar-item
      {...tipProps}
      aria-haspopup="dialog"
      aria-label={label(machines)}
      class="bar-item machines mark-line touch-hit press-tint"
      data-counted={counted || undefined}
      data-mark={mark}
      data-tone={tone}
      type="button"
    >
      <IconServer aria-hidden="true" class="bar-symbol" />
      {#if counted}
        <span data-slot="num" class="num">{machines.length}</span>
      {/if}
      {#if mark === "badge" && tone}
        <svg
          data-slot="badge"
          aria-hidden="true"
          class="badge"
          data-glyph={tone === "fail" ? "xmark" : "exclamationmark"}
          viewBox="0 0 9 9"
          transition:arrive
        >
          <mask id="{cut}-mark">
            <circle cx="4.5" cy="4.5" fill="white" r="4.5" />
            {#if tone === "fail"}
              <path
                d="M3.1 3.1 5.9 5.9M5.9 3.1 3.1 5.9"
                stroke="black"
                stroke-linecap="round"
                stroke-width="1.5"
              />
            {:else}
              <rect
                fill="black"
                height="3.5"
                rx="0.75"
                width="1.5"
                x="3.75"
                y="1.5"
              />
              <circle cx="4.5" cy="6.75" fill="black" r="0.75" />
            {/if}
          </mask>
          <circle cx="4.5" cy="4.5" mask="url(#{cut}-mark)" r="4.5" />
        </svg>
      {/if}
    </button>
  {/snippet}
</Tip>

<style>
  /* The whole symbol in the status ink. Named under `.machines` to outrank
     the group's `.bar-symbol` ink, as MachinesButton does. */
  .machines[data-mark="tint"][data-tone="attn"] :global(.bar-symbol) {
    color: var(--status-attn-glyph);
  }
  .machines[data-mark="tint"][data-tone="fail"] :global(.bar-symbol) {
    color: var(--status-fail-glyph);
  }
  /* Proposed: the symbol keeps its ink, a ring round the badge cut out of
     it. The symbol's box is the item's less 4px a side, so the badge's
     centre (22.5, 22.5) is (18.5, 18.5) in it. */
  .machines[data-mark="badge"][data-tone] :global(.bar-symbol) {
    mask: radial-gradient(circle at 18.5px 18.5px, transparent 6px, #000 6px);
  }
  .badge {
    position: absolute;
    inset-block-end: 1px;
    inset-inline-end: 1px;
    inline-size: 9px;
    block-size: 9px;
    pointer-events: none;
  }
  .machines[data-tone="attn"] .badge {
    fill: var(--status-attn-glyph);
  }
  .machines[data-tone="fail"] .badge {
    fill: var(--status-fail-glyph);
  }
</style>
