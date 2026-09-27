<script lang="ts">
  import type { Problem, WorkflowOrigin } from "@whiffle/core";
  import CodeView from "./CodeView.svelte";
  import { withoutLine } from "./workflow-ui";

  let {
    origin,
    program,
    problems = [],
    live,
    onchange,
  }: {
    live: boolean;
    onchange?: (program: string) => void;
    origin: WorkflowOrigin;
    problems?: Problem[];
    program: string;
  } = $props();
  const editable = $derived(origin === "code" && live);
  /** A diagnostic without a line is about the program as a whole. */
  const lined = $derived(problems.filter((problem) => problem.line));
  /** The hub prefixes a diagnostic with its line; the chip already says it. */
</script>
<div class="program">
  <p class="wf-muted note">
    {#if origin === 'editor'}
      Compiled from this graph on save. Edit the graph to change it.
    {:else}
      The program is the workflow. It saves as you type.
    {/if}
  </p>
  <div class="code">
    <CodeView
      {editable}
      label="Workflow program"
      {onchange}
      problems={lined}
      value={program}
    />
  </div>
  {#if origin === 'code'}
    <section aria-label="Problems" class="problems wf-stack">
      {#if problems.length}
        <h2>Problems · {problems.length}</h2>
      {:else}
        <p class="wf-muted">
          The hub compiled and typechecked this program. No problems found.
        </p>
      {/if}
      {#each problems as problem, index (index)}
        <p class="problem">
          {#if problem.line}
            <span class="line">Line {problem.line}</span>
          {/if}
          {problem.line ? withoutLine(problem.message) : problem.message}
        </p>
      {/each}
    </section>
  {/if}
</div>
<style>
  .program {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .note {
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--border-hairline);
  }
  /* The signature move: the program sits in a recessed well inside a raised
     card, not flat on the page. */
  .code {
    flex: 1;
    min-height: 320px;
    margin: var(--space-4) var(--space-5) var(--space-5);
    padding: var(--space-2);
    background: var(--surface-raised);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-tile);
    min-width: 0;
  }
  .problems {
    gap: var(--space-2);
    padding: var(--space-4) var(--space-5) var(--space-5);
    border-top: 1px solid var(--border-hairline);
    background: var(--surface-raised);
    max-height: 30dvh;
    overflow-y: auto;
  }
  .problem {
    padding: var(--space-3);
    background: var(--surface-recess);
    border-radius: var(--radius-sm);
    overflow-wrap: anywhere;
  }
  .line {
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
    margin-inline-end: var(--space-2);
  }
  @media (max-width: 1023px) {
    .note,
    .problems {
      padding-inline: var(--space-4);
    }
    .code {
      margin-inline: var(--space-4);
    }
  }
</style>
