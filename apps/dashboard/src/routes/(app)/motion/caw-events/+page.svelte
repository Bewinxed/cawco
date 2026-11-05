<script lang="ts">
  /**
   * CAW EVENTS BENCH (dev only): a migrated project's page with Caw's panel
   * open, as the person meets him there: several conversations they
   * started, each Caw, and the project's events off. Drawn by the real
   * parts (ProjectHead with his seat, ProjectDock, CawFloat and its
   * ProjectConversation, CawLeadSwitch and its off tray) on the bench's own
   * hub (client.svelte.ts `standHub`, bench-api.ts `standApi`), which
   * answers his view and its switch as the hub does (`GET`/`PATCH
   * /api/projects/:id/caw`).
   *
   * `?state=`
   * - `off` (default): events off, three conversations of the person's
   *   (one running, one sleeping, one stopped), the newest on show;
   * - `on`: events on, the newest conversation the one they reach;
   * - `stopping`: events on with two attempts the conversation started
   *   still running, so turning him off unfolds the off tray.
   * `?closed` leaves his panel put away. Each conversation's answer names
   * the setup page's `routines` card as Caw writes it, a chip to press;
   * `?keep` keeps the bench's hub standing once the page is left, so a
   * conversation opened as a tab draws on the same records.
   */
  import type {
    CawRunning,
    ProjectConversationView,
  } from "@cawco/core/project-conversation";
  import type { InstanceRow } from "@cawco/core/protocol";
  import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
  import { onMount, untrack } from "svelte";
  import { standApi } from "#lib/cawco/bench-api.js";
  import { blankSession } from "#lib/cawco/client.svelte.js";
  import BenchHead from "#lib/cawco/project/BenchHead.svelte";
  import { benchLead } from "#lib/cawco/project/bench-lead.svelte.js";
  import CawFloat from "#lib/cawco/project/CawFloat.svelte";
  import ProjectDock from "#lib/cawco/project/ProjectDock.svelte";
  import type { Message } from "#lib/cawco/types.js";
  import { browser } from "$app/env";
  import { page } from "$app/state";

  type Beat = "off" | "on" | "stopping";
  const asked = page.url.searchParams.get("state");
  const beat: Beat = asked === "on" || asked === "stopping" ? asked : "off";

  const PROJECT = "bench-cawco";
  const NAME = "Cawco";
  const CWD = "/home/bewinxed/cockpit";
  /** Its setup page, which Caw's message names a card of. */
  const SETUP = "4d7cf81c-f225-4f5e-acea-a6089ef4b19f";
  const now = Date.now();

  /** The person's conversations, newest first: each Caw, told apart by what it was asked. */
  const CONVERSATIONS = [
    {
      id: "c0nv-0001-running",
      title: "Why does the board count three when Decisions says one?",
      status: "running",
      ago: 4 * MINUTE_MS,
    },
    {
      id: "c0nv-0002-sleeping",
      title: "Draft the release notes for nightly 6787",
      status: "sleeping",
      ago: 3 * HOUR_MS,
    },
    {
      id: "c0nv-0003-stopped",
      title: "Find the flaky hub test in tasks.ts",
      status: "stopped",
      ago: 26 * HOUR_MS,
    },
  ] as const;
  const [newest] = CONVERSATIONS;

  /** What the conversation started that still runs (`stopping`): two attempts. */
  const RUNNING: CawRunning[] =
    beat === "stopping"
      ? [
          {
            id: "att-0001",
            kind: "attempt",
            cwd: CWD,
            machineId: "hub",
            offline: false,
            parentId: null,
            taskId: "tsk-41",
            taskTitle: "Move the setup page's open to Decisions",
            title: null,
          },
          {
            id: "att-0002",
            kind: "attempt",
            cwd: CWD,
            machineId: "hub",
            offline: false,
            parentId: null,
            taskId: "tsk-42",
            taskTitle: "Count what Needs you narrows to",
            title: null,
          },
        ]
      : [];

  const debug = (
    globalThis as unknown as {
      __cawcoDebug: {
        state: {
          projects: Record<string, unknown>[];
          sessions: Record<string, ReturnType<typeof blankSession>>;
        };
        adoptInstances: (rows: InstanceRow[]) => void;
        standHub: (answer: () => void) => void;
        leaveHub: () => void;
      };
    }
  ).__cawcoDebug;

  const row = {
    id: PROJECT,
    name: NAME,
    cawHarness: "claude",
    cawModel: null,
    // On, the newest conversation is the one the project's events reach.
    conversationInstanceId: beat === "off" ? null : newest.id,
    createdAt: new Date(now - 30 * DAY_MS).toISOString(),
    eventsOn: beat !== "off",
    lands: "main",
    lfsConnection: null,
    lfsUrl: null,
    links: [],
    places: [],
    primaryPlaceId: null,
    review: false,
  };
  /** His view as the hub answers it, the switch's state. */
  let view = $state<ProjectConversationView>({
    harness: "claude",
    instanceId: row.conversationInstanceId,
    mode: null,
    model: null,
    on: row.eventsOn,
    problem: null,
    running: RUNNING,
    spendUsd: 3.42,
    starting: false,
  });

  const said = (
    id: string,
    instanceId: string,
    type: Message["type"],
    content: string,
    ago: number
  ) =>
    ({
      id,
      instanceId,
      type,
      content,
      timestamp: new Date(now - ago).toISOString(),
    }) as Message;

  if (browser) {
    debug.state.projects.push(row);
    debug.adoptInstances(
      CONVERSATIONS.map(
        (one) =>
          ({
            id: one.id,
            cwd: CWD,
            harness: "claude",
            kind: "mainline",
            launchDir: "known",
            machineId: "hub",
            sessionId: null,
            status: one.status,
            origin: "person",
            projectId: PROJECT,
            parentInstanceId: null,
            createdAt: new Date(now - one.ago).toISOString(),
            title: one.title,
          }) as unknown as InstanceRow
      )
    );
    for (const one of CONVERSATIONS) {
      const session = blankSession(one.id);
      session.machineId = "hub";
      session.cwd = CWD;
      session.initialized = true;
      session.messages = [
        said(`${one.id}-ask`, one.id, "user", one.title, one.ago),
        said(
          `${one.id}-answer`,
          one.id,
          "assistant",
          `Reading the page's count and the Decisions tab's now. The setup page still asks [Which routines does it run?](cawco:decision/${SETUP}/routines).`,
          one.ago - 30_000
        ),
      ];
      debug.state.sessions[one.id] = session;
    }
    debug.standHub(() => undefined);
  }
  const restore = browser
    ? standApi((path, method, _query) => {
        if (path === `/api/artifacts/${SETUP}`) {
          // Its setup page, made by an earlier conversation than the one
          // on show (the hub's show refused such a chip's press).
          return {
            id: SETUP,
            instanceId: "c0nv-0000-setup",
            kind: "page",
            name: "setup",
            project: PROJECT,
            shown: false,
          };
        }
        if (path !== `/api/projects/${PROJECT}/caw`) {
          return;
        }
        if (method === "PATCH") {
          // The hub turns him as asked: off, what was named stops.
          const on = !view.on;
          view = {
            ...view,
            on,
            running: on ? view.running : [],
            instanceId: on ? newest.id : view.instanceId,
          };
        }
        return view;
      })
    : () => undefined;
  // `?keep`: the bench's hub stays as the page leaves, so its links (a
  // conversation's tab) open on the same records.
  const keep = page.url.searchParams.has("keep");
  onMount(() => () => {
    if (keep) {
      return;
    }
    restore();
    debug.leaveHub();
    debug.state.projects.splice(debug.state.projects.indexOf(row), 1);
    for (const one of CONVERSATIONS) {
      delete debug.state.sessions[one.id];
    }
  });

  const lead = benchLead(PROJECT);
  untrack(() => {
    lead.open = !page.url.searchParams.has("closed");
    lead.read();
  });
  const docked = $derived(lead.open && lead.anchor !== null);
</script>

<ProjectDock {docked} preview={lead.tab === "preview"}>
  {#snippet page()}
    <BenchHead {lead} projectId={PROJECT} />
  {/snippet}
  {#snippet dock()}
    <CawFloat {lead} projectId={PROJECT} projectName={NAME} />
  {/snippet}
</ProjectDock>
