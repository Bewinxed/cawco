<script lang="ts">
  /**
   * A machine's harness CLI refused (Claude Code, OpenCode or pi), in place
   * of what it blocks (Claude Code's sign-in, a session's start): why, in the
   * machine's own sentence, and its one fix as a press, Update Claude Code,
   * Update pi, Install OpenCode 2.0.29 (Install, with none there). The fix
   * is the hub's tool cell (harness-block.svelte.ts), so its progress and
   * its outcome come back after a reload, on every dashboard, and go on when
   * this is closed. A failed one says why in the machine's words, and the
   * press reads Retry. Nothing here once the harness runs: the surface it
   * stood in goes on.
   */
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconDownload, IconWarningTriangle } from "#lib/icons.js";
  import { didntAnswer } from "./client.svelte";
  import {
    fixHarness,
    type HarnessBlock,
    harnessWords as words,
  } from "./harness-block.svelte";
  import { failureWords } from "./hub-read";
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
  <div data-slot="row" class="flex min-w-0 flex-wrap items-center gap-space-2">
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
    {#if running}
      <span
        data-slot="progress"
        class="breathe min-w-0 type-meta text-ink-muted"
        role="status">{words.running(block)}</span
      >
    {/if}
  </div>
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
