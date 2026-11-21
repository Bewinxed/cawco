<script lang="ts">
  /**
   * The Routines view of Option 2: what ran and what is next, in time
   * order, the run its unit. Top to bottom: where things stand in one line,
   * the project's day on one line, then two columns: What ran (wide, runs
   * newest first under their day) and Now and next (narrow, every routine
   * exactly once: Needs you, Running now, Next, Won't run), with what
   * reaches the project from outside closed to one line under it. Every row
   * opens one way, its Open at the trailing edge.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { IconChevronDown } from "#lib/icons.js";
  import DayLine from "./DayLine.svelte";
  import { NOW, type Routine, type Run, type Source, whatRan } from "./day";
  import RoutineRow, { type Standing } from "./RoutineRow.svelte";
  import RunGlyph from "./RunGlyph.svelte";
  import RunRow from "./RunRow.svelte";

  let {
    routines,
    runs,
    sources,
    standings,
    now = NOW,
    open = null,
    looked = [],
    onopenrun,
    onopenroutine,
    onopensession,
    onchoose,
    onlooked,
  }: {
    routines: Routine[];
    runs: Run[];
    sources: Source[];
    standings: Record<string, Standing>;
    now?: number;
    /** What stands open beside the view. */
    open?: { kind: "run" | "routine"; id: string } | null;
    looked?: string[];
    onopenrun: (id: string) => void;
    onopenroutine: (id: string) => void;
    onopensession: (id: string) => void;
    onchoose: (id: string, choice: string) => void;
    onlooked: (actionId: string) => void;
  } = $props();

  let outsideOpen = $state(false);

  const days = $derived(whatRan(runs, now));
  const lastOf = (id: string): Run | undefined =>
    runs
      .filter((run) => run.routineId === id)
      .reduce<Run | undefined>(
        (newest, run) => (newest && newest.at > run.at ? newest : run),
        undefined
      );

  const GROUPS: { standing: Standing; label: string }[] = [
    { standing: "needs", label: "Needs you" },
    { standing: "running", label: "Running now" },
    { standing: "next", label: "Next" },
    { standing: "wontRun", label: "Won't run" },
  ];
  const inGroup = (standing: Standing) => {
    const own = routines.filter((one) => standings[one.id] === standing);
    return standing === "next"
      ? own.sort(
          (a, b) =>
            (a.next ?? Number.POSITIVE_INFINITY) -
            (b.next ?? Number.POSITIVE_INFINITY)
        )
      : own;
  };

  const failingSources = $derived(sources.filter((one) => one.failing));
</script>

<div
  data-slot="routines-day"
  class="flex min-w-0 flex-col gap-space-6 pb-space-8"
>
  <DayLine {now} {onopenroutine} {onopenrun} {runs} />

  <div
    class="grid grid-cols-(--day-cols) items-start gap-x-space-8 gap-y-space-6"
    style:--day-cols={"minmax(0, 3fr) minmax(0, 2fr)"}
  >
    <!-- What ran. -->
    <section
      aria-labelledby="what-ran"
      class="flex min-w-0 flex-col gap-space-3"
    >
      <h2 id="what-ran" class="m-0 px-space-2 type-title text-ink-strong">
        What ran
      </h2>
      {#each days as day (day.day)}
        <section aria-label={day.day} class="flex flex-col gap-space-1">
          <h3 class="m-0 px-space-2 type-label font-medium text-ink-muted">
            {day.day}
          </h3>
          <ol class="m-0 flex list-none flex-col p-0">
            {#each day.lines as line (line.kind === "run" ? line.run.id : line.key)}
              <RunRow
                current={open?.kind === "run" ? open.id : null}
                {line}
                {looked}
                {onlooked}
                {onopenrun}
                {onopensession}
              />
            {/each}
          </ol>
        </section>
      {/each}
    </section>

    <!-- Now and next: every routine once. -->
    <section
      aria-labelledby="now-next"
      class="flex min-w-0 flex-col gap-space-3"
    >
      <h2 id="now-next" class="m-0 px-space-2 type-title text-ink-strong">
        Now and next
      </h2>
      {#each GROUPS as group (group.standing)}
        {@const rows = inGroup(group.standing)}
        {#if rows.length > 0}
          <section aria-label={group.label} class="flex flex-col gap-space-1">
            <h3
              class={[
                "m-0 px-space-2 type-label font-medium",
                group.standing === "needs"
                  ? "text-status-attn-ink"
                  : "text-ink-muted",
              ]}
            >
              {group.label}
              <span class="num">{rows.length}</span>
            </h3>
            <ol class="m-0 flex list-none flex-col p-0">
              {#each rows as routine (routine.id)}
                <RoutineRow
                  current={open?.kind === "routine" && open.id === routine.id}
                  last={lastOf(routine.id)}
                  {now}
                  {onchoose}
                  onopen={onopenroutine}
                  {routine}
                  standing={group.standing}
                />
              {/each}
            </ol>
          </section>
        {/if}
      {/each}

      <!-- What reaches this project from outside: one line, a failing source marked. -->
      <Collapsible.Root bind:open={outsideOpen}>
        <Button
          aria-expanded={outsideOpen}
          onclick={() => {
            outsideOpen = !outsideOpen;
          }}
          press="tint"
          size="sm"
          variant="ghost"
        >
          {#if failingSources.length > 0}
            <RunGlyph mark="failed" size="sm" />
          {/if}
          <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
            >{sources.length} outside sources{failingSources.length > 0
              ? ` · ${failingSources[0]?.name.split(" ")[0]} is failing`
              : ""}</span
          >
          <IconChevronDown
            aria-hidden="true"
            class={[
              "ms-auto transition-transform",
              outsideOpen && "rotate-180",
            ]}
          />
        </Button>
        <Collapsible.Content reveal>
          <ul
            class="m-0 flex list-none flex-col gap-space-2 px-space-2 pt-space-2"
          >
            {#each sources as source (source.name)}
              <li class="flex flex-col gap-space-1">
                <span class="type-label font-medium text-ink-strong"
                  >{source.name}</span
                >
                <span class="type-meta text-ink-muted">{source.read}</span>
                {#if source.failing}
                  <span class="type-meta text-status-fail-ink"
                    >{source.failing}</span
                  >
                {/if}
              </li>
            {/each}
          </ul>
        </Collapsible.Content>
      </Collapsible.Root>
    </section>
  </div>
</div>
