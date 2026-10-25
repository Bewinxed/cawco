<script lang="ts">
  /**
   * DELEGATE TRAY BENCH: the delegate tray's row (transcript/DelegateTray),
   * no hub. The real SessionPane and the group's composer lent to it as
   * PaneLeaf lends it, over a conversation whose plan has eight steps and
   * which has twelve delegates working: running, starting, waiting on a
   * the Mac's build slot (a long state that has to truncate in its chip) and
   * queued behind files another item owns. Only the client's state is
   * seeded (dev's `__cawcoDebug`).
   *
   * In the reader's theme; `?case=` (4, 11, 1r, 1f, 3r2f, 5f, 7r13f,
   * 20r) seeds running and failed delegates instead of the twelve.
   *
   * `?details` stands the session's details card over the conversation, as
   * its tab's hover hangs it (the real SessionDetails), the session on
   * Bypass on a connected machine whose Claude takes every mode and three
   * efforts: its mode chip opens the picker, Full Send's question in it,
   * and its effort chip the sibling the picker's surface glides to.
   */
  import {
    CAPABILITIES_NONE,
    type InstanceRow,
    type SessionPulse,
    type WorkItemSummary,
  } from "@cawco/core";
  import { onMount } from "svelte";
  import { blankSession, cawco } from "#lib/cawco/client.svelte.js";
  import type { HeldPlan } from "#lib/cawco/plan.js";
  import SessionPane from "#lib/cawco/SessionPane.svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
  import { askOpenAt } from "#lib/cawco/transcript/open-at.svelte.js";
  import { entered } from "#lib/cawco/transcript/tray.svelte.js";
  import type { Message } from "#lib/cawco/types.js";
  import { composerBindings } from "#lib/cawco/workspace/composer-dock.svelte.js";
  import SessionDetails from "#lib/cawco/workspace/SessionDetails.svelte";
  import { page } from "$app/state";

  const ID = "delegate-tray-bench";
  const now = Date.now();

  /** Twelve delegates, oldest first: what each is called and how it stands. */
  const WORK: {
    title: string;
    state: "starting" | "running";
    slot?: boolean;
    owns?: string[];
  }[] = [
    { title: "Restore tab feet, Chrome-style", state: "running" },
    {
      title: "Bake the decision page kit",
      state: "running",
      slot: true,
    },
    {
      title: "Profile the board's first paint",
      state: "running",
      slot: true,
    },
    { title: "Port the plan ring to iOS", state: "starting" },
    { title: "Measure transcript pin drift", state: "running" },
    {
      title: "Restyle the effort chip",
      state: "starting",
      owns: ["apps/dashboard/src/lib/cawco/effort/**"],
    },
    { title: "Sweep stale workspaces", state: "running" },
    {
      title: "Check the push device auth",
      state: "running",
      slot: true,
    },
    { title: "Index the delegate events", state: "running" },
    { title: "Cache the machine list", state: "starting" },
    {
      title: "Split the session card",
      state: "starting",
      owns: ["apps/dashboard/src/lib/cawco/card/**"],
    },
    { title: "Fix the skeleton sweep", state: "running" },
  ];

  const SAID: [string, string][] = [
    [
      "Hand the tab and plan work out, one delegate each.",
      "Twelve are out. Three wait for the Mac's build slot and two are queued behind files another item owns; the rest are running.",
    ],
    [
      "Tell me when any of them needs me.",
      "I will. Each one's chip on the tray says how it stands, and a question raises it.",
    ],
  ];
  function history(): Message[] {
    const rows: Message[] = [];
    for (let n = 0; n < 24; n += 1) {
      const [ask, answer] = SAID[n % SAID.length];
      const at = new Date(now - (48 - n * 2) * 60_000).toISOString();
      rows.push({
        id: `${ID}-user-${n}`,
        instanceId: ID,
        type: "user",
        content: ask,
        timestamp: at,
      } as Message);
      rows.push({
        id: `${ID}-asst-${n}`,
        instanceId: ID,
        type: "assistant",
        content: answer,
        timestamp: at,
      } as Message);
    }
    return rows;
  }

  const debug = (
    globalThis as unknown as {
      __cawcoDebug: {
        state: {
          status: string;
          pulses: Record<string, SessionPulse>;
          sessions: Record<string, ReturnType<typeof blankSession>>;
          workItems: Record<string, WorkItemSummary>;
          plans: Record<string, HeldPlan>;
        };
        adoptInstances: (rows: InstanceRow[]) => void;
      };
    }
  ).__cawcoDebug;

  // Running, as the hub would list it: an ask parked on it is the
  // conversation's own (its composer grows into it over its transcript),
  // never an ask standing alone with no session behind it.
  debug.adoptInstances([
    {
      id: ID,
      cwd: "/bench",
      harness: "claude",
      kind: "mainline",
      launchDir: "known",
      machineId: "bench",
      sessionId: null,
      status: "running",
    },
  ]);
  debug.state.pulses[ID] = {
    activity: "working",
    at: now,
    busy: true,
    currentTool: null,
    instanceId: ID,
    runningSubagents: 0,
  };
  const session = blankSession(ID);
  session.machineId = "bench";
  session.cwd = "/bench";
  session.messages = history();
  session.initialized = true;
  // What its `/` menu lists: a skill and two built-ins.
  session.commands = {
    names: ["clean-copy", "compact", "review"],
    skills: ["clean-copy"],
    detailed: null,
    at: now,
  };
  debug.state.sessions[ID] = session;
  /** The details card stands over the conversation (`?details`). */
  const details = page.url.searchParams.has("details");
  if (details) {
    session.harness = "claude";
    session.permissionMode = "bypassPermissions";
    session.model = "claude-opus-4-5";
    session.effort = "medium";
    cawco.machines.push({
      auth: "unknown",
      harnesses: [
        {
          auth: "authenticated",
          capabilities: {
            ...CAPABILITIES_NONE,
            effort: true,
            permissionModes: [
              "default",
              "plan",
              "acceptEdits",
              "bypassPermissions",
              "fullSend",
            ],
          },
          harness: "claude",
          installed: true,
          models: [
            {
              displayName: "Opus 4.5",
              value: "claude-opus-4-5",
              supportedEffortLevels: ["low", "medium", "high"],
            },
          ],
        },
      ],
      hostname: "bench",
      lastSeenAt: null,
      machineId: "bench",
      os: "linux",
      pausedUntil: null,
      pauseStopped: null,
      status: "online",
    });
  }
  debug.state.plans[ID] = {
    rev: 1,
    plan: {
      source: "cawco",
      steps: Array.from({ length: 8 }, (_, i) => ({
        id: `${i}`,
        content: `Step ${i + 1}`,
        depth: 0,
        status: "pending" as const,
      })),
    },
  };
  /**
   * `?case=` seeds the tray's cases instead: running and failed delegates,
   * in creation order, the failures spread among the running so each has
   * later items. `4` and `11` are the composer-layers spec's (four
   * delegates, one of them failed; eleven, three failed).
   */
  const CASES: Record<string, { running: number; failed: number }> = {
    "4": { running: 3, failed: 1 },
    "11": { running: 8, failed: 3 },
    "1r": { running: 1, failed: 0 },
    "1f": { running: 0, failed: 1 },
    "3r2f": { running: 3, failed: 2 },
    "5f": { running: 0, failed: 5 },
    "7r13f": { running: 7, failed: 13 },
    "20r": { running: 20, failed: 0 },
  };
  const ERRORS = [
    "bun run typecheck exited 2: 3 errors in apps/dashboard",
    "The machine went away while the merge checks ran.",
    "Budget reached: 40 turns.",
    "finish_item: the probe spec failed 2 of 9 assertions",
    "Rebase onto main conflicted in DelegateTray.svelte",
  ];
  const seeded = CASES[page.url.searchParams.get("case") ?? ""];
  const plan: (typeof WORK)[number][] = seeded
    ? Array.from(
        { length: seeded.running + seeded.failed },
        (_, i): (typeof WORK)[number] => ({
          title: `${WORK[i % WORK.length].title}${i >= WORK.length ? " again" : ""}`,
          state: "running",
        })
      )
    : WORK;
  /** Which of the seeded delegates failed: every other one first, then the rest. */
  const failedAt = new Set<number>();
  if (seeded) {
    const total = seeded.running + seeded.failed;
    for (let i = 0; i < total && failedAt.size < seeded.failed; i += 2) {
      failedAt.add(i);
    }
    for (let i = total - 1; i >= 0 && failedAt.size < seeded.failed; i -= 1) {
      failedAt.add(i);
    }
  }
  plan.forEach((work, i) => {
    const failed = failedAt.has(i);
    const createdAt = now - (60 - i) * 60_000;
    const item: WorkItemSummary = {
      id: `wi-tray-${i}`,
      instanceId: `ds-tray-${i}`,
      parentInstanceId: ID,
      leadInstanceId: null,
      machinePaused: null,
      stalled: null,
      title: work.title,
      state: failed ? "failed" : work.state,
      createdAt,
      endedAt: failed ? createdAt + (20 + i) * 60_000 : null,
      dismissedAt: null,
      dismissReason: null,
      replacedBy: null,
      firstLines: {
        brief: work.title,
        result: "",
        error: failed ? ERRORS[i % ERRORS.length] : "",
      },
      queued: work.owns ? { owns: work.owns, paused: null } : null,
      checkQueue: work.slot
        ? {
            words: "queued for the Mac's build slot behind 2 builds",
            since: now - 4 * 60_000,
          }
        : null,
      waitReason: null,
      waitUntil: null,
    };
    debug.state.workItems[item.id] = item;
    entered.set(item.instanceId, "none");
  });

  // The card's live controls take changes while the machine is connected
  // and the session runs on it. The page opens its socket to the bench's
  // stand-in, which never sends a board (the page stays connecting): the
  // bench says the hub is reached, after the page has said it is reaching.
  $effect(() => {
    if (details && cawco.status !== "connected") {
      debug.state.status = "connected";
    }
  });

  /** The conversation's binding, lent to the group's composer as PaneLeaf lends it. */
  const lent = $derived(composerBindings.get(ID));

  onMount(() => () => {
    for (const id of Object.keys(debug.state.workItems)) {
      if (id.startsWith("wi-tray-")) {
        delete debug.state.workItems[id];
      }
    }
    delete debug.state.sessions[ID];
    delete debug.state.plans[ID];
    delete debug.state.pulses[ID];
    debug.adoptInstances([]);
    if (details) {
      cawco.machines.splice(
        cawco.machines.findIndex((one) => one.machineId === "bench"),
        1
      );
    }
  });
