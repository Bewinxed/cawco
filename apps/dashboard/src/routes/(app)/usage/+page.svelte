<script lang="ts">
  import { bucketStart, type LimitWindow } from "@cawco/core";
  /**
   * Usage (design/usage-tracker.md §3): will it last, first. The Limits block
   * leads with the window that stops you first and every window under it;
   * then where the spend goes, then its history, both over one range. Nothing
   * is said twice and no row is named by an id.
   *
   * `?project=` filters it to one project (fable-lead-switch.md §2): its
   * spend today and this month, its Caw's share, the budget an attempt runs
   * under, and the ledger of its threads and attempts.
   */
  import { cawco, cawOf, readSpend } from "#lib/cawco/client.svelte.js";
  import History from "#lib/cawco/usage/History.svelte";
  import LimitsBlock from "#lib/cawco/usage/LimitsBlock.svelte";
  import ProjectSpend from "#lib/cawco/usage/ProjectSpend.svelte";
  import WhereItGoes from "#lib/cawco/usage/WhereItGoes.svelte";
  import {
    hubMidnight,
    speakingReading,
    windowStart,
  } from "#lib/cawco/usage.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconDownload, IconRefresh } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  /** The project the page is filtered to, by `?project=`; null: the fleet. */
  const filtered = $derived(
    cawco.projects.find(
      (project) => project.id === page.url.searchParams.get("project")
    ) ?? null
  );
  function filter(id: string) {
    const query = new URLSearchParams(page.url.search);
    if (id) {
      query.set("project", id);
    } else {
      query.delete("project");
    }
    const search = query.toString();
    goto(`/usage${search ? `?${search}` : ""}`, {
      replace: true,
      reset: false,
    });
  }
  /** Whether the filtered project's Caw is on, once read. */
  let leadOn = $state<boolean | null>(null);
  $effect(() => {
    const id = filtered?.id;
    leadOn = null;
    if (id) {
      cawOf(id).then(
        (view) => {
          if (id === filtered?.id) {
            leadOn = view.on;
          }
        },
        () => undefined
      );
    }
  });

  type Range = "window" | "today" | "7d" | "30d";
  let range = $state<Range>("window");

  /**
   * The quarter hour a provider's current 5-hour window opened in; null
   * without one. Usage is recorded by the quarter hour, so the window's first
   * quarter is read whole rather than dropped for starting before the window
   * did.
   */
  const fiveHourStart = (
    reading: { windows: LimitWindow[] } | undefined
  ): number | null => {
    const w = reading?.windows.find((x) => x.group === "session");
    const start = w ? windowStart(w) : null;
    return start === null ? null : bucketStart(start);
  };

  /**
   * Where the range starts for each harness: a time, null when the harness
   * has no such window, undefined while the limit readings that say so are
   * still being read.
   */
  const since = $derived.by(
    (): Record<"claude" | "opencode", number | null | undefined> => {
      if (range === "window") {
        if (!cawco.usageLimitsRead) {
          return { claude: undefined, opencode: undefined };
        }
        return {
          claude: fiveHourStart(speakingReading(cawco.claudeLimits)?.reading),
          opencode: fiveHourStart(
            speakingReading(cawco.openCodeGoLimits)?.reading
          ),
        };
      }
      // Days are the hub's (its spend's own midnight and zone), so "Today"
      // here is the same today as the spend line and the home's status.
      if (!cawco.spend) {
        return { claude: undefined, opencode: undefined };
      }
      const back = { today: 0, "7d": 6, "30d": 29 }[range];
      const start = hubMidnight(cawco.spend, back);
      return { claude: start, opencode: start };
    }
  );

  /** The hub's spend could not be read: reading it again, shown on the button. */
  let rereading = $state(false);
  async function reread(): Promise<void> {
    rereading = true;
    await readSpend();
    rereading = false;
  }

  let where = $state<WhereItGoes | null>(null);
  /** The button spins for the frame the file is made in. */
  let exporting = $state(false);
  async function exportCsv(): Promise<void> {
    if (!where) {
      return;
    }
    exporting = true;
    const file = await where.csv();
    const url = URL.createObjectURL(
      new Blob([file.body], { type: "text/csv;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(url);
    exporting = false;
  }
</script>

<svelte:head>
  <title>Usage &middot; CawCo</title>
</svelte:head>

<!-- The pages' one gutter: the ledger's asymmetric pair (DESIGN.md), as
     the project page stands on it, the column from that edge. -->
<div
  class="min-w-0 flex-auto overflow-y-auto pt-space-6 pr-space-6 pb-space-6 pl-space-7 max-desk:px-space-5 max-phone:px-space-5 max-phone:py-space-4"
>
  <!-- The page's width, to its gutter: as the project page stands, no cap
       of its own leaving a wider margin on the right than any other page. -->
  <div data-slot="col" class="m-0 flex flex-col gap-space-group">
    <header
      data-slot="top"
      class="flex flex-wrap items-center justify-between gap-space-2 max-phone:contents"
    >
      <!-- The shell's bar already names the page; the heading is for
           assistive tech only, so the name is not said twice. -->
      <h1 class="sr-only">Usage</h1>
      <Select.Root
        onValueChange={(value) => filter(value === "all" ? "" : value)}
        type="single"
        value={filtered?.id ?? "all"}
      >
        <Select.Trigger
          aria-label="Project"
          data-on={filtered ? "" : undefined}
          size="sm"
        >
          {filtered?.name ?? "All projects"}
        </Select.Trigger>
        <Select.Content>
          <Select.Item label="All projects" value="all" />
          {#each cawco.projects as project (project.id)}
            <Select.Item label={project.name} value={project.id} />
          {/each}
        </Select.Content>
      </Select.Root>
      {#if !filtered}
        <div data-slot="controls" class="flex flex-wrap items-center gap-space-2 max-phone:order-2">
          <Tabs
            onValueChange={(next) => {
              range = next as Range;
            }}
            value={range}
          >
            <TabsList aria-label="Range">
              <TabItem label="This window" value="window" />
              <TabItem label="Today" value="today" />
              <TabItem label="7 days" value="7d" />
              <TabItem label="30 days" value="30d" />
            </TabsList>
          </Tabs>
          <Button
            icon={IconDownload}
            label="Export CSV"
            onclick={exportCsv}
            pending={exporting}
            variant="outline"
          />
        </div>
      {/if}
    </header>

    {#if cawco.spendFailed}
      <div class="flex flex-wrap items-center gap-space-3" role="alert">
        <p data-slot="note" class="type-meta text-ink-muted">
          Could not reach the hub for usage data. Check that it is running, then
          try again.
        </p>
        <Button
          icon={IconRefresh}
          label="Retry"
          onclick={reread}
          pending={rereading}
          pendingLabel="Retrying…"
          size="sm"
          variant="outline"
        />
      </div>
    {/if}

    {#if filtered}
      <ProjectSpend
        {leadOn}
        projectId={filtered.id}
        projectName={filtered.name}
      />
    {:else}
      <div class="max-phone:order-1"><LimitsBlock /></div>
      <div class="flex flex-col gap-space-group max-phone:order-3">
        <Tooltip.Provider>
          <WhereItGoes {since} bind:this={where} />
          <History hourly={range === "window" || range === "today"} {since} />
        </Tooltip.Provider>
      </div>
    {/if}
  </div>
</div>

<style>
  /* residual: unmapped */
  /* The filter chip, chosen: the selected pair while a project is picked
     (needs variant: data-on). */
  [data-slot="top"] :global([data-slot="select-trigger"][data-on]) {
    border-color: transparent;
    background: var(--selected-bg);
    color: var(--selected-ink);
  }
</style>
