<script lang="ts">
  /**
   * The permission card's body as main draws it on 10-24, kept beside the
   * sentence card (ApprovalCard) only so its states file can set the two
   * side by side for the owner's pick. Whichever he picks, this file goes:
   * picked, it moves back into Prompt as the one body; not picked, it is
   * deleted with Prompt's `look`.
   *
   * What will happen and why, then the command or the change itself: a
   * grant is made on what runs, never on a sentence about it alone. The
   * words are the hub's (core permission-presentation.ts), the same on iOS;
   * secrets in the fields are already hidden.
   */
  import type { PermissionPresentation } from "@cawco/core";
  import { askWords } from "@cawco/core";
  import { untrack } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import DiffView from "#lib/components/features/DiffView.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronDown } from "#lib/icons.js";

  let {
    presentation,
    reasoned,
  }: {
    presentation: PermissionPresentation;
    /** The session gave a reason for its command: the command starts on one line. */
    reasoned: boolean;
  } = $props();

  /**
   * The command under the reason: one line until opened, so the sentence
   * leads. The disclosure is offered only when there is more than the line
   * shows: a second line, or a first line wider than the card.
   */
  // Open from the start when the session gave no reason: then the command is
  // all there is to read. The card is keyed by its ask, so this is per ask.
  let commandOpen = $state(untrack(() => !reasoned));
  let commandLine = $state<HTMLElement | null>(null);
  let commandClipped = $state(false);
  const command = $derived(presentation.command ?? null);
  $effect(() => {
    const node = commandLine;
    const whole = command;
    if (!(node && whole)) {
      commandClipped = false;
      return;
    }
    const measure = () => {
      commandClipped =
        whole.trim().includes("\n") || node.scrollWidth > node.clientWidth;
    };
    // Read now, and a change in the next frame (frameObserver): the line's
    // disclosure comes and goes on it.
    measure();
    const sizes = frameObserver(measure);
    sizes.observe(node);
    return () => sizes.disconnect();
  });
</script>

<div
  data-slot="body"
  class="relative flex-auto min-h-0 min-w-0 overflow-y-auto overscroll-contain opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
  style:--part="1"
  style:--part-delay="calc(var(--part) * var(--dur-stagger))"
>
  <!-- What will happen, in the title's weight: the line the grant is
       made on. -->
  <p
    data-slot="lede"
    class="text-size-body font-medium leading-body text-ink-strong mb-space-1 max-w-c-measure wrap-anywhere text-pretty"
  >
    {presentation.summary}
  </p>
  <!-- How much it changes and where, under it. -->
  {#if presentation.detail}
    <p
      data-slot="detail"
      class="text-size-label font-normal text-ink-muted mb-space-2"
    >
      {presentation.detail}
    </p>
  {/if}
  <!-- The command under the reason, in the transcript's command rule:
       one line, cut with an ellipsis, until its chevron opens it whole. -->
  {#if command}
    <div
      class="group/cmd flex items-start gap-space-2 border-s-2 border-s-border-hairline py-space-1 ps-space-3 mb-space-2"
      data-open={commandOpen || undefined}
    >
      <code
        data-slot="cmd-text"
        class="flex-auto min-w-0 font-mono text-size-label text-ink-muted overflow-hidden text-ellipsis whitespace-pre group-data-open/cmd:text-ink-strong group-data-open/cmd:whitespace-pre-wrap group-data-open/cmd:wrap-anywhere"
        bind:this={commandLine}
        >{commandOpen ? command : command.trim().split("\n")[0]}</code
      >
      {#if commandOpen || commandClipped}
        <Button
          data-cmd-toggle
          aria-expanded={commandOpen}
          aria-label={commandOpen
            ? askWords.commandOnOneLine
            : askWords.wholeCommand}
          class="touch-hit flex-none -my-space-1"
          tone="muted"
          onclick={() => {
            commandOpen = !commandOpen;
          }}
          size="icon-xs"
          title={commandOpen ? "Show less" : askWords.wholeCommand}
          variant="ghost"
        >
          <IconChevronDown
            class="motion-safe:transition-[rotate] motion-safe:duration-(--dur-control) motion-safe:ease-drawer group-data-open/cmd:rotate-180"
          />
        </Button>
      {/if}
    </div>
  {/if}
  <!-- The change itself, open: each diff stands to the token's share of
       the screen and scrolls inside it, so the answer row stays in
       reach. -->
  {#if presentation.changes.length > 0}
    <div class="flex flex-col gap-space-2 mb-space-2">
      {#each presentation.changes as change, i (i)}
        <DiffView
          cap="calc(var(--c-ask-diff-share) * 100dvh)"
          filePath={change.path}
          newContent={change.after}
          oldContent={change.before}
        />
      {/each}
    </div>
  {/if}
  <!-- The rest of the input, shown rather than disclosed: each field's
       name over its value, values that run long scrolling in place. -->
  {#if presentation.fields.length > 0}
    <dl
      class="flex flex-col gap-space-2 mb-space-3 p-space-3 rounded-sm bg-surface-recess"
    >
      {#each presentation.fields as field, i (`${i}:${field.key}`)}
        <div data-slot="prompt-field" class="flex flex-col gap-space-1 min-w-0">
          <dt class="text-size-label font-medium text-ink-muted">
            {field.key}
          </dt>
          <dd
            class="max-h-c-ask-value-max-h overflow-auto font-(family-name:--font-mono) text-size-meta text-ink-strong whitespace-pre-wrap break-words"
          >
            {field.value}
          </dd>
        </div>
      {/each}
    </dl>
  {/if}
</div>
