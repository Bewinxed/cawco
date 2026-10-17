<script lang="ts">
  /**
   * A session whose project is moving to its machine (its row on the board
   * as `moving` from the move's start), before its process exists, and the
   * moment it hands over to it (design §2, the staged wait;
   * the owner's picks B "Bar + MB" and C: a move nobody said yes to in New
   * session asks for it here, as its first step). Drawn from the hub's job
   * as it stands now and never replayed: a step done before the pane opened
   * is simply done.
   *
   * Caw stands in for the wait under the Real Wait Rule: nothing for the
   * first --dur-wait-grace, then his `loading`, the steps landing after his
   * enter. An ask is not a wait: it shows at once, with no Caw. A failure
   * keeps him over the steps (the owner's pick), in `needs-you` until his
   * failed phase is drawn.
   */
  import {
    type MoveJob,
    type MoveStep,
    moveSourceName,
    type PermissionResult,
    moveSize as sizeWords,
  } from "@cawco/core";
  import { type Component, untrack } from "svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import {
    Alert,
    AlertDescription,
    AlertTitle,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Progress } from "#lib/components/ui/progress/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    type StepStatus,
    ThinkingStep,
    ThinkingSteps,
  } from "#lib/components/ui/thinking-steps/index.js";
  import {
    IconClose,
    IconError,
    IconNeedsYou,
    IconStop,
    IconSuccess,
    IconTick,
  } from "#lib/icons.js";
  import { browser } from "$app/env";
  import { submitCommand } from "../client.svelte";
  import Caw from "../home/Caw.svelte";
  import { machineName } from "../home/home-state.svelte";
  import { crossIn, crossOut, dur } from "../motion/curves.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { cancelMove, retryMove } from "../move.svelte";
  import RowFault from "../RowFault.svelte";
  import { workspace } from "../workspace/workspace.svelte";
  import MoveAskBody from "./MoveAsk.svelte";

  let { job, phone = false }: { job: MoveJob; phone?: boolean } = $props();

  type Phase = "done" | "active" | "ahead" | "failed" | "stopped" | "asking";

  const WORKING: ReadonlySet<string> = new Set([
    "approval",
    "snapshot",
    "clone",
    "lfs",
    "install",
    "start",
  ]);
  const MOVE_IT = "Move it";
  const DONT_MOVE = "Don't move";

  const source = $derived(machineName(job.sourceMachineId));
  const target = $derived(machineName(job.targetMachineId));
  const fromHub = $derived(job.from.kind === "hub");
  const big = $derived(job.ask?.bigFiles ?? []);
  const bigBytes = $derived(big.reduce((sum, file) => sum + file.bytes, 0));

  const plural = (count: number, word: string): string =>
    `${count} ${word}${count === 1 ? "" : "s"}`;

  /** The step the job stands at: working, failed at or stopped at; none once started. */
  const at = $derived.by((): MoveStep | undefined => {
    if (job.stage === "failed") {
      return job.error?.stage;
    }
    if (job.stage === "cancelled") {
      return job.stoppedAt;
    }
    return WORKING.has(job.stage) ? (job.stage as MoveStep) : undefined;
  });
  const asking = $derived(job.stage === "approval" && Boolean(job.askId));

  function phaseOf(step: MoveStep): Phase {
    if (job.stage === "started") {
      return "done";
    }
    const here = at ? job.steps.indexOf(at) : 0;
    const index = job.steps.indexOf(step);
    if (index !== here) {
      return index < here ? "done" : "ahead";
    }
    if (job.stage === "failed") {
      return "failed";
    }
    if (job.stage === "cancelled") {
      return "stopped";
    }
    return step === "approval" && job.askId ? "asking" : "active";
  }

  /** What a step says while it runs. */
  function running(step: MoveStep): string {
    switch (step) {
      case "approval":
        return job.ask?.gitInit
          ? "Initialising the repository"
          : `Moving ${plural(big.length, "file")} to large files`;
      case "snapshot":
        return `Snapshotting your work on ${source}`;
      case "clone":
        return fromHub
          ? "Cloning from the hub"
          : `Fetching from ${moveSourceName(job.from)}`;
      case "lfs":
        return "Downloading large files";
      case "install":
        return "Installing dependencies";
      default:
        return `Starting the session on ${target}`;
    }
  }

  /** What a step says once it is done; the last one is the ready line. */
  function finished(step: MoveStep): string {
    switch (step) {
      case "approval":
        if (job.ask?.gitInit) {
          return `Initialised · 1 commit${big.length > 0 ? ` · ${plural(big.length, "large file")}` : ""}`;
        }
        return `Moved ${plural(big.length, "file")} to large files · ${sizeWords(bigBytes)}`;
      case "snapshot":
        return job.snapshot?.files
          ? `Snapshot of your work on ${source} · ${plural(job.snapshot.files, "file")}`
          : `Snapshot of your work on ${source}`;
      case "clone":
        // A folder that was no repository had no history to size.
        return `${fromHub ? "Cloned" : "Fetched"}${job.bytes > 0 && !job.ask?.gitInit ? ` · ${sizeWords(job.bytes)}` : ""}`;
      case "lfs":
        return job.lfs
          ? `Large files · ${sizeWords(job.lfs.bytes)} · ${plural(job.lfs.files, "file")}`
          : "Large files";
      case "install":
        return "Dependencies installed";
      default:
        return job.moved
          ? [job.moved, job.stayed].filter(Boolean).join(" · ")
          : `Ready on ${target}`;
    }
  }

  function labelOf(step: MoveStep, phase: Phase): string {
    switch (phase) {
      case "done":
        return finished(step);
      case "ahead":
        if (step === "start") {
          return `Ready on ${target}`;
        }
        return step === "lfs" && job.lfs
          ? `Downloading large files · ${sizeWords(job.lfs.bytes)}`
          : running(step);
      case "failed":
        return step === "start"
          ? `Ready on ${target}, but the session didn't start`
          : `${running(step)} failed`;
      case "stopped":
        return `${running(step)}, stopped`;
      case "asking":
        return job.ask?.gitInit
          ? `${job.projectName} isn't a git repository yet`
          : `${job.projectName} has ${plural(big.length, "big file")} to send separately`;
      default:
        return running(step);
    }
  }

  const GLYPHS: Record<Phase, Component | "dot"> = {
    done: IconSuccess,
    active: Spinner as Component,
    ahead: "dot",
    failed: IconError,
    stopped: IconStop,
    asking: IconNeedsYou,
  };
  const STATUS: Record<Phase, StepStatus> = {
    done: "complete",
    active: "active",
    ahead: "ahead",
    failed: "complete",
    stopped: "complete",
    asking: "complete",
  };

  /**
   * The rows drawn: every step, in order, until the session starts; then the
   * ready line alone, the others folding shut (the One Object Rule).
   */
  const rows = $derived(
    job.steps
      .filter((step) => job.stage !== "started" || step === "start")
      .map((step) => {
        const phase = phaseOf(step);
        return { step, phase, label: labelOf(step, phase) };
      })
  );

  /* ── Bytes ───────────────────────────────────────────────────────────── */

  /** "140 of 340 MB", or "640 MB of 2.1 GB" across units. */
  function partWords(bytes: number, total: number): string {
    const done = sizeWords(bytes);
    const whole = sizeWords(total);
    const [count, unit] = done.split(" ");
    return unit === whole.split(" ")[1]
      ? `${count} of ${whole}`
      : `${done} of ${whole}`;
  }
  const share = (bytes: number, total: number): number =>
    total > 0 ? Math.min(100, Math.floor((bytes / total) * 100)) : 0;

  /**
   * "· 3 min left": a step whose remaining time, at the last ten seconds'
   * rate, is past two breaths says so after its bytes, read once a breath.
   */
  const RATE_WINDOW_MS = 10_000;
  /** `--breath` as the browser resolves it (tokens: 4 × `--c-500`), in ms. */
  function breathMs(): number {
    const probe = document.createElement("div");
    probe.style.transitionDuration = "var(--breath)";
    document.body.append(probe);
    const value = getComputedStyle(probe).transitionDuration;
    probe.remove();
    return Number.parseFloat(value) * (value.endsWith("ms") ? 1 : 1000);
  }
  let samples: { at: number; bytes: number }[] = [];
  let sampledStage = "";
  let left = $state("");
  $effect(() => {
    const { progress, stage } = job;
    if (!progress) {
      samples = [];
      left = "";
      return;
    }
    if (stage !== sampledStage) {
      sampledStage = stage;
      samples = [];
      left = "";
    }
    const now = performance.now();
    samples = [
      ...samples.filter((one) => now - one.at <= RATE_WINDOW_MS),
      { at: now, bytes: progress.bytes },
    ];
  });
  /** Bytes are moving: the reading below runs once a breath for as long as they do. */
  const transferring = $derived(Boolean(job.progress));
  $effect(() => {
    if (!transferring) {
      return;
    }
    const breath = breathMs();
    const timer = setInterval(() => {
      const { progress } = job;
      const [first] = samples;
      const last = samples.at(-1);
      if (!(progress && first && last) || last.at - first.at < 1000) {
        left = "";
        return;
      }
      const rate = (last.bytes - first.bytes) / ((last.at - first.at) / 1000);
      const seconds = rate > 0 ? (progress.total - progress.bytes) / rate : 0;
      if (seconds * 1000 <= 2 * breath) {
        left = "";
        return;
      }
      left =
        seconds >= 90
          ? `${Math.round(seconds / 60)} min left`
          : `${Math.ceil(seconds)} s left`;
    }, breath);
    return () => clearInterval(timer);
  });

  /* ── The wait, and Caw ───────────────────────────────────────────────── */

  /** The Real Wait Rule: a move older than the grace is no fresh wait. */
  let graceOver = $state(
    untrack(
      () =>
        browser &&
        Date.now() - Date.parse(job.createdAt) >= dur("--dur-wait-grace")
    )
  );
  $effect(() => {
    if (graceOver) {
      return;
    }
    const grace = setTimeout(() => {
      graceOver = true;
    }, dur("--dur-wait-grace"));
    return () => clearTimeout(grace);
  });
  const waiting = $derived(WORKING.has(job.stage) && !asking);
  const failed = $derived(job.stage === "failed");
  /** Caw is wanted: a wait past its grace, or a failure (he stays over the steps). */
  const cawWanted = $derived(graceOver && (waiting || failed));
  let cawThere = $state(false);
  /** His first enter has played: the steps land after it. */
  let entered = $state(false);
  $effect(() => {
    if (cawWanted) {
      cawThere = true;
    }
  });
  const columnShown = $derived(
    asking || job.stage === "cancelled" || (graceOver && (entered || !cawThere))
  );

  /* ── The person ──────────────────────────────────────────────────────── */

  let answered = $state<string | null>(null);
  $effect(() => {
    if (!job.askId) {
      answered = null;
    }
  });
  /** The approval card's answer, through the same channel as every ask's. */
  function answer(choice: typeof MOVE_IT | typeof DONT_MOVE): void {
    const { ask, askId } = job;
    if (!(ask && askId) || answered) {
      return;
    }
    answered = choice;
    const result: PermissionResult = {
      behavior: "allow",
      updatedInput: { answers: { [ask.title]: choice } },
    };
    // Parked on the session's own row, which reads "Needs you" until now.
    submitCommand(
      job.targetInstanceId,
      job.targetMachineId,
      "permission.answer",
      { requestId: askId, result }
    );
  }

  /**
   * Why the last Cancel or Retry was refused, under the button pressed: the
   * wait stays as it was, and that button tries again.
   */
  let refused = $state<{ by: "cancel" | "retry"; reason: string } | null>(null);
  const refusedBy = (by: "cancel" | "retry") =>
    refused?.by === by
      ? `Couldn't ${by === "cancel" ? "stop" : "retry"} the move: ${refused.reason}`
      : null;

  let stopping = $state(false);
  /**
   * Cancel: the hub stops the step in flight. The wait itself turns: its
   * steps fold to "Stopped." with what stayed on disk, and Close; the tab
   * stays until the person closes it.
   */
  async function cancel(): Promise<void> {
    stopping = true;
    refused = null;
    try {
      await cancelMove(job.id);
    } catch (cause) {
      refused = {
        by: "cancel",
        reason: failureWords(cause),
      };
    } finally {
      stopping = false;
    }
  }

  let retrying = $state(false);
  async function retry(): Promise<void> {
    retrying = true;
    refused = null;
    try {
      await retryMove(job.id);
    } catch (cause) {
      refused = {
        by: "retry",
        reason: failureWords(cause),
      };
    } finally {
      retrying = false;
    }
  }

  /** A Cancel the hub can still act on: not once the session is starting. */
  const cancellable = $derived(waiting && job.stage !== "start");
