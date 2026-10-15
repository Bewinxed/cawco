<script lang="ts">
  /**
   * A project's routines: what runs on its own, what fires it, and the
   * actions its runs asked you to approve. Three parts:
   *
   * - Routines: a calm list, a row a routine (its state glyph, its name, one
   *   fact: when it runs next, or why it won't), the row opening its detail
   *   in place (RoutineDetail; The Open Page Rule), its actions in its ⋯.
   * - Event sources: the routes that send events to a routine, the services
   *   read for them, and the relay.
   * - Approved actions: what its runs proposed and what came of it. Approving
   *   stays in Needs you; here is the history.
   *
   * The page holds them one of three ways (the preview's S5): tiles across
   * the top that are its tabs (`strip`), a bento of the three (`bento`), or
   * a tab row over one (`tabs`).
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
  import { whenOf } from "#lib/cawco/routines/schedule.js";
  import { since } from "#lib/cawco/rules.js";
  import { threadHref } from "#lib/cawco/thread-tabs.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconClock,
    IconError,
    IconHook,
    IconHourglass,
    IconLinkRound,
    IconNeedsYou,
    IconPause,
    IconPauseCircle,
    IconPin,
    IconPlay,
    IconSuccess,
    IconTrash,
    IconWorking,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";

  let {
    project,
    layout,
    canTalk,
    cawProblem = null,
  }: {
    /** The project: its id, its name, and the template its starters are written for. */
    project: { id: string; name: string; template: string | null };
    /** PREVIEW (S5): how the page holds its three parts. */
    layout: "strip" | "bento" | "tabs";
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

  type StateKind = "on" | "paused" | "failing" | "expiring" | "running";
  /** The one routine open: opening another folds it. */
  let open = $state<string | null>(null);
  let deleting = $state<string | null>(null);
  let deletePending = $state(false);

  /** Its newest run is going now: starting, or running (the hub's run state). */
  const going = (routine: Routine) =>
    routine.runs[0]?.state === "starting" ||
    routine.runs[0]?.state === "running";
  const failing = (routine: Routine) => routine.runs[0]?.outcome === "failed";
  function stateOf(routine: Routine): StateKind {
    if (going(routine)) {
      return "running";
    }
    if (!routine.enabled) {
      return "paused";
    }
    if (failing(routine)) {
      return "failing";
    }
    return routine.expiresAt !== null && !routine.keep ? "expiring" : "on";
  }
  const GLYPH = {
    on: IconSuccess,
    paused: IconPauseCircle,
    failing: IconError,
    expiring: IconHourglass,
    running: IconWorking,
  } as const;
  const DAY = 86_400_000;

  /** The row's one fact, and what its glyph says read out. */
  function factOf(routine: Routine): { fact: string; said: string } {
    const kind = stateOf(routine);
    if (kind === "running") {
      return { fact: "Running…", said: "Running" };
    }
    if (kind === "paused") {
      return { fact: "Paused", said: "Paused" };
    }
    if (kind === "failing") {
      const when = since(routine.runs[0]?.startedAt ?? Date.now());
      return { fact: `Failed ${when}`, said: `Its last run failed ${when}` };
    }
    if (kind === "expiring" && routine.expiresAt !== null) {
      const days = Math.max(
        1,
        Math.round((routine.expiresAt - Date.now()) / DAY)
      );
      return {
        fact: `Off in ${days} ${days === 1 ? "day" : "days"}`,
        said: `Turns itself off in ${days} days unless you keep it`,
      };
    }
    if (routine.trigger) {
      return { fact: "On event", said: `Runs when ${routine.trigger}` };
    }
    const next = whenOf(routine.nextSlot);
    return { fact: next, said: `Next run ${next}` };
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

  // --- the parts ---------------------------------------------------------------------

  type Part = "routines" | "sources" | "actions";
  let chosen = $state<Part>("routines");
  const sourceCount = $derived(
    page.routes.length +
      page.polls.length +
      (page.relay.state === "off" ? 0 : 1)
  );
  const waiting = $derived(actions.filter((action) => !action.decided).length);
  const failingCount = $derived(
    routines.filter((routine) => routine.enabled && failing(routine)).length
  );
  /** The soonest next run of a scheduled routine that is on. */
  const soonest = $derived(
    routines
      .filter((routine) => routine.enabled && !routine.trigger)
      .map((routine) => routine.nextSlot)
      .sort((a, b) => a - b)[0] ?? null
  );
  const PARTS: { id: Part; title: string; glyph: typeof IconClock }[] = [
    { id: "routines", title: "Routines", glyph: IconClock },
    { id: "sources", title: "Event sources", glyph: IconHook },
    { id: "actions", title: "Approved actions", glyph: IconSuccess },
  ];
  const countOf = (part: Part): number =>
    ({
      routines: routines.length,
      sources: sourceCount,
      actions: actions.length,
    })[part];

  function actionFact(action: ApprovedAction): {
    text: string;
    tone: "fail" | "attn" | "quiet";
  } {
    if (!action.decided) {
      return { text: "Waiting on you", tone: "attn" };
    }
    if (action.outcome?.kind === "failed") {
      return { text: `Failed ${since(action.outcome.at)}`, tone: "fail" };
    }
    if (action.outcome?.kind === "ran") {
      return { text: `Ran ${since(action.outcome.at)}`, tone: "quiet" };
    }
    return {
      text: `${action.decided.kind === "denied" ? "Denied" : "Approved"} ${since(action.decided.at)}`,
      tone: "quiet",
    };
  }
</script>

<!-- A routine's row: the state glyph, the name, one fact, the ⋯. -->
{#snippet routineRow(routine: Routine)}
  {@const kind = stateOf(routine)}
  {@const fact = factOf(routine)}
  {@const Glyph = GLYPH[kind]}
  <li
    class="item"
    data-open={open === routine.id ? "" : undefined}
    data-routine={routine.id}
  >
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
      <div class="row">
        <Collapsible.Trigger class="opener press-tint">
          <span class="lead"
            ><span
              aria-label={fact.said}
              class="state"
              data-state={kind}
              role="img"><Glyph /></span
            ></span
          >
          <span class="title">{routine.name}</span>
          <span class="fact num" data-state={kind}>{fact.fact}</span>
        </Collapsible.Trigger>
        <span class="row-menu"
          ><RowMenu actions={menuOf(routine)} label={routine.name} /></span
        >
      </div>
      {#if deleting === routine.id}
        <fieldset aria-label="Delete {routine.name}" class="row-ask">
          <span
            >Delete {routine.name}? It stops now; its past runs stay in the
            project's history.</span
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
      {/if}
      <Collapsible.Content fade reveal>
        <RoutineDetail {routine} />
      </Collapsible.Content>
    </Collapsible.Root>
  </li>
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
    <div class="card routines-card">
      {#if asking}
        <!-- New routine: the field stands where the routine will land. -->
        <div class="ask-first">
          <CawField
            autofocus
            label="Ask Caw for a routine"
            onsend={ask}
            placeholder="Every weekday at 09:00, triage…"
          />
        </div>
      {/if}
      <ul aria-label="Routines" class="list rows">
        {#each routines as routine (routine.id)}
          {@render routineRow(routine)}
        {/each}
      </ul>
    </div>
  {/if}
{/snippet}

{#snippet sourcesBody()}
  {#if empty}
    <p class="purpose">
      Caw connects the events that start {project.name}'s routines.
    </p>
  {:else}
    <div class="card">
      <ul aria-label="Event sources" class="list rows">
        {#each page.routes as route (route.id)}
          <li class="item">
            <div class="row">
              <span class="opener whole">
                <span class="lead"
                  ><ProviderLogo provider={route.source} /></span
                >
                <span class="title two"
                  ><span class="clip">{route.routine}</span><span
                    class="sub code clip"
                    >{route.kinds.join(", ")}{route.filter
                      ? ` · ${route.filter}`
                      : ""}</span
                  ></span
                >
              </span>
            </div>
          </li>
        {/each}
        {#each page.polls as poll (poll.id)}
          <li class="item">
            <div class="row">
              <span class="opener">
                <span class="lead"
                  ><ProviderLogo provider={poll.service} /></span
                >
                <span class="title">{poll.what}</span>
                {#if poll.last.ok}
                  <span class="fact num">{poll.every}</span>
                {:else}
                  <span class="fact num" data-tone="fail"
                    >Failed {since(poll.last.at)}</span
                  >
                {/if}
              </span>
            </div>
          </li>
        {/each}
        <li class="item">
          <div class="row">
            <span class="opener">
              <span class="lead quiet"><IconLinkRound /></span>
              <span class="title">Relay</span>
              <span class="fact">
                {#if page.relay.state === "live"}
                  <span aria-hidden="true" class="live-dot"></span>Live
                {:else}
                  Off
                {/if}
              </span>
            </span>
          </div>
        </li>
      </ul>
    </div>
  {/if}
{/snippet}

{#snippet actionsBody()}
  {#if actions.length === 0}
    <p class="purpose">
      Caw asks you before a routine posts, emails or closes anything for
      {project.name}.
    </p>
  {:else}
    <div class="card">
      <ul aria-label="Approved actions" class="list rows">
        {#each actions as action (action.id)}
          {@const fact = actionFact(action)}
          <li class="item">
            <div class="row">
              <span class="opener">
                <span class="lead"
                  ><ProviderLogo provider={action.service} /></span
                >
                <span class="title">{action.what}</span>
                <span class="fact num" data-tone={fact.tone}>
                  {#if fact.tone === "attn"}
                    <IconNeedsYou aria-hidden="true" class="fact-glyph" />
                  {/if}
                  {fact.text}
                </span>
              </span>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
{/snippet}

{#snippet body(part: Part)}
  {#if part === "routines"}
    {@render routinesBody()}
  {:else if part === "sources"}
    {@render sourcesBody()}
  {:else}
    {@render actionsBody()}
  {/if}
{/snippet}

<!-- A part's head: its title and count where nothing else names it (the
     bento's; tiles and tabs already do), and what acts on it. The empty
     Routines part has none: its empty state's title says it. -->
{#snippet head(part: Part, titled: boolean)}
  {@const meta = PARTS.find((each) => each.id === part)}
  {@const acts = part === "routines" && !empty && canTalk}
  {#if (titled && !(part === "routines" && empty)) || acts}
    <div class="part-head">
      {#if titled}
        <h2 class="part-title" id="part-title-{part}">
          {meta?.title}
          {#if !empty}
            <span class="count num">{countOf(part)}</span>
          {/if}
        </h2>
      {/if}
      {#if acts}
        <Button
          aria-expanded={asking}
          class="new-routine"
          onclick={() => {
            asking = !asking;
          }}
          size="sm"
          variant="outline">New routine</Button
        >
      {/if}
    </div>
  {/if}
{/snippet}

<!-- An overview tile: the part's glyph, title, count and where it stands. -->
{#snippet tile(part: Part)}
  {@const meta = PARTS.find((each) => each.id === part)}
  {@const Glyph = meta?.glyph ?? IconClock}
  <button
    aria-controls="part-{part}"
    aria-selected={chosen === part}
    class="tile press-tint"
    onclick={() => {
      chosen = part;
    }}
    role="tab"
    type="button"
  >
    <span class="tile-top">
      <Glyph aria-hidden="true" class="tile-glyph" />
      <span class="tile-title">{meta?.title}</span>
      {#if !empty}
        <span class="tile-count num">{countOf(part)}</span>
      {/if}
    </span>
    <span class="tile-line">
      {#if part === "routines"}
        {#if empty}
          None yet
        {:else if failingCount > 0}
          <span data-tone="fail">{failingCount} failing</span>
        {:else if soonest !== null}
          Next {whenOf(soonest)}
        {:else}
          All paused
        {/if}
      {:else if part === "sources"}
        {empty
          ? "None yet"
          : `Relay ${page.relay.state === "live" ? "live" : "off"}`}
      {:else if waiting > 0}
        <span data-tone="attn">{waiting} waiting on you</span>
      {:else}
        {actions.length === 0 ? "None yet" : "Nothing waiting"}
      {/if}
    </span>
  </button>
{/snippet}

<div class="routines-view" data-layout={layout}>
  {#if layout === "bento"}
    <div class="bento">
      {#each PARTS as part (part.id)}
        <section aria-label={part.title} class="part" data-part={part.id}>
          {@render head(part.id, true)}
          {@render body(part.id)}
        </section>
      {/each}
    </div>
  {:else if layout === "strip"}
    <div aria-label="Routines page" class="tiles" role="tablist">
      {#each PARTS as part (part.id)}
        {@render tile(part.id)}
      {/each}
    </div>
    <section class="part" id="part-{chosen}" role="tabpanel">
      {@render head(chosen, false)}
      {@render body(chosen)}
    </section>
  {:else}
    <Tabs
      onValueChange={(next) => {
        chosen = next as Part;
      }}
      value={chosen}
    >
      <TabsList aria-label="Routines page" scrollable>
        {#each PARTS as part (part.id)}
          <TabItem label={part.title} value={part.id}>
            {#snippet trail()}
              {#if !empty}
                <span class="tab-count num">{countOf(part.id)}</span>
              {/if}
            {/snippet}
          </TabItem>
        {/each}
      </TabsList>
    </Tabs>
    <section class="part" role="tabpanel">
      {@render head(chosen, false)}
      {@render body(chosen)}
    </section>
  {/if}
</div>

<style>
  .routines-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    container-type: inline-size;
  }

  /* S5 bento: Routines across the top, the two quiet parts side by side
     under it; one column on a narrow page. */
  .bento {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-group);
    align-items: start;
  }
  @container (min-width: 46rem) {
    .bento {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .bento > [data-part="routines"] {
      grid-column: 1 / -1;
    }
  }
  .part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .part-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-block-size: var(--c-btn-h-sm);
  }
  .part-head :global(.new-routine) {
    margin-inline-start: auto;
  }
  .part-title {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .count,
  .tab-count {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .tab-count {
    margin-inline-start: var(--space-1);
  }

  /* S5 strip: three tiles across that are the page's tabs. */
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-2);
  }
  @container (max-width: 34rem) {
    .tiles {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
    padding: var(--space-3);
    border: 0;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-strong);
    text-align: start;
    cursor: pointer;
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);
  }
  .tile[aria-selected="true"] {
    background: var(--selected-bg);
    box-shadow: none;
    color: var(--selected-ink);
  }
  .tile-top {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .tile :global(.tile-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-muted);
  }
  .tile[aria-selected="true"] :global(.tile-glyph) {
    color: var(--selected-icon);
  }
  .tile-title {
    font: var(--type-label);
  }
  .tile-count {
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .tile-line {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .tile-line [data-tone="fail"] {
    color: var(--status-fail-ink);
  }
  .tile-line [data-tone="attn"] {
    color: var(--status-attn-ink);
  }

  /* A part's body: one raised card, its rows on hairlines. */
  .card {
    display: flex;
    flex-direction: column;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    container: routines-card / inline-size;
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* One set of tracks for every row of a list, shared through subgrid: the
     lead, the title, the fact (fixed, so "Running…" never moves the title),
     the ⋯. */
  .rows {
    display: grid;
    grid-template-columns:
      calc(var(--c-row-lead) + var(--space-3))
      minmax(0, 1fr)
      minmax(0, max-content)
      auto;
    font: var(--type-label);
  }
  .routines-card .rows {
    grid-template-columns:
      calc(var(--c-row-lead) + var(--space-3))
      minmax(0, 1fr)
      var(--c-fact-w-compact)
      auto;
  }
  @container routines-card (min-width: 400px) {
    .routines-card .rows {
      grid-template-columns:
        calc(var(--c-row-lead) + var(--space-3))
        minmax(0, 1fr)
        var(--c-fact-w)
        auto;
    }
  }
  .rows > .item,
  .rows > .item > :global([data-slot="collapsible"]) {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
  }
  .rows > .item > :global(*),
  .rows > .item > :global([data-slot="collapsible"] > *) {
    grid-column: 1 / -1;
  }
  .item + .item {
    border-block-start: 1px solid var(--border-hairline);
  }
  .row {
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    min-block-size: var(--c-row-h);
  }
  .row :global(.opener) {
    display: grid;
    grid-column: 1 / 4;
    grid-template-columns: subgrid;
    align-items: center;
    min-inline-size: 0;
    min-block-size: var(--c-row-h);
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: var(--type-label);
    text-align: start;
  }
  .row :global(button.opener) {
    cursor: pointer;
  }
  .row .opener.whole {
    grid-column: 1 / -1;
  }
  .lead {
    display: grid;
    justify-self: start;
    place-items: center;
    inline-size: var(--c-row-lead);
  }
  .lead :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .lead.quiet {
    color: var(--ink-muted);
  }
  /* A state glyph: shape first, hue only where you are needed. */
  .state {
    display: grid;
    place-items: center;
    color: var(--ink-muted);
  }
  .state[data-state="paused"] {
    color: var(--ink-subtle);
  }
  .state[data-state="failing"] {
    color: var(--status-fail-glyph);
  }
  .state[data-state="expiring"] {
    color: var(--status-attn-glyph);
  }
  .state[data-state="running"] {
    color: var(--status-live-glyph);
  }
  .title {
    min-inline-size: 0;
    padding-inline-end: var(--space-2);
    overflow: hidden;
    color: var(--ink-row);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title.two {
    display: flex;
    flex-direction: column;
    padding-block: var(--space-1);
  }
  .opener.whole .title {
    grid-column: 2 / -1;
  }
  .clip {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .code {
    font: var(--type-code);
    font-variant-ligatures: none;
  }
  .fact {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .fact[data-state="failing"],
  .fact[data-tone="fail"] {
    color: var(--status-fail-ink);
  }
  .fact[data-state="expiring"],
  .fact[data-tone="attn"] {
    color: var(--status-attn-ink);
  }
  .fact :global(.fact-glyph) {
    flex: none;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--status-attn-glyph);
  }
  .live-dot {
    inline-size: 6px;
    block-size: 6px;
    border-radius: var(--radius-pill);
    background: var(--status-live-glyph);
  }
  .row-menu {
    display: flex;
    grid-column: 4;
    justify-content: flex-end;
    padding-inline-start: var(--space-2);
  }

  /* An open routine: its row and detail in a well, its title in strong ink. */
  .item[data-open] {
    margin-inline: calc(var(--space-2) * -1);
    padding-inline: var(--space-2);
    border: 1px solid var(--border-well);
    border-radius: var(--radius-sm);
    background: var(--surface-well);
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .item[data-open] .title {
    color: var(--ink-strong);
  }
  .item[data-open] + .item {
    border-block-start-color: transparent;
  }

  .ask-first {
    padding-block: var(--space-2);
    border-block-end: 1px solid var(--border-hairline);
  }
  .row-ask {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-inline-size: 0;
    margin: 0;
    padding: 0 var(--space-2) var(--space-2);
    border: 0;
    font: var(--type-meta);
    color: var(--ink-strong);
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
