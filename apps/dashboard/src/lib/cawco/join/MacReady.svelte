<script lang="ts" module>
  import type { MacReadinessStepId } from "@cawco/core";

  /** A row's words while its check runs. */
  const RUNNING: Record<MacReadinessStepId, string> = {
    system: "Reading macOS and Xcode",
    "ssh-xcode": "Checking if SSH may drive Xcode",
    "agent-xcode": "Checking if the agent may drive Xcode",
    "xcode-setup": "Checking Xcode's setup",
  };

  /** A row's name once it has an answer, ticked or open. `system` says its result instead. */
  const NAME: Record<MacReadinessStepId, string> = {
    system: "macOS and Xcode",
    "ssh-xcode": "SSH may drive Xcode",
    "agent-xcode": "The agent may drive Xcode",
    "xcode-setup": "Xcode set up for agents",
  };

  /** The open step's line: what the Mac will ask, and why. `system` is never a step. */
  const STEP_LINE: Record<
    Exclude<MacReadinessStepId, "system">,
    (mac: string) => string
  > = {
    "ssh-xcode": (mac) =>
      `${mac} will ask whether sshd-keygen-wrapper may control Xcode. That's how a session builds over SSH. Click Allow there.`,
    "agent-xcode": (mac) =>
      `${mac} will ask whether CawCo may control Xcode. That's how a session builds and runs the simulator. Click Allow there.`,
    "xcode-setup": (mac) =>
      `${mac} will ask for your password, once. It finishes Xcode's first run and turns on developer mode and UI automation, which need an admin.`,
  };

  const CONTINUE = "Continue on the Mac";
  const WAITING = "Waiting on the Mac…";
  /** How long a prompt may go unanswered before the line says it is still up. */
  const STALE_MS = 2 * 60 * 1000;
</script>