</script>

<!-- literal: 560px, 128px, 96px -->
<div
  data-slot="wait"
  class="group/wait flex flex-col items-center justify-center gap-space-5 flex-auto min-h-0 overflow-y-auto py-space-8 px-space-6 bg-surface-recess data-phone:justify-start data-phone:pbs-space-6 data-phone:px-space-4 data-phone:pbe-(--wait-pad-end)"
  data-move={job.id}
  data-phone={phone || undefined}
  style:--col-w="min(560px, 100%)"
  style:--caw-min-h="128px"
  style:--caw-min-h-phone="96px"
  style:--wait-pad-end="calc(var(--space-4) + env(safe-area-inset-bottom))"
>
  <!-- A stopped move has no Caw and no room for him: its column starts at
       the same top whatever stage it stopped at, as on the phone app. -->
  <div
    data-move-wait-empty={!cawThere || undefined}
    data-gone={job.stage === "cancelled" || undefined}
    class="grid place-items-center min-h-(--caw-min-h) group-data-phone/wait:min-h-(--caw-min-h-phone) data-move-wait-empty:invisible data-gone:hidden"
  >
    {#if cawThere}
      <Caw
        next={["loading", "needs-you"]}
        onentered={() => {
          entered = true;
        }}
        ongone={() => {
          cawThere = false;
        }}
        present={cawWanted}
        size={phone ? 96 : 128}
        status={failed ? "needs-you" : "loading"}
      />
    {/if}
  </div>

  {#if columnShown}
    <div
      data-slot="column"
      class="grid gap-space-3 w-(--col-w)"
      in:crossIn
    >
      <ThinkingSteps>
        {#each rows as row, index (row.step)}
          <div
            data-slot="row"
            class="min-w-0"
            data-phase={row.phase}
            out:unfold
          >
            <ThinkingStep
              icon={GLYPHS[row.phase]}
              isLast={index === rows.length - 1}
              label={row.label}
              status={STATUS[row.phase]}
            >
              {#if row.step === "snapshot" && job.snapshot?.branch && row.phase !== "ahead"}
                <code
                  data-slot="sub"
                  class="type-code text-ink-muted wrap-anywhere"
                  >{job.snapshot.branch}</code
                >
              {/if}
              {#if (row.step === "clone" || row.step === "lfs") && row.phase === "active" && job.progress}
                {@const progress = job.progress}
                <div class="grid gap-space-1 pbs-space-1" in:unfold out:unfold>
                  <Progress
                    aria-label={row.label}
                    value={share(progress.bytes, progress.total)}
                  />
                  <span
                    data-num
                    data-slot="meta"
                    class="type-meta text-ink-muted tabular-nums"
                    >{share(progress.bytes, progress.total)}% ·
                    {partWords(progress.bytes, progress.total)}{left
                      ? ` · ${left}`
                      : ""}</span
                  >
                </div>
              {/if}
              <!-- The file in flight, when it is one of several: alone, it is
                   the stage, and its row would repeat the bar above. -->
              {#if row.step === "lfs" && row.phase === "active" && job.lfsFile && (job.lfs?.files ?? 0) > 1}
                {@const file = job.lfsFile}
                <!-- literal: 96px -->
                <div
                  class="grid grid-cols-(--file-cols) items-center gap-space-2"
                  style:--file-cols="minmax(0, 1fr) 96px auto"
                  in:unfold
                  out:unfold
                >
                  {#key file.file}
                    <span
                      data-slot="path"
                      class="row-start-1 col-start-1 truncate text-left type-code text-ink-muted"
                      title={file.file}
                      in:crossIn
                      out:crossOut><bdi>{file.file}</bdi></span
                    >
                  {/key}
                  <Progress value={share(file.bytes, file.total)} />
                  <span
                    data-num
                    data-slot="meta"
                    class="type-meta text-ink-muted tabular-nums"
                    >{partWords(file.bytes, file.total)}</span
                  >
                </div>
              {/if}
              {#if row.step === "install" && (row.phase === "active" || row.phase === "failed") && job.install}
                <code
                  data-slot="sub"
                  class="type-code text-ink-muted wrap-anywhere"
                  >{job.install.command}</code
                >
              {/if}
              {#if row.phase === "asking" && job.ask}
                <div
                  data-slot="move-wait-card"
                  class="grid gap-space-3 mbs-space-1 p-space-3 border border-border-control rounded-lg bg-surface-raised shadow-stat"
                  in:unfold
                  out:unfold
                >
                  <p class="m-0 type-label text-ink-strong">{job.ask.title}</p>
                  <MoveAskBody ask={job.ask} />
                  <div
                    class="flex justify-between gap-space-8 group-data-phone/wait:gap-space-4"
                  >
                    <Button
                      disabled={answered !== null}
                      onclick={() => answer(DONT_MOVE)}
                      size="sm"
                      variant="secondary"
                    >
                      <IconClose data-slot="deny" class="text-ink-muted" />
                      <span>{DONT_MOVE}</span>
                    </Button>
                    <!-- The yes is the action, coral as in New session's step 2. -->
                    <Button
                      disabled={answered !== null}
                      onclick={() => answer(MOVE_IT)}
                      size="sm"
                    >
                      <IconTick />
                      <span>{MOVE_IT}</span>
                    </Button>
                  </div>
                </div>
              {/if}
              {#if row.phase === "failed" && job.error}
                <div
                  data-slot="failure"
                  class="mbs-space-1"
                  in:unfold
                  out:unfold
                >
                  <Alert role="alert" variant="destructive">
                    <IconError />
                    <!-- The machine's words, unless they only repeat the step's. -->
                    {#if job.error.message !== row.label}
                      <AlertTitle>{job.error.message}</AlertTitle>
                    {/if}
                    <AlertDescription>
                      {#if job.error.detail}
                        <code
                          data-slot="detail"
                          class="block type-code whitespace-pre-wrap wrap-anywhere"
                          >{job.error.detail}</code
                        >
                      {/if}
                      {#if job.error.stage === "clone"}
                        <span>The partial clone is removed first.</span>
                      {/if}
                      <span
                        data-slot="alert-actions"
                        class="flex flex-wrap justify-end gap-space-2 mbs-space-2"
                      >
                        <Button
                          disabled={retrying}
                          failed={refused?.by === "cancel"}
                          label="Cancel"
                          onclick={cancel}
                          pending={stopping}
                          pendingLabel="Stopping…"
                          size="sm"
                          variant="secondary"
                        />
                        <Button
                          disabled={stopping}
                          failed={refused?.by === "retry"}
                          label="Retry"
                          onclick={retry}
                          pending={retrying}
                          pendingLabel="Retrying…"
                          size="sm"
                          variant="secondary"
                        />
                      </span>
                      <RowFault
                        reason={refusedBy("cancel") ?? refusedBy("retry")}
                      />
                    </AlertDescription>
                  </Alert>
                </div>
              {/if}
            </ThinkingStep>
          </div>
        {/each}
      </ThinkingSteps>
      {#if job.stage === "cancelled"}
        <p class="m-0 type-meta text-ink-muted" in:crossIn>
          {["Stopped.", job.kept].filter(Boolean).join(" ")}
        </p>
      {/if}
    </div>
    <!-- Cancel and Close are one control in one place: bordered, its edge on
         the glyph column, the foot's whole width on a phone (design 2g). -->
    <div
      data-slot="foot"
      class="flex flex-col items-start gap-space-1 w-(--col-w) group-data-phone/wait:mbs-auto"
    >
      {#if cancellable}
        <Button
          data-foot-button
          class="group-data-phone/wait:w-full"
          failed={refused?.by === "cancel"}
          label="Cancel"
          onclick={cancel}
          pending={stopping}
          pendingLabel="Stopping…"
          variant="secondary"
        />
        {#if !failed}
          <RowFault reason={refusedBy("cancel")} />
        {/if}
      {:else if job.stage === "cancelled"}
        <Button
          data-foot-button
          class="group-data-phone/wait:w-full"
          onclick={() => workspace.close(job.targetInstanceId)}
          variant="secondary">Close</Button
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  /* residual: foreign-dom */
  /* The glyph says where each step stands, in its status ink. */
  [data-slot="row"][data-phase="done"] :global(.icon) {
    color: var(--status-done-glyph);
  }
  [data-slot="row"][data-phase="active"] :global(.icon) {
    color: var(--ink-strong);
  }
  [data-slot="row"][data-phase="failed"] :global(.icon) {
    color: var(--status-fail-glyph);
  }
  [data-slot="row"][data-phase="asking"] :global(.icon) {
    color: var(--status-attn-glyph);
  }
  [data-slot="row"][data-phase="stopped"] :global(.icon) {
    color: var(--ink-muted);
  }
  /* The step's label wraps, never truncates. */
  [data-slot="row"] :global(.label) {
    overflow-wrap: anywhere;
  }

  /* residual: unmapped */
  /* The large file in flight: its path cut from the start (rtl), read from
     the left like every line above it. */
  [data-slot="path"] {
    direction: rtl;
  }
</style>
