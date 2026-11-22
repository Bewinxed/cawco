<script lang="ts">
  /**
   * Outcomes as the project page draws it, for its states files: the
   * project's head (ProjectHead, Caw at rest in his seat), its view strip
   * (ViewTabs with Outcomes chosen, Needs you, Say an outcome in the add
   * slot, Ask Caw), the view in the page's pane inset, and under 640 the
   * views' bar at the foot (ViewBar). The app's rail and top bar are not
   * mounted: the Shell names its bar from the route, and the stage's route
   * is none of the app's.
   *
   * The mock hub holds only what the hub would: which asks it has taken.
   * A sent answer waits a second, then the hub takes it (the outcome's
   * Needs you line closes) or refuses it in its own sentence, as `hub`
   * says.
   */
  import { viewsWords } from "@cawco/core/words/views";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import NeedsYouChip from "#lib/cawco/project/NeedsYouChip.svelte";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import ViewBar from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconPlus, IconSparkles } from "#lib/icons.js";
  import OutcomesView, { type HubAnswer } from "./OutcomesView.svelte";
  import type { Ask, OutcomesRecord } from "./outcomes";
  import { outcomesWords } from "./words";

  let {
    record,
    hub = "answers",
    live = true,
    open = null,
    again = 0,
  }: {
    record: OutcomesRecord;
    /** What the hub does with a sent answer. */
    hub?: "answers" | "refuses";
    /** The hub answers at all. */
    live?: boolean;
    /** A line whose card stands open as the frame draws. */
    open?: string | null;
    /** Starts the frame over. */
    again?: number;
  } = $props();

  /** The asks the mock hub has taken. */
  let taken = $state<string[]>([]);
  let needsOn = $state(false);

  const shown = $derived<OutcomesRecord>({
    ...record,
    outcomes: record.outcomes.map((outcome) => ({
      ...outcome,
      asks: outcome.asks.filter((each) => !taken.includes(each.ask.id)),
    })),
  });
  const waiting = $derived(
    shown.outcomes.reduce((sum, outcome) => sum + outcome.asks.length, 0)
  );

  const answer = async (ask: Ask): Promise<HubAnswer> => {
    await new Promise((done) => setTimeout(done, 1100));
    if (hub === "refuses") {
      return {
        ok: false,
        sentence: `The hub could not write ${ask.from}'s answer: another change to the project's folder is being saved (EBUSY).`,
      };
    }
    taken = [...taken, ask.id];
    return { ok: true };
  };

  const VIEWS = [
    { value: "board", label: "Board", count: 0, draft: false },
    { value: "table", label: "Table", count: 0, draft: false },
    {
      value: "view:outcomes",
      label: outcomesWords.view,
      count: 0,
      draft: false,
    },
    { value: "view:routines", label: "Routines", count: 0, draft: false },
    { value: "decisions", label: "Decisions", count: 1, draft: false },
  ];

  const project: ProjectRow = {
    account: null,
    accountAtLimit: "wait",
    cawHarness: "claude",
    cawModel: null,
    conversationInstanceId: null,
    createdAt: "2026-09-02T09:00:00Z",
    eventsOn: true,
    id: "cockpit",
    lands: "main",
    lfsConnection: null,
    lfsUrl: null,
    links: ["github.com/bewinxed/cockpit"],
    name: "cockpit",
    places: [],
    primaryPlaceId: null,
    review: true,
  };
  /** Caw's seat, as the page makes it: at rest, his panel shut. */
  const lead = new CawLead({
    id: () => project.id,
    machinesOnline: () => true,
    project: () => project,
    reading: () => false,
    tasks: () => [],
  });
</script>

{#key again}
  <div
    data-safe-bottom
    class="relative flex h-dvh min-h-0 flex-col bg-surface-page"
    style:--bar-reach={"calc(var(--spacing-c-composer-panel) + var(--spacing-space-4) + var(--safe-bottom) + var(--spacing-space-3))"}
  >
    <ProjectHead
      {lead}
      machine={null}
      onask={() => undefined}
      onfilter={() => undefined}
      onnewtask={() => undefined}
      {project}
      seated
      setup={null}
    />
    <div
      data-slot="strip"
      class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5 max-phone:hidden"
    >
      <ViewTabs
        current="view:outcomes"
        hrefOf={() => "#"}
        onchoose={() => undefined}
        views={VIEWS}
      />
      <span
        aria-hidden="true"
        class="h-c-btn-h-sm w-px flex-none bg-border-hairline"
      ></span>
      <div data-form="compact" class="flex flex-none items-center gap-space-2">
        {#if waiting > 0}
          <NeedsYouChip
            count={waiting}
            on={needsOn}
            ontoggle={() => {
              needsOn = !needsOn;
            }}
          />
        {/if}
        <Button
          aria-label={outcomesWords.say}
          layout="wide"
          press="pressable"
          size="sm"
          title={outcomesWords.say}
          variant="ghost"
        >
          <IconPlus />
          <span class="in-form-compact:hidden">{outcomesWords.say}</span>
        </Button>
        <Button
          aria-label={viewsWords.ask}
          layout="wide"
          press="pressable"
          size="sm"
          title={viewsWords.ask}
          variant="ghost"
        >
          <IconSparkles />
          <span class="in-form-compact:hidden">{viewsWords.ask}</span>
        </Button>
      </div>
    </div>
    <div class="flex min-h-0 flex-1 flex-col max-phone:pb-(--bar-reach)">
      <OutcomesView
        {live}
        onanswer={answer}
        onopen={() => undefined}
        openLine={open}
        record={shown}
      />
    </div>
    <ViewBar
      current="view:outcomes"
      needs={waiting}
      {needsOn}
      onchoose={() => undefined}
      onnewsession={() => undefined}
      ontoggleneeds={() => {
        needsOn = !needsOn;
      }}
      views={VIEWS}
    />
  </div>
{/key}
