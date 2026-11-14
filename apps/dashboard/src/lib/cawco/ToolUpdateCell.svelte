<script lang="ts">
  /**
   * Where one machine's copy of one tool stands against the version CawCo
   * runs (core tool-updates.ts `ToolUpdateState`), as a ledger's State cell
   * draws it: the state's glyph and words in meta at the column's start, and
   * its one press at the column's end. Configure › Command-line tools draws
   * it in each tool's ledger and in the Out of date group alike.
   *
   * - `runs`: the tick; "Updated 13m ago" when CawCo's own install put it
   *   there. A copy the person installed (`ownCopy`): "Your own install",
   *   whose words open what Hand to CawCo does, the press at that layer's
   *   foot and nowhere else, since it replaces his copy.
   * - `updating`: the spinner.
   * - `failed`: "Update failed", whose words open why: the installer's line
   *   that says so (core `causeOf`), what is safe and the next step, its
   *   whole output folded under them; Retry.
   * - `own`: "Your own install", whose words open what it costs and what
   *   Update does to it; Update.
   * - `asked`: waiting for the person's Update, and Update.
   * - `due`: CawCo sends it as soon as it can: offline, paused, or queued.
   *
   * Offline, a press can't reach the machine: the update stands and its press
   * is off (the machine's own column says offline). A refused press is said
   * under the row by its host, and this row's press is the way on.
   */
  import type { ToolUpdateState } from "@cawco/core/tool-updates";
  import type { ToolSpec } from "@cawco/core/tools";
  import { toolUpdateWords as words } from "@cawco/core/words/tool-updates";
  import type { Snippet } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconCheck,
    IconNeedsYou,
    IconNotYet,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { span } from "./span";
  import { minute } from "./stores/clock.svelte";
  import {
    pressInstall,
    pressPending,
    pressRefused,
  } from "./tool-presses.svelte";

  let {
    blocks,
    machineId,
    machine,
    method,
    online,
    ownCopy = false,
    paused,
    spec,
    update,
  }: {
    /**
     * The copy can't run, so sessions on it are refused; false for a copy
     * CawCo put there that runs while a newer release is out.
     */
    blocks: boolean;
    machineId: string;
    /** Its name, as the fleet says it. */
    machine: string;
    /** The install method that put the copy there, beside the output's head. */
    method?: string;
    online: boolean;
    /** On `runs`: the copy is the person's own, which Hand to CawCo replaces. */
    ownCopy?: boolean;
    /** Its owner paused it: nothing CawCo starts runs there until it ends. */
    paused: boolean;
    spec: ToolSpec;
    update: ToolUpdateState;
  } = $props();

  const pending = $derived(pressPending(machineId, spec.id));
  const failed = $derived(pressRefused(machineId, spec.id) !== undefined);
  const press = () => pressInstall(machineId, spec.id);
  /** The failed layer's whole output, unfolded. */
  let outputShown = $state(false);
</script>

