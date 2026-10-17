<script lang="ts">
  import type { Problem, WorkflowOrigin } from "@cawco/core";
  import { crossIn } from "#lib/cawco/motion/curves.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
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

<!-- The problems panel is marked for the program's own reflow: when a
     problem arrives or leaves, the panel's edge slides to its new place
     instead of jumping. -->
<div class="flex min-h-0 flex-1 flex-col" {@attach reflow()}>
  <p
    data-slot="note"
    class="wf-muted border-b border-border-hairline px-space-5 py-space-3 max-wide:px-space-4"
  >
    {#if origin === "editor"}
      Compiled from this graph on save. Edit the graph to change it.
    {:else}
      The program is the workflow. It saves as you type.
    {/if}
  </p>
  <!-- The signature move: the program sits in a recessed well inside a raised
       card, not flat on the page. -->
  <!-- literal: 320px -->
  <div
    data-slot="code"
    class="mx-space-5 mt-space-4 mb-space-5 min-h-(--code-min) min-w-0 flex-1 rounded-md bg-surface-raised p-space-2 shadow-tile max-wide:mx-space-4"
    style:--code-min="320px"
  >
    <CodeView
      {editable}
      label="Workflow program"
      {onchange}
      problems={lined}
      value={program}
    />
  </div>
  {#if origin === "code"}
    <!-- The count and the all-clear cross-fade in one grid cell; problems
         come and go the house way (motion/rows). -->
    <!-- literal: 30dvh -->
    <section
      aria-label="Problems"
      class="wf-stack max-h-(--problems-max) gap-space-2 overflow-y-auto border-t border-border-hairline bg-surface-raised px-space-5 pt-space-4 pb-space-5 max-wide:px-space-4"
      data-flip
      style:--problems-max="30dvh"
      {@attach reflow()}
    >
      <div data-slot="head" class="grid">
        {#key problems.length > 0}
          <div class="col-start-1 row-start-1" transition:crossIn>
            {#if problems.length}
              <h2 data-slot="num" class="num">Problems · {problems.length}</h2>
            {:else}
              <p class="wf-muted">
                The hub compiled and typechecked this program. No problems
                found.
              </p>
            {/if}
          </div>
        {/key}
      </div>
      {#each problems as problem, index (index)}
        <p
          class="rounded-sm bg-surface-recess p-space-3 wrap-anywhere"
          data-flip
        >
          {#if problem.line}
            <span class="me-space-2 text-ink-muted num">Line {problem.line}</span>
          {/if}
          {problem.line ? withoutLine(problem.message) : problem.message}
        </p>
      {/each}
    </section>
  {/if}
</div>
