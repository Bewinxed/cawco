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
   * The editor's commit row. It sits outside the scrolling body, on the
   * recess, so no field scrolls under it at rest; under 640px it pins to the
   * bottom edge and Delete moves to the header's ⋯ menu, and over a keyboard
   * it stands on the keyboard with the body's fields kept clear of it
   * (aboveKeyboard, `body`).
   *
   * Save shows its work where it was pressed: the kit Button spins while
   * the save runs and draws a check for --dur-hold when it ends well, and
   * for that same hold the label says "Saved".
   */
  import { configureWords } from "@cawco/core";
  import type { Snippet } from "svelte";
  import AskHere from "#lib/cawco/AskHere.svelte";
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
</script>

<footer class="footer" data-safe-bottom {@attach aboveKeyboard(() => body)}>
  {#if question}
    <AskHere asker={question.asker} at="editor" class="editor-ask" />
  {/if}
  <div class="inner">
    {#if ondelete && deleteLabel}
      <Button
        class="delete"
        disabled={down !== null || saving}
        {failed}
        icon={IconTrash}
        label={deleteLabel}
        onclick={ondelete}
        pending={deleting}
        pendingLabel={configureWords.deleting}
        title={down ?? undefined}
        type="button"
        variant="ghost"
      />
    {/if}
    <span class="spacer"></span>
    {#if result}
      <span class="result">{@render result()}</span>
    {/if}
    <Button
      class="footer-btn"
      disabled={saving}
      onclick={oncancel}
      type="button"
      variant="outline"
    >
      {configureWords.cancel}
    </Button>
    <Button
      class="footer-btn save"
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

<style>
  .footer {
    flex: none;
    padding: 10px 21px 12px;
    background: var(--surface-recess);
  }
  .inner {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 980px;
  }
  .spacer {
    flex: 1 1 auto;
  }
  /* The question stands over the commit row, as wide as it. */
  .footer > :global(.editor-ask) {
    max-width: 980px;
  }
  .result {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .inner :global(.save) {
    min-width: 96px;
  }
  .inner :global(.delete) {
    color: var(--ink-muted);
  }
  @media (max-width: 900px) {
    .footer {
      padding-inline: 7px;
    }
  }
  @media (max-width: 640px) {
    .footer {
      position: sticky;
      bottom: 0;
      padding-bottom: calc(12px + var(--safe-bottom));
    }
    .inner {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .inner :global(.delete),
    .spacer {
      display: none;
    }
  }
</style>