{#snippet act(label: string, pendingLabel: string = words.pressing)}
  <Button
    disabled={!online}
    {failed}
    {label}
    onclick={press}
    {pending}
    {pendingLabel}
    size="xs"
    variant="outline"
  />
{/snippet}

<!-- A state's layer: its head, what it says, the press at its foot. Never
     taller than the room the viewport leaves it: the head and the foot stand,
     and what it says scrolls between them, so the press is always in reach
     whatever the installer's output holds. -->
{#snippet layer(
  head: string,
  body: Snippet,
  label: string,
  pendingLabel?: string
)}
  <Popover.Content
    align="start"
    frame="panel-high"
    gap="none"
    height="available"
    overflow="clip"
    pad="none"
    width="widest"
  >
    <header
      class="flex flex-none items-baseline gap-space-1 border-b border-border-hairline px-space-3 py-space-2"
    >
      <span class="type-label text-ink-strong">{head}</span>
      {#if method}
        <code class="ml-auto shrink-0 type-code text-ink-muted">{method}</code>
      {/if}
    </header>
    <div
      class="flex min-h-0 flex-auto flex-col gap-space-2 overflow-y-auto overscroll-contain px-space-3 py-space-2"
    >
      {@render body()}
    </div>
    <footer
      class="flex-none border-t border-border-hairline px-space-3 py-space-2"
    >
      {@render act(label, pendingLabel)}
    </footer>
  </Popover.Content>
{/snippet}

<!-- The words that open a layer: the visible label leads its name. -->
{#snippet opener(label: string, ink: string, about: string)}
  <Popover.Trigger aria-label="{label}: {about}" look="mark"
    ><span class={ink}>{label}</span></Popover.Trigger
  >
{/snippet}

<span
  class="flex w-full min-w-0 items-center justify-between gap-space-3"
  data-update={update.kind}
>
  <span
    class="mark-line inline-flex min-w-0 items-center gap-space-2 type-meta text-ink-muted"
  >
    <span class="mark-cell grid w-icon-md flex-none place-items-center">
      {#if update.kind === "runs"}
        <IconCheck
          aria-label={update.updatedAt === undefined && !ownCopy
            ? words.current
            : undefined}
          class="size-icon-md text-status-done-glyph"
        />
      {:else if update.kind === "updating"}
        <Spinner />
      {:else if update.kind === "failed"}
        <IconWarningTriangle class="size-icon-md text-status-fail-glyph" />
      {:else if update.kind === "own" || (update.kind === "asked" && blocks)}
        <IconNeedsYou class="size-icon-md text-status-attn-glyph" />
      {:else}
        <IconNotYet class="size-icon-md" />
      {/if}
    </span>
    {#if update.kind === "runs" && ownCopy}
      {#snippet takeOver()}
        <p class="type-body text-pretty text-ink-strong">
          {words.takeOverWhy(spec.name)}
        </p>
      {/snippet}
      <Popover.Root>
        {@render opener(
          words.ownRuns,
          "text-ink-muted",
          words.ownHead(spec.name, machine)
        )}
        {@render layer(
          words.ownHead(spec.name, machine),
          takeOver,
          words.takeOver,
          "Installing…"
        )}
      </Popover.Root>
    {:else if update.kind === "runs"}
      {#if update.updatedAt !== undefined}
        {@const ago = span(minute.now - update.updatedAt)}
        <span class="num">{words.updated(ago === "now" ? null : ago)}</span>
      {/if}
    {:else if update.kind === "updating"}
      <span class="text-ink-strong"
        >{words.updating(spec.exactVersion ? undefined : update.to)}</span
      >
    {:else if update.kind === "failed"}
      {@const head = words.failedHead(spec.name, update.wants, machine)}
      {#snippet why()}
        {#if update.kind === "failed"}
          {#if update.cause}
            <code
              class="type-code whitespace-pre-wrap wrap-anywhere text-ink-strong"
              >{update.cause}</code
            >
          {:else if !update.output}
            <p class="type-body text-ink-strong">{words.failedSilent}</p>
          {/if}
          <p class="type-meta text-pretty text-ink-muted">
            {words.failedNext(machine, update.found)}
          </p>
          {#if update.output}
            <button
              aria-controls="tool-output-{machineId}-{spec.id}"
              aria-expanded={outputShown}
              class="pointer-hit self-start rounded-xs type-meta text-link-ink hover:text-link-hover"
              onclick={() => {
                outputShown = !outputShown;
              }}
              type="button"
              >{outputShown ? words.hideOutput : words.showOutput}</button
            >
            {#if outputShown}
              <pre
                id="tool-output-{machineId}-{spec.id}"
                class="flex-none rounded-xs bg-surface-recess px-space-2 py-space-1 type-code whitespace-pre-wrap wrap-anywhere text-ink-muted"
                transition:unfold>{update.output}</pre>
            {/if}
          {/if}
        {/if}
      {/snippet}
      <Popover.Root
        onOpenChange={(open) => {
          if (!open) {
            outputShown = false;
          }
        }}
      >
        {@render opener(words.failed, "text-status-fail-ink", head)}
        {@render layer(head, why, words.retry)}
      </Popover.Root>
    {:else if update.kind === "own"}
      {@const head = words.ownHead(spec.name, machine)}
      {#snippet costs()}
        {#if update.kind === "own"}
          <p class="type-body text-pretty text-ink-strong">
            {words.ownWhy(spec.name, update.wants)}
          </p>
        {/if}
      {/snippet}
      <Popover.Root>
        {@render opener(words.own, "text-ink-strong", head)}
        {@render layer(head, costs, words.update)}
      </Popover.Root>
    {:else if update.kind === "asked" && !blocks}
      <span class="num">{words.newer(update.wants.version)}</span>
    {:else if update.kind === "asked"}
      <span class="text-ink-strong">{words.asked}</span>
    {:else if !online}
      <span>{words.dueAway}</span>
    {:else if paused}
      <span>{words.duePaused}</span>
    {:else}
      <span>{words.dueNow}</span>
    {/if}
  </span>
  {#if update.kind === "failed"}
    {@render act(words.retry)}
  {:else if update.kind === "own" || update.kind === "asked"}
    {@render act(words.update)}
  {/if}
</span>
