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
   *   still there, or its machine offline.
   *
   * The card's popovers and tooltips portal into a layer inside the frame
   * (bits-ui `BitsConfig` `defaultPortalTo`, as DialsRoot does), so the
   * stage frames them. The layer contains its layout (`contain: layout`):
   * the surfaces bits-ui places `fixed` are placed in it, never in the
   * stage's own canvas, a size container whose layout containment made
   * them part of its scrollable overflow, so an open popover grew the page
   * and its scrollbar shifted the card. Its overflow is clipped, inside a
   * frame tall enough for every list.
   */
  import { type Account, CLAUDE_PROVIDER } from "@cawco/core/accounts";
  import type { AccountHue } from "@cawco/core/accounts/kinds";
  import {
    EFFORT_LEVELS,
    isEffortLevel,
    type ModelInfo,
    PERMISSION_MODES,
  } from "@cawco/core/harness/kinds";
  import type { InstanceRow } from "@cawco/core/protocol";
  import { HOUR_MS, MINUTE_MS } from "@cawco/core/time";
  import type { ClaudeLimits, LimitWindow } from "@cawco/core/usage/types";
  import { BitsConfig } from "bits-ui";
  import { onDestroy, untrack } from "svelte";
  import { z } from "zod";
  import { benchClaudeReport } from "../bench-reports";
  import { standSocket } from "../hub/socket.svelte";
  import { accountsState } from "../stores/accounts.svelte";
  import { adoptRows, holdMachines } from "../stores/board.svelte";
  import { streamHost, streamState } from "../stores/ledger.svelte";
  import { session } from "../stores/sessions.svelte";
  import { adoptUsageLimits } from "../stores/usage.svelte";
  import { handleStreamMessage } from "../stream";
  import { type MeterLook, provideMeterLook } from "../usage/meter-look";
  import SessionDetails from "../workspace/SessionDetails.svelte";
  import {
    answerLimitChecksWith,
    forgetLimitChecks,
    type LimitAnswer,
  } from "./limit-checks.svelte";
  import { startSwitch } from "./switch.svelte";

  let {
    reading,
    check,
    pending,
    meter = "track",
    room = "lists",
    again = 0,
  }: {
    /** How old the stored limit readings are: fresh says no age, stale says it. */
    reading: "fresh" | "stale";
    /** What the provider answers a check: the limit has gone, it holds, or the machine is offline. */
    check: "cleared" | "still" | "offline";
    /** A move to Research ops already waits for the turn to end. */
    pending: boolean;
    /** How the stats strip's meters draw, while the owner picks one (usage/meter-look). */
    meter?: MeterLook;
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
    live.context = {
      categories: [],
      maxTokens: 200_000,
      percentage: 38,
      readAt: NOW - MINUTE_MS,
      totalTokens: 76_000,
    };
    accountsState.accounts = {
      accounts: ACCOUNTS,
      bench: [],
      catalogFaults: [],
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
  }

  /** The hub's word that a command `commandId` took. */
  const applied = (commandId: string): void => {
    handleStreamMessage(streamState, streamHost, {
      type: "command.ack",
      commandId,
      stage: "applied",
    });
  };

  /** What a setting command's intent names. */
  const BenchIntent = z.object({
    effort: z.string().optional(),
    mode: z.string().optional(),
    model: z.string().optional(),
  });

  standSocket({
    control: null,
    spawn: null,
    hub: (_instanceId, kind, intent, commandId) => {
      const live = session(ID);
      const said = BenchIntent.parse(intent);
      if (kind === "set-model" && said.model) {
        // A pick while a move waits rides the move (hub `pickWithMove`).
        if (owed) {
          owed = { ...owed, model: said.model };
          adoptRows([row(owed.to, owed.model)]);
        } else {
          live.model = said.model;
        }
      } else if (kind === "set-effort" && isEffortLevel(said.effort)) {
        live.effort = said.effort;
      } else if (kind === "set-permission-mode") {
        live.permissionMode =
          PERMISSION_MODES.find((mode) => mode === said.mode) ??
          live.permissionMode;
      }
      applied(commandId);
    },
  });

  // A move, answered at its route: its row owes it from then on.
  const fetchWas = window.fetch;
  const MOVE = /\/api\/instances\/[^/]+\/account$/u;
  /** What a move's request carries. */
  const MoveBody = z.object({ accountId: z.string() });
  window.fetch = new Proxy(fetchWas, {
    apply: (_fetch, _this, [input, init]: Parameters<typeof fetch>) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!(
        MOVE.test(new URL(url, location.href).pathname) &&
        init?.method === "POST"
      )) {
        return fetchWas(input, init);
      }
      const { accountId } = MoveBody.parse(JSON.parse(String(init.body)));
      owed =
        accountId === "jude" ? null : { to: accountId, model: owed?.model };
      adoptRows([row(owed?.to ?? null, owed?.model)]);
      return Promise.resolve(Response.json({ ok: true }));
    },
  });
  onDestroy(() => {
    window.fetch = fetchWas;
  });

  // A limit's check, answered after a second as the `check` dial says.
  const CHECK_MS = 1000;
  answerLimitChecksWith(
    (accountId) =>
      new Promise<LimitAnswer>((answer) => {
        setTimeout(() => {
          if (check === "cleared") {
            adoptUsageLimits(readings(MINUTE_MS, [accountId]));
            answer({ kind: "cleared" });
          } else {
            answer(
              check === "offline"
                ? { kind: "unasked", host: MACHINE }
                : { kind: "still" }
            );
          }
        }, CHECK_MS);
      })
  );

  /** Seeds again when any of `_dials` changes: each is read here, so the effect follows it. */
  provideMeterLook(() => meter);
  seed();
  // The app's own follower of moves (start.ts starts it): an ask settles as
  // its row owes the move, and the row says it.
  onDestroy(startSwitch());
  const seedOn = (..._dials: unknown[]): void => untrack(seed);
  // Start over, a move waiting, or the readings' age: seeded again.
  $effect(() => seedOn(again, pending, reading));

  /** The portal's target: the popovers and tooltips draw inside the frame. */
  let layer = $state<HTMLElement>();
</script>

<div
  class="relative min-h-200 bg-surface-recess p-space-3 data-card:min-h-0 desk:p-space-8"
  data-card={room === "card" || undefined}
>
  <BitsConfig defaultPortalTo={layer}>
    <div
      class="mx-auto w-full max-w-104 overflow-clip rounded-lg border border-border-control bg-surface-raised shadow-md desk:mx-0"
    >
      <SessionDetails
        dir={1}
        href={`/session/${ID}`}
        onclose={() => undefined}
        sessionId={ID}
        title={TITLE}
      />
    </div>
  </BitsConfig>
  <div
    bind:this={layer}
    class="pointer-events-none absolute inset-0 overflow-clip contain-layout *:pointer-events-auto"
    data-slot="layer"
  ></div>
</div>
