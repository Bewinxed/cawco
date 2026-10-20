<script lang="ts">
  /**
   * The New Session form on a phone: the kit drawer's bottom sheet under
   * 640px (DESIGN.md: "the new-session dialog becomes a bottom sheet"). A
   * desk opens the same form as a popover (NewSessionPopover), which hands
   * this its props under 640px. The form inside is NewSessionForm.
   */
  import { untrack } from "svelte";
  import {
    Drawer,
    DrawerContent,
    DrawerTitle,
  } from "#lib/components/ui/drawer/index.js";
  import type { ContinueSource, SessionDraft } from "../continue.svelte";
  import NewSessionForm from "./NewSessionForm.svelte";
  import type { SpawnPrefill } from "./new-session.svelte";

  let {
    open,
    prefill,
    continueFrom,
    restore,
    anchor = null,
    onclose,
    onexitcontinue,
  }: {
    open: boolean;
    prefill?: SpawnPrefill;
    /**
     * Continue in new session: the form starts a session seeded with a summary
     * of this one. Mutually exclusive with `prefill`: the source says where.
     */
    continueFrom?: ContinueSource;
    /** Continue mode: the form a failed continuation was submitted with, opened as it was. */
    restore?: SessionDraft;
    /** The trigger it was opened from, which the focus goes back to as it closes. */
    anchor?: HTMLElement | null;
    onclose: () => void;
    /** The operator deleted the source chip: the sheet stays open as a plain New Session. */
    onexitcontinue?: () => void;
  } = $props();

  let card = $state<HTMLElement | null>(null);
  let form = $state<NewSessionForm>();
  /** What held the focus as it opened, which it goes back to as it closes. */
  let opener: HTMLElement | null = null;
  $effect(() => {
    if (open) {
      untrack(() => {
        opener = anchor ?? (document.activeElement as HTMLElement | null);
      });
    }
  });
  function dismissed(value: boolean) {
    if (!value) {
      form?.close();
    }
  }
</script>

<Drawer
  noBodyStyles
  onOpenChange={dismissed}
  {open}
  shouldScaleBackground={false}
>
  <DrawerContent
    data-session-card
    aria-label="New Session"
    data-ns-dialog
    look="new-session"
    onCloseAutoFocus={(event) => {
      event.preventDefault();
      opener?.focus({ preventScroll: true });
    }}
    onEscapeKeydown={(event) => form?.escapeStep(event)}
    onOpenAutoFocus={(event) => {
      event.preventDefault();
      // From a trigger the prompt takes the keys; without one the sheet
      // holds the focus, and the keyboard waits for a tap in the prompt.
      if (anchor) {
        form?.focusPrompt();
      } else {
        card?.focus({ preventScroll: true });
      }
    }}
    style={`--drawer-max-height: calc(var(--visible-height, 100dvh) - max(env(safe-area-inset-top), var(--space-7)))${open ? "" : "; animation-duration: var(--dur-exit); animation-timing-function: var(--ease-out)"}`}
    bind:ref={card}
  >
    <DrawerTitle visible={false}>New session</DrawerTitle>
    <NewSessionForm
      {continueFrom}
      {onclose}
      {onexitcontinue}
      {open}
      {prefill}
      {restore}
      bind:this={form}
    />
  </DrawerContent>
</Drawer>
