<script lang="ts">
  /**
   * Run 12 as its pane holds it, on a desk beside the Workflows view or on
   * its own page on a phone: the run's delegation tree (or, option C, the
   * workflow's canvas lit by the run), the asking step's question opened in
   * place, the checks judged so far, and the orchestrator's composer at the
   * foot. Fixture for the Workflows option canvases.
   */
  import RunStatus from "#lib/cawco/routines/RunStatus.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { sendVariants } from "#lib/components/ui/button/index.js";
  import { dockShellVariants } from "#lib/components/ui/dock-shell/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconSend } from "#lib/icons.js";
  import { CHECKS, RUN_12 } from "./release";
  import { runTree } from "./run-tree";
  import WfQuestion from "./WfQuestion.svelte";
  import WfShape from "./WfShape.svelte";
  import WfTree from "./WfTree.svelte";

  let {
    phone = false,
    canvas = false,
    drift = false,
  }: {
    phone?: boolean;
    /** Option C: the run is the workflow's own canvas, lit. */
    canvas?: boolean;
    /** Option D: drawn against the kept run, the unplanned step marked. */
    drift?: boolean;
  } = $props();

  const root = $derived(runTree({ phone, drift }));
  const judged = CHECKS.filter((check) => check.now !== null).length;
</script>

<div
  data-slot="wf-run"
  class="flex min-h-0 min-w-0 flex-auto flex-col gap-space-4"
>
  {#if canvas}
    <div class="h-c-decision-graph-min-h min-w-0">
      <WfShape
        compact={phone}
        label="Release 2.4, run 12, as its canvas"
        lit={RUN_12}
        tools={!phone}
      />
    </div>
    <section
      aria-label="Step 4 asks you"
      class="flex flex-col rounded-lg border border-status-attn-ink bg-surface-raised pt-space-2"
    >
      <p
        class="mark-line m-0 flex items-center gap-space-2 px-space-3 type-label text-status-attn-ink"
      >
        <span>Step 4 · Ask me</span>
      </p>
      <WfQuestion indent="var(--space-3)" />
    </section>
  {:else}
    <WfTree label="Run 12's steps" compact={phone} {root}>
      {#snippet under(node)}
        {#if node.id === "channel"}
          <WfQuestion />
        {:else if node.unplanned}
          <div
            class="flex flex-wrap items-center gap-space-2 pe-space-3 pb-space-2 ps-(--at)"
            style:--at="calc(var(--space-3) + var(--c-row-mark) + var(--space-2))"
          >
            <Button size="xs" variant="outline">Keep in the workflow</Button>
            <Button size="xs" variant="ghost">Leave it out</Button>
          </div>
        {/if}
      {/snippet}
    </WfTree>
  {/if}
  {#if drift}
    <p class="m-0 px-space-3 type-meta text-ink-muted">
      Against the kept run 7: 1 step added, none missed.
    </p>
  {/if}
  <section
    aria-labelledby="wf-checks-now"
    class="flex flex-col gap-space-2 px-space-3"
  >
    <h3
      id="wf-checks-now"
      class="mark-line m-0 flex items-center gap-space-2 type-label text-ink-strong"
    >
      <span>Checks so far</span>
      <span class="num type-meta text-ink-muted">{judged} of {CHECKS.length}</span>
    </h3>
    <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
      {#each CHECKS as check (check.sentence)}
        <li class="flex min-w-0">
          <RunStatus
            status={check.now === null ? "neutral" : check.now ? "done" : "failed"}
            text={check.now === null
              ? `${check.sentence} · judged when the run ends`
              : check.sentence}
          />
        </li>
      {/each}
    </ul>
  </section>
  <div
    class="mt-auto px-space-3 pb-space-3 max-phone:sticky max-phone:bottom-space-3"
  >
    <div
      class={dockShellVariants({
        class: "flex items-end gap-space-2 p-c-composer-inset",
      })}
    >
      <Textarea
        aria-label="Message the orchestrator"
        area={false}
        class="flex-auto"
        look="note"
        placeholder="Message the orchestrator…"
        rows={1}
      />
      <button
        aria-label="Send"
        class={sendVariants({ class: "select-none touch-hit" })}
        disabled
        type="button"
      >
        <IconSend aria-hidden="true" />
      </button>
    </div>
  </div>
</div>
