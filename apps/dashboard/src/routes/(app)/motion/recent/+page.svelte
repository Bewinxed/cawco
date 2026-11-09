<script lang="ts">
  import type { PermissionRequestFrame, PulseFrame } from "@cawco/core/frames";
  import type { InstanceRow, SessionPulse } from "@cawco/core/protocol";
  import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
  import { onMount } from "svelte";
  import { z } from "zod";

  /**
   * The sidebar's one Recent list (tsk-323) on a bench: the real rail around
   * this page, fed through the client's own state on a bench's hub (dev
   * `standHub`), with product-shaped sessions across three areas, two
   * machines and nine projects: ten of the owner's sketch, a session with
   * three delegates (one failed), and thirty more for the regroup's 40-row
   * recording (`?rows=40`, the default; `?rows=10` the sketch's alone).
   *
   * `window.__rb` drives what the hub would: `status(id, "working" |
   * "needs" | "yours" | "wakes")` moves a session between the list's three
   * words (a pulse, a parked ask, the turn's end, a turn that ended waiting
   * on its own work); `wrote(id)` is the person writing to it; `ids` names
   * the sketch's sessions by letter. Done (the row's archive) is answered
   * here as the hub would: `doneAt` on its row.
   */

  /** The client's stores as a bench writes them (dev `__cawcoDebug`). */
  interface Bench {
    adoptInstances: (rows: InstanceRow[]) => void;
    areas: { areas: { id: string; name: string; position: number }[] };
    frame: (frame: PulseFrame | PermissionRequestFrame | object) => void;
    leaveHub: () => void;
    standHub: (answer: () => void) => void;
    state: { machines: unknown[]; projects: unknown[]; projectsRead: boolean };
  }
  const debug = (globalThis as unknown as { __cawcoDebug: Bench }).__cawcoDebug;

  const now = Date.now();

  const OBELISK = "obelisk-of-light";
  const MINI = "mac-mini";
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

  let rows = $state<InstanceRow[]>([
    ...seeds.map(([id, seed]) => rowOf(id, seed)),
    ...delegates,
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
    adopt();
  };

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

  onMount(() => {
    debug.standHub(() => undefined);
    debug.state.machines = [
      { machineId: OBELISK, hostname: OBELISK, os: "linux-x64" },
      { machineId: MINI, hostname: MINI, os: "darwin-arm64" },
    ].map((machine) => ({
      ...machine,
      auth: "unknown",
      lastSeenAt: now,
      pausedUntil: null,
      pauseStopped: null,
      status: "offline",
    }));
    debug.areas.areas = AREAS;
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
    // Done, answered as the hub would: the row's `doneAt`.
    const fetchWas = window.fetch;
    window.fetch = (input, init) =>
      answerSeen(input, init) ?? fetchWas(input, init);
    const bench = {
      ids: Object.fromEntries(
        SKETCH.map(([letter], n) => [letter, idOf(n + 1)])
      ),
      status,
      wrote: (id: string) => {
        patch(id, { wroteAt: Date.now(), doneAt: null });
        status(id, "working");
      },
    };
    Object.assign(window, { __rb: bench });
    return () => {
      window.fetch = fetchWas;
      Reflect.deleteProperty(window, "__rb");
      debug.leaveHub();
    };
  });
</script>

<svelte:head><title>Recent bench | CawCo</title></svelte:head>

<div class="flex flex-col gap-space-3 p-space-5 type-body text-ink-muted">
  <p class="m-0">
    The sidebar's Recent list on a bench: {seeds.length} sessions, three delegates
    under “Fix tray chip overflow”. Drive it from the console with
    <code>__rb</code>.
  </p>
</div>
