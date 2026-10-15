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
   * `?theme=dark` draws it at night.
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
  WORK.forEach((work, i) => {
    const item: WorkItemSummary = {
      id: `wi-tray-${i}`,
      instanceId: `ds-tray-${i}`,
      parentInstanceId: ID,
      leadInstanceId: null,
      machinePaused: null,
      title: work.title,
      state: work.state,
      createdAt: now - (60 - i) * 60_000,
      endedAt: null,
      dismissedAt: null,
      firstLines: { brief: work.title, result: "", error: "" },
      queued: work.owns ? { owns: work.owns, paused: null } : null,
      checkQueue: work.slot
        ? {
            words: "queued for a heavy-run slot behind 2 checks",
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
  <div class="leaf">
    <div class="stack">
      <div class="pane">
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
      <div class="dock" style:width="{lent.transcriptShare * 100}%">
        <Composer
          agentName={lent.agentName}
          ask={lent.ask}
          busy={lent.busy}
          commands={lent.commands}
          delegatesOf={lent.delegatesOf}
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
          prompts={lent.prompts}
          recallOf={lent.recallOf}
          sendAgain={lent.sendAgain}
          sendError={lent.sendError}
          sending={lent.sending}
          suggest={lent.suggest}
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
