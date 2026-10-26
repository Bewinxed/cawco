<!--
  Direction 2, The ledger (the designer's report, report-92c112b7): pure
  typography. A kicker in small tracked caps with the count and a refresh
  glyph at its far end; full-width rows parted by hairlines, each the
  suggestion at 15px over its reason at 12px muted, a pencil at the row's
  end because a press leads to editing, not sending. The whole row is the
  button. At the top of Caw's thread; on the empty board, one column at the
  560px reading width. Drawn as specced, its costs included (rows of
  sentences on hairlines can read as history; the kicker carries "these are
  things to say" alone).

  A press tints the row deeper for 120ms (`--dur-control`), the words land
  in the box, the caret after them, and the row's pencil swaps for a check
  for about a second, then swaps back: the swap's two glyphs on one clock
  (`--dur-control`, `--ease-out`), growing from 0.25 out of a 4px blur as the
  send glyph does. With less motion the swap is a fade. Rows stay, so a
  second one can be taken. The ledger fades while the box holds words of
  its own and comes back when it is cleared.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import {
    dur,
    ease,
    motionOk,
  } from "../../../../apps/dashboard/src/lib/cawco/motion/curves.svelte.js";
  import { morph } from "../../../../apps/dashboard/src/lib/cawco/motion/morph.svelte.js";
  import { Skeleton } from "../../../../apps/dashboard/src/lib/components/ui/skeleton/index.js";
  import {
    IconPen,
    IconRefresh,
    IconTick,
  } from "../../../../apps/dashboard/src/lib/icons.js";
  import { IN_THE_BOX, oneClock, putIn, typedOf } from "../clock.js";
  import Composer from "../Composer.svelte";
  import Surround from "../Surround.svelte";

  type Item = { text: string; reason?: string };
  let {
    draws,
    where,
  }: {
    draws: {
      items: Item[];
      loading: boolean;
      expanded: boolean;
      held: "hover" | "focus" | "pressed" | null;
      phase: string;
      touch: boolean;
    };
    where: string;
  } = $props();

  const first = $derived(draws.items[0]?.text ?? "");
  let value = $state(untrack(() => draws.phase === "filled"
      ? first
      : draws.phase === "typing"
        ? typedOf(first)
        : ""));
  let checked = $state<number | null>(untrack(() => draws.phase === "filled" ? 0 : null));
  let expanded = $state(untrack(() => draws.expanded));
  let said = $state("");
  let field = $state<HTMLTextAreaElement>();

  const writing = $derived(draws.loading || draws.phase === "refresh");
  const shown = $derived(expanded ? draws.items : draws.items.slice(0, 4));
  const more = $derived(draws.items.length - shown.length);
  /** The box holds words the person wrote: the ledger fades. */
  const typing = $derived(value !== "" && !draws.items.some((item) => item.text === value));
  const BONES = ["var(--ledger-bone-1)", "var(--ledger-bone-2)", "var(--ledger-bone-3)"];

  /** The pencil and the check trade places, on one clock. */
  function swap(row: HTMLElement, toCheck: boolean) {
    const pencil = row.querySelector<HTMLElement>("[data-pencil]");
    const check = row.querySelector<HTMLElement>("[data-check]");
    if (!(pencil && check)) {
      return Promise.resolve();
    }
    const timing: KeyframeAnimationOptions = {
      duration: dur("--dur-control"),
      easing: ease("--ease-out"),
      fill: "forwards",
    };
    const [leaving, coming] = toCheck ? [pencil, check] : [check, pencil];
    // Each glyph from where it stands to where the other stood: the pencil's
    // rest is under full ink (the preview's own value), the check's is whole.
    const was = Number.parseFloat(getComputedStyle(leaving).opacity);
    const to = Number.parseFloat(
      getComputedStyle(row).getPropertyValue(
        toCheck
          ? "--ledger-check-ink"
          : row.closest("[data-touch]")
            ? "--ledger-pencil-touch"
            : "--ledger-pencil-rest"
      )
    );
    const gone = motionOk.current
      ? { opacity: 0, scale: 0.25, filter: "blur(4px)" }
      : { opacity: 0 };
    const whole = motionOk.current ? { scale: 1, filter: "blur(0px)" } : {};
    const runs = [
      leaving.animate([{ opacity: was, ...whole }, gone], timing),
      coming.animate([gone, { opacity: to, ...whole }], timing),
    ];
    return oneClock(runs).then(() => {
      for (const run of runs) {
        run.cancel();
      }
    });
  }

  async function press(index: number, row: HTMLElement) {
    const words = draws.items[index]?.text ?? "";
    putIn(field, words);
    value = words;
    said = IN_THE_BOX;
    await swap(row, true);
    checked = index;
    await new Promise((done) =>
      setTimeout(done, Number.parseFloat(getComputedStyle(row).getPropertyValue("--ledger-check-hold")))
    );
    await swap(row, false);
    checked = null;
  }
</script>

{#snippet set()}
  {#if draws.items.length > 0 || draws.loading}
    <div
      aria-labelledby="ledger-kicker"
      class="set"
      data-faded={typing || undefined}
      role="group"
      {@attach morph()}
    >
      <div class="kicker">
        <span id="ledger-kicker"
          >{writing ? "Caw is writing suggestions" : `Caw suggests · ${draws.items.length}`}</span
        >
        <button aria-label="Refresh" class="refresh" type="button">
          <IconRefresh aria-hidden="true" class="glyph" />
        </button>
      </div>
      <ul class="rows">
        {#if writing}
          {#each (draws.loading ? [0, 1, 2] : shown.map((_, i) => i)) as slot (slot)}
            <li class="row bones">
              <Skeleton class="bone" line="body" radius="line" style="inline-size: {BONES[slot % 3]}" />
              <Skeleton class="bone" line="meta" radius="line" style="inline-size: var(--ledger-bone-reason)" />
            </li>
          {/each}
        {:else}
          {#each shown as item, i (`${i}:${item.text}`)}
            <li>
              <button
                aria-describedby={item.reason ? `ledger-reason-${i}` : undefined}
                class="row"
                data-held={i === 0 ? draws.held : undefined}
                data-slot="suggestion"
                onclick={(event) => press(i, event.currentTarget)}
                type="button"
              >
                <span class="words">
                  <span class="text" data-slot="suggestion-text">{item.text}</span>
                  {#if item.reason}
                    <span class="reason" data-slot="suggestion-reason" id="ledger-reason-{i}"
                      >{item.reason}</span
                    >
                  {/if}
                </span>
                <span aria-hidden="true" class="mark">
                  <span class="pencil" data-hidden={checked === i || undefined} data-pencil
                    ><IconPen class="glyph" /></span
                  >
                  <span class="check" data-check data-shown={checked === i || undefined}
                    ><IconTick class="glyph" /></span
                  >
                </span>
              </button>
            </li>
          {/each}
          {#if more > 0}
            <li>
              <button class="row more" onclick={() => (expanded = true)} type="button">
                <span class="text">{more} more</span>
              </button>
            </li>
          {/if}
        {/if}
      </ul>
    </div>
  {/if}
{/snippet}

{#snippet foot()}
  <Composer bind:field bind:value focused={where === "keyboard"} />
{/snippet}

<div
  class="ledger"
  data-direction="ledger"
  data-touch={draws.touch || undefined}
  data-where={where}
>
  <!-- The report's own arrangement in Today's surroundings: on the board the
       rows stand at the 560px reading width. -->
  <Surround {foot} {set} {where} />
  <p aria-live="polite" class="sr-only">{said}</p>
</div>

<style>
  .ledger {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
  }

  .set {
    transition: opacity var(--dur-fade) var(--ease-out);

    [data-where="board"] & {
      max-inline-size: var(--board-column);
    }

    &[data-faded] {
      opacity: 0;
      pointer-events: none;
    }
  }

  .kicker {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding-block-end: var(--space-2);
    font-family: var(--font-body);
    font-size: var(--ledger-kicker-size);
    font-weight: var(--weight-strong);
    letter-spacing: var(--ledger-kicker-track);
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  .refresh {
    display: grid;
    place-items: center;
    min-inline-size: var(--c-btn-h-xs);
    min-block-size: var(--c-btn-h-xs);
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;

    &:focus-visible {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-offset);
    }

    [data-touch] & {
      min-inline-size: var(--c-touch-floor);
      min-block-size: var(--c-touch-floor);
    }
  }

  .refresh :global(.glyph),
  .mark :global(.glyph) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }

  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
    border-block-start: 1px solid var(--ledger-hairline);

    & > li {
      border-block-end: 1px solid var(--ledger-hairline);
    }
  }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    inline-size: 100%;
    min-block-size: var(--c-touch-floor);
    padding: var(--space-2) 0;
    border: 0;
    background: transparent;
    color: var(--ink-strong);
    text-align: start;
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);

    @media (hover: hover) {
      &:hover {
        background: var(--ledger-hover-fill);
      }
      &:hover .pencil {
        opacity: 1;
      }
    }

    &[data-held="hover"] {
      background: var(--ledger-hover-fill);

      & .pencil {
        opacity: 1;
      }
    }

    &:focus-visible,
    &[data-held="focus"] {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-inset);
    }

    &:active,
    &[data-held="pressed"] {
      background: var(--ledger-press-fill);
    }

    &.bones {
      display: grid;
      align-content: center;
      gap: var(--space-1);
      cursor: default;
    }
  }

  .words {
    display: grid;
    gap: var(--space-1);
    min-inline-size: 0;
  }

  .text {
    font-family: var(--font-body);
    font-size: var(--ledger-text-size);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }

  .more .text {
    color: var(--ink-muted);
  }

  .reason {
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }

  /* The pencil and the check share one cell; one stands at a time. */
  .mark {
    display: grid;
    place-items: center;
    padding-inline-end: var(--space-1);

    & > * {
      grid-area: 1 / 1;
      display: grid;
    }
  }

  .pencil {
    opacity: var(--ledger-pencil-rest);
    transition: opacity var(--dur-control) var(--ease-out);

    [data-touch] & {
      opacity: var(--ledger-pencil-touch);
    }

    &[data-hidden] {
      opacity: 0;
    }
  }

  .check {
    color: var(--ink-strong);
    opacity: 0;

    &[data-shown] {
      opacity: var(--ledger-check-ink);
    }
  }

  :global(.bone) {
    max-inline-size: 100%;
  }
</style>
