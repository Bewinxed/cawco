<script lang="ts">
  /**
   * Connect a machine's tray, reworked, on its fixture (join/preview/
   * JoinTrayFrame): the probe kit's machine-onboarding spec drives it.
   * `?layout=` is desk or phone; `?view=` one of the tray's states (the
   * states file's: form, command, admit, signing, installing, needs,
   * hostkey, joined, failed, stopped), signing by default. The spec moves
   * it through `globalThis.__joinBench`: `steps(n)` for the add n step lines
   * in, `join()` for the add done.
   */
  import type { SshJoinJob } from "@cawco/core/join";
  import { onMount, untrack } from "svelte";
  import type { Joined } from "#lib/cawco/join/join-view.js";
  import JoinTrayFrame from "#lib/cawco/join/preview/JoinTrayFrame.svelte";
  import {
    ADDRESSES,
    doneJob,
    hostKeyChanged,
    JOINED,
    runningAt,
    SSH_KEY,
    signatureFailed,
    signInRefused,
    stoppedJob,
    TARGET,
    WAITING,
  } from "#lib/cawco/join/preview/join-fixtures.js";
  import { page } from "$app/state";

  interface View {
    job: SshJoinJob | null;
    joined: Joined | null;
    stepElapsed: number;
    waiting: typeof WAITING;
    way: "ssh" | "command";
  }

  const base: View = {
    job: null,
    joined: null,
    way: "ssh",
    waiting: [],
    stepElapsed: 0,
  };
  const VIEWS: Record<string, () => View> = {
    form: () => base,
    command: () => ({ ...base, way: "command" }),
    admit: () => ({ ...base, way: "command", waiting: WAITING }),
    signing: () => ({ ...base, job: runningAt(0) }),
    installing: () => ({ ...base, job: runningAt(10), stepElapsed: 42_000 }),
    needs: () => ({ ...base, job: signInRefused() }),
    hostkey: () => ({ ...base, job: hostKeyChanged() }),
    joined: () => ({ ...base, job: doneJob(), joined: JOINED }),
    failed: () => ({ ...base, job: signatureFailed() }),
    stopped: () => ({ ...base, job: stoppedJob(7) }),
  };

  const layout = $derived(
    page.url.searchParams.get("layout") === "phone" ? "phone" : "desk"
  );
  let view = $state<View>(
    untrack(() =>
      (VIEWS[page.url.searchParams.get("view") ?? ""] ?? VIEWS.signing)()
    )
  );

  onMount(() => {
    const bench = {
      steps: (count: number) => {
        view = { ...view, joined: null, job: runningAt(count) };
      },
      join: () => {
        view = { ...view, job: doneJob(), joined: JOINED };
      },
    };
    (globalThis as { __joinBench?: typeof bench }).__joinBench = bench;
    return () => {
      (globalThis as { __joinBench?: typeof bench }).__joinBench = undefined;
    };
  });
</script>

<svelte:head><title>Connect a machine | CawCo</title></svelte:head>

<div data-bench="machine-onboarding" class="flex min-h-dvh flex-col">
  <JoinTrayFrame
    addresses={ADDRESSES}
    job={view.job}
    joined={view.joined}
    {layout}
    sshKey={SSH_KEY}
    stepElapsed={view.stepElapsed}
    target={TARGET}
    waiting={view.waiting}
    way={view.way}
  />
</div>
