<script lang="ts">
  /**
   * MAC READINESS BENCH — the real Connect a machine dialog in its third act,
   * fed a scripted `MacReadiness` with no hub behind it.
   *
   * The dialog is the Shell's own; this route stages a finished SSH join for
   * a Mac, writes the Mac's readiness into `macReady` and installs the two
   * actions as a scripted Mac would answer them. Play runs the whole act on
   * a timer; each state button jumps straight to one of DESIGN-FLOW §5's
   * frames. Phone shows the same page in a 390×844 frame beside it.
   *
   * The bar stands above the dialog's scrim and stops its pointerdowns, so a
   * press on it never reads as a press outside the dialog.
   */
  import type {
    MacReadiness,
    MacReadinessState,
    MacReadinessStepId,
  } from "@cawco/core";
  import { MAC_READINESS_STEPS } from "@cawco/core";
  import { onMount } from "svelte";
  import { addMachine, sshJoin } from "#lib/cawco/join/join.svelte.js";
  import { macReady } from "#lib/cawco/join/mac-ready.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { theme } from "#lib/theme.svelte.js";
  import { page } from "$app/state";

  /** The bench's Mac: no fleet row has this id, so the dialogs show it as its name. */
  const MAC = "Omars-MacBook-Pro";
  const SYSTEM = "macOS 27.0 · Xcode 27";
  /** How long the scripted Mac takes to answer a prompt. */
  const ANSWER_MS = 2200;

  type Scene =
    | "play"
    | "running"
    | "needs-you"
    | "waiting"
    | "still-waiting"
    | "advance"
    | "locked"
    | "denied"
    | "dismissed"
    | "offline"
    | "done"
    | "no-xcode"
    | "reopened";

  const SCENES: { scene: Scene; label: string }[] = [
    { scene: "play", label: "Play" },
    { scene: "running", label: "Running" },
    { scene: "needs-you", label: "Needs you" },
    { scene: "waiting", label: "Waiting" },
    { scene: "still-waiting", label: "Still waiting" },
    { scene: "advance", label: "Tick and advance" },
    { scene: "locked", label: "Locked" },
    { scene: "denied", label: "Denied" },
    { scene: "dismissed", label: "Dialog closed" },
    { scene: "offline", label: "Offline" },
    { scene: "done", label: "Done" },
    { scene: "no-xcode", label: "No Xcode" },
    { scene: "reopened", label: "Reopened" },
  ];

  const embedded = page.url.searchParams.has("embed");
  let scene = $state<Scene>(
    (page.url.searchParams.get("scene") as Scene | null) ?? "play"
  );
  let phone = $state(false);

  /** The readiness written last, so a press changes one step of it. */
  let current: MacReadiness | null = null;

  /** One state per step, in order; fewer states than steps is a Mac whose checks carry only those (no Xcode: `system` alone). */
  function write(
    states: MacReadinessState[],
    {
      locked = false,
      offline = false,
      since = Date.now(),
      system = SYSTEM,
    } = {}
  ) {
    current = {
      checkedAt: Date.now(),
      locked,
      offline,
      steps: MAC_READINESS_STEPS.slice(0, states.length).map((id, i) => ({
        id,
        state: states[i],
        since,
        ...(id === "system" && states[i] === "ok" ? { result: system } : {}),
      })),
    };
    macReady.set(MAC, current);
  }

  function step(id: MacReadinessStepId, state: MacReadinessState) {
    if (!current) {
      return;
    }
    const readiness: MacReadiness = {
      ...current,
      checkedAt: Date.now(),
      steps: current.steps.map((s) =>
        s.id === id ? { ...s, state, since: Date.now() } : s
      ),
    };
    current = readiness;
    macReady.set(MAC, readiness);
  }

  /** Timers the running scene set; a new scene clears them. */
  let timers: ReturnType<typeof setTimeout>[] = [];
  const later = (ms: number, run: () => void) => {
    timers.push(setTimeout(run, ms));
  };
  const stop = () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers = [];
  };

  /** The scripted Mac: a prompt sent is answered with Allow a little later. */
  macReady.actions = {
    continue(_machineId, id) {
      step(id, "waiting");
      if (scene !== "play") {
        later(ANSWER_MS, () => step(id, "ok"));
      }
    },
    openSettings(_machineId, id) {
      later(ANSWER_MS, () => step(id, "ok"));
    },
  };

  /** The open step's button, pressed as the owner would. */
  const pressOpen = () =>
    document
      .querySelector<HTMLButtonElement>(
        'section[aria-label="Getting it ready for agents"] [data-slot="button"]'
      )
      ?.click();

  /** The Connect a machine dialog, its SSH join done, the Mac's act under it. */
  function connect() {
    macReady.close();
    sshJoin.stage({
      id: "bench",
      target: `omar@${MAC}.local`,
      hubUrl: page.url.origin,
      port: 22,
      lines: [],
      exitCode: 0,
      machineId: MAC,
      problem: null,
      state: "done",
    });
    addMachine.show("ssh");
  }

  /** The whole act on a timer: checks tick, three steps are pressed and pass. */
  function play() {
    macReady.forget(MAC);
    current = null;
    connect();
    let t = 700;
    const at = (ms: number, run: () => void) => {
      t += ms;
      later(t, run);
    };
    at(0, () => write(["checking", "checking", "checking", "checking"]));
    at(1100, () => write(["ok", "checking", "checking", "checking"]));
    at(1100, () => write(["ok", "needs-you", "needs-you", "needs-you"]));
    for (const id of ["ssh-xcode", "agent-xcode", "xcode-setup"] as const) {
      at(2200, pressOpen);
      at(ANSWER_MS, () => step(id, "ok"));
      // The pass holds its check for --dur-hold before the next step opens.
      at(1200, () => undefined);
    }
  }

  function show(next: Scene) {
    stop();
    scene = next;
    if (next === "play") {
      play();
      return;
    }
    if (next === "reopened") {
      addMachine.open = false;
      write(["ok", "ok", "needs-you", "needs-you"]);
      macReady.show(MAC);
      return;
    }
    connect();
    switch (next) {
      case "running":
        write(["ok", "checking", "checking", "checking"]);
        break;
      case "needs-you":
        write(["ok", "needs-you", "needs-you", "needs-you"]);
        break;
      case "waiting":
        write(["ok", "waiting", "needs-you", "needs-you"]);
        break;
      case "still-waiting":
        write(["ok", "waiting", "needs-you", "needs-you"], {
          since: Date.now() - 2 * 60 * 1000,
        });
        break;
      case "advance":
        write(["ok", "waiting", "needs-you", "needs-you"]);
        later(900, () => step("ssh-xcode", "ok"));
        break;
      case "locked":
        write(["ok", "ok", "ok", "needs-you"], { locked: true });
        break;
      case "denied":
        write(["ok", "ok", "denied", "needs-you"]);
        break;
      case "dismissed":
        write(["ok", "ok", "ok", "dismissed"]);
        break;
      case "offline":
        write(["ok", "ok", "needs-you", "needs-you"], { offline: true });
        break;
      case "done":
        write(["ok", "ok", "ok", "ok"]);
        break;
      case "no-xcode":
        // Its checks carry `system` alone: it reads, ticks, and the act ends.
        write(["checking"]);
        later(1100, () => write(["ok"], { system: "macOS 27.0 · no Xcode" }));
        break;
      default:
        break;
    }
  }

  onMount(() => {
    // The page mounts before the Shell's dialogs after it: a dialog opened
    // in the same flush never draws, so the first scene waits a frame.
    const first = requestAnimationFrame(() => show(scene));
    return () => {
      cancelAnimationFrame(first);
      stop();
      macReady.actions = null;
      macReady.forget(MAC);
      macReady.close();
      sshJoin.reset();
      addMachine.open = false;
    };
  });

  const frameSrc = $derived(`${page.url.pathname}?embed&scene=${scene}`);
