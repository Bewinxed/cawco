<script lang="ts" module>
  import { z } from "zod";
  import {
    answerLimitChecksWith,
    type LimitAnswer,
    type LimitAsker,
  } from "./limit-checks.svelte";

  /** What one bench answers in the hub's place: a move asked at its route, and a limit's check. */
  interface Stand {
    check: LimitAsker;
    move: (accountId: string) => void;
  }

  /**
   * The benches mounted now, newest last. A canvas mounts one per frame,
   * all on the same dials, and what stands in for the hub is the page's
   * (its `fetch`, the check's seam), so it is put up once while any bench
   * stands and the newest answers. Each bench putting up its own and
   * taking it down as it went left the others on the real hub: a frame
   * gone took the page's `fetch` back from the one still in use.
   */
  const stands: Stand[] = [];
  let takeDown: (() => void) | null = null;
  const MOVE = /\/api\/instances\/[^/]+\/account$/u;
  /** What a move's request carries. */
  const MoveBody = z.object({ accountId: z.string() });
  const newest = (): Stand | undefined => stands.at(-1);

  function putUp(): () => void {
    const fetchWas = window.fetch;
    window.fetch = new Proxy(fetchWas, {
      apply: (_fetch, _this, [input, init]: Parameters<typeof fetch>) => {
        const url = input instanceof Request ? input.url : String(input);
        const bench = newest();
        if (!(
          bench &&
          MOVE.test(new URL(url, location.href).pathname) &&
          init?.method === "POST"
        )) {
          return fetchWas(input, init);
        }
        bench.move(MoveBody.parse(JSON.parse(String(init.body))).accountId);
        return Promise.resolve(Response.json({ ok: true }));
      },
    });
    const release = answerLimitChecksWith((accountId, model) => {
      const bench = newest();
      return bench
        ? bench.check(accountId, model)
        : Promise.resolve({ kind: "still" });
    });
    return () => {
      window.fetch = fetchWas;
      release();
    };
  }

  /** `one` answers in the hub's place until its release, while it is the newest bench. */
  function standIn(one: Stand): () => void {
    stands.push(one);
    takeDown ??= putUp();
    return () => {
      stands.splice(stands.indexOf(one), 1);
      if (stands.length === 0) {
        takeDown?.();
        takeDown = null;
      }
    };
  }
</script>

