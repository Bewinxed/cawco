<script lang="ts" module>
  import type { GroupKey } from "./model";

  /** What stands open over Home. */
  export type HomeOpen = "task" | "caw" | "configure" | null;

  /** Groups whose own read failed, each with when and the hub's reason. */
  export type FailedGroups = Partial<
    Record<GroupKey, { at: string; why: string }>
  >;
</script>

<script lang="ts">
  /**
   * Home, the morning briefing: the project opens here and every other
   * place is reached from it (Option 2). Caw's line first, then what needs
   * the person and what is working (the acting column), and beside them
   * the stages, what is coming up, the outputs since they last looked, the
   * decisions open and today's spend (the knowing column), each a short
   * list with its count in its heading and the way to its whole. Under the
   * briefing's two-column width (900, or with Caw's pane docked) the
   * knowing column follows the acting one in the same order, the stages a
   * line of chips.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import Progress from "#lib/components/ui/progress/progress.svelte";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import {
    IconCalendar,
    IconChat,
    IconDecisions,
    IconError,
    IconRepeat,
  } from "#lib/icons.js";
  import CawLine from "./CawLine.svelte";
  import CawPaneBody, { type CawPaneState } from "./CawPaneBody.svelte";
  import ConfigureBody from "./ConfigureBody.svelte";
  import { money, share } from "./format";
  import Group from "./Group.svelte";
  import type { Briefing, Need, Upcoming } from "./model";
  import NeedRow from "./NeedRow.svelte";
  import OutputTile from "./OutputTile.svelte";
  import PicksMeter from "./PicksMeter.svelte";
  import ProjectFrame from "./ProjectFrame.svelte";
  import StagesList from "./StagesList.svelte";
  import TaskPaneBody from "./TaskPaneBody.svelte";
  import WorkRow from "./WorkRow.svelte";

  let {
    briefing,
    read = "live",
    staleAt,
    failed = {},
    open = null,
    openTask,
    moreOpen = false,
    cawState = "conversation",
    asking = false,
    fresh = false,
    onanswer,
    onopen,
  }: {
    briefing: Briefing;
    /** `loading`: the first read, skeletons at real size; `stale`: the hub is not live. */
    read?: "live" | "loading" | "stale";
    /** The last good read, while stale. */
    staleAt?: string;
    failed?: FailedGroups;
    open?: HomeOpen;
    /** The task the pane holds. */
    openTask?: string;
    moreOpen?: boolean;
    /** How Caw's conversation stands in his pane. */
    cawState?: CawPaneState;
    /** Configure's Forget project… was pressed: its question stands. */
    asking?: boolean;
    /** A project just made: Caw's starter, every group named and empty. */
    fresh?: boolean;
    onanswer?: (need: Need, answer: string) => void;
    onopen?: (what: HomeOpen) => void;
  } = $props();

  const stale = $derived(read === "stale");
  const at = $derived(stale ? staleAt : undefined);
  /** Longest wait first, as listed; a row put back with Not now at the foot. */
  const needs = $derived([
    ...briefing.needs.filter((need) => !need.later),
    ...briefing.needs.filter((need) => need.later),
  ]);
  const shown = $derived(needs.slice(0, 5));
  const live = $derived(read === "live");
  const docked = $derived(open === "caw");

  /** A coming row's mark: a failed routine's X, a routine's repeat, a dated task's calendar. */
  const comingLook = (item: Upcoming) => {
    if (item.failed) {
      return {
        icon: IconError,
        label: words.coming.failedAt(item.failed.at),
        ink: "text-status-fail-glyph",
      };
    }
    return item.kind === "routine"
      ? { icon: IconRepeat, label: words.coming.routine, ink: "text-ink-muted" }
      : {
          icon: IconCalendar,
          label: words.coming.dated,
          ink: "text-ink-muted",
        };
  };

  /** What the open pane is, by what stands open. */
  const PANES = {
    task: { form: "over", close: words.taskPane.close },
    caw: { form: "dock", close: words.cawPane.close },
    configure: { form: "sheet", close: words.configure.close },
  } as const;
  const paneOf = $derived(open ? PANES[open] : undefined);
  const paneTitleOf = $derived.by(() => {
    if (open === "task") {
      return openTask;
    }
    return open === "caw" ? words.cawPane.title : words.configure.title;
  });
</script>

