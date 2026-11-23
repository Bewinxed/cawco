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
    "row-span-3 flex min-h-control-lg min-w-0 flex-col items-center justify-center gap-space-2 rounded-lg border-2 p-space-4 text-center transition-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:outline-solid",
    open
      ? "border-accent bg-bg"
      : "border-dashed border-ui-2 can-hover:hover:bg-ui",
  ]}
  data-add-member
  type="button"
>
  <span class="grid size-12 place-items-center rounded-lg bg-bg-2 text-tx-2">
    <IconPlus aria-hidden="true" class="size-icon-md" />
  </span>
  <span class="type-body font-medium text-tx wrap-anywhere">
    {resume === null ? decidesWords.addMember : decidesWords.resume(resume)}
  </span>
  <span class="max-w-measure type-meta text-tx-2 text-pretty">
    {decidesWords.addMemberNote}
  </span>
</button>
