<script lang="ts">
  /**
   * A project's routines: what runs on its own (Routines), what fires it
   * (Event sources), and what its runs asked you to approve (Approved
   * actions). Linked views of one page, Notion's way, held two ways by the
   * width of the page:
   *
   * - Under --c-routines-bento-at: a row of view tabs, each with its count
   *   and the needs-you mark when something in it waits on you (a failing
   *   routine or source, an action awaiting you), so nothing is found by
   *   scrolling. One view at a time, a full table at --c-routines-w; the
   *   view is in the URL (`part`), so a reload or a link opens it.
   * - From it: a bento of all three filling the page's height, Routines in
   *   two thirds, Event sources over Approved actions in the last, each
   *   panel headed as its tab is and scrolling in itself, so forty routines
   *   never push the other two out of view.
   *
   * The same tables, heads, counts and marks in both. The open routine
   * stays open across them.
   *
   * Routines is a ledger, one shape for every row (Hex, Snowflake, Cursor):
   * its state glyph; its name over its schedule in words on your clock,
   * one clock with Next run (the zone it was set in, on hover); Last run, a
   * status glyph and how long ago; Next run; its ⋯. Last and Next are fixed
   * columns, so every row's times start on one edge and a failure changes a
   * glyph and its colour, never where anything stands. Enabled first, then
   * the soonest next run. The row opens its detail in place (RoutineDetail).
   * On a narrow ledger Last and Next fold into the schedule's line.
   *
   * With no routine yet it offers to start one (The Empty Starts Work Rule):
   * starters for the project's kind of work over the session Composer to
   * Caw (words alone), whose words open a thread with him. A starter puts
   * its words in the composer, unsent.
   *
   * PREVIEW: it draws routines/preview-data.ts; its row actions change only
   * this page's copy.
   */
  import { untrack } from "svelte";
  import { startThread } from "#lib/cawco/client.svelte.js";
  import RowMenu, { type RowAction } from "#lib/cawco/config/RowMenu.svelte";
  import {
    failureWords as message,
    THREAD_SEND_UNREACHED,
    unreachable,
  } from "#lib/cawco/hub-read.js";
  import { GLYPHS } from "#lib/cawco/project/CawStarters.svelte";
  import ActionsTable from "#lib/cawco/routines/ActionsTable.svelte";
  import {
    type ApprovedAction,
    type Routine,
    routineStartersOf,
    routinesPageOf,
  } from "#lib/cawco/routines/preview-data.js";
  import RoutineDetail from "#lib/cawco/routines/RoutineDetail.svelte";
  import RunStatus, { type Status } from "#lib/cawco/routines/RunStatus.svelte";
  import { exactOf, scheduleOf, whenOf } from "#lib/cawco/routines/schedule.js";
  import { since } from "#lib/cawco/rules.js";
  import { threadHref } from "#lib/cawco/thread-tabs.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Table from "#lib/components/ui/table/index.js";
  import {
    IconClock,
    IconHook,
    IconHourglass,
    IconNeedsYou,
    IconPause,
    IconPauseCircle,
    IconPin,
    IconPlay,
    IconTrash,
  } from "#lib/icons.js";
  import { goto, replaceState } from "$app/navigation";
  import { page as here } from "$app/state";

  let {
    project,
    canTalk,
    cawProblem = null,
  }: {
    /** The project: its id, its name, and the template its starters are written for. */
    project: { id: string; name: string; template: string | null };
    /** Caw can start: the empty page's composer and New routine reach him. */
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

  // --- the parts, and how the page holds them ------------------------------------

  type Part = "routines" | "sources" | "actions";
  const PARTS: { id: Part; title: string }[] = [
    { id: "routines", title: "Routines" },
    { id: "sources", title: "Event sources" },
    { id: "actions", title: "Approved actions" },
  ];
  const partOf = (value: string | null): Part =>
    value === "sources" || value === "actions" ? value : "routines";
  /** The view on screen under the tabs, as the URL names it. */
  let part = $state<Part>(
    partOf(untrack(() => here.url.searchParams.get("part")))
  );
  function choose(next: Part) {
    part = next;
    const url = new URL(here.url.href);
    if (next === "routines") {
      url.searchParams.delete("part");
    } else {
      url.searchParams.set("part", next);
    }
    replaceState(url, here.state);
  }

  /** The page's width, and the token's width from which it is a bento. */
  let place = $state<HTMLElement | null>(null);
  let placeWidth = $state(0);
  let bentoAt = $state(Number.POSITIVE_INFINITY);
  $effect(() => {
    if (place) {
      bentoAt = Number.parseFloat(
        getComputedStyle(place).getPropertyValue("--c-routines-bento-at")
      );
    }
  });
  const bento = $derived(placeWidth >= bentoAt);

  const sourceCount = $derived(page.routes.length + page.polls.length);
  const failingSources = $derived(
    page.polls.filter((poll) => !poll.last.ok).length
  );
  const failingRoutines = $derived(
    routines.filter(
      (routine) => routine.enabled && routine.runs[0]?.outcome === "failed"
    ).length
  );
  const waitingActions = $derived(
    actions.filter((action) => !action.decided).length
  );
  /** A part's count, and what in it waits on you, in words. */
  /** A view tab's name read out: its title first, as it shows, then its count and what waits. */
  function tabName(id: Part, title: string): string {
    const said = metaOf(id);
    return said.needs > 0
      ? `${title}, ${said.count}, ${said.said}`
      : `${title}, ${said.count}`;
  }
  function metaOf(id: Part): { count: number; needs: number; said: string } {
    if (id === "routines") {
      return {
        count: routines.length,
        needs: failingRoutines,
        said: `${failingRoutines} failing`,
      };
    }
    if (id === "sources") {
      return {
        count: sourceCount,
        needs: failingSources,
        said: `${failingSources} failing`,
      };
    }
    return {
      count: actions.length,
      needs: waitingActions,
      said: `${waitingActions} waiting on you`,
    };
  }

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

  /**
   * The schedule's line: its words on your clock, one clock with Next run,
   * and when it turns itself off; its hover, the zone it was set in (when
   * not yours) beside the exact next time.
   */
  function scheduleLine(routine: Routine): {
    words: string;
    off: string | null;
    title: string;
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
      const words = `When ${routine.trigger}`;
      return { words, off, title: words };
    }
    const schedule = scheduleOf(
      routine.cron,
      routine.timeZone,
      routine.nextSlot
    );
    const next = `next ${exactOf(routine.nextSlot)}`;
    return {
      words: schedule.words,
      off,
      title: schedule.local ? `${schedule.local} · ${next}` : next,
    };
  }

  /** The Last run cell: its status, the time it says, the whole of it for a hover. */
  function lastOf(routine: Routine): {
    status: Status;
    text: string;
    title: string;
    said: string | null;
  } {
    const [run] = routine.runs;
    if (!run) {
      return {
        status: "neutral",
        text: "Never",
        title: "Not run yet",
        said: null,
      };
    }
    const at = exactOf(run.startedAt);
    if (going(routine)) {
      return {
        status: "running",
        text: "Running",
        title: `Running since ${at}`,
        said: null,
      };
    }
    const ago = since(run.endedAt ?? run.startedAt);
    if (run.state === "queued") {
      return { status: "neutral", text: "Queued", title: at, said: null };
    }
    const word = (() => {
      if (run.state === "skipped") {
        return "Skipped";
      }
      if (run.outcome === "failed") {
        return "Failed";
      }
      if (run.outcome === "cancelled") {
        return "Stopped";
      }
      return run.outcome === "silent" ? "Nothing to report" : "Delivered";
    })();
    const STATUS: Record<string, Status> = {
      Failed: "failed",
      Delivered: "done",
      "Nothing to report": "done",
    };
    const status = STATUS[word] ?? "neutral";
    return { status, text: ago, title: `${word} · ${at}`, said: word };
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

  /**
   * The words to Caw, in the session Composer with words alone (`attach`
   * off), as the project page's view ask is: they open a thread with him in
   * the project, and the page goes there. A refusal puts the words back in
   * the composer with the reason over them.
   */
  const askDraft = new ComposerDraft();
  let askSending = $state(false);
  let askRefused = $state("");
  /** The words never reached the hub: the line offers Send again. */
  let askAgain = $state(false);
  /** What the Composer stands over its foot: its box holds that much room. */
  let askFoot = $state(0);
  async function ask(text: string, id: string) {
    askSending = true;
    askRefused = "";
    askAgain = false;
    try {
      const said = await startThread(project.id, text, id);
      await goto(threadHref(said.thread.id));
    } catch (error) {
      askDraft.restore(text);
      askAgain = unreachable(error);
      askRefused = askAgain ? THREAD_SEND_UNREACHED : message(error);
    } finally {
      askSending = false;
    }
  }
  /** A starter: its words in the composer, the caret after them; nothing is sent. */
  function pick(text: string) {
    askDraft.text = text;
    askDraft.focusWanted = true;
  }
  /** New routine: the composer over the ledger. */
  let asking = $state(false);
  const starters = $derived(routineStartersOf(project.template));

  /** A routine's own proposed actions, for its detail. */
  const actionsOf = (routine: Routine) =>
    actions.filter((action) => action.routine === routine.name);
</script>

<!-- A part's count, and the needs-you mark while something in it waits on
     you: the tab's trail and the panel's head alike. -->
{#snippet meta(id: Part)}
  {@const said = metaOf(id)}
  <span class="count num">{said.count}</span>
  {#if said.needs > 0}
    <span class="needs" title={said.said}
      ><IconNeedsYou aria-hidden="true" /><span class="sr-only"
        >, {said.said}</span
      ></span
    >
  {/if}
{/snippet}

<!-- What acts on a part, at its head's trailing end. -->
{#snippet partAction(id: Part)}
  {#if id === "routines" && !empty && canTalk}
    <Button
      aria-expanded={asking}
      onclick={() => {
        asking = !asking;
        askDraft.focusWanted = asking;
      }}
      size="sm"
      variant="outline">New routine</Button
    >
  {:else if id === "sources"}
    <Badge
      title={page.relay.state === "live"
        ? undefined
        : "Only polled events arrive"}
      variant={page.relay.state === "live" ? "live" : "default"}
      >Relay {page.relay.state === "live" ? "live" : "off"}</Badge
    >
  {/if}
{/snippet}

<!-- The session Composer, words alone: its box as tall as what it stands
     over its foot (Composer .dock stands on its foot), as the view ask's. -->
{#snippet askCaw()}
  <div class="ask-caw" style:block-size="calc({askFoot}px + var(--space-4))">
    <Composer
      agentName="Caw"
      attach={false}
      draft={askDraft}
      onfoot={(foot) => {
        askFoot = foot.stack;
      }}
      onstop={() => undefined}
      onsubmit={(text, _extras, id) => {
        // biome-ignore lint/complexity/noVoid: the ask's own state is the composer's sending and its refusal
        void ask(text, id);
      }}
      placeholder="Every weekday at 09:00, triage…"
      sendAgain={askAgain}
      sendError={askRefused}
      sending={askSending}
    />
  </div>
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
        data-zone={routine.timeZone}
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
            <span class="sub" title={line.title}>
              <span class="sub-words">{line.words}</span>
              {#if line.off}
                <span class="sub-off">· {line.off}</span>
              {/if}
              <!-- On a narrow ledger, Last and Next in the same order. -->
              <span class="folded">
                · Last <RunStatus
                  said={last.said}
                  status={last.status}
                  text={last.text}
                  title={last.title}
                />
                · Next
                <span class="num" title={next.title ?? undefined}
                  >{next.text}</span
                >
              </span>
            </span>
          </Table.Cell>
          <Table.Cell class="col-last" data-cell="last">
            <RunStatus
              said={last.said}
              status={last.status}
              text={last.text}
              title={last.title}
            />
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
              <RoutineDetail actions={actionsOf(routine)} {routine} />
            </Collapsible.Content>
          </td>
        </tr>
      </Table.Body>
    {/snippet}
  </Collapsible.Root>
{/snippet}

{#snippet routinesBody()}
  {#if empty}
    <div class="starters">
      {#if canTalk}
        <EmptyState
          icon={IconClock}
          line="Caw runs work for {project.name} on a schedule, or when something happens. Say what, and when."
          title="No routines yet"
        >
          {#snippet action()}
            <!-- The starters as the kit's option chips (CawStarters' own),
                 a press putting its words in the composer under them, unsent. -->
            {#if starters.length > 0}
              <ul
                aria-label="Routines to ask Caw for"
                class="routine-starters kit-chips"
              >
                {#each starters as starter (starter.text)}
                  {@const Glyph = GLYPHS[starter.glyph]}
                  <li>
                    <button
                      class="kit-chip touch-hit"
                      onclick={() => pick(starter.text)}
                      type="button"
                    >
                      <Glyph aria-hidden="true" class="starter-glyph" />
                      <span>{starter.text}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
            {@render askCaw()}
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
    {#if asking}
      <!-- New routine: the composer stands over the ledger it will land in. -->
      {@render askCaw()}
    {/if}
    <div class="ledger">
      <Table.Root
        aria-label="Routines"
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
{/snippet}

{#snippet sourcesBody()}
  {#if sourceCount === 0}
    <p class="purpose">
      No event sources yet. Caw connects one when a routine should start on an
      event, like a merged pull request.
    </p>
  {:else}
    <div class="ledger">
      <Table.Root aria-label="Event sources" class="quiet table-fixed">
        <Table.Header>
          <Table.Row class="band border-0">
            <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head class="col-state" scope="col"
              ><span class="sr-only">Service</span></Table.Head
            >
            <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head class="col-name" scope="col">Source</Table.Head>
            <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head class="col-last" scope="col">Last read</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body class="quiet">
          {#each page.routes as route (route.id)}
            <Table.Row class="row">
              <Table.Cell class="col-state"
                ><span class="lead"
                  ><ProviderLogo provider={route.source} /></span
                ></Table.Cell
              >
              <Table.Cell class="col-name">
                <span class="name">{route.routine}</span>
                <span class="sub code"
                  >{route.kinds.join(", ")}{route.filter
                    ? ` · ${route.filter}`
                    : ""}</span
                >
              </Table.Cell>
              <Table.Cell class="col-last" data-cell="last"></Table.Cell>
            </Table.Row>
          {/each}
          {#each page.polls as poll (poll.id)}
            <Table.Row class="row">
              <Table.Cell class="col-state"
                ><span class="lead"
                  ><ProviderLogo provider={poll.service} /></span
                ></Table.Cell
              >
              <Table.Cell class="col-name">
                <span class="name">{poll.what}</span>
                <span class="sub">Read {poll.every}</span>
              </Table.Cell>
              <Table.Cell class="col-last" data-cell="last">
                {#if poll.last.ok}
                  <RunStatus
                    said="Read"
                    status="done"
                    text={since(poll.last.at)}
                    title={exactOf(poll.last.at)}
                  />
                {:else}
                  <RunStatus
                    said="Failed"
                    status="failed"
                    text={since(poll.last.at)}
                    title="{poll.last.error} · {exactOf(poll.last.at)}"
                  />
                {/if}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {/if}
{/snippet}

{#snippet actionsBody()}
  {#if actions.length === 0}
    <p class="purpose">
      Nothing yet. Caw asks you before a routine posts, emails or closes
      anything, and what you decide is kept here.
    </p>
  {:else}
    <div class="ledger">
      <ActionsTable {actions} label="Approved actions" />
    </div>
  {/if}
{/snippet}

{#snippet body(id: Part)}
  {#if id === "routines"}
    {@render routinesBody()}
  {:else if id === "sources"}
    {@render sourcesBody()}
  {:else}
    {@render actionsBody()}
  {/if}
{/snippet}

<!-- Drawn once its width is known, so a wide page never shows the tabs a
     frame before its bento. -->
<div bind:this={place} bind:clientWidth={placeWidth} class="routines-place">
  {#if placeWidth === 0 || !Number.isFinite(bentoAt)}
    <!-- Its width, then which way it holds its parts. -->
  {:else if bento}
    <div class="routines-view bento" data-layout="bento">
      {#each PARTS as each (each.id)}
        <section
          aria-labelledby="part-{each.id}"
          class="panel"
          data-part={each.id}
        >
          <header class="panel-head">
            <h2 class="panel-title" id="part-{each.id}">
              {each.title}
              {@render meta(each.id)}
            </h2>
            {@render partAction(each.id)}
          </header>
          <div class="panel-body">{@render body(each.id)}</div>
        </section>
      {/each}
    </div>
  {:else}
    <div class="routines-view tabbed" data-layout="tabs">
      <div class="view-head">
        <Tabs onValueChange={(next) => choose(partOf(next))} value={part}>
          <TabsList aria-label="Routines page" scrollable>
            {#each PARTS as each (each.id)}
              <!-- The count and mark trail the tab's button: its name says them. -->
              <TabItem
                aria-label={tabName(each.id, each.title)}
                label={each.title}
                value={each.id}
              >
                {#snippet trail()}
                  <span aria-hidden="true" class="tab-meta"
                    >{@render meta(each.id)}</span
                  >
                {/snippet}
              </TabItem>
            {/each}
          </TabsList>
        </Tabs>
        {@render partAction(part)}
      </div>
      <section
        aria-label={PARTS.find((each) => each.id === part)?.title}
        class="view"
        data-part={part}
      >
        {@render body(part)}
      </section>
    </div>
  {/if}
</div>

<style>
  .routines-place {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }

  /* Tabs: one view at a time, at the ledger's widest. */
  .tabbed {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    inline-size: 100%;
    max-inline-size: var(--c-routines-w);
  }
  .view-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-inline-size: 0;
  }
  .view {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
  }
  .tab-meta {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-inline-start: var(--space-1);
  }

  /* Bento: all three at once, filling the page's height, each panel
     scrolling in itself; Routines two thirds, the quiet two stacked. */
  .bento {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-group);
    min-block-size: 0;
  }
  .panel {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .panel[data-part="routines"] {
    grid-row: 1 / span 2;
  }
  .panel-head {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-block-size: calc(var(--c-btn-h-sm) + var(--space-3) * 2);
    padding: var(--space-2) var(--space-3);
    border-block-end: 1px solid var(--border-hairline);
  }
  .panel-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .panel-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-3);
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* A panel's table head stays while its rows scroll under it. */
  .bento :global(table.routines > thead th),
  .bento :global(table.quiet > thead th) {
    position: sticky;
    inset-block-start: 0;
    z-index: 2;
    background: var(--surface-band);
  }

  .count {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .needs {
    display: inline-flex;
    color: var(--status-attn-glyph);
  }
  .needs :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }

  /* A ledger: the task table's (TaskTable) band and rows. */
  .ledger {
    container: routines-ledger / inline-size;
  }
  /* Under tabs the ledger is its own card; in the bento the panel is. */
  .tabbed .ledger {
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .ledger :global(table.routines),
  .ledger :global(table.quiet) {
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
  .ledger :global(tr.row > td) {
    block-size: var(--c-btn-h-lg);
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    font: var(--type-meta);
    color: var(--ink-muted);
    vertical-align: middle;
  }
  /* A hairline between rows, not between a routine and its open detail. */
  .ledger :global(tbody.routine + tbody.routine > tr.row > td),
  .ledger :global(tbody.quiet > tr.row + tr.row > td) {
    border-block-start: 1px solid var(--border-hairline);
  }
  .ledger :global(th.col-state),
  .ledger :global(td.col-state) {
    inline-size: calc(var(--c-row-lead) + var(--space-3));
    padding-inline-end: 0;
  }
  .ledger :global(th.col-last),
  .ledger :global(th.col-next),
  .ledger :global(th.col-status) {
    inline-size: var(--c-routine-time-w);
  }
  .ledger :global(th.col-when) {
    inline-size: 6rem;
  }
  .ledger :global(th.col-menu) {
    inline-size: calc(var(--c-btn-h-sm) + var(--space-3) * 2);
  }
  .ledger :global(td.col-menu) {
    text-align: end;
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
  .ledger :global(tbody.routine[data-state="open"] > tr.row .name) {
    color: var(--ink-strong);
  }
  .ledger :global(tbody.routine:not([data-enabled]) > tr.row .name) {
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
  .code {
    font: var(--type-code);
    font-variant-ligatures: none;
  }
  .folded {
    display: none;
  }
  .row-menu {
    position: relative;
    z-index: 1;
    display: inline-flex;
  }
  /* The Next cell and an action's time: tabular, on the column's edge. */
  .time {
    display: inline-flex;
    max-inline-size: 100%;
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .time[data-paused] {
    color: var(--ink-subtle);
  }

  /* An open routine: its row and detail in the well. */
  .ledger :global(tbody.routine[data-state="open"] > tr > td) {
    background: var(--surface-well);
  }
  .ledger :global(tr.detail-row > td),
  .ledger :global(tr.ask-row > td) {
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
    .ledger :global(table.routines .col-last),
    .ledger :global(table.routines .col-next) {
      display: none;
    }
    .folded {
      display: inline;
    }
  }

  .purpose {
    max-inline-size: 72ch;
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  /* The empty page's starters, and the composer under them. */
  .starters {
    inline-size: 100%;
    max-inline-size: var(--c-starters-w);
  }
  .starters :global(.kit-empty-action) {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    align-self: stretch;
  }
  .routine-starters {
    justify-content: center;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .routine-starters li {
    display: flex;
    max-inline-size: 100%;
  }
  .routine-starters :global(.starter-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-muted);
  }
  .ask-caw {
    position: relative;
    flex: none;
    inline-size: 100%;
  }
  /* In a bento panel, words and starters stand in from its edges. */
  .panel-body > .purpose,
  .panel-body > .starters {
    padding: var(--space-3);
  }
</style>
