<script lang="ts">
  /**
   * Usage (design/usage-tracker.md §3): will it last, first. The Limits block
   * leads with the window that stops you first and every window under it;
   * then where the spend goes, then its history, both over one range. Nothing
   * is said twice and no row is named by an id.
   */
  import { floorToHour, type LimitWindow } from "@cawco/core";
  import { invalidateAll } from "$app/navigation";
  import { cawco } from "$lib/cawco/client.svelte";
  import { speakingReading, windowStart } from "$lib/cawco/usage";
  import History from "$lib/cawco/usage/History.svelte";
  import LimitsBlock from "$lib/cawco/usage/LimitsBlock.svelte";
  import WhereItGoes from "$lib/cawco/usage/WhereItGoes.svelte";
  import { Button } from "$lib/components/ui/button";
  import { TabItem, Tabs, TabsList } from "$lib/components/ui/fluid-tabs";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tooltip from "$lib/components/ui/tooltip";
  import { IconDownload, IconRefresh } from "$lib/icons";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  type Range = "window" | "today" | "7d" | "30d";
  let range = $state<Range>("window");

  /** The page's clock: the countdowns and projections move a minute at a time. */
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 60_000);
    return () => clearInterval(timer);
  });

  /**
   * The hour a provider's current 5-hour window opened in; null without one.
   * Usage is recorded by the hour, so the window's first hour is read whole
   * rather than dropped for starting before the window did.
   */
  const fiveHourStart = (
    reading: { windows: LimitWindow[] } | undefined
  ): number | null => {
    const w = reading?.windows.find((x) => x.group === "session");
    const start = w ? windowStart(w) : null;
    return start === null ? null : floorToHour(start);
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
      const midnight = new Date(now);
      midnight.setHours(0, 0, 0, 0);
      const back = { today: 0, "7d": 6, "30d": 29 }[range];
      midnight.setDate(midnight.getDate() - back);
      const start = midnight.getTime();
      return { claude: start, opencode: start };
    }
  );

  /** The hub could not be read: reading it again, shown on the button. */
  let rereading = $state(false);
  async function reread(): Promise<void> {
    rereading = true;
    await invalidateAll();
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

<div class="page">
  <div class="col">
    <header class="top">
      <!-- The shell's bar already names the page; the heading is for
           assistive tech only, so the name is not said twice. -->
      <h1 class="sr-only">Usage</h1>
      <div class="controls">
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
    </header>

    {#if data.error}
      <div class="page-error" role="alert">
        <p class="note">{data.error}</p>
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

    <div class="limits"><LimitsBlock {now} spend={data.spend} /></div>
    <div class="ranged">
      <Tooltip.Provider>
        <WhereItGoes {since} bind:this={where} />
        <History hourly={range === 'window' || range === 'today'} {since} />
      </Tooltip.Provider>
    </div>
  </div>
</div>

<style>
  .page {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: var(--space-6);
    min-width: 0;
  }
  .col {
    margin: 0 auto;
    max-width: 1100px;
    display: flex;
    flex-direction: column;
    gap: var(--space-group);
  }
  .top {
    display: flex;
    justify-content: flex-end;
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .ranged {
    display: flex;
    flex-direction: column;
    gap: var(--space-group);
  }
  .page-error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }
  .note {
    font: var(--type-meta);
    color: var(--ink-muted);
  }

  /* A phone gives the first screen to the limits: the range and the export
     only change what follows them, so they stand after the Limits block. */
  @media (max-width: 639px) {
    .page {
      padding: var(--space-4) var(--space-3);
    }
    .top {
      display: contents;
    }
    .limits {
      order: 1;
    }
    .controls {
      order: 2;
    }
    .ranged {
      order: 3;
    }
  }
</style>
