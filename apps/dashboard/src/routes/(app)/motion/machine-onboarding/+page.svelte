<script lang="ts">
  /**
   * Connect a machine's tray, reworked, on its fixture (join/preview/
   * JoinTrayFrame): the probe kit's machine-onboarding spec drives it.
   * `?layout=` is desk or phone; `?view=` one of the tray's states (the
   * states file's: form, command, admit, signing, installing, needs,
   * hostkey, joined, failed, stopped, plus reopened (onto a step 90 s in)
   * and unreachable, and change: the form brought back by Change target),
   * signing by default. The spec moves
   * it through `globalThis.__joinBench`: `steps(n)` for the add n step lines
   * in, `join()` for the add done.
   */
  import type { SshJoinJob } from "@cawco/core/join";
  import { onMount, untrack } from "svelte";
  import {
    alertOf,
    cardOf,
    type FormAlert,
    type Joined,
  } from "#lib/cawco/join/join-view.js";
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
    unreachable,
    WAITING,
  } from "#lib/cawco/join/preview/join-fixtures.js";
  import { page } from "$app/state";

  interface View {
    formAlert: FormAlert | null;
    job: SshJoinJob | null;
    joined: Joined | null;
    waiting: typeof WAITING;
    way: "ssh" | "command";
  }

  const base: View = {
    formAlert: null,
    job: null,
    joined: null,
    way: "ssh",
    waiting: [],
  };
  const VIEWS: Record<string, () => View> = {
    form: () => base,
    command: () => ({ ...base, way: "command" }),
    admit: () => ({ ...base, way: "command", waiting: WAITING }),
    signing: () => ({ ...base, job: runningAt(0) }),
    installing: () => ({ ...base, job: runningAt(10, 42_000) }),
    reopened: () => ({ ...base, job: runningAt(10, 90_000) }),
    unreachable: () => ({
      ...base,
      job: unreachable("connecting failed: ECONNRESET"),
    }),
    change: () => {
      const card = cardOf({
        job: unreachable("connecting failed: ECONNRESET"),
        refused: null,
        joined: null,
      });
      return { ...base, formAlert: card ? alertOf(card) : null };
    },
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
    formAlert={view.formAlert}
    job={view.job}
    joined={view.joined}
    {layout}
    sshKey={SSH_KEY}
    target={TARGET}
    waiting={view.waiting}
    way={view.way}
  />
</div>
