<script lang="ts">
  import { commonWords } from "@cawco/core";
  /**
   * The New Session form on a phone: the kit drawer's bottom sheet under
   * 640px (DESIGN.md: "the new-session dialog becomes a bottom sheet"). A
   * desk opens the same form as a popover (NewSessionPopover), which hands
   * this its props under 640px. The form inside is NewSessionForm; the
   * sheet's head is the kit's, titled with the form's own name.
   */
  import { untrack } from "svelte";
  import { Drawer, DrawerContent } from "#lib/components/ui/drawer/index.js";
  import type { ContinueSource } from "../continue.svelte";
  import NewSessionForm from "./NewSessionForm.svelte";
  import type { SpawnPrefill } from "./new-session.svelte";

  let {
    open,
    prefill,
    continueFrom,
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
  <!-- Its exit is the house's (--dur-exit on --ease-out), set on its closed
       state in app.css by `data-ns-dialog`, never through `style`: a changed
       style attribute is written whole, which wiped the transform vaul writes
       on the node while a finger drags it, and a sheet swiped down jumped
       back up before it slid out. -->
  <DrawerContent
    data-session-card
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
    style="--drawer-max-height: calc(var(--visible-height, 100dvh) - max(env(safe-area-inset-top), var(--space-7)))"
    title={form?.title() ?? commonWords.newSession}
    bind:ref={card}
  >
    <NewSessionForm
      {continueFrom}
      {onclose}
      {onexitcontinue}
      {open}
      {prefill}
      sheet
      bind:this={form}
    />
  </DrawerContent>
</Drawer>
