<!--
  Direction 1, Unsent drafts (the designer's report, report-92c112b7):
  the suggestions drawn as the person's own messages not sent yet, outline
  only, right-aligned and anchored on the composer, each hugging its words
  up to 85% of the column, its reason one muted line under it, and one
  provenance line closing the set. On the empty board the stack stands
  right-aligned in a centred 560px column, the composer under it. Drawn as
  specced, its costs included (three left edges per item; the reason under
  a bubble can read as history; the stack dimmed to 50% puts its words under
  4.5:1).

  A press scales the bubble to 0.985 under the hand, then the bubble travels
  down into the box and fades as the rest of the stack dims to 50%, one
  clock (`--dur-morph`, `--ease-out`); the box takes the words, the caret
  after them, and the live region says so. Typing hides the stack; a box
  cleared brings it back. With less motion the travel is a fade.
-->
<script lang="ts">
  import {
    dur,
    ease,
    motionOk,
  } from "../../../../apps/dashboard/src/lib/cawco/motion/curves.svelte.js";
  import { morph } from "../../../../apps/dashboard/src/lib/cawco/motion/morph.svelte.js";
  import { popOut } from "../../../../apps/dashboard/src/lib/cawco/motion/pop.svelte.js";
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
  // The state's own box: filled holds the first words, typing their start.
  // svelte-ignore state_referenced_locally
  let value = $state(
    draws.phase === "filled"
      ? first
      : draws.phase === "typing"
        ? typedOf(first)
        : ""
  );
  // svelte-ignore state_referenced_locally
  let taken = $state<number | null>(draws.phase === "filled" ? 0 : null);
  // svelte-ignore state_referenced_locally
  let expanded = $state(draws.expanded);
  let said = $state("");
  let field = $state<HTMLTextAreaElement>();
  let stack = $state<HTMLElement>();

  const shown = $derived(
    expanded ? draws.items : draws.items.slice(0, 4)
  );
  const more = $derived(draws.items.length - shown.length);
  /** The box holds what a press put there: the stack dims and stays. */
  const holding = $derived(taken !== null && value === draws.items[taken]?.text);
  /** Typing hides the stack; the keyboard up hides it; a cleared box brings it back. */
  const standing = $derived(
    (draws.loading || draws.items.length > 0) &&
      !keyboard &&
      (value === "" || holding)
  );

  async function press(index: number, bubble: HTMLElement) {
    const words = draws.items[index]?.text ?? "";
    const box = field?.getBoundingClientRect();
    const from = bubble.getBoundingClientRect();
    const down = box ? box.top + box.height / 2 - (from.top + from.height / 2) : 0;
    const timing: KeyframeAnimationOptions = {
      duration: dur("--dur-morph"),
      easing: ease("--ease-out"),
      fill: "forwards",
    };
    // The preview's own values, read where they are set (keyframes take no var()).
    const read = (name: string) =>
      Number.parseFloat(getComputedStyle(bubble).getPropertyValue(name));
    const scale = read("--drafts-press-scale");
    const dim = read("--drafts-dim");
    const travel = bubble.closest<HTMLElement>("[data-draft]") ?? bubble;
    const runs = [
      travel.animate(
        motionOk.current
          ? [
              { transform: `translateY(0) scale(${scale})`, opacity: 1 },
              { transform: `translateY(${down}px) scale(${scale})`, opacity: 0 },
            ]
          : [{ opacity: 1 }, { opacity: 0 }],
        timing
      ),
      ...[...(stack?.querySelectorAll<HTMLElement>("[data-draft], [data-provenance], [data-more]") ?? [])]
        .filter((el) => el !== travel)
        .map((el) =>
          el.animate([{ opacity: 1 }, { opacity: dim }], timing)
        ),
    ];
    await oneClock(runs);
    taken = index;
    putIn(field, words);
    value = words;
    said = IN_THE_BOX;
    for (const run of runs) {
      run.cancel();
    }
  }
</script>

{#snippet set()}
  {#if standing}
    <div
      aria-labelledby="drafts-provenance"
      bind:this={stack}
      class="stack"
      data-dimmed={holding || undefined}
      role="group"
      out:popOut
      {@attach morph()}
    >
      {#if draws.loading}
        {#each ["var(--drafts-ghost-1)", "var(--drafts-ghost-2)", "var(--drafts-ghost-3)"] as width (width)}
          <span class="ghost" data-slot="skeleton" style:inline-size={width}></span>
        {/each}
      {:else}
        {#each shown as item, i (`${i}:${item.text}`)}
          <div class="item" data-draft data-taken={(holding && taken === i) || undefined}>
            <button
              aria-describedby={item.reason ? `draft-reason-${i}` : undefined}
              class="draft"
              data-held={i === 0 ? draws.held : undefined}
              data-slot="suggestion"
              onclick={(event) => press(i, event.currentTarget)}
              type="button"
            ><span data-slot="suggestion-text">{item.text}</span></button>
            {#if item.reason}
              <span class="reason" data-slot="suggestion-reason" id="draft-reason-{i}"
                >{item.reason}</span
              >
            {/if}
          </div>
        {/each}
        {#if more > 0}
          <button class="more" data-more onclick={() => (expanded = true)} type="button"
            >{more} more</button
          >
        {/if}
        <p class="provenance" data-provenance id="drafts-provenance">
          written from this project · 1h
        </p>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet foot()}
  <Composer bind:field bind:value focused={keyboard} />
{/snippet}

<div class="drafts" data-direction="drafts" data-touch={draws.touch || undefined} data-where={where}>
  <!-- The report's own arrangement in Today's surroundings: the stack stands
       right-aligned on the composer (a centred 560px column on the board),
       and hides while the keyboard is up. -->
  <Surround anchor="end" {foot} {set} {where} />
  <p aria-live="polite" class="sr-only">{said}</p>
</div>

<style>
  .drafts {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    min-block-size: 0;
  }

  .stack {
    display: flex;
    flex-direction: column;
    align-items: end;
    gap: var(--drafts-gap);
    transition: opacity var(--dur-control) var(--ease-out);

    [data-where="board"] & {
      inline-size: 100%;
      max-inline-size: var(--board-column);
      margin-inline: auto;
    }

    &[data-dimmed] {
      opacity: var(--drafts-dim);
    }
  }

  .item {
    display: flex;
    flex-direction: column;
    align-items: end;
    gap: var(--space-1);
    max-inline-size: var(--drafts-max);

    &[data-taken] {
      visibility: hidden;
    }
  }

  /* The sent message's well, as an outline: its radius, the corner it speaks from kept tight. */
  .draft {
    max-inline-size: 100%;
    padding: var(--drafts-pad-block) var(--drafts-pad-inline);
    border: 1px solid var(--drafts-edge);
    border-radius: var(--well-r) var(--well-r) var(--radius-hair) var(--well-r);
    background: transparent;
    color: var(--ink-strong);
    font: var(--type-prose);
    text-align: start;
    text-wrap: pretty;
    overflow-wrap: anywhere;
    cursor: pointer;
    transition:
      border-color var(--dur-control) var(--ease-out),
      background-color var(--dur-control) var(--ease-out),
      scale var(--dur-control) var(--ease-out);

    @media (hover: hover) {
      &:hover {
        border-color: currentColor;
        background: var(--drafts-hover-fill);
      }
    }

    &[data-held="hover"] {
      border-color: currentColor;
      background: var(--drafts-hover-fill);
    }

    &:focus-visible,
    &[data-held="focus"] {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-offset);
    }

    @media (prefers-reduced-motion: no-preference) {
      &:active,
      &[data-held="pressed"] {
        scale: var(--drafts-press-scale);
      }
    }

    [data-touch] & {
      min-block-size: var(--c-touch-floor);
    }
  }

  .reason {
    font: var(--type-meta);
    color: var(--ink-muted);
    text-align: end;
    text-wrap: pretty;
    overflow-wrap: anywhere;
  }

  /* "3 more": a smaller ghost pill, the bubble's outline at the meta size. */
  .more {
    padding: var(--space-1) var(--space-3);
    border: 1px dashed var(--drafts-edge);
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--ink-muted);
    font: var(--type-meta);
    cursor: pointer;

    &:focus-visible {
      outline: var(--focus-ring-width) solid var(--focus-ring);
      outline-offset: var(--focus-ring-offset);
    }

    [data-touch] & {
      min-block-size: var(--c-touch-floor);
    }
  }

  .provenance {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-align: end;
  }

  /* Loading: three empty outlines, their edge pulsing 20% to 40%; no bars inside. */
  .ghost {
    display: block;
    block-size: calc(1lh + 2 * var(--drafts-pad-block));
    font: var(--type-prose);
    border: 1px solid var(--drafts-ghost-edge-low);
    border-radius: var(--well-r) var(--well-r) var(--radius-hair) var(--well-r);

    @media (prefers-reduced-motion: no-preference) {
      animation: drafts-pulse var(--dur-skeleton-pulse) ease-in-out infinite alternate;
    }
  }

  @keyframes drafts-pulse {
    to {
      border-color: var(--drafts-ghost-edge-high);
    }
  }
</style>
