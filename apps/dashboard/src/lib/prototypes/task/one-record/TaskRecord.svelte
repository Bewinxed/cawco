<script lang="ts">
  import { bringIntoView } from "@cawco/core/bring-into-view";
  /**
   * A task opened from its project's board, told as one record: the head,
   * the state line pinned under it, then every change to the task once,
   * oldest to newest, by its actor at its clock time, day by day, the
   * person's acts standing inside the entries they answer, and Say
   * something at the record's foot. An older attempt folds to one line
   * once a newer one exists.
   *
   * From 900px what an entry or the state line opens (the result whole,
   * the session, the waits, the file, another task) stands beside the
   * record, one at a time, with Close: the record keeps its 820px measure
   * and the room past it goes to what is beside. Under 900px it stands in
   * the record's place, its own scroller, and the head's Back returns.
   * The screen's widths are its container's (`record`), never the window's.
   *
   * It follows its props: the task as the hub last read it, what is open,
   * which act is pending, which question stands open and whether the hub
   * is answering all arrive from its host; every press goes back up. Nothing
   * is posted before the hub answers.
   */
  import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconClose, IconCloudCross } from "#lib/icons.js";
  import AskInPage from "./AskInPage.svelte";
  import { byDay } from "./clock";
  import Entry from "./Entry.svelte";
  import FileView from "./FileView.svelte";
  import type { Acts, Asking, Opened, Pending, TaskView } from "./model";
  import OtherTaskView from "./OtherTaskView.svelte";
  import RecordHead from "./RecordHead.svelte";
  import RecordSkeleton from "./RecordSkeleton.svelte";
  import ResultView from "./ResultView.svelte";
  import SaySomething from "./SaySomething.svelte";
  import SessionView from "./SessionView.svelte";
  import StateLine from "./StateLine.svelte";
  import WaitsView from "./WaitsView.svelte";

  let {
    view,
    now,
    opened = null,
    besideState = "ready",
    pending = null,
    asking = null,
    stale = null,
    followOpen = false,
    onopen,
    onclose,
    onact,
    onback = () => undefined,
  }: {
    /** The task as the hub last read it; null before the first read. */
    view: TaskView | null;
    /** When it was read. */
    now: number;
    /** What stands beside the record, or in its place under 900px. */
    opened?: Opened | null;
    /** What is opened is still being read, or the hub does not hold it. */
    besideState?: "ready" | "loading" | "missing";
    pending?: Pending | null;
    asking?: Asking | null;
    /** The clock time of the last good read while the hub isn't answering. */
    stale?: string | null;
    /** Scroll to the entry the task opens at, as the product's route does. */
    followOpen?: boolean;
    onback?: () => void;
  } & Acts = $props();

  const isStale = $derived(stale !== null);
  const days = $derived(view ? byDay(view.entries, now) : []);
  /** The newest attempt; every older one folds to one line. */
  const newestAttempt = $derived(
    view?.entries.filter((entry) => entry.kind === "attempt").at(-1)?.id ?? null
  );
  const openedEntry = $derived.by(() => {
    if (!(
      view &&
      opened &&
      (opened.what === "result" || opened.what === "session")
    )) {
      return null;
    }
    const all = view.entries.flatMap((entry) =>
      entry.kind === "attempt" ? [entry, ...entry.entries] : [entry]
    );
    return all.find((entry) => entry.id === opened.entry) ?? null;
  });
  /** The session an opened entry stands for: an attempt's own, or the one that handed a result in. */
  const openedSession = $derived.by(() => {
    if (!(view && openedEntry)) {
      return null;
    }
    if (openedEntry.kind === "attempt") {
      return openedEntry.session;
    }
    return (
      (
        view.entries.find(
          (entry) =>
            entry.kind === "attempt" &&
            entry.entries.some((child) => child.id === openedEntry.id)
        ) as
          Extract<TaskView["entries"][number], { kind: "attempt" }> | undefined
      )?.session ?? null
    );
  });
  /** The attempt an opened hand-in belongs to. */
  const openedAttempt = $derived(
    view?.entries.find(
      (
        entry
      ): entry is Extract<TaskView["entries"][number], { kind: "attempt" }> =>
        entry.kind === "attempt" &&
        entry.entries.some((child) => child.id === openedEntry?.id)
    ) ?? null
  );
  const besideTitle = $derived.by(() => {
    switch (opened?.what) {
      case "result":
        return words.beside.result;
      case "session":
        return openedSession?.title ?? words.beside.session;
      case "waits":
        return words.beside.waits;
      case "file":
        return words.beside.file;
      case "task":
        return opened.task?.title ?? words.beside.task;
      case undefined:
        return "";
      default:
        return "";
    }
  });
  const newestAttemptEntry = $derived(
    view?.entries.find((entry) => entry.id === newestAttempt) ?? null
  );
  const openSession = () => {
    if (newestAttemptEntry) {
      onopen({ what: "session", entry: newestAttemptEntry.id });
    }
  };

  /** The product's route opens the task scrolled to the entry that needs the person. */
  function follow(node: HTMLElement) {
    if (!(followOpen && view?.opensAt)) {
      return;
    }
    const at = node.querySelector(`[data-entry="${view.opensAt}"]`);
    if (at) {
      bringIntoView(at);
    }
  }
