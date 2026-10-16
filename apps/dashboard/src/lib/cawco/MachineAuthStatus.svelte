<script lang="ts">
  import type { AuthState } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconSuccess, IconWarningTriangle } from "#lib/icons.js";
  import { crossIn, crossOut } from "./motion/curves.svelte";

  /**
   * What a machine's unlock shows under its row once the reader has sent
   * what they typed: the wait while the machine works, then what it
   * answered.
   *
   * The machine does two things inside one call (take what was sent, then
   * check a turn there can use it) and says nothing between them, so the
   * wait names both at once (`working.step`) until it answers: no clock
   * claims the first is done. The answer stays up until the reader puts it
   * away: it is the confirmation, nothing closes on its own.
   */
  export type Outcome =
    { kind: "working" } | { kind: "done"; state: AuthState };

  let {
    outcome,
    working,
    said,
    onclose,
    titleId,
  }: {
    outcome: Outcome;
    /** The id the surface it stands in is labelled by. */
    titleId: string;
    /** The headline while waiting, and the one line naming what the machine does. */
    working: { title: string; step: string };
    /** What each answer says: a title and one sentence. */
    said: Record<AuthState, { title: string; body: string }>;
    onclose: () => void;
  } = $props();

  const answer = $derived(outcome.kind === "done" ? said[outcome.state] : null);
  /** Only a machine that can now start a turn earns the check. */
  const ok = $derived(
    outcome.kind === "done" && outcome.state === "authenticated"
  );
</script>

<!-- One stable box: the wait and the answer cross-fade in place. The tile
     holds the height its form stood at, so "Done" lands where the submit
     was. -->
<div class="relative flex flex-1 flex-col">
  {#key outcome.kind}
    <div
      class="flex flex-1 flex-col gap-[var(--space-4)]"
      in:crossIn
      out:crossOut
    >
      {#if outcome.kind === "working"}
        <!-- mark-line: a column; the mark stands above the title -->
        <div
          aria-live="polite"
          class="flex flex-col gap-[var(--space-2)] outline-none"
          tabindex="-1"
          {@attach (node) => node.focus()}
        >
          <span class="mark text-ink-muted">
            <Spinner aria-hidden="true" class="size-6" role="presentation" />
          </span>
          <p class="title" id={titleId}>{working.title}</p>
          <p class="body">{working.step}</p>
        </div>
        <!-- Closing does not stop the machine; it only stops watching. -->
        <div class="mt-auto flex justify-end">
          <Button onclick={onclose} size="sm" type="button" variant="ghost">
            Close
          </Button>
        </div>
      {:else if answer}
        <!-- mark-line: a column; the mark stands above the title -->
        <div class="flex flex-col gap-[var(--space-2)]" role="status">
          <span class="mark enter {ok ? 'text-success-9' : 'text-warning-9'}">
            {#if ok}
              <IconSuccess class="size-9" />
            {:else}
              <IconWarningTriangle class="size-9" />
            {/if}
          </span>
          <p class="title" id={titleId}>{answer.title}</p>
          <p class="body">{answer.body}</p>
        </div>
        <div class="mt-auto flex justify-end">
          <Button
            onclick={onclose}
            size="sm"
            type="button"
            {@attach (node: HTMLElement) => node.focus()}
          >
            Done
          </Button>
        </div>
      {/if}
    </div>
  {/key}
</div>

<style>
  /* The mark's slot is the same box waiting and answered, so the spinner
     and the icon that replaces it stand in one place. */
  .mark {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
  }
  .title {
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
    text-wrap: balance;
  }
  .body {
    margin: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
  }

  @media (prefers-reduced-motion: no-preference) {
    .enter {
      animation: mark-in var(--dur-pop) var(--ease-out) both;
    }
  }

  @keyframes mark-in {
    from {
      opacity: 0;
      scale: 0.25;
      filter: blur(4px);
    }
  }
</style>
