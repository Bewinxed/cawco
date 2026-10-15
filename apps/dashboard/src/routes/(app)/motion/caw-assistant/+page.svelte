<script lang="ts">
  /**
   * PREVIEW ONLY (uncommitted): Caw's dock on the project page, every state
   * of the design (Caw assistant, states 1–9 and the threads menu) on mock
   * data. The page is the real project page (routes/(app)/project/[id]) with
   * the change in place; a stand-in hub answers it (stand-in.ts), and each
   * state seeds the client's store (dev's `__cawcoDebug`) and remounts it.
   *
   * `?state=<first|typing|sent|thinking|streaming|replied|failed|off|settings|threads>`
   * opens on one state; `?foot=composer` puts the session Composer at the
   * dock's foot from the first open (the one choice the design leaves).
   */
  import type { SessionPulse, ThreadMessage, ThreadSummary } from "@cawco/core";
  import { onMount, tick, untrack } from "svelte";
  import { blankSession } from "#lib/cawco/client.svelte.js";
  import {
    type CawDockFoot,
    cawDock,
  } from "#lib/cawco/project/caw-dock.svelte.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ProjectPage from "../../project/[id]/+page.svelte";
  import {
    ASKED,
    LEAD_ID,
    PROJECT_ID,
    REPLY,
    SCENARIOS,
    type Scenario,
    seedOf,
    standIn,
  } from "./stand-in";

  let { data } = $props();

  const debug = (
    globalThis as unknown as {
      __cawcoDebug: {
        state: {
          pulses: Record<string, SessionPulse>;
          sessions: Record<string, ReturnType<typeof blankSession>>;
          threads: Record<string, ThreadSummary[]>;
          threadMessages: Record<string, ThreadMessage[]>;
        };
      };
    }
  ).__cawcoDebug;

  const known = (value: string | null): value is Scenario =>
    SCENARIOS.some((each) => each.value === value);
  const asked = untrack(() => page.url.searchParams.get("state"));
  let scenario = $state<Scenario>(known(asked) ? asked : "first");
  let foot = $state<CawDockFoot>(
    untrack(() => page.url.searchParams.get("foot")) === "composer"
      ? "composer"
      : "field"
  );
  /** The state the page is mounted on: it remounts on every change. */
  let mounted = $state("");
  let streamTimer: ReturnType<typeof setInterval> | undefined;

  /** Seeds the hub and the store for a state, then mounts the page on it. */
  function apply(next: Scenario, nextFoot: CawDockFoot) {
    clearInterval(streamTimer);
    const seed = seedOf(next);
    standIn.seed = seed;
    standIn.holdSends = next === "sent" || next === "failed";
    debug.state.threads[PROJECT_ID] = seed.threads;
    for (const id of Object.keys(debug.state.threadMessages)) {
      delete debug.state.threadMessages[id];
    }
    for (const [id, rows] of Object.entries(seed.messages)) {
      debug.state.threadMessages[id] = rows;
    }
    const lead = blankSession(LEAD_ID);
    lead.busy = seed.busy;
    lead.initialized = true;
    debug.state.sessions[LEAD_ID] = lead;
    debug.state.pulses[LEAD_ID] = {
      activity: seed.busy ? "working" : "idle",
      at: Date.now(),
      busy: seed.busy,
      currentTool: null,
      instanceId: LEAD_ID,
      runningSubagents: 0,
    } as SessionPulse;
    cawDock.set(PROJECT_ID, true);
    cawDock.foot = nextFoot;
    mounted = `${next}:${nextFoot}`;
    const url = new URL(page.url.href);
    url.searchParams.set("state", next);
    url.searchParams.set("foot", nextFoot);
    goto(url, { shallow: true, replace: true }).catch(() => undefined);
    // biome-ignore lint/complexity/noVoid: the state's own acts run once the page stands
    void act(next);
  }

  /** Waits for what a selector names to stand in the page. */
  async function standing<T extends Element>(selector: string): Promise<T> {
    for (let i = 0; i < 200; i += 1) {
      const found = document.querySelector<T>(selector);
      if (found) {
        return found;
      }
      // biome-ignore lint/performance/noAwaitInLoops: polling one frame at a time
      await new Promise((done) => requestAnimationFrame(done));
    }
    throw new Error(`${selector} never stood`);
  }

  /** Words into the dock's field as a person types them. */
  async function type(words: string): Promise<HTMLTextAreaElement> {
    const field = await standing<HTMLTextAreaElement>(
      "[data-caw-dock] textarea:not([aria-hidden])"
    );
    field.focus();
    const set = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    set?.call(field, words);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    await tick();
    return field;
  }

  /** What each state does once the page stands: the person's own acts. */
  async function act(next: Scenario) {
    await tick();
    // Caw's view read: his head says what he is doing.
    await standing("[data-caw-dock] .side-head");
    switch (next) {
      case "typing":
        await type(ASKED);
        break;
      case "sent": {
        const field = await type(ASKED);
        field.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
        );
        break;
      }
      case "streaming": {
        const words = REPLY.split(" ");
        let at = 0;
        streamTimer = setInterval(() => {
          at += 1;
          const lead = debug.state.sessions[LEAD_ID];
          if (lead) {
            lead.streaming = words.slice(0, at).join(" ");
          }
          // Held three quarters through, mid-sentence, as the design draws it.
          if (at >= Math.round(words.length * 0.75)) {
            clearInterval(streamTimer);
          }
        }, 70);
        break;
      }
      case "settings":
        (
          await standing<HTMLButtonElement>(
            '[data-caw-dock] button[aria-label="Caw\'s settings"]'
          )
        ).click();
        break;
      case "threads": {
        const trigger = await standing<HTMLElement>(
          "[data-caw-dock] .thread-pick"
        );
        trigger.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            button: 0,
            pointerType: "mouse",
          })
        );
        trigger.dispatchEvent(
          new PointerEvent("pointerup", {
            bubbles: true,
            button: 0,
            pointerType: "mouse",
          })
        );
        break;
      }
      default:
        break;
    }
  }

  onMount(() => {
    apply(scenario, foot);
    return () => clearInterval(streamTimer);
  });
</script>

<svelte:head><title>Caw assistant · preview</title></svelte:head>

{#key mounted}
  {#if mounted}
    <ProjectPage {data} />
  {/if}
{/key}

<div class="switch" data-preview-switch>
  <Select.Root
    onValueChange={(value) => {
      if (known(value)) {
        scenario = value;
        apply(scenario, foot);
      }
    }}
    type="single"
    value={scenario}
  >
    <Select.Trigger aria-label="State" class="state-pick" size="sm">
      {SCENARIOS.find((each) => each.value === scenario)?.label}
    </Select.Trigger>
    <Select.Content>
      {#each SCENARIOS as each (each.value)}
        <Select.Item label={each.label} value={each.value} />
      {/each}
    </Select.Content>
  </Select.Root>
  <span class="label">Foot before the first send</span>
  <Tabs
    onValueChange={(value) => {
      foot = value === "composer" ? "composer" : "field";
      apply(scenario, foot);
    }}
    size="compact"
    value={foot}
  >
    <TabsList aria-label="Foot before the first send">
      <TabItem label="CawField" value="field" />
      <TabItem label="Composer" value="composer" />
    </TabsList>
  </Tabs>
</div>

<style>
  /* The preview's own control, over the board's foot: not part of the design. */
  .switch {
    position: fixed;
    inset-block-end: var(--space-4);
    inset-inline-start: calc(var(--c-sidebar-w) + var(--space-5));
    z-index: 30;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);
  }
  .label {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
