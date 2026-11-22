<script lang="ts">
  /**
   * Outcomes as the project page draws it, for option 3's live story: the
   * page around the view (OutcomesFrame: its dock, head, view strip and
   * views' bar, as they ship) and the Outcomes view in the pane, fed the
   * project "cockpit". The mock hub holds what the URL and the hub would:
   * what stands open, each answer's way to the hub, what a press changed
   * under a line, and Caw's suggestions until each is taken or dropped. A
   * press does what it does in the product; the hub's answer to an answer,
   * and whether the hub is reachable at all, are the story's dials.
   */
  import OutcomesFrame from "../OutcomesFrame.svelte";
  import OutcomesView, { type Opened } from "./OutcomesView.svelte";
  import type {
    AnswerState,
    LineChecker,
    Outcome,
    SuggestedOutcome,
  } from "./outcomes";
  import { STAGING_ANSWERED } from "./outcomes.fixture";
  import { words } from "./words";

  let {
    outcomes,
    suggestions,
    hub,
    live,
    lastRead,
    opens = null,
    conversation = false,
    answered = {},
  }: {
    /** In the order he said them. */
    outcomes: Outcome[];
    /** Caw's suggested outcomes, the one on show first. */
    suggestions: SuggestedOutcome[];
    /** What the hub does with an answer. */
    hub: "takes it" | "refuses it";
    /** The hub is reachable. */
    live: boolean;
    /** The time of the last reading, while the hub is unreachable. */
    lastRead: string;
    /** What a link opens the page on; null for the bento. */
    opens?: Opened;
    /** Caw's conversation stands open beside the page. */
    conversation?: boolean;
    /** Answers already on their way or taken, by question, as a reload finds them. */
    answered?: Record<string, AnswerState>;
  } = $props();

  // --- the mock hub -------------------------------------------------------

  let opened = $derived<Opened>(opens);
  let answers = $derived<Record<string, AnswerState>>(answered);
  /** Outcomes he added from Caw's suggestions. */
  let added = $state<Outcome[]>([]);
  /** Caw's suggestions still to settle, the one on show first. */
  let queue = $derived(suggestions);
  /** What checks a line, as his presses changed it (a run started, a routine added). */
  let checkers = $state<Record<string, LineChecker>>({});

  const shown = $derived<Outcome[]>(
    [...outcomes, ...added].map((outcome) => ({
      ...outcome,
      ...(answeredStanding(outcome) ?? {}),
      lines: outcome.lines.map((line) => {
        const taken = line.ask ? answers[line.ask.id] : undefined;
        const after =
          taken?.kind === "answered" ? STAGING_ANSWERED[taken.choice] : null;
        const checker = checkers[line.id] ?? line.checker;
        return {
          ...line,
          ...(after ? { finding: after.finding } : {}),
          checker,
          ...(line.id in checkers && checker.kind === "routine"
            ? {
                finding: "Its first run is going now",
                state: { kind: "unknown" as const },
              }
            : {}),
        };
      }),
    }))
  );

  function answeredStanding(outcome: Outcome): { standing: string } | null {
    for (const line of outcome.lines) {
      const taken = line.ask ? answers[line.ask.id] : undefined;
      if (taken?.kind === "answered") {
        const after = STAGING_ANSWERED[taken.choice];
        return after ? { standing: after.standing } : null;
      }
    }
    return null;
  }

  const unanswered = $derived(
    shown
      .flatMap((outcome) => outcome.lines)
      .filter(
        (line) =>
          line.ask !== null &&
          (answers[line.ask.id]?.kind ?? "open") !== "answered"
      ).length
  );

  function answer(ask: string, choice: string): void {
    answers = { ...answers, [ask]: { kind: "sending", choice } };
    setTimeout(() => {
      answers = {
        ...answers,
        [ask]:
          hub === "takes it"
            ? { kind: "answered", choice }
            : { kind: "refused", choice, why: words.refused },
      };
    }, 1100);
  }

  /** A press inside an opened outcome: "outcome:line:what". */
  function act(what: string): void {
    const [, line = "", kind = ""] = what.split(":");
    const was = shown
      .flatMap((outcome) => outcome.lines)
      .find((one) => one.id === line)?.checker;
    if (kind === "start" && was?.kind === "routine") {
      checkers = {
        ...checkers,
        [line]: { ...was, cannotStart: words.running },
      };
    } else if (kind === "turn-on") {
      checkers = {
        ...checkers,
        [line]: {
          kind: "routine",
          name: "Docs settings check",
          does: "Each run reads each docs page against the settings the product has today, and names any page that mentions one it no longer has.",
          when: "Every morning at 09:00. Its first run is going now.",
          cannotStart: words.running,
        },
      };
    } else if (kind === "not-now") {
      checkers = { ...checkers, [line]: { kind: "nothing" } };
    }
    // A routine or a task opens its own page, which this frame leaves out.
  }

  function take(): void {
    const [was] = queue;
    if (!was) {
      return;
    }
    added = [
      ...added,
      {
        id: was.id,
        sentence: was.sentence,
        standing: "Nothing has looked at it yet; Caw is planning the work.",
        work: [],
        lines: was.lines.map((sentence, at) => ({
          id: `${was.id}-${at}`,
          sentence,
          state: { kind: "unknown" },
          finding: "Nothing checks this yet",
          found: null,
          ask: null,
          checker: { kind: "nothing" },
          work: [],
        })),
      },
    ];
    queue = queue.slice(1);
    opened = null;
  }
</script>

<OutcomesFrame
  act={words.add}
  {conversation}
  needs={unanswered}
  view={words.view}
>
  {#snippet pane(askCaw)}
    <OutcomesView
      {answers}
      offline={live ? null : lastRead}
      onact={act}
      onanswer={answer}
      ondismiss={() => {
        queue = queue.slice(1);
        opened = null;
      }}
      onopen={(next) => {
        opened = next;
      }}
      onreword={askCaw}
      ontake={take}
      {opened}
      outcomes={shown}
      suggestion={queue[0] ?? null}
    />
  {/snippet}
</OutcomesFrame>