<script lang="ts">
  /**
   * Getting a Mac ready for agents: Caw, the act's headline, and the steps
   * as rows that tick in order. The first unfinished step opens under its
   * row with one line and one button; the rows after it are not shown yet.
   * A passed step holds its button's check for --dur-hold, then closes
   * while the next one opens. The step and its button are rows of the
   * list's `reflow` (uncovered arriving, closed by clip leaving), so the
   * list's layout changes once and the dialog's `morph` follows it in one
   * tween. A locked screen, a Mac that stopped answering
   * and a denied or dismissed prompt rewrite the open step's line.
   *
   * Reads only `readiness`; what a press asks of the Mac is the caller's
   * (`onContinue`, `onOpenSettings`). `embedded` is the act at the end of
   * Connect a machine, under its "joined the fleet." line, with the act's
   * headline; the reopened dialog carries that headline in its own head.
   */
  import type { MacReadiness, MacReadinessStep } from "@cawco/core";
  import { SvelteSet } from "svelte/reactivity";
  import { Button } from "#lib/components/ui/button/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconNeedsYou, IconSuccess } from "#lib/icons.js";
  import Caw, { type CawStatus } from "../home/Caw.svelte";
  import { crossIn, crossOut, dur } from "../motion/curves.svelte";
  import { reflow } from "../motion/rows.svelte";

  let {
    readiness,
    machineName,
    embedded = false,
    onContinue,
    onOpenSettings,
  }: {
    readiness: MacReadiness;
    /** The Mac's name as the fleet shows it, for the steps' lines. */
    machineName: string;
    /** Inside Connect a machine: the act's headline shows under Caw. */
    embedded?: boolean;
    /** Sends the step's prompt or password dialog to the Mac. */
    onContinue: (stepId: MacReadinessStepId) => void;
    /** Opens the Automation pane on the Mac for a denied step. */
    onOpenSettings: (stepId: MacReadinessStepId) => void;
  } = $props();

  /**
   * The step that has just passed, held open with its button's check for
   * --dur-hold before the next one opens (the pending button's recipe).
   */
  /**
   * Read in the same pass as the readiness that passed it, so the step's
   * row and button stay the ones on screen: set a flush later, the step
   * was dropped for a frame and came back as a new button with no check.
   * A step counts as passed here only once it has been seen waiting.
   */
  const seenWaiting = new Set<MacReadinessStepId>();
  const released = new SvelteSet<MacReadinessStepId>();
  const held = $derived.by((): MacReadinessStepId | null => {
    let passing: MacReadinessStepId | null = null;
    for (const step of readiness.steps) {
      if (step.state === "waiting") {
        seenWaiting.add(step.id);
      } else if (
        passing === null &&
        step.state === "ok" &&
        seenWaiting.has(step.id) &&
        !released.has(step.id)
      ) {
        passing = step.id;
      }
    }
    return passing;
  });
  $effect(() => {
    const id = held;
    if (id === null) {
      return;
    }
    const timer = setTimeout(() => released.add(id), dur("--dur-hold"));
    return () => clearTimeout(timer);
  });

  /** The rows on show: every passed one, then the one the act is on. */
  const shown = $derived.by(() => {
    const rows: MacReadinessStep[] = [];
    for (const step of readiness.steps) {
      rows.push(step);
      if (step.id === held || step.state !== "ok") {
        break;
      }
    }
    return rows;
  });

  /** The row whose step is open under it: one at a time, the first unfinished. */
  const open = $derived.by(() => {
    const step = shown.at(-1);
    if (!step) {
      return;
    }
    if (step.id === held) {
      return step;
    }
    if (step.state === "ok") {
      return;
    }
    return step.state !== "checking" || readiness.offline ? step : undefined;
  });

  const done = $derived(
    held === null && readiness.steps.every((step) => step.state === "ok")
  );
  /**
   * The Mac has Xcode: its checks carry the Xcode steps. Without it they
   * carry `system` alone, which ticks with "no Xcode" and ends the act.
   */
  const hasXcode = $derived(
    readiness.steps.some((step) => step.id !== "system")
  );

  /** Pressed, and the Mac has not answered yet: the button is pending at once. */
  let asked = $state<{ id: MacReadinessStepId; state: string } | null>(null);
  $effect.pre(() => {
    if (asked && (open?.id !== asked.id || open.state !== asked.state)) {
      asked = null;
    }
  });

  /** A prompt up on the Mac for two minutes with no answer. */
  let stale = $state(false);
  $effect(() => {
    stale = false;
    const since = open?.state === "waiting" ? open.since : undefined;
    if (since === undefined) {
      return;
    }
    const timer = setTimeout(
      () => {
        stale = true;
      },
      Math.max(0, since + STALE_MS - Date.now())
    );
    return () => clearTimeout(timer);
  });

  interface Action {
    label: string;
    pending: boolean;
    run?: () => void;
  }
  interface Scene {
    action: Action | null;
    caw: CawStatus;
    line: string;
  }

  /** The open step's line, its button and Caw, condition first. */
  const scene = $derived.by((): Scene | null => {
    if (!open) {
      return null;
    }
    const mac = machineName;
    const { id, state } = open;
    const stepLine = id === "system" ? "" : STEP_LINE[id](mac);
    const press = (run: () => void): Action => ({
      label: state === "dismissed" ? "Try again" : CONTINUE,
      pending: asked?.id === id,
      run: () => {
        asked = { id, state };
        run();
      },
    });
    if (id === held) {
      return {
        line: stepLine,
        action: { label: WAITING, pending: false },
        caw: "loading",
      };
    }
    if (readiness.offline) {
      return {
        line: `${mac} stopped answering. Your place here is kept; this continues when it's back.`,
        action: null,
        caw: "reconnecting",
      };
    }
    if (
      readiness.locked &&
      (state === "needs-you" || state === "waiting" || state === "dismissed")
    ) {
      return {
        line: `${mac}'s screen is locked, so it can't show the prompt. Unlock it there; this continues on its own.`,
        action: state === "waiting" ? { label: CONTINUE, pending: true } : null,
        caw: "sleeping",
      };
    }
    if (state === "denied") {
      return {
        line: `${mac} said no, so macOS won't ask again. Turn it on under System Settings › Privacy & Security › Automation, then this continues on its own.`,
        action: {
          label: "Open Automation settings",
          pending: false,
          run: () => onOpenSettings(id),
        },
        caw: "trying",
      };
    }
    if (state === "waiting") {
      return {
        line: stale
          ? `Still waiting on ${mac}. The prompt stays up there until someone answers it.`
          : stepLine,
        action: { label: CONTINUE, pending: true },
        caw: "loading",
      };
    }
    const action = press(() => onContinue(id));
    if (state === "dismissed") {
      return {
        line: `The password dialog was closed and nothing changed on ${mac}.`,
        action,
        caw: action.pending ? "loading" : "trying",
      };
    }
    return {
      line: stepLine,
      action,
      caw: action.pending ? "loading" : "needs-you",
    };
  });

  const cawStatus = $derived.by((): CawStatus => {
    if (done) {
      return "done";
    }
    return scene?.caw ?? (readiness.offline ? "reconnecting" : "loading");
  });

  /** A row's glyph: running, ticked, or the hand of a step that needs you. */
  const glyphOf = (step: MacReadinessStep) => {
    if (
      step.id === held ||
      (step.state !== "ok" && step.state !== "checking")
    ) {
      return "attn";
    }
    return step.state === "ok" ? "done" : "running";
  };
  const wordsOf = (step: MacReadinessStep): string => {
    if (step.state === "checking") {
      return RUNNING[step.id];
    }
    if (step.state === "ok" && step.id === "system") {
      return step.result ?? NAME.system;
    }
    return NAME[step.id];
  };
