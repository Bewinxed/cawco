<script lang="ts">
  /**
   * The real Connect a machine dialog, its join finished, in each readiness
   * state. `?state=` picks the state and `?name=` the machine's label; the
   * picker stands above the dialog's scrim, clear of its frame, and stops its
   * pointerdowns so a press on it never reads as a press outside the dialog.
   */
  import { onMount } from "svelte";
  import { addMachine, sshJoin } from "#lib/cawco/join/join.svelte.js";
  import {
    macReadiness,
    type Readiness,
  } from "#lib/cawco/join/readiness.svelte.js";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { page } from "$app/state";

  const STATES = [
    { id: "not-mac", label: "Not a Mac" },
    { id: "checking-grace", label: "Checking, first second" },
    { id: "checking", label: "Checking" },
    { id: "ready", label: "Ready" },
    { id: "allow", label: "One permission" },
    { id: "said-no", label: "Said no" },
    { id: "xcode-terms", label: "Xcode terms" },
    { id: "locked", label: "Locked" },
    { id: "offline", label: "Offline" },
    { id: "no-xcode", label: "No Xcode" },
  ] as const;
  type StateId = (typeof STATES)[number]["id"];

  const picked = $derived(
    STATES.find((each) => each.id === page.url.searchParams.get("state"))?.id ??
      "ready"
  );
  const name = $derived(
    page.url.searchParams.get("name") ?? "Omars-MacBook-Pro"
  );

  function readinessOf(id: StateId): Readiness {
    switch (id) {
      case "checking-grace":
        return { kind: "checking", since: Date.now() };
      case "checking":
        return {
          kind: "checking",
          since: Date.now() - dur("--dur-wait-grace"),
        };
      default:
        return { kind: id };
    }
  }

  const hrefOf = (id: StateId) => {
    const query = new URLSearchParams(page.url.search);
    query.set("state", id);
    return `?${query}`;
  };

  $effect(() => {
    macReadiness.stage(readinessOf(picked));
  });

  $effect(() => {
    sshJoin.stage({
      id: "bench",
      target: `omar@${name}.local`,
      hubUrl: page.url.origin,
      port: 22,
      lines: [],
      exitCode: 0,
      machineId: name,
      problem: null,
      state: "done",
    });
  });

  onMount(() => {
    // The page mounts before the Shell's dialog: one opened in the same
    // flush never draws, so it opens a frame later.
    const frame = requestAnimationFrame(() => addMachine.show("ssh"));
    return () => {
      cancelAnimationFrame(frame);
      addMachine.open = false;
      sshJoin.reset();
      macReadiness.stage({ kind: "not-mac" });
    };
  });
</script>

<svelte:head><title>Mac readiness | CawCo</title></svelte:head>

<nav
  aria-label="Readiness state"
  class="bench"
  onpointerdown={(event) => event.stopPropagation()}
>
  {#each STATES as each (each.id)}
    <Button
      aria-current={picked === each.id ? "page" : undefined}
      href={hrefOf(each.id)}
      size="xs"
      variant={picked === each.id ? "default" : "outline"}
      >{each.label}</Button
    >
  {/each}
</nav>

<style>
  .bench {
    position: fixed;
    inset-block-start: var(--space-2);
    inset-inline: var(--space-2);
    z-index: 60;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    pointer-events: auto;
  }
</style>
