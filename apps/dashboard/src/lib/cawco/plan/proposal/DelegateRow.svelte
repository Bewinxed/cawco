<script lang="ts">
  /**
   * A DELEGATE'S ROW (proposal): one row however much it is doing. Its tile
   * (SessionMark: its sprite on its project's hue, the corner status dot),
   * its name and the problem it is on, its time; under them its progress
   * line and one line saying where it stands. Its own steps, its report and
   * the way into its session sit behind its fold, shut until asked for; on
   * a phone in Lanes and Crew first it pushes its page instead.
   */
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconChevronRight,
    IconError,
    IconExternal,
    IconNeedsYou,
    IconWaiting,
  } from "#lib/icons.js";
  import {
    CHEVRON,
    OPEN_SESSION,
    REPORT,
    ROWS,
    TIME,
    TRAIL,
    WORDS,
  } from "./classes";
  import Fold from "./Fold.svelte";
  import type { Delegate } from "./fixtures";
  import ProgressLine from "./ProgressLine.svelte";
  import SubRows from "./SubRows.svelte";
  import { useView } from "./view.svelte";

  let {
    delegate,
    pushes = false,
    line = "share",
    held,
  }: {
    delegate: Delegate;
    /** Pressing it pushes its page (a phone, Lanes and Crew first). */
    pushes?: boolean;
    /** Its progress line: its share of the row beside where it stands, or the row's whole width (drawn large). */
    line?: "share" | "whole";
    /** Its sweep stood at this share of a run (ProgressLine `held`). */
    held?: number;
  } = $props();

  const view = useView();
  const open = $derived(view.opened.has(delegate.id));
  const uid = $props.id();
  const foldId = $derived(`fold-${uid}`);
  const counted = $derived(
    delegate.status === "live" || delegate.status === "attn"
  );
  const time = $derived(
    view.timeOf(
      delegate.id,
      counted ? "doing" : "done",
      delegate.startedAgo,
      delegate.took
    )
  );
  /** Where it stands, in one line: its figure and step, or what it waits on. */
  /**
   * What it needs from the person, said in full where it is opened: its
   * question, or why it failed. The row itself says the state in a word
   * and offers the act beside it, so a row is one line under its title.
   */
  const detail = $derived.by(() => {
    const { wait } = delegate;
    if (wait?.kind === "you") {
      return wait.words.split(" · ").slice(1).join(" · ");
    }
    return wait?.kind === "fail" ? wait.words : "";
  });
  const standing = $derived.by(() => {
    if (delegate.wait?.kind === "you") {
      return "Waiting on you";
    }
    if (delegate.wait?.kind === "fail") {
      return "Failed";
    }
    if (delegate.wait) {
      return delegate.wait.words;
    }
    if (delegate.status === "done") {
      return "Finished";
    }
    const { plan } = delegate;
    const now = delegate.steps.find((one) => one.state === "doing");
    return plan
      ? `${plan.done} of ${plan.total}${now ? ` · ${now.words}` : ""}`
      : "Starting";
  });

  function press(): void {
    if (pushes) {
      view.pushed.id = delegate.id;
      return;
    }
    view.toggle(delegate.id);
  }
</script>

