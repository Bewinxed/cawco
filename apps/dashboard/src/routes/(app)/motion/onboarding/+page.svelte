<script lang="ts">
  import {
    ASK_STORED,
    type AskRecord,
    askAnsweredText,
    askOutcome,
  } from "@cawco/core/asks";
  import { detach } from "@cawco/core/detach";
  import { CAWCO_NOTICE } from "@cawco/core/harness";
  import { ASK_ORIGIN } from "@cawco/core/harness/kinds";
  import type { PermissionResult } from "@cawco/core/session-messages";
  import type { Stage as BoardStage } from "@cawco/core/task-views";
  import { askAnsweredTitle } from "@cawco/core/transcript-rules";
  import { projectWords } from "@cawco/core/words/project";
  /**
   * ONBOARDING BENCH (dev only): a project's page in its first minutes and
   * the fleet board's first run, drawn by the real parts with the person's
   * own test case, the personal PR team (setup.fixtures.ts), and no hub.
   * Only the stores' state is seeded (dev's `__cawcoDebug`): the project's
   * conversation, its messages and the calls Caw makes, his questions as the
   * hub parks them. The page lays out as the project page does: the head with
   * his seat, the board's place, his panel docked beside it (CawFloat), its
   * sheet on a phone.
   *
   * `?beat=` walks the first minutes as the project's page draws them
   * (SetupBoard: the draft as the board it becomes, his questions on it on
   * a desk and in his composer on a phone, decision page
   * `onboarding-first-minutes`): `sent` (the words just sent, the project
   * unnamed), `drafting` (named, five stages written), `questions` (three
   * of his questions, one holding him), `drafted` (every stage written,
   * Set up in the draft bar), `set` (the board on its stages, the set-up
   * bar over it); `first-run` is the fleet board's first-run row. An
   * answer and Set up go to the bench's hub, which answers them as the hub
   * does. `?closed` puts his panel away; `?switch=start` stands
   * Assistant | Preview leading the bar (card `artifact-open`).
   */
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";

  import FirstRun from "#lib/cawco/home/FirstRun.svelte";
  import CawFloat from "#lib/cawco/project/CawFloat.svelte";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectDock from "#lib/cawco/project/ProjectDock.svelte";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import SetUpBar from "#lib/cawco/project/SetUpBar.svelte";
  import SetupBoard from "#lib/cawco/project/SetupBoard.svelte";
  import {
    PR_AIM,
    PR_ASKS,
    PR_DELEGATES,
    PR_DRAFT,
    PR_NAME,
    SETUP_CALLS,
  } from "#lib/cawco/project/setup.fixtures.js";
  import { setupProgressOf } from "#lib/cawco/project/setup-progress.js";
  import { firstTodoStage } from "#lib/cawco/project-tasks.js";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import { projectsStore } from "#lib/cawco/stores/projects.svelte.js";
  import {
    blankSession,
    sessionsStore,
  } from "#lib/cawco/stores/sessions.svelte.js";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import type { Message } from "#lib/cawco/types.js";
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { depart } from "#lib/platform/motion/share.svelte.js";
  import { page } from "$app/state";

  type Beat =
    "sent" | "drafting" | "questions" | "drafted" | "set" | "first-run";
  const BEATS: Beat[] = [
    "sent",
    "drafting",
    "questions",
    "drafted",
    "set",
    "first-run",
  ];
  const beatAsked = page.url.searchParams.get("beat");
  const beat: Beat = BEATS.find((one) => one === beatAsked) ?? "drafting";
  const ID = "pr-team-conversation";
  const PROJECT = "pr-team";
  const now = Date.now();
  const named = beat !== "sent";
  /** Where Assistant | Preview stands (`?switch=start`, else top right). */
  const switchAt: "start" | "end" =
    page.url.searchParams.get("switch") === "start" ? "start" : "end";
  const name = named ? PR_NAME : projectWords.placeholderName;
  const DRAFT = PR_DRAFT;
  const AIM = PR_AIM;
  const DELEGATES = PR_DELEGATES;
  /** While he drafts, the stages he has written so far. */
  const WRITTEN: Partial<Record<Beat, number>> = {
    sent: 0,
    drafted: DRAFT.length,
    set: DRAFT.length,
  };
  /** Where the bench stands now: its beat, moved on by an answer or Set up. */
  let at = $state<Beat>(beat);
  let written = $state(WRITTEN[beat] ?? 5);
  let draft = $state(DRAFT.slice(0, WRITTEN[beat] ?? 5));
  /** Set up is on its way to the bench's hub. */
  let sending = $state(false);
  let draftAim = $state(beat === "sent" ? "" : AIM);

  const WORDS =
    "set up a new project to be my personal PR team, you will handle my personal tasks, job hunts, social media and others, visa applications and travel. the aim is to propel me into wealth";
  const said = (
    id: string,
    type: Message["type"],
    content: string
  ): Message => ({
    id,
    instanceId: ID,
    type,
    content,
    timestamp: new Date(now - 60_000).toISOString(),
  });
  const sent = said("sent", "user", WORDS);
  const first = said(
    "caw-first",
    "assistant",
    "A personal PR team: your job search, visa applications and renewals, travel, and a public voice, with every message going out only once you send it. The board shows how it runs as I draft it."
  );
  const drafted = SETUP_CALLS.named;
  /** His words as he hands the draft over: where it is, and what is next. */
  const handed = said(
    "handed",
    "assistant",
    "The draft is on the board: eight stages from Inbox to Done, the researcher on Researching and the writer on Drafted. Change any stage there, or tell me what to change. Set it up once it reads right."
  );
  /** His words once it is set up, counting the stages it was set up with. */
  const doneOf = (stages: number) =>
    said(
      "set-up",
      "assistant",
      `Your PR team is set up: ${stages} stages from Inbox to Done, a researcher and a writer, and what it's for as the project's notes. Tell me the first thing to work on, or add it to Inbox.`
    );
  const done = doneOf(8);
  const MESSAGES: Record<Beat, Message[]> = {
    sent: [sent],
    drafting: [
      sent,
      ...SETUP_CALLS.named.slice(0, 1),
      first,
      ...SETUP_CALLS.named.slice(1),
    ],
    questions: [
      sent,
      ...SETUP_CALLS.named.slice(0, 1),
      first,
      ...SETUP_CALLS.named.slice(1),
    ],
    drafted: [sent, ...drafted.slice(0, 1), first, ...drafted.slice(1), handed],
    set: [
      sent,
      ...drafted.slice(0, 1),
      first,
      ...drafted.slice(1),
      handed,
      done,
    ],
    "first-run": [],
  };

  const debug = window.__cawcoDebug;

  const row: ProjectRow = {
    account: null,
    accountAtLimit: "wait",
    id: PROJECT,
    name,
    cawHarness: "claude",
    cawModel: null,
    conversationInstanceId: ID,
    createdAt: new Date(now - 120_000).toISOString(),
    eventsOn: true,
    lands: "main",
    lfsConnection: null,
    lfsUrl: null,
    links: [],
    places: [],
    primaryPlaceId: null,
    review: false,
  };
  if (beat !== "first-run") {
    debug.projectsState.projects.push(row);
    debug.adoptInstances([
      {
        id: ID,
        cwd: "/srv/cawco/projects/pr-team",
        harness: "claude",
        kind: "mainline",
        mayStart: ["any"],
        startingSet: null,
        launchDir: "known",
        machineId: "hub",
        sessionId: null,
        status: "running",
        origin: "person",
        projectId: PROJECT,
        parentInstanceId: null,
        createdAt: new Date(now - 60_000).toISOString(),
        title: name,
      },
    ]);
    const session = blankSession(ID);
    session.machineId = "hub";
    session.cwd = "/srv/cawco/projects/pr-team";
    session.messages = MESSAGES[beat];
    session.initialized = true;
    if (beat === "questions") {
      session.pending = PR_ASKS.map((ask) => ask.request);
    }
    debug.sessionsState.sessions[ID] = session;
    // Held on a question with nothing else to do, he has ended his turn
    // (core asks.ts `askQuestionWords`): at rest, so his composer offers
    // Send, not Stop.
    pulse(
      beat === "set" || beat === "drafted" || beat === "questions"
        ? "idle"
        : "working"
    );
  }

  /** His pulse, as the hub frames it: at work, or idle. */
  function pulse(activity: "idle" | "working") {
    debug.frame({
      kind: "pulse",
      instanceId: ID,
      pulse: {
        activity,
        at: Date.now(),
        busy: activity === "working",
        currentTool: null,
        instanceId: ID,
        runningSubagents: 0,
      },
    });
  }

  // The bench's hub: the page stands on it (no socket, so no band says the
  // hub is out of reach), and it answers the page's commands as the hub
  // does (hub asks.ts): an answer to one of his questions takes it off his
  // queue and reaches his conversation as CawCo's notice, its text the
  // hub's own (core asks.ts `askAnsweredText`, titled with the answers,
  // transcript-rules `askAnsweredTitle`), which wakes him. Once none holds him, he writes the rest of
  // the draft, a stage a beat, and hands it over in words of his.
  const STAGE_BEAT_MS = 900;
  let writing: ReturnType<typeof setInterval> | undefined;
  function answered(requestId: string, result: PermissionResult) {
    const session = debug.sessionsState.sessions[ID];
    const parked = session?.pending.find((one) => one.requestId === requestId);
    if (!(session && parked)) {
      return;
    }
    session.pending = session.pending.filter(
      (one) => one.requestId !== requestId
    );
    const { questions, blocks: blocking, waiting, meanwhile } = parked.input;
    const stored = ASK_STORED.safeParse({
      asked: {
        kind: "question",
        questions: questions ?? [],
        blocks: blocking === true,
        ...(waiting ? { waiting } : {}),
        ...(meanwhile ? { meanwhile } : {}),
      },
      answer: {
        at: Date.now(),
        by: { via: "page", behavior: result.behavior },
        result:
          result.behavior === "allow"
            ? {
                behavior: "allow",
                answers:
                  typeof result.updatedInput === "object" &&
                  result.updatedInput !== null &&
                  "answers" in result.updatedInput
                    ? result.updatedInput.answers
                    : {},
              }
            : { behavior: "deny", message: result.message ?? "" },
      },
    });
    if (!stored.success) {
      return;
    }
    const record: AskRecord = {
      ...stored.data,
      id: requestId,
      instanceId: ID,
      raisedAt: now,
      state: "answered",
    };
    const outcome = askOutcome(record);
    session.messages = [
      ...session.messages,
      {
        id: `told-${requestId}`,
        instanceId: ID,
        type: "ui.system_note",
        content: askAnsweredText(record),
        timestamp: new Date().toISOString(),
        metadata: {
          subtype: CAWCO_NOTICE,
          noteKind: "CawCo",
          noteTitle: askAnsweredTitle(
            { kind: "question", outcome },
            askAnsweredText(record)
          ),
          notice: ASK_ORIGIN,
        },
      },
    ];
    const holding = session.pending.some((one) => one.input.blocks === true);
    if (holding || writing || at === "drafted") {
      return;
    }
    if (at === "questions" || at === "drafting") {
      pulse("working");
      writing = setInterval(() => {
        written += 1;
        draft = [...draft, DRAFT[written - 1]];
        if (written >= DRAFT.length) {
          clearInterval(writing);
          writing = undefined;
          at = "drafted";
          session.messages = [...session.messages, handed];
          pulse("idle");
        }
      }, STAGE_BEAT_MS);
    }
  }
  debug.standHub((_instanceId, kind, intent) => {
    if (kind === "permission.answer") {
      const { requestId, result } = intent as {
        requestId: string;
        result: PermissionResult;
      };
      answered(requestId, result);
    }
  });

  /** Set up, on the bench's hub: a moment on its way, then the board it made, its columns landing from the draft's. */
  const SET_UP_MS = 700;
  function setUp() {
    sending = true;
    setTimeout(() => {
      for (const column of document.querySelectorAll<HTMLElement>(
        "[data-share^='stage:']"
      )) {
        depart(column);
      }
      sending = false;
      at = "set";
      const session = debug.sessionsState.sessions[ID];
      if (session) {
        session.messages = [...session.messages, doneOf(draft.length)];
      }
      pulse("idle");
    }, SET_UP_MS);
  }
  /** The draft as the board's stages, once it is set up. */
  const boardStages = $derived<BoardStage[]>(
    draft.map((stage) => ({
      name: stage.name,
      kind: stage.kind,
      hooks: { ...stage.hooks },
      ...(stage.icon ? { icon: stage.icon } : {}),
      ...(stage.color ? { color: stage.color } : {}),
    }))
  );

  const lead = new CawLead({
    id: () => PROJECT,
    machinesOnline: () => true,
    project: () => projectsStore.project(PROJECT),
    reading: () => false,
    tasks: () => [],
  });
  untrack(() => {
    // On a phone his sheet would stand over the draft, which is the board:
    // he arrives put away, as on the project's page (its `sheetCovers`).
    lead.open =
      !page.url.searchParams.has("closed") &&
      (at === "set" || !matchMedia(PHONE_QUERY).matches);
  });

  const asks = $derived(
    lead.asks.filter((one) => one.request.toolName === "AskUserQuestion")
  );
  const blocks = (one: (typeof asks)[number]): boolean =>
    one.request.input.blocks === true;
  const notSetUp = $derived(at !== "set");
  const progress = $derived(
    notSetUp
      ? setupProgressOf({
          messages: sessionsStore.session(ID)?.messages ?? [],
          name,
          named,
          open: asks.map((one) => ({ blocks: blocks(one) })),
          page: at === "drafted",
        })
      : null
  );
  // His setup element stands until the project is set up: handed over, it
  // keeps what he did (the real page's `setupProgress` holds it the same).
  const setup = $derived(progress);
  /**
   * A phone, read off the screen as it changes, as the project page reads
   * it (its `sheetQuery` line is CawFloat's sheet's): the bench follows a
   * resize as the page does, never a width read once at load.
   */
  const phoneQuery = new MediaQuery(PHONE_QUERY);
  /** A desk's pads (the column's own, `desk:`), which the draft's scroller reaches through. */
  const desk = new MediaQuery("(min-width: 900px)");
  const phone = $derived(phoneQuery.current);
  /** His questions stand on the board on a desk; on a phone his composer holds them. */
  const asksOnBoard = $derived(notSetUp && !phone);
  /** His panel stands docked beside the page while it is open and anchored, as the page's `docked`. */
  const docked = $derived(lead.open && lead.anchor !== null);
  const none = () => undefined;
  const project = $derived(projectsStore.project(PROJECT));

  onMount(() => () => {
    clearInterval(writing);
    debug.leaveHub();
    delete debug.sessionsState.sessions[ID];
    debug.adoptInstances([]);
    debug.projectsState.projects.splice(
      debug.projectsState.projects.indexOf(row),
      1
    );
  });