</script>

<svelte:head><title>Delegate tray | CawCo</title></svelte:head>

<!-- Over the shell: a conversation's group as the workspace lays one out
     (PaneLeaf `.leaf`, `.stack`, `.dock`), over the whole window. -->
<div
  class="fixed inset-0 z-(--layer-bench) flex flex-col text-ink-strong"
  data-delegate-tray
>
  <div
    data-slot="leaf"
    class="@container/leaf relative flex min-h-0 min-w-0 flex-auto flex-col overflow-hidden bg-surface-recess"
  >
    <div
      data-slot="stack"
      class="relative flex min-h-0 min-w-0 flex-auto overflow-hidden"
    >
      <div data-slot="pane" class="absolute inset-0 flex">
        <SessionPane
          active
          browsing={null}
          browsingCwd=""
          browsingHarness="claude"
          focused
          viewId={ID}
          visible
        />
      </div>
    </div>
    {#if lent}
      <div
        data-slot="dock"
        class="pointer-events-none absolute inset-y-0 start-0 z-1 w-(--transcript-share)"
        style:--transcript-share="{lent.transcriptShare * 100}%"
      >
        <Composer
          fleet={composerFleet}
          agentName={lent.agentName}
          ask={lent.ask}
          busy={lent.busy}
          commands={lent.commands}
          draft={lent.draft}
          mentionsFrom={lent.mentionsFrom}
          onfoot={lent.onfoot}
          onmenu={lent.onmenu}
          onstop={lent.onstop}
          onsubmit={lent.onsubmit}
          paneVisible={lent.paneVisible}
          perch={lent.perch}
          placeholder={lent.placeholder}
          planRing={lent.planRing}
          recallOf={lent.recallOf}
          sendAgain={lent.sendAgain}
          sendError={lent.sendError}
          sending={lent.sending}
          showing={ID}
          suggest={lent.suggest}
          trayRows={[
            { delegatesOf: lent.delegatesOf, id: ID, prompts: lent.prompts },
          ]}
        />
      </div>
    {/if}
    {#if details}
      <!-- As its tab's hover hangs it: Caw's lead card's width, on the
           floating surface, over the conversation's top. -->
      <div class="pointer-events-none absolute inset-x-space-3 top-space-3 z-2">
        <div
          data-slot="details-card"
          class="pointer-events-auto w-c-lead-card-w max-w-full overflow-hidden rounded-lg border border-border-control bg-surface-raised shadow-overlay"
        >
          <SessionDetails
            dir={1}
            href="/motion/delegate-tray?details"
            onclose={() => undefined}
            sessionId={ID}
            title="Delegate tray bench"
          />
        </div>
      </div>
    {/if}
  </div>
</div>
