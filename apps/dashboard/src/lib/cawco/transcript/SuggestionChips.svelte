<script lang="ts">
  import { untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import {
    dur,
    easeDrawer,
    easeOut,
    lifting,
    motionOk,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconToolGeneric, IconToolMcp, IconToolSkill } from "#lib/icons.js";
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

  /**
   * A chip arrives rising 4px out of 0.96, one after another 30ms apart;
   * reduced motion keeps only its fade.
   */
  function arrive(_node: HTMLElement, { i }: { i: number }) {
    return {
      delay: i * 30,
      duration: dur("--dur-panel"),
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
   * candidate, and not already named in the draft. With nothing ranked the
   * candidates are not read at all: the conversation builds them on first
   * read (SessionPane), and a row with no answer has no use for them.
   */
  const shown = $derived(
    ranked.length === 0
      ? []
      : ranked
          .map((entry) => ({
            candidate: byId.get(entry.id),
            noul: entry.noul,
          }))
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
        failure = failureWords(error);
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
    return lifting(
      node,
      () => {
        const box = node.getBoundingClientRect();
        const frame = (
          node.offsetParent ?? node.parentElement
        )?.getBoundingClientRect();
        return {
          position: "absolute",
          "inset-inline-start": `${box.left - (frame?.left ?? 0)}px`,
          "inset-block-start": `${box.top - (frame?.top ?? 0)}px`,
          "inline-size": `${box.width}px`,
        };
      },
      {
        duration: dur("--dur-control"),
        easing: easeOut,
        css: (t: number) =>
          motionOk.current
            ? `opacity: ${t}; transform: scale(${0.96 + 0.04 * t});`
            : `opacity: ${t}`,
      }
    );
  }
</script>

<!-- Out of flow, standing on the composer's top edge, one line tall whatever
     it holds: every transcript keeps this row clear at its foot (app.css
     `--c-suggest-room`, the row and the step under it), so chips coming,
     going or changing never move the transcript. Past its width the line
     scrolls sideways. The row takes no pointer of its own; what is in it
     does. -->
<!-- The hint and a failure line are bare text over the transcript, so a row
     with anything in it lifts off the page on the transcript's own field: a
     gradient in sRGB, which the theme's gradient utilities (oklab) would
     repaint. -->
<div
  data-slot="suggest"
  style:--chip-block="var(--c-suggest-chip)"
  style:--suggest-bottom="calc(100% + var(--space-2))"
  style:--suggest-lift={"linear-gradient(to top, var(--surface-recess) 55%, var(--surface-recess-clear))"}
  class="absolute inset-x-0 bottom-(--suggest-bottom) flex flex-col justify-end h-c-suggest-row pt-space-4 pointer-events-none has-[[data-slot=suggest-chip],[data-slot=suggest-shimmer],[data-slot=suggest-fail]]:bg-(image:--suggest-lift)"
>
  <!-- Drawn only with something in it: chips, the shimmer of an answer on
       its way, or a failure. Its row is kept whether it is drawn or not
       (app.css `--c-suggest-room`), so coming and going moves nothing. -->
  {#if shown.length > 0 || slow || failure}
    <fieldset
      data-slot="track"
      style:--hit-gap-x="var(--space-2)"
      style:--hit-gap-y="var(--space-2)"
      class="relative min-w-0 m-0 border-none border-current flex flex-nowrap items-center gap-space-2 p-space-1 overflow-x-auto overscroll-x-contain no-scrollbar"
      out:fade={{ duration: dur("--dur-control"), easing: easeOut }}
    >
      <legend class="sr-only flex-none pointer-events-auto"
        >Suggested skills, tools and MCP servers</legend
      >
      {#each shown as { candidate, noul }, i (candidate.id)}
        <!-- Tinted by confidence: `--conf` runs 0 → 1 across the shown range
             (noul 0.6 → 1), and the accent's share of the fill runs 8% → 32%
             with it. The border takes the fill's share at 1.5×, mixed in
             sRGB so the accent reads as if laid over the surface; a
             confidence that moves in place re-tints over --dur-panel. -->
        <button
          data-slot="suggest-chip"
          class="inline-flex items-center h-(--chip-block) gap-space-2 max-w-full py-space-1 ps-space-2 pe-space-3 border border-suggest-tint rounded-sm bg-suggest-tint shadow-tile text-ink-strong text-size-label font-medium whitespace-nowrap cursor-pointer flex-none pointer-events-auto motion-safe:transition-suggest-chip motion-safe:active:transform-(--chip-press) [&:hover]:bg-suggest-tint-hover hover:text-ink-strong mark-line touch-hit"
          onclick={() => choose(candidate)}
          title={`Likely needed · ${Math.round(noul * 100)}%${candidate.description ? `\n${candidate.description}` : ""}`}
          type="button"
          style:--conf={confidence(noul)}
          style:--hit-edge="1px"
          style:--tint="calc(8% + var(--conf) * 24%)"
          style:--chip-press="scale(var(--press-scale))"
          in:arrive={{ i }}
          out:leave
          animate:flip={{
            duration: motionOk.current ? dur("--dur-panel") : 0,
            easing: easeDrawer,
          }}
        >
          {#if candidate.kind === "skill"}
            <IconToolSkill
              data-suggestion-chips-glyph
              aria-hidden="true"
              class="size-icon-md flex-none text-ink-muted"
            />
          {:else if candidate.kind === "tool"}
            <IconToolGeneric
              data-suggestion-chips-glyph
              aria-hidden="true"
              class="size-icon-md flex-none text-ink-muted"
            />
          {:else}
            <IconToolMcp
              data-suggestion-chips-glyph
              aria-hidden="true"
              class="size-icon-md flex-none text-ink-muted"
            />
          {/if}
          <span data-slot="name" class="min-w-0 overflow-clip text-ellipsis"
            >{candidate.name}</span
          >
          <!-- The keyboard's way in: Tab on the first chip, Shift+Tab for all
               of them. A touch screen has no Tab key, so neither hint shows
               there. -->
          {#if i === 0}
            <Kbd aria-hidden="true" class="coarse:hidden" data-box>Tab</Kbd>
          {/if}
          <span class="sr-only"
            >— add “{suggestionLine(candidate)}” to the message</span
          >
        </button>
      {/each}
      {#if shown.length > 1}
        <span
          aria-hidden="true"
          class="inline-flex items-center gap-space-1 text-ink-muted text-size-meta font-normal whitespace-nowrap flex-none pointer-events-auto coarse:hidden"
          ><Kbd>⇧ Tab</Kbd> all</span
        >
      {/if}
      {#if slow && shown.length === 0}
        <!-- A chip's size, held by the kit skeleton only while an ask is
             slow. literal: 9rem -->
        <span
          aria-hidden="true"
          data-slot="suggest-shimmer"
          style:--shimmer-w="9rem"
          style:--shimmer-h="calc(var(--text-label) + var(--space-1) * 2 + 2px)"
          class="shimmer block w-(--shimmer-w) h-(--shimmer-h) flex-none pointer-events-auto"
          in:fade={{ duration: dur("--dur-panel"), easing: easeOut }}
          ><Skeleton class="size-full" /></span
        >
      {/if}
      {#if failure}
        <p
          data-slot="suggest-fail"
          class="m-0 text-ink-muted text-size-meta font-normal whitespace-nowrap flex-none pointer-events-auto"
          role="status"
          in:fade={{ duration: dur("--dur-panel"), easing: easeOut }}
        >
          Suggestions failed: {failure}
        </p>
      {/if}
    </fieldset>
  {/if}
  <p aria-live="polite" class="sr-only">{announced}</p>
</div>
