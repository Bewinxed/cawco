<script lang="ts">
  /**
   * Home: exactly three groups (the option's "Home holds exactly three
   * groups"). The stages in one line, each a way into the board at that
   * stage, Archive at its end; then Needs you, every wait longest first,
   * answered in place; and Working now, stuck first with its cause. From the
   * desk line up Needs you and Working now stand side by side, Needs you the
   * wider, where the eye starts; under it they stack.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconAgent, IconNeedsYou, IconWorking } from "#lib/icons.js";
  import type { Need, Project, Read, Work } from "./model";
  import NeedRow from "./NeedRow.svelte";
  import StagesLine from "./StagesLine.svelte";
  import StaleNote from "./StaleNote.svelte";
  import WorkRow from "./WorkRow.svelte";

  let {
    project,
    read,
    needs,
    onanswer,
    onopen,
    onlater,
    onwork,
    onstage,
    onaskcaw,
  }: {
    project: Project;
    read: Read;
    /** The waits as they stand now: an answered one has left. */
    needs: Need[];
    onanswer: (need: Need, yes: boolean) => void;
    onopen: (need: Need) => void;
    onlater: (need: Need) => void;
    onwork: (work: Work) => void;
    onstage: (stage: string) => void;
    onaskcaw: () => void;
  } = $props();

  const reading = $derived(read.status === "loading");
  const stale = $derived(read.stale !== null);
  const workUnread = $derived(read.unread.includes("home:working"));
  const working = $derived(
    [...project.working].sort(
      (a, b) => Number(b.state === "stuck") - Number(a.state === "stuck")
    )
  );
  const empty = $derived(project.tasks.length === 0 && needs.length === 0);
</script>

<div class="flex flex-col gap-space-group">
  {#if stale && read.stale}
    <StaleNote since={read.stale} />
  {/if}
  <StagesLine {project} {reading} {stale} {onstage} />
  <div class="@container/home">
    <div class="grid gap-space-group @desk/home:grid-cols-5">
      <section
        class="flex min-w-0 flex-col gap-space-2 @desk/home:col-span-3"
        aria-labelledby="needs-head"
      >
        <h2
          id="needs-head"
          class="mark-line flex h-c-section-head-h items-center gap-space-2 px-space-3 type-label text-ink-strong"
        >
          <span>{w.needsYouGroup}</span>
          {#if !(reading || stale) && needs.length > 0}
            <span
              class="size-(--status-dot-size) rounded-pill bg-status-attn-glyph"
              data-box
              aria-hidden="true"
            ></span>
            <span class="type-meta num text-ink-muted">{needs.length}</span>
          {:else if stale && read.stale}
            <span class="type-meta text-ink-muted"
              >{w.staleSince(read.stale)}</span
            >
          {/if}
        </h2>
        <div class="rounded-lg bg-surface-raised shadow-tile">
          {#if reading}
            <div class="flex flex-col gap-space-3 p-space-3" aria-busy="true">
              {#each [0, 1, 2] as row (row)}
                <Skeleton height="block" radius="tile" />
              {/each}
            </div>
          {:else if needs.length === 0 && !stale}
            {#if empty}
              <EmptyState
                icon={IconNeedsYou}
                title={w.nothingNeedsYouTitle}
                line={w.nothingNeedsYouWhy}
                pad="pane"
              >
                {#snippet action()}
                  <Button
                    size="sm"
                    icon={IconAgent}
                    label={w.startStarter}
                    onclick={onaskcaw}
                  />
                {/snippet}
              </EmptyState>
            {:else}
              <p
                class="mark-line flex items-center gap-space-3 px-space-3 py-space-4 type-body text-ink-muted"
              >
                <span
                  class="grid w-c-row-lead flex-none place-items-center"
                  data-box
                >
                  <IconNeedsYou class="size-icon-md" aria-hidden="true" />
                </span>
                <span>{w.nothingNeedsYouTitle}</span>
              </p>
            {/if}
          {:else}
            <ul
              class="flex flex-col divide-y divide-border-hairline"
              {@attach reflow()}
            >
              {#each needs as need (need.id)}
                <NeedRow {need} held={stale} {onanswer} {onopen} {onlater} />
              {/each}
            </ul>
          {/if}
        </div>
      </section>
      <section
        class="flex min-w-0 flex-col gap-space-2 @desk/home:col-span-2"
        aria-labelledby="working-head"
      >
        <h2
          id="working-head"
          class="mark-line flex h-c-section-head-h items-center gap-space-2 px-space-3 type-label text-ink-strong"
        >
          <span>{w.workingGroup}</span>
          {#if workUnread}
            <span class="type-meta text-status-fail-ink">{w.couldNotRead}</span>
          {:else if !(reading || stale) && working.length > 0}
            <span class="type-meta num text-ink-muted">{working.length}</span>
          {/if}
        </h2>
        <div class="rounded-lg bg-surface-raised shadow-tile">
          {#if reading}
            <div class="flex flex-col gap-space-3 p-space-3" aria-busy="true">
              {#each [0, 1, 2] as row (row)}
                <Skeleton height="row" radius="tile" />
              {/each}
            </div>
          {:else if working.length === 0 && !stale}
            <EmptyState
              icon={IconWorking}
              title={w.nothingRunning}
              line={w.nothingRunningWhy}
              pad="pane"
            >
              {#snippet action()}
                <Button
                  variant="outline"
                  size="sm"
                  icon={IconAgent}
                  label={w.askCaw}
                  onclick={onaskcaw}
                />
              {/snippet}
            </EmptyState>
          {:else}
            {#if workUnread}
              <p class="px-space-5 pt-space-3 type-meta text-ink-muted">
                {w.staleRows(read.kept ?? "")}
              </p>
            {/if}
            <ul
              class="flex flex-col divide-y divide-border-hairline"
              {@attach reflow()}
            >
              {#each working as work (work.id)}
                <WorkRow {work} stale={stale || workUnread} onopen={onwork} />
              {/each}
            </ul>
          {/if}
        </div>
      </section>
    </div>
  </div>
</div>
