<script lang="ts">
  /**
   * Task list: Only here, GitHub Issues or Linear, three tiles across (one
   * column on a phone), the two services in their own marks, each with its
   * line. A service not yet connected reads as its act (Connect GitHub
   * Issues); the connected one reads as connected, with Change… under the
   * grid. While connected, its facts stand under the tiles on the section's
   * own edge: the codebase or team as a link out, how many tasks are
   * linked, the status board or the service's reason there is none; then
   * how it stands (first update running, up to date as of a time, or the
   * service's refusal in its own words), with Refresh now.
   *
   * Pressing a service that is not connected changes nothing yet: it opens
   * the Connect task list step. Pressing Only here while connected asks
   * under the tiles first: Stop updating, or Cancel.
   */
  import {
    cardWords,
    sectionWords,
    taskWords,
  } from "@cawco/core/words/project-details";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconArrowUpRight,
    IconError,
    IconFolder,
    IconRefresh,
    IconSuccess,
    IconTaskList,
  } from "#lib/icons.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type { Choice, Pending, Read, TaskList } from "./details";
  import OptionLine from "./OptionLine.svelte";
  import Section from "./Section.svelte";

  type Kind = TaskList["kind"];

  let {
    tasks,
    pending,
    confirmStop = $bindable(false),
    sunk = false,
    onpick,
    onconnect,
    onrefresh,
    onchange,
    ontry,
  }: {
    tasks: Read<TaskList>;
    pending?: Pending;
    /** Only here is asking under the tiles. */
    confirmStop?: boolean;
    sunk?: boolean;
    onpick: (pick: Choice) => void;
    /** A service not connected was pressed: its step opens. */
    onconnect: (provider: "github" | "linear") => void;
    onrefresh: () => void;
    /** Change…: the step, its answers filled in. */
    onchange: () => void;
    ontry: () => void;
  } = $props();

  const KINDS: Kind[] = ["here", "github", "linear"];
  const SERVICE = { github: "GitHub", linear: "Linear" } as const;
  const TILES =
    "--tiles-cols: repeat(3, minmax(0, 1fr)); --tiles-cols-phone: minmax(0, 1fr)";
  const chosen = $derived(tasks.state === "read" ? tasks.value.kind : null);
  const linked = $derived(
    tasks.state === "read" && tasks.value.kind !== "here" ? tasks.value : null
  );
  /** A tile's name: a service not connected reads as its act. */
  const nameOf = (kind: Kind): string => {
    if (kind === "here") {
      return taskWords.here.name;
    }
    return kind === chosen ? taskWords[kind].name : taskWords[kind].connect;
  };

  function press(next: Kind): void {
    if (next === chosen) {
      return;
    }
    if (next === "here") {
      confirmStop = true;
      return;
    }
    confirmStop = false;
    onconnect(next);
  }
</script>

<Section
  hue="var(--color-mark-4)"
  icon={IconTaskList}
  key="tasks"
  line={sectionWords.tasks.line}
  name={sectionWords.tasks.name}
