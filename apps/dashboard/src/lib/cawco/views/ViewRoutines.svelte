<script lang="ts">
  import { untrack } from "svelte";
  import type { ProjectBlocks } from "#lib/cawco/blocks/arrangement.svelte.js";
  import BlockPage, {
    type BlockItem,
  } from "#lib/cawco/blocks/BlockPage.svelte";
  import { cawco, startThread, threadsOf } from "#lib/cawco/client.svelte.js";
  import RowMenu, { type RowAction } from "#lib/cawco/config/RowMenu.svelte";
  import {
    failureWords as message,
    THREAD_SEND_UNREACHED,
    unreachable,
  } from "#lib/cawco/hub-read.js";
  import { GLYPHS } from "#lib/cawco/project/StarterCards.svelte";
  /**
   * A project's routines: what runs on its own (Routines), what fires it
   * (Event sources), and what its runs asked you to approve (Approved
   * actions). Three blocks of the page (blocks/BlockPage), in the person's
   * arrangement, beside any custom view placed here: each headed with its
   * count and the needs-you mark when something in it waits on you (a
   * failing routine or source, an action awaiting you). Side by side on a
   * wide screen, stacked on a phone; on a desk a block's rows scroll inside
   * it past --c-block-body-max, so forty routines never push the other two
   * out of view.
   *
   * Routines is a ledger, one shape for every row (Hex, Snowflake, Cursor):
   * its state glyph; its name over its schedule in words on your clock,
   * one clock with Next run (the zone it was set in, on hover); Last run, a
   * status glyph and how long ago; Next run; its ⋯. Last and Next are fixed
   * columns, so every row's times start on one edge and a failure changes a
   * glyph and its colour, never where anything stands. Enabled first, then
   * the soonest next run. The row opens its detail in place (RoutineDetail).
   * On a narrow ledger Last and Next fold into the schedule's line.
   *
   * With no routine yet it offers to start one (The Empty Starts Work Rule):
   * starters written for the project from what it repeats or waits on over
   * the session Composer to Caw (words alone), whose words open a thread
   * with him. A starter puts its words in the composer, unsent.
   *
   * The page is the hub's (routines-api): read on arrival and on every
   * reconnect, again when the project's threads move (a run notes its slot
   * and its result in one) or the actions waiting on you change, when the
   * tab comes back, after each of its own row actions, and every few
   * seconds while a run goes.
   */
  import {
    type ProjectStarter,
    tellStarterOutcome,
  } from "#lib/cawco/project-tasks.js";
  import ActionsTable, {
    waitsOnYou,
  } from "#lib/cawco/routines/ActionsTable.svelte";
  import RoutineDetail from "#lib/cawco/routines/RoutineDetail.svelte";
  import RunStatus, { type Status } from "#lib/cawco/routines/RunStatus.svelte";
  import {
    deleteRoutine,
    type Poll,
    type Routine,
    type RoutinesPage,
    readRoutinesPage,
    runRoutineNow,
    updateRoutine,
  } from "#lib/cawco/routines/routines-api.js";
  import { exactOf, scheduleOf, whenOf } from "#lib/cawco/routines/schedule.js";
  import { since } from "#lib/cawco/rules.js";
  import { threadHref } from "#lib/cawco/thread-tabs.js";
  import { toast } from "#lib/cawco/toasts.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Collapsible from "#lib/components/ui/collapsible/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Table from "#lib/components/ui/table/index.js";
  import {
    IconClock,
    IconHook,
    IconHourglass,
    IconNeedsYou,
    IconPause,
    IconPauseCircle,
    IconPin,
    IconPlay,
    IconShield,
    IconTrash,
  } from "#lib/icons.js";
  import { goto, replaceState } from "$app/navigation";
  import { page as here } from "$app/state";

  let {
    project,
    starters,
    canTalk,
    cawProblem = null,
    blocks,
    viewItems,
  }: {
    /** The project: its id and its name. */
    project: { id: string; name: string };
    /**
     * What the empty page offers to ask Caw for: what the project repeats
     * or waits on, written for it (hub project-starters.ts), in its order.
     */
    starters: ProjectStarter[];
    /** Caw can start: the empty page's composer and New routine reach him. */
    canTalk: boolean;
    /** Why Caw can't start, said on the empty page instead. */
    cawProblem?: string | null;
    /** The project's arrangement of blocks. */
    blocks: ProjectBlocks;
    /** The custom views placed on this page, as blocks, by block id. */
    viewItems: Record<string, BlockItem>;
  } = $props();

  // --- the hub's page, and what keeps it live -------------------------------------

  /** The page as the hub last answered it; null until the first read lands. */
  let page = $state<RoutinesPage | null>(null);
  /** Why the last read failed, while nothing has been read. */
  let problem = $state<string | null>(null);
  /** Reads so far: only the newest one's answer is kept. */
  let reads = 0;
  async function read() {
    const { id } = project;
    reads += 1;
    const ticket = reads;
    try {
      const next = await readRoutinesPage(id);
      if (id === project.id && ticket === reads) {
        page = next;
        problem = null;
      }
    } catch (error) {
      if (id === project.id && ticket === reads) {
        problem = message(error);
      }
    }
  }

  // On arrival, on every reconnect, and for another project (its page
  // stands as the skeleton until its own read lands).
  let readFor = "";
  let pageOf = "";
  $effect(() => {
    const { id } = project;
    if (cawco.status !== "connected") {
      readFor = "";
      return;
    }
    if (readFor !== id) {
      readFor = id;
      untrack(() => {
        if (pageOf !== id) {
          pageOf = id;
          page = null;
          problem = null;
        }
        read();
      });
    }
  });
  // A run notes its slot and its result in a thread of the project; an
  // action waiting on you comes or goes: the page is read again.
  const moved = $derived(
    Math.max(0, ...threadsOf(project.id).map((thread) => thread.lastAt))
  );
  const waitingIds = $derived(
    cawco.actions.map((action) => `${action.id}:${action.state}`).join()
  );
  let seen: string | null = null;
  $effect(() => {
    const now = `${moved}|${waitingIds}`;
    if (seen !== null && now !== seen) {
      untrack(() => read());
    }
    seen = now;
  });
  // Another hand may have changed it while the tab was away.
  $effect(() => {
    const back = () => {
      if (document.visibilityState === "visible") {
        // biome-ignore lint/complexity/noVoid: the re-read sets its own state
        void read();
      }
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  });

  const routines = $derived(page?.routines ?? []);
  const actions = $derived(page?.actions ?? []);
  const routes = $derived(page?.routes ?? []);
  const polls = $derived(page?.polls ?? []);
  const empty = $derived(page !== null && routines.length === 0);

  /** While a run goes its end is read every few seconds: a delegate's run notes it in no thread. */
  const RUN_READ_MS = 5000;
  const anyGoing = $derived(
    routines.some((routine) => going(routine) || queued(routine))
  );
  $effect(() => {
    if (!anyGoing) {
      return;
    }
    const tick = setInterval(() => {
      // biome-ignore lint/complexity/noVoid: the re-read sets its own state
      void read();
    }, RUN_READ_MS);
    return () => clearInterval(tick);
  });

  // --- the three blocks: their counts and what waits on you -----------------------

  type Part = "routines" | "sources" | "actions";
  /** Where the page stands: a link's routine is found in it. */
  let place = $state<HTMLElement | null>(null);

  const sourceCount = $derived(routes.length + polls.length);
  const failingSources = $derived(
    polls.filter((poll) => poll.failure !== null).length
  );
  const failingRoutines = $derived(
    routines.filter(
      (routine) => routine.enabled && routine.runs[0]?.outcome === "failed"
    ).length
  );
  const waitingActions = $derived(actions.filter(waitsOnYou).length);
  /** A relay is live: events arrive as they happen, not only when polled. */
  const relayLive = $derived(
    (page?.relays ?? []).some((relay) => relay.state === "live")
  );
  /** A block's count, and how many in it wait on you, in words. */
  function metaOf(id: Part): { count: number; needs: number; said: string } {
    if (id === "routines") {
      return {
        count: routines.length,
        needs: failingRoutines,
        said: `${failingRoutines} failing`,
      };
    }
    if (id === "sources") {
      return {
        count: sourceCount,
        needs: failingSources,
        said: `${failingSources} failing`,
      };
    }
    return {
      count: actions.length,
      needs: waitingActions,
      said: `${waitingActions} waiting on you`,
    };
  }

  // --- a routine's row ----------------------------------------------------------

  /**
   * The one routine open: opening another folds it. It is in the URL
   * (`routine`, thread-tabs `routineHref`), so a link opens it: a routine
   * notice's Open lands here, on the Routines view with its row open and
   * scrolled into view once the page has read it.
   */
  let open = $state<string | null>(null);
  function openRoutine(next: string | null) {
    open = next;
    const url = new URL(here.url.href);
    if (next) {
      url.searchParams.set("routine", next);
    } else {
      url.searchParams.delete("routine");
    }
    replaceState(url, here.state);
  }
  const linked = $derived(here.url.searchParams.get("routine"));
  /** The routine a link named and not yet brought into view. */
  let bring = $state<string | null>(null);
  $effect(() => {
    const id = linked;
    untrack(() => {
      if (id && id !== open) {
        open = id;
        bring = id;
      }
    });
  });
  $effect(() => {
    const id = bring;
    if (!(id && place && routines.some((routine) => routine.id === id))) {
      return;
    }
    untrack(() => {
      place
        ?.querySelector(`[data-routine="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
      bring = null;
    });
  });
  let deleting = $state<string | null>(null);
  let deletePending = $state(false);

  /** Its newest run is going now: starting, or running (the hub's run state). */
  function going(routine: Routine): boolean {
    return (
      routine.runs[0]?.state === "starting" ||
      routine.runs[0]?.state === "running"
    );
  }
  function queued(routine: Routine): boolean {
    return routine.runs[0]?.state === "queued";
  }

  /** Enabled first (Zapier's on-above-off), then the soonest next run. */
  const sorted = $derived(
    routines.toSorted(
      (a, b) => Number(b.enabled) - Number(a.enabled) || a.nextSlot - b.nextSlot
    )
  );

  /** The routes that send events to each routine. */
  const routesTo = $derived.by(() => {
    const to = new Map<string, typeof routes>();
    for (const route of routes) {
      to.set(route.routineId, [...(to.get(route.routineId) ?? []), route]);
    }
    return to;
  });
  /** A route's event in words: its service, its kinds, and what it filters on. */
  const eventOf = (route: (typeof routes)[number]): string =>
    [
      `${route.source} ${route.kinds.join(", ") || "events"}`,
      route.label,
      route.branch && `on ${route.branch}`,
      route.author && `by ${route.author}`,
      route.regex,
    ]
      .filter(Boolean)
      .join(" · ");

  /** The lead glyph: whether it runs, and how; never how its last run went. */
  type Lead = "on" | "event" | "paused" | "expiring";
  function leadOf(routine: Routine): Lead {
    if (!routine.enabled) {
      return "paused";
    }
    if (routine.expiresAt !== null && !routine.keep) {
      return "expiring";
    }
    return routesTo.has(routine.id) ? "event" : "on";
  }
  const LEAD = {
    on: { glyph: IconClock, said: "On, on a schedule" },
    event: {
      glyph: IconHook,
      said: "On, on a schedule and when an event comes",
    },
    paused: { glyph: IconPauseCircle, said: "Paused" },
    expiring: { glyph: IconHourglass, said: "On, turning itself off" },
  } as const;
  const DAY = 86_400_000;

  /**
   * The schedule's line: its words on your clock, one clock with Next run,
   * and when it turns itself off; its hover, the zone it was set in (when
   * not yours) beside the exact next time, and the events that also run it.
   */
  function scheduleLine(routine: Routine): {
    words: string;
    off: string | null;
    title: string;
  } {
    const off =
      leadOf(routine) === "expiring" && routine.expiresAt !== null
        ? (() => {
            const days = Math.max(
              1,
              Math.round((routine.expiresAt - Date.now()) / DAY)
            );
            return `Off in ${days} ${days === 1 ? "day" : "days"}`;
          })()
        : null;
    const schedule = scheduleOf(
      routine.cron,
      routine.timeZone,
      routine.nextSlot
    );
    const next = `next ${exactOf(routine.nextSlot)}`;
    const events = (routesTo.get(routine.id) ?? []).map(
      (route) => `also when ${eventOf(route)}`
    );
    return {
      words: schedule.words,
      off,
      title: [schedule.local, next, ...events].filter(Boolean).join(" · "),
    };
  }

  /** The Last run cell: its status, the time it says, the whole of it for a hover. */
  function lastOf(routine: Routine): {
    status: Status;
    text: string;
    title: string;
    said: string | null;
  } {
    const [run] = routine.runs;
    if (!run) {
      return {
        status: "neutral",
        text: "Never",
        title: "Not run yet",
        said: null,
      };
    }
    const at = exactOf(run.startedAt);
    if (going(routine)) {
      return {
        status: "running",
        text: "Running",
        title: `Running since ${at}`,
        said: null,
      };
    }
    const ago = since(run.endedAt ?? run.startedAt);
    if (run.state === "queued") {
      return { status: "neutral", text: "Queued", title: at, said: null };
    }
    const word = (() => {
      if (run.state === "skipped") {
        return "Skipped";
      }
      if (run.outcome === "failed") {
        return "Failed";
      }
      if (run.outcome === "cancelled") {
        return "Stopped";
      }
      return run.outcome === "silent" ? "Nothing to report" : "Delivered";
    })();
    const STATUS: Record<string, Status> = {
      Failed: "failed",
      Delivered: "done",
      "Nothing to report": "done",
    };
    const status = STATUS[word] ?? "neutral";
    return { status, text: ago, title: `${word} · ${at}`, said: word };
  }

  /** The Next run cell. */
  function nextOf(routine: Routine): { text: string; title: string | null } {
    if (!routine.enabled) {
      return { text: "Paused", title: routine.disabledReason };
    }
    return { text: whenOf(routine.nextSlot), title: exactOf(routine.nextSlot) };
  }

  /**
   * A row action, as the hub answers it: the page is read again after, and
   * a refusal is said in the hub's own sentence.
   */
  async function act(work: () => Promise<unknown>) {
    try {
      await work();
    } catch (error) {
      toast.error(message(error));
    } finally {
      await read();
    }
  }
  const pause = (routine: Routine) =>
    act(() => updateRoutine(routine.id, { enabled: !routine.enabled }));
  const keep = (routine: Routine) =>
    act(() => updateRoutine(routine.id, { keep: true }));
  const runNow = (routine: Routine) => act(() => runRoutineNow(routine.id));
  async function remove(routine: Routine) {
    deletePending = true;
    await act(() => deleteRoutine(routine.id));
    deletePending = false;
    deleting = null;
  }
  function menuOf(routine: Routine): RowAction[] {
    return [
      {
        label: "Run now",
        icon: IconPlay,
        disabled: going(routine) || queued(routine),
        onselect: () => runNow(routine),
      },
      {
        label: routine.enabled ? "Pause" : "Resume",
        icon: routine.enabled ? IconPause : IconPlay,
        onselect: () => pause(routine),
      },
      ...(routine.expiresAt !== null && !routine.keep
        ? [{ label: "Keep", icon: IconPin, onselect: () => keep(routine) }]
        : []),
      {
        label: "Delete routine…",
        icon: IconTrash,
        destructive: true,
        onselect: () => {
          deleting = routine.id;
        },
      },
    ];
  }

  // --- asking Caw ------------------------------------------------------------------

  /**
   * The words to Caw, in the session Composer with words alone (`attach`
   * off), as the project page's view ask is: they open a thread with him in
   * the project, and the page goes there. A refusal puts the words back in
   * the composer with the reason over them.
   */
  const askDraft = new ComposerDraft();
  let askSending = $state(false);
  let askRefused = $state("");
  /** The words never reached the hub: the line offers Send again. */
  let askAgain = $state(false);
  /** What the Composer stands over its foot: its box holds that much room. */
  let askFoot = $state(0);
  async function ask(text: string, id: string) {
    askSending = true;
    askRefused = "";
    askAgain = false;
    try {
      const said = await startThread(project.id, text, id);
      // A starter pressed into the field went, as it stood or changed:
      // Jev's steering (hub project-starters.ts), told without a wait.
      const pressed = askDraft.takePressed(text);
      if (pressed) {
        tellStarterOutcome(project.id, pressed).catch(() => undefined);
      }
      await goto(threadHref(said.thread.id));
    } catch (error) {
      askDraft.restore(text);
      askAgain = unreachable(error);
      askRefused = askAgain ? THREAD_SEND_UNREACHED : message(error);
    } finally {
      askSending = false;
    }
  }
  /** A starter: its words in the composer, the caret after them; nothing is sent. */
  function pick(text: string) {
    askDraft.press(text, "routines");
  }
  /** New routine: the composer over the ledger. */
  let asking = $state(false);

  /** Each routine's name by its id: the routine an action's run proposed it in. */
  const routineNames = $derived(
    new Map(routines.map((routine) => [routine.id, routine.name]))
  );
  /** A routine's own proposed actions, for its detail. */
  const actionsOf = (routine: Routine) =>
    actions.filter((action) => action.routineId === routine.id);

  /** How often a poll reads, in words. */
  function everyOf(poll: Poll): string {
    if (poll.everyS === null) {
      return "Read by the hub";
    }
    const minutes = Math.round(poll.everyS / 60);
    if (minutes < 60) {
      return minutes <= 1
        ? "Read every minute"
        : `Read every ${minutes} minutes`;
    }
    const hours = Math.round(minutes / 60);
    return hours === 1 ? "Read hourly" : `Read every ${hours} hours`;
  }

  /** The page's blocks: its three, then the views placed on it. */
  const items = $derived<Record<string, BlockItem>>({
    routines: {
      title: "Routines",
      glyph: IconClock,
      meta: routinesMeta,
      action: routinesAction,
      content: routinesBody,
      measure: "--c-block-routines",
      hideable: true,
      body: "capped",
      card: true,
    },
    sources: {
      title: "Event sources",
      glyph: IconHook,
      meta: sourcesMeta,
      action: sourcesAction,
      content: sourcesBody,
      measure: "--c-block-ledger",
      hideable: true,
      body: "capped",
      card: true,
    },
    actions: {
      title: "Approved actions",
      glyph: IconShield,
      meta: actionsMeta,
      content: actionsBody,
      measure: "--c-block-ledger",
      hideable: true,
      body: "capped",
      card: true,
    },
    ...viewItems,
  });
</script>

<!-- A block's count, and the needs-you mark while something in it waits on
     you, after its title. -->
{#snippet meta(id: Part)}
  {@const said = metaOf(id)}
  <span data-num data-slot="count" class="num type-meta text-ink-subtle"
    >{said.count}</span
  >
  {#if said.needs > 0}
    <span
      data-slot="needs"
      class="inline-flex text-status-attn-glyph"
      title={said.said}
      ><IconNeedsYou aria-hidden="true" class="size-icon-sm" /><span
        class="sr-only">, {said.said}</span
      ></span
    >
  {/if}
{/snippet}
{#snippet routinesMeta()}
  {@render meta("routines")}
{/snippet}
{#snippet sourcesMeta()}
  {@render meta("sources")}
{/snippet}
{#snippet actionsMeta()}
  {@render meta("actions")}
{/snippet}

<!-- What acts on a block, at its head's trailing end. -->
{#snippet routinesAction()}
  {#if !empty && canTalk}
    <Button
      aria-expanded={asking}
      onclick={() => {
        asking = !asking;
        askDraft.focusWanted = asking;
      }}
      size="sm"
      variant="outline">New routine</Button
    >
  {/if}
{/snippet}
{#snippet sourcesAction()}
  {#if page}
    <Badge
      title={relayLive
        ? undefined
        : (page.relays[0]?.inbound ?? "Only polled events arrive")}
      variant={relayLive ? "live" : "default"}
      ><span>Relay {relayLive ? "live" : "off"}</span></Badge
    >
  {/if}
{/snippet}

<!-- The session Composer, words alone: its box as tall as what it stands
     over its foot (Composer .dock stands on its foot), as the view ask's. -->
{#snippet askCaw()}
  <div
    data-slot="ask-caw"
    class="relative h-(--ask-h) w-full flex-none"
    style:--ask-h="calc({askFoot}px + var(--space-4))"
  >
    <Composer
      agentName="Caw"
      attach={false}
      draft={askDraft}
      onfoot={(foot) => {
        askFoot = foot.stack;
      }}
      onstop={() => undefined}
      onsubmit={(text, _extras, id) => {
        // biome-ignore lint/complexity/noVoid: the ask's own state is the composer's sending and its refusal
        void ask(text, id);
      }}
      placeholder="Every weekday at 09:00, triage…"
      sendAgain={askAgain}
      sendError={askRefused}
      sending={askSending}
    />
  </div>
{/snippet}

{#snippet routineRows(routine: Routine)}
  {@const rule =
    sorted[0]?.id === routine.id ? "" : "border-t border-t-border-hairline"}
  {@const lead = LEAD[leadOf(routine)]}
  {@const line = scheduleLine(routine)}
  {@const last = lastOf(routine)}
  {@const next = nextOf(routine)}
  <Collapsible.Root
    bind:open={
      () => open === routine.id,
      (next) => {
        if (next) {
          openRoutine(routine.id);
        } else if (open === routine.id) {
          openRoutine(null);
        }
      }
    }
  >
    {#snippet child({ props })}
      <Table.Body
        data-view-routines-routine
        {...props}
        class="group"
        data-enabled={routine.enabled ? "" : undefined}
        data-routine={routine.id}
        data-zone={routine.timeZone}
      >
        <Table.Row data-view-routines-row class="relative border-b-none">
          <Table.Cell
            class="h-c-btn-h-lg w-(--col-state) px-space-3 py-space-2 type-meta text-ink-muted group-state-open:bg-surface-well {rule}"
          >
            <span
              data-slot="lead"
              aria-label={lead.said}
              class="grid w-c-row-lead place-items-center text-ink-muted lead-expiring:text-status-attn-glyph lead-paused:text-ink-subtle"
              data-lead={leadOf(routine)}
              role="img"><lead.glyph /></span
            >
          </Table.Cell>
          <Table.Cell
            class="h-c-btn-h-lg px-space-3 py-space-2 type-meta text-ink-muted group-state-open:bg-surface-well {rule}"
          >
            <Collapsible.Trigger
              data-opener
              class="focus-inset block max-w-full cursor-pointer border-none border-current bg-transparent p-0 text-start text-inherit"
            >
              <span
                data-slot="name"
                class="block truncate type-label text-ink-muted group-data-enabled:text-ink-row group-data-enabled:group-state-open:text-ink-strong"
                >{routine.name}</span
              >
            </Collapsible.Trigger>
            <span
              data-slot="sub"
              class="block truncate type-meta text-ink-muted"
              title={line.title}
            >
              <span data-slot="sub-words">{line.words}</span>
              {#if line.off}
                <span class="text-status-attn-ink">· {line.off}</span>
              {/if}
              <!-- On a narrow ledger, Last and Next in the same order. -->
              <span
                data-slot="folded"
                class="hidden @max-routines-ledger-34rem/routines-ledger:inline"
              >
                · Last <RunStatus
                  said={last.said}
                  status={last.status}
                  text={last.text}
                  title={last.title}
                />
                · Next
                <span
                  data-slot="num"
                  class="num"
                  title={next.title ?? undefined}>{next.text}</span
                >
              </span>
            </span>
          </Table.Cell>
          <Table.Cell
            data-col-last
            class="h-c-btn-h-lg px-space-3 py-space-2 type-meta text-ink-muted group-state-open:bg-surface-well @max-routines-ledger-34rem/routines-ledger:hidden {rule}"
            data-cell="last"
          >
            <RunStatus
              said={last.said}
              status={last.status}
              text={last.text}
              title={last.title}
            />
          </Table.Cell>
          <Table.Cell
            class="h-c-btn-h-lg px-space-3 py-space-2 type-meta text-ink-muted group-state-open:bg-surface-well @max-routines-ledger-34rem/routines-ledger:hidden {rule}"
            data-cell="next"
          >
            <span
              data-slot="time"
              data-num
              class="num inline-flex max-w-full type-meta text-ink-muted tabular-nums whitespace-nowrap data-paused:text-ink-subtle"
              data-paused={routine.enabled ? undefined : ""}
              title={next.title ?? undefined}>{next.text}</span
            >
          </Table.Cell>
          <Table.Cell
            class="h-c-btn-h-lg px-space-3 py-space-2 type-meta text-end text-ink-muted group-state-open:bg-surface-well {rule}"
          >
            <span class="relative z-1 inline-flex"
              ><RowMenu actions={menuOf(routine)} label={routine.name} /></span
            >
          </Table.Cell>
        </Table.Row>
        {#if deleting === routine.id}
          <tr>
            <td class="p-0 group-state-open:bg-surface-well" colspan="5">
              <fieldset
                data-slot="row-ask"
                aria-label="Delete {routine.name}"
                class="m-0 flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1 border-none border-current px-space-3 pt-0 pb-space-2 type-meta text-ink-strong"
              >
                <span
                  >Delete {routine.name}? It stops now; its past runs stay in
                  the project's history.</span
                >
                <Button
                  label="Delete routine"
                  onclick={() => remove(routine)}
                  pending={deletePending}
                  pendingLabel="Deleting…"
                  size="xs"
                  variant="destructive"
                />
                <Button
                  onclick={() => {
                    deleting = null;
                  }}
                  size="xs"
                  variant="ghost">Cancel</Button
                >
              </fieldset>
            </td>
          </tr>
        {/if}
        <tr>
          <td class="p-0 group-state-open:bg-surface-well" colspan="5">
            <Collapsible.Content fade reveal>
              <RoutineDetail actions={actionsOf(routine)} {routine} />
            </Collapsible.Content>
          </td>
        </tr>
      </Table.Body>
    {/snippet}
  </Collapsible.Root>
{/snippet}

{#snippet routinesBody()}
  {#if empty}
    <div data-slot="starters" class="w-full max-w-(--c-starters-w) p-space-3">
      {#if canTalk}
        <EmptyState
          icon={IconClock}
          line="Caw runs work for {project.name} on a schedule, or when something happens. Say what, and when."
          title="No routines yet"
        >
          {#snippet action()}
            <!-- The starters as the kit's option chips (CawStarters' own),
                 a press putting its words in the composer under them, unsent. -->
            {#if starters.length > 0}
              <ul
                data-slot="routine-starters"
                aria-label="Routines to ask Caw for"
                class="kit-chips m-0 list-none justify-center p-0"
              >
                {#each starters as starter (starter.text)}
                  {@const Glyph = GLYPHS[starter.glyph]}
                  <li class="flex max-w-full">
                    <button
                      class="kit-chip touch-hit"
                      onclick={() => pick(starter.text)}
                      type="button"
                    >
                      <Glyph
                        data-starter-glyph
                        aria-hidden="true"
                        class="size-icon-md flex-none text-ink-muted"
                      />
                      <span>{starter.text}</span>
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
            {@render askCaw()}
          {/snippet}
        </EmptyState>
      {:else}
        <EmptyState
          icon={IconClock}
          line="Caw makes routines, and he can't start: {cawProblem ??
            'his machine is away'}."
          title="No routines yet"
        />
      {/if}
    </div>
  {:else}
    {#if asking}
      <!-- New routine: the composer stands over the ledger it will land in. -->
      <div class="p-space-3">{@render askCaw()}</div>
    {/if}
    <!-- literal: 6rem; calc(var(--c-row-lead) + var(--space-3)); calc(var(--c-btn-h-sm) + var(--space-3) * 2) -->
    <div
      data-slot="ledger"
      class="@container/routines-ledger"
      style:--col-state="calc(var(--c-row-lead) + var(--space-3))"
      style:--col-menu="calc(var(--c-btn-h-sm) + var(--space-3) * 2)"
      style:--col-when="6rem"
    >
      <Table.Root
        data-routines
        aria-label="Routines"
        class="table-fixed border-separate"
        ghostRows="tr[data-view-routines-row]"
      >
        <Table.Header>
          <Table.Row class="band border-0">
            <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head class="w-(--col-state)" scope="col"
              ><span class="sr-only">State</span></Table.Head
            >
            <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head scope="col">Routine</Table.Head>
            <Table.Head
              data-col-last
              class="w-c-routine-time-w @max-routines-ledger-34rem/routines-ledger:hidden"
              scope="col">Last run</Table.Head
            >
            <Table.Head
              class="w-c-routine-time-w @max-routines-ledger-34rem/routines-ledger:hidden"
              scope="col">Next run</Table.Head
            >
            <Table.Head class="w-(--col-menu)" scope="col"
              ><span class="sr-only">Actions</span></Table.Head
            >
            <!-- biome-ignore-end lint/a11y/noHeaderScope: the heads above -->
          </Table.Row>
        </Table.Header>
        {#each sorted as routine (routine.id)}
          {@render routineRows(routine)}
        {/each}
      </Table.Root>
    </div>
  {/if}
{/snippet}

{#snippet sourcesBody()}
  {#if sourceCount === 0}
    <!-- literal: 72ch -->
    <p
      class="m-0 max-w-(--measure) p-space-3 type-meta text-pretty text-ink-muted"
      style:--measure="72ch"
    >
      No event sources yet. Caw connects one when a routine should start on an
      event, like a merged pull request.
    </p>
  {:else}
    <!-- literal: calc(var(--c-row-lead) + var(--space-3)) -->
    <div
      data-slot="ledger"
      class="@container/routines-ledger"
      style:--col-state="calc(var(--c-row-lead) + var(--space-3))"
    >
      <Table.Root
        aria-label="Event sources"
        class="table-fixed border-separate"
      >
        <Table.Header>
          <Table.Row class="band border-0">
            <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head class="w-(--col-state)" scope="col"
              ><span class="sr-only">Service</span></Table.Head
            >
            <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head scope="col">Source</Table.Head>
            <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head data-col-last class="w-c-routine-time-w" scope="col"
              >Last read</Table.Head
            >
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each routes as route, index (route.id)}
            {@const rule = index > 0 ? "border-t border-t-border-hairline" : ""}
            <Table.Row data-view-routines-row class="relative border-b-none">
              <Table.Cell
                class="h-c-btn-h-lg w-(--col-state) px-space-3 py-space-2 type-meta text-ink-muted {rule}"
                ><span
                  data-slot="lead"
                  class="grid w-c-row-lead place-items-center text-ink-muted"
                  ><ProviderLogo provider={route.service} /></span
                ></Table.Cell
              >
              <Table.Cell
                class="h-c-btn-h-lg px-space-3 py-space-2 type-meta text-ink-muted {rule}"
              >
                <span
                  data-slot="name"
                  class="block truncate type-label text-ink-row"
                  >{routines.find((each) => each.id === route.routineId)
                    ?.name ?? route.routineId}</span
                >
                <span
                  data-sub
                  data-slot="code"
                  class="block truncate type-code liga-none text-ink-muted"
                  >{eventOf(route)}</span
                >
              </Table.Cell>
              <Table.Cell
                data-col-last
                class="h-c-btn-h-lg px-space-3 py-space-2 type-meta text-ink-muted {rule}"
                data-cell="last"
              >
                {#if route.lastDeliveryAt === null}
                  <RunStatus status="neutral" text="No events yet" />
                {:else}
                  <RunStatus
                    said="Delivered"
                    status="done"
                    text={since(route.lastDeliveryAt)}
                    title={exactOf(route.lastDeliveryAt)}
                  />
                {/if}
              </Table.Cell>
            </Table.Row>
          {/each}
          {#each polls as poll, index (poll.id)}
            {@const rule =
              routes.length > 0 || index > 0
                ? "border-t border-t-border-hairline"
                : ""}
            <Table.Row data-view-routines-row class="relative border-b-none">
              <Table.Cell
                class="h-c-btn-h-lg w-(--col-state) px-space-3 py-space-2 type-meta text-ink-muted {rule}"
                ><span
                  data-slot="lead"
                  class="grid w-c-row-lead place-items-center text-ink-muted"
                  ><ProviderLogo provider={poll.service.toLowerCase()} /></span
                ></Table.Cell
              >
              <Table.Cell
                class="h-c-btn-h-lg px-space-3 py-space-2 type-meta text-ink-muted {rule}"
              >
                <span
                  data-slot="name"
                  class="block truncate type-label text-ink-row"
                  >{poll.what}</span
                >
                <span
                  data-slot="sub"
                  class="block truncate type-meta text-ink-muted"
                  >{#if poll.tool}<span
                      data-slot="code"
                      class="type-code liga-none">{poll.tool}</span
                    >{" · "}{/if}{everyOf(poll)}</span
                >
              </Table.Cell>
              <Table.Cell
                data-col-last
                class="h-c-btn-h-lg px-space-3 py-space-2 type-meta text-ink-muted {rule}"
                data-cell="last"
              >
                {#if poll.polledAt === null}
                  <RunStatus status="neutral" text="Not read yet" />
                {:else if poll.failure === null}
                  <RunStatus
                    said="Read"
                    status="done"
                    text={since(poll.polledAt)}
                    title={exactOf(poll.polledAt)}
                  />
                {:else}
                  <RunStatus
                    said="Failed"
                    status="failed"
                    text={since(poll.polledAt)}
                    title="{poll.failure} · {exactOf(poll.polledAt)}"
                  />
                {/if}
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </div>
  {/if}
{/snippet}

{#snippet actionsBody()}
  {#if actions.length === 0}
    <!-- literal: 72ch -->
    <p
      class="m-0 max-w-(--measure) p-space-3 type-meta text-pretty text-ink-muted"
      style:--measure="72ch"
    >
      Nothing yet. Caw asks you before a routine posts, emails or closes
      anything, and what you decide is kept here.
    </p>
  {:else}
    <!-- literal: 6rem -->
    <div
      data-slot="ledger"
      class="@container/routines-ledger"
      style:--col-when="6rem"
    >
      <ActionsTable {actions} label="Approved actions" {routineNames} />
    </div>
  {/if}
{/snippet}

<!-- Held as a skeleton until the hub's first read. -->
<div bind:this={place} class="flex min-h-0 flex-auto flex-col">
  {#if page === null && problem !== null}
    <!-- literal: 72ch -->
    <div class="max-w-(--measure)" style:--measure="72ch">
      <EmptyState
        icon={IconClock}
        line="The routines for {project.name} could not be read: {problem} Nothing was changed."
        title="Routines are not available"
      >
        {#snippet action()}
          <Button onclick={read} variant="outline">Retry</Button>
        {/snippet}
      </EmptyState>
    </div>
  {:else if page === null}
    <Skeleton class="h-64 w-full rounded-lg" />
  {:else}
    <div>
      <BlockPage {blocks} {items} page="routines" />
    </div>
  {/if}
</div>

<style>
  /* residual: foreign-dom — the ledger's rules on tables this file does not
     render (a routine's runs in RoutineDetail, ActionsTable) */
  [data-slot="ledger"] :global(table > thead th) {
    position: sticky;
    inset-block-start: 0;
    z-index: 2;
    background: var(--surface-band);
  }
  [data-slot="ledger"] :global(tr.band) {
    background: var(--surface-band);
  }
  [data-slot="ledger"] :global(tr.band th) {
    block-size: var(--c-toolbar-ctl);
    padding-inline: var(--space-3);
    font: var(--type-label);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  [data-slot="ledger"] :global(th[data-slot="actions-table-col-status"]) {
    inline-size: var(--c-routine-time-w);
  }
  [data-slot="ledger"]
    :global(
      th:is(
        [data-slot="actions-table-col-when"],
        [data-slot="routine-detail-col-when"]
      )
    ) {
    inline-size: var(--col-when);
  }
  /* A mark in the lead column: a glyph, or a provider's logo (ProviderLogo
     takes no class). */
  [data-slot="lead"] :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  /* The empty page's starters, and the composer under them (EmptyState's
     action slot). */
  [data-slot="starters"] :global(.kit-empty-action) {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    align-self: stretch;
  }
  /* residual: unmapped */
  /* The name opens the routine; its box reaches every cell, so the whole
     row is the opener, its ⋯ above it. */
  [data-slot="ledger"] :global([data-opener]) {
    font: inherit;
  }
  /* residual: pseudo */
  [data-slot="ledger"] :global([data-opener]::after) {
    position: absolute;
    inset: 0;
    content: "";
  }
</style>
