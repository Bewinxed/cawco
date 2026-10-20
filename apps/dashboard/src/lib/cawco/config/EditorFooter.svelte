<script lang="ts" module>
  import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";

  /**
   * One editor's question (its delete's), asked in that editor's own footer,
   * over Delete, in the page (DESIGN.md, The Open Page Rule): the fields stay
   * live, and a delete runs on what the hub holds whatever was typed
   * meanwhile, so nothing elsewhere breaks. The editor makes it and hands it
   * to its EditorFrame (`question`); it lives and goes with that editor, so
   * another frame coming or going (the skeleton the editor replaces, the
   * next editor) never touches it.
   */
  export class EditorQuestion {
    readonly asker = new Asker<AskHereRequest>();

    ask(request: Omit<AskHereRequest, "at">): Promise<boolean> {
      return this.asker.ask({ ...request, at: "editor" });
    }
  }

  /**
   * Resolves once a save that just ended well has been shown as saved: an
   * editor that moves on after saving (a new row, to its own editor) waits
   * for this, so the check and "Saved" are seen where the press was.
   */
  export const savedShown = (): Promise<void> =>
    new Promise((resolve) => {
      setTimeout(resolve, dur("--dur-hold"));
    });
</script>

<script lang="ts">
  /**
   * The editor's commit row: the card's own foot, on the card's surface,
   * held at the page's foot (sticky) while the fields run on under it, with
   * the house edge fade above it so they pass under it (DESIGN.md, the
   * update notice's footer: "on the panel's surface with the house edge
   * fade above it"). Under 640px Delete is the header's ⋯ menu's, and over
   * a keyboard the row stands on the keyboard with the fields kept clear of
   * it (aboveKeyboard, `body`). It never wraps: what the save reaches gives
   * way first, on one line.
   *
   * Save shows its work where it was pressed: the kit Button spins while
   * the save runs and draws a check for --dur-hold when it ends well, and
   * for that same hold the label says "Saved".
   */
  import { configureWords } from "@cawco/core";
  import type { Snippet } from "svelte";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { aboveKeyboard } from "#lib/cawco/visible-viewport.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconTrash } from "#lib/icons.js";

  let {
    body,
    saving,
    saveLabel,
    canSave = true,
    down,
    deleteLabel,
    deleting = false,
    failed = false,
    ondelete,
    oncancel,
    question,
    result,
  }: {
    /** The scrolling body whose fields the row stands under. */
    body: HTMLElement | null;
    saving: boolean;
    saveLabel: string;
    canSave?: boolean;
    /** Why writes are blocked, or null: Save and Delete are disabled on it and
        say it as their title. */
    down: string | null;
    deleteLabel?: string;
    deleting?: boolean;
    /** The save or delete that just ended failed (the editor says why). */
    failed?: boolean;
    ondelete?: () => void;
    oncancel: () => void;
    /** This editor's own question, drawn over the commit row while it stands. */
    question?: EditorQuestion;
    /**
     * What the save reaches and where it has landed, beside Save: the row's
     * rollout chip (machine by machine, on the machines' word) and, before
     * a save, the machines it writes to.
     */
    result?: Snippet;
  } = $props();

  /** The save just ended well: the label says so for as long as the check stands. */
  let saved = $state(false);
  let wasSaving = false;
  let savedTimer: ReturnType<typeof setTimeout> | undefined;
  $effect.pre(() => {
    const now = saving;
    if (now) {
      clearTimeout(savedTimer);
      saved = false;
    } else if (wasSaving && !failed) {
      saved = true;
      savedTimer = setTimeout(() => {
        saved = false;
      }, dur("--dur-hold"));
    }
    wasSaving = now;
  });
  $effect(() => () => clearTimeout(savedTimer));

  /**
   * Whether the fields run on under the row (`data-stuck`): the page can
   * scroll further down, so the row is held at its foot over them. Read in
   * the next frame (frameObserver) as the page scrolls or changes size.
   */
  function stuck(node: HTMLElement) {
    const page = body;
    if (!page) {
      return;
    }
    const read = () => {
      node.toggleAttribute(
        "data-stuck",
        page.scrollTop + page.clientHeight < page.scrollHeight - 0.5
      );
    };
    const sizes = frameObserver(read);
    const soon = () => sizes.request();
    page.addEventListener("scroll", soon, { passive: true });
    sizes.observe(page);
    if (page.firstElementChild) {
      sizes.observe(page.firstElementChild);
    }
    soon();
    return () => {
      page.removeEventListener("scroll", soon);
      sizes.disconnect();
    };
  }
</script>

<footer
  data-slot="editor-footer"
  class="sticky -bottom-space-2 z-1 mt-auto flex-none flex flex-col gap-space-3 bg-surface-raised pt-space-3 pb-(--foot-pb) before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-c-edge-fade-len before:bg-linear-to-b/srgb before:from-transparent before:to-surface-raised before:opacity-0 before:transition-[opacity] before:duration-(--dur-control) before:ease-out data-stuck:before:opacity-100 max-phone:before:h-c-edge-fade-len-phone"
  data-safe-bottom
  style:--foot-pb="calc(var(--space-6) + var(--safe-bottom))"
  {@attach aboveKeyboard(() => body)}
  {@attach stuck}
>
  {#if question}
    <AskHere asker={question.asker} at="editor" />
  {/if}
  <div data-slot="inner" class="flex min-w-0 items-center gap-space-2">
    {#if ondelete && deleteLabel}
      <span class="flex flex-none max-phone:hidden">
        <Button
          data-delete
          disabled={down !== null || saving}
          {failed}
          icon={IconTrash}
          label={deleteLabel}
          onclick={ondelete}
          pending={deleting}
          pendingLabel={configureWords.deleting}
          title={down ?? undefined}
          type="button"
          variant="destructive"
        />
      </span>
    {/if}
    <span
      data-slot="result"
      class="flex min-w-0 flex-auto items-center justify-end gap-space-2 type-meta text-ink-muted"
    >
      {#if result}
        {@render result()}
      {/if}
    </span>
    <Button
      disabled={saving}
      onclick={oncancel}
      type="button"
      variant="outline"
    >
      {configureWords.cancel}
    </Button>
    <Button
      class="min-w-c-btn-min-w"
      disabled={down !== null || deleting || !canSave}
      {failed}
      label={saved ? configureWords.saved : saveLabel}
      pending={saving}
      pendingLabel={configureWords.saving}
      title={down ?? undefined}
      type="submit"
    />
  </div>
</footer>