</script>

<svelte:head><title>Mac readiness | CawCo</title></svelte:head>

{#if !embedded}
  <!-- Above the dialog's scrim; its pointerdowns never reach the dialog's
       outside-press listener, so the dialog stays open under it. -->
  <fieldset
    aria-label="Mac readiness bench"
    class="bench"
    onpointerdown={(event) => event.stopPropagation()}
  >
    {#each SCENES as each (each.scene)}
      <Button
        onclick={() => show(each.scene)}
        size="xs"
        variant={scene === each.scene ? "default" : "outline"}
        >{each.label}</Button
      >
    {/each}
    <span class="gap"></span>
    <Button
      onclick={() => theme.set(theme.resolved === "dark" ? "light" : "dark")}
      size="xs"
      variant="outline"
      >{theme.resolved === "dark" ? "Light" : "Dark"}</Button
    >
    <Button
      onclick={() => {
        phone = !phone;
      }}
      size="xs"
      variant={phone ? "default" : "outline"}
      >Phone</Button
    >
    {#if phone}
      <iframe class="phone" src={frameSrc} title="Phone, 390 by 844"></iframe>
    {/if}
  </fieldset>
{/if}

<style>
  .bench {
    position: fixed;
    inset-block-start: var(--space-2);
    inset-inline: var(--space-2);
    z-index: 60;
    min-inline-size: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--surface-raised);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-overlay);
    pointer-events: auto;
  }
  .gap {
    flex: 1;
  }
  .phone {
    position: fixed;
    inset-block-end: var(--space-2);
    inset-inline-end: var(--space-2);
    width: 390px;
    height: 844px;
    max-height: calc(100vh - 80px);
    background: var(--surface-recess);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
  }
</style>
