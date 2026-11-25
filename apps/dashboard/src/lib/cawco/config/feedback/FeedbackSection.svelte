<script lang="ts">
  /**
   * Configure › Feedback to CawCo (core usability-feedback.ts): whether
   * agents may file trouble with CawCo's own tools as issues on CawCo's
   * repository, the consent question with its two answers. An answer saves
   * at once; a refused save puts the hub's answer back and says why under
   * the answers, where the press was.
   *
   * Every value comes in as props (the route reads the store), so the bench
   * draws it with no hub.
   */
  import { usabilityFeedbackWords as words } from "@cawco/core/words/usability-feedback";
  import SaveFault from "#lib/cawco/config/SaveFault.svelte";
  import SaveLine from "#lib/cawco/config/SaveLine.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import type { SavePhase } from "#lib/cawco/stores/own-tools.svelte.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import FeedbackOptions from "./FeedbackOptions.svelte";

  let {
    consent,
    read,
    signedIn,
    phase,
    fault,
    unread = null,
    onchoose,
  }: {
    /** The answer shown; null while no person has given one. */
    consent: boolean | null;
    /** The hub has answered. */
    read: boolean;
    signedIn: boolean;
    phase: SavePhase;
    /** Why the last save failed, in words. */
    fault: string | null;
    /** Why the setting couldn't be read. */
    unread?: string | null;
    onchoose: (consent: boolean) => void;
  } = $props();

  const section = sectionOf("feedback");
</script>

<SectionFrame problem={unread} ready={read || unread !== null} {section}>
  {#if read}
    <div class="flex max-w-c-measure flex-col gap-space-3" data-slot="feedback">
      <SectionHeader
        hue={section.hue}
        icon={section.icon}
        label={words.question}
        level={2}
      >
        {#snippet right()}
          <SaveLine {phase} {words} />
        {/snippet}
      </SectionHeader>
      <FeedbackOptions onpick={onchoose} {signedIn} value={consent} />
      <SaveFault {fault} />
    </div>
  {/if}
</SectionFrame>
