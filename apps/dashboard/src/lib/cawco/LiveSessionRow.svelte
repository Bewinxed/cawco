<script lang="ts" module>
  /**
   * One clock for the whole board. A row that ticked for itself would put a
   * timer per session on a card of thirty, and they all read the same second.
   */
  let now = $state(Date.now());
  let watchers = 0;
  let ticker: ReturnType<typeof setInterval> | undefined;

  function watchClock(): () => void {
    const first = watchers === 0;
    watchers += 1;
    if (first) {
      ticker = setInterval(() => {
        now = Date.now();
      }, 1000);
    }
    return () => {
      watchers -= 1;
      if (watchers === 0) {
        clearInterval(ticker);
      }
    };
  }
</script>

<script lang="ts">
  /** One live session, as the session index and a project home both list it. */
  import { TextMorph } from "torph/svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { formatDuration } from "$lib/utils/time";
  import ActivityDot from "./ActivityDot.svelte";
  import { FAILED_HINT, SLEEPING_HINT, UNKNOWN_HINT } from "./activity";
  import {
    cawco,
    type InstanceRow,
    isFailed,
    isResumable,
    isStale,
  } from "./client.svelte";
  import { identityVar } from "./folder-prefs.svelte";
  import LiveSessionMenu from "./LiveSessionMenu.svelte";
  import { conversationHref, sessionTitle } from "./links";
  import { markHue, sessionSprite } from "./mark";
  import { CURVE, crossIn, dur } from "./motion/curves.svelte";
  import TaskRing from "./TaskRing.svelte";
  import { taskProgress, tasksOf } from "./tasks.svelte";
  import { dragSession } from "./workspace/dnd.svelte";

  interface Props {
    /** The card's own path, where it has one: a row in it repeating that path
     *  says nothing, so the row keeps quiet and the card speaks for it. */
    groupCwd?: string;
    instance: InstanceRow;
  }

  let { instance, groupCwd }: Props = $props();

  const showCwd = $derived(Boolean(instance.cwd) && instance.cwd !== groupCwd);

  // The per-session identity sprite: distinct per session (seeded by the
  // instance id), so two sessions in one project are told apart by SHAPE, not
  // only by the project hue. markHue below still carries the project colour.
  const Sprite = $derived(sessionSprite(instance.id));

  const activity = $derived(cawco.activityOf(instance.id));
  const tool = $derived(cawco.currentToolOf(instance.id));
  const sleeping = $derived(isResumable(instance));
  const failed = $derived(isFailed(instance));
  /** The hub can't reach this row's machine — distinct from idle and asleep. */
  const stale = $derived(isStale(instance));
  const quest = $derived(instance.kind === "scratch");
  /**
   * No state word anywhere on this row any more. "Working" and "Needs you" are
   * long, they sat in a pill wide enough to shove the title into an ellipsis on
   * every row of a card of thirty, and they said the same thing the dot beside
   * them already said in 8px. The dot is now the whole vocabulary: blue that
   * breathes for working, amber that pings for needs-you, quiet neutral for
   * idle, a moon for sleeping, a hollow ring for unreachable, still red for
   * failed — each with the word as its accessible name and tooltip.
   */

  // What the session is about, not where it runs: the SDK's own title for the
  // transcript this instance is writing. A quest is tagged out of the catalog,
  // and a session that has not spoken yet is not in it either, so both land on
  // the fallback with the path beside them to say the rest.
  // Read only — the board sweeps the fleet's ledgers once on arrival and the
  // frames keep them current. A row that fetched for itself would make a card
  // of thirty sessions thirty round trips in one frame.
  const plan = $derived(tasksOf(instance.id));
  const progress = $derived(
    plan && plan.tasks.length > 0 ? taskProgress(plan) : null
  );

  /**
   * A session running an open-ended ask writes no plan, and a run of any length
   * still owes the reader a reading. What it gets is the honest one: a ring that
   * turns to say the session is alive, and how long it has been on the step it
   * is on. No fraction is invented — there is nothing to take a fraction of.
   */
  const unmeasured = $derived(
    !(progress || failed || sleeping || stale) && activity === "working"
  );

  $effect(() => {
    if (!unmeasured) {
      return;
    }
    return watchClock();
  });

  // The daemon stamps the pulse from its own clock, so a machine a few seconds
  // out from this browser must not read as a run that started in the future.
  const pulseAt = $derived(cawco.pulseAt(instance.id));
  const onStepFor = $derived(
    unmeasured && pulseAt !== undefined
      ? formatDuration(Math.max(0, now - pulseAt))
      : null
  );

  const title = $derived.by(() => {
    const info = instance.sessionId
      ? cawco
          .catalogOf(instance.machineId)
          .find((row) => row.sessionId === instance.sessionId)
      : undefined;
    if (info) {
      return sessionTitle(info);
    }
    // What its spawn said it is for — a delegate's brief, first line — before
    // the fallback, since a delegate is never in the catalog to begin with.
    return instance.title ?? "untitled session";
  });

  /** The figure beside the ring: the plan's count, else the time on this step. */
  const figure = $derived(
    progress ? `${progress.done}/${progress.total}` : (onStepFor ?? "")
  );
  const stepHint = $derived(
    onStepFor
      ? `Working — no task plan; ${onStepFor} on this step`
      : "Working — no task plan"
  );

  /**
   * TextMorph draws its text only in the browser, so the server draws the
   * words as plain text and the morph takes over once the row is live (as
   * the kit's pending label does).
   */
  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--dur-morph");
  });

  /** `title` on the row's link: sleeping and stale each explain themselves,
   *  and neither ever applies at once. */
  const rowHint = $derived.by(() => {
    if (failed) {
      return FAILED_HINT;
    }
    if (sleeping) {
      return SLEEPING_HINT;
    }
    if (stale) {
      return UNKNOWN_HINT;
    }
  });
