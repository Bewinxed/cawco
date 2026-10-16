<script lang="ts">
  /**
   * DELEGATE TRAY BENCH: the delegate tray's row (transcript/DelegateTray),
   * no hub. The real SessionPane and the group's composer lent to it as
   * PaneLeaf lends it, over a conversation whose plan has eight steps and
   * which has twelve delegates working: running, starting, waiting on a
   * heavy-run slot (a long state that has to truncate in its chip) and
   * queued behind files another item owns. Only the client's state is
   * seeded (dev's `__cawcoDebug`).
   *
   * `?theme=dark` draws it at night; `?case=` (1r, 1f, 3r2f, 5f, 7r13f,
   * 20r) seeds running and failed delegates instead of the twelve.
   */
  import type { SessionPulse, WorkItemSummary } from "@cawco/core";
  import { onMount } from "svelte";
  import { blankSession } from "#lib/cawco/client.svelte.js";
  import type { HeldPlan } from "#lib/cawco/plan.js";
  import SessionPane from "#lib/cawco/SessionPane.svelte";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { entered } from "#lib/cawco/transcript/tray.svelte.js";
  import type { Message } from "#lib/cawco/types.js";
  import { composerBindings } from "#lib/cawco/workspace/composer-dock.svelte.js";
  import { theme } from "#lib/theme.svelte.js";
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
      title: "Check the Telegram bridge auth",
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
      "Twelve are out. Three wait for a heavy-run slot on the build machine and two are queued behind files another item owns; the rest are running.",
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
          pulses: Record<string, SessionPulse>;
          sessions: Record<string, ReturnType<typeof blankSession>>;
          workItems: Record<string, WorkItemSummary>;
          plans: Record<string, HeldPlan>;
        };
      };
    }
  ).__cawcoDebug;

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
  debug.state.sessions[ID] = session;
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
   * `?case=` seeds the tray's cases instead (the shelf's spec,
   * tray-shelf): running and failed delegates, in creation order, the
   * failures spread among the running so each has later items.
   */
  const CASES: Record<string, { running: number; failed: number }> = {
    "1r": { running: 1, failed: 0 },
    "1f": { running: 0, failed: 1 },
    "3r2f": { running: 3, failed: 2 },
    "5f": { running: 0, failed: 5 },
    "7r13f": { running: 7, failed: 13 },
    "20r": { running: 20, failed: 0 },
  };
  const ERRORS = [
    "bun run typecheck exited 2: 3 errors in apps/dashboard",
    "The machine went away while the landing gate ran.",
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

  const scheme = $derived(
    page.url.searchParams.get("theme") === "dark" ? "dark" : "light"
  );
  $effect(() => {
    theme.set(scheme);
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
  });
</script>

<svelte:head><title>Delegate tray | CawCo</title></svelte:head>

<div class="bench" data-delegate-tray>
  <div data-slot="leaf" class="leaf">
    <div data-slot="stack" class="stack">
      <div data-slot="pane" class="pane">
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
        class="dock"
        style:width="{lent.transcriptShare * 100}%"
      >
        <Composer
          agentName={lent.agentName}
          ask={lent.ask}
          busy={lent.busy}
          commands={lent.commands}
          draft={lent.draft}
          mentionsFrom={lent.mentionsFrom}
          onfoot={lent.onfoot}
          oninterruptsend={lent.oninterruptsend}
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
  </div>
</div>

<style>
  /* Over the shell: a conversation's group as the workspace lays one out
     (PaneLeaf `.leaf`, `.stack`, `.dock`), over the whole window. */
  .bench {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: flex;
    flex-direction: column;
    color: var(--ink-strong);
  }
  .leaf {
    container: leaf / inline-size;
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-recess);
  }
  .stack {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }
  .pane {
    position: absolute;
    inset: 0;
    display: flex;
  }
  .dock {
    position: absolute;
    inset: 0 auto 0 0;
    z-index: 1;
    pointer-events: none;
  }
</style>
