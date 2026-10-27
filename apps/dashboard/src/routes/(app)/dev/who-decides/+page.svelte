<script lang="ts">
  /**
   * WHO DECIDES BENCH (dev only): slice 2's surfaces on the hub this
   * dashboard serves, in the shell.
   *
   * - The project's head (ProjectHead) for Cawco-Dev (`?project=<name>`
   *   names another), its details open, Who decides under Merge checks: its
   *   table writes the project's decides.md and shows what the hub reads
   *   back.
   * - Needs you: the project's quiet row, "1 decision made for you", which
   *   opens Decisions filtered to the ones made for you.
   * - Decisions: the "Behind the scenes" cards of the Cawco-Dev page
   *   "Changes that shipped without your approval", as the page's program
   *   has them, drawn by the decision host's own components. Its compaction
   *   card stands decided by the advisor (its why and sources written here,
   *   the one thing on the page not from the hub); a press on another
   *   option takes it back. Picks stay in this page.
   * - Settings › Who decides: the fleet's default and the advisor's type.
   */
  import type { ChoiceEntry, SettledBy } from "@cawco/core/choices";
  import { setContext } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import FleetWhoDecides from "#lib/cawco/decides/FleetWhoDecides.svelte";
  import WhoDecidesRow from "#lib/cawco/decides/WhoDecidesRow.svelte";
  import {
    DECIDED_BY,
    type DecidedByShown,
  } from "#lib/cawco/decisions/host/decided-by.js";
  import { DECISION_LIBRARY } from "#lib/cawco/decisions/host/library.js";
  import {
    type Bridge,
    picks,
    provideBridge,
  } from "#lib/cawco/decisions/host/page.svelte.js";
  import NeedsRow from "#lib/cawco/home/NeedsRow.svelte";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { checkoutOf } from "#lib/cawco/projects.js";
  import OpenUiRenderer from "#lib/cawco/views/openui/OpenUiRenderer.svelte";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import { IconDecisions } from "#lib/icons.js";
  import { page } from "$app/state";

  const named = $derived(
    (page.url.searchParams.get("project") ?? "Cawco-Dev").toLowerCase()
  );
  const project = $derived(
    cawco.projects.find((row) => row.name.toLowerCase() === named) ?? null
  );
  const machine = $derived.by(() => {
    const primary = project ? checkoutOf(project) : undefined;
    return primary
      ? (cawco.machines.find((row) => row.machineId === primary.machineId) ??
          null)
      : null;
  });
  const lead = new CawLead({
    id: () => project?.id ?? "",
    project: () => project,
    machinesOnline: () => cawco.machines.length > 0,
    tasks: () => [],
    reading: () => false,
  });

  /* ── The page's cards: "Behind the scenes" of the real page ────────── */

  const PAGE = "Changes that shipped without your approval";
  /** The cards' statements as the page's program has them, each Decision given its kind. */
  const STATEMENTS = String.raw`hold = Decision("hold", "Keep the gate that holds builds until you pick, landed before the talk you asked for?", [holdKeep, holdBack], "Your 10-24 pick asked for the rule (design work waits for your pick) and a talk first on how to enforce it (tsk-114); the gate landed on 10-25 without that talk, and this page's own hold now rests on it.", [holdCommits], null, false, null, "behaviour")
holdKeep = Option("keep", "Keep", "A build that names the decision pages it builds from runs and keeps its commits on a branch, but lands on main only once every named card is picked and has no open comment. Its chip reads \"held for your picks\".", true, [holdTie, holdOpen, holdGap], "A held build waits as long as you do.", true, "Fix one gap first (below); otherwise nothing.")
holdBack = Option("back", "Roll back", "A build lands on main when its checks pass, whatever is still open on its decision pages.", false, [], "Work can land before you pick, which is how these groups shipped.", false, "Revert both commits; builds stop naming pages and nothing is held.")
holdTie = Text("How a build is tied to its decision: it names the page, or one card of it.", "body")
holdOpen = Text("What delegating does while the decision is open: the build runs, and only its landing waits.", "body")
holdGap = Text("If kept, one gap gets fixed first: today a held build lands once its cards are picked even when you picked differently from what it was built on. It will be sent back to its session instead.", "body")
holdCommits = Text("Commits: 8f58c36af, fc8ef4332. Open design: tsk-114.", "meta")
marker = Decision("marker", "Keep the fallback that reads past a broken compaction marker, or revert it?", [markerKeep, markerBack], "Your rule is that a fallback stays only when you approve it, you were asked and didn't say yes, and the per-compact restart already stops new broken copies.", [markerCommits], null, false, null, "approach")
markerKeep = Option("keep", "Keep", "When Claude Code points a compaction at a line it never wrote, the reader goes on from the line above, so a long session's history reads back to its first prompt.", false, [], "A second path stays in the reader for a fault that is Claude Code's.", true, "Nothing: what you have today.")
markerBack = Option("back", "Revert", "The reader follows only the markers Claude Code wrote.", true, [], "Sessions already broken read short: one real 413 MB session showed 1,195 of its 47,076 entries.", false, "Revert the commit; the restart after each manual compact stays.")
markerCommits = Text("Commit: 5d66890f2 (nightly 5756). Restart: f6ee652f8. Upstream: anthropics/claude-code 46603, 49996, 92089.", "meta")`;
  const CARDS = ["hold", "marker"] as const;
  /** Each card's options' labels, as the program names them. */
  const LABELS: Record<string, Record<string, string>> = {
    hold: { keep: "Keep", back: "Roll back" },
    marker: { keep: "Keep", back: "Revert" },
  };
  /** The settle written for the compaction card: the one value not read from the hub. */
  const SETTLED: SettledBy = {
    by: "advisor",
    session: "advisor",
    why: "A fallback stays only with your approval, none was given, and the restart after each manual compact already stops new broken markers",
    sources: [
      "https://github.com/anthropics/claude-code/issues/46603",
      "https://github.com/anthropics/claude-code/issues/49996",
    ],
  };
  /** When the advisor decided it, for the Needs row's age. */
  const SETTLED_AT = Date.now() - 12 * 60_000;

  const entry = (
    options: string[],
    note: string | null,
    settled?: SettledBy
  ): ChoiceEntry => ({
    at: new Date().toISOString(),
    note,
    options,
    pageHash: "",
    value: null,
    ...(settled ? { settled } : {}),
  });

  // The person's notes on both cards as he left them on the page.
  picks.now = {
    hold: entry(
      [],
      "didn't we build the new task linking thing exactly for this? is this thes same? voerlaps? duplicates?"
    ),
    marker: entry(
      ["back"],
      "last thing i asked is that is it a broken transcript or a broken feature/ never got the answer, i don't like fallbacks unless it's inherently a broken design.",
      SETTLED
    ),
  };

  /** Cards decided for him that he took back: whose pick, and what it was. */
  let taken = $state<Record<string, { by: SettledBy["by"]; option: string }>>(
    {}
  );
  setContext<DecidedByShown>(DECIDED_BY, {
    takenBack: (card) => taken[card],
  });

  // The page's bridge, as the overlay gives a served page one (pick.ts):
  // here a note and a pick stay in this page.
  const bridge: Bridge = {
    choose: () => Promise.resolve(),
    note: (choice, text) => {
      const was = picks.now[choice];
      picks.now = {
        ...picks.now,
        [choice]: { ...(was ?? entry([], null)), note: text || null },
      };
      return Promise.resolve();
    },
    on: () => () => undefined,
    send: () => Promise.resolve(),
    set: () => Promise.resolve(),
  };
  provideBridge(bridge);

  /** A press on an option picks it, a press on the one picked lets it go (the overlay's pick.ts); a card decided for him becomes his. */
  const pressing = (node: HTMLElement) => {
    const press = (event: Event) => {
      const option = (event.target as Element | null)?.closest<HTMLElement>(
        "[data-option]"
      );
      const card = option?.closest<HTMLElement>("[data-cawco-choice]");
      const id = card?.dataset.cawcoChoice;
      const value = option?.dataset.option;
      if (!(id && value)) {
        return;
      }
      const was = picks.now[id];
      if (was?.settled) {
        taken[id] = {
          by: was.settled.by,
          option: LABELS[id]?.[was.options[0] ?? ""] ?? "",
        };
      }
      picks.now = {
        ...picks.now,
        [id]: entry(
          was?.options[0] === value ? [] : [value],
          was?.note ?? null
        ),
      };
    };
    node.addEventListener("click", press);
    return () => node.removeEventListener("click", press);
  };

  const madeForYou = $derived(CARDS.filter((id) => picks.now[id]?.settled));
  let filter = $state<"all" | "made">("all");
  /** Made for you: those decided for him, and those he took back here. */
  const shown = $derived(
    filter === "made"
      ? CARDS.filter((id) => picks.now[id]?.settled || taken[id])
      : CARDS
  );
  const program = $derived(
    `root = Section(${JSON.stringify(PAGE)}, [${shown.join(", ")}])\n${STATEMENTS}`
  );
  const countWords = (count: number) =>
    `${count} ${count === 1 ? "decision" : "decisions"} made for you`;

  /** The one choice open on this bench: how a row shows the four where they don't fit (WhoDecidesTable `narrow`). */
  let narrow = $state<"short" | "menu" | "scroll">("short");

  let decisions = $state<HTMLElement | null>(null);
  function openMade(): void {
    filter = "made";
    decisions?.scrollIntoView({ behavior: "smooth", block: "start" });
    decisions?.focus({ preventScroll: true });
  }

  /** Minutes since, said as the Needs row says a wait. */
  const ago = (at: number) =>
    `${Math.max(1, Math.round((Date.now() - at) / 60_000))}m`;

  // The details stand open on arrival, as a press on the head's place opens them.
  let opened = false;
  $effect(() => {
    if (project && !opened) {
      opened = true;
      queueMicrotask(() =>
        document.querySelector<HTMLButtonElement>("[data-place-line]")?.click()
      );
    }
  });
