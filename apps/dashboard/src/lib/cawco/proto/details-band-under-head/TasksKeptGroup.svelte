<script lang="ts">
  /**
   * Tasks kept: three equal tiles, each its mark and name over what picking
   * it does (the owner: "absolutely zero clarity on what are the
   * implications of choosing either of this"). The outside trackers wear
   * their own logos; CawCo's own files wear the product's task glyph.
   *
   * While tied, the tie in two lines: the repository or team (opens it on
   * the tracker) with Sync now at its end; how the sync stands (first sync
   * under way, in step as of a time, or refused in the tracker's words) and
   * how many tasks are linked. With GitHub, the Project that carries the
   * stages (opens it) with Change, or GitHub's reason there is none.
   */
  import type { Tracker, TrackerView } from "@cawco/core/trackers";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import {
    IconArrowUpRight,
    IconError,
    IconRefresh,
    IconSuccess,
    IconTaskList,
  } from "#lib/icons.js";
  import BandGroup from "./BandGroup.svelte";
  import TileFace from "./TileFace.svelte";
  import { bandWords } from "./words";

  let {
    tracker,
    syncing = false,
    ontracker,
    onsync,
    onchangestages,
  }: {
    tracker: TrackerView;
    /** A sync asked with Sync now, not yet answered. */
    syncing?: boolean;
    ontracker: (tracker: Tracker) => void;
    onsync: () => void;
    onchangestages: () => void;
  } = $props();

  const words = bandWords.tasks;
  const TILES: Tracker[] = ["cawco", "github", "linear"];
  const tie = $derived(tracker.binding);
  const at = (ms: number): string =>
    new Date(ms).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
</script>

<BandGroup title={words.title}>
  <OptionGroup
    aria-label={words.title}
    layout="tiles"
    style="--tiles-cols: repeat(3, minmax(0, 1fr)); --tiles-cols-phone: repeat(3, minmax(0, 1fr))"
    bind:value={
      () => [tracker.tracker],
      (next) => {
        const picked = TILES.find((one) => one === next[0]);
        if (picked) {
          ontracker(picked);
        }
      }
    }
  >
    {#each TILES as one (one)}
      <OptionGroupItem value={one}>
        <TileFace name={words.names[one]} note={words.notes[one]}>
          {#snippet mark()}
            {#if one === "cawco"}
              <IconTaskList
                aria-hidden="true"
                class="size-icon-md text-ink-muted"
              />
            {:else}
              <ProviderLogo provider={one} size="control" />
            {/if}
          {/snippet}
        </TileFace>
      </OptionGroupItem>
    {/each}
  </OptionGroup>
  {#if tie}
    <div class="flex flex-col gap-space-2" data-slot="tie">
      <div class="flex min-w-0 items-center gap-space-2">
        <Button
          class="min-w-0 -ms-space-2"
          href={tie.targetUrl}
          rel="noreferrer"
          size="xs"
          target="_blank"
          variant="ghost"
        >
          <span class="overflow-clip text-ellipsis whitespace-nowrap"
            >{tie.targetName}</span
          >
          <IconArrowUpRight aria-hidden="true" data-icon="inline-end" />
        </Button>
        <span class="flex-1"></span>
        <Button
          icon={IconRefresh}
          label={words.syncNow}
          onclick={onsync}
          pending={syncing}
          pendingLabel={words.syncingNow}
          size="xs"
          variant="secondary"
        />
      </div>
      <div
        class="flex min-w-0 flex-wrap items-center gap-x-space-4 gap-y-space-1 type-meta"
        role="status"
      >
        <span class="mark-line flex items-center gap-space-1">
          {#if tie.state === "syncing"}
            <LiveDot />
            <span class="text-ink-strong">{words.syncing}</span>
          {:else if tie.state === "synced"}
            <IconSuccess
              aria-hidden="true"
              class="size-icon-sm text-status-done-glyph"
            />
            <span class="text-ink-strong"
              >{words.synced(
                tie.polledAt === null ? "" : at(tie.polledAt)
              )}</span
            >
          {:else}
            <IconError
              aria-hidden="true"
              class="size-icon-sm text-status-fail-glyph"
            />
            <span class="text-status-fail-ink">{words.refused}</span>
          {/if}
        </span>
        <span class="tabular-nums text-ink-muted"
          >{words.linked(tie.linked)}</span
        >
      </div>
      {#if tie.state === "refused" && tie.reason}
        <p class="m-0 type-meta text-status-fail-ink">{tie.reason}</p>
      {/if}
      {#if tie.provider === "github"}
        <div class="flex min-w-0 items-center gap-space-2 type-meta">
          {#if tie.githubProject}
            <span class="flex-none text-ink-muted">{words.stagesOn}</span>
            <Button
              class="min-w-0"
              href={tie.githubProject.url}
              rel="noreferrer"
              size="xs"
              target="_blank"
              variant="ghost"
            >
              <span class="overflow-clip text-ellipsis whitespace-nowrap"
                >{tie.githubProject.title}</span
              >
              <IconArrowUpRight aria-hidden="true" data-icon="inline-end" />
            </Button>
          {:else}
            <span class="min-w-0 text-ink-muted"
              >{tie.githubProjectReason ?? words.noStages}</span
            >
          {/if}
          <span class="flex-1"></span>
          <Button
            label={words.change}
            onclick={onchangestages}
            size="xs"
            variant="secondary"
          />
        </div>
      {/if}
    </div>
  {/if}
</BandGroup>
