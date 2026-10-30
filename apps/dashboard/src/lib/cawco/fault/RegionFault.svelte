<script lang="ts">
  /**
   * What a part of the dashboard shows in its own place when it stops on a
   * render error (RegionBoundary's `failed`), standing inside the chrome that
   * outlives it: a design proposal, drawn on its canvas (fault/preview).
   *
   * - `region`: a part with a body of its own (the preview's well, a page,
   *   the sessions): the house empty recipe with the alert glyph, as the
   *   browser view's failures stand (DESIGN.md, Browser view › Failures):
   *   what couldn't be drawn, why and what happens next, what is kept, then
   *   its ways on in a row and Show details over the error word for word.
   * - `line`: a part that is one list or one strip (the comments, the
   *   project tree, the tabs): the house fault line (RowFault) in the list's
   *   place, the rest of its surface still working.
   * - `today`: the alert that ships, for comparison.
   *
   * `again`: the rebuild threw again at once on the same data, so Try again
   * can't help: the way on is Reload page, which reads everything fresh
   * from the hub (a reload is safe: DESIGN.md, Update toast).
   */
  import { commonWords } from "@cawco/core/words/common";
  import { regionFaultWords } from "@cawco/core/words/region-fault";
  import { shellWords } from "@cawco/core/words/shell";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconBug, IconRefresh } from "#lib/icons.js";

  let {
    face = "region",
    what,
    kept,
    again = false,
    details,
    askCaw = false,
    todayName = "side panel",
    onretry = () => undefined,
    onreload = () => undefined,
    onask = () => undefined,
  }: {
    face?: "region" | "line" | "today";
    /** The part, as a sentence names it: "the preview", "these tabs". */
    what: string;
    /** What is safe, where the person would fear for it: "Its page and comments are kept on the hub." */
    kept?: string;
    again?: boolean;
    /** The error word for word, under Show details. */
    details: string;
    /** Ask Caw to fix it stands beside the way on. */
    askCaw?: boolean;
    /** The region's name as the shipping alert says it. */
    todayName?: string;
    onretry?: () => void;
    onreload?: () => void;
    onask?: () => void;
  } = $props();

  let shown = $state(false);
  const detailsId = $props.id();
</script>

{#if face === "today"}
  <div class="min-w-0 p-space-3">
    <Alert class="w-fit max-w-full" variant="destructive">
      <AlertDescription
        >The {todayName} stopped after an error. The rest of the page still works.
        Try again to rebuild it.</AlertDescription
      >
      <AlertAction>
        <Button
          label={commonWords.tryAgain}
          onclick={onretry}
          size="xs"
          variant="outline"
        />
      </AlertAction>
    </Alert>
  </div>
{:else if face === "line"}
  <RowFault
    again={again ? onreload : onretry}
    againLabel={again ? regionFaultWords.reloadPage : commonWords.tryAgain}
    againPending={again ? regionFaultWords.reloading : "Trying again…"}
    {details}
    end="var(--space-3)"
    indent="var(--space-3)"
    reason={again
      ? regionFaultWords.lineAgain(what)
      : regionFaultWords.line(what)}
  />
{:else}
  <div class="min-w-0" data-slot="region-fault" role="alert">
    <EmptyState pad="pane" title={regionFaultWords.couldntDraw(what)}>
      {#snippet mark()}
        <!-- The empty recipe's 20px mark, in the failed status's glyph ink:
             what stands here ended badly (DESIGN.md, Tertiary: status). The
             bug says the why the line says; the bare exclamation read as a
             stray 2px tick at 20px. -->
        <IconBug
          aria-hidden="true"
          class="mb-space-1 size-icon-lg text-status-fail-glyph"
          data-slot="empty-mark"
        />
      {/snippet}
      {#snippet line()}
        {again ? regionFaultWords.again : regionFaultWords.why}
        {#if kept && !again}{kept}{/if}
      {/snippet}
      {#snippet action()}
        <div class="flex flex-wrap items-center gap-space-2">
          {#if again}
            <Button
              icon={IconRefresh}
              label={regionFaultWords.reloadPage}
              onclick={onreload}
              size="sm"
              variant="outline"
            />
          {:else}
            <Button
              icon={IconRefresh}
              label={commonWords.tryAgain}
              onclick={onretry}
              size="sm"
              variant="outline"
            />
          {/if}
          {#if askCaw}
            <Button
              label={regionFaultWords.askCaw}
              onclick={onask}
              size="sm"
              variant="outline"
            />
          {/if}
          <Button
            aria-controls={detailsId}
            aria-expanded={shown}
            data-details
            label={shown ? shellWords.hideDetails : shellWords.showDetails}
            onclick={() => {
              shown = !shown;
            }}
            size="sm"
            variant="ghost"
          />
        </div>
        {#if shown}
          <p
            class="m-0 mt-space-2 text-ink-muted type-code liga-none whitespace-pre-wrap wrap-anywhere"
            data-slot="details"
            id={detailsId}
          >
            {details}
          </p>
        {/if}
      {/snippet}
    </EmptyState>
  </div>
{/if}
