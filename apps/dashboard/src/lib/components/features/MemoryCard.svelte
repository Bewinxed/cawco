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
  import { Skeleton } from "$lib/components/ui/skeleton";
  import { crossIn, crossOut, dur } from "$lib/whiffle/motion/curves.svelte";
  import { morph } from "$lib/whiffle/motion/morph.svelte";
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
    /**
     * The file has not answered yet: the card stands at the size it will
     * most likely have, as a skeleton, rather than saying it is empty.
     */
    loading?: boolean;
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
    loading = false,
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

  /**
   * A card that only summarises its file (a rail) is one size in every state
   * — waiting, there, missing: two lines of meta type, so nothing under it
   * moves when the file answers.
   */
  const SUMMARY_BOX =
    "box-content h-[calc(var(--text-meta)*1.35*2)] px-[var(--space-4)] py-[var(--space-2)] text-meta";

  /** What the body shows; a change cross-fades while the card's height morphs. */
  const mode = $derived.by(() => {
    if (loading) {
      return "loading";
    }
    if (editing) {
      return "editing";
    }
    return content === null ? "empty" : "reading";
  });

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

  /** The card's body, whose height morphs between what it shows. */
  let body = $state<HTMLElement | null>(null);
  /**
   * The editor draws after it mounts; until it has, it stands at the height
   * of the view it replaced, so the morph grows from there instead of from
   * nothing.
   */
  let floor = $state(0);

  function edit() {
    if (!save) {
      return;
    }
    floor = body?.offsetHeight ?? 0;
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
  <!-- One height whether it carries a button or not: an Edit arriving with
       the file does not move what is under the card. -->
  <header
    class="sticky top-0 z-10 flex min-h-[calc(1.5rem+var(--space-2)*2)] items-center gap-3 border-b border-border/50 bg-card px-[var(--space-4)] py-[var(--space-2)]"
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
        {#if loading}
          <Skeleton class="h-6 w-10" />
        {:else if save && content !== null}
          <Button onclick={edit} size="xs" variant="outline">Edit</Button>
        {/if}
      </span>
    {/if}
  </header>

  <!-- The one leaving is taken out of the flow (crossOut), so the height
       morph has one change to follow. -->
  <div
    class="relative"
    bind:this={body}
    {@attach morph({ ms: dur("--dur-panel") })}
  >
    {#key mode}
      <div class="min-w-0" in:crossIn out:crossOut>
        {#if mode === "loading"}
          <!-- Shaped as the summary line (or the first lines of the file)
               it stands in for. -->
          <div
            aria-hidden="true"
            class="flex flex-col gap-2 {summary ? SUMMARY_BOX : 'min-h-40 px-[var(--space-4)] py-[var(--space-3)]'}"
          >
            {#if summary}
              <Skeleton class="h-3 w-full" />
              <Skeleton class="h-3 w-2/3" />
            {:else}
              <Skeleton class="h-3.5 w-3/4" />
              <Skeleton class="h-3.5 w-full" />
              <Skeleton class="h-3.5 w-2/3" />
            {/if}
          </div>
        {:else if mode === "editing"}
          <!-- Catches the editor's shortcuts as they bubble; the labelled group is
               the editor section inside. -->
          <div
            class="max-h-[60vh] overflow-y-auto"
            style:min-height="{floor}px"
            {@attach shortcuts}
          >
            <MarkdownEditor label={path} bind:value={draft} />
          </div>
        {:else if content !== null && summary}
          <p class="{SUMMARY_BOX} text-muted-foreground">
            <span class="line-clamp-2">{summary}</span>
          </p>
        {:else if summary && save}
          <Button
            class="{SUMMARY_BOX} w-full justify-start rounded-none text-left font-normal whitespace-normal text-muted-foreground"
            onclick={edit}
            variant="ghost"
          >
            <span class="line-clamp-2">{emptyText}</span>
          </Button>
        {:else if summary}
          <p class="{SUMMARY_BOX} text-muted-foreground">
            <span class="line-clamp-2">{emptyText}</span>
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
      </div>
    {/key}
  </div>

  {#if footer}
    {@render footer()}
  {/if}
</Card>
