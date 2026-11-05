<script lang="ts" module>
  /** What stands open over the task's own groups, in the page. */
  export type Layer = "none" | "sendBack" | "drop" | "session" | "wait";
  /** The act the hub has not answered yet. */
  export type Pending =
    "passOn" | "sendBack" | "drop" | "retry" | "approve" | "deny" | null;
</script>

<script lang="ts">
  import { bringIntoView } from "@cawco/core/bring-into-view";
  /**
   * A task opened from its project's board, "Your move first": one page
   * whose top block is the person's move, chosen by the task's live state.
   * Below it, in the order the person asks: since you looked, the work,
   * what it waits on and releases, say something, history, then the brief
   * and how it runs, folded. On a desk (the page's own width past the wide
   * line) the same groups stand in two columns: the move, the work and the
   * composer on the left, where the eye starts; since you looked, the
   * waits, history and the brief on the right. A session opened stands
   * beside the task on a desk, the task narrowing to one column with Your
   * move still on top; below the desk line it opens in the task's place
   * with Back. A task a wait points at swaps into this one's place, Back
   * returning to the wait row.
   *
   * Everything the page shows arrives as props: the task as the hub read
   * it, the clock, and the moves the hub has not answered. What only the
   * page decides (which layer stands open, a fold, a draft) it keeps, and a
   * story may set it.
   */
  import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
  import { tick } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { reveal } from "#lib/cawco/motion/curves.svelte.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import AskHere from "./AskHere.svelte";
  import BriefFold from "./BriefFold.svelte";
  import FoldGroup from "./FoldGroup.svelte";
  import type { Looking, TaskRead, WaitRead } from "./fixtures/types";
  import Group from "./Group.svelte";
  import Ledger from "./Ledger.svelte";
  import SaySomething from "./SaySomething.svelte";
  import SessionPane from "./SessionPane.svelte";
  import TaskHead from "./TaskHead.svelte";
  import TheWork from "./TheWork.svelte";
  import Waits from "./Waits.svelte";
  import { when } from "./when";
  import YourMove from "./YourMove.svelte";

  const noop = () => undefined;

  let {
    task,
    looking,
    stale = null,
    layer = $bindable("none"),
    pending = null,
    refusal = null,
    answeredAt = null,
    sessionLoad = "live",
    waitTask = null,
    waitLoad = "live",
    missingWait = null,
    note = $bindable(""),
    dropReason = $bindable(""),
    historyOpen = $bindable(false),
    briefOpen = $bindable(false),
    onpass = noop,
    onsendback = noop,
    ondrop = noop,
    onretry = noop,
    onapprove = noop,
    ondeny = noop,
  }: {
    /** The task as the hub read it; null until the first read. */
    task: TaskRead | null;
    looking: Looking;
    /** The hub is not answering: when the read on screen was made. */
    stale?: number | null;
    layer?: Layer;
    pending?: Pending;
    refusal?: string | null;
    answeredAt?: number | null;
    sessionLoad?: "loading" | "error" | "live";
    /** The task a wait points at, opened in this one's place. */
    waitTask?: TaskRead | null;
    waitLoad?: "loading" | "live";
    /** A wait whose target the hub could not find, by its href. */
    missingWait?: string | null;
    note?: string;
    dropReason?: string;
    historyOpen?: boolean;
    briefOpen?: boolean;
    onpass?: () => void;
    onsendback?: () => void;
    ondrop?: () => void;
    onretry?: () => void;
    onapprove?: () => void;
    ondeny?: () => void;
  } = $props();

  const uid = $props.id();
  /** The page's own width, read as it lays out: the desk's two columns past the wide line. */
  let width = $state(0);
  let root = $state<HTMLElement | null>(null);
  const WIDE = 1025;
  const DESK = 900;
  const wide = $derived(width >= WIDE && layer !== "session");
  const desk = $derived(width >= DESK);
  const sessionBeside = $derived(layer === "session" && desk);
  const sessionInPlace = $derived(layer === "session" && !desk);

  const since = $derived(
    task
      ? task.history.filter((row) => row.at > looking.lastLooked).toReversed()
      : []
  );
  const history = $derived(task ? task.history.toReversed() : []);
  const sessionOf = $derived(
    task?.result?.session ?? task?.attempts[0]?.session ?? null
  );
  const said = $derived(
    task?.result?.report ?? task?.attempts[0]?.headline ?? ""
  );
  const saidAt = $derived(
    task?.result?.at ?? task?.attempts[0]?.endedAt ?? looking.now
  );

  /** Who takes the task up where Send back puts it (hub stages.ts `sendBackOf`). */
  function takenUpBy(back: NonNullable<TaskRead["sendBack"]>): string {
    switch (back.by) {
      case "attempt":
        return words.move.backToAttempt;
      case "start":
        return words.move.backToStart;
      case "nobody":
        return words.move.backToNobody(back.stage);
    }
  }

  const toggle = (next: Layer) => {
    layer = layer === next ? "none" : next;
  };

  async function showHistory() {
    historyOpen = true;
    await tick();
    const target = root?.querySelector(`#${CSS.escape(`${uid}-history`)}`);
    if (target) {
      bringIntoView(target);
    }
  }

  async function showWaits() {
    await tick();
    const target = root?.querySelector(`#${CSS.escape(`${uid}-waits`)}`);
    if (target) {
      bringIntoView(target);
    }
  }

  const openWait = (wait: WaitRead) => {
    if (wait.kind === "task") {
      layer = "wait";
    }
  };
