<script lang="ts">
  import type { AuthState } from "@cawco/core";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconSuccess, IconWarningTriangle } from "#lib/icons.js";
  import { crossIn, crossOut } from "./motion/curves.svelte";

  /**
   * The body a machine's login dialogs show once the reader has sent what
   * they typed: the wait while the machine works, then what it answered.
   *
   * The machine does two things inside one call (take what was sent, then
   * check a turn there can use it), so the wait names the first and, after
   * a moment, the second. The answer stays up until the reader closes it:
   * the dialog is the confirmation, nothing closes on its own.
   */
  export type Outcome =
    | { kind: "working" }
    | { kind: "done"; state: AuthState };

  let {
    outcome,
    working,
    said,
    onclose,
  }: {
    outcome: Outcome;
    /** The headline while waiting, and the two steps it names in turn. */
    working: { title: string; steps: [string, string] };
    /** What each answer says: a title and one sentence. */
    said: Record<AuthState, { title: string; body: string }>;
    onclose: () => void;
  } = $props();

  /** Past this, the first step has most likely handed over to the check. */
  const SECOND_STEP_MS = 1500;
  let step = $state<0 | 1>(0);
  $effect(() => {
    if (outcome.kind !== "working") {
      return;
    }
    step = 0;
    const timer = setTimeout(() => {
      step = 1;
    }, SECOND_STEP_MS);
    return () => clearTimeout(timer);
  });

  const answer = $derived(outcome.kind === "done" ? said[outcome.state] : null);
  /** Only a machine that can now start a turn earns the check. */
  const ok = $derived(
    outcome.kind === "done" && outcome.state === "authenticated"
  );
</script>

<!-- One stable box: the wait and the answer cross-fade in place. The dialog
     holds the height its form stood at, so "Done" lands where the submit
     was; an answer taller than that grows it by the dialog's own morph. -->
<div class="relative flex flex-1 flex-col">
  {#key outcome.kind}
    <div
      class="flex flex-1 flex-col gap-[var(--space-4)]"
      in:crossIn
      out:crossOut
    >
      {#if outcome.kind === "working"}
        <div
          aria-live="polite"
          class="flex flex-col gap-[var(--space-2)] outline-none"
          tabindex="-1"
          {@attach (node) => node.focus()}
        >
          <span class="mark text-muted-foreground">
            <Spinner aria-hidden="true" class="size-6" role="presentation" />
          </span>
          <Dialog.Title class="text-title text-balance">
            {working.title}
          </Dialog.Title>
          <Dialog.Description class="relative flex flex-col text-pretty">
            {#key step}
              <span in:crossIn out:crossOut>{working.steps[step]}</span>
            {/key}
          </Dialog.Description>
        </div>
        <!-- Closing does not stop the machine; it only stops watching. -->
        <div class="mt-auto flex justify-end">
          <Button onclick={onclose} type="button" variant="outline">
            Close
          </Button>
        </div>
      {:else if answer}
        <div class="flex flex-col gap-[var(--space-2)]" role="status">
          <span class="mark enter {ok ? "text-success" : "text-warning"}">
            {#if ok}
              <IconSuccess class="size-9" />
            {:else}
              <IconWarningTriangle class="size-9" />
            {/if}
          </span>
          <Dialog.Title class="text-title text-balance">
            {answer.title}
          </Dialog.Title>
          <Dialog.Description class="text-pretty">
            {answer.body}
          </Dialog.Description>
        </div>
        <div class="mt-auto flex justify-end">
          <Button
            onclick={onclose}
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