</script>

<LiveSessionMenu {instance}>
  {#snippet children(trigger)}
    <a
      {...trigger}
      class="press-tint group flex min-h-9 flex-col justify-center gap-0.5 rounded-[var(--radius-sm)] px-4 py-1.5
      transition-colors duration-(--dur-control) ease-out hover:text-foreground
      {failed || activity === 'blocked' ? 'bg-error/10' : ''} {trigger.class ?? ''}"
      href={conversationHref(instance.id, cawco.instanceIndex)}
      title={rowHint}
      use:dragSession={{ sessionId: instance.id, from: null }}
    >
      <!-- The row's band is the card's full width, so the whole strip is the
         hover target; what it *says* stops at a scannable measure, or an
         ultrawide track leaves the state word a screen away from the name. -->
      <span class="flex max-w-3xl items-center gap-3">
        <!-- The card's lead column: the header's 20px mark sits in the same one,
           so a card has a single title column rather than a header set in from
           the rows it heads. -->
        <span
          class="flex shrink-0 items-center justify-center {sleeping || stale ? 'opacity-60' : ''}"
          style="--c-mark:20px;--c-mark-glyph:12px"
        >
          <span class="mark m{markHue(instance.cwd || instance.machineId)}">
            <Sprite aria-hidden="true" />
          </span>
        </span>
        <!-- `max-w-xl`: a title that runs on — a pasted URL, usually — stops at a
           readable measure instead of crushing the path beside it. It is wider
           than it was because the state pill that used to sit at the end of
           this row is gone. -->
        <span class="min-w-0 max-w-xl truncate text-label">{title}</span>
        <!-- A quest is named beside its title rather than glyphed in front of it:
           the lead slot belongs to state, and the titles keep their column. -->
        {#if quest}
          <Badge class="shrink-0" variant="secondary">side quest</Badge>
        {/if}
        <!-- A leaf delegate cannot fan out: the operator reads at a glance that
           nothing will ever nest beneath this row. -->
        {#if instance.canDelegate === false}
          <Badge
            class="shrink-0"
            title="Spawned with can_delegate=false — it cannot delegate or start sessions"
            variant="outline"
            >leaf</Badge
          >
        {/if}
        <!-- Where it runs, second — and beside the title rather than in a column
           of its own: on a wide track a path pinned right sits half a card away
           from the name it belongs to, and the two stop reading as one row.
           Under pressure it yields three times as readily as the title, and
           what it keeps it gives up from the left — the leaf is what tells two
           checkouts apart. -->
        {#if showCwd}
          <span
            class="hidden min-w-24 shrink-[3] truncate font-mono text-label text-muted-foreground [direction:rtl] sm:block"
            title={instance.cwd}
            ><bdi>{instance.cwd}</bdi></span
          >
        {/if}
        <!-- How far its plan has got, or, with no plan to measure while the
           session runs, a turning arc and how long it has been on this step,
           which is what is actually known. At a glance and nothing more: the
           row is already a link, and a control inside one is two targets
           sharing a 36px band. It takes the right cluster's `ml-auto` when it
           is here, so the state word beside it keeps reading as one group.
           One element for both, so the arc eases from turning to counted
           (TaskRing) and the figure morphs, and it fades in and out as a
           whole. -->
        {#if progress || unmeasured}
          <span
            class="num ml-auto flex shrink-0 items-center gap-1.5 text-meta text-muted-foreground"
            title={progress ? undefined : stepHint}
            transition:crossIn
          >
            <span
              class="identity-ink flex items-center"
              style={identityVar(instance.cwd)}
            >
              <TaskRing
                done={progress?.done}
                indeterminate={!progress}
                size="sm"
                total={progress?.total}
              />
            </span>
            {#if morphMs}
              <TextMorph
                as="span"
                duration={morphMs}
                ease={CURVE.out}
                text={figure}
              />
            {:else}
              {figure}
            {/if}
          </span>
        {/if}
        <!-- The state, in one dot and no words (see the note in the script). It
           is the last thing in the row and the smallest, which is the right
           weight for something you read peripherally and only act on when it
           is amber or red. -->
        <span
          class="flex shrink-0 items-center {progress || unmeasured ? 'ml-2' : 'ml-auto'}"
        >
          <ActivityDot {activity} {failed} size={2.5} {sleeping} {stale} />
        </span>
      </span>
      <!-- The tool it is running: the name morphs from one tool to the next,
         and the line fades in and out as the session starts and stops one. -->
      {#if activity === 'working' && tool}
        <span
          class="flex max-w-3xl items-baseline gap-2 pl-8 text-label text-muted-foreground"
          transition:crossIn
        >
          <span class="shrink-0">
            {#if morphMs}
              <TextMorph
                as="span"
                duration={morphMs}
                ease={CURVE.out}
                text={tool.name}
              />
            {:else}
              {tool.name}
            {/if}
          </span>
          <span class="truncate font-mono">{tool.glance}</span>
        </span>
      {/if}
    </a>
  {/snippet}
</LiveSessionMenu>

<style>
  /* Item mark — inlined token primitive (identity hue + harness glyph, top-light
     overlay). No clean shadcn equivalent; kept identical in recipe across the
     four sidebar-cluster files. Size comes from --c-mark / --c-mark-glyph set on
     the wrapper. */
  .mark {
    width: var(--c-mark);
    height: var(--c-mark);
    border-radius: var(--radius-xs);
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    background-image: var(--mark-overlay);
    background-color: var(--mark-1);
  }
  .mark :global(svg) {
    width: var(--c-mark-glyph);
    height: var(--c-mark-glyph);
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
</style>
