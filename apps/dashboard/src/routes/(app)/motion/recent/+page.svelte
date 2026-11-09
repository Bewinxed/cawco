<script lang="ts">
  import { CLAUDE_PROVIDER } from "@cawco/core/accounts";
  import type { PermissionRequestFrame, PulseFrame } from "@cawco/core/frames";
  import { CAPABILITIES_NONE } from "@cawco/core/harness";
  import { PERMISSION_MODES } from "@cawco/core/harness/kinds";
  import {
    type MemberProject,
    projectAt,
  } from "@cawco/core/project-membership";
  import type {
    InstanceRow,
    NamedSpawn,
    SessionPulse,
    StoredRecent,
    TabNamed,
  } from "@cawco/core/protocol";
  import { CONTROL_STORED_RUN } from "@cawco/core/session/controls";
  import type {
    NeutralSessionInfo,
    StoredRun,
  } from "@cawco/core/session-messages";
  import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
  import type {
    TranscriptBlock,
    TranscriptPage,
  } from "@cawco/core/transcript-types";
  import { onMount } from "svelte";
  import { z } from "zod";
  import Home from "#lib/cawco/home/Home.svelte";
  import { MINI, OBELISK, STORED, storedListing } from "./stored-listing";

  /**
   * The sidebar's one Recent list (tsk-323) on a bench: the real rail around
   * this page, fed through the client's own state on a bench's hub (dev
   * `standHub`), with product-shaped sessions across three areas, two
   * machines and nine projects: ten of the owner's sketch, a session with
   * three delegates (one failed), and thirty more for the regroup's 40-row
   * recording (`?rows=40`, the default; `?rows=10` the sketch's alone).
   *
   * `?stay` keeps the bench's hub standing once its page is left (a tab
   * opened from the rail), until a reload: its machines are then
   * connected, the transcript typed in a terminal is read as the hub reads
   * one, and its machine says what it ran with (`__rb.controls`), so its
   * page is written to and its first message resumes it. Its sign-in is
   * no account of CawCo's there, so the message is refused until an
   * account is picked in its details (`?stay=matched`: it is the studio's
   * account, and resumes on it). `window.__rb` drives what the
   * hub would: `status(id, "working" |
   * "needs" | "yours" | "wakes")` moves a session between the list's three
   * words (a pulse, a parked ask, the turn's end, a turn that ended waiting
   * on its own work); `wrote(id)` is the person writing to it; `ids` names
   * the sketch's sessions by letter. Done (the row's archive) is answered
   * here as the hub would: `doneAt` on its row.
   *
   * The machines' stored transcripts stand in too (stored-listing.ts), as
   * each machine's listing answers them: one a person typed in a terminal
   * in a project's folder (in Recent), three in a project's folder that
   * nothing says a person started (OpenCode's, pi's, a `claude -p` run:
   * Jump's alone), two in no project's folder, one behind a listed session
   * and one behind a session the person pressed Done on ("Refund flow edge
   * cases", which stays hidden).
   * Five more are behind sessions the board no longer lists, which the
   * bench keeps as the hub does (hub stored-recent.ts, `standStored`): a
   * session the person stopped four days ago ("Move invoices to the new
   * ledger", in Older under storefront, by its own id) with two delegates
   * folded under it, one of theirs that failed five days ago ("Reconcile
   * the ledger export", in Older with its failure and its Done), and a
   * check nobody wrote in, which stands nowhere. Each of those sessions'
   * transcripts is stored under its harness key, never its id, and the
   * bench answers what a tab's id names as the hub does (`POST
   * /api/instances/named`), so a tab opened by such a key takes the
   * session's id. A start the page asks for is taken as the hub takes one
   * (its row opened; `__rb.spawns`, then `__rb.commands` for what is sent
   * to it), so a first send on a stored transcript's page resumes it here.
   */

  /** The client's stores as a bench writes them (dev `__cawcoDebug`). */
  interface Bench {
    adoptInstances: (rows: InstanceRow[]) => void;
    areas: {
      areas: { id: string; name: string; position: number }[];
      read: boolean;
    };
    frame: (frame: PulseFrame | PermissionRequestFrame | object) => void;
    leaveHub: () => void;
    standHub: (
      answer: (
        instanceId: string,
        kind: string,
        intent: unknown,
        commandId: string
      ) => void,
      spawn: (machineId: string, spawn: NamedSpawn) => Promise<void>,
      control: (machineId: string, method: string, args: unknown[]) => unknown
    ) => void;
    standStored: (stored: StoredRecent) => void;
    state: {
      accounts: unknown;
      machines: unknown[];
      projects: unknown[];
      projectsRead: boolean;
    };
  }
  const debug = (globalThis as unknown as { __cawcoDebug: Bench }).__cawcoDebug;

  const now = Date.now();

  const AREAS = [
    { id: "area-cawco", name: "CawCo", position: 0 },
    { id: "area-acme", name: "Acme Studio", position: 1 },
    { id: "area-home", name: "Home", position: 2 },
  ];
  const PROJECTS: [id: string, name: string, area: string, machine: string][] =
    [
      ["p-cawco-dev", "cawco-dev", "area-cawco", OBELISK],
      ["p-cawco-site", "cawco.dev", "area-cawco", MINI],
      ["p-landing", "landing-site", "area-cawco", OBELISK],
      ["p-infra", "infra", "area-cawco", MINI],
      ["p-storefront", "storefront", "area-acme", OBELISK],
      ["p-socials", "socials", "area-acme", OBELISK],
      ["p-brand", "brand", "area-acme", OBELISK],
      ["p-moving", "Moving house", "area-home", MINI],
      ["p-paperwork", "Paperwork", "area-home", MINI],
    ];

  /** A bench session's id: a uuid with `n` at its end. */
  const idOf = (n: number) =>
    `5e55a0b0-0000-4000-8000-${String(n).padStart(12, "0")}`;

  type Doing = "working" | "needs" | "yours" | "wakes";
  interface Seed {
    ago: number;
    doing: Doing;
    project: string;
    title: string;
    unread?: boolean;
  }

  /** The sketch's ten (data.ts), by letter. */
  const SKETCH: [letter: string, seed: Seed][] = [
    [
      "a",
      {
        title: "Rethink working/finished",
        project: "p-cawco-dev",
        doing: "needs",
        ago: 3 * MINUTE_MS,
      },
    ],
    [
      "b",
      {
        title: "Fix tray chip overflow",
        project: "p-cawco-dev",
        doing: "working",
        ago: 12 * MINUTE_MS,
      },
    ],
    [
      "c",
      {
        title: "Checkout returns 404 after payment",
        project: "p-storefront",
        doing: "yours",
        ago: 25 * MINUTE_MS,
        unread: true,
      },
    ],
    [
      "d",
      {
        title: "Landing page story",
        project: "p-cawco-site",
        doing: "working",
        ago: 40 * MINUTE_MS,
      },
    ],
    [
      "e",
      {
        title: "Weekly post drafts",
        project: "p-socials",
        doing: "yours",
        ago: 2 * HOUR_MS,
      },
    ],
    [
      "f",
      {
        title: "Compare movers' quotes",
        project: "p-moving",
        doing: "wakes",
        ago: DAY_MS + HOUR_MS,
      },
    ],
    [
      "g",
      {
        title: "Usage tracker cleanup",
        project: "p-cawco-dev",
        doing: "yours",
        ago: DAY_MS + 2 * HOUR_MS,
      },
    ],
    [
      "h",
      {
        title: "Tax receipts 2026",
        project: "p-paperwork",
        doing: "yours",
        ago: 5 * DAY_MS,
      },
    ],
    [
      "i",
      {
        title: "Logo exports for print",
        project: "p-brand",
        doing: "yours",
        ago: 6 * DAY_MS,
      },
    ],
    [
      "j",
      {
        title: "Pi sign-in flow",
        project: "p-cawco-dev",
        doing: "yours",
        ago: 8 * DAY_MS,
      },
    ],
  ];
  /** Thirty more, for a list of forty. */
  const MORE_TITLES = [
    "Rename the archive view",
    "Hub restart drops keep-alive",
    "Caw panel copy pass",
    "Bump opencode to 1.4",
    "Usage meter at 390",
    "Account switch on limit",
    "Probe kit: scratch fleet ports",
    "Order confirmation email",
    "Refund flow edge cases",
    "Instagram carousel sizes",
    "Brand colour tokens",
    "Packing list by room",
    "Utility transfers",
    "Insurance renewal letters",
    "Deploy preview links",
    "Transcript search ranking",
    "Decision page dials",
    "iOS push for questions",
    "Fleet watch triage",
    "Area settings screen",
    "Sitemap for the docs",
    "Hero video cut",
    "Stripe webhook retries",
    "Newsletter template",
    "Moving day schedule",
    "Landlord deposit return",
    "Folder hue picker",
    "Workspace archive confirm",
    "Rail resize on iPad",
    "Release notes draft",
  ];
  const DOINGS: Doing[] = [
    "yours",
    "working",
    "yours",
    "yours",
    "needs",
    "yours",
  ];

  const params = new URLSearchParams(
    typeof location === "undefined" ? "" : location.search
  );
  const count = Number(params.get("rows") ?? "40");

  const seeds: [id: string, seed: Seed][] = [
    ...SKETCH.map(([, seed], n): [string, Seed] => [idOf(n + 1), seed]),
    ...MORE_TITLES.slice(0, Math.max(0, count - SKETCH.length)).map(
      (title, n): [string, Seed] => [
        idOf(100 + n),
        {
          title,
          project: PROJECTS[n % PROJECTS.length]?.[0] ?? "p-cawco-dev",
          doing: DOINGS[n % DOINGS.length] ?? "yours",
          ago: ([0.3, 1.2, 3 + n][n % 3] ?? 1) * DAY_MS,
          unread: n % 7 === 0,
        },
      ]
    ),
  ];
  const projectOf = (id: string) => PROJECTS.find(([pid]) => pid === id);

  /** A bench session's row as the hub files it. */
  const rowOf = (
    id: string,
    seed: Seed,
    extra: Partial<InstanceRow> = {}
  ): InstanceRow => {
    const machineId = projectOf(seed.project)?.[3] ?? OBELISK;
    const ended =
      seed.doing === "working" ? null : now - seed.ago + 2 * MINUTE_MS;
    return {
      id,
      cwd: `/srv/${projectOf(seed.project)?.[1] ?? "work"}`,
      harness: "claude",
      kind: "mainline",
      launchDir: "known",
      machineId,
      sessionId: id,
      status: "running",
      origin: "person",
      projectId: seed.project,
      title: seed.title,
      createdAt: now - seed.ago - HOUR_MS,
      wroteAt: now - seed.ago,
      updatedAt: now - seed.ago + 2 * MINUTE_MS,
      turnEndedAt: ended,
      seenAt: seed.unread || ended === null ? null : ended + MINUTE_MS,
      wakesItself: seed.doing === "wakes",
      ...extra,
    };
  };

  const B = idOf(2);
  const delegates: InstanceRow[] = [
    ["Find why the chip overflows", "idle"],
    ["Fix it in the chip itself", "working"],
    ["Check it at 390", "error"],
  ].map(([title, how], n) => ({
    ...rowOf(idOf(50 + n), {
      title: title as string,
      project: "p-cawco-dev",
      doing: "yours",
      ago: (9 - 4 * n) * MINUTE_MS,
    }),
    origin: "delegate",
    parentInstanceId: B,
    wroteAt: null,
    status: how === "error" ? "error" : "running",
    lastError: how === "error" ? "The build failed" : null,
  }));

  /** A session the person pressed Done on: Recent leaves it out, and its transcript stays out too. */
  const DONE = idOf(90);
  const doneRow: InstanceRow = {
    ...rowOf(DONE, {
      title: "Refund flow edge cases",
      project: "p-storefront",
      doing: "yours",
      ago: 90 * MINUTE_MS,
    }),
    doneAt: now - 60 * MINUTE_MS,
  };

  /** A session the person stopped four days ago: the board no longer lists it, and the hub still holds it. */
  const OLDER = idOf(91);
  const olderSeed: Seed = {
    title: "Move invoices to the new ledger",
    project: "p-storefront",
    doing: "yours",
    ago: 4 * DAY_MS,
  };
  /** An older session's harness key, which its transcript is stored under: never its id. */
  const keyOf = (n: number) =>
    `0c1a0d00-0000-4000-9000-${String(n).padStart(12, "0")}`;
  /** One of theirs that failed five days ago, and nobody has pressed Done on. */
  const FAILED = idOf(95);
  /** It, its two delegates and the failed one: what the hub answers their transcripts with. */
  let olderRows: InstanceRow[] = [
    rowOf(OLDER, olderSeed, { sessionId: keyOf(91), status: "stopped" }),
    rowOf(
      FAILED,
      {
        title: "Reconcile the ledger export",
        project: "p-storefront",
        doing: "yours",
        ago: 5 * DAY_MS,
      },
      {
        sessionId: keyOf(95),
        status: "error",
        lastError: "The export ran out of memory",
      }
    ),
    ...["Port the invoice schema", "Check totals against last quarter"].map(
      (title, n): InstanceRow => ({
        ...rowOf(idOf(92 + n), { ...olderSeed, title }),
        origin: "delegate",
        parentInstanceId: OLDER,
        sessionId: keyOf(92 + n),
        status: "sleeping",
        wroteAt: null,
      })
    ),
  ];
  /** A check of that work nobody wrote in: the hub holds it, and it stands in no list. */
  const olderCheck: InstanceRow = {
    ...rowOf(idOf(94), { ...olderSeed, title: "Review the ledger migration" }),
    origin: "check",
    sessionId: keyOf(94),
    status: "sleeping",
    wroteAt: null,
  };

  let rows = $state<InstanceRow[]>([
    ...seeds.map(([id, seed]) => rowOf(id, seed)),
    ...delegates,
    doneRow,
  ]);
  const adopt = () => debug.adoptInstances(rows.map((row) => ({ ...row })));

  const pulse = (instanceId: string, activity: SessionPulse["activity"]) =>
    debug.frame({
      kind: "pulse",
      instanceId,
      pulse: {
        activity,
        at: Date.now(),
        busy: activity === "working",
        currentTool: null,
        instanceId,
        runningSubagents: 0,
      },
    });
  let asks = 0;
  /** A parked ask on `instanceId`: core `waitingOnYou` holds it, Needs you. */
  const ask = (instanceId: string) => {
    asks += 1;
    debug.frame({
      kind: "permission_request",
      instanceId,
      requestId: `bench-ask-${asks}`,
      harness: "claude",
      input: { command: "bun run build" },
      toolName: "Bash",
      raisedAt: Date.now(),
      presentation: {
        asker: "bench",
        changes: [],
        fields: [],
        summary: "Run the build on its branch",
      },
    });
    return `bench-ask-${asks}`;
  };
  const openAsks = new Map<string, string>();
  const settle = (instanceId: string) => {
    const requestId = openAsks.get(instanceId);
    if (requestId) {
      debug.frame({
        kind: "permission_settled",
        instanceId,
        requestId,
        outcome: "answered",
      });
      openAsks.delete(instanceId);
    }
  };
  const patch = (id: string, change: Partial<InstanceRow>) => {
    rows = rows.map((row) => (row.id === id ? { ...row, ...change } : row));
    // One the board no longer lists is changed where the hub holds it: its
    // answer for the stored transcripts says it, never a board frame.
    olderRows = olderRows.map((row) =>
      row.id === id ? { ...row, ...change } : row
    );
    adopt();
    standStored();
  };

  /** How long the bench's machine takes a start in: about a real one's. */
  const SPAWN_MS = 1500;
  /** What the page asked the bench's hub to do: each start, and each command after it. */
  const spawns: { machineId: string; spawn: NamedSpawn }[] = [];
  const commands: {
    commandId: string;
    instanceId: string;
    intent: unknown;
    kind: string;
  }[] = [];
  const controls: { machineId: string; method: string; args: unknown[] }[] = [];

  /** Moves a session to one of the list's words, as the hub's frames would. */
  function status(id: string, doing: Doing) {
    settle(id);
    if (doing === "working") {
      patch(id, { turnEndedAt: null, wakesItself: false });
      pulse(id, "working");
    } else if (doing === "needs") {
      pulse(id, "working");
      openAsks.set(id, ask(id));
    } else {
      patch(id, {
        turnEndedAt: Date.now(),
        wakesItself: doing === "wakes",
      });
      pulse(id, "idle");
    }
  }

  /** A Done (an archive) or a look, as the hub answers `/api/seen`. */
  const SeenBody = z.object({ ids: z.array(z.string()), kind: z.string() });
  function answerSeen(
    input: RequestInfo | URL,
    init: RequestInit | undefined
  ): Promise<Response> | undefined {
    const url = input instanceof Request ? input.url : String(input);
    if (!(url.includes("/api/seen") && init?.body)) {
      return;
    }
    const { ids, kind } = SeenBody.parse(JSON.parse(String(init.body)));
    const at = Date.now();
    const done = kind === "unarchive" ? null : at;
    for (const id of ids) {
      patch(id, {
        seenAt: done,
        ...(kind === "look" ? {} : { doneAt: done }),
      });
    }
    return Promise.resolve(Response.json({ at }));
  }

  /** The machines' stored transcripts as their listings answer them (stored-listing.ts). */
  let listing: Record<string, NeutralSessionInfo[]> = {};

  /**
   * Recent's stored transcripts as the hub keeps them off the machines'
   * listings (core `StoredRecent`, hub stored-recent.ts): the person's older
   * session with its delegates, and the transcripts in a project's folder
   * that a person started and no row of the bench wraps.
   */
  function standStored(): void {
    const held = real ? [] : [...olderRows, olderCheck];
    const wrapped = new Set([...rows, ...held].map((row) => row.sessionId));
    const listed = new Set(rows.map((row) => row.id));
    const projects = debug.state.projects as MemberProject[];
    debug.standStored({
      rows: real ? [] : olderRows.filter((row) => !listed.has(row.id)),
      transcripts: Object.entries(listing).flatMap(([machineId, infos]) =>
        infos.flatMap((info) => {
          const project = projectAt(projects, {
            machineId,
            cwd: info.cwd ?? "",
          });
          return project &&
            info.startedBy === "person" &&
            !wrapped.has(info.sessionId)
            ? [{ machineId, projectId: project.id, info }]
            : [];
        })
      ),
    });
  }

  /**
   * What a tab's id names, as the hub answers `/api/instances/named` (core
   * `TabNamed`): a row's own id, the row a harness key is the transcript
   * of, else a stored transcript read by its own key.
   */
  const NamedBody = z.object({ ids: z.array(z.object({ id: z.string() })) });
  function answerNamed(
    input: RequestInfo | URL,
    init: RequestInit | undefined
  ): Promise<Response> | undefined {
    const url = input instanceof Request ? input.url : String(input);
    if (!(url.includes("/api/instances/named") && init?.body)) {
      return;
    }
    const held = [...rows, ...olderRows, olderCheck];
    const answer: TabNamed[] = NamedBody.parse(
      JSON.parse(String(init.body))
    ).ids.map(({ id: asked }) => {
      const row =
        held.find((one) => one.id === asked) ??
        held.find((one) => one.sessionId === asked);
      return { asked, kind: "session", id: row?.id ?? asked };
    });
    return Promise.resolve(Response.json(answer));
  }

  /**
   * The transcript the person typed in a terminal in storefront's folder,
   * as the hub reads it (`GET /api/instances/:id/transcript`): under its
   * own key while no session wraps it, and under the session's id once its
   * first message has resumed it.
   */
  const TRANSCRIPT = /\/api\/instances\/([^/?]+)\/transcript/u;
  function answerTranscript(
    input: RequestInfo | URL
  ): Promise<Response> | undefined {
    const url = input instanceof Request ? input.url : String(input);
    const id = TRANSCRIPT.exec(url)?.[1];
    const resumed = rows.find(
      (row) => row.id === id && row.sessionId === STORED.inStorefront
    );
    if (!(id && (id === STORED.inStorefront || resumed))) {
      return;
    }
    const said = (
      n: number,
      type: "user" | "assistant",
      content: string
    ): TranscriptBlock => ({
      id: `${STORED.inStorefront}:${n}`,
      instanceId: id,
      type,
      content,
      timestamp: new Date(now - (60 - n) * MINUTE_MS).toISOString(),
    });
    const page: TranscriptPage = {
      blocks: [
        said(
          0,
          "user",
          "Stripe retries the payment_intent.succeeded webhook and we charge twice; make the handler idempotent"
        ),
        said(
          1,
          "assistant",
          "The handler now records each event id before it charges, and a retry of one it has seen answers 200 without charging again."
        ),
        // What the session was sent since, as the hub has taken it: each
        // under its send's own id, the row this tab drew for it.
        ...commands
          .filter((one) => one.instanceId === id && one.kind === "send")
          .map((one): TranscriptBlock => ({
            id: one.commandId,
            instanceId: id,
            type: "user",
            content: (one.intent as { text: string }).text,
            timestamp: new Date().toISOString(),
          })),
      ],
      branches: [],
      cursor: null,
      // The session it was resumed as is at work on its first message.
      ...(resumed
        ? {
            tail: {
              busy: true,
              currentTool: null,
              openBlock: null,
              streaming: "",
              streams: {},
              thinkingClosing: false,
              thinkingSince: null,
              thinkingStream: "",
            },
          }
        : {}),
      where: {
        cwd: "/srv/storefront",
        harness: "claude",
        machineId: OBELISK,
        sessionKey: STORED.inStorefront,
      },
    };
    return Promise.resolve(Response.json(page));
  }

  /**
   * A live hub's own rows, when a check stands them in before the page loads
   * (`__rbReal`: `/api/instances`, `/api/projects`, `/api/agents` and
   * `/api/areas` from a hub opened on a copy of its database): the bench
   * draws them instead of its own.
   */
  interface Real {
    agents: unknown[];
    areas: { areas: Bench["areas"]["areas"] };
    instances: InstanceRow[];
    projects: unknown[];
  }
  const real = (globalThis as unknown as { __rbReal?: Real }).__rbReal;
  /** `?fleet`: the page is Fleet on a desk, beside the rail. */
  const fleet = params.has("fleet");
  /** `?stay`: the bench's hub outlives its page. */
  const stays = params.has("stay");
  /** `?stay=matched`: the machine's own sign-in is one of CawCo's accounts there. */
  const matched = params.get("stay") === "matched";
  /** The two Claude accounts signed in on the bench's machines. */
  const STUDIO = "acc-studio";
  const ACCOUNTS = [
    { id: STUDIO, email: "rand@acme.studio", hue: "amber" },
    { id: "acc-max", email: "billing@acme.studio", hue: "blue" },
  ];

  function standReal(from: Real): void {
    debug.state.machines = from.agents;
    debug.areas.areas = from.areas.areas;
    debug.areas.read = true;
    debug.state.projects = from.projects;
    debug.state.projectsRead = true;
    rows = from.instances;
    adopt();
    standStored();
  }

  function standSketch(): void {
    debug.state.machines = [
      { machineId: OBELISK, hostname: OBELISK, os: "linux-x64" },
      { machineId: MINI, hostname: MINI, os: "darwin-arm64" },
    ].map((machine) => ({
      ...machine,
      auth: "unknown",
      lastSeenAt: now,
      pausedUntil: null,
      pauseStopped: null,
      // Staying, its machines are connected and say what Claude Code takes,
      // so a session's page can be written to and its settings picked.
      status: stays ? "online" : "offline",
      ...(stays
        ? {
            harnesses: [
              {
                harness: "claude",
                capabilities: {
                  ...CAPABILITIES_NONE,
                  permissionModes: PERMISSION_MODES.filter(
                    (mode) => mode !== "fullSend"
                  ),
                  effort: true,
                  setModel: true,
                },
              },
            ],
          }
        : {}),
    }));
    debug.areas.areas = AREAS;
    debug.areas.read = true;
    if (stays) {
      // The accounts a session's details offer: two of Claude's, signed in
      // on both machines.
      debug.state.accounts = {
        accounts: ACCOUNTS.map((account, order) => ({
          ...account,
          atPlanLimit: "move",
          createdAt: now - 30 * DAY_MS,
          identity: null,
          kind: "subscription",
          label: null,
          neverBackup: false,
          order,
          provider: CLAUDE_PROVIDER,
          reservePct: null,
        })),
        bench: [],
        catalogFaults: [],
        catalogs: [],
        pending: [],
        readings: [],
        rebalances: [],
        routing: [],
        signins: ACCOUNTS.flatMap((account) =>
          [OBELISK, MINI].map((machineId) => ({
            accountId: account.id,
            checkedAt: now,
            machineId,
            movedAt: null,
            movedFrom: null,
            state: "signed-in",
          }))
        ),
      };
    }
    debug.state.projects = PROJECTS.map(([id, name, area, machineId]) => ({
      id,
      name,
      areaId: area,
      cawHarness: "claude",
      cawModel: null,
      conversationInstanceId: null,
      createdAt: new Date(now - 30 * DAY_MS).toISOString(),
      eventsOn: true,
      lands: "main",
      lfsConnection: null,
      lfsUrl: null,
      links: [],
      places: [
        {
          id: `${id}-place`,
          isPrimary: true,
          kind: "checkout",
          machineId,
          path: `/srv/${name}`,
        },
      ],
      primaryPlaceId: `${id}-place`,
      review: false,
    }));
    debug.state.projectsRead = true;
    adopt();
    listing = storedListing(
      now,
      idOf(3),
      DONE,
      [...olderRows, olderCheck].flatMap((row) => row.sessionId ?? [])
    );
    standStored();
    for (const [id, seed] of seeds) {
      if (seed.doing === "working") {
        pulse(id, "working");
      } else if (seed.doing === "needs") {
        pulse(id, "working");
        openAsks.set(id, ask(id));
      } else {
        pulse(id, "idle");
      }
    }
    pulse(delegates[1]?.id ?? "", "working");
  }

  onMount(() => {
    // Done, answered as the hub would (the row's `doneAt`).
    const fetchWas = window.fetch;
    // A proxy of the native fetch, so what else it carries (Bun types its
    // `preconnect`) stays as it is.
    window.fetch = new Proxy(fetchWas, {
      apply: (_fetch, _this, [input, init]: Parameters<typeof fetch>) =>
        answerSeen(input, init) ??
        answerNamed(input, init) ??
        answerTranscript(input) ??
        fetchWas(input, init),
    });
    debug.standHub(
      (instanceId, kind, intent, commandId) => {
        commands.push({ instanceId, kind, intent, commandId });
      },
      async (machineId, spawn) => {
        // The hub opens the row a start asks for, once its machine has
        // taken it: a resume's on the conversation it names, the person's
        // own.
        spawns.push({ machineId, spawn });
        await new Promise((taken) => setTimeout(taken, SPAWN_MS));
        rows = [
          ...rows,
          {
            ...rowOf(spawn.instanceId, {
              title: "Idempotent payment webhooks",
              project: "p-storefront",
              doing: "working",
              ago: 0,
            }),
            cwd: spawn.cwd,
            machineId,
            sessionId: spawn.resume?.sessionKey ?? spawn.instanceId,
          },
        ];
        adopt();
        // It runs: its first message is its turn.
        pulse(spawn.instanceId, "working");
      },
      (machineId, method, args) => {
        controls.push({ machineId, method, args });
        // What the transcript typed in a terminal ran with, as its machine
        // reads it (agent claude-stored-run.ts): its mode and model off the
        // transcript, its effort off the user's settings. It is kept under
        // the machine's own sign-in, which is no account of CawCo's there,
        // or, with `?stay=matched`, the studio's.
        return method === CONTROL_STORED_RUN
          ? ({
              account: matched ? STUDIO : null,
              signIn: matched ? "rand@acme.studio" : "rand@personal.example",
              permissionMode: { from: "transcript", value: "acceptEdits" },
              model: { from: "transcript", value: "claude-opus-5-5" },
              effort: { from: "user-settings", value: "high" },
            } satisfies StoredRun)
          : undefined;
      }
    );
    if (real) {
      standReal(real);
    } else {
      standSketch();
    }
    const bench = {
      ids: Object.fromEntries(
        SKETCH.map(([letter], n) => [letter, idOf(n + 1)])
      ),
      commands,
      controls,
      spawns,
      done: DONE,
      failed: FAILED,
      older: OLDER,
      status,
      wrote: (id: string) => {
        patch(id, { wroteAt: Date.now(), doneAt: null });
        status(id, "working");
      },
    };
    Object.assign(window, { __rb: bench });
    return () => {
      // `?stay`: the bench's hub stands after its page is left, so a
      // session's own page (a tab it opens, a transcript it resumes) is
      // operated on it; a reload ends it.
      if (stays) {
        return;
      }
      window.fetch = fetchWas;
      Reflect.deleteProperty(window, "__rb");
      debug.leaveHub();
    };
  });
</script>

<svelte:head><title>Recent bench | CawCo</title></svelte:head>

{#if fleet}
  <!-- Fleet on a desk, as SessionSurface draws it beside the rail. -->
  <Home variant="page" wide />
{:else}
  <div class="flex flex-col gap-space-3 p-space-5 type-body text-ink-muted">
    <p class="m-0">
      The sidebar's Recent list on a bench: {real
        ? `${real.instances.length} rows from a live hub's database`
        : `${seeds.length} sessions, three delegates under “Fix tray chip overflow”`}.
      Drive it from the console with <code>__rb</code>.
    </p>
  </div>
{/if}