</script>

{#snippet sendBackTile()}
  {#if task?.sendBack}
    <AskHere
      cancel={words.sendBackTile.cancel}
      consequence={takenUpBy(task.sendBack)}
      oncancel={() => {
        layer = "none";
      }}
      onconfirm={onsendback}
      pending={pending === "sendBack"}
      pendingLabel={words.move.sendingBack}
      {refusal}
      title={words.sendBackTile.title(task.sendBack.stage)}
      verb={words.move.sendBack(task.sendBack.stage)}
    />
  {/if}
{/snippet}

{#snippet skeleton()}
  <div
    aria-busy="true"
    class="flex flex-col gap-space-5"
    data-slot="task-skeleton"
    out:reveal
  >
    <Skeleton height="control" radius="tile" width="title" />
    <Skeleton height="board" radius="card" />
    <Skeleton height="block" radius="card" />
    <Skeleton height="block" radius="card" />
    <Skeleton height="block" radius="card" />
  </div>
{/snippet}

{#snippet move(current: TaskRead)}
  <Group heading={words.move.heading} id={`${uid}-move`}>
    <YourMove
      {answeredAt}
      now={looking.now}
      {onapprove}
      {ondeny}
      {onpass}
      onreopen={noop}
      {onretry}
      onsendback={() => toggle("sendBack")}
      onsession={() => toggle("session")}
      onwaits={showWaits}
      {pending}
      refusal={layer === "sendBack" ? null : refusal}
      sendBackTile={layer === "sendBack" ? sendBackTile : undefined}
      task={current}
      {wide}
      bind:note
    />
  </Group>
{/snippet}

{#snippet sinceGroup()}
  <Group heading={words.since.heading} id={`${uid}-since`}>
    {#snippet trailing()}
      <button
        class="press-tint rounded-xs type-label text-link-ink hover:underline"
        type="button"
        onclick={showHistory}>{words.since.showAll}</button
      >
    {/snippet}
    {#if since.length === 0}
      <p class="m-0 type-body text-ink-muted">{words.since.nothing}</p>
    {:else}
      <Ledger now={looking.now} rows={since} />
    {/if}
  </Group>
{/snippet}

{#snippet workGroup(current: TaskRead)}
  <Group heading={words.work.heading} id={`${uid}-work`}>
    <TheWork
      now={looking.now}
      onsession={() => toggle("session")}
      task={current}
    />
  </Group>
{/snippet}

{#snippet waitsGroup(current: TaskRead)}
  <Group heading={words.waits.heading} id={`${uid}-waits`}>
    <Waits missing={missingWait} onopen={openWait} task={current} />
  </Group>
{/snippet}

{#snippet sayGroup(current: TaskRead)}
  <Group heading={words.say.heading} id={`${uid}-say`}>
    <SaySomething task={current} />
  </Group>
{/snippet}

{#snippet historyGroup()}
  <FoldGroup
    heading={words.history.heading}
    id={`${uid}-history`}
    bind:open={historyOpen}
  >
    <Ledger now={looking.now} rows={history} />
  </FoldGroup>
{/snippet}

{#snippet dropTile()}
  <AskHere
    cancel={words.drop.cancel}
    consequence={words.drop.consequence}
    destructive
    oncancel={() => {
      layer = "none";
    }}
    onconfirm={ondrop}
    pending={pending === "drop"}
    pendingLabel={words.drop.dropping}
    {refusal}
    title={words.drop.title}
    verb={words.drop.confirm}
  >
    <div class="flex flex-col gap-space-2">
      <label class="type-label text-ink-strong" for={`${uid}-drop-why`}
        >{words.drop.reason}</label
      >
      <Textarea
        id={`${uid}-drop-why`}
        placeholder={words.drop.reasonPlaceholder}
        rows={2}
        bind:value={dropReason}
      />
    </div>
  </AskHere>
{/snippet}

{#snippet page(current: TaskRead, backLabel: string, onback: () => void)}
  <TaskHead
    {backLabel}
    hasSession={sessionOf !== null}
    {onback}
    ondrop={() => {
      layer = "drop";
    }}
    {onpass}
    onreopen={noop}
    onsession={() => toggle("session")}
    passFailed={refusal !== null && layer !== "sendBack"}
    passPending={pending === "passOn"}
    sessionOpen={layer === "session"}
    task={current}
    wide={desk}
  />
  {#if stale !== null}
    <p
      class="m-0 rounded-md bg-surface-band px-space-4 py-space-3 type-body text-ink-strong"
      role="status"
    >
      {words.states.stale(when(stale, looking.now))}
    </p>
  {/if}
  {#if layer === "drop"}
    {@render dropTile()}
  {/if}
  {#if wide}
    <div class="flex items-start gap-space-5" data-layout="two-columns">
      <div class="flex min-w-0 flex-1 flex-col gap-space-5">
        {@render move(current)}
        {@render workGroup(current)}
        {@render sayGroup(current)}
      </div>
      <div class="flex w-details flex-none flex-col gap-space-5">
        {@render sinceGroup()}
        {@render waitsGroup(current)}
        {@render historyGroup()}
        <BriefFold task={current} bind:open={briefOpen} />
      </div>
    </div>
  {:else}
    <div class="flex flex-col gap-space-5" data-layout="one-column">
      {@render move(current)}
      {@render sinceGroup()}
      {@render workGroup(current)}
      {@render waitsGroup(current)}
      {@render sayGroup(current)}
      {@render historyGroup()}
      <BriefFold task={current} bind:open={briefOpen} />
    </div>
  {/if}
{/snippet}

<Tooltip.Provider>
  <div
    bind:this={root}
    {@attach frameSize((node: HTMLElement) => {
      width = node.clientWidth;
    })}
    class="min-h-full w-full bg-surface-recess"
    data-slot="task-page"
  >
    <div
      class={[
        "mx-auto flex w-full min-w-0 gap-space-5 ps-space-7 pe-space-6 max-desk:px-space-4",
        sessionBeside ? "h-dvh flex-row" : "flex-col pbe-space-8",
      ]}
    >
      {#if task === null}
        {@render skeleton()}
      {:else if layer === "wait"}
        <div class="flex min-w-0 flex-1 flex-col gap-space-5" in:reveal>
          {#if waitLoad === "loading" || waitTask === null}
            {@render skeleton()}
          {:else}
            {@render page(waitTask, words.waits.backTo(task.title), () => {
              layer = "none";
              showWaits();
            })}
          {/if}
        </div>
      {:else if sessionInPlace && sessionOf}
        <SessionPane
          at={saidAt}
          inPlace
          load={sessionLoad}
          now={looking.now}
          onclose={() => {
            layer = "none";
          }}
          onretry={noop}
          {said}
          session={sessionOf}
        />
      {:else}
        <div
          class={[
            "flex min-w-0 flex-col gap-space-5",
            sessionBeside
              ? "w-task-frame flex-none overflow-y-auto pbe-space-8"
              : "flex-1",
          ]}
          in:reveal
        >
          {@render page(task, words.head.back, noop)}
        </div>
        {#if sessionBeside && sessionOf}
          <div class="flex min-h-0 min-w-0 flex-1 flex-col pbe-space-5">
            <SessionPane
              at={saidAt}
              load={sessionLoad}
              now={looking.now}
              onclose={() => {
                layer = "none";
              }}
              onretry={noop}
              {said}
              session={sessionOf}
            />
          </div>
        {/if}
      {/if}
    </div>
  </div>
</Tooltip.Provider>
