<script lang="ts">
  /**
   * Outcomes as the project page draws it, for its live story: the page's
   * dock and head, the view strip from 640 and the views bar under it, and
   * the Outcomes view in the pane's inset, fed the project "cockpit". The
   * mock hub holds what the URL and the hub would: which outcome leads and
   * which of its lines is open, each answer's way to the hub, and Caw's
   * suggestion until it is taken or dismissed. A press does what it does in
   * the product; the hub's answer to Send, and whether the hub answers at
   * all, are the story's dials.
   */
  import { HOUR_MS } from "@cawco/core/time";
  import { MediaQuery } from "svelte/reactivity";
  import CawFloat from "#lib/cawco/project/CawFloat.svelte";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectDock from "#lib/cawco/project/ProjectDock.svelte";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { PANE_INSET } from "#lib/cawco/project/pane-inset.js";
  import ViewBar, { type BarView } from "#lib/cawco/project/ViewBar.svelte";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import type { AnswerState } from "./AskBlock.svelte";
  import type { LeadFace } from "./FaceSwitch.svelte";
  import OutcomesStrip from "./OutcomesStrip.svelte";
  import OutcomesView, { type Lead, SUGGESTION } from "./OutcomesView.svelte";
  import {
    firstLine,
    type LineChecker,
    type Outcome,
    type SuggestedOutcome,
    type UnplacedRow,
    waits,
  } from "./outcomes";

  let {
    outcomes,
    suggestions,
    unplaced,
    hub,
    live,
    lastRead,
    opens,
    conversation,
    lineOpen = null,
    answered = {},
  }: {
    outcomes: Outcome[];
    /** Caw's suggested outcomes, the one on show first. */
    suggestions: SuggestedOutcome[];
    unplaced: UnplacedRow[];
    /** What the hub answers to Send answer. */
    hub: "takes it" | "refuses it";
    /** The hub is answering. */
    live: boolean;
    /** The time of the last reading, when the hub is not answering. */
    lastRead: string;
    /** The outcome the page opens on, as a link names it; "arrival" for the first that waits on him. */
    opens: string;
    /** Caw's conversation stands open beside the page. */
    conversation: boolean;
    /** Under 640, the line a link opens as its page. */
    lineOpen?: string | null;
    /** Answers already on their way or settled, by line, as a link or a reload finds them. */
    answered?: Record<string, AnswerState>;
  } = $props();

  const PROJECT: ProjectRow = {
    id: "cockpit",
    name: "cockpit",
    account: null,
    accountAtLimit: "wait",
    cawHarness: "claude",
    cawModel: null,
    conversationInstanceId: null,
    createdAt: new Date(Date.now() - 24 * 30 * HOUR_MS).toISOString(),
    eventsOn: true,
    lands: "main",
    lfsConnection: null,
    lfsUrl: null,
    links: ["github.com/bewinxed/cockpit"],
    places: [],
    primaryPlaceId: null,
    review: true,
  };
  const lead = new CawLead({
    id: () => PROJECT.id,
    machinesOnline: () => true,
    project: () => PROJECT,
    reading: () => false,
    tasks: () => [],
  });

  // His panel opens and shuts with the story's dial, and with his seat.
  $effect(() => {
    lead.open = conversation;
  });
  const docked = $derived(lead.open && lead.anchor !== null);

  const VIEWS: BarView[] = [
    { value: "board", label: "Board", draft: false, count: 0 },
    { value: "table", label: "Table", draft: false, count: 0 },
    { value: "outcomes", label: "Outcomes", draft: false, count: 0 },
    { value: "routines", label: "Routines", draft: false, count: 0 },
    { value: "decisions", label: "Decisions", draft: false, count: 0 },
  ];

  const phone = new MediaQuery(PHONE_QUERY, false);

  // --- the mock hub -------------------------------------------------------

  /** The outcome Caw's suggestion became, once taken. */
  let taken = $state<Outcome | null>(null);
  /** Caw's suggestions still to settle, the one on show first. */
  let queue = $derived(suggestions);
  const shown = $derived<SuggestedOutcome | null>(
    queue[0] ? { ...queue[0], more: queue.length - 1 } : null
  );
  /** What checks a line, as his presses changed it (a suggested routine turned on, a run started). */
  let checkers = $state<Record<string, LineChecker>>({});
  const all = $derived(
    (taken ? [...outcomes, taken] : outcomes).map((outcome) => ({
      ...outcome,
      lines: outcome.lines.map((one) => {
        const checker = checkers[one.id];
        return checker ? { ...one, checker } : one;
      }),
    }))
  );
  const lineById = (id: string) =>
    all.flatMap((outcome) => outcome.lines).find((one) => one.id === id);

  /** A press on something the view opens or acts on: what the mock hub does with it. */
  function act(what: string): void {
    const [kind, id = ""] = what.split(":");
    const checker = lineById(id)?.checker;
    switch (kind) {
      case "change":
      case "suggestion":
        // Tell Caw what to change, and Change the words first: his conversation.
        lead.open = true;
        return;
      case "start":
        if (checker?.kind === "routine") {
          checkers = {
            ...checkers,
            [id]: {
              ...checker,
              state: "A run started just now, by you.",
              cannotStart: "A run is going.",
            },
          };
        }
        return;
      case "routine-take":
        checkers = {
          ...checkers,
          [id]: {
            kind: "routine",
            name: "Docs settings check",
            does: "Each run reads each docs page against the settings the product has today, and names any page that mentions one it no longer has.",
            when: "Every morning at 09:00. Its first run is going now, as a test.",
            state: "Turns itself off in 7 days unless you keep it.",
            cannotStart: "A run is going.",
          },
        };
        return;
      case "routine-dismiss":
        checkers = { ...checkers, [id]: { kind: "nothing" } };
        return;
      default:
        // A routine, a run or a task opens its own page, which this frame leaves out.
        return;
    }
  }

  let answers = $derived<Record<string, AnswerState>>(answered);
  const unanswered = $derived(
    all.filter((outcome) =>
      outcome.lines.some(
        (one) =>
          one.ask !== null && (answers[one.id]?.kind ?? "open") !== "answered"
      )
    ).length
  );

  /** On arrival the first outcome in said order that waits on him leads (option 2, decision 1); a link names its own. */
  const opening = (): Lead => {
    if (opens === "arrival") {
      return outcomes.find(waits)?.id ?? null;
    }
    return opens === "none" ? null : opens;
  };
  const lineOf = (id: Lead): string | null => {
    const outcome = outcomes.find((one) => one.id === id);
    return outcome ? firstLine(outcome) : null;
  };
  let leading = $derived<Lead>(opening());
  let selected = $derived<string | null>(lineOf(leading));
  let face = $state<LeadFace>("line");
  let linePage = $derived<string | null>(lineOpen);
  let needsOn = $state(false);
  let current = $state("outcomes");

  function makeLead(next: Lead): void {
    leading = next;
    const outcome = all.find((one) => one.id === next);
    selected = outcome ? firstLine(outcome) : null;
    face = "line";
    linePage = null;
  }

  function send(line: string, choice: string): void {
    answers = { ...answers, [line]: { kind: "sending", choice } };
    setTimeout(() => {
      answers = {
        ...answers,
        [line]:
          hub === "takes it"
            ? { kind: "answered", choice }
            : {
                kind: "refused",
                choice,
                why: "The hub refused the answer: Nightly staging check changed while you read it. Your pick is kept; send it again. (409)",
              },
      };
    }, 1200);
  }

  function take(): void {
    if (!shown) {
      return;
    }
    const was = shown;
    const made: Outcome = {
      id: was.id,
      sentence: was.sentence,
      lines: was.lines.map((sentence, at) => ({
        id: `${was.id}-${at}`,
        sentence,
        answer: { kind: "unknown" },
        reason: null,
        ask: null,
        checker: { kind: "nothing" },
        run: null,
        work: [],
      })),
      plan: { groups: [], done: 0 },
    };
    taken = made;
    queue = queue.slice(1);
    makeLead(made.id);
  }
