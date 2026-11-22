<script lang="ts">
  /**
   * One outcome and the routines that serve it, on one grid: the head is
   * the outcome's glyph, his sentence and its one reading of where it
   * stands; under it, one row per routine (its glyph, its name, the open
   * control), every row in the same lead column, so the sentence, the
   * names and what a routine that needs him says all start on one text
   * edge. A routine that needs him carries its question or its failure
   * under its name, acted on there (NeedsHere).
   *
   * `fold`: where its routines fold behind the head's disclosure, all but
   * the ones that need him. `narrow`, a tile: shown whole while the view
   * has room (`@container/view` at least 36rem), folded under it. `always`,
   * a line of a ledger: folded at every width until he unfolds them.
   * `surface`: a tile stands on its own raised card; a line stands in its
   * ledger's; a quiet tile has its own card only where the view has room,
   * and under it stands as a line of the one card its neighbours share.
   * The head's glyph and reading stand only on an outcome that is fine:
   * one that needs him has the routine that does right under its sentence,
   * marked and saying it, once.
   */
  import { routineOutcomeWords as words } from "@cawco/core/words/routine-outcomes";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronDown, IconMaximize } from "#lib/icons.js";
  import NeedsHere from "./NeedsHere.svelte";
  import {
    type ActState,
    type GroupProps,
    goingNow,
    needsHim,
    type Outcome,
    type RoutineItem,
    standingOf,
  } from "./outcomes";
  import StandingMark from "./StandingMark.svelte";

  let {
    outcome,
    fold,
    surface,
    opened,
    acts,
    timeOf,
    onopen,
    onanswer,
    onturnon,
  }: GroupProps & {
    outcome: Outcome;
    fold: "narrow" | "always";
    /** Its own raised card: always, only where the view has room (a tile whose card the narrow view merges into one), or never (a ledger's line). */
    surface: "always" | "wide" | "never";
  } = $props();

  /** He unfolded its routines here. */
  let unfolded = $state(false);

  /** It needs him, or he just acted on it here: its result stands where the act was. */
  const isLoud = (item: RoutineItem): boolean =>
    needsHim(standingOf(item)) || acts[item.id]?.kind === "done";
  const loud = $derived(outcome.routines.filter(isLoud));
  const quiet = $derived(outcome.routines.filter((item) => !isLoud(item)));
  const reading = $derived.by(() => {
    const { standing, lead, routines } = outcome;
    switch (standing) {
      case "asks":
        return words.standing.asks(lead.title);
      case "failing":
        return words.standing.failing(lead.title);
      case "paused":
        return words.standing.paused;
      case "finished":
        return words.standing.finished;
      case "running": {
        const open = routines.filter((item) => standingOf(item) !== "finished");
        const running = open.filter((item) => standingOf(item) === "running");
        return running.length === open.length
          ? words.standing.running(running.length)
          : words.standing.someRun(running.length, open.length);
      }
    }
  });
  const sentence = $derived(outcome.sentence ?? words.unplaced);
  const disclosureLabel = $derived(
    unfolded ? words.hide : words.show(quiet.length)
  );
  const actOf = (id: string): ActState => acts[id] ?? { kind: "idle" };
</script>

<section
  data-slot="outcome"
  data-standing={outcome.standing}
  data-fold={fold}
  aria-label={sentence}
  class={[
    "grid content-start gap-space-3",
    surface === "always" &&
      "rounded-lg p-space-3 shadow-tile @min-[36rem]/view:p-space-4",
    surface === "always" &&
      (outcome.standing === "asks" ? "bg-status-attn-bg" : "bg-surface-raised"),
    surface === "wide" &&
      "@min-[36rem]/view:rounded-lg @min-[36rem]/view:bg-surface-raised @min-[36rem]/view:p-space-4 @min-[36rem]/view:shadow-tile",
  ]}
