<script lang="ts">
  /**
   * The screen a guide-after-a-reply frame stands on, at its form: on a
   * desk, the conversation beside the artifact panel (SideSplit); on a
   * phone's session tab, or a desk under 900px, the conversation with the
   * panel as the sheet over it (SideSheet, `data-preview-sheet`, the kit's
   * grabber); on a phone's artifact tab, the panel alone. The transcript is
   * the transcript's own turns (Turn, Who, MessageBody) and its composer;
   * `toast` stands where DESIGN.md's Toast puts one.
   */
  import type { Snippet } from "svelte";
  import { frameSize } from "../../frame-observer";
  import Composer from "../../transcript/Composer.svelte";
  import { ComposerDraft } from "../../transcript/composer-draft.svelte";
  import { AGENT } from "./fixture";

  let {
    form,
    panel,
    transcript,
    toast,
  }: {
    form: "desk" | "phone-session" | "phone-tab";
    /** The artifact panel; none while it is closed. */
    panel?: Snippet;
    /** The conversation's turns. */
    transcript?: Snippet;
    /** A toast over the conversation. */
    toast?: Snippet;
  } = $props();

  /** The screen's width: a desk under 900px stands the panel as the sheet, as SideSplit does (layoutPolicy.sideDrawer). */
  let width = $state(0);
  const shape = $derived(
    form === "desk" && width > 0 && width < 900 ? "phone-session" : form
  );

  const draft = new ComposerDraft();
  const placeholder = {
    full: `Message ${AGENT}…`,
    short: "Message…",
  };
</script>

{#snippet conversation()}
  <div
    class="relative flex min-h-0 min-w-0 flex-1 flex-col"
    data-slot="conversation"
  >
    <!-- The transcript scrolls; its newest turn stands on the composer. A
         toast's room is kept clear at the end it stands on. -->
    <div
      class="relative flex min-h-0 flex-auto flex-col justify-end overflow-y-auto overscroll-contain px-space-5 pt-space-5 data-[shape=desk]:px-space-7 data-toast-top:pt-space-8"
      data-shape={shape}
      data-slot="transcript"
      data-toast-top={(toast && shape !== "desk") || undefined}
    >
      <div
        class="mx-auto w-full max-w-c-composer-w pb-space-4 data-toast-end:pb-space-8"
        data-toast-end={(toast && shape === "desk") || undefined}
      >
        {@render transcript?.()}
      </div>
    </div>
    {#if toast && shape !== "desk"}
      <!-- DESIGN.md, Toast: on a phone at the top, full width less 12px a side. -->
      <div
        class="pointer-events-none absolute inset-x-space-3 top-space-3 z-(--layer-toast) flex *:w-full"
        data-slot="toast-room"
      >
        {@render toast()}
      </div>
    {/if}
    <div
      class="relative flex-none px-space-3 pb-space-3"
      data-slot="composer-room"
    >
      {#if toast && shape === "desk"}
        <!-- DESIGN.md, Toast: on a desk the content area's bottom-end corner, 24px in, standing on the composer. -->
        <div
          class="pointer-events-none absolute end-space-6 bottom-full z-(--layer-toast) mb-space-3 flex"
          data-slot="toast-room"
        >
          {@render toast()}
        </div>
      {/if}
      <div class="mx-auto max-w-c-composer-w">
        <Composer
          {draft}
          flush
          mentionsFrom={null}
          onstop={() => undefined}
          onsubmit={() => undefined}
          paneVisible={false}
          {placeholder}
        />
      </div>
    </div>
  </div>
{/snippet}

<!-- A desk's 1440×900, a phone's 390×844, at the frame's width. -->
<div
  class="relative flex w-full overflow-hidden bg-surface-page aspect-18/39 data-[shape=desk]:aspect-8/5"
  data-form={form}
  data-shape={shape}
  data-slot="guide-screen"
  {@attach frameSize((node: HTMLDivElement) => {
    width = node.clientWidth;
  })}
>
  {#if shape === "desk"}
    {@render conversation()}
    {#if panel}
      <!-- The split's side: the card inset on the page, its share of the width. -->
      <div
        class="flex w-2/5 min-w-0 flex-none flex-col p-space-2 ps-0"
        data-slot="split-side"
      >
        {@render panel()}
      </div>
    {/if}
  {:else if shape === "phone-session"}
    {@render conversation()}
    {#if panel}
      <!-- The preview's sheet over the conversation, down to the screen's foot. -->
      <div
        class="absolute inset-x-0 bottom-0 top-1/6 z-(--layer-sheet) flex flex-col"
        data-preview-sheet
      >
        <div
          class="relative flex min-h-0 flex-1 flex-col rounded-t-lg bg-surface-raised pt-space-3 shadow-drawer"
          data-slot="sheet"
        >
          <div aria-hidden="true" data-preview-grab data-vaul-handle></div>
          {@render panel()}
        </div>
      </div>
    {/if}
  {:else if panel}
    <!-- The artifact's own tab: the panel is the page, the page's own inset round it. -->
    <div class="flex min-w-0 flex-1 flex-col p-space-2">
      {@render panel()}
    </div>
  {/if}
</div>