</script>

{#if beat === "first-run"}
  <div
    class="h-full overflow-y-auto bg-surface-recess px-space-6 pt-space-8 pb-space-8 max-phone:px-space-4"
  >
    <FirstRun
      arrived
      onaddmachine={none}
      onlater={none}
      onnewproject={none}
      onrelay={none}
      onsignin={none}
      steps={{
        machine: { state: "done", name: "obelisk" },
        harness: { state: "todo" },
        relay: "todo",
        project: false,
      }}
    />
  </div>
{:else}
  <ProjectDock {docked} preview={lead.tab === "preview"}>
    {#snippet page()}
      <!-- The project's own head, as its page draws it: Caw's seat and
           its capsule at its trailing edge. -->
      {#if project}
        <ProjectHead
          {lead}
          machine={null}
          onask={() => {
            lead.tab = "assistant";
            lead.open = true;
          }}
          onfilter={none}
          onnewtask={none}
          {project}
          seated
          setup={null}
        />
      {/if}
      <!-- The draft scrolls in the page's whole column, its pads inside the
           scroller: the scrollbar stands at the column's edge, clear of the
           cards, a field's bleed is never cut, and what passes under the
           head fades under the house edge. -->
      <div
        class="flex min-h-0 flex-auto flex-col ps-space-7 pe-space-6 max-desk:px-space-5"
        style:--draft-bleed-end={desk.current
          ? "var(--spacing-space-6)"
          : "var(--spacing-space-5)"}
        style:--draft-bleed-start={desk.current
          ? "var(--spacing-space-7)"
          : "var(--spacing-space-5)"}
      >
        {#if at !== "set"}
          <div class="min-h-0 flex-auto">
            <SetupBoard
              aim={draftAim}
              {asks}
              coming={Math.max(DRAFT.length - written, 0)}
              delegates={DELEGATES}
              {name}
              onaim={(next) => {
                draftAim = next;
              }}
              onanswercaw={() => detach(lead.answerAsks(), "answer Caw")}
              onBoard={asksOnBoard}
              onsetup={setUp}
              onstages={(next) => {
                draft = next;
              }}
              problem={null}
              {sending}
              stages={draft}
            />
          </div>
        {:else}
          {@const first = firstTodoStage(boardStages)?.name}
          <div class="flex min-h-0 flex-auto flex-col gap-space-4">
            {#if first}
              <SetUpBar {first} {name} onask={() => lead.talk()} />
            {/if}
            <div class="min-h-0 flex-auto">
              <!-- The bench's board adds nothing: no id, no card to bring into view. -->
              <TaskBoard
                allowedFrom={() => new Set<string>()}
                hrefOf={() => "#"}
                newIn={first}
                oncreate={async () => ""}
                onmove={none}
                onopen={none}
                stages={boardStages}
                tasks={[]}
              />
            </div>
          </div>
        {/if}
      </div>
    {/snippet}
    {#snippet dock()}
      <CawFloat
        asksElsewhere={(request) =>
          asksOnBoard && request.toolName === "AskUserQuestion"}
        front
        {lead}
        projectId={PROJECT}
        projectName={name}
        {setup}
        {switchAt}
      />
    {/snippet}
  </ProjectDock>
{/if}
