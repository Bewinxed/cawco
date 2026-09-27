<script lang="ts">
  /**
   * One markdown file, as this app has always shown a doc: a card with the
   * file's name on it, the rendered markdown under it, and an editor in the
   * same place when you click. The fleet's memory, a project's CLAUDE.md and
   * the three files a session reads are all this — so they are all one thing to
   * learn rather than three surfaces to work out.
   *
   * Read-only is the absence of `save`: a card nobody can write is a card with
   * nothing to click.
   */
  import { onMount, type Snippet } from "svelte";
  import { toast } from "svelte-sonner";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Markdown } from "$lib/components/ui/markdown";
  import MarkdownEditor from "./MarkdownEditor.svelte";

  interface Props {
    /** Extra header buttons. View mode only: editing has its own two. */
    actions?: Snippet;
    /** Null is a file that is not there — the card offers to write one. */
    content: string | null;
    /** Bindable: a parent that replaced the content closes the editor with it. */
    editing?: boolean;
    emptyText?: string;
    /** Inside the card, under the body: what a refused save has to show. */
    footer?: Snippet;
    /** Inline facts after the filename — a hash, a size, a time. */
    meta?: Snippet;
    /** What the header calls the file, shown verbatim. */
    path: string;
    /**
     * Writes the text and answers whether it landed. `false` keeps the editor
     * open, for a caller with something to say about why in `footer`.
     */
    save?: (text: string) => Promise<boolean>;
    /**
     * One line about the file, shown in place of the rendered markdown. For a
     * rail that lists the file where something else is already reading it —
     * Edit still opens the same editor here.
     */
    summary?: string;
  }

  let {
    path,
    content,
    save,
    editing = $bindable(false),
    emptyText = "Nothing here yet.",
    summary,
    meta,
    actions,
    footer,
  }: Props = $props();

  /** The editor's text: seeded when editing starts, never from a prop after. */
  let draft = $state("");
  let saving = $state(false);
  let seeded = $state(false);

  const dirty = $derived(draft !== (content ?? ""));

  // A parent may open the editor itself; it gets the same seeded draft a click
  // would have given it, and a content prop that moves under an open editor
  // never takes the text being written with it.
  $effect(() => {
    if (editing && !seeded) {
      draft = content ?? "";
      seeded = true;
    } else if (!editing && seeded) {
      seeded = false;
    }
  });

  function edit() {
    if (!save) {
      return;
    }
    draft = content ?? "";
    editing = true;
  }

  function cancel() {
    forget();
    editing = false;
  }

  /**
   * A draft outlives its editor. The tab panels are `{#if activeTab === ...}`,
   * so switching tabs unmounts this card outright — which used to take an
   * unsaved edit with it, without a word. The text is written to session
   * storage as it is typed and read back on mount, so leaving and coming back
   * returns the editor exactly as it was left. Cleared on save and on cancel,
   * because those are the two ways a draft is genuinely finished with.
   */
  const stash = $derived(`whiffle:draft:${path}`);
  function forget() {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    sessionStorage.removeItem(stash);
  }
  $effect(() => {
    if (typeof sessionStorage === "undefined") {
      return;
    }
    if (editing && seeded && dirty) {
      sessionStorage.setItem(stash, draft);
    }
  });
  onMount(() => {
    const kept = sessionStorage.getItem(stash);
    if (kept === null || kept === (content ?? "")) {
      return;
    }
    draft = kept;
    seeded = true;
    editing = true;
  });

  /**
   * The shortcuts an editor is expected to have. Enter belongs to the
   * document, so saving takes the modifier.
   */
  function keydown(event: KeyboardEvent) {
    if (!editing) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
      return;
    }
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && dirty) {
      event.preventDefault();
      // biome-ignore lint/complexity/noVoid: fire-and-forget — commit owns its own errors
      void commit();
    }
  }

  function shortcuts(node: HTMLElement) {
    node.addEventListener("keydown", keydown);
    return () => node.removeEventListener("keydown", keydown);
  }

  /**
   * The body is a shortcut into the editor, not a trap: a link in the markdown
   * is still a link, and text somebody is selecting to copy is not an edit.
   * The header's Edit button is the affordance, and the keyboard's way in.
   */
  function bodyClick(event: MouseEvent) {
    if (!save) {
      return;
    }
    if ((event.target as HTMLElement).closest("a")) {
      return;
    }
    if (window.getSelection()?.isCollapsed === false) {
      return;
    }
    edit();
  }

  async function commit() {
    if (!save) {
      return;
    }
    saving = true;
    try {
      if (await save(draft)) {
        forget();
        editing = false;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      saving = false;
    }
  }
</script>

<Card
  class="w-full min-w-0 gap-0 rounded-[var(--radius-lg)] py-0 shadow-md [--card-spacing:var(--space-4)]"
>
  <!-- Sticky while editing: a long file used to push Save and Cancel a
       screenful above the caret, so the way out of the editor scrolled away
       from the person using it. -->
  <header
    class="sticky top-0 z-10 flex items-center gap-3 border-b border-border/50 bg-card px-[var(--space-4)] py-[var(--space-2)]"
  >
    <span
      class="min-w-0 truncate font-mono text-label text-muted-foreground"
      title={path}
      >{path}</span
    >
    {#if meta}
      {@render meta()}
    {/if}
    {#if editing}
      <Button
        class="ml-auto shrink-0"
        disabled={saving}
        onclick={cancel}
        size="xs"
        variant="ghost"
      >
        Cancel
      </Button>
      <Button
        class="shrink-0"
        disabled={saving || !dirty}
        onclick={commit}
        size="xs"
        variant="outline"
      >
        {saving ? 'Saving…' : 'Save'}
      </Button>
    {:else}
      <span class="ml-auto flex shrink-0 items-center gap-2">
        {#if actions}
          {@render actions()}
        {/if}
        {#if save && content !== null}
          <Button onclick={edit} size="xs" variant="outline">Edit</Button>
        {/if}
      </span>
    {/if}
  </header>

  {#if editing}
    <!-- Catches the editor's shortcuts as they bubble; the labelled group is
         the editor section inside. -->
    <div class="max-h-[60vh] overflow-y-auto" {@attach shortcuts}>
      <MarkdownEditor label={path} bind:value={draft} />
    </div>
  {:else if content !== null && summary}
    <p
      class="px-[var(--space-4)] py-[var(--space-2)] text-meta text-muted-foreground"
    >
      {summary}
    </p>
  {:else if content !== null}
    <!-- The click is the convenience; the Edit button above is the affordance,
         which is why this needs no key handler of its own. -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- biome-ignore lint/a11y/useKeyWithClickEvents: the click is a convenience shortcut; the Edit button above is the keyboard-reachable affordance -->
    <!-- biome-ignore lint/a11y/noStaticElementInteractions: same convenience shortcut, no interactive semantics intended -->
    <!-- biome-ignore lint/a11y/noNoninteractiveElementInteractions: same convenience shortcut, no interactive semantics intended -->
    <div
      class="max-h-[60vh] min-h-40 overflow-y-auto px-[var(--space-4)] py-[var(--space-3)] {save ? 'cursor-text' : ''}"
      onclick={bodyClick}
      title={save ? 'Click to edit' : undefined}
    >
      <Markdown source={content} />
    </div>
  {:else if save}
    <!-- The kit's button is `whitespace-nowrap`; a sentence long enough to need
         two lines would push the card past its column instead of wrapping. -->
    <Button
      class="text-meta text-muted-foreground h-auto w-full justify-start rounded-none px-[var(--space-4)] py-[var(--space-6)] text-left font-normal whitespace-normal"
      onclick={edit}
      variant="ghost"
    >
      {emptyText}
    </Button>
  {:else}
    <p
      class="text-meta text-muted-foreground px-[var(--space-4)] py-[var(--space-6)]"
    >
      {emptyText}
    </p>
  {/if}

  {#if footer}
    {@render footer()}
  {/if}
</Card>
