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
  import { toast } from "../toasts";
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

  let stopping = $state(false);
  /** Cancel: the hub stops the step in flight; the tab closes and says what stayed on disk. */
  async function cancel(): Promise<void> {
    stopping = true;
    try {
      const stopped = await cancelMove(job.id);
      toast(["Stopped.", stopped.kept].filter(Boolean).join(" "));
      workspace.close(job.targetInstanceId);
    } catch (cause) {
      toast.error("Couldn't stop the move", {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      stopping = false;
    }
  }

  let retrying = $state(false);
  async function retry(): Promise<void> {
    retrying = true;
    try {
      await retryMove(job.id);
    } catch (cause) {
      toast.error("Couldn't retry the move", {
        description: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      retrying = false;
    }
  }

  /** A Cancel the hub can still act on: not once the session is starting. */
  const cancellable = $derived(waiting && job.stage !== "start");
</script>

<div class="wait" class:phone>
  <div class="caw" class:empty={!cawThere}>
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
    <div class="column" in:crossIn>
      <ThinkingSteps>
        {#each rows as row, index (row.step)}
          <div class="row" data-phase={row.phase} out:unfold>
            <ThinkingStep
              icon={GLYPHS[row.phase]}
              isLast={index === rows.length - 1}
              label={row.label}
              status={STATUS[row.phase]}
            >
              {#if row.step === "snapshot" &&
                job.snapshot?.branch &&
                row.phase !== "ahead"}
                <code class="sub mono">{job.snapshot.branch}</code>
              {/if}
              {#if (row.step === "clone" || row.step === "lfs") &&
                row.phase === "active" &&
                job.progress}
                {@const progress = job.progress}
                <div class="bytes" in:unfold out:unfold>
                  <Progress
                    aria-label={row.label}
                    value={share(progress.bytes, progress.total)}
                  />
                  <span class="meta num"
                    >{share(progress.bytes, progress.total)}% ·
                    {partWords(progress.bytes, progress.total)}{left
                      ? ` · ${left}`
                      : ""}</span
                  >
                </div>
              {/if}
              <!-- The file in flight, when it is one of several: alone, it is
                   the stage, and its row would repeat the bar above. -->
              {#if row.step === "lfs" &&
                row.phase === "active" &&
                job.lfsFile &&
                (job.lfs?.files ?? 0) > 1}
                {@const file = job.lfsFile}
                <div class="file" in:unfold out:unfold>
                  {#key file.file}
                    <span class="path" title={file.file} in:crossIn out:crossOut
                      ><bdi>{file.file}</bdi></span
                    >
                  {/key}
                  <Progress
                    class="file-bar"
                    value={share(file.bytes, file.total)}
                  />
                  <span class="meta num"
                    >{partWords(file.bytes, file.total)}</span
                  >
                </div>
              {/if}
              {#if row.step === "install" &&
                (row.phase === "active" || row.phase === "failed") &&
                job.install}
                <code class="sub mono">{job.install.command}</code>
              {/if}
              {#if row.phase === "asking" && job.ask}
                <div class="card" in:unfold out:unfold>
                  <p class="card-title">{job.ask.title}</p>
                  <MoveAskBody ask={job.ask} />
                  <div class="answers">
                    <Button
                      disabled={answered !== null}
                      onclick={() => answer(DONT_MOVE)}
                      size="sm"
                      variant="secondary"
                    >
                      <IconClose class="deny" />
                      {DONT_MOVE}
                    </Button>
                    <!-- The yes is the action, coral as in New session's step 2. -->
                    <Button
                      disabled={answered !== null}
                      onclick={() => answer(MOVE_IT)}
                      size="sm"
                    >
                      <IconTick />
                      {MOVE_IT}
                    </Button>
                  </div>
                </div>
              {/if}
              {#if row.phase === "failed" && job.error}
                <div class="failure" in:unfold out:unfold>
                  <Alert role="alert" variant="destructive">
                    <IconError />
                    <!-- The machine's words, unless they only repeat the step's. -->
                    {#if job.error.message !== row.label}
                      <AlertTitle>{job.error.message}</AlertTitle>
                    {/if}
                    <AlertDescription>
                      {#if job.error.detail}
                        <code class="detail mono">{job.error.detail}</code>
                      {/if}
                      {#if job.error.stage === "clone"}
                        <span>The partial clone is removed first.</span>
                      {/if}
                      <span class="alert-actions">
                        <Button
                          disabled={stopping}
                          onclick={cancel}
                          size="sm"
                          variant="secondary"
                          >Cancel</Button
                        >
                        <Button
                          disabled={retrying}
                          onclick={retry}
                          size="sm"
                          variant="secondary"
                          >Retry</Button
                        >
                      </span>
                    </AlertDescription>
                  </Alert>
                </div>
              {/if}
            </ThinkingStep>
          </div>
        {/each}
      </ThinkingSteps>
      {#if job.stage === "cancelled"}
        <p class="stopped" in:crossIn>
          {["Stopped.", job.kept].filter(Boolean).join(" ")}
        </p>
      {/if}
    </div>
    <!-- Cancel and Close are one control in one place: bordered, its edge on
         the glyph column, the foot's whole width on a phone (design 2g). -->
    <div class="foot">
      {#if cancellable}
        <Button
          class="foot-button"
          disabled={stopping}
          onclick={cancel}
          variant="secondary"
          >Cancel</Button
        >
      {:else if job.stage === "cancelled"}
        <Button
          class="foot-button"
          onclick={() => workspace.close(job.targetInstanceId)}
          variant="secondary"
          >Close</Button
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  /* The wait fills the transcript area, centred in it, on its plain recess. */
  .wait {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-5);
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    padding: var(--space-8) var(--space-6);
    background: var(--surface-recess);
  }
  .caw {
    display: grid;
    place-items: center;
    min-block-size: 128px;
  }
  .phone .caw {
    min-block-size: 96px;
  }
  .caw.empty {
    visibility: hidden;
  }
  .column,
  .foot {
    inline-size: min(560px, 100%);
  }
  .column {
    display: grid;
    gap: var(--space-3);
  }
  .row {
    min-inline-size: 0;
  }
  /* The glyph says where each step stands, in its status ink. */
  .row[data-phase="done"] :global(.icon) {
    color: var(--status-done-glyph);
  }
  .row[data-phase="active"] :global(.icon) {
    color: var(--ink-strong);
  }
  .row[data-phase="failed"] :global(.icon) {
    color: var(--status-fail-glyph);
  }
  .row[data-phase="asking"] :global(.icon) {
    color: var(--status-attn-glyph);
  }
  .row[data-phase="stopped"] :global(.icon) {
    color: var(--ink-muted);
  }
  /* The step's label wraps, never truncates. */
  .row :global(.label) {
    overflow-wrap: anywhere;
  }
  .sub {
    font: var(--type-code);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .bytes {
    display: grid;
    gap: var(--space-1);
    padding-block-start: var(--space-1);
  }
  .meta {
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
  /* The large file in flight: its path cut from the start, its own bar. */
  .file {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 96px auto;
    align-items: center;
    gap: var(--space-2);
  }
  /* Cut from the start (rtl), read from the left like every line above it. */
  .path {
    grid-area: 1 / 1;
    overflow: hidden;
    direction: rtl;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-code);
    color: var(--ink-muted);
  }
  /* The approval: the permission card's recipe, standing in its step. */
  .card {
    display: grid;
    gap: var(--space-3);
    margin-block-start: var(--space-1);
    padding: 11px;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-stat);
  }
  .card-title {
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  /* The no at the start, the yes (the action) at the end. */
  .answers {
    display: flex;
    justify-content: space-between;
    gap: var(--space-8);
  }
  .answers :global(svg.deny) {
    color: var(--ink-muted);
  }
  .failure {
    margin-block-start: var(--space-1);
  }
  .detail {
    display: block;
    font: var(--type-code);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .alert-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-block-start: var(--space-2);
  }
  .stopped {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .foot {
    display: flex;
  }
  /* On a phone Cancel is the foot's whole width, clear of the safe area. */
  .phone {
    justify-content: flex-start;
    padding: var(--space-6) var(--space-4)
      calc(var(--space-4) + env(safe-area-inset-bottom));
  }
  .phone .foot {
    margin-block-start: auto;
  }
  .phone .foot :global(.foot-button) {
    inline-size: 100%;
  }
  .phone .answers {
    gap: var(--space-4);
  }
</style>
