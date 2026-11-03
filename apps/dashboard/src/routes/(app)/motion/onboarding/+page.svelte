<script lang="ts">
  import type { PulseFrame } from "@cawco/core/frames";
  import type { InstanceRow } from "@cawco/core/protocol";
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
   */
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { blankSession, cawco } from "#lib/cawco/client.svelte.js";
  import FirstRun from "#lib/cawco/home/FirstRun.svelte";
  import CawFloat from "#lib/cawco/project/CawFloat.svelte";
  import CawFlock from "#lib/cawco/project/CawFlock.svelte";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import ProjectDock from "#lib/cawco/project/ProjectDock.svelte";
  import SetupScene from "#lib/cawco/project/SetupScene.svelte";
  import {
    PR_ASKS,
    PR_NAME,
    PR_STAGES,
    SETUP_CALLS,
  } from "#lib/cawco/project/setup.fixtures.js";
  import { setupProgressOf } from "#lib/cawco/project/setup-progress.js";
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
    "A personal PR team: your job search, visa applications and renewals, travel, and a public voice, with every message going out only once you send it. A page opens to confirm how it runs."
  );
  const done = said(
    "set-up",
    "assistant",
    "Your PR team is set up: eight stages from Inbox to Done, a researcher and a writer, and what it's for as the project's notes. Tell me the first thing to work on, or add it to Inbox."
  );
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
      ...SETUP_CALLS.page.slice(0, 1),
      first,
      ...SETUP_CALLS.page.slice(1),
    ],
    set: [
      sent,
      ...SETUP_CALLS.page.slice(0, 1),
      first,
      ...SETUP_CALLS.page.slice(1),
      done,
    ],
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
    // The setup page open: his panel's Preview holds it (`?beat=page`).
    if (beat === "page") {
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
    debug.frame({
      kind: "pulse",
      instanceId: ID,
      pulse: {
        activity: beat === "set" || beat === "page" ? "idle" : "working",
        at: now,
        busy: beat !== "set" && beat !== "page",
        currentTool: null,
        instanceId: ID,
        runningSubagents: 0,
      },
    } as PulseFrame);
  }

  const lead = new CawLead({
    id: () => PROJECT,
    machinesOnline: () => true,
    project: () => cawco.project(PROJECT),
    reading: () => false,
    tasks: () => [],
  });
  untrack(() => {
    lead.open = !page.url.searchParams.has("closed");
    if (beat === "page" && page.url.searchParams.get("tab") !== "assistant") {
      lead.tab = "preview";
    }
  });

  const asks = $derived(lead.asks);
  const notSetUp = beat !== "set";
  const progress = $derived(
    notSetUp
      ? setupProgressOf({
          messages: cawco.session(ID)?.messages ?? [],
          name,
          named,
          open: asks.map((one) => ({
            blocks: (one.request.input as { blocks?: unknown }).blocks === true,
          })),
          page: beat === "page",
        })
      : null
  );
  const setup = $derived(
    progress && progress.phase !== "page" ? progress : null
  );
  /**
   * A phone, read off the screen as it changes, as the project page reads
   * it (its `sheetQuery` line is CawFloat's sheet's): the bench follows a
   * resize as the page does, never a width read once at load.
   */
  const phoneQuery = new MediaQuery("(max-width: 639px)");
  const phone = $derived(phoneQuery.current);
  /** His panel stands docked beside the page while it is open and anchored, as the page's `docked`. */
  const docked = $derived(lead.open && lead.anchor !== null);
  const none = () => undefined;

  onMount(() => () => {
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
        {#if beat === "set"}
          <span class="ms-auto" data-box>
            <CawSeat {lead} projectId={PROJECT} projectName={name} />
          </span>
        {/if}
      </div>
      <div
        class="flex min-h-0 flex-auto flex-col ps-space-7 pe-space-6 max-desk:px-space-5"
      >
        {#if beat === "set"}
          <TaskBoard
            allowedFrom={() => new Set<string>()}
            hrefOf={() => "#"}
            newIn="inbox"
            oncreate={async () => undefined}
            onmove={none}
            onopen={none}
            stages={PR_STAGES}
            tasks={[]}
          />
        {:else}
          <SetupScene
            act={beat === "page"
              ? { kind: "page", open: none }
              : { kind: "drafting" }}
            {asks}
            onanswer={() => null}
            {seat}
          >
            {#snippet floor()}
              <CawFlock count={phone ? 2 : 4} />
            {/snippet}
          </SetupScene>
        {/if}
      </div>
    {/snippet}
    {#snippet dock()}
      <CawFloat
        asksElsewhere={(request) =>
          !phone && request.toolName === "AskUserQuestion"}
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
