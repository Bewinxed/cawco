<script lang="ts">
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Collapsible from "$lib/components/ui/collapsible";
  import { IconChevronRight } from "$lib/icons";
  import type { SubagentState } from "$lib/utils/flow-types";
  import { formatDuration } from "$lib/utils/time";
  import { subagentView } from "../frames";
  import { markHue, sessionSprite } from "../mark";
  import { modelLabel } from "../models.svelte";
  /**
   * A harness subagent — the run a Task call spawned in-process, folded onto
   * the parent's spine as a branch you can watch rather than a paragraph you
   * read. A fleet delegate is a session of its own and has its own card. The head is its
   * identity and a status pill; the live line says what it is doing at this
   * instant; the fold opens its own transcript, rendered through the same row
   * grammar as the main one (`branchRows`).
   */
  import type { Message } from "../types";
  import MessageBody from "./MessageBody.svelte";
  import MessageRow from "./MessageRow.svelte";
  import { branchRows } from "./rows";
  import Thinking from "./Thinking.svelte";
  import ToolGroup from "./ToolGroup.svelte";
  import Unfold from "./Unfold.svelte";

  let { branch, spawn }: { branch: SubagentState; spawn: Message } = $props();

  const view = $derived(subagentView(branch));
  const rows = $derived(branchRows(branch));
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
  // own, or the pill freezes at whatever second its last message arrived.
  let now = $state(Date.now());
  $effect(() => {
    if (!view.running) {
      return;
    }
    const tick = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(tick);
  });
  const elapsed = $derived(
    formatDuration(
      (branch.completedAt?.getTime() ?? now) - branch.startedAt.getTime()
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

<div class="branch">
  <Collapsible.Root>
    <Collapsible.Trigger class="bhead">
      <span aria-hidden="true" class="chev"><IconChevronRight /></span>
      <span aria-hidden="true" class="mark m{markHue(seed)}"><Sprite /></span>
      <span class="tk">{branch.subagentType}</span>
      {#if title !== branch.subagentType}
        <span class="arg">{title}</span>
      {/if}
      {#if model}
        <span class="model">{modelLabel(model)}</span>
      {/if}
      <span class="pill {phase}">
        {phase}
        {#if view.steps}
          · {view.steps} step{view.steps === 1 ? '' : 's'}
        {/if}
        · {elapsed}
      </span>
    </Collapsible.Trigger>

    <!-- Always visible: the observability at a glance, no expand needed. -->
    {#if view.running}
      <p class="now">
        <span aria-hidden="true" class="beat"></span>{view.currentStep}
      </p>
    {:else if failed && branch.error}
      <p class="now err">{headline(branch.error)}</p>
    {:else if view.report}
      <p class="now">{headline(view.report)}</p>
    {/if}

    <Unfold>
      <div class="inner">
        {#each rows as row (row.key)}
          {#if row.kind === 'tools'}
            <ToolGroup messages={row.messages} />
          {:else if row.kind === 'question'}
            <ToolGroup messages={[row.message]} />
          {:else if row.kind === 'thinking'}
            <Thinking live={row.live} text={row.text} />
          {:else if row.kind === 'stream'}
            <div class="say"><MessageBody source={row.text} streaming /></div>
          {:else if row.kind === 'single'}
            <MessageRow agentName={branch.subagentType} message={row.message} />
          {/if}
        {/each}

        {#if failed && branch.error}
          <p class="fail">{branch.error}</p>
        {:else if view.report}
          <section class="report">
            <h4>Report</h4>
            <MessageBody source={view.report} />
          </section>
        {/if}
      </div>
    </Unfold>
  </Collapsible.Root>
</div>

<style>
  /* A branch's own rows draw their own rails, and they start their own line
     — they must not inherit the continuation the OUTER row published, or a
     nested tool run paints the tail weight and hugs the row above it. */
  .branch :global(*) {
    --rail-head: var(--rail);
    --rail-gap: var(--space-4);
  }
  /* The spine: a structural 2px rail, the same indent every rail block uses. */
  .branch {
    --glyph: calc(13px + var(--space-2));
    margin-block: var(--rail-gap, var(--space-4)) 0;
    margin-inline: var(--space-2) 0;
    padding-inline-start: var(--space-3);
    background: var(--rail-head, var(--rail)) left top / 2px 100% no-repeat;
  }

  /* The trigger is a component's element, so the scoped selector cannot reach
     it — everything under `.branch` here is addressed globally on purpose. */
  :global(.branch .bhead) {
    min-block-size: 26px;
    inline-size: 100%;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-label);
    background: none;
    border: 0;
    padding: 0;
    color: inherit;
    cursor: pointer;
    text-align: start;
    /* A disclosure header toggles content — it is not a press-action, so it does
       NOT scale on click (that read as the whole card shrinking). It reacts with
       ink only; the chevron rotation and the panel opening are the feedback. */
    transition: color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    :global(.branch .bhead:hover) .tk {
      color: var(--ink-strong);
    }
  }

  /* The disclosure affordance: one glyph in currentColor, rotated by its own
     state rather than swapped for a second asset. */
  .chev {
    inline-size: 13px;
    block-size: 13px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--ink-muted);
    @media (prefers-reduced-motion: no-preference) {
      transition: transform var(--dur-control) var(--ease-out);
    }
  }
  :global(.branch .bhead[data-state="open"]) .chev {
    transform: rotate(90deg);
  }
  .chev :global(svg) {
    inline-size: 13px;
    block-size: 13px;
    display: block;
  }

  /* The per-session identity sprite, on its --mark-N hue square. */
  .mark {
    inline-size: 17px;
    block-size: 17px;
    border-radius: var(--radius-xs);
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    background-image: var(--mark-overlay);
    background-color: var(--mark-1);
  }
  .mark :global(svg) {
    inline-size: 11px;
    block-size: 11px;
    display: block;
    color: var(--mark-glyph);
  }
  .mark.m2 {
    background-color: var(--mark-2);
  }
  .mark.m3 {
    background-color: var(--mark-3);
  }
  .mark.m4 {
    background-color: var(--mark-4);
  }
  .mark.m5 {
    background-color: var(--mark-5);
  }
  .mark.m6 {
    background-color: var(--mark-6);
  }
  .mark.m7 {
    background-color: var(--mark-7);
  }
  .mark.m8 {
    background-color: var(--mark-8);
  }

  /* biome-ignore lint/style/noDescendingSpecificity: cascade order is load-bearing — .tk's base color must lose to the :hover rule above it. */
  .tk {
    font-family: var(--font-mono);
    color: var(--ink-strong);
    font-size: var(--text-label);
    flex: 0 0 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-inline-size: 40%;
  }
  .arg {
    color: var(--ink-muted);
    font-size: var(--text-label);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-inline-size: 0;
    flex: 1 1 auto;
  }
  .model {
    color: var(--ink-muted);
    font-size: var(--text-meta);
    flex: 0 0 auto;
    white-space: nowrap;
  }
  .pill {
    margin-inline-start: auto;
    flex: 0 0 auto;
    font-size: var(--text-meta);
    font-variant-numeric: tabular-nums;
    border-radius: var(--radius-xs);
    padding: 2px var(--space-2);
    background: var(--status-idle-bg);
    color: var(--status-idle-ink);
  }
  .pill.running {
    background: var(--status-live-bg);
    color: var(--status-live-ink);
  }
  .pill.done {
    background: var(--status-done-bg);
    color: var(--status-done-ink);
  }
  .pill.failed {
    background: var(--status-fail-bg);
    color: var(--status-fail-ink);
  }

  /* The live line, indented under the head's glyph column. */
  .now {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-block: var(--space-1) 0;
    margin-inline: var(--glyph) 0;
    font-size: var(--text-label);
    color: var(--ink-strong);
    line-height: var(--leading-body);
    max-inline-size: 68ch;
  }
  .now.err {
    color: var(--status-fail-ink);
  }
  /* The beat is the second cue, never the only one: the pill already says
     "running" in words beside it. */
  .beat {
    inline-size: 5px;
    block-size: 5px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--status-live-ink);

    @media (prefers-reduced-motion: no-preference) {
      animation: beat var(--breath) var(--ease-in-out) infinite;
    }
  }
  @keyframes beat {
    50% {
      opacity: 0.3;
    }
  }

  /* The delegate's own transcript, in a well of its own. Concentric: the well's
     --radius-sm (8px) less its --space-1 (4px) padding is the --radius-xs
     the report inside it carries, so no two nested corners share a radius. */
  .inner {
    margin-block: var(--space-2) 0;
    margin-inline: var(--glyph) 0;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .say {
    margin-block-start: var(--space-4);
  }
  .report {
    margin-block-start: var(--space-4);
    padding: var(--space-3);
    border-radius: var(--radius-xs);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .report h4 {
    font-size: var(--text-meta);
    font-weight: var(--weight-medium);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--ink-muted);
    margin-block-end: var(--space-2);
  }
  .fail {
    margin-block-start: var(--space-4);
    padding: var(--space-3);
    border-radius: var(--radius-xs);
    font-size: var(--text-label);
    color: var(--status-fail-ink);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    white-space: pre-wrap;
  }

  @media (width <= 900px) {
    .branch {
      margin-inline-start: 0;
    }
  }
  /* The head is the only control on the card, so on a touch screen it is a real
     target. Scoped `.bhead` never matched the trigger — this is the same rule
     the old card carried, written so it applies. */
  @media (pointer: coarse) {
    :global(.branch .bhead) {
      min-block-size: 44px;
    }
  }
</style>
