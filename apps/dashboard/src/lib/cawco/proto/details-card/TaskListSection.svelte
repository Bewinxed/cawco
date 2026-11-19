<script lang="ts">
  import RowFault from "#lib/cawco/RowFault.svelte";
  /**
   * Task list: Only here, GitHub Issues or Linear, three option rows, the
   * two services in their own marks. While connected, the chosen row holds
   * the connection's facts under its name: the codebase or team as a link
   * out, how many tasks are linked, how it stands (first update running,
   * up to date as of a time, or the service's refusal in its own words),
   * Refresh now, the status board or the service's reason there is none,
   * and Change…, which opens the step with its answers filled in.
   *
   * Pressing a service that is not connected changes nothing yet: it opens
   * the Connect task list step. Pressing Only here while connected asks
   * under that row first: Stop updating, or Cancel.
   */
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
  } from "#lib/icons.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import type { Choice, Pending, Read, TaskList } from "./details";
  import OptionLine from "./OptionLine.svelte";
  import Section from "./Section.svelte";
  import { cardWords, sectionWords, taskWords } from "./words";

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
    /** Only here is asking under its row. */
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
  /** Each service in its own mark. */
  const SERVICE_MARK = { github: githubMark, linear: linearMark } as const;
  const chosen = $derived(tasks.state === "read" ? tasks.value.kind : null);
  const linked = $derived(
    tasks.state === "read" && tasks.value.kind !== "here" ? tasks.value : null
  );

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

{#snippet githubMark()}
  <ProviderLogo provider="github" />
{/snippet}

{#snippet linearMark()}
  <ProviderLogo provider="linear" />
{/snippet}

<Section
  key="tasks"
  line={sectionWords.tasks.line}
  name={sectionWords.tasks.name}
>
  {#if tasks.state === "reading"}
    <div class="flex flex-col gap-space-2">
      {#each KINDS as kind (kind)}
        <Skeleton height="item" />
      {/each}
    </div>
  {:else if tasks.state === "failed"}
    <RowFault again={ontry} reason="{cardWords.couldntRead} {tasks.reason}" />
  {:else}
    <div in:reveal>
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
        layout="list"
      >
        {#each KINDS as kind (kind)}
          <OptionGroupItem title={taskWords[kind].line} value={kind}>
            <OptionLine
              glyph={IconFolder}
              line={chosen === kind ? taskWords[kind].line : undefined}
              mark={kind === "here" ? undefined : SERVICE_MARK[kind]}
              name={taskWords[kind].name}
              waiting={pending?.value === kind && !pending.refused}
            />
          </OptionGroupItem>

          {#if kind === "here" && confirmStop && linked}
            <div
              class="flex flex-col gap-space-3 ps-c-details-option-text pe-space-3 py-space-2"
              data-confirm="stop-updating"
              transition:unfold
            >
              <p class="m-0 type-label text-pretty text-ink-strong">
                {taskWords.stopAsk(SERVICE[linked.kind], linked.linked)}
              </p>
              <div
                class="flex flex-wrap items-center justify-between gap-space-2"
              >
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

          {#if linked && kind === linked.kind}
            {@const service = SERVICE[linked.kind]}
            <!-- The chosen row's facts, on its name's edge, in two lines:
                 where it updates (the codebase or team, how many tasks are
                 linked, the status board); then how it stands, with Refresh
                 now and Change…. -->
            <dl
              class="m-0 flex flex-col gap-space-1 ps-c-details-option-text pe-space-3 pt-space-1 pb-space-2"
              data-facts={linked.kind}
            >
              <div
                class="flex flex-wrap items-center gap-x-space-2 gap-y-space-1"
              >
                <dt class="sr-only">
                  {linked.kind === "github" ? "Codebase" : "Team"}
                </dt>
                <dd class="m-0">
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
                </dd>
                <dd class="m-0 type-meta tabular-nums text-ink-muted">
                  · {taskWords.linked(linked.linked)}
                </dd>
                {#if linked.kind === "github"}
                  <dt class="type-meta whitespace-nowrap text-ink-muted">
                    · {taskWords.board}
                  </dt>
                  <dd class="m-0 min-w-0 type-meta">
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
                  </dd>
                {/if}
              </div>
              <div
                class="flex flex-wrap items-center gap-x-space-3 gap-y-space-1"
              >
                <dt class="sr-only">Standing</dt>
                <!-- mark-line: the glyph stands at the top of words that may wrap -->
                <dd
                  class="m-0 flex min-w-0 flex-1 items-start gap-space-2 type-meta"
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
                    <span class="text-ink-strong"
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
                </dd>
                <dd class="m-0">
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
                </dd>
                <dd class="m-0">
                  <Button
                    disabled={sunk}
                    onclick={onchange}
                    size="xs"
                    variant="ghost">{taskWords.change}</Button
                  >
                </dd>
              </div>
            </dl>
          {/if}

          {#if pending?.value === kind && pending.refused}
            <RowFault
              again={() => onpick({ section: "tasks", value: kind })}
              reason={pending.refused}
            />
          {/if}
        {/each}
      </OptionGroup>
    </div>
  {/if}
</Section>
