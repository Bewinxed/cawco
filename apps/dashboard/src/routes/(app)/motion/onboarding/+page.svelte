<script lang="ts">
  import {
    ASK_ORIGIN,
    type AskRecord,
    askAnsweredText,
    askOutcome,
  } from "@cawco/core/asks";
  import { detach } from "@cawco/core/detach";
  import type { PulseFrame } from "@cawco/core/frames";
  import {
    CAWCO_NOTICE,
    type PermissionResult,
    type UserAnswers,
    type UserQuestion,
  } from "@cawco/core/harness";
  import type { InstanceRow } from "@cawco/core/protocol";
  import type { Stage as BoardStage } from "@cawco/core/task-views";
  import { askAnsweredTitle } from "@cawco/core/transcript-rules";
  import { projectWords } from "@cawco/core/words/project";
  /**
   * ONBOARDING BENCH (dev only): a project's page in its first minutes and
   * the fleet board's first run, drawn by the real parts with the person's
   * own test case, the personal PR team (setup.fixtures.ts), and no hub.
   * Only the client's state is seeded (dev's `__cawcoDebug`): the project's
   * conversation, its messages and the calls Caw makes, his questions as the
   * hub parks them. The page lays out as the project page does: the head with
   * his seat, the board's place, his panel docked beside it (CawFloat), its
   * sheet on a phone.
   *
   * `?beat=` walks the first minutes: `sent` (the words just sent, the
   * project unnamed), `drafting` (named, his setup element in his panel),
   * `questions` (three of his questions on the board, one holding him),
   * `page` (the setup page open: the board's action opens it), `set` (the
   * page sent: the board on his eight stages with their looks); `first-run`
   * is the fleet board's first-run row. `?closed` puts his panel away;
   * `?tab=assistant` keeps the page's beat on his conversation;
   * `?switch=start` stands Assistant | Preview leading the bar, the other
   * option of the card `artifact-open` to its top-right default.
   *
   * `?way=` draws one way of the first minutes for the decision page
   * `onboarding-first-minutes`, Caw's questions in his composer on every
   * width: `board` (the draft drawn as the board it becomes, SetupDraft),
   * `page` (the setup page in the board's place), `panel` (the setup page
   * in his panel's Preview, as today, with no stills on the floor).
   */
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { blankSession, cawco } from "#lib/cawco/client.svelte.js";
  import type { Stage as DraftStage } from "#lib/cawco/decisions/host/setup/stage.js";
  import SetupPagePreview from "#lib/cawco/decisions/SetupPagePreview.svelte";
  import FirstRun from "#lib/cawco/home/FirstRun.svelte";
  import { depart } from "#lib/cawco/motion/share.svelte.js";
  import CawFloat from "#lib/cawco/project/CawFloat.svelte";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectDock from "#lib/cawco/project/ProjectDock.svelte";
  import SetUpBar from "#lib/cawco/project/SetUpBar.svelte";
  import SetupDraft from "#lib/cawco/project/SetupDraft.svelte";
  import SetupScene from "#lib/cawco/project/SetupScene.svelte";
  import {
    PR_ASKS,
    PR_NAME,
    PR_STAGES,
    SETUP_CALLS,
  } from "#lib/cawco/project/setup.fixtures.js";
  import { setupProgressOf } from "#lib/cawco/project/setup-progress.js";
  import { firstTodoStage } from "#lib/cawco/project-tasks.js";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import type { Message } from "#lib/cawco/types.js";
  import { IconFolder } from "#lib/icons.js";
  import { page } from "$app/state";

  type Beat = "sent" | "drafting" | "questions" | "page" | "set" | "first-run";
  const BEATS: Beat[] = [
    "sent",
    "drafting",
    "questions",
    "page",
    "set",
    "first-run",
  ];
  const asked = page.url.searchParams.get("beat");
  const beat: Beat = BEATS.find((one) => one === asked) ?? "drafting";
  const ID = "pr-team-conversation";
  const PROJECT = "pr-team";
  const now = Date.now();
  const named = beat !== "sent";
  /** Where Assistant | Preview stands (`?switch=start`, else top right). */
  const switchAt: "start" | "end" =
    page.url.searchParams.get("switch") === "start" ? "start" : "end";
  const name = named ? PR_NAME : projectWords.placeholderName;
  const WAYS = ["board", "page", "panel"] as const;
  const way = WAYS.find((one) => one === page.url.searchParams.get("way"));
  /** His questions stand on the board only in today's way, on a desk. */
  const asksOnBoard = way === undefined;
  /** The PR team's draft as the setup page holds it (SetupPagePreview's program). */
  const DRAFT: DraftStage[] = [
    { name: "Inbox", kind: "todo", icon: "inbox", color: "cyan" },
    {
      name: "Researching",
      kind: "active",
      icon: "search",
      color: "cyan",
      hooks: { runs: "researcher" },
    },
    {
      name: "Drafted",
      kind: "active",
      icon: "pen",
      color: "amber",
      hooks: { runs: "writer" },
    },
    { name: "Your call", kind: "you" },
    { name: "Sent", kind: "waiting", icon: "send", color: "orange" },
    {
      name: "Waiting on reply",
      kind: "waiting",
      icon: "hourglass",
      color: "orange",
      hooks: { after: "7d" },
    },
    { name: "Done", kind: "done", icon: "done", color: "green" },
    { name: "Dropped", kind: "dropped", icon: "trash" },
  ];
  const AIM =
    "A personal PR team: the job search, visa applications and renewals, travel booked around them, and a public voice. Research and drafts are done by delegates; every message, post and application goes out only once you send it.";
  /** While he drafts, the stages he has written so far. */
  const WRITTEN: Partial<Record<Beat, number>> = {
    sent: 0,
    page: DRAFT.length,
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
  const said = (id: string, type: Message["type"], content: string) =>
    ({
      id,
      instanceId: ID,
      type,
      content,
      timestamp: new Date(now - 60_000).toISOString(),
    }) as Message;
  const sent = said("sent", "user", WORDS);
  const first = said(
    "caw-first",
    "assistant",
    way === "board"
      ? "A personal PR team: your job search, visa applications and renewals, travel, and a public voice, with every message going out only once you send it. The board shows how it runs as I draft it."
      : "A personal PR team: your job search, visa applications and renewals, travel, and a public voice, with every message going out only once you send it. A page opens to confirm how it runs."
  );
  /** What he calls once drafted: the board way's draft is the board, so no page of his opens. */
  const drafted = way === "board" ? SETUP_CALLS.named : SETUP_CALLS.page;
  /** His words as he hands the draft over (the board way): where it is, and what is next. */
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
    page: [
      sent,
      ...drafted.slice(0, 1),
      first,
      ...drafted.slice(1),
      ...(way === "board" ? [handed] : []),
    ],
    set: [sent, ...drafted.slice(0, 1), first, ...drafted.slice(1), done],
    "first-run": [],
  };

  const debug = (
    globalThis as unknown as {
      __cawcoDebug: {
        frame: (frame: PulseFrame) => void;
        state: {
          previews: Record<string, unknown>;
          projects: unknown[];
          sessions: Record<string, ReturnType<typeof blankSession>>;
        };
        adoptInstances: (rows: InstanceRow[]) => void;
        standHub: (
          answer: (instanceId: string, kind: string, intent: unknown) => void
        ) => void;
        leaveHub: () => void;
      };
    }
  ).__cawcoDebug;

  const row = {
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
    debug.state.projects.push(row);
    debug.adoptInstances([
      {
        id: ID,
        cwd: "/srv/cawco/projects/pr-team",
        harness: "claude",
        kind: "mainline",
        launchDir: "known",
        machineId: "hub",
        sessionId: null,
        status: "running",
        origin: "person",
        projectId: PROJECT,
        parentInstanceId: null,
        createdAt: new Date(now - 60_000).toISOString(),
        title: name,
      } as InstanceRow,
    ]);
    const session = blankSession(ID);
    session.machineId = "hub";
    session.cwd = "/srv/cawco/projects/pr-team";
    session.messages = MESSAGES[beat];
    session.initialized = true;
    if (beat === "questions") {
      session.pending = PR_ASKS.map((ask) => ask.request);
    }
    debug.state.sessions[ID] = session;
    // The setup page open: his panel's Preview holds it (`?beat=page`), in
    // the ways where it is his Preview's.
    if (beat === "page" && (way === undefined || way === "panel")) {
      debug.state.previews[ID] = {
        kind: "preview",
        instanceId: ID,
        artifact: {
          id: "pr-team-setup",
          kind: "page",
          name: "setup",
          ask: `Set up ${PR_NAME}`,
        },
        revision: "1",
        state: "open",
      };
    }
    // Held on a question with nothing else to do, he has ended his turn
    // (core asks.ts `askQuestionWords`): at rest, so his composer offers
    // Send, not Stop.
    pulse(
      beat === "set" || beat === "page" || beat === "questions"
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
    } as PulseFrame);
  }

  // The bench's hub: the page stands on it (no socket, so no band says the
  // hub is out of reach), and it answers the page's commands as the hub
  // does (hub asks.ts): an answer to one of his questions takes it off his
  // queue and reaches his conversation as CawCo's notice, its text the
  // hub's own (core asks.ts `askAnsweredText`, title "Told you their
  // answer"), which wakes him. Once none holds him, he writes the rest of
  // the draft, a stage a beat, and hands it over in words of his.
  const STAGE_BEAT_MS = 900;
  let writing: ReturnType<typeof setInterval> | undefined;
  function answered(requestId: string, result: PermissionResult) {
    const session = debug.state.sessions[ID];
    const parked = session?.pending.find((one) => one.requestId === requestId);
    if (!(session && parked)) {
      return;
    }
    session.pending = session.pending.filter(
      (one) => one.requestId !== requestId
    );
    const input = parked.input as {
      blocks?: boolean;
      meanwhile?: string;
      questions?: UserQuestion[];
      waiting?: string;
    };
    const record = {
      id: requestId,
      instanceId: ID,
      raisedAt: now,
      state: "answered",
      asked: {
        kind: "question",
        questions: input.questions ?? [],
        blocks: input.blocks === true,
        ...(input.waiting ? { waiting: input.waiting } : {}),
        ...(input.meanwhile ? { meanwhile: input.meanwhile } : {}),
      },
      answer: {
        at: Date.now(),
        by: { via: "page", behavior: result.behavior },
        result:
          result.behavior === "allow"
            ? {
                behavior: "allow",
                answers:
                  (result.updatedInput as { answers?: UserAnswers })?.answers ??
                  {},
              }
            : { behavior: "deny", message: result.message ?? "" },
      },
    } as unknown as AskRecord;
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
      } as Message,
    ];
    const holding = session.pending.some(
      (one) => (one.input as { blocks?: unknown }).blocks === true
    );
    if (way !== "board" || holding || writing || at === "page") {
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
          at = "page";
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
      const session = debug.state.sessions[ID];
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
    project: () => cawco.project(PROJECT),
    reading: () => false,
    tasks: () => [],
  });
  untrack(() => {
    lead.open = !page.url.searchParams.has("closed");
    if (
      beat === "page" &&
      (way === undefined || way === "panel") &&
      page.url.searchParams.get("tab") !== "assistant"
    ) {
      lead.tab = "preview";
    }
  });

  const asks = $derived(lead.asks);
  const blocks = (one: (typeof asks)[number]): boolean =>
    (one.request.input as { blocks?: unknown }).blocks === true;
  const notSetUp = $derived(at !== "set");
  const progress = $derived(
    notSetUp
      ? setupProgressOf({
          messages: cawco.session(ID)?.messages ?? [],
          name,
          named,
          open: asks.map((one) => ({ blocks: blocks(one) })),
          page: at === "page",
          ends: way === "board" ? "board" : "page",
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
  const phoneQuery = new MediaQuery("(max-width: 639px)");
  /** A desk's pads (the column's own, `desk:`), which the draft's scroller reaches through. */
  const desk = new MediaQuery("(min-width: 900px)");
  const phone = $derived(phoneQuery.current);
  /** His panel stands docked beside the page while it is open and anchored, as the page's `docked`. */
  const docked = $derived(lead.open && lead.anchor !== null);
  const none = () => undefined;

  onMount(() => () => {
    clearInterval(writing);
    debug.leaveHub();
    delete debug.state.sessions[ID];
    delete debug.state.previews[ID];
    debug.adoptInstances([]);
    debug.state.projects.splice(debug.state.projects.indexOf(row), 1);
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
      <div
        class="flex min-h-c-mark items-center gap-space-3 ps-space-7 pe-space-6 pt-space-5 pb-space-4 max-desk:px-space-5"
      >
        <h1
          class={[
            "m-0 min-w-0 type-title",
            named ? "text-ink-strong" : "text-ink-subtle",
          ]}
        >
          {name}
        </h1>
        {#if at === "set" || way === "board" || (way === "page" && at === "page")}
          <span class="ms-auto" data-box>
            <CawSeat {lead} projectId={PROJECT} projectName={name} />
          </span>
        {/if}
      </div>
      <!-- The draft scrolls in the page's whole column, its pads inside the
           scroller: the scrollbar stands at the column's edge, clear of the
           cards, a field's bleed is never cut, and what passes under the
           head fades under the house edge. -->
      <div
        class="flex min-h-0 flex-auto flex-col ps-space-7 pe-space-6 max-desk:px-space-5"
        style:--draft-bleed-end={desk.current
          ? "var(--space-6)"
          : "var(--space-5)"}
        style:--draft-bleed-start={desk.current
          ? "var(--space-7)"
          : "var(--space-5)"}
      >
        {#if way === "board" && at !== "set"}
          <div class="min-h-0 flex-auto">
            <SetupDraft
              aim={draftAim}
              asking={asks.length}
              coming={Math.max(DRAFT.length - written, 0)}
              {name}
              onaim={(next) => {
                draftAim = next;
              }}
              onanswer={() => detach(lead.answerAsks(), "answer Caw")}
              onsetup={setUp}
              onstages={(next) => {
                draft = next;
              }}
              {sending}
              stages={draft}
              waiting={asks.filter(blocks).length}
            />
          </div>
        {:else if way === "page" && at === "page"}
          <div class="min-h-0 flex-auto overflow-y-auto">
            <SetupPagePreview />
          </div>
        {:else if at === "set"}
          {@const stages = way === "board" ? boardStages : PR_STAGES}
          {@const first = firstTodoStage(stages)?.name}
          <div class="flex min-h-0 flex-auto flex-col gap-space-4">
            {#if way === "board" && first}
              <SetUpBar
                {first}
                {name}
                onask={() => {
                  lead.tab = "assistant";
                  lead.open = true;
                }}
              />
            {/if}
            <div class="min-h-0 flex-auto">
              <TaskBoard
                allowedFrom={() => new Set<string>()}
                hrefOf={() => "#"}
                newIn={first}
                oncreate={async () => undefined}
                onmove={none}
                onopen={none}
                {stages}
                tasks={[]}
              />
            </div>
          </div>
        {:else}
          <SetupScene
            act={at === "page"
              ? { kind: "page", open: none }
              : { kind: "drafting" }}
            asks={asksOnBoard ? asks : []}
            onanswer={() => null}
            {seat}
          ></SetupScene>
        {/if}
      </div>
    {/snippet}
    {#snippet dock()}
      <CawFloat
        asksElsewhere={(request) =>
          asksOnBoard && !phone && request.toolName === "AskUserQuestion"}
        {lead}
        projectId={PROJECT}
        projectName={name}
        {setup}
        {switchAt}
      />
    {/snippet}
  </ProjectDock>
{/if}

{#snippet seat()}
  <CawSeat
    {lead}
    projectId={PROJECT}
    projectName={name}
    size={80}
    standIn={IconFolder}
  />
{/snippet}