</script>

<section
  data-slot="task-record"
  data-open={opened?.what}
  aria-busy={view === null}
  class="@container/record flex min-h-full flex-col bg-surface-page text-ink-strong"
  style:--entry-cols={"var(--c-row-lead) minmax(0, 1fr) var(--c-turn-clock-w)"}
  style:--lead-cols={"var(--c-row-lead) minmax(0, 1fr)"}
  style:--file-cols={"max-content minmax(0, 1fr)"}
  style:--or-cols={"minmax(0, var(--c-or-record-w)) minmax(var(--c-or-beside-w), 1fr)"}
>
  <RecordHead
    {view}
    inPlace={opened !== null}
    resultAlone={opened?.what === "result"}
    {pending}
    stale={isStale}
    {onback}
    {onclose}
    {onact}
    onopensession={openSession}
  />

  <div
    class={[
      "grid flex-1 grid-cols-1 items-start gap-x-space-group pe-space-6 ps-space-7 @max-desk/record:px-space-5",
      opened !== null &&
        "@desk/record:@max-wide/record:grid-cols-2 @wide/record:grid-cols-(--or-cols)",
    ]}
  >
    <div
      data-col="record"
      class={[
        "flex min-w-0 max-w-c-or-record-w flex-col",
        opened !== null && "@max-desk/record:hidden",
      ]}
      {@attach follow}
    >
      <!-- On a phone the head has no room for a title: it stands whole here. -->
      {#if view}
        <h1
          class="m-0 hidden pb-space-1 type-title text-balance text-ink-strong @max-phone/record:block"
        >
          {view.title}
        </h1>
      {/if}
      <StateLine {view} {opened} {stale} {onopen} />
      {#if stale}
        <!-- mark-line: the glyph stands on the first line of words that wrap -->
        <p
          class="m-0 mb-space-2 flex items-start gap-space-2 rounded-md bg-surface-recess px-space-3 py-space-2 type-body text-pretty text-ink-strong"
          role="status"
        >
          <IconCloudCross
            class="mt-space-1 size-icon-md flex-none text-ink-muted"
            aria-hidden="true"
          />
          <span>{words.stale(stale)}</span>
        </p>
      {/if}

      {#if view === null}
        <RecordSkeleton />
      {:else}
        <div class="grid" {@attach reflow()}>
          {#each days as day (day.day)}
            <section aria-label={day.day} class="grid">
              <h2
                class="m-0 grid grid-cols-(--lead-cols) gap-x-space-3 pt-space-4 pb-space-1 type-meta text-ink-muted"
              >
                <span></span><span>{day.day}</span>
              </h2>
              <ol class="m-0 grid list-none p-0">
                {#each day.entries as entry (entry.id)}
                  <Entry
                    {entry}
                    {now}
                    {view}
                    {pending}
                    {asking}
                    stale={isStale}
                    {opened}
                    folded={entry.kind === "attempt" &&
                      entry.id !== newestAttempt}
                    {onopen}
                    {onact}
                  />
                {/each}
              </ol>
            </section>
          {/each}
        </div>

        {#if asking?.what === "drop"}
          <AskInPage
            title={words.dropAsk}
            consequence={words.dropConsequence}
            field={words.dropReason}
            verb={words.dropConfirm}
            pendingVerb={words.dropping}
            pending={pending === "drop"}
            destructive
            onconfirm={() => onact("drop")}
            oncancel={() => onact("cancel")}
          />
        {/if}

        <SaySomething
          session={view.liveSession}
          pending={pending === "comment"}
          stale={isStale}
          onsend={() => onact("comment")}
        />
      {/if}
    </div>

    {#if opened && view}
      <aside
        data-col="beside"
        aria-label={besideTitle}
        class="grid min-w-0 content-start gap-space-4 @desk/record:sticky @desk/record:top-0 @desk/record:pt-space-3 pb-space-8"
      >
        <header class="flex min-h-c-btn-h items-center gap-space-3">
          <h2
            class="m-0 min-w-0 flex-1 type-label text-ink-strong wrap-anywhere"
          >
            {besideTitle}
          </h2>
          <span class="@max-desk/record:hidden">
            <Button
              size="icon-sm"
              variant="ghost"
              icon={IconClose}
              aria-label={words.close(besideTitle)}
              onclick={onclose}
            />
          </span>
        </header>
        {#if opened.what === "result" && openedEntry?.kind === "handed"}
          <ResultView
            entry={openedEntry}
            by={openedAttempt
              ? words.attemptLine(openedAttempt.n)
              : openedEntry.actor.name}
            state={besideState}
            onsession={() => onopen({ what: "session", entry: openedEntry.id })}
          />
        {:else if opened.what === "session" && openedSession}
          <SessionView session={openedSession} />
        {:else if opened.what === "waits"}
          <WaitsView {view} stale={isStale} {onopen} />
        {:else if opened.what === "file"}
          <FileView
            {view}
            editing={opened.editing ?? false}
            loading={besideState === "loading"}
            {pending}
            stale={isStale}
            onedit={(editing) => onopen({ what: "file", editing })}
            {onact}
          />
        {:else if opened.what === "task"}
          <OtherTaskView id={opened.id} task={opened.task} />
        {/if}
      </aside>
    {/if}
  </div>
</section>