</script>

<div class="flex h-dvh w-dvw min-h-0 flex-col bg-surface-page">
  <ProjectDock {docked} preview={false}>
    {#snippet page()}
      <div class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <div
          class="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          data-project-page
          data-slot="project-page"
        >
          <ProjectHead
            {lead}
            machine={null}
            onask={null}
            onfilter={() => undefined}
            onnewtask={null}
            project={PROJECT}
            seated
            setup={null}
          />
          {#if !phone.current}
            <OutcomesStrip
              {current}
              needs={unanswered}
              {needsOn}
              onchoose={(view) => {
                current = view;
              }}
              onsay={() => {
                lead.open = true;
              }}
              ontoggleneeds={() => {
                needsOn = !needsOn;
              }}
              views={VIEWS}
            />
          {/if}
          <div
            class={[
              "flex min-h-0 flex-1 flex-col pb-space-5 max-phone:pb-(--bar-reach)",
              PANE_INSET,
            ]}
            data-safe-bottom
            data-slot="pane"
            style:--bar-reach={"calc(var(--spacing-c-composer-panel) + var(--spacing-space-4) + var(--safe-bottom) + var(--spacing-space-3))"}
          >
            <OutcomesView
              {answers}
              {face}
              lead={leading}
              {linePage}
              offline={live
                ? null
                : {
                    lastRead: `Last read at ${lastRead}.`,
                    why: "The hub is not answering.",
                  }}
              ondismiss={() => {
                queue = queue.slice(1);
                if (leading === SUGGESTION) {
                  makeLead(null);
                }
              }}
              onface={(next) => {
                face = next;
              }}
              onlead={makeLead}
              onnext={() => {
                queue = [...queue.slice(1), ...queue.slice(0, 1)];
              }}
              onopen={act}
              onopenline={(line) => {
                linePage = line;
                face = "line";
              }}
              onselect={(line) => {
                selected = line;
                face = "line";
              }}
              onsend={send}
              ontake={take}
              outcomes={all}
              {selected}
              suggestion={shown}
              {unplaced}
            />
          </div>
        </div>
        {#if phone.current}
          <ViewBar
            {current}
            needs={unanswered}
            {needsOn}
            onchoose={(view) => {
              current = view;
            }}
            onnewsession={() => undefined}
            ontoggleneeds={() => {
              needsOn = !needsOn;
            }}
            views={VIEWS}
          />
        {/if}
      </div>
    {/snippet}
    {#snippet dock()}
      <CawFloat
        front
        {lead}
        projectId={PROJECT.id}
        projectName={PROJECT.name}
      />
    {/snippet}
  </ProjectDock>
</div>
