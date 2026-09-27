<script lang="ts">
  import { untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import { Kbd } from "$lib/components/ui/kbd";
  import { IconToolGeneric, IconToolMcp, IconToolSkill } from "$lib/icons";
  import { bezier, easeOut, motionOk } from "$lib/whiffle/motion/curves.svelte";
  import {
    askSuggestions,
    SUGGEST_PAUSE_MS,
    type SuggestCandidate,
    suggestionLine,
  } from "../suggest.svelte";

  /**
   * The row of suggested skills and MCP servers above the composer's input.
   *
   * Asks Jev once the operator stops typing, about the whole prompt,
   * and shows what it would need as chips, most likely first, each tinted by
   * how likely. A chip click (or Tab, from the composer) adds one plain
   * sentence to the prompt; nothing about the session's tools changes.
   */
  let {
    text,
    candidates,
    oninsert,
  }: {
    /** The composer's current draft. */
    text: string;
    candidates: SuggestCandidate[];
    oninsert: (line: string) => void;
  } = $props();

  const MIN_CHARS = 12;
  /** The shimmer waits this long, so a fast answer never flashes it. */
  const SHIMMER_AFTER_MS = 150;
  /** `--dur-panel` and `--dur-control`, for Svelte's JS-driven flip and exit. */
  const GLIDE_MS = 300;
  const LEAVE_MS = 100;

  /** A cubic-bezier easing, so the JS motion runs on the house curves. */
  /** The glide in place: the settle-in curve the flip has always used. */
  const glide = bezier(0.16, 1, 0.3, 1);

  /**
   * A chip arrives rising 4px out of 0.96, one after another 30ms apart;
   * reduced motion keeps only its fade.
   */
  function arrive(_node: HTMLElement, { i }: { i: number }) {
    return {
      delay: i * 30,
      duration: 280,
      easing: easeOut,
      css: (t: number, u: number) =>
        motionOk.current
          ? `opacity: ${t}; transform: translateY(${4 * u}px) scale(${0.96 + 0.04 * t})`
          : `opacity: ${t}`,
    };
  }

  let ranked = $state<{ id: string; noul: number }[]>([]);
  let failure = $state<string | null>(null);
  let slow = $state(false);
  let asked = "";
  let controller: AbortController | undefined;
  let quiet: ReturnType<typeof setTimeout> | undefined;
  let shimmer: ReturnType<typeof setTimeout> | undefined;

  const byId = $derived(new Map(candidates.map((c) => [c.id, c])));
  /**
   * What to show, in the hub's order (highest noul first): ranked, still a
   * candidate, and not already named in the draft.
   */
  const shown = $derived(
    ranked
      .map((entry) => ({ candidate: byId.get(entry.id), noul: entry.noul }))
      .filter(
        (entry): entry is { candidate: SuggestCandidate; noul: number } =>
          entry.candidate !== undefined &&
          !text.toLowerCase().includes(entry.candidate.name.toLowerCase())
      )
  );

  /** The hub only returns nouls at or above this; the tint spans from it to 1. */
  const TINT_FLOOR = 0.6;
  const confidence = (noul: number): number =>
    (noul - TINT_FLOOR) / (1 - TINT_FLOOR);

  /** What a screen reader hears when a chip is added. */
  let announced = $state("");

  function settle() {
    controller?.abort();
    clearTimeout(quiet);
    clearTimeout(shimmer);
    slow = false;
  }

  async function ask(draft: string) {
    asked = draft;
    controller = new AbortController();
    const { signal } = controller;
    shimmer = setTimeout(() => {
      slow = true;
    }, SHIMMER_AFTER_MS);
    try {
      const answer = await askSuggestions({ text: draft, candidates }, signal);
      // A reply to words that are no longer in the composer is not an answer.
      if (text.trim() === draft) {
        ranked = answer;
        failure = null;
      }
    } catch (error) {
      if (!signal.aborted && text.trim() === draft) {
        failure = error instanceof Error ? error.message : String(error);
      }
    } finally {
      if (!signal.aborted) {
        clearTimeout(shimmer);
        slow = false;
      }
    }
  }

  $effect(() => {
    const draft = text.trim();
    settle();
    if (draft === "") {
      ranked = [];
      failure = null;
      asked = "";
      return;
    }
    if (
      draft.length < MIN_CHARS ||
      draft === asked ||
      untrack(() => candidates.length) === 0
    ) {
      return;
    }
    quiet = setTimeout(() => {
      // biome-ignore lint/complexity/noVoid: the ask reports its own outcome in component state
      void ask(draft);
    }, SUGGEST_PAUSE_MS);
  });

  $effect(() => settle);

  function choose(candidate: SuggestCandidate) {
    ranked = ranked.filter((entry) => entry.id !== candidate.id);
    oninsert(suggestionLine(candidate));
    announced = `Added ${candidate.name}`;
  }

  /**
   * The composer's Tab and Shift+Tab: add the most likely chip still shown, or
   * every shown chip in order, one sentence each, then clear the row. False
   * when no chip is shown, so the key keeps its own meaning.
   */
  export function take(which: "first" | "all"): boolean {
    if (shown.length === 0) {
      return false;
    }
    if (which === "first") {
      choose(shown[0].candidate);
      return true;
    }
    const taken = shown.map((entry) => entry.candidate);
    ranked = [];
    for (const candidate of taken) {
      oninsert(suggestionLine(candidate));
    }
    announced = `Added ${taken.map((candidate) => candidate.name).join(", ")}`;
    return true;
  }

  /**
   * A leaving chip steps out of flow at its last box, so the survivors glide
   * into the gap straight away instead of waiting for it to go.
   */
  function leave(node: HTMLElement) {
    const box = node.getBoundingClientRect();
    const frame = (
      node.offsetParent ?? node.parentElement
    )?.getBoundingClientRect();
    node.style.position = "absolute";
    node.style.insetInlineStart = `${box.left - (frame?.left ?? 0)}px`;
    node.style.insetBlockStart = `${box.top - (frame?.top ?? 0)}px`;
    node.style.inlineSize = `${box.width}px`;
    return {
      duration: LEAVE_MS,
      easing: easeOut,
      css: (t: number) =>
        motionOk.current
          ? `opacity: ${t}; transform: scale(${0.96 + 0.04 * t});`
          : `opacity: ${t}`,
    };
  }
</script>

<div class="suggest">
  <fieldset class="track">
    <legend class="sr-only">Suggested skills, tools and MCP servers</legend>
    {#each shown as { candidate, noul }, i (candidate.id)}
      <button
        class="chip touch-hit"
        onclick={() => choose(candidate)}
        title={`Likely needed · ${Math.round(noul * 100)}%${candidate.description ? `\n${candidate.description}` : ''}`}
        type="button"
        style:--conf={confidence(noul)}
        in:arrive={{ i }}
        out:leave
        animate:flip={{ duration: motionOk.current ? GLIDE_MS : 0, easing: glide }}
      >
        {#if candidate.kind === 'skill'}
          <IconToolSkill aria-hidden="true" class="glyph" />
        {:else if candidate.kind === 'tool'}
          <IconToolGeneric aria-hidden="true" class="glyph" />
        {:else}
          <IconToolMcp aria-hidden="true" class="glyph" />
        {/if}
        <span class="name">{candidate.name}</span>
        {#if i === 0}
          <Kbd aria-hidden="true" class="key">Tab</Kbd>
        {/if}
        <span class="sr-only"
          >— add “{suggestionLine(candidate)}” to the message</span
        >
      </button>
    {/each}
    {#if shown.length > 1}
      <span aria-hidden="true" class="all"><Kbd>⇧ Tab</Kbd> all</span>
    {/if}
    {#if slow && shown.length === 0}
      <span
        aria-hidden="true"
        class="shimmer"
        in:fade={{ duration: 280, easing: easeOut }}
      ></span>
    {/if}
    {#if failure}
      <p
        class="fail"
        role="status"
        in:fade={{ duration: 280, easing: easeOut }}
      >
        Suggestions failed: {failure}
      </p>
    {/if}
  </fieldset>
  <p aria-live="polite" class="sr-only">{announced}</p>
</div>

<style>
  /* Out of flow, standing on the composer's top edge: chips arriving, leaving
     or wrapping never change the composer's measured height, so the transcript
     it clears never moves. A second row grows upward over the transcript. */
  .suggest {
    position: absolute;
    inset-inline: 0;
    bottom: calc(100% + var(--space-2));

    /* The hint and a failure line are bare text over the transcript, so a row
       with anything in it lifts off the page on the transcript's own field. */
    &:has(.chip, .shimmer, .fail) {
      padding-block-start: var(--space-4);
      background: linear-gradient(
        to top,
        var(--surface-recess) 55%,
        oklch(from var(--surface-recess) l c h / 0)
      );
    }
  }

  .track {
    position: relative;
    min-inline-size: 0;
    margin: 0;
    border: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    --hit-gap-x: var(--space-2);
    --hit-gap-y: var(--space-2);
    padding-block: 0;
    padding-inline: var(--space-1);

    &:has(.chip, .shimmer, .fail) {
      padding-block: var(--space-1);
    }
  }

  /* Tinted by confidence: `--conf` runs 0 → 1 across the shown range (noul
     0.6 → 1), and the accent's share of the fill runs 8% → 32% with it. The
     border takes the same share at 1.5×. Mixed in sRGB: the accent reads as
     if laid over the surface. */
  .chip {
    --tint: calc(8% + var(--conf) * 24%);
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    max-inline-size: 100%;
    padding-block: var(--space-1);
    padding-inline: var(--space-2) var(--space-3);
    border: 1px solid
      color-mix(
        in srgb,
        var(--accent-solid) calc(var(--tint) * 1.5),
        var(--surface-raised)
      );
    border-radius: var(--radius-sm);
    background: color-mix(
      in srgb,
      var(--accent-solid) var(--tint),
      var(--surface-raised)
    );
    box-shadow: var(--shadow-tile);
    color: var(--ink-strong);
    font-size: var(--text-label);
    white-space: nowrap;
    cursor: pointer;
    /* A confidence that moves in place re-tints over --dur-panel. */
    @media (prefers-reduced-motion: no-preference) {
      transition:
        transform 160ms var(--ease-out),
        background-color var(--dur-panel) var(--ease-out),
        border-color var(--dur-panel) var(--ease-out),
        color var(--dur-control) var(--ease-out);

      &:active {
        transform: scale(var(--press-scale));
      }
    }

    &:hover {
      background: color-mix(
        in srgb,
        var(--accent-solid) calc(var(--tint) + 6%),
        var(--surface-raised)
      );
      color: var(--ink-strong);
    }

    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    & :global(.glyph) {
      inline-size: 14px;
      block-size: 14px;
      flex: none;
      color: var(--ink-muted);
    }
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The keyboard's way in: Tab on the first chip, Shift+Tab for all of them.
     A touch screen has no Tab key, so neither hint shows there. */
  .all {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--ink-muted);
    font-size: var(--text-label);
    white-space: nowrap;
  }

  @media (pointer: coarse) {
    .chip :global(.key),
    .all {
      display: none;
    }
  }

  /* One low-contrast sweep, only while an ask is slow. */
  .shimmer {
    inline-size: 9rem;
    block-size: calc(var(--text-label) + var(--space-1) * 2 + 2px);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
    opacity: 0.8;

    @media (prefers-reduced-motion: no-preference) {
      background: linear-gradient(
          90deg,
          transparent 0%,
          oklch(from var(--surface-raised) l c h / 0.7) 50%,
          transparent 100%
        )
        var(--surface-recess);
      background-size: 200% 100%;
      animation: sweep calc(var(--c-500) * 3) var(--ease-in-out) infinite;
    }
  }

  @keyframes sweep {
    from {
      background-position: 150% 0;
    }
    to {
      background-position: -50% 0;
    }
  }

  .fail {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-label);
    text-wrap: pretty;
  }
</style>
