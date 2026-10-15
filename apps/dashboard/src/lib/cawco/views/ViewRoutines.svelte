<script lang="ts">
  /**
   * A project's routines: what runs on its own, what fires it, and the
   * actions its runs asked you to approve.
   *
   * - Routines: a ledger, one shape for every row (the comparable products'
   *   schedule tables: Hex, Snowflake, Cursor). Its state glyph (on, paused,
   *   on an event, turning itself off); its name over its schedule in words;
   *   Last run, a status glyph and how long ago; Next run, when; its ⋯. Last
   *   and Next are fixed columns, so every row's times start on one edge and
   *   a failure changes a glyph and its colour, never where anything stands.
   *   Enabled rows first, soonest next run first; a paused row keeps its row.
   *   The row opens its detail in place (RoutineDetail; The Open Page Rule).
   *   On a narrow ledger Last and Next fold into the schedule's line, in the
   *   same order.
   * - Event sources and Approved actions, the two quiet parts: a rail beside
   *   the ledger once the page is 1280px wide or more, stacked under it in
   *   the same order below that.
   *
   * The ledger stops at --c-routines-w: a few rows never stretch across a
   * wide screen.
   *
   * With no routine yet it offers to start one (The Empty Starts Work Rule):
   * starters for the project's kind of work over the field to Caw, whose
   * words open a thread with him.
   *
   * PREVIEW: it draws routines/preview-data.ts; its row actions change only
   * this page's copy.
   */
  import { untrack } from "svelte";
  import { startThread } from "#lib/cawco/client.svelte.js";
  import RowMenu, { type RowAction } from "#lib/cawco/config/RowMenu.svelte";
  import CawField from "#lib/cawco/project/CawField.svelte";
  import CawStarters from "#lib/cawco/project/CawStarters.svelte";
  import {
    type ApprovedAction,
    type Routine,
    routineStartersOf,
    routinesPageOf,
  } from "#lib/cawco/routines/preview-data.js";
  import RoutineDetail from "#lib/cawco/routines/RoutineDetail.svelte";
  import { exactOf, scheduleOf, whenOf } from "#lib/cawco/routines/schedule.js";
  import { since } from "#lib/cawco/rules.js";
  import { threadHref } from "#lib/cawco/thread-tabs.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Table from "#lib/components/ui/table/index.js";
  import {
    IconClock,
    IconError,
    IconHook,
    IconHourglass,
    IconMinusCircle,
    IconNeedsYou,
    IconPause,
    IconPauseCircle,
    IconPin,
    IconPlay,
    IconSuccess,
    IconTrash,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";

  let {
    project,
    canTalk,
    cawProblem = null,
  }: {
    /** The project: its id, its name, and the template its starters are written for. */
    project: { id: string; name: string; template: string | null };
    /** Caw can start: the empty page's field and New routine reach him. */
    canTalk: boolean;
    /** Why Caw can't start, said on the empty page instead. */
    cawProblem?: string | null;
  } = $props();

  const page = untrack(() => routinesPageOf(project));
  /** This page's copy: the row actions change it after a beat, as the hub would. */
  let routines = $state<Routine[]>(structuredClone(page.routines));
  const actions: ApprovedAction[] = page.actions;
  const empty = $derived(routines.length === 0);

  /** The mock hub: it answers after a beat. */
  const hub = (ms = 450) => new Promise((done) => setTimeout(done, ms));
  /** How long a preview Run now goes before it ends silent. */
  const PREVIEW_RUN_MS = 8000;

  // --- a routine's row ----------------------------------------------------------

  /** The one routine open: opening another folds it. */
  let open = $state<string | null>(null);
  let deleting = $state<string | null>(null);
  let deletePending = $state(false);

  /** Its newest run is going now: starting, or running (the hub's run state). */
  const going = (routine: Routine) =>
    routine.runs[0]?.state === "starting" ||
    routine.runs[0]?.state === "running";

  /**
   * Enabled first (Zapier's on-above-off), then the soonest next run; a
   * routine an event fires has no next run, so it follows the scheduled ones.
   */
  const sorted = $derived(
    routines.toSorted(
      (a, b) =>
        Number(b.enabled) - Number(a.enabled) ||
        Number(a.trigger !== null) - Number(b.trigger !== null) ||
        a.nextSlot - b.nextSlot
    )
  );

  /** The lead glyph: whether it runs, and how; never how its last run went. */
  type Lead = "on" | "event" | "paused" | "expiring";
  function leadOf(routine: Routine): Lead {
    if (!routine.enabled) {
      return "paused";
    }
    if (routine.expiresAt !== null && !routine.keep) {
      return "expiring";
    }
    return routine.trigger ? "event" : "on";
  }
  const LEAD = {
    on: { glyph: IconClock, said: "On, on a schedule" },
    event: { glyph: IconHook, said: "On, when an event comes" },
    paused: { glyph: IconPauseCircle, said: "Paused" },
    expiring: { glyph: IconHourglass, said: "On, turning itself off" },
  } as const;
  const DAY = 86_400_000;

  /** The schedule's line: its words, its zone when it isn't yours, and when it turns itself off. */
  function scheduleLine(routine: Routine): {
    words: string;
    off: string | null;
  } {
    const off =
      leadOf(routine) === "expiring" && routine.expiresAt !== null
        ? (() => {
            const days = Math.max(
              1,
              Math.round((routine.expiresAt - Date.now()) / DAY)
            );
            return `Off in ${days} ${days === 1 ? "day" : "days"}`;
          })()
        : null;
    if (routine.trigger) {
      return { words: `When ${routine.trigger}`, off };
    }
    const schedule = scheduleOf(routine.cron, routine.timeZone);
    return {
      words: schedule.zone
        ? `${schedule.words} ${schedule.zone} time`
        : schedule.words,
      off,
    };
  }

  /** Last run's status: one glyph vocabulary for the ledger and Approved actions. */
  type Status = "done" | "failed" | "running" | "neutral" | "waiting";
  const STATUS_GLYPH = {
    done: IconSuccess,
    failed: IconError,
    neutral: IconMinusCircle,
    waiting: IconNeedsYou,
  } as const;

  /** The Last run cell: its status, the time it says, the whole of it for a hover. */
  function lastOf(routine: Routine): {
    status: Status;
    text: string;
    title: string;
  } {
    const [run] = routine.runs;
    if (!run) {
      return { status: "neutral", text: "Never", title: "It has not run yet" };
    }
    const at = exactOf(run.startedAt);
    if (going(routine)) {
      return {
        status: "running",
        text: "Running",
        title: `Running since ${at}`,
      };
    }
    const ago = since(run.endedAt ?? run.startedAt);
    if (run.state === "skipped") {
      return { status: "neutral", text: ago, title: `Skipped · ${at}` };
    }
    if (run.state === "queued") {
      return { status: "neutral", text: "Queued", title: `Queued · ${at}` };
    }
    if (run.outcome === "failed") {
      return { status: "failed", text: ago, title: `Failed · ${at}` };
    }
    if (run.outcome === "cancelled") {
      return { status: "neutral", text: ago, title: `Stopped · ${at}` };
    }
    return {
      status: "done",
      text: ago,
      title: `${run.outcome === "silent" ? "Nothing to report" : "Delivered"} · ${at}`,
    };
  }

  /** The Next run cell. */
  function nextOf(routine: Routine): { text: string; title: string | null } {
    if (!routine.enabled) {
      return { text: "Paused", title: null };
    }
    if (routine.trigger) {
      return { text: "On event", title: `When ${routine.trigger}` };
    }
    return { text: whenOf(routine.nextSlot), title: exactOf(routine.nextSlot) };
  }

  async function pause(routine: Routine) {
    await hub();
    routine.enabled = !routine.enabled;
  }
  async function keep(routine: Routine) {
    await hub();
    routine.keep = true;
  }
  /** Run now: the run stands at the top of its runs while it goes, as the hub keeps it. */
  async function runNow(routine: Routine) {
    const at = Date.now();
    routine.runs = [
      {
        id: `now-${at}`,
        slot: `now:${new Date(at).toISOString()}`,
        attempt: 1,
        state: "running",
        outcome: null,
        output: null,
        reason: null,
        startedAt: at,
        endedAt: null,
        workItemId: null,
      },
      ...routine.runs,
    ];
    await hub(PREVIEW_RUN_MS);
    const [now, ...before] = routine.runs;
    if (now) {
      routine.runs = [
        { ...now, state: "ended", outcome: "silent", endedAt: Date.now() },
        ...before,
      ];
    }
  }
  async function remove(routine: Routine) {
    deletePending = true;
    await hub();
    routines = routines.filter((each) => each.id !== routine.id);
    deletePending = false;
    deleting = null;
  }
  function menuOf(routine: Routine): RowAction[] {
    return [
      {
        label: "Run now",
        icon: IconPlay,
        disabled: going(routine),
        onselect: () => runNow(routine),
      },
      {
        label: routine.enabled ? "Pause" : "Resume",
        icon: routine.enabled ? IconPause : IconPlay,
        onselect: () => pause(routine),
      },
      ...(routine.expiresAt !== null && !routine.keep
        ? [{ label: "Keep", icon: IconPin, onselect: () => keep(routine) }]
        : []),
      {
        label: "Delete routine…",
        icon: IconTrash,
        destructive: true,
        onselect: () => {
          deleting = routine.id;
        },
      },
    ];
  }

  // --- asking Caw ------------------------------------------------------------------

  /** Words to Caw open a thread with him in the project, and go there. */
  async function ask(text: string, id: string) {
    const said = await startThread(project.id, text, id);
    await goto(threadHref(said.thread.id));
  }
  let asking = $state(false);
  const starters = $derived(routineStartersOf(project.template));

  // --- the quiet parts -------------------------------------------------------------

  const sourceCount = $derived(page.routes.length + page.polls.length);

  /** An approved action's status and time, in the ledger's vocabulary. */
  function actionOf(action: ApprovedAction): {
    status: Status;
    text: string;
    title: string;
  } {
    if (!action.decided) {
      return { status: "waiting", text: "Waiting", title: "Waiting on you" };
    }
    if (action.outcome) {
      const { at, kind } = action.outcome;
      return {
        status: kind === "failed" ? "failed" : "done",
        text: since(at),
        title: `${kind === "failed" ? "Failed" : "Ran"} · ${exactOf(at)}`,
      };
    }
    const { at } = action.decided;
    return action.decided.kind === "denied"
      ? { status: "neutral", text: since(at), title: `Denied · ${exactOf(at)}` }
      : { status: "done", text: since(at), title: `Approved · ${exactOf(at)}` };
  }
</script>

<!-- A status glyph and its words, the same in every time cell: the glyph's
     shape and hue say how it went, the words when. -->
{#snippet status(state: Status, text: string, title: string | null)}
  <span class="time num" data-status={state} title={title ?? undefined}>
    {#if state === "running"}
      <Spinner aria-hidden="true" class="status-glyph" role="presentation" />
    {:else}
      {@const Glyph = STATUS_GLYPH[state]}
      <Glyph aria-hidden="true" class="status-glyph" />
    {/if}
    {#if (state === "done" || state === "failed") && title}
      <!-- The glyph's shape and hue, said: "Failed, 3d ago". -->
      <span class="sr-only">{title.split(" · ")[0]},</span>
    {/if}
    <span class="time-words">{text}</span>
  </span>
{/snippet}

{#snippet routineRows(routine: Routine)}
  {@const lead = LEAD[leadOf(routine)]}
  {@const line = scheduleLine(routine)}
  {@const last = lastOf(routine)}
  {@const next = nextOf(routine)}
  <Collapsible.Root
    bind:open={
      () => open === routine.id,
      (next) => {
        if (next) {
          open = routine.id;
        } else if (open === routine.id) {
          open = null;
        }
      }
    }
  >
    {#snippet child({ props })}
      <Table.Body
        {...props}
        class="routine"
        data-enabled={routine.enabled ? "" : undefined}
        data-routine={routine.id}
      >
        <Table.Row class="row">
          <Table.Cell class="col-state">
            <span
              aria-label={lead.said}
              class="lead"
              data-lead={leadOf(routine)}
              role="img"><lead.glyph /></span
            >
          </Table.Cell>
          <Table.Cell class="col-name">
            <Collapsible.Trigger class="opener focus-inset">
              <span class="name">{routine.name}</span>
            </Collapsible.Trigger>
            <span class="sub" title={line.words}>
              <span class="sub-words">{line.words}</span>
              {#if line.off}
                <span class="sub-off">· {line.off}</span>
              {/if}
              <!-- On a narrow ledger, Last and Next in the same order. -->
              <span class="folded">
                · Last {@render status(last.status, last.text, last.title)}
                · Next
                <span class="num" title={next.title ?? undefined}
                  >{next.text}</span
                >
              </span>
            </span>
          </Table.Cell>
          <Table.Cell class="col-last" data-cell="last">
            {@render status(last.status, last.text, last.title)}
          </Table.Cell>
          <Table.Cell class="col-next" data-cell="next">
            <span
              class="time num"
              data-paused={routine.enabled ? undefined : ""}
              title={next.title ?? undefined}>{next.text}</span
            >
          </Table.Cell>
          <Table.Cell class="col-menu">
            <span class="row-menu"
              ><RowMenu actions={menuOf(routine)} label={routine.name} /></span
            >
          </Table.Cell>
        </Table.Row>
        {#if deleting === routine.id}
          <tr class="ask-row">
            <td colspan="5">
              <fieldset aria-label="Delete {routine.name}" class="row-ask">
                <span
                  >Delete {routine.name}? It stops now; its past runs stay in
                  the project's history.</span
                >
                <Button
                  label="Delete routine"
                  onclick={() => remove(routine)}
                  pending={deletePending}
                  pendingLabel="Deleting…"
                  size="xs"
                  variant="destructive"
                />
                <Button
                  onclick={() => {
                    deleting = null;
                  }}
                  size="xs"
                  variant="ghost">Cancel</Button
                >
              </fieldset>
            </td>
          </tr>
        {/if}
        <tr class="detail-row">
          <td colspan="5">
            <Collapsible.Content fade reveal>
              <RoutineDetail {routine} />
            </Collapsible.Content>
          </td>
        </tr>
      </Table.Body>
    {/snippet}
  </Collapsible.Root>
{/snippet}

<div class="routines-place">
  <div class="routines-view" data-empty={empty ? "" : undefined}>
    <section aria-labelledby="routines-title" class="part main">
      {#if empty}
        <h2 class="sr-only" id="routines-title">Routines</h2>
        <div class="starters">
          {#if canTalk}
            <EmptyState
              icon={IconClock}
              line="Caw runs work for {project.name} on a schedule, or when something happens. Say what, and when."
              title="No routines yet"
            >
              {#snippet action()}
                <CawStarters
                  label="Ask Caw for a routine"
                  onsend={ask}
                  placeholder="Every weekday at 09:00, triage…"
                  {starters}
                />
              {/snippet}
            </EmptyState>
          {:else}
            <EmptyState
              icon={IconClock}
              line="Caw makes routines, and he can't start: {cawProblem ??
                'his machine is away'}."
              title="No routines yet"
            />
          {/if}
        </div>
      {:else}
        <div class="part-head">
          <h2 class="part-title" id="routines-title">
            Routines <span class="count num">{routines.length}</span>
          </h2>
          {#if canTalk}
            <Button
              aria-expanded={asking}
              onclick={() => {
                asking = !asking;
              }}
              size="sm"
              variant="outline">New routine</Button
            >
          {/if}
        </div>
        {#if asking}
          <!-- New routine: the field stands over the ledger it will land in. -->
          <CawField
            autofocus
            label="Ask Caw for a routine"
            onsend={ask}
            placeholder="Every weekday at 09:00, triage…"
          />
        {/if}
        <div class="ledger">
          <Table.Root
            aria-labelledby="routines-title"
            class="routines table-fixed"
            ghostRows="tr.row"
          >
            <Table.Header>
              <Table.Row class="band border-0">
                <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
                <Table.Head class="col-state" scope="col"
                  ><span class="sr-only">State</span></Table.Head
                >
                <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
                <Table.Head class="col-name" scope="col">Routine</Table.Head>
                <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
                <Table.Head class="col-last" scope="col">Last run</Table.Head>
                <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
                <Table.Head class="col-next" scope="col">Next run</Table.Head>
                <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
                <Table.Head class="col-menu" scope="col"
                  ><span class="sr-only">Actions</span></Table.Head
                >
              </Table.Row>
            </Table.Header>
            {#each sorted as routine (routine.id)}
              {@render routineRows(routine)}
            {/each}
          </Table.Root>
        </div>
      {/if}
    </section>

    <aside aria-label="Event sources and approved actions" class="side">
      <section aria-labelledby="sources-title" class="part">
        <div class="part-head">
          <h2 class="part-title" id="sources-title">
            Event sources
            {#if sourceCount > 0}
              <span class="count num">{sourceCount}</span>
            {/if}
          </h2>
          <Badge
            title={page.relay.state === "live"
              ? "The relay is passing events to this hub"
              : "The relay is off: only events read by polling arrive"}
            variant={page.relay.state === "live" ? "live" : "default"}
            >Relay {page.relay.state === "live" ? "live" : "off"}</Badge
          >
        </div>
        {#if sourceCount === 0}
          <p class="purpose">
            Caw connects the events that start {project.name}'s routines.
          </p>
        {:else}
          <ul aria-labelledby="sources-title" class="quiet-list">
            {#each page.routes as route (route.id)}
              <li class="quiet-row">
                <span class="quiet-lead"
                  ><ProviderLogo provider={route.source} /></span
                >
                <span class="quiet-text">
                  <span class="quiet-name">{route.routine}</span>
                  <span class="quiet-sub code"
                    >{route.kinds.join(", ")}{route.filter
                      ? ` · ${route.filter}`
                      : ""}</span
                  >
                </span>
              </li>
            {/each}
            {#each page.polls as poll (poll.id)}
              <li class="quiet-row">
                <span class="quiet-lead"
                  ><ProviderLogo provider={poll.service} /></span
                >
                <span class="quiet-text">
                  <span class="quiet-name">{poll.what}</span>
                  <span class="quiet-sub">Read {poll.every}</span>
                </span>
                {#if poll.last.ok}
                  {@render status(
                    "done",
                    since(poll.last.at),
                    `Read · ${exactOf(poll.last.at)}`
                  )}
                {:else}
                  {@render status(
                    "failed",
                    since(poll.last.at),
                    `Failed: ${poll.last.error} · ${exactOf(poll.last.at)}`
                  )}
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section aria-labelledby="actions-title" class="part">
        <div class="part-head">
          <h2 class="part-title" id="actions-title">
            Approved actions
            {#if actions.length > 0}
              <span class="count num">{actions.length}</span>
            {/if}
          </h2>
        </div>
        {#if actions.length === 0}
          <p class="purpose">
            Caw asks you before a routine posts, emails or closes anything for
            {project.name}.
          </p>
        {:else}
          <ul aria-labelledby="actions-title" class="quiet-list">
            {#each actions as action (action.id)}
              {@const said = actionOf(action)}
              <li class="quiet-row">
                <span class="quiet-lead"
                  ><ProviderLogo provider={action.service} /></span
                >
                <span class="quiet-text">
                  <span class="quiet-name">{action.what}</span>
                  <span class="quiet-sub">From {action.routine}</span>
                </span>
                {@render status(said.status, said.text, said.title)}
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </aside>
  </div>
</div>

<style>
  /* The page's place, measured: the rail stands beside the ledger once it is
     1280px wide or more (container queries take no custom properties, so the
     width is written here; the tracks are tokens). */
  .routines-place {
    container: routines-place / inline-size;
  }
  .routines-view {
    display: grid;
    grid-template-columns: minmax(0, var(--c-routines-w));
    gap: var(--space-group);
    align-items: start;
  }
  @container routines-place (min-width: 80rem) {
    .routines-view {
      grid-template-columns:
        minmax(0, var(--c-routines-w))
        var(--c-routines-rail-w);
    }
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--space-group);
    min-inline-size: 0;
  }
  .part-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-block-size: var(--c-btn-h-sm);
  }
  .part-title {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .count {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }

  /* The ledger: the task table's (TaskTable) card, band and rows. */
  .ledger {
    container: routines-ledger / inline-size;
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .ledger :global(table.routines) {
    border-collapse: separate;
    border-spacing: 0;
  }
  .ledger :global(tr.band) {
    background: var(--surface-band);
  }
  .ledger :global(tr.band th) {
    block-size: var(--c-toolbar-ctl);
    padding-inline: var(--space-3);
    font: var(--type-label);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .ledger :global(tr.row) {
    position: relative;
    border-block-end: 0;
  }
  .ledger :global(tr.row td) {
    block-size: var(--c-btn-h-lg);
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    font: var(--type-meta);
    color: var(--ink-muted);
    vertical-align: middle;
  }
  /* A hairline between routines, not between a row and its open detail. */
  .ledger :global(tbody.routine + tbody.routine tr.row td) {
    border-block-start: 1px solid var(--border-hairline);
  }
  .ledger :global(.col-state) {
    inline-size: calc(var(--c-row-lead) + var(--space-3));
    padding-inline-end: 0;
  }
  .ledger :global(.col-last),
  .ledger :global(.col-next) {
    inline-size: var(--c-routine-time-w);
  }
  .ledger :global(.col-menu) {
    inline-size: calc(var(--c-btn-h-sm) + var(--space-3) * 2);
    text-align: end;
  }
  .ledger :global(tr.band th.col-state) {
    padding-inline-end: 0;
  }

  .lead {
    display: grid;
    place-items: center;
    inline-size: var(--c-row-lead);
    color: var(--ink-muted);
  }
  .lead :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .lead[data-lead="paused"] {
    color: var(--ink-subtle);
  }
  .lead[data-lead="expiring"] {
    color: var(--status-attn-glyph);
  }

  /* The name opens the routine; its box reaches every cell, so the whole
     row is the opener, its ⋯ above it. */
  .ledger :global(.opener) {
    display: block;
    max-inline-size: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .ledger :global(.opener::after) {
    position: absolute;
    inset: 0;
    content: "";
  }
  .name {
    display: block;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-row);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ledger :global(tbody.routine[data-state="open"] .name) {
    color: var(--ink-strong);
  }
  .ledger :global(tbody.routine:not([data-enabled]) .name) {
    color: var(--ink-muted);
  }
  .sub {
    display: block;
    overflow: hidden;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub-off {
    color: var(--status-attn-ink);
  }
  .folded {
    display: none;
  }
  .row-menu {
    position: relative;
    z-index: 1;
    display: inline-flex;
  }

  /* A time cell: the status glyph, then the words, on one baseline, in
     tabular figures, starting on the column's edge in every row. */
  .time {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-inline-size: 100%;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .time-words {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .time :global(.status-glyph) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  .time[data-status="done"] :global(.status-glyph) {
    color: var(--status-done-glyph);
  }
  .time[data-status="failed"] :global(.status-glyph) {
    color: var(--status-fail-glyph);
  }
  .time[data-status="failed"] {
    color: var(--status-fail-ink);
  }
  .time[data-status="running"] {
    color: var(--status-live-ink);
  }
  .time[data-status="running"] :global(.status-glyph) {
    color: var(--status-live-glyph);
  }
  .time[data-status="waiting"] {
    color: var(--status-attn-ink);
  }
  .time[data-status="waiting"] :global(.status-glyph) {
    color: var(--status-attn-glyph);
  }
  .time[data-status="neutral"] :global(.status-glyph) {
    color: var(--ink-subtle);
  }
  .time[data-paused] {
    color: var(--ink-subtle);
  }

  /* An open routine: its row and detail in the well. */
  .ledger :global(tbody.routine[data-state="open"] td) {
    background: var(--surface-well);
  }
  .ledger :global(tr.detail-row td),
  .ledger :global(tr.ask-row td) {
    padding: 0;
  }
  .row-ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-inline-size: 0;
    margin: 0;
    padding: 0 var(--space-3) var(--space-2);
    border: 0;
    font: var(--type-meta);
    color: var(--ink-strong);
  }

  /* A narrow ledger: Last and Next fold into the schedule's line, in the
     same order, and the name takes the width. */
  @container routines-ledger (width < 34rem) {
    .ledger :global(.col-last),
    .ledger :global(.col-next) {
      display: none;
    }
    .folded {
      display: inline;
    }
    .folded .time {
      display: inline-flex;
      vertical-align: bottom;
    }
  }

  /* The quiet parts: short rows on hairlines in one raised card each. */
  .quiet-list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    list-style: none;
  }
  .quiet-row {
    display: grid;
    grid-template-columns: var(--c-row-lead) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    min-block-size: var(--c-row-h);
    padding-block: var(--space-1);
  }
  .quiet-row + .quiet-row {
    border-block-start: 1px solid var(--border-hairline);
  }
  .quiet-lead {
    display: grid;
    place-items: center;
  }
  .quiet-lead :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .quiet-text {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
  .quiet-name {
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-row);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .quiet-sub {
    overflow: hidden;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .code {
    font: var(--type-code);
    font-variant-ligatures: none;
  }
  .purpose {
    max-inline-size: 72ch;
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  /* The empty page's starters: centred, four across at most, as the board's. */
  .starters {
    inline-size: 100%;
    max-inline-size: var(--c-starters-w);
  }
  .starters :global(.kit-empty-action) {
    align-self: stretch;
  }
</style>
