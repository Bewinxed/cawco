<script lang="ts">
  /**
   * The consent question's two answers (core usability-feedback.ts) as
   * option rows, each its name over what it means, neither recommended: the
   * person's own call on what leaves their machines. What Configure ›
   * Feedback to CawCo, the first run's step and Needs you's ask all draw. A
   * press is the answer; nothing is picked while `value` is null. While no
   * machine signs in to GitHub, the line under them says the feedback needs
   * one.
   */
  import { usabilityFeedbackWords as words } from "@cawco/core/words/usability-feedback";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";

  let {
    value,
    signedIn,
    onpick,
  }: {
    /** The answer shown: the hub's, or the one being saved; null while no person has given one. */
    value: boolean | null;
    /** A machine of the fleet signs in to GitHub. */
    signedIn: boolean;
    onpick: (consent: boolean) => void;
  } = $props();

  const OPTIONS = [
    { value: "allow", ...words.options.allow },
    { value: "deny", ...words.options.deny },
  ] as const;

  const pick = (next: string[]) => {
    const [picked] = next;
    if (picked === "allow" || picked === "deny") {
      const consent = picked === "allow";
      if (consent !== value) {
        onpick(consent);
      }
    }
  };
</script>

<div class="flex min-w-0 flex-col gap-space-2" data-slot="feedback-options">
  <OptionGroup
    aria-label={words.question}
    layout="list"
    bind:value={() => (value === null ? [] : [value ? "allow" : "deny"]), pick}
  >
    {#each OPTIONS as option, index (option.value)}
      <OptionGroupItem digit={index + 1} value={option.value}>
        <span class="flex min-w-0 flex-col gap-space-row">
          <span class="type-label text-ink-strong">{option.name}</span>
          <span class="type-meta text-pretty text-ink-muted">{option.line}</span
          >
        </span>
      </OptionGroupItem>
    {/each}
  </OptionGroup>
  {#if !signedIn}
    <p
      class="m-0 max-w-c-measure type-meta text-pretty text-ink-muted"
      data-slot="feedback-sign-in"
    >
      {words.needsSignIn}
    </p>
  {/if}
</div>
