<script lang="ts">
  /** One live session, as the session index and a project home both list it. */
  import { TextMorph } from "torph/svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { formatDuration } from "#lib/utils/time.js";
  import { shownAccount } from "./accounts/switch.svelte";
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
  import { tickingClock } from "./motion/clock.svelte.js";
  import { CURVE, crossIn, dur } from "./motion/curves.svelte";
  import SessionMark, { sessionStatus, statusWord } from "./SessionMark.svelte";
  import TaskRing from "./TaskRing.svelte";
  import { taskProgress, tasksOf } from "./tasks.svelte";
  import AccountDot from "./usage/AccountDot.svelte";
  import { dragSession } from "./workspace/dnd.svelte";

  interface Props {
    /** The card's own path, where it has one: a row in it repeating that path
     *  says nothing, so the row keeps quiet and the card speaks for it. */
    groupCwd?: string;
    instance: InstanceRow;
  }

  let { instance, groupCwd }: Props = $props();

  const showCwd = $derived(Boolean(instance.cwd) && instance.cwd !== groupCwd);

  const activity = $derived(cawco.activityOf(instance.id));
  const tool = $derived(cawco.currentToolOf(instance.id));
  const sleeping = $derived(isResumable(instance));
  const failed = $derived(isFailed(instance));
  /** The hub can't reach this row's machine — distinct from idle and asleep. */
  const stale = $derived(isStale(instance));
  const spinOff = $derived(instance.kind === "scratch");
  /**
   * No state word on screen: "Working" and "Needs you" are long, and in a
   * pill they shoved the title into an ellipsis on every row of a card of
   * thirty. The state is on the session's mark (SessionMark: its echo or dot), the
   * same in every list, with the word read out before the title and the row's
   * tooltip saying the rest (asleep, unreachable).
   */
  const status = $derived(sessionStatus(instance));

  // What the session is about, not where it runs: the SDK's own title for the
  // transcript this instance is writing. A spin-off is tagged out of the catalog,
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

  // The time on this step, and no plan to measure it by. One second for the
  // whole board (motion/clock): a row that ticked for itself would put a timer
  // per session on a card of thirty, and they all read the same second — and
  // this row's reading only moves while the row is on show.
  const clock = tickingClock(() => unmeasured);

  // The daemon stamps the pulse from its own clock, so a machine a few seconds
  // out from this browser must not read as a run that started in the future.
  const pulseAt = $derived(cawco.pulseAt(instance.id));
  const onStepFor = $derived(
    unmeasured && pulseAt !== undefined
      ? formatDuration(Math.max(0, clock.now - pulseAt))
      : null
  );

  const title = $derived.by(() => {
    const info = instance.sessionId
      ? cawco
          .catalogOf(instance.machineId)
          .find((row) => row.sessionId === instance.sessionId)
      : undefined;
    if (info) {
      return sessionTitle(info, instance);
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
  {#snippet children(
    trigger
  )}
    <a
      {...trigger}
      class="press-tint group flex min-h-9 flex-col justify-center gap-0.5 rounded-[var(--radius-sm)] px-4 py-1.5
      transition-colors duration-(--dur-control) ease-out hover:text-foreground
      {failed || activity === "blocked" ? "bg-error/10" : ""} {trigger.class ??
        ""}"
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
          class="flex shrink-0 items-center justify-center {sleeping || stale
            ? "opacity-60"
            : ""}"
          style="--mark-size:20px"
        >
          <SessionMark
            id={instance.id}
            place={instance.cwd || instance.machineId}
            {status}
          />
        </span>
        <!-- `max-w-xl`: a title that runs on — a pasted URL, usually — stops at a
           readable measure instead of crushing the path beside it. It is wider
           than it was because the state pill that used to sit at the end of
           this row is gone. -->
        <span class="min-w-0 max-w-xl truncate text-label"
          ><span class="sr-only">{statusWord(instance, status)}: </span>
          {title}</span
        >
        <!-- A spin-off is named beside its title rather than glyphed in front of it:
           the lead slot belongs to state, and the titles keep their column. -->
        {#if spinOff}
          <Badge class="shrink-0" variant="secondary">spin-off</Badge>
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
        <!-- Which account it runs on, leading what is said beside the title
             (usage/AccountDot: only with two or more Claude accounts). -->
        <AccountDot accountId={shownAccount(instance)} inline={false} />
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
             sharing a 36px band. It stands at the row's end (`ml-auto`). One
             element for both, so the arc eases from turning to counted
             (TaskRing) and the figure morphs, and it fades in and out as a
             whole. The figure morphs only while the row is on show: off it,
             the clock does not move at all (motion/clock). -->
        {#if progress || unmeasured}
          <span
            class="num ml-auto flex shrink-0 items-center gap-1.5 text-meta text-muted-foreground"
            title={progress ? undefined : stepHint}
            transition:crossIn
            {@attach clock.watch}
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
            {#if morphMs && clock.morph}
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
      </span>
      <!-- The tool it is running: the name morphs from one tool to the next,
         and the line fades in and out as the session starts and stops one. -->
      {#if activity === "working" && tool}
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