<script lang="ts">
  /**
   * The session card to use (LimitPicker.stories `Live`): the real
   * SessionDetails, its stores fed by their own writers with one
   * product-shaped session on tower and five Claude accounts, on a bench's
   * hub, as the dashboard's motion benches stand (routes/(app)/motion):
   *
   * - the board's machine and row (`holdMachines`, `adoptRows`), the
   *   session's model, effort, permission and context (`session`), the
   *   accounts with their catalogs and sign-ins (`accountsState`, as the
   *   motion benches set it), and their readings (`adoptUsageLimits`);
   * - commands go to the bench (`standSocket`), which answers them as the
   *   hub would: the change applied (`command.ack`) and the session, or the
   *   move a pick rides, saying it;
   * - a move is answered at its route (`POST /api/instances/:id/account`,
   *   the page's `fetch` proxied for it alone, as the recent bench proxies
   *   its routes) and its row then owes it, as the hub's row frame says;
   * - a limit's check is answered at its seam (`answerLimitChecksWith`)
   *   after a second, by the `check` dial: gone (the reading then has room),
   *   still there, or not read (no machine read it, in the hub's words);
   * - the session's pulse says it is working (`takePulseFrame`), as the
   *   daemon's does inside a turn, so its status and a move's wait for the
   *   turn agree.
   *
   * The card hangs from its folder tab (HangCard `tab`, hang-card-tab-frame),
   * as PaneTabs hangs it, at the bench's width: the desk's 416px card, or
   * a phone's margin to margin. Its popovers and tooltips portal to the
   * page's body, as the app's do, on the floating layer: the card's outline
   * (HangCard's outline layer, hang-outline) stands there too, on its own
   * layer under them, so a list opened from the card stands over its foot.
   */
  import { type Account, CLAUDE_PROVIDER } from "@cawco/core/accounts";
  import type { AccountHue } from "@cawco/core/accounts/kinds";
  import {
    EFFORT_LEVELS,
    isEffortLevel,
    type ModelInfo,
  } from "@cawco/core/harness/kinds";
  import { PERMISSION_MODES } from "@cawco/core/harness/modes";
  import type { InstanceRow } from "@cawco/core/protocol";
  import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
  import type { ClaudeLimits, LimitWindow } from "@cawco/core/usage/types";
  import { onDestroy, untrack } from "svelte";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { benchClaudeReport } from "../bench-reports";
  import HangCardTabFrame from "../hang-frames/hang-card-tab-frame.svelte";
  import { standSocket } from "../hub/socket.svelte";
  import { accountsState } from "../stores/accounts.svelte";
  import { adoptRows, holdMachines } from "../stores/board.svelte";
  import { streamHost, streamState } from "../stores/ledger.svelte";
  import { session, takePulseFrame } from "../stores/sessions.svelte";
  import { adoptUsageLimits } from "../stores/usage.svelte";
  import { handleStreamMessage } from "../stream";
  import SessionDetails from "../workspace/SessionDetails.svelte";
  import { forgetLimitChecks } from "./limit-checks.svelte";
  import { startSwitch } from "./switch.svelte";

  let {
    reading,
    check,
    pending,
    context = "read",
    room = "lists",
    again = 0,
  }: {
    /** How old the stored limit readings are: fresh says no age, stale says it. */
    reading: "fresh" | "stale";
    /** What a check finds: the limit has gone, it holds, or nothing read it. */
    check: "cleared" | "still" | "unread";
    /** A move to Research ops already waits for the turn to end. */
    pending: boolean;
    /** The conversation's context: read, being read, or its read refused. */
    context?: "read" | "reading" | "refused";
    /** The frame's height: room for the open lists, or the card alone. */
    room?: "lists" | "card";
    /** Start over: each press seeds the stores again. */
    again?: number;
  } = $props();

  const ID = "ses-limit-bench";
  const MACHINE = "tower";
  const NOW = Date.now();
  const TITLE = "Fix tray chip overflow on narrow screens";

  const account = (
    id: string,
    email: string,
    hue: AccountHue,
    label: string | null,
    order: number
  ): Account => ({
    id,
    email,
    hue,
    label,
    order,
    atPlanLimit: "move",
    createdAt: NOW - 40 * 24 * HOUR_MS,
    identity: null,
    kind: "subscription",
    neverBackup: false,
    provider: CLAUDE_PROVIDER,
    reservePct: null,
  });
  const ACCOUNTS: Account[] = [
    account("jude", "jude@petralab.ai", "amber", null, 0),
    account("bewinxed", "bewinxed@gmail.com", "blue", null, 1),
    account(
      "research",
      "research-operations@petralab-industries.com",
      "green",
      "Research ops",
      2
    ),
    account(
      "design",
      "design-studio-shared-workspace@petralab-industries.com",
      "cyan",
      "Design studio and brand experiments",
      3
    ),
    account(
      "billing",
      "ops-billing+claude-max-shared@petralab-industries.com",
      "violet",
      null,
      4
    ),
  ];

  const model = (value: string, displayName: string): ModelInfo => ({
    value,
    displayName,
    supportedEffortLevels: [...EFFORT_LEVELS],
  });
  const MAX_MODELS: ModelInfo[] = [
    model("claude-opus-5-5", "Opus 5.5"),
    model("claude-opus-5-5[1m]", "Opus 5.5 (1M context)"),
    model("claude-sonnet-5-5", "Sonnet 5.5"),
    model("claude-haiku-5-5", "Haiku 5.5"),
    model("claude-fable-5-2", "Fable 5.2"),
  ];
  /** bewinxed is a Pro plan: no Fable. */
  const PRO_MODELS = MAX_MODELS.filter(
    (one) => one.value !== "claude-fable-5-2"
  );

  /** A window's kind as the hub files it: the session, the week, or a model's own week. */
  const kindOf = (
    group: "session" | "weekly",
    scopeLabel: string | null
  ): string => {
    if (scopeLabel) {
      return "weekly_scoped";
    }
    return group === "session" ? "session" : "weekly_all";
  };
  /** A window of a reading, `percent` used, resetting `inMs` from now. */
  const win = (
    group: "session" | "weekly",
    percent: number,
    inMs: number,
    scopeLabel: string | null = null
  ): LimitWindow => ({
    group,
    isActive: true,
    kind: kindOf(group, scopeLabel),
    percent,
    resetsAt: new Date(NOW + inMs).toISOString(),
    scopeLabel,
    severity: percent >= 100 ? "critical" : "normal",
  });
  /** An account's reading, its windows as read `ageMs` ago. */
  const limits = (windows: LimitWindow[], ageMs: number): ClaudeLimits => ({
    error: null,
    errorKind: null,
    extraUsage: null,
    fetchedAt: NOW - ageMs,
    stale: ageMs > HOUR_MS,
    subscription: "max",
    windows,
  });
  /** Each account's windows: bewinxed at its 5-hour limit until 15:40-ish, jude at its weekly Fable limit. */
  function readings(age: number, roomy: string[]) {
    const at = (id: string, windows: LimitWindow[]) => ({
      accountId: id,
      limits: limits(windows, age),
    });
    return {
      claude: [
        at("jude", [
          win("session", 62, 2 * HOUR_MS),
          win("weekly", 41, 3 * 24 * HOUR_MS),
          win("weekly", 100, 2 * 24 * HOUR_MS, "Fable"),
        ]),
        at(
          "bewinxed",
          roomy.includes("bewinxed")
            ? [win("session", 12, 4 * HOUR_MS)]
            : [win("session", 100, 2 * HOUR_MS + 18 * MINUTE_MS)]
        ),
        at("research", [win("session", 29, 3 * HOUR_MS)]),
        at("design", [win("session", 45, HOUR_MS)]),
        at("billing", [win("session", 6, 4 * HOUR_MS)]),
      ],
      openCodeGo: [],
    };
  }

  /** The session's row on the board, owing the move `to` when one waits. */
  const row = (to: string | null, picked?: string): InstanceRow => ({
    id: ID,
    sessionId: ID,
    accountId: "jude",
    cwd: "/srv/cockpit",
    harness: "claude",
    kind: "mainline",
    launchDir: "known",
    machineId: MACHINE,
    mayStart: ["any"],
    origin: "person",
    projectId: null,
    startingSet: null,
    status: "running",
    title: TITLE,
    createdAt: NOW - 3 * HOUR_MS,
    updatedAt: NOW - MINUTE_MS,
    wroteAt: NOW - 4 * MINUTE_MS,
    turnEndedAt: null,
    seenAt: null,
    wakesItself: false,
    ...(to
      ? {
          owedMove: {
            accountId: to,
            waits: "turn",
            ...(picked ? { model: picked } : {}),
          },
        }
      : {}),
  });
  /** The move the row owes now, as the bench's hub keeps it. */
  let owed: { to: string; model?: string } | null = null;

  function seed(): void {
    forgetLimitChecks();
    holdMachines([
      {
        machineId: MACHINE,
        hostname: MACHINE,
        os: "linux-x64",
        auth: "authenticated",
        lastSeenAt: new Date(NOW).toISOString(),
        pausedUntil: null,
        pauseStopped: null,
        status: "online",
        harnesses: [benchClaudeReport],
      },
    ]);
    owed = pending ? { to: "research" } : null;
    adoptRows([row(owed?.to ?? null)]);
    const live = session(ID);
    live.machineId = MACHINE;
    live.cwd = "/srv/cockpit";
    live.harness = "claude";
    live.initialized = true;
    live.model = "claude-opus-5-5";
    live.effort = "high";
    live.permissionMode = "acceptEdits";
    live.context =
      context === "read"
        ? {
            categories: [],
            maxTokens: 200_000,
            percentage: 38,
            readAt: NOW - MINUTE_MS,
            totalTokens: 76_000,
          }
        : null;
    live.contextPending = context === "reading";
    live.contextError =
      context === "refused"
        ? "the Claude Agent SDK didn't answer within 30 s"
        : null;
    accountsState.accounts = {
      accounts: ACCOUNTS,
      bench: [],
      catalogFaults: [],
      credit: [],
      access: [],
      catalogs: ACCOUNTS.map((one) => ({
        accountId: one.id,
        defaultEfforts: {},
        models: one.id === "bewinxed" ? PRO_MODELS : MAX_MODELS,
        readAt: NOW - HOUR_MS,
      })),
      pending: [],
      readings: [],
      rebalances: [],
      routing: [],
      signins: ACCOUNTS.map((one) => ({
        accountId: one.id,
        checkedAt: NOW,
        machineId: MACHINE,
        movedAt: null,
        movedFrom: null,
        reason: null,
        refusalReach: null,
        state: "signed-in",
      })),
    };
    adoptUsageLimits(
      readings(
        reading === "stale" ? 3 * HOUR_MS + 10 * MINUTE_MS : 4 * MINUTE_MS,
        []
      )
    );
    // Inside a turn, as the daemon's pulse says it.
    takePulseFrame({
      kind: "pulse",
      instanceId: ID,
      pulse: {
        activity: "working",
        at: Date.now(),
        busy: true,
        currentTool: null,
        instanceId: ID,
        runningSubagents: 0,
      },
    });
  }

  /** The hub's word that a command `commandId` took. */
  const applied = (commandId: string): void => {
    handleStreamMessage(streamState, streamHost, {
      type: "command.ack",
      commandId,
      stage: "applied",
    });
  };

  standSocket({
    control: null,
    spawn: null,
    hub: (_instanceId, request, commandId) => {
      const live = session(ID);
      if (request.kind === "set-model" && request.intent.model) {
        const picked = request.intent.model;
        // A pick while a move waits rides the move (hub `pickWithMove`).
        if (owed) {
          owed = { ...owed, model: picked };
          adoptRows([row(owed.to, owed.model)]);
        } else {
          live.model = picked;
        }
      } else if (
        request.kind === "set-effort" &&
        isEffortLevel(request.intent.effort)
      ) {
        live.effort = request.intent.effort;
      } else if (request.kind === "set-permission-mode") {
        const { mode: said } = request.intent;
        live.permissionMode =
          PERMISSION_MODES.find((mode) => mode === said) ?? live.permissionMode;
      }
      applied(commandId);
    },
  });

  // A move, answered at its route: its row owes it from then on. A
  // limit's check, answered after a second as the `check` dial says.
  const CHECK_MS = 1000;
  onDestroy(
    standIn({
      move: (accountId) => {
        owed =
          accountId === "jude" ? null : { to: accountId, model: owed?.model };
        adoptRows([row(owed?.to ?? null, owed?.model)]);
      },
      check: (accountId) =>
        new Promise<LimitAnswer>((answer) => {
          setTimeout(() => {
            if (check === "cleared") {
              adoptUsageLimits(readings(MINUTE_MS, [accountId]));
              answer({ kind: "cleared" });
            } else if (check === "unread") {
              const named =
                ACCOUNTS.find((one) => one.id === accountId)?.email ??
                accountId;
              answer({
                kind: "unread",
                why: `${named}'s usage was not read: ${MACHINE} didn't answer within 10 s`,
              });
            } else {
              answer({ kind: "still" });
            }
          }, CHECK_MS);
        }),
    })
  );

  /** Seeds again when any of `_dials` changes: each is read here, so the effect follows it. */
  seed();
  // The app's own follower of moves (start.ts starts it): an ask settles as
  // its row owes the move, and the row says it.
  onDestroy(startSwitch());
  const seedOn = (..._dials: unknown[]): void => untrack(seed);
  // Start over, a move waiting, the readings' age or the context's: seeded again.
  $effect(() => seedOn(again, pending, reading, context));

  /** The bench's width: the frame's, so the card takes the desk's or the phone's form. */
  let width = $state(0);
  /** The frame's height: room for the open lists, or the card alone. */
  const FRAME_H = { lists: 860, card: 640 } as const;
</script>

<div
  class="w-full bg-surface-recess"
  {@attach frameSize(
    (node) => node.clientWidth,
    (next) => {
      width = next;
    }
  )}
>
  {#if width > 0}
    <HangCardTabFrame
      height={FRAME_H[room]}
      tabs={[TITLE, "Release notes"]}
      {width}
    >
      <SessionDetails
        dir={1}
        href={`/session/${ID}`}
        onclose={() => undefined}
        sessionId={ID}
        title={TITLE}
      />
    </HangCardTabFrame>
  {/if}
</div>
