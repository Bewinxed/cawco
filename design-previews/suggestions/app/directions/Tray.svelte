<!--
  Direction 3, The tray (the designer's report, report-92c112b7): the
  suggestions and the message box are one object. The composer's frame
  holds a tray tinted 3% of the ink (6% at night) over a hairline above its
  field, so the field keeps Today's place at the foot, at Today's width
  everywhere (Today's surroundings, the review's must-fix): a header with
  the count and a collapse chevron, then rows at 14px, each reason at 12px
  under it (shown on hover or focus at a desk, always under a finger). Four
  rows at most; "3 more" grows the tray upward, never down. While the box
  holds words, the tray is one row of chips that scrolls sideways under
  the edge fade; clearing the box opens it again; after the first send it
  stays shut. Drawn as specced otherwise, its costs included (a tall
  composer; three nested surfaces in one control).

  A press carries the row's words 40px down into the field as they fade,
  while the field's words fade in: one clock (`--dur-exit`, `--ease-out`).
  Then the tray folds to its chip row. With less motion, only the fades.
-->
<script lang="ts">
  import {
    dur,
    ease,
    motionOk,
  } from "../../../../apps/dashboard/src/lib/cawco/motion/curves.svelte.js";
  import { morph } from "../../../../apps/dashboard/src/lib/cawco/motion/morph.svelte.js";
  import { chipVariants } from "../../../../apps/dashboard/src/lib/components/ui/chip/index.js";
  import { IconChevronDown } from "../../../../apps/dashboard/src/lib/icons.js";
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

  const keyboard = $derived(where === "keyboard");
  const first = $derived(draws.items[0]?.text ?? "");
  const holds = (phase: string) =>
    phase === "filled" || phase === "scrolled" || phase === "reopened";
  // svelte-ignore state_referenced_locally
  let value = $state(holds(draws.phase) ? first : "");
  // svelte-ignore state_referenced_locally
  let reopened = $state(draws.phase === "reopened");
  let shut = $state(false);
  /** A carry in flight: the tray keeps its rows until the words are in the field. */
  let carrying = $state(false);
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
    (value !== "" || keyboard) && !reopened && !carrying
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
    const carry = Number.parseFloat(getComputedStyle(row).getPropertyValue("--tray-carry"));
    carrying = true;
    putIn(field, words);
    const runs = [
      text.animate(
        motionOk.current
          ? [
              { translate: "0 0", opacity: 1 },
              { translate: `0 ${carry}px`, opacity: 0 },
            ]
          : [{ opacity: 1 }, { opacity: 0 }],
        timing
      ),
      field.animate([{ opacity: 0 }, { opacity: 1 }], timing),
    ];
    await oneClock(runs);
    value = words;
    reopened = false;
    carrying = false;
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

{#snippet set()}
  {#if draws.phase === "sent"}
    <div class="sent" data-slot="sent">{first}</div>
  {/if}
{/snippet}

{#snippet foot()}
  <div class="box">
  <Composer bind:field bind:value focused={keyboard}>
    {#if tray}
      <div class="tray" data-loading={draws.loading || undefined}>
        {#if chips}
          <div class="head" data-slot="tray-count"><span>{label}{count}</span></div>
          <div
            aria-label="{label}{count}"
            bind:this={chipRow}
            class="chip-row kit-edge-fade"
            role="group"
          >
            {#if draws.loading}
              <!-- Loading with the keyboard up: the chip row's own chips, each
                   holding a bar where its words will stand. -->
              {#each [0, 1, 2] as slot (slot)}
                <span aria-hidden="true" class={chipVariants({ class: "chip chip-bones" })}
                  ><span class="bone chip-bar" data-slot="skeleton"></span></span
                >
              {/each}
            {:else}
            {#each draws.items as item, i (`${i}:${item.text}`)}
              <button
                class={chipVariants({ class: "chip" })}
                data-slot="suggestion"
                onclick={() => take(item.text)}
                type="button"
              ><span class="chip-text" data-slot="suggestion-text">{item.text}</span></button>
            {/each}
            {/if}
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
            <ul
              aria-labelledby="tray-label"
              class="rows kit-edge-fade-block"
              data-slot="tray-rows"
              {@attach morph()}
            >
              {#if draws.loading}
                {#each ["var(--tray-bone-1)", "var(--tray-bone-2)", "var(--tray-bone-3)"] as width (width)}
                  <li class="row bones">
                    <span class="bone" data-slot="skeleton" style:inline-size={width}></span>
                    <span class="bone reason-bone" data-slot="skeleton"></span>
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
        <div class="divider">
          {#if draws.loading}<span class="running" data-slot="skeleton"></span>{/if}
        </div>
      </div>
    {/if}
  </Composer>
  </div>
{/snippet}

<div class="tray-direction" data-direction="tray" data-touch={draws.touch || undefined} data-where={where}>
  <!-- Today's surroundings: the composer is Today's box, its field at the
       foot; the suggestions live in the box's own frame over the field, and
       the tray grows upward from it. -->
  <Surround anchor="end" {foot} {set} {where} />
  <p aria-live="polite" class="sr-only">{said}</p>
</div>

<style>
  .tray-direction {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
  }

  /* The tray grows upward from the composer until the heading's room: the
     room above keeps its height (Caw and the heading), and what gives way is
     the foot, down its chain (box, composer, tray) to the rows, which then
     scroll inside under the house edge fade. */
  .tray-direction :global([data-slot="scroll"]) {
    flex-shrink: 0;
  }

  .tray-direction :global([data-slot="foot"]),
  .box,
  .box :global([data-slot="composer"]),
  .tray {
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }

  .sent {
    align-self: end;
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
    flex: none;
    position: relative;
    block-size: 1px;
    overflow: clip visible;
    background: var(--border-hairline);
  }

  /* Loading: an indeterminate line runs along the divider, drawn at its
     2px over the hairline's foot so the tray keeps its loaded height. */
  .running {
    position: absolute;
    inset-block-end: 0;
    block-size: var(--tray-line);
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
    flex: 0 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
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

  /* Held under the hand by day, the muted reason goes strong on the pressed
     fill, as the house press tint does (muted ink there is 3.93:1). */
  :global(:root:not(.dark)) .row:is(:active, [data-held="pressed"]) .reason {
    color: var(--ink-strong);
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

  /* Loading rows: text-shaped bars on the tray's tint, the preview's own ink so they read at night. */
  .bone {
    display: block;
    block-size: 1lh;
    max-inline-size: 100%;
    border-radius: var(--radius-hair);
    background: var(--tray-bone-ink);
    font: var(--type-body);

    @media (prefers-reduced-motion: no-preference) {
      animation: tray-bone var(--dur-skeleton-pulse) ease-in-out infinite alternate;
    }
  }

  /* The reason's bar, where a reason shows unasked (under a finger). */
  .reason-bone {
    display: none;
    inline-size: var(--tray-bone-reason);
    font: var(--type-meta);

    [data-touch] & {
      display: block;
    }
  }

  @keyframes tray-bone {
    to {
      opacity: var(--skeleton-pulse-floor);
    }
  }

  /* A placeholder chip: the chip at its widest, as his long words stand. */
  .chip-row :global(.chip-bones) {
    inline-size: var(--tray-chip-max);
  }

  .chip-bar {
    inline-size: 100%;
    font: inherit;
  }

  .chip-text {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
