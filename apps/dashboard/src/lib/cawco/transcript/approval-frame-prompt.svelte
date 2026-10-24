<script lang="ts" module>
  import type { HarnessKind } from "@cawco/core";

  /** What the approval card's states file draws the composer's ask with: which card, and the asking session's harness. */
  export interface ApprovalLook {
    harness: HarnessKind;
    look: "sentence" | "today";
  }

  export const APPROVAL_LOOK = Symbol("approval-look");
</script>

<script lang="ts">
  /**
   * The composer's ask (Prompt) as the approval card's states file draws it
   * (approval-frame.svelte): the composer's own props, with the card its
   * frame names and the session's harness, which no row of it supplies
   * there. Handed to the real Composer in its fleet, in Prompt's place.
   */
  import { type ComponentProps, getContext } from "svelte";
  import Prompt from "./Prompt.svelte";

  let props: ComponentProps<typeof Prompt> = $props();
  const chosen = getContext<ApprovalLook>(APPROVAL_LOOK);
</script>

<Prompt {...props} harness={chosen.harness} look={chosen.look} />
