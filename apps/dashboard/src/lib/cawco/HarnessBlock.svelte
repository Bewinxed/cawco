<script lang="ts">
  /**
   * A machine's harness CLI refused (Claude Code, OpenCode or pi), in place
   * of what it blocks (Claude Code's sign-in, a session's start): why, in the
   * machine's own sentence, and its one fix as a press, Update pi, Install
   * OpenCode 2.0.29 (Install, with none there). A copy CawCo updates by
   * itself (CawCo's own, while the fleet updates such copies: the block's
   * `auto`) takes no press: the block says CawCo is updating it and to
   * which version, or that it waits for the machine's pause to end; only
   * an update that failed offers Retry (`offersPress`). The fix is the hub's tool cell
   * (harness-block.svelte.ts), so its progress and its outcome come back
   * after a reload, on every dashboard, and go on when this is closed. A
   * failed one says why in the machine's words, and the press reads Retry.
   * Nothing here once the harness runs: the surface it stood in goes on.
   */
  import { toolUpdateWords } from "@cawco/core/words/tool-updates";
  import { toolWords } from "@cawco/core/words/tools";
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconDownload, IconNotYet, IconWarningTriangle } from "#lib/icons.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import { appear } from "#lib/platform/motion/curves.svelte.js";
  import {
    fixHarness,
    followHarness,
    type HarnessBlock,
    offersPress,
    harnessWords as words,
  } from "./harness-block.svelte";
  import { didntAnswer } from "./hub/control";
  import { boardStore } from "./stores/board.svelte";
  import { TRY_AGAIN } from "./unanswered";

  let {
    block,
    machineId,
    online,
    relaunch,
  }: {
    block: HarnessBlock;
    machineId: string;
    online: boolean;
    /** A session whose refused start goes again, with nothing to press, once this lands. */
    relaunch?: string;
  } = $props();

  /** Why the press itself didn't reach the machine: said under it until the next press. */
  let refused = $state<string | null>(null);
  /** Between the press and the hub's cell saying `installing`. */
  let asking = $state(false);

  const running = $derived(block.fix.phase === "running");
  /**
   * CawCo updates it with no press (`auto`): the block says so, to which
   * version, and that the session starts once it lands; a machine its
   * owner paused, that it waits for the pause's end.
   */
  const byCawco = $derived(block.auto && block.fix.phase !== "failed");
  const paused = $derived(
    (boardStore.machines.find((one) => one.machineId === machineId)
      ?.pausedUntil ?? null) !== null
  );

  // A copy CawCo updates by itself takes no press, so the block itself
  // follows it: once the update lands, the surface says so and the session
  // waiting on it starts again, as after a press. Written untracked: the
  // follow reads the list it writes.
  $effect(() => {
    if (offersPress(block)) {
      return;
    }
    const on = machineId;
    const { harness } = block;
    const waiting = relaunch;
    untrack(() => followHarness(on, harness, waiting));
  });

  async function press() {
    if (asking || running) {
      return;
    }
    asking = true;
    refused = null;
    try {
      const read = await fixHarness(machineId, block.harness, relaunch);
      if (read.kind === "unanswered") {
        refused = didntAnswer(machineId, read, {
          outcome: `whether ${block.spec.name} is on ${block.machine} now isn't known`,
          again: TRY_AGAIN,
        });
      }
    } catch (error) {
      refused = failureWords(error);
    } finally {
      asking = false;
    }
  }
</script>

<div
  data-slot="harness-block"
  data-harness={block.harness}
  data-phase={block.fix.phase}
  class="flex min-w-0 flex-col gap-space-2"
>
  {#if byCawco}
    <!-- Nothing waits on the person: one line, CawCo's own update with its
         version, the ledger's spinner beside it (the not-yet ring while the
         machine is paused); no warning, and the refusal it answers is not
         said again. -->
    <p
      data-slot="progress"
      class="mark-line flex min-w-0 items-center gap-space-2 type-meta text-ink-strong"
      role="status"
    >
      <span class="mark-cell grid w-icon-md place-items-center"
        >{#if paused && !running}<IconNotYet
            class="size-icon-md text-ink-muted"
          />{:else}<Spinner />{/if}</span
      ><span class="min-w-0"
        >{paused && !running
          ? toolUpdateWords.autoPaused(block.spec.name, block.machine)
          : toolWords.cawcoPutting(
              block.kind === "not-installed",
              block.spec.name,
              block.machine,
              (block.fix.phase === "running" ? block.fix.to : undefined) ??
                block.spec.exactVersion
            )}</span
      >
    </p>
  {:else}
    <p
      data-slot="why"
      class="mark-line type-meta flex items-start gap-space-2 text-ink-strong wrap-anywhere"
    >
      <span class="mark-cell"
        ><IconWarningTriangle
          aria-hidden="true"
          class="size-icon-md flex-none text-status-attn-glyph"
        /></span
      >
      <span class="min-w-0">{block.why}</span>
    </p>
  {/if}
  {#if !byCawco && (offersPress(block) || running)}
    <div
      data-slot="row"
      class="flex min-w-0 flex-wrap items-center gap-space-2"
    >
      {#if offersPress(block)}
        <Button
          disabled={!online}
          failed={block.fix.phase === "failed" || refused !== null}
          icon={IconDownload}
          label={block.fix.phase === "failed" ? "Retry" : words.press(block)}
          onclick={press}
          pending={asking || running}
          pendingLabel={words.pressing(block)}
          size="sm"
          variant="outline"
        />
      {/if}
      {#if running}
        <!-- The live dot breathes beside the words (Live work breathes); the words hold still. -->
        <span
          data-slot="progress"
          class="mark-line flex min-w-0 items-start gap-space-2 type-meta text-ink-muted"
          role="status"
          ><span class="mark-cell"><LiveDot /></span><span class="min-w-0"
            >{words.running(block)}</span
          ></span
        >
      {/if}
    </div>
  {/if}
  {#if refused}
    <p
      data-slot="error"
      class="type-meta text-status-fail-ink whitespace-pre-line wrap-anywhere"
      role="alert"
      in:appear
    >
      {refused}
    </p>
  {:else if block.fix.phase === "failed"}
    <p
      data-slot="error"
      class="type-meta text-status-fail-ink whitespace-pre-line wrap-anywhere"
      role="alert"
      in:appear
    >
      {words.failed(block, block.fix.said)}
    </p>
  {/if}
</div>