>
  <div data-slot="head" class="grid grid-cols-lead-fluid-end items-start">
    <!-- An outcome carries no glyph: what needs him is marked once, on the
         routine that does, and what is fine stays quiet. -->
    <span aria-hidden="true"></span>
    <div class="flex min-w-0 flex-col gap-space-1">
      <h3
        class={[
          "text-pretty wrap-break-word",
          needsHim(outcome.standing)
            ? "type-row text-ink-strong"
            : "type-label text-ink-muted",
        ]}
      >
        {sentence}
      </h3>
      {#if !needsHim(outcome.standing)}
        <!-- What needs him says itself on its routine's row, just under. -->
        <p class="type-meta text-ink-muted">{reading}</p>
      {/if}
    </div>
    {#if quiet.length > 0}
      <span
        class={[
          "justify-self-end",
          fold === "narrow" && "@min-[36rem]/view:hidden",
        ]}
      >
        <Button
          aria-expanded={unfolded}
          aria-label={disclosureLabel}
          class="group/fold"
          size="icon-xs"
          title={disclosureLabel}
          variant="ghost"
          onclick={() => {
            unfolded = !unfolded;
          }}
        >
          <IconChevronDown
            aria-hidden="true"
            class="size-icon-sm motion-safe:transition-[rotate] motion-safe:duration-(--duration-control) motion-safe:ease-out group-aria-expanded/fold:rotate-180"
          />
        </Button>
      </span>
    {/if}
  </div>

  <ul data-slot="routines" class="grid gap-space-1">
    {#each loud as item (item.id)}
      {@render row(item, true)}
    {/each}
    {#each quiet as item (item.id)}
      {#if fold === "narrow" || unfolded}
        {@render row(item, false)}
      {/if}
    {/each}
  </ul>
</section>

{#snippet row(item: RoutineItem, needs: boolean)}
  {@const standing = standingOf(item)}
  {@const current = opened === item.id}
  <li
    data-routine={item.id}
    class={[
      "grid gap-y-space-2",
      !needs && fold === "narrow" && !unfolded && "@max-[36rem]/view:hidden",
    ]}
  >
    <!-- The row is the item: a press anywhere on it opens the routine, its
         hover and press the row's own; the Maximize glyph at its end is the
         cue, the house's open icon with no box of its own. -->
    <div
      class="group/row relative isolate mark-line grid grid-cols-lead-fluid-end items-center"
    >
      <button
        data-box
        aria-label={words.open(item.title)}
        aria-pressed={current}
        class={[
          "press-tint focus-inset absolute -inset-x-space-2 inset-y-0 -z-1 rounded-sm",
          current ? "bg-selected-bg" : "hover:bg-surface-hover",
        ]}
        onclick={() => onopen(item.id)}
        type="button"
      ></button>
      <span data-box class="pointer-events-none grid">
        {#if needsHim(standing) || goingNow(item)}
          <StandingMark going={goingNow(item)} {standing} />
        {/if}
      </span>
      <span
        class={[
          "pointer-events-none text-pretty wrap-break-word",
          needs ? "type-row text-ink-strong" : "type-body text-ink-muted",
        ]}>{item.title}</span
      >
      <span
        data-box
        aria-hidden="true"
        class={[
          "pointer-events-none grid size-c-btn-h-xs place-items-center justify-self-end",
          current
            ? "text-selected-ink"
            : "text-ink-muted group-hover/row:text-ink-strong",
        ]}
      >
        <IconMaximize class="size-icon-sm" />
      </span>
    </div>
    {#if needs}
      <div class="ps-c-row-lead @min-[36rem]/view:pb-space-2">
        <NeedsHere
          act={actOf(item.id)}
          askedAt={timeOf(
            item.routine.lastRun?.endedAt ??
              item.routine.lastRun?.startedAt ??
              0
          )}
          {item}
          onanswer={(answer) => onanswer(item.id, answer)}
          onturnon={() => onturnon(item.id)}
          standing={standing === "failing" ? "failing" : "asks"}
        />
      </div>
    {/if}
  </li>
{/snippet}
