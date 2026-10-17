<script lang="ts">
  import CollapsibleLazy from "#lib/components/ui/collapsible/collapsible-lazy.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { IconChevronRight } from "#lib/icons.js";
  import type { SubagentState } from "#lib/utils/flow-types.js";
  import { formatDuration } from "#lib/utils/time.js";
  import MessageBody from "../MessageBody.svelte";
  import { markHue, sessionSprite } from "../mark";
  import { modelLabel } from "../models.svelte";
  import { tickingClock } from "../motion/clock.svelte.js";
  /**
   * A harness subagent — the run a Task call spawned in-process, folded onto
   * the parent's spine as a branch you can watch rather than a paragraph you
   * read. A fleet delegate is a session of its own and has its own card. The head is its
   * identity and a status pill; the live line says what it is doing at this
   * instant; the fold opens its own transcript, rendered through the same row
   * grammar as the main one (`branchRows`).
   */
  import type { Message } from "../types";
  import CompactionDivider from "./CompactionDivider.svelte";
  import { disclosure } from "./disclosure.svelte";
  import MessageRow from "./MessageRow.svelte";
  import { subagentView } from "./present";
  import { branchRows, wellRuns } from "./rows";
  import Thinking from "./Thinking.svelte";
  import ToolGroup from "./ToolGroup.svelte";

  let { branch, spawn }: { branch: SubagentState; spawn: Message } = $props();

  const view = $derived(subagentView(branch));
  /** Kept by the call that spawned it, so a branch the reader opened stays open. */
  const open = $derived(disclosure(spawn));
  const rows = $derived(branchRows(branch));
  const runs = $derived(wellRuns(rows));
  const seed = $derived(branch.toolUseId || branch.subagentType);
  const Sprite = $derived(sessionSprite(seed));
  const title = $derived(
    branch.description ||
      spawn.metadata?.subagentDescription ||
      branch.subagentType
  );
  const model = $derived(branch.model ?? spawn.metadata?.subagentModel);
  const failed = $derived(branch.status === "error");
  const phase = $derived.by(() => {
    if (failed) {
      return "failed";
    }
    return view.running ? "running" : "done";
  });

  // Elapsed is a clock, not a frame: a running branch has to re-read it on its
  // own, or the pill freezes at whatever second its last message arrived — and
  // only while the card is on show, or a page nobody is looking at spends a
  // second a row re-writing text (motion/clock).
  const clock = tickingClock(() => view.running);
  const elapsed = $derived(
    formatDuration(
      (branch.completedAt ? Date.parse(branch.completedAt) : clock.now) -
        Date.parse(branch.startedAt)
    )
  );

  /** A settled branch's headline: its first line, at a scannable length. */
  const headline = (text: string): string => {
    const line =
      text
        .split("\n")
        .map((each) => each.trim())
        .find(Boolean) ?? "";
    return line.length > 120 ? `${line.slice(0, 119)}…` : line;
  };
</script>

