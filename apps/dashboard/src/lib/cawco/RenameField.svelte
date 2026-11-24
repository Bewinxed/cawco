<script lang="ts">
  /**
   * A name renamed where it stands (a project's name in its page head, a
   * session's title in its row): the kit Input in the look its place gives
   * it, focused with its words selected as it opens. Enter sends; Escape
   * puts the name back; leaving sends, unless a refusal stands, which keeps
   * the words as typed for Enter or Try again. Read-only while the rename
   * is sent.
   */
  import type { ComponentProps } from "svelte";
  import { Input } from "#lib/components/ui/input/index.js";

  let {
    value = $bindable(),
    label,
    sending,
    refused,
    onsend,
    oncancel,
    ...placed
  }: {
    value: string | null;
    /** Its accessible name. */
    label: string;
    /** The rename is on its way. */
    sending: boolean;
    /** A refusal stands under it. */
    refused: boolean;
    onsend: () => void;
    oncancel: () => void;
    /** On a mark's row: a box, which the row leaves untrimmed. */
    "data-box"?: boolean;
  } & Pick<
    ComponentProps<typeof Input>,
    "class" | "look" | "tone" | "data-slot"
  > = $props();
</script>

<!-- svelte-ignore a11y_autofocus: the field opens on the person's own Rename, and takes the focus they asked for -->
<Input
  {...placed}
  data-field
  aria-label={label}
  autocomplete="off"
  autofocus
  onblur={() => {
    if (!refused) {
      onsend();
    }
  }}
  onkeydown={(event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onsend();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      oncancel();
    }
  }}
  readonly={sending}
  spellcheck="false"
  bind:value
  {@attach (node: HTMLInputElement) => node.select()}
/>