</script>

<section aria-label="Getting it ready for agents" class="act">
  <div class="caw">
    <Caw
      next={["needs-you", "done", "sleeping", "reconnecting", "trying"]}
      size={112}
      status={cawStatus}
    />
  </div>

  {#if done || embedded}
    <div class="words">
      {#if done}
        <div class="said" in:crossIn out:crossOut>
          <p class="title">{machineName} is ready for agents.</p>
          <p class="body">
            {#if hasXcode}
              Xcode and the simulator answer to them now. If a session ever
              needs more, it asks you then.
            {:else}
              Install Xcode when you want agents to build Apple apps here.
            {/if}
          </p>
        </div>
      {:else}
        <p class="headline" in:crossIn out:crossOut>
          Getting it ready for agents
        </p>
      {/if}
    </div>
  {/if}

  <ol aria-live="polite" class="steps" {@attach reflow()}>
    {#each shown as step (step.id)}
      {@const glyph = glyphOf(step)}
      <li data-flip class:current={step === shown.at(-1) && !done}>
        <span class="row">
          <span class="glyph icon-swap">
            <span data-active={glyph === "running"}
              ><Spinner class="size-4" /></span
            >
            <span data-active={glyph === "done"}
              ><IconSuccess aria-hidden="true" class="size-4 done" /></span
            >
            <span data-active={glyph === "attn"}
              ><IconNeedsYou aria-hidden="true" class="size-4 attn" /></span
            >
          </span>
          <span class="name"><MorphText text={wordsOf(step)} /></span>
        </span>
        {#if step.id === open?.id && scene}
          <div class="step" data-flip>
            <div class="line">
              {#key scene.line}
                <p in:crossIn out:crossOut>{scene.line}</p>
              {/key}
            </div>
            {#if scene.action}
              <div class="press" data-flip>
                <Button
                  label={scene.action.label}
                  onclick={scene.action.run}
                  pending={scene.action.pending}
                  pendingLabel={WAITING}
                  size="sm"
                />
              </div>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ol>
</section>

<style>
  .act {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .caw {
    display: grid;
    place-items: center;
  }
  /* The headline is the home's figcaption: centred under Caw. */
  .words {
    position: relative;
    text-align: center;
    text-wrap: balance;
  }
  .headline {
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .said {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .title {
    font: var(--type-title);
    letter-spacing: var(--track-title);
    color: var(--ink-strong);
  }
  .body {
    font: var(--type-body);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  /* The SSH steps' rows: a 16px glyph, 10px to the words, 8px apart. */
  .steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .steps li {
    display: flex;
    flex-direction: column;
    min-width: 0;
    font: var(--type-body);
    color: var(--ink-muted);
  }
  .steps li.current {
    color: var(--ink-strong);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;

    @media (max-width: 640px), (pointer: coarse) {
      min-height: 44px;
    }
  }
  .glyph {
    flex: none;
    --icon-swap-dur: var(--dur-control);
  }
  .glyph :global(.done) {
    color: var(--status-done-ink);
  }
  .glyph :global(.attn) {
    color: var(--status-attn-ink);
  }
  .name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* The open step sits under its row's words, past the glyph. */
  .step {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-block-start: var(--space-1);
    padding-inline-start: 26px;
  }
  .line {
    position: relative;
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  .press {
    display: flex;

    @media (max-width: 640px) {
      & :global([data-slot="button"]) {
        flex: 1;
      }
    }
  }
</style>
