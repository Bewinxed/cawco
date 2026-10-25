<!--
  Direction 3, The tray (the designer's report, report-92c112b7): the
  suggestions and the message box are one object. The composer's frame
  continues down past a hairline into a tray tinted 3% of the ink (6% at
  night): a header with the count and a collapse chevron, then rows at
  14px, each reason at 12px under it (shown on hover or focus at a desk,
  always under a finger). Four rows at most; "3 more" grows the tray
  upward, never down. While the box holds words, the tray is one row of
  chips that scrolls sideways under the edge fade; clearing the box opens
  it again; after the first send it stays shut. On the empty board the box
  and its tray stand centred at 560px. Drawn as specced, its costs included
  (a tall composer; three nested surfaces in one control).

  A press lifts the row's words 40px up into the field as they fade, while
  the field's words fade in: one clock (`--dur-exit`, `--ease-out`). Then
  the tray folds to its chip row. With less motion, only the fades.
-->
<script lang="ts">
  import {
    dur,
    ease,
    motionOk,
  } from "../../../../apps/dashboard/src/lib/cawco/motion/curves.svelte.js";
  import { morph } from "../../../../apps/dashboard/src/lib/cawco/motion/morph.svelte.js";
  import { chipVariants } from "../../../../apps/dashboard/src/lib/components/ui/chip/index.js";
  import { Skeleton } from "../../../../apps/dashboard/src/lib/components/ui/skeleton/index.js";
  import { IconChevronDown } from "../../../../apps/dashboard/src/lib/icons.js";
  import { IN_THE_BOX, oneClock, putIn, typedOf } from "../clock.js";
  import Composer from "../Composer.svelte";

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

  const keyboard = $derived(where === "keyboard");
  const first = $derived(draws.items[0]?.text ?? "");
  const holds = (phase: string) =>
    phase === "filled" || phase === "scrolled" || phase === "reopened";
  // svelte-ignore state_referenced_locally
  let value = $state(holds(draws.phase) ? first : "");
  // svelte-ignore state_referenced_locally
  let reopened = $state(draws.phase === "reopened");
  let shut = $state(false);
  /** A lift in flight: the tray keeps its rows until the words are up. */
  let lifting = $state(false);
  // svelte-ignore state_referenced_locally
  let expanded = $state(draws.expanded);
  let said = $state("");
  let field = $state<HTMLTextAreaElement>();
  let chipRow = $state<HTMLElement>();

  /** After the first send the tray stays shut; with nothing to offer there is none. */
  const tray = $derived(
    (draws.items.length > 0 || draws.loading) && draws.phase !== "sent"
  );
  /** The box holds words (or the keyboard is up): the tray is its chip row, unless reopened. */
  const chips = $derived(
    (value !== "" || keyboard) && !reopened && !draws.loading && !lifting
  );
  const shown = $derived(expanded ? draws.items : draws.items.slice(0, 4));
  const more = $derived(draws.items.length - shown.length);
  const label = $derived(where === "board" ? "Things you might say" : "You might say");
  const count = $derived(draws.loading ? "" : ` · ${draws.items.length}`);

  $effect(() => {
    // The scrolled state: the chip row moved along, as a finger leaves it.
    if (draws.phase === "scrolled" && chipRow) {
      chipRow.scrollLeft = chipRow.scrollWidth / 3;
    }
  });

  async function press(index: number, row: HTMLElement) {
    const words = draws.items[index]?.text ?? "";
    const text = row.querySelector<HTMLElement>("[data-slot='suggestion-text']");
    if (!(text && field)) {
      return;
    }
    const timing: KeyframeAnimationOptions = {
      duration: dur("--dur-exit"),
      easing: ease("--ease-out"),
      fill: "forwards",
    };
    const lift = Number.parseFloat(getComputedStyle(row).getPropertyValue("--tray-lift"));
    lifting = true;
    putIn(field, words);
    const runs = [
      text.animate(
        motionOk.current
          ? [
              { translate: "0 0", opacity: 1 },
              { translate: `0 ${lift}px`, opacity: 0 },
            ]
          : [{ opacity: 1 }, { opacity: 0 }],
        timing
      ),
      field.animate([{ opacity: 0 }, { opacity: 1 }], timing),
    ];
    await oneClock(runs);
    value = words;
    reopened = false;
    lifting = false;
    said = IN_THE_BOX;
    for (const run of runs) {
      run.cancel();
    }
  }

  function take(words: string) {
    putIn(field, words);
    value = words;
    said = IN_THE_BOX;
  }

  $effect(() => {
    // A box cleared opens the tray again.
    if (value === "") {
      reopened = false;
    }
  });
</script>

{#snippet sentWell()}
  <div class="sent" data-slot="sent">{first}</div>
{/snippet}

<div class="tray-direction" data-direction="tray" data-touch={draws.touch || undefined} data-where={where}>
  <div class="column">
    {#if draws.phase === "sent"}
      <div class="thread">{@render sentWell()}</div>
    {:else if where !== "board"}
      <div class="room"></div>
    {/if}
    <Composer bind:field bind:value focused={keyboard}>
      {#if tray}
        <div class="tray" data-loading={draws.loading || undefined}>
          <div class="divider">
            {#if draws.loading}<span class="running" data-slot="skeleton"></span>{/if}
          </div>
          {#if chips}
            <div
              aria-label="{label}{count}"
              bind:this={chipRow}
              class="chip-row kit-edge-fade"
              role="group"
            >
              {#each draws.items as item, i (`${i}:${item.text}`)}
                <button
                  class={chipVariants({ class: "chip" })}
                  data-slot="suggestion"
                  onclick={() => take(item.text)}
                  type="button"
                ><span class="chip-text" data-slot="suggestion-text">{item.text}</span></button>
              {/each}
            </div>
          {:else}
            <div class="head">
              <span id="tray-label">{label}{count}</span>
              <button
                aria-expanded={!shut}
                aria-label={shut ? "Open" : "Close"}
                class="chevron"
                data-shut={shut || undefined}
                onclick={() => (shut = !shut)}
                type="button"
              ><IconChevronDown aria-hidden="true" class="glyph" /></button>
            </div>
            {#if !shut}
              <ul aria-labelledby="tray-label" class="rows" {@attach morph()}>
                {#if draws.loading}
                  {#each ["var(--tray-bone-1)", "var(--tray-bone-2)", "var(--tray-bone-3)"] as width (width)}
                    <li class="row bones">
                      <Skeleton line="body" radius="line" style="inline-size: {width}" />
                    </li>
                  {/each}
                {:else}
                  {#each shown as item, i (`${i}:${item.text}`)}
                    <li>
                      <button
                        aria-describedby={item.reason ? `tray-reason-${i}` : undefined}
                        class="row"
                        data-held={i === 0 ? draws.held : undefined}
                        data-slot="suggestion"
                        onclick={(event) => press(i, event.currentTarget)}
                        type="button"
                      >
                        <span class="text" data-slot="suggestion-text">{item.text}</span>
                        {#if item.reason}
                          <span class="reason" data-slot="suggestion-reason" id="tray-reason-{i}"
                            >{item.reason}</span
                          >
                        {/if}
                      </button>
                    </li>
                  {/each}
                  {#if more > 0}
                    <li>
                      <button class="row more" onclick={() => (expanded = true)} type="button"
                        ><span class="text">{more} more</span></button
                      >
                    </li>
                  {/if}
                {/if}
              </ul>
            {/if}
          {/if}
        </div>
      {/if}
    </Composer>
    {#if where === "board"}<div class="room"></div>{/if}
  </div>
  <p aria-live="polite" class="sr-only">{said}</p>
</div>

<style>
  .tray-direction {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
  }

  .column {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-4);
    inline-size: 100%;
    min-block-size: 0;

    [data-where="board"] & {
      max-inline-size: var(--board-column);
      margin-inline: auto;
    }
  }

  .room {
    flex: 1 1 auto;
  }

  .thread {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    justify-content: end;
    align-items: end;
  }

  /* The reader's sent message, as the thread draws its well. */
  .sent {
    max-inline-size: var(--drafts-max);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--well-r);
    background: var(--surface-recess-deep);
    box-shadow: inset 0 0 0 1px var(--well-edge);
    font: var(--type-prose);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }

  .tray {
    background: var(--tray-tint);
  }

  .divider {
    position: relative;
    block-size: 1px;
    overflow: hidden;
    background: var(--border-hairline);

    [data-loading] & {
      block-size: var(--tray-line);
    }
  }

  /* Loading: an indeterminate line runs along the divider. */
  .running {
    position: absolute;
    inset-block: 0;
    inline-size: 30%;
    background: var(--ink-muted);

    @media (prefers-reduced-motion: no-preference) {
      animation: tray-run var(--dur-loop) linear infinite;
    }
  }

  @keyframes tray-run {
    from {
      translate: -100% 0;
    }
    to {
      translate: 340% 0;
    }
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--tray-pad-inline) 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }

  .chevron {
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

    &[data-shut] :global(.glyph) {
      scale: 1 -1;
    }

    &:focus-visible {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-offset);
    }

    [data-touch] & {
      min-inline-size: var(--c-touch-floor);
      min-block-size: var(--c-touch-floor);
    }
  }

  .chevron :global(.glyph) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }

  .rows {
    margin: 0;
    padding: 0 0 var(--space-1);
    list-style: none;
  }

  .row {
    display: grid;
    align-content: center;
    gap: var(--space-1);
    inline-size: 100%;
    min-block-size: var(--c-touch-floor);
    padding: var(--space-2) var(--tray-pad-inline);
    border: 0;
    background: transparent;
    color: var(--ink-strong);
    text-align: start;
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);

    @media (hover: hover) {
      &:hover {
        background: var(--tray-hover-fill);
      }
      &:hover .reason {
        display: block;
      }
    }

    &[data-held="hover"] {
      background: var(--tray-hover-fill);
    }

    &:focus-visible,
    &[data-held="focus"] {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-inset);
    }

    &:active,
    &[data-held="pressed"] {
      background: var(--surface-pressed);
    }

    &.bones {
      cursor: default;
    }
  }

  .text {
    font: var(--type-body);
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }

  .more .text {
    color: var(--ink-muted);
  }

  /* A desk shows the reason on hover or focus; a finger always. */
  .reason {
    display: none;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
    overflow-wrap: anywhere;

    .row:focus-visible &,
    .row[data-held] &,
    [data-touch] & {
      display: block;
    }
  }

  .chip-row {
    display: flex;
    gap: var(--space-2);
    padding: var(--space-2) var(--tray-pad-inline);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  .chip-row :global(.chip) {
    flex: none;
    max-inline-size: var(--tray-chip-max);
  }

  .chip-text {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
