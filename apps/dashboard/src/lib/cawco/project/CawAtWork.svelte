<script lang="ts">
  import type { CawStatus } from "@cawco/core/project-conversation";
  /**
   * Caw at work in his conversation's transcript (decision page
   * `onboarding-design`, card `the-wait`): one element made of the
   * transcript's own parts, on the transcript's own columns (`tx-columns`):
   * a rail row like a tool's or the reasoning's, its 2px rail on the
   * transcript's line, no border and no ground of its own, at the text
   * column's measure. In its text column he stands live at 80, in the pose
   * his status names (assets/mascot/PERSONALITY.md); under him the row's
   * head line, the live dot in the glyph cell (the Needs-you glyph while a
   * question holds him) and what he is on now in its words, changing in
   * place (MorphText, The Steady Swap Rule); under that whatever the caller
   * hangs at the text column (the setup's steps, SetupWell).
   *
   * It stands after the rows while he works (ProjectConversation, Transcript
   * `afterRows`): the bare working line stands down for it. It is the page's
   * one live Caw while he stands in it (The Caw Stands On The Axis Rule,
   * `lead.inPanel`). With reduced motion he holds his still and nothing
   * breathes; the words still change.
   */
  import type { Snippet } from "svelte";
  import Caw from "#lib/cawco/home/Caw.svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { IconNeedsYou } from "#lib/icons.js";
  import { cawLoop } from "#lib/platform/feel.svelte.js";

  let {
    children,
    doing,
    label,
    present = true,
    slot = "caw-at-work",
    status,
    waiting = status === "needs-you",
  }: {
    /** Hung at the text column under his line (SetupWell's steps). */
    children?: Snippet;
    /** What he is on now, in words. */
    doing: string;
    /** The element's name, for a screen reader. */
    label: string;
    /** He stands in it; false once his work here is handed over (the line and what hangs under it stay as its record, the live dot with him). */
    present?: boolean;
    /** Its `data-slot`: the setup's element names itself. */
    slot?: string;
    /** His status (CawLead `status`): working while he works, needs you while a question holds him. */
    status: CawStatus;
    /** A question of his holds him: the Needs-you glyph in the live dot's place. */
    waiting?: boolean;
  } = $props();
</script>

<!-- A rail row (design.css `rail-row`, `rail-line`, `rail-hang`): the
     transcript's line runs down it, its head line on the glyph and text
     columns, what it holds hung at the text column, as a tool's body is. -->
<section
  aria-label={label}
  data-slot={slot}
  data-tx-rail
  class="tx-columns rail-row max-w-c-measure"
>
  {#if present}
    <div class="rail-hang" data-box>
      <Caw size={80} still={!cawLoop.on} {status} />
    </div>
  {/if}
  <p
    aria-live="polite"
    class="m-0 min-h-(--tx-line) rail-line text-size-label font-medium text-ink-strong"
  >
    <span data-slot="rail-cell" class="rail-cell">
      {#if waiting}
        <IconNeedsYou class="size-icon-md text-status-attn-glyph" />
      {:else if present}
        <LiveDot />
      {/if}
    </span>
    <MorphText text={doing} />
  </p>
  {@render children?.()}
</section>