</script>

<svelte:head><title>Who decides · bench</title></svelte:head>

<div
  class="flex h-full min-h-0 flex-col overflow-y-auto overscroll-y-contain"
  data-who-decides-bench
>
  {#if project}
    <ProjectHead
      {lead}
      {machine}
      onask={null}
      onfilter={() => undefined}
      onnewtask={() => undefined}
      onstages={null}
      {project}
      seated
    >
      {#snippet detailsAfterChecks()}
        <WhoDecidesRow {narrow} projectId={project.id} />
      {/snippet}
    </ProjectHead>
  {:else}
    <p class="type-body pe-space-6 pt-space-5 ps-space-7 text-ink-muted">
      {cawco.projects.length === 0
        ? "Reading the projects…"
        : `This hub has no project named ${named}; name one with ?project=.`}
    </p>
  {/if}

  <div
    class="flex min-w-0 max-w-(--bench-max) flex-col gap-space-7 pe-space-6 pt-space-5 pb-space-7 ps-space-7 max-desk:max-w-none max-desk:pe-space-5 max-desk:ps-space-5"
    style:--bench-max={"calc(var(--c-project-details-measure) + var(--space-7) + var(--space-6))"}
  >
    <!-- The bench's one open choice: how a phone-width row shows the four. -->
    <div
      class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2 rounded-md border border-dashed border-border-control px-space-3 py-space-2"
      data-bench-choice
    >
      <span class="type-meta text-ink-muted" id="bench-narrow"
        >Open choice · a row too narrow for the four shows</span
      >
      <ToggleGroup.Root
        aria-labelledby="bench-narrow"
        type="single"
        bind:value={
          () => narrow,
          (next) => {
            if (next) {
              narrow = next as typeof narrow;
            }
          }
        }
      >
        <ToggleGroup.Item value="short">Short labels</ToggleGroup.Item>
        <ToggleGroup.Item value="menu">A menu</ToggleGroup.Item>
        <ToggleGroup.Item value="scroll">A scroll</ToggleGroup.Item>
      </ToggleGroup.Root>
    </div>

    <section
      aria-labelledby="bench-needs"
      class="flex min-w-0 flex-col gap-space-2"
    >
      <h2 class="type-label text-ink-muted" id="bench-needs">Needs you</h2>
      {#if project && madeForYou.length > 0}
        <div
          class="rounded-md border border-border-hairline bg-surface-raised p-space-1 shadow-raised"
        >
          <NeedsRow
            href="#bench-decisions"
            kind="decided"
            onchoose={openMade}
            share="decisions"
            title={project.name}
            wait={ago(SETTLED_AT)}
            want={countWords(madeForYou.length)}
          >
            {#snippet lead()}
              <IconDecisions aria-hidden="true" class="size-icon-md" />
            {/snippet}
            {#snippet below()}
              <span
                class="pointer-events-none relative col-start-2 col-end-4 row-3 type-meta text-ink-muted"
                >{PAGE}</span
              >
            {/snippet}
          </NeedsRow>
        </div>
      {:else}
        <p class="type-meta text-ink-muted">Nothing made for you.</p>
      {/if}
    </section>

    <section
      aria-labelledby="bench-decisions-title"
      bind:this={decisions}
      class="flex min-w-0 scroll-mt-space-4 flex-col gap-space-3 outline-none"
      id="bench-decisions"
      tabindex="-1"
    >
      <div class="flex flex-wrap items-center justify-between gap-space-2">
        <h2 class="type-label text-ink-muted" id="bench-decisions-title">
          Decisions
        </h2>
        <ToggleGroup.Root
          aria-label="Show"
          type="single"
          bind:value={
            () => filter,
            (next) => {
              if (next) {
                filter = next as "all" | "made";
              }
            }
          }
        >
          <ToggleGroup.Item value="all">All</ToggleGroup.Item>
          <ToggleGroup.Item value="made"
            >Made for you · {madeForYou.length}</ToggleGroup.Item
          >
        </ToggleGroup.Root>
      </div>
      <div
        {@attach pressing}
        class="flex min-w-0 flex-col rounded-panel bg-surface-recess p-space-4 max-phone:p-space-3"
        data-bench-cards
        style:--card-in="var(--space-5)"
      >
        {#if shown.length > 0}
          <OpenUiRenderer library={DECISION_LIBRARY} response={program} />
        {:else}
          <p class="type-meta text-ink-muted">
            Nothing decided for you here: every decision on this page is yours.
          </p>
        {/if}
      </div>
    </section>

    <section aria-label="Settings" class="flex min-w-0 flex-col gap-space-2">
      <h2 class="type-label text-ink-muted">Settings</h2>
      <FleetWhoDecides {narrow} />
    </section>
  </div>
</div>
