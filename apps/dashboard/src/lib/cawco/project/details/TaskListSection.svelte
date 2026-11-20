<script lang="ts">
  /**
   * Task list: Only here, GitHub Issues or Linear, three tiles across (one
   * column on a phone), the two services in their own marks, each with its
   * line. A service not yet connected reads as its act (Connect GitHub
   * Issues, ending on a chevron: it opens a step, it picks nothing); the
   * connected one reads as connected. While connected, its facts stand under the tiles as one labelled
   * unit (Syncing with GitHub Issues, with Change…): the codebase or team as
   * a link out, how many tasks are linked, the status board or the
   * service's reason there is none; then how it stands (first update
   * running, up to date as of a time, or the service's refusal in its own
   * words), with Refresh now.
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
  import { cardForms } from "./card-layout";
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

  const id = $props.id();
  const forms = cardForms();
  /** Its options as tiles, or as rows (one line each where the form says `lines`). */
  const form = $derived(forms().tasks);
  const KINDS: Kind[] = ["here", "github", "linear"];
  const SERVICE = { github: "GitHub", linear: "Linear" } as const;
  const TILES =
    "--tiles-cols: repeat(3, minmax(0, 1fr)); --tiles-cols-phone: minmax(0, 1fr)";
  const chosen = $derived(tasks.state === "read" ? tasks.value.kind : null);
  type Linked = Exclude<TaskList, { kind: "here" }>;
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

{#snippet standing(linked: Linked, service: string)}
  <!-- Never narrower than its words: in a narrow column the line wraps
       under the status board rather than cutting how the sync stands. -->
  <!-- mark-line: the glyph stands at the top of words that may wrap -->
  <span
    class="flex flex-1 items-start gap-space-2 type-meta"
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
    size="sm"
    variant="outline"
  />
{/snippet}

{#snippet boardOf(linked: Linked)}
  {#if linked.board && "url" in linked.board}
    {@render out(linked.board)}
  {:else if linked.board}
    <span class="text-pretty text-ink-muted">{linked.board.reason}</span>
  {:else}
    <span class="text-ink-muted">{taskWords.noBoard}</span>
  {/if}
{/snippet}

{#snippet out(target: { name: string; url: string })}
  <a
    class="mark-line pointer-hit touch-hit inline-flex items-center gap-space-1 rounded-xs text-link-ink underline-offset-4 hover:underline"
    href={target.url}
    rel="noreferrer"
    target="_blank"
    ><span class="wrap-anywhere">{target.name}</span><IconArrowUpRight
      aria-hidden="true"
      class="size-icon-sm flex-none"
    /></a
  >
{/snippet}

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
        layout={form === "tiles" ? "tiles" : "list"}
        style={form === "tiles" ? TILES : undefined}
      >
        {#each KINDS as kind (kind)}
          <OptionGroupItem value={kind}>
            {#if kind === "here"}
              <OptionLine
                glyph={IconFolder}
                inline={form === "lines"}
                line={taskWords.here.line}
                name={nameOf(kind)}
                tile={form === "tiles"}
                waiting={pending?.value === kind && !pending.refused}
              />
            {:else}
              <OptionLine
                inline={form === "lines"}
                line={taskWords[kind].line}
                name={nameOf(kind)}
                opens={kind !== chosen}
                tag={kind === chosen ? taskWords.connected : undefined}
                tile={form === "tiles"}
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
        <section
          aria-labelledby="{id}-facts"
          class="flex flex-col gap-space-3 rounded-sm border border-border-hairline p-space-3"
          data-facts={linked.kind}
        >
          <div
            class="mark-line flex flex-wrap items-center gap-x-space-3 gap-y-space-2"
          >
            <span class="flex flex-none" data-box>
              <ProviderLogo provider={linked.kind} />
            </span>
            <h4
              class="m-0 min-w-0 flex-1 type-label text-pretty text-ink-strong"
              id="{id}-facts"
            >
              {taskWords.syncing(taskWords[linked.kind].name)}
            </h4>
            <Button
              data-box
              disabled={sunk}
              onclick={onchange}
              size="sm"
              variant="outline">{taskWords.change}</Button
            >
          </div>
          {#if forms().sync === "full"}
            <dl
              class="m-0 grid grid-cols-auto-fluid items-baseline gap-x-space-4 gap-y-space-1 type-meta"
            >
              <dt class="text-ink-muted">
                {linked.kind === "github"
                  ? taskWords.repository
                  : taskWords.team}
              </dt>
              <dd class="m-0 min-w-0">
                {@render out(linked.target)}
              </dd>
              <dt class="text-ink-muted">{taskWords.tasks}</dt>
              <dd class="m-0 tabular-nums text-ink-strong">
                {taskWords.linked(linked.linked)}
              </dd>
              {#if linked.kind === "github"}
                <dt class="text-ink-muted">{taskWords.board}</dt>
                <dd class="m-0 min-w-0">
                  {@render boardOf(linked)}
                </dd>
              {/if}
            </dl>
            <div
              class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2 border-t border-border-hairline pt-space-3"
            >
              {@render standing(linked, service)}
            </div>
          {:else}
            <!-- Three tiers: its head; where it updates beside how many
                 tasks are linked; the status board beside how it stands,
                 with Refresh now. -->
            <div
              class="flex flex-wrap items-baseline gap-x-space-4 gap-y-space-1 type-meta"
            >
              <span class="flex min-w-0 items-baseline gap-x-space-2">
                <span class="text-ink-muted"
                  >{linked.kind === "github"
                    ? taskWords.repository
                    : taskWords.team}</span
                >
                {@render out(linked.target)}
              </span>
              <span class="flex items-baseline gap-x-space-2">
                <span class="text-ink-muted">{taskWords.tasks}</span>
                <span class="tabular-nums text-ink-strong"
                  >{taskWords.linked(linked.linked)}</span
                >
              </span>
            </div>
            <div
              class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2 border-t border-border-hairline pt-space-2"
            >
              {#if linked.kind === "github"}
                <span
                  class="flex min-w-0 items-baseline gap-x-space-2 type-meta"
                >
                  <span class="text-ink-muted">{taskWords.board}</span>
                  {@render boardOf(linked)}
                </span>
              {/if}
              {@render standing(linked, service)}
            </div>
          {/if}
        </section>
      {/if}
    </div>
  {/if}
</Section>