<!-- The spine is the rail row every rail block uses (app.css `.rail-row`). -->
<div data-slot="rail-row" class="rail-row">
  <Collapsible.Root bind:open={open.get, open.set}>
    <!-- A disclosure header is as wide as its card, so it does not scale on
         press (that read as the whole card shrinking); it takes .press-tint.
         On a touch screen it is the card's only control, so a real target. -->
    <!-- literal: 26px -->
    <!-- literal: 44px -->
    <Collapsible.Trigger
      data-bhead
      class="group/bhead rail-line press-tint min-h-(--bhead-min) coarse:min-h-(--bhead-min-coarse) w-full text-size-label font-medium bg-transparent border-none border-current rounded-xs p-0 text-inherit cursor-pointer text-start transition-[color] dur-control ease-out"
      style="--bhead-min: 26px; --bhead-min-coarse: 44px"
    >
      <!-- The per-session identity sprite, on its --mark-N hue square,
           filling the glyph cell. -->
      <!-- literal: 11px -->
      <span
        data-rail-cell
        data-slot="mark"
        aria-hidden="true"
        class="rail-cell rounded-xs bg-mark-overlay bg-(--mark-bg)"
        style:--mark-bg="var(--mark-{markHue(seed)})"
        style:--sprite="11px"
        ><Sprite class="size-(--sprite) block text-mark-glyph" /></span
      >
      <!-- literal: 40% -->
      <span
        class="font-(family-name:--font-mono) text-ink-strong group-hover/bhead:text-ink-strong text-size-label flex-none overflow-clip text-ellipsis whitespace-nowrap max-w-(--tk-max)"
        style:--tk-max="40%">{branch.subagentType}</span
      >
      <!-- The disclosure affordance: one glyph in currentColor, rotated by
           its own state rather than swapped for a second asset. -->
      <!-- literal: 13px -->
      <!-- literal: rotate(90deg) -->
      <span
        data-slot="chev"
        aria-hidden="true"
        class="size-(--chev) flex-none grid place-items-center text-ink-muted motion-safe:transition-[transform] motion-safe:dur-control motion-safe:ease-out group-state-open/bhead:transform-(--chev-turn)"
        data-box
        style:--chev="13px"
        style:--chev-turn="rotate(90deg)"
        ><IconChevronRight class="size-icon-sm block" /></span
      >
      {#if title !== branch.subagentType}
        <span
          class="text-ink-muted text-size-meta font-normal overflow-clip text-ellipsis whitespace-nowrap min-w-0 flex-auto"
          >{title}</span
        >
      {/if}
      {#if model}
        <span
          data-slot="model"
          class="text-ink-muted text-size-meta font-normal flex-none whitespace-nowrap"
          >{modelLabel(model)}</span
        >
      {/if}
      <!-- The clock is a timer (live off): in the transcript's log the phase
           and its steps are read when they change, not every second. Its
           words on their x-height in the box (.mark-text): 2px past the
           trim's room given back, so the box keeps its height. -->
      <span
        class="mark-text ms-auto flex-none text-size-meta font-normal num rounded-xs py-(--pill-py) px-space-2 bg-status-idle-bg text-status-idle-ink status-running:bg-status-live-bg status-running:text-status-live-ink status-done:bg-status-done-bg status-done:text-status-done-ink status-failed:bg-status-fail-bg status-failed:text-status-fail-ink"
        data-status={phase}
        data-subagent-phase={phase}
        data-box
        style:--pill-py="calc(2px + (1lh - 1ex) / 2)"
        {@attach clock.watch}
      >
        {phase}
        {#if view.steps}
          · {view.steps} step{view.steps === 1 ? "" : "s"}
        {/if}
        <span role="timer">· {elapsed}</span>
      </span>
    </Collapsible.Trigger>

    <!-- Always visible: the observability at a glance, no expand needed. -->
    <!-- The live line: its words at the text column, the beat in the glyph
         column under the mark. -->
    <!-- Its glyph cell is one line tall, so the beat sits on the first line
         of a line that wraps. The beat is the second cue, never the only
         one: the pill already says "running" in words beside it. Still:
         running is said by its hue and the pill, not a loop. -->
    {#if view.running}
      <!-- literal: 68ch -->
      <p
        data-slot="now"
        class="rail-line mt-space-1 mb-0 items-box-start text-size-meta font-normal text-ink-strong leading-body max-w-(--measure)"
        style:--measure="68ch"
      >
        <!-- literal: 5px -->
        <!-- literal: 50% -->
        <span data-slot="rail-cell" aria-hidden="true" class="rail-cell h-lh"
          ><span
            class="size-(--beat) flex-none rounded-(--beat-r) bg-status-live-glyph"
            style:--beat="5px"
            style:--beat-r="50%"
          ></span></span
        ><span>{view.currentStep}</span>
      </p>
    {:else if failed && branch.error}
      <!-- literal: 68ch -->
      <p
        data-slot="now"
        class="rail-hang mt-space-1 mb-0 items-box-start text-size-meta font-normal text-status-fail-ink leading-body max-w-(--measure)"
        style:--measure="68ch"
      >
        {headline(branch.error)}
      </p>
    {:else if view.report}
      <!-- literal: 68ch -->
      <p
        data-slot="now"
        class="rail-hang mt-space-1 mb-0 items-box-start text-size-meta font-normal text-ink-strong leading-body max-w-(--measure)"
        style:--measure="68ch"
      >
        {headline(view.report)}
      </p>
    {/if}

    <Collapsible.Content reveal>
      <!-- The branch's transcript exists only while it is open (and folding
           shut): bits-ui keeps a closed Content's children mounted. The
           subagent's own transcript, in a well of its own. Concentric: the
           well's --radius-sm (8px) less its --space-1 (4px) padding is the
           --radius-xs the report inside it carries, so no two nested corners
           share a radius. The transcript's own x=0 is the text column; the
           well reaches out past it by its padding. -->
      <CollapsibleLazy count={1} open={open.get()}>
        <div
          data-slot="inner"
          class="mt-space-2 mb-0 ms-(--inner-start) me-0 p-space-1 rounded-sm bg-surface-recess"
          style:--inner-start="calc(var(--x-hang) - var(--space-1))"
        >
          {#each rows as row (row.key)}
            {#if row.kind === "tools"}
              <ToolGroup messages={row.messages} />
            {:else if row.kind === "question"}
              <ToolGroup messages={[row.message]} />
            {:else if row.kind === "compaction"}
              <CompactionDivider {row} />
            {:else if row.kind === "thinking"}
              <Thinking live={row.live} text={row.text} />
            {:else if row.kind === "stream"}
              <div class="mt-space-4">
                <MessageBody source={row.text} streaming />
              </div>
            {:else if row.kind === "single"}
              <MessageRow
                agentName={branch.subagentType}
                grouped={row.grouped}
                message={row.message}
                runsOn={runs.has(row.key)}
              />
            {/if}
          {/each}

          {#if failed && branch.error}
            <p
              class="mt-space-4 p-space-3 rounded-xs text-size-body font-normal text-status-fail-ink bg-surface-raised shadow-tile whitespace-pre-wrap"
            >
              {branch.error}
            </p>
          {:else if view.report}
            <section
              class="mt-space-4 p-space-3 rounded-xs bg-surface-raised shadow-tile"
            >
              <h4
                class="text-size-label font-medium tracking-caps uppercase text-ink-muted mb-space-2"
              >
                Report
              </h4>
              <MessageBody source={view.report} />
            </section>
          {/if}
        </div>
      </CollapsibleLazy>
    </Collapsible.Content>
  </Collapsible.Root>
</div>

<style>
  /* residual: foreign-dom */
  /* A branch's own rows draw their own rails, and they start their own line
     — they must not inherit the continuation the OUTER row published, or a
     nested tool run paints the tail weight and hugs the row above it. Set on
     every descendant (the rows ToolGroup, MessageRow and the rest render),
     not inherited from the root, so a row that publishes its own
     continuation still loses to it as before. */
  [data-slot="rail-row"] :global(*) {
    --rail-head: var(--rail);
    --rail-gap: var(--space-4);
  }
</style>