{#snippet skeletonGroup(rows: number)}
  <section aria-hidden="true" class="flex flex-col gap-space-2">
    <div class="flex min-h-c-section-head-h items-center ps-space-1">
      <Skeleton line="label" width="label" />
    </div>
    <div
      class="flex flex-col gap-space-3 rounded-lg bg-surface-raised p-space-3 shadow-tile"
    >
      {#each Array.from({ length: rows }, (_, i) => i) as i (i)}
        <Skeleton height="row" radius="tile" />
      {/each}
    </div>
  </section>
{/snippet}

{#snippet emptyLine(text: string)}
  <p class="m-0 px-space-4 py-space-3 type-body text-ink-muted">{text}</p>
{/snippet}

<ProjectFrame
  action={{ label: words.bar.askCaw, icon: IconChat, compact: true }}
  home
  more={[
    words.more.configure,
    words.more.arrange,
    words.more.wiring,
    words.more.cap,
    words.more.forget,
    words.more.remove,
  ]}
  {moreOpen}
  onaction={() => onopen?.("caw")}
  onclosepane={() => onopen?.(null)}
  pane={open ? paneBody : undefined}
  paneClose={paneOf?.close}
  paneForm={paneOf?.form}
  paneTitle={paneTitleOf}
  project={briefing.project}
  title={briefing.project}
>
  <div class="@container/home w-full">
    <div
      class={[
        "grid grid-cols-1 items-start gap-x-space-8 gap-y-space-5",
        !docked && "@min-home-briefing/home:grid-cols-3",
      ]}
      data-columns={docked ? "one" : undefined}
    >
      <!-- The acting column: what the person answers and follows. -->
      <div
        class={[
          "flex min-w-0 flex-col gap-space-5",
          !docked && "@min-home-briefing/home:col-span-2",
        ]}
      >
        {#if read === "loading"}
          <Skeleton height="block" radius="card" />
          {@render skeletonGroup(4)}
          {@render skeletonGroup(3)}
        {:else}
          <CawLine
            caw={briefing.caw}
            onopen={() => onopen?.("caw")}
            {stale}
            starter={fresh}
          />

          <Group
            count={briefing.needs.length}
            failed={failed.needs}
            seeAll={briefing.needs.length > 5 ? words.places.tasks : undefined}
            staleAt={at}
            title={words.groups.needs}
          >
            {#if shown.length > 0}
              <ul class="m-0 list-none p-0" {@attach reflow()}>
                {#each shown as need (need.id)}
                  <NeedRow {need} {onanswer} {stale} />
                {/each}
              </ul>
            {:else if live}
              {@render emptyLine(words.needs.none)}
            {/if}
          </Group>

          <Group
            count={briefing.work.length}
            failed={failed.working}
            seeAll={briefing.work.length > 0
              ? words.places.sessions
              : undefined}
            staleAt={at}
            title={words.groups.working}
          >
            {#if briefing.work.length > 0}
              <ul class="m-0 list-none p-0" {@attach reflow()}>
                {#each briefing.work.slice(0, 5) as work (work.id)}
                  <WorkRow {stale} {work} />
                {/each}
              </ul>
            {:else if live}
              {@render emptyLine(words.work.none)}
            {/if}
          </Group>
        {/if}
      </div>

      <!-- The knowing column: where things stand, each a way to its place. -->
      <div class="flex min-w-0 flex-col gap-space-5">
        {#if read === "loading"}
          {@render skeletonGroup(5)}
          {@render skeletonGroup(3)}
          {@render skeletonGroup(2)}
        {:else}
          <Group
            failed={failed.stages}
            seeAll={words.places.tasks}
            staleAt={at}
            title={words.groups.stages}
          >
            <div class={["hidden", !docked && "@min-home-briefing/home:block"]}>
              <StagesList
                archive={briefing.archive}
                stages={briefing.stages}
                {stale}
              />
            </div>
            <div
              class={["p-space-3", !docked && "@min-home-briefing/home:hidden"]}
            >
              <StagesList
                archive={briefing.archive}
                form="chips"
                stages={briefing.stages}
                {stale}
              />
            </div>
          </Group>

          <Group
            count={briefing.coming.length}
            failed={failed.coming}
            seeAll={briefing.coming.length > 0
              ? words.places.routines
              : undefined}
            staleAt={at}
            title={words.groups.coming}
          >
            {#if briefing.coming.length > 0}
              <ul class="m-0 list-none p-0">
                {#each briefing.coming as item (item.id)}
                  {@const look = comingLook(item)}
                  <!-- mark-line: the mark stands beside the title's line; a failure's reason starts under it. -->
                  <li
                    class="flex min-h-c-row-h items-start gap-space-3 border-b border-b-border-hairline py-space-2 ps-space-3 pe-space-3 last:border-b-0"
                  >
                    <span class="grid w-c-row-lead place-items-center" data-box>
                      <look.icon
                        aria-label={look.label}
                        class={["size-icon-md", look.ink]}
                        role="img"
                      />
                    </span>
                    <span class="flex min-w-0 flex-1 flex-col">
                      <span
                        class="overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-row"
                        >{item.title}</span
                      >
                      {#if item.failed}
                        <span class="type-meta text-ink-muted">
                          <span class="font-medium text-status-fail-ink"
                            >{words.coming.failedAt(item.failed.at)}</span
                          >
                          · {item.failed.why}
                        </span>
                      {/if}
                    </span>
                    <span
                      class="flex-none pt-space-row type-meta text-ink-muted tabular-nums"
                      >{item.when}</span
                    >
                  </li>
                {/each}
              </ul>
            {:else if live}
              {@render emptyLine(words.coming.none)}
            {/if}
          </Group>

          <Group
            card={false}
            count={briefing.outputs.filter((o) => o.isNew).length}
            failed={failed.outputs}
            seeAll={briefing.outputs.length > 0
              ? words.places.outputs
              : undefined}
            staleAt={at}
            title={words.groups.outputs}
          >
            {#if briefing.outputs.length > 0}
              <ul
                class="m-0 grid list-none grid-cols-2 gap-space-3 p-0 @min-phone/home:@max-home-briefing/home:grid-cols-3"
                {@attach reflow()}
              >
                {#each briefing.outputs as output (output.id)}
                  <OutputTile {output} {stale} />
                {/each}
              </ul>
            {:else if live}
              <p
                class="m-0 rounded-lg bg-surface-raised px-space-4 py-space-3 type-body text-ink-muted shadow-tile"
              >
                {fresh || !briefing.lookedAt
                  ? words.outputs.none
                  : words.outputs.noneSince(briefing.lookedAt)}
              </p>
            {/if}
          </Group>

          <Group
            count={briefing.decisions.length}
            failed={failed.decisions}
            seeAll={words.places.decisions}
            staleAt={at}
            title={words.groups.decisions}
          >
            {#if briefing.decisions.length > 0}
              <ul class="m-0 list-none p-0">
                {#each briefing.decisions as decision (decision.id)}
                  <!-- mark-line: the mark stands beside the title's line; a failure's reason starts under it. -->
                  <li
                    class="flex min-h-c-row-h items-start gap-space-3 border-b border-b-border-hairline py-space-2 ps-space-3 pe-space-3 last:border-b-0"
                  >
                    <span class="grid w-c-row-lead place-items-center" data-box>
                      <IconDecisions
                        aria-hidden="true"
                        class="size-icon-md text-ink-muted"
                      />
                    </span>
                    <span class="flex min-w-0 flex-1 flex-col gap-space-1">
                      <span
                        class="overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-row"
                        >{decision.title}</span
                      >
                      <PicksMeter
                        picked={decision.picked}
                        total={decision.total}
                      />
                    </span>
                    <span
                      class="flex-none pt-space-row type-meta text-ink-muted tabular-nums"
                      >{decision.age}</span
                    >
                  </li>
                {/each}
              </ul>
            {:else if live}
              {@render emptyLine(words.decisions.none)}
            {/if}
          </Group>

          <Group
            failed={failed.spend}
            seeAll={words.places.spend}
            staleAt={at}
            title={words.groups.spend}
          >
            <div class="flex flex-col gap-space-2 px-space-4 py-space-3">
              <p class="m-0 flex items-baseline gap-space-2">
                <span class="type-kpi text-ink-stat tabular-nums"
                  >{money(briefing.spend.today)}</span
                >
                <span class="type-meta text-ink-muted"
                  >{words.spend.of(money(briefing.spend.cap))}</span
                >
              </p>
              <Progress
                aria-label={`${money(briefing.spend.today)} ${words.spend.of(money(briefing.spend.cap))}`}
                value={share(briefing.spend.today, briefing.spend.cap)}
              />
            </div>
          </Group>
        {/if}
      </div>
    </div>
  </div>
</ProjectFrame>

{#snippet paneBody()}
  {#if open === "task"}
    <TaskPaneBody title={openTask ?? ""} />
  {:else if open === "caw"}
    <CawPaneBody caw={briefing.caw} state={cawState} />
  {:else}
    <ConfigureBody {asking} project={briefing.project} />
  {/if}
{/snippet}