>
  {#if tasks.state === "reading"}
    <div class="grid grid-cols-3 gap-space-2 max-phone:grid-cols-1">
      {#each KINDS as kind (kind)}
        <Skeleton height="item" />
      {/each}
    </div>
  {:else if tasks.state === "failed"}
    <RowFault again={ontry} reason="{cardWords.couldntRead} {tasks.reason}" />
  {:else}
    <div class="flex flex-col gap-space-3" in:reveal>
      <OptionGroup
        aria-label={sectionWords.tasks.name}
        bind:value={
          () => (chosen ? [chosen] : []),
          (next) => {
            const value = KINDS.find((kind) => kind === next[0]);
            if (value) {
              press(value);
            }
          }
        }
        disabled={sunk}
        glide
        layout="tiles"
        style={TILES}
      >
        {#each KINDS as kind (kind)}
          <OptionGroupItem value={kind}>
            {#if kind === "here"}
              <OptionLine
                glyph={IconFolder}
                line={taskWords.here.line}
                name={nameOf(kind)}
                tile
                waiting={pending?.value === kind && !pending.refused}
              />
            {:else}
              <OptionLine
                line={taskWords[kind].line}
                name={nameOf(kind)}
                tag={kind === chosen ? taskWords.connected : undefined}
                tile
                waiting={pending?.value === kind && !pending.refused}
              >
                {#snippet mark()}
                  <ProviderLogo provider={kind} />
                {/snippet}
              </OptionLine>
            {/if}
          </OptionGroupItem>
        {/each}
      </OptionGroup>

      {#if pending?.refused}
        <RowFault
          again={() => onpick({ section: "tasks", value: pending.value })}
          reason={pending.refused}
        />
      {/if}

      {#if confirmStop && linked}
        <div
          class="flex flex-col gap-space-3 rounded-sm border border-border-hairline bg-surface-recess p-space-3"
          data-confirm="stop-updating"
          transition:unfold
        >
          <p class="m-0 type-label text-pretty text-ink-strong">
            {taskWords.stopAsk(SERVICE[linked.kind], linked.linked)}
          </p>
          <div class="flex flex-wrap items-center justify-between gap-space-2">
            <Button
              onclick={() => {
                confirmStop = false;
              }}
              size="sm"
              variant="outline">{taskWords.cancel}</Button
            >
            <Button
              onclick={() => {
                confirmStop = false;
                onpick({ section: "tasks", value: "here" });
              }}
              size="sm"
              variant="destructive">{taskWords.stop}</Button
            >
          </div>
        </div>
      {/if}

      {#if linked}
        {@const service = SERVICE[linked.kind]}
        <!-- The connected service's facts, on the section's own edge under
             the tiles: where it updates (the codebase or team and how many
             tasks are linked, with Change… at the line's end); for GitHub,
             the status board; then how it stands, with Refresh now. -->
        <div class="flex flex-col gap-space-1" data-facts={linked.kind}>
          <div class="flex flex-wrap items-center gap-x-space-2 gap-y-space-1">
            <span class="type-meta">
              <a
                class="mark-line inline-flex items-center gap-space-1 rounded-xs text-link-ink underline-offset-4 hover:underline"
                href={linked.target.url}
                rel="noreferrer"
                target="_blank"
                ><span>{linked.target.name}</span><IconArrowUpRight
                  aria-hidden="true"
                  class="size-icon-sm flex-none"
                /></a
              >
            </span>
            <span
              class="type-meta whitespace-nowrap tabular-nums text-ink-muted"
            >
              · {taskWords.linked(linked.linked)}
            </span>
            <Button
              class="ms-auto"
              disabled={sunk}
              onclick={onchange}
              size="xs"
              variant="ghost">{taskWords.change}</Button
            >
          </div>
          {#if linked.kind === "github"}
            <span
              class="flex min-w-0 flex-wrap items-center gap-x-space-2 type-meta"
            >
              <span class="whitespace-nowrap text-ink-muted"
                >{taskWords.board}</span
              >
              {#if linked.board && "url" in linked.board}
                <a
                  class="mark-line inline-flex items-center gap-space-1 rounded-xs text-link-ink underline-offset-4 hover:underline"
                  href={linked.board.url}
                  rel="noreferrer"
                  target="_blank"
                  ><span>{linked.board.name}</span><IconArrowUpRight
                    aria-hidden="true"
                    class="size-icon-sm flex-none"
                  /></a
                >
              {:else if linked.board}
                <span class="text-pretty text-ink-muted"
                  >{linked.board.reason}</span
                >
              {:else}
                <span class="text-ink-muted">{taskWords.noBoard}</span>
              {/if}
            </span>
          {/if}
          <div class="flex flex-wrap items-center gap-x-space-3 gap-y-space-1">
            <!-- mark-line: the glyph stands at the top of words that may wrap -->
            <span
              class="flex min-w-0 flex-1 items-start gap-space-2 type-meta"
              aria-live="polite"
            >
              {#if linked.standing.state === "reading"}
                <Skeleton line="meta" width="title" />
              {:else if linked.standing.state === "failed"}
                <span class="text-status-fail-ink"
                  >{cardWords.couldntRead} {linked.standing.reason}</span
                >
              {:else if linked.standing.value.state === "first"}
                <LiveDot />
                <span class="text-ink-strong">{taskWords.first}</span>
              {:else if linked.standing.value.state === "updating"}
                <Spinner box="small" tone="muted" />
                <span class="text-ink-strong">{taskWords.updating}</span>
              {:else if linked.standing.value.state === "up-to-date"}
                <IconSuccess
                  aria-hidden="true"
                  class="mt-px size-icon-sm flex-none text-status-done-ink"
                />
                <span class="whitespace-nowrap text-ink-strong"
                  >{taskWords.upToDate(linked.standing.value.at)}</span
                >
              {:else}
                <IconError
                  aria-hidden="true"
                  class="mt-px size-icon-sm flex-none text-status-fail-ink"
                />
                <span class="text-pretty text-status-fail-ink"
                  >{taskWords.refused(service)}
                  {linked.standing.value.words}</span
                >
              {/if}
            </span>
            <Button
              disabled={sunk}
              icon={IconRefresh}
              label={linked.standing.state === "failed"
                ? cardWords.tryAgain
                : taskWords.refresh}
              onclick={onrefresh}
              pending={linked.standing.state === "read" &&
                linked.standing.value.state === "updating"}
              size="xs"
              variant="outline"
            />
          </div>
        </div>
      {/if}
    </div>
  {/if}
</Section>
