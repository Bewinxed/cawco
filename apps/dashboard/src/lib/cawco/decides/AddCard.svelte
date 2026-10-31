<script lang="ts">
  /**
   * Add a member, the roster's last card: dashed until its settings stand
   * open from it, then edged in coral. With a new member's draft closed
   * before adding, it offers it back ("Resume Release checker"). The whole
   * card is the press that opens it.
   */
  import { decidesWords } from "@cawco/core/words/decides";
  import { IconPlus } from "#lib/icons.js";

  let {
    open,
    resume,
    card = $bindable(),
    props,
  }: {
    /** Its settings stand open, hung from it. */
    open: boolean;
    /** A parked new member's name ("" for none yet); null with no draft parked. */
    resume: string | null;
    card?: HTMLElement | null;
    /** The popover trigger's props. */
    props: Record<string, unknown>;
  } = $props();
</script>

<!-- mark-line: the plus stands over its words, a column, not beside them -->
<button
  {...props}
  bind:this={card}
  class={[
    "row-span-3 flex min-h-c-touch-floor min-w-0 flex-col items-center justify-center gap-space-2 rounded-lg border-2 p-space-4 text-center transition-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid",
    open
      ? "border-brand-solid bg-surface-raised"
      : "border-dashed border-border-control can-hover:hover:bg-surface-hover",
  ]}
  data-add-member
  type="button"
>
  <span
    class="grid size-c-roster-face place-items-center rounded-lg bg-surface-recess-deep text-ink-muted"
  >
    <IconPlus aria-hidden="true" class="size-icon-md" />
  </span>
  <span class="type-body font-medium text-ink-strong wrap-anywhere">
    {resume === null ? decidesWords.addMember : decidesWords.resume(resume)}
  </span>
  <span class="max-w-c-measure type-meta text-ink-muted text-pretty">
    {decidesWords.addMemberNote}
  </span>
</button>
