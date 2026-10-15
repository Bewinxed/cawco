<script lang="ts">
  /**
   * PREVIEW ONLY (not for main): Caw's floating panel on the project page,
   * each of its states on mock data. The page is the real project page
   * (routes/(app)/project/[id]) as it ships; only the hub is a stand-in
   * (stand-in.ts), and each state seeds the client's store (dev's
   * `__cawcoDebug`), remounts the page and does what the person would (a
   * press on Caw, a starter, a send). The state picker is the one thing
   * here that does not ship, and it stands outside the page, over its foot.
   *
   * `?state=<first|typing|sent|thinking|streaming|replied|failed|off|earlier|card|board|view|offturn|capped>`
   * opens on one state.
   */
  import type { SessionPulse, ThreadMessage, ThreadSummary } from "@cawco/core";
  import { onMount, tick, untrack } from "svelte";
  import { blankSession } from "#lib/cawco/client.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import ProjectPage from "../../project/[id]/+page.svelte";
  import {
    EMPTY_TASKS,
    LEAD_ID,
    PROJECT_ID,
    REPLY,
    SCENARIOS,
    type Scenario,
    STAGES,
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
  /** The state the page is mounted on: it remounts on every change. */
  let mounted = $state("");
  let streamTimer: ReturnType<typeof setInterval> | undefined;

  /** The empty board's data: its tasks read empty. */
  const shown = $derived(
    mounted === "board"
      ? { ...data, tasks: { ok: true as const, value: EMPTY_TASKS } }
      : data
  );

  /** Seeds the hub and the store for a state, then mounts the page on it. */
  function apply(next: Scenario) {
    clearInterval(streamTimer);
    const seed = seedOf(next);
    standIn.seed = seed;
    standIn.holdSends = next === "sent";
    standIn.emptyBoard = next === "board";
    standIn.capped = next === "capped";
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
    mounted = "";
    // biome-ignore lint/complexity/noVoid: the state's own acts run once the page stands
    void mount(next);
  }

  /** Mounts the page on a state, then does what the person would there. */
  async function mount(next: Scenario) {
    await tick();
    mounted = next;
    const url = new URL(page.url.href);
    url.searchParams.set("state", next);
    url.searchParams.delete("foot");
    goto(url, { shallow: true, replace: true }).catch(() => undefined);
    await act(next);
  }

  /** Waits for what a selector names to stand in the page. */
  async function standing<T extends Element>(selector: string): Promise<T> {
    for (let i = 0; i < 300; i += 1) {
      const found = document.querySelector<T>(selector);
      if (found) {
        return found;
      }
      // biome-ignore lint/performance/noAwaitInLoops: polling one frame at a time
      await new Promise((done) => requestAnimationFrame(done));
    }
    throw new Error(`${selector} never stood`);
  }

  /** A press: every control the states press acts on its click. */
  function press(target: Element) {
    (target as HTMLElement).click();
  }

  /** His panel, opened by a press on him in the head. */
  async function openPanel() {
    // His view read: the seat says what he is doing.
    await standing(".caw-seat");
    await new Promise((done) => setTimeout(done, 300));
    press(await standing<HTMLElement>(".caw-seat"));
    return standing<HTMLElement>("[data-caw-panel]");
  }

  /** Words into the panel's composer as a person types them. */
  async function type(words: string): Promise<HTMLTextAreaElement> {
    const field = await standing<HTMLTextAreaElement>(
      "[data-caw-panel] textarea:not([aria-hidden])"
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
    if (next === "board") {
      return;
    }
    if (next === "view") {
      // The strip's button, once the strip stands in the bar.
      await standing(".strip button");
      await new Promise((done) => setTimeout(done, 300));
      [...document.querySelectorAll<HTMLElement>(".strip button")]
        .find((each) => each.textContent?.trim() === "Ask Caw for a view")
        ?.click();
      return;
    }
    await openPanel();
    switch (next) {
      case "typing": {
        const chip = await standing<HTMLElement>(
          "[data-caw-panel] .caw-starters .kit-chip"
        );
        press(chip);
        break;
      }
      case "sent": {
        const field = await type(STAGES.starters[0]?.text ?? "");
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
          // Held three quarters through, mid-sentence.
          if (at >= Math.round(words.length * 0.75)) {
            clearInterval(streamTimer);
          }
        }, 70);
        break;
      }
      case "earlier":
        press(
          await standing<HTMLElement>(
            '[data-caw-panel] button[aria-label="New thread"]'
          )
        );
        break;
      case "card":
        press(await standing<HTMLElement>("[data-caw-panel] button.name"));
        break;
      // His card, then its switch: his own turn's line asks first.
      case "offturn":
        press(await standing<HTMLElement>("[data-caw-panel] button.name"));
        press(
          await standing<HTMLElement>(
            '.caw-lead-card button[aria-label="Turn off Caw"]'
          )
        );
        break;
      default:
        break;
    }
  }

  onMount(() => {
    apply(scenario);
    return () => clearInterval(streamTimer);
  });
</script>

<svelte:head><title>Caw's panel · preview</title></svelte:head>

{#key mounted}
  {#if mounted}
    <ProjectPage data={shown} />
  {/if}
{/key}

<div class="switch" data-preview-switch>
  <Select.Root
    onValueChange={(value) => {
      if (known(value)) {
        scenario = value;
        apply(scenario);
      }
    }}
    type="single"
    value={scenario}
  >
    <Select.Trigger aria-label="State" size="sm">
      {SCENARIOS.find((each) => each.value === scenario)?.label}
    </Select.Trigger>
    <Select.Content>
      {#each SCENARIOS as each (each.value)}
        <Select.Item label={each.label} value={each.value} />
      {/each}
    </Select.Content>
  </Select.Root>
</div>

<style>
  /* The preview's own control, outside the page: not part of the design. */
  .switch {
    position: fixed;
    inset-block-end: var(--space-4);
    inset-inline-end: var(--space-5);
    z-index: 30;
    padding: var(--space-2);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);
  }
</style>