<!-- A row in a narrow column (under a step in Lanes' columns): the problem
     takes the row's width beside the tile, the chevron and time under it,
     and its line and where it stands the row's whole width under those, so
     a state ("Waiting on you", its act Answer beside or under it) keeps one
     line. -->
<li
  class="@container/delegate-row min-w-0"
  data-delegate
  data-flip="box"
  data-row={delegate.id}
>
  <div
    class="grid grid-cols-(--pv-cols) items-start gap-x-space-2 gap-y-space-1 min-h-c-row-lead py-c-plan-row-pad type-label text-ink-strong in-data-coarse:min-h-c-touch-floor in-data-coarse:py-c-plan-row-pad-coarse @max-plan-delegate/delegate-row:grid-cols-(--pv-cols-narrow)"
    data-slot="plan-row"
    data-status={delegate.status}
  >
    <span
      class="col-start-1 row-start-1 grid h-(--pv-lead-h) place-items-center"
      data-lead
      data-tile="d:{delegate.id}"
    >
      <SessionMark
        id={delegate.id}
        place={delegate.place}
        status={delegate.status}
      />
    </span>
    <button
      aria-controls={pushes ? undefined : foldId}
      aria-expanded={pushes ? undefined : open}
      class={[WORDS, "block @max-plan-delegate/delegate-row:me-0"]}
      data-slot="words"
      onclick={press}
      type="button"
    >
      <span class="sr-only">{delegate.name}: </span>
      <span
        class={["font-normal", delegate.status === "done" && "text-ink-muted"]}
        data-slot="problem">{delegate.problem}</span
      >
    </button>
    <span
      class={[
        "mark-line",
        TRAIL,
        "@max-plan-delegate/delegate-row:col-start-2 @max-plan-delegate/delegate-row:row-start-2 @max-plan-delegate/delegate-row:h-auto",
      ]}
      data-slot="trail"
    >
      <span
        aria-hidden="true"
        class={CHEVRON}
        data-box
        data-open={(open && !pushes) || undefined}
        data-slot="chevron"><IconChevronRight /></span
      >
      <span
        class={[
          TIME,
          "@max-plan-delegate/delegate-row:w-auto @max-plan-delegate/delegate-row:text-start",
        ]}
        data-num
        data-slot="time">{time}</span
      >
    </span>
    <!-- The progress line, then where it stands, then its act. The line
         takes the row's room first, up to a fixed share (32%), so every
         delegate's line starts and ends on one x where there is room. Where
         the row is short the line gives way first, to its floor; past that,
         what follows it goes to the next line whole, never through it, so a
         state beside its act ("Waiting on you" by Answer) never breaks. -->
    <span
      class="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1 @max-plan-delegate/delegate-row:col-start-1 @max-plan-delegate/delegate-row:row-start-3"
    >
      <ProgressLine
        class={line === "whole"
          ? "basis-full"
          : "shrink grow-1000 basis-c-plan-line-min max-w-(--pv-line-max)"}
        {delegate}
        {held}
      />
      <!-- Words that wrap take what the line leaves them; a state in a word
           or two (waiting on you, failed) keeps its own width, one line. -->
      <span
        class={[
          "mark-line flex min-w-0 items-start gap-space-1 type-meta [&_svg]:size-icon-sm [&_svg]:flex-none",
          delegate.wait?.kind === "you" && "flex-none text-status-attn-ink",
          delegate.wait?.kind === "fail" && "flex-none text-status-fail-ink",
          delegate.wait?.kind !== "you" &&
            delegate.wait?.kind !== "fail" &&
            "flex-1 text-ink-muted",
        ]}
        data-kind={delegate.wait?.kind}
        data-slot="wait"
      >
        {#if delegate.wait}
          <!-- In a narrow row the state's glyph gives its width back: the
               row's tile says the status in its corner, and the words in
               their state's ink. -->
          <span class="mark-cell @max-plan-delegate/delegate-row:hidden">
            {#if delegate.wait.kind === "you"}
              <IconNeedsYou aria-hidden="true" />
            {:else if delegate.wait.kind === "slot"}
              <IconWaiting aria-hidden="true" />
            {:else}
              <IconError aria-hidden="true" />
            {/if}
          </span>
        {/if}
        <span
          class={[
            "min-w-0 wrap-anywhere text-pretty",
            (delegate.wait?.kind === "you" || delegate.wait?.kind === "fail") &&
              "whitespace-nowrap",
          ]}
          data-slot="wait-words">{standing}</span
        >
      </span>
      <!-- What it needs from you, where it asks: answer its question (as
           Cofounder answers in place), or retry what failed (Relevance AI's
           Resume; every failure names its way back). -->
      {#if delegate.wait?.kind === "you"}
        <span
          class="ms-auto flex flex-none @max-plan-delegate/delegate-row:ms-0"
          data-slot="act"
          ><Button
            class="touch-hit"
            label="Answer"
            size="sm"
            variant="outline"
          /></span
        >
      {:else if delegate.wait?.kind === "fail"}
        <span
          class="ms-auto flex flex-none @max-plan-delegate/delegate-row:ms-0"
          data-slot="act"
          ><Button
            class="touch-hit"
            label="Retry"
            size="sm"
            variant="outline"
          /></span
        >
      {/if}
    </span>
  </div>
  {#if !pushes}
    <Fold id={foldId} {open}>
      <!-- What its fold holds, on the words' column: the question or the
           failure's reason first. -->
      <div
        class="flex flex-col items-start gap-space-2 pt-space-1 pb-space-2 ps-(--pv-tile-in)"
      >
        {#if detail}
          <p
            class={[
              "m-0 type-body wrap-anywhere text-pretty",
              delegate.wait?.kind === "fail"
                ? "text-status-fail-ink"
                : "text-ink-strong",
            ]}
            data-kind={delegate.wait?.kind}
          >
            {detail}
          </p>
        {/if}
        {#if delegate.steps.length > 0}
          <ul class={[ROWS, "self-stretch"]}>
            <SubRows steps={delegate.steps} />
          </ul>
        {/if}
        {#if delegate.report}
          <p class={REPORT} data-slot="report">{delegate.report}</p>
        {/if}
        <span class="flex flex-wrap items-center gap-space-3">
          <button class={["mark-line", OPEN_SESSION]} type="button">
            <span>Open its session</span>
            <IconExternal aria-hidden="true" />
          </button>
          {#if delegate.status === "live" || delegate.status === "attn"}
            <Button label="Stop it" size="xs" variant="outline" />
          {/if}
        </span>
      </div>
    </Fold>
  {/if}
</li>
