<script lang="ts" module>
  /** Something `@` can name: another session, or a machine. */
  export interface Mention {
    detail?: string;
    /** What gets inserted, without the `@`. */
    handle: string;
    label: string;
  }
</script>

<script lang="ts">
  import type { AvailableCommand } from "@whiffle/core";
  /**
   * The floating composer — a lifted shell holding the text input, the attach
   * and send controls, and any inline permission / question prompts stacked
   * above it. Home, this input and Stop are the surface's fixed anchors; the
   * action button is a single box that sends when idle and interrupts while a
   * turn is in flight. Ported from the mock's `.composer` / `.cin`.
   *
   * The shell does not change shape when it is focused. It used to grow and
   * re-round on click, which moved one of the three fixed anchors every time
   * the reader touched it; now there is one radius and one padding, and the
   * only thing that grows is the textarea itself (motion/autosize.svelte.ts).
   * Attach and send stay bottom-aligned, so they hold their position as the
   * text runs to a second and a third line.
   *
   * `/` and `@` are real: typing either opens a filtered menu above the input,
   * driven from the textarea's own keyboard so focus never leaves the message
   * being written.
   */
  import { type Snippet, tick, untrack } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Command from "$lib/components/ui/command";
  import { IconClose, IconPlus, IconSend, IconStop } from "$lib/icons";
  import { autosize } from "$lib/whiffle/motion/autosize.svelte";
  import type { SendExtras } from "../client.svelte";
  import { cleanDetail } from "../command-detail";
  import SelectionChip from "../preview/SelectionChip.svelte";
  import SelectionPopover from "../preview/SelectionPopover.svelte";
  import {
    loadSuggestSetting,
    type SuggestCandidate,
    suggestions,
  } from "../suggest.svelte";
  import type { ComposerDraft, PendingImage } from "./composer-draft.svelte";
  import { stand } from "./composer-presence.svelte";
  import SuggestionChips from "./SuggestionChips.svelte";

  let {
    draft,
    height = $bindable(0),
    busy = false,
    sending = false,
    held = false,
    paneVisible = true,
    previewPhone = false,
    commands = [],
    mentions = [],
    onsubmit,
    oninterruptsend,
    onmenu,
    onstop,
    prompts,
    leading,
    suggest,
  }: {
    /**
     * The conversation's half-written message. The composer draws it and
     * writes into it; the conversation owns it, so a composer pointed at
     * another draft shows that conversation's words.
     */
    draft: ComposerDraft;
    /**
     * The floating column's measured height, published upward. The transcript
     * behind it reserves exactly this much foot-room, so a permission card
     * stacked above the input never covers the message that raised it.
     */
    height?: number;
    busy?: boolean;
    /**
     * Whether the last message this composer sent is still unacknowledged — out
     * of this tab, but not yet taken by the hub. `busy` is the AGENT's state and
     * arrives with the first frame of the turn; this is the gap in front of it,
     * and it is the only thing between one Enter and the next that can tell a
     * second send from a duplicate of the first.
     */
    sending?: boolean;
    /**
     * A swipe is carrying the conversations under this composer. The action
     * button waits until one has landed, so nothing is sent to a chat that
     * is on its way off screen.
     */
    held?: boolean;
    paneVisible?: boolean;
    previewPhone?: boolean;
    /** What this session offers behind `/`. */
    commands?: AvailableCommand[];
    /** What `@` can name — the sessions and machines in reach. */
    mentions?: Mention[];
    onsubmit: (text: string, extras: SendExtras) => void;
    /**
     * The queue-jump (mod+Enter): interrupt the turn in flight, then send.
     * Optional — a composer without it (the spawn form) treats mod+Enter as a
     * plain send, which on an idle surface is the same thing.
     */
    oninterruptsend?: (text: string, extras: SendExtras) => void;
    /** Fired when the `/` menu opens, so the session can be re-asked what it has. */
    onmenu?: () => void;
    onstop: () => void;
    prompts?: Snippet;
    /** Controls rendered before the attach button in the composer row. */
    leading?: Snippet;
    /**
     * The session's skills and MCP servers, and its last reply, for the
     * suggestion chips. Absent on surfaces with no session behind them.
     */
    suggest?: { candidates: SuggestCandidate[] };
  } = $props();

  $effect(() => {
    if (suggest) {
      loadSuggestSetting();
    }
  });

  /** A chip's sentence goes on the end of the draft, caret after it. */
  async function insertSuggestion(line: string) {
    const typed = draft.text.trimEnd();
    draft.text = typed ? `${typed} ${line}` : line;
    await tick();
    field?.focus();
    field?.setSelectionRange(draft.text.length, draft.text.length);
  }

  $effect(() => {
    if (!paneVisible) {
      draft.editorOpen = false;
    }
  });

  // On screen, this composer is what the desk's toasts rise above.
  const presence = {};
  $effect(() => {
    if (paneVisible) {
      return stand(presence, height);
    }
  });
  let fileInput = $state<HTMLInputElement>();
  let field = $state<HTMLTextAreaElement>();
  /** The suggestion row, for Tab and Shift+Tab. */
  let chips = $state<ReturnType<typeof SuggestionChips>>();

  /** A paste longer than this rides as a named attachment, not inline text. */
  const LARGE_PASTE = 1200;

  /** A `/` or `@` token stops being typed as one the moment it holds whitespace. */
  const TOKEN_WHITESPACE = /\s/;

  /** The words put back from outside (Edit on a failed send) land with focus. */
  $effect(() => {
    if (draft.focusWanted) {
      field?.focus();
      draft.focusWanted = false;
    }
  });

  /* ---- the `/` and `@` menu ------------------------------------------- */

  /** One row of the menu, whichever sigil opened it. */
  interface Entry {
    detail?: string;
    /** Command.Item's value, and what the highlight is tracked by. */
    id: string;
    /** What replaces the typed token, sigil included. */
    insert: string;
    /** Which `/` family it belongs to — the menu is sectioned by this. */
    kind?: AvailableCommand["type"];
    label: string;
    /** The plugin or MCP server it came from, shown as a quiet origin tag. */
    source?: string;
  }

  /** One titled section of the menu. */
  interface Section {
    entries: Entry[];
    heading: string;
    key: string;
  }

  /**
   * Which section a command belongs to. A plugin-heavy session's `/` list is
   * almost entirely namespaced (`interfaces:better-ui`, `code-foundations:build`)
   * — grouping by the four coarse families would file them all under one
   * "Commands" heading, which is the mess. So the section is the command's
   * SOURCE when it has one: its plugin, or the MCP server that lent it. Skills
   * and bare built-ins, which carry no namespace, keep their family name.
   *
   * `rank` orders the sections: skills first, then plugins (by name), then the
   * built-ins, then MCP servers (by name).
   */
  function sectionMeta(entry: Entry): {
    key: string;
    heading: string;
    rank: number;
    sub: string;
  } {
    if (entry.kind === "skill") {
      return { key: "skills", heading: "Skills", rank: 0, sub: "" };
    }
    if (entry.kind === "mcp") {
      const server = entry.source ?? "";
      return {
        key: `mcp:${server}`,
        heading: server || "MCP",
        rank: 3,
        sub: server,
      };
    }
    if (entry.source) {
      return {
        key: `src:${entry.source}`,
        heading: entry.source,
        rank: 1,
        sub: entry.source,
      };
    }
    if (entry.kind === "builtin") {
      return { key: "builtin", heading: "Built-in", rank: 2, sub: "" };
    }
    return { key: "commands", heading: "Commands", rank: 1, sub: "" };
  }

  /**
   * The name a row shows. Under a source heading the namespace is redundant, so
   * `interfaces:better-ui` reads as `/better-ui` beneath "interfaces", and an
   * MCP prompt drops its `mcp__server__` prefix. The value inserted keeps the
   * full name — only the label is shortened.
   */
  function displayLabel(name: string, source?: string): string {
    if (name.startsWith("mcp__")) {
      const rest = name.split("__").slice(2).join("__");
      return `/${rest || name}`;
    }
    if (source && name.startsWith(`${source}:`)) {
      return `/${name.slice(source.length + 1)}`;
    }
    return `/${name}`;
  }

  /**
   * The prose a row shows. Plugin descriptions often lead with their own name in
   * parens — `(code-foundations) Execute…` — which is exactly the section heading
   * above the row, so it is stripped here rather than printed twice.
   */
  /** Where the caret is, so the token under it can be found on every keystroke. */
  let caret = $state(0);
  /** Dismissed with Escape: the token is still there, the menu is not. */
  let dismissed = $state(false);
  let highlight = $state("");

  /**
   * A composer handed another conversation's draft starts that draft with
   * its menu closed: the caret this one last noted was in the other text.
   */
  $effect.pre(() => {
    // biome-ignore lint/complexity/noVoid: read-only dependency — re-runs when the composer is pointed at another conversation's draft
    void draft;
    untrack(() => {
      dismissed = true;
    });
  });

  /**
   * The `/…` or `@…` the caret sits in the middle of, or null.
   *
   * A sigil only opens a menu at the start of a word — mid-token it is a path
   * separator or an email, both of which the reader is entitled to type without
   * a menu landing on top of them.
   */
  const token = $derived.by(
    (): { sigil: "/" | "@"; query: string; from: number } | null => {
      const at = Math.min(caret, draft.text.length);
      const before = draft.text.slice(0, at);
      const start =
        Math.max(before.lastIndexOf(" "), before.lastIndexOf("\n")) + 1;
      const word = before.slice(start);
      if (word.length === 0) {
        return null;
      }
      const [sigil] = word;
      if (sigil !== "/" && sigil !== "@") {
        return null;
      }
      const query = word.slice(1);
      // A token with whitespace in it is no longer being typed as one.
      if (TOKEN_WHITESPACE.test(query)) {
        return null;
      }
      return { sigil, query, from: start };
    }
  );

  let slashMenuOpen = false;
  $effect(() => {
    const open = token?.sigil === "/";
    const rising = open && !slashMenuOpen;
    slashMenuOpen = open;
    if (rising) {
      untrack(() => onmenu?.());
    }
  });

  const entries = $derived.by((): Entry[] => {
    const active = token;
    if (!active) {
      return [];
    }
    const needle = active.query.toLowerCase();
    const rows: Entry[] =
      active.sigil === "/"
        ? commands.map((command) => ({
            id: `/${command.name}`,
            insert: `/${command.name}`,
            // The source is the section heading now, so the row shows the short
            // name, then its prose or argument shape — never the word "builtin"
            // as a stand-in description.
            label: displayLabel(command.name, command.source),
            detail: cleanDetail(
              command.description,
              command.argumentHint,
              command.source
            ),
            kind: command.type,
            source: command.source,
          }))
        : mentions.map((mention) => ({
            id: `@${mention.handle}`,
            insert: `@${mention.handle}`,
            label: mention.label,
            detail: mention.detail,
          }));
    return (
      rows
        .filter((row) => !needle || row.id.toLowerCase().includes(needle))
        // Grouped and scrollable, so the cap only guards a pathological list; a
        // real session's commands all fit inside it and read under their source.
        .slice(0, 100)
    );
  });

  /**
   * The entries cut into titled sections. `/` groups by source — one heading per
   * plugin and per MCP server, with skills and built-ins under their family name
   * — ordered skills, plugins (by name), built-ins, MCP servers. `@` is one
   * "Mentions" section. A section with no rows is never emitted.
   */
  const sections = $derived.by((): Section[] => {
    if (entries.length === 0) {
      return [];
    }
    if (token?.sigil !== "/") {
      return [{ key: "mentions", heading: "Mentions", entries }];
    }
    const groups = new Map<
      string,
      { heading: string; rank: number; sub: string; entries: Entry[] }
    >();
    for (const entry of entries) {
      const meta = sectionMeta(entry);
      const bucket = groups.get(meta.key);
      if (bucket) {
        bucket.entries.push(entry);
      } else {
        groups.set(meta.key, {
          heading: meta.heading,
          rank: meta.rank,
          sub: meta.sub,
          entries: [entry],
        });
      }
    }
    return [...groups.values()]
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          a.sub.localeCompare(b.sub) ||
          a.heading.localeCompare(b.heading)
      )
      .map((group) => ({
        key: `${group.rank}:${group.heading}`,
        heading: group.heading,
        entries: group.entries,
      }));
  });

  const menuOpen = $derived(!dismissed && entries.length > 0);

  /**
   * A DOM id per visible row, so the textarea can point `aria-activedescendant`
   * at the highlighted one. A screen reader on a combobox reads the active
   * descendant, not the input's value — without this the menu is invisible to
   * it, however well the arrow keys work. Keyed by position in the filtered
   * list, which is unique where the entry's own id (`/foo`, `@bar`) is not a
   * safe id token.
   */
  const domIds = $derived(
    new Map(
      entries.map((entry, index) => [entry.id, `composer-entry-${index}`])
    )
  );
  const activeDescendant = $derived(
    menuOpen ? domIds.get(highlight) : undefined
  );

  // The highlight follows the list: a query that filters the selected row away
  // must not leave Enter pointing at something that is no longer on screen.
  $effect(() => {
    if (!menuOpen) {
      return;
    }
    if (!entries.some((entry) => entry.id === highlight)) {
      highlight = entries[0].id;
    }
  });

  function noteCaret(event: Event): void {
    caret = (event.currentTarget as HTMLTextAreaElement).selectionStart ?? 0;
    dismissed = false;
  }

  /** Puts the chosen row where the token was, with a space after it. */
  function choose(entry: Entry): void {
    const active = token;
    if (!active) {
      return;
    }
    const end = Math.min(caret, draft.text.length);
    draft.text = `${draft.text.slice(0, active.from)}${entry.insert} ${draft.text.slice(end)}`;
    const next = active.from + entry.insert.length + 1;
    dismissed = true;
    // After the value lands, so the caret is set on the text that is there now.
    queueMicrotask(() => {
      field?.focus();
      field?.setSelectionRange(next, next);
      caret = next;
    });
  }

  function step(by: number): void {
    if (entries.length === 0) {
      return;
    }
    const at = entries.findIndex((entry) => entry.id === highlight);
    const next = (at + by + entries.length) % entries.length;
    highlight = entries[next].id;
  }

  function submit(
    via: (text: string, extras: SendExtras) => void = onsubmit
  ): void {
    // Nothing to send, the last one is still unanswered, or a swipe is
    // still carrying the conversation. The draft is left exactly as it is —
    // a refused send must never eat what was typed.
    if (!draft.hasContent || sending || held) {
      return;
    }
    const { text, extras } = draft.take();
    dismissed = true;
    via(text, extras);
  }

  /**
   * The `/` and `@` menu owns these keys while it is up — Enter picks a
   * command rather than sending the half-typed name of one. True when the key
   * was the menu's.
   */
  function menuKey(event: KeyboardEvent): boolean {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      step(event.key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      const picked = entries.find((entry) => entry.id === highlight);
      if (picked) {
        event.preventDefault();
        choose(picked);
        return true;
      }
    }
    if (event.key === "Escape") {
      event.preventDefault();
      dismissed = true;
      return true;
    }
    return false;
  }

  /**
   * Tab adds the most likely suggestion chip, Shift+Tab all of them — only
   * while chips are shown and nothing is selected, so Tab keeps moving focus
   * everywhere else. True when a chip was added.
   */
  function chipKey(event: KeyboardEvent): boolean {
    if (
      event.key === "Tab" &&
      field?.selectionStart === field?.selectionEnd &&
      chips?.take(event.shiftKey ? "all" : "first")
    ) {
      event.preventDefault();
      return true;
    }
    return false;
  }

  function onkeydown(event: KeyboardEvent): void {
    // BEFORE the menu: mod+Enter is "interrupt and send" (the shortcut sheet's
    // long-standing promise), and a half-picked menu must not swallow it — the
    // urgency is the point. The menu is dismissed by the submit itself.
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit(oninterruptsend ?? onsubmit);
      return;
    }
    if (menuOpen ? menuKey(event) : chipKey(event)) {
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function onaction(): void {
    if (held) {
      return;
    }
    if (busy) {
      onstop();
    } else {
      submit();
    }
  }

  /** base64 without the `data:` prefix — the wire shape images travel in. */
  function readImage(file: File): Promise<PendingImage> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result);
        resolve({
          mediaType: file.type,
          data: result.slice(result.indexOf(",") + 1),
          name: file.name,
        });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(files: Iterable<File>): Promise<void> {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        // biome-ignore lint/performance/noAwaitInLoops: sequential by intent — each attachment must append in the order it was picked, not the order its read happens to settle.
        draft.images = [...draft.images, await readImage(file)];
      } else {
        draft.texts = [
          ...draft.texts,
          { kind: "text", name: file.name, content: await file.text() },
        ];
      }
    }
  }

  function onpick(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files?.length) {
      // Copied first: `input.files` is live, and clearing the input below
      // empties it while the reads are still walking it — a pick of several
      // files kept only the first.
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — the file input clears synchronously below, independent of the read.
      void addFiles([...input.files]);
    }
    input.value = "";
  }

  function onpaste(event: ClipboardEvent): void {
    const data = event.clipboardData;
    if (!data) {
      return;
    }
    const files = [...data.items]
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => !!file);
    if (files.length) {
      event.preventDefault();
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — the paste handler returns synchronously, independent of the read.
      void addFiles(files);
      return;
    }
    const text = data.getData("text/plain");
    if (text.length > LARGE_PASTE) {
      event.preventDefault();
      draft.texts = [
        ...draft.texts,
        {
          kind: "text",
          name: `Pasted text · ${text.length.toLocaleString()} chars`,
          content: text,
        },
      ];
    }
  }

  const removeImage = (i: number) => {
    draft.images = draft.images.filter((_, n) => n !== i);
  };
  const removeText = (i: number) => {
    draft.texts = draft.texts.filter((_, n) => n !== i);
  };
</script>

<div class="fade"></div>
<div class="composer" bind:clientHeight={height}>
  {#if prompts}
    <div class="prompts">{@render prompts()}</div>
  {/if}
  {#if draft.images.length || draft.texts.length || draft.selections.length}
    <div class="atts">
      {#each draft.selections as selection (`${selection.element.url}:${selection.element.selector}`)}
        <SelectionChip
          onedit={() => { draft.editing = selection; draft.editorOpen = true; }}
          onremove={() => draft.removeSelection(selection)}
          {selection}
          bind:anchor={draft.anchors[`${selection.element.url}:${selection.element.selector}`]}
        />
      {/each}
      {#each draft.images as img, i (img.name + i)}
        <span class="att">
          <img alt="" src="data:{img.mediaType};base64,{img.data}">
          <span class="att-name">{img.name}</span>
          <button
            aria-label="Remove"
            class="touch-hit"
            onclick={() => removeImage(i)}
            type="button"
          >
            <IconClose />
          </button>
        </span>
      {/each}
      {#each draft.texts as t, i (t.name + i)}
        <span class="att">
          <span class="att-name">{t.name}</span>
          <button
            aria-label="Remove"
            class="touch-hit"
            onclick={() => removeText(i)}
            type="button"
          >
            <IconClose />
          </button>
        </span>
      {/each}
    </div>
  {/if}

  {#if suggest && suggestions.enabled}
    <SuggestionChips
      candidates={suggest.candidates}
      oninsert={insertSuggestion}
      text={draft.text}
      bind:this={chips}
    />
  {/if}

  {#if draft.editing}
    <SelectionPopover
      anchor={draft.anchors[`${draft.editing.element.url}:${draft.editing.element.selector}`]}
      onremove={() => { if (draft.editing) { draft.removeSelection(draft.editing); } }}
      phone={previewPhone}
      selection={draft.editing}
      bind:open={draft.editorOpen}
    />
  {/if}

  <form
    aria-label="Message the agent"
    class="cin"
    onsubmit={(e) => e.preventDefault()}
  >
    <input
      accept="image/*,text/*,.md,.json,.csv,.log"
      class="hidden-file"
      multiple
      onchange={onpick}
      type="file"
      bind:this={fileInput}
    >

    {#if menuOpen}
      <!-- Above the input, not over it: the sentence being written stays legible
           while its next word is being chosen. -->
      <!-- Focus never leaves the textarea: the menu swallows the mousedown that
           would blur it, so a clicked row lands on the message being written. -->
      <!-- biome-ignore lint/a11y/noStaticElementInteractions: role="presentation" is deliberate — this wrapper is never meant to be announced; the mousedown handler only preventDefaults so focus stays on the textarea, it is not a user interaction target. -->
      <div
        class="menu"
        id="composer-menu"
        onmousedown={(event) => event.preventDefault()}
        role="presentation"
      >
        <Command.Root loop shouldFilter={false} bind:value={highlight}>
          <Command.List>
            {#each sections as section (section.key)}
              <Command.Group heading={section.heading}>
                {#each section.entries as entry (entry.id)}
                  <Command.Item
                    id={domIds.get(entry.id)}
                    onSelect={() => choose(entry)}
                    value={entry.id}
                  >
                    <span class="e-label">{entry.label}</span>
                    {#if entry.detail}
                      <span class="e-detail">{entry.detail}</span>
                    {/if}
                  </Command.Item>
                {/each}
              </Command.Group>
            {/each}
          </Command.List>
        </Command.Root>
      </div>
    {/if}

    <!-- A label, so the pill's padding above and below the 34px field
         focuses it: its touch area is the field's. -->
    <label class="field touch-hit">
      <textarea
        aria-activedescendant={activeDescendant}
        aria-autocomplete="list"
        aria-controls="composer-menu"
        aria-expanded={menuOpen}
        aria-label="Message the agent"
        onblur={() => {
        dismissed = true;
      }}
        onclick={noteCaret}
        oninput={noteCaret}
        {onkeydown}
        onkeyup={noteCaret}
        {onpaste}
        onselect={noteCaret}
        placeholder="Message the agent…  /  for commands, @ to mention"
        role="combobox"
        bind:this={field}
        bind:value={draft.text}
        {@attach autosize(() => draft.text)}
      ></textarea>
    </label>

    <div class="ctrls">
      {@render leading?.()}
      <button
        aria-label="Attach a file or image"
        class="att-btn touch-hit"
        onclick={() => fileInput?.click()}
        type="button"
      >
        <IconPlus />
      </button>
      <button
        aria-disabled={!busy && sending ? 'true' : undefined}
        aria-label={busy ? 'Stop the agent' : 'Send message'}
        class="stop touch-hit"
        disabled={held || !(busy || draft.hasContent)}
        onclick={onaction}
        type="button"
      >
        <!-- The one control that changes meaning mid-turn. `{#key}` re-creates
             the glyph on every flip, so BOTH directions of the swap animate in;
             the box it sits in is untouched, so send↔stop never moves or
             resizes under a thumb already travelling toward it. -->
        {#key busy}
          <span class="swap">
            {#if busy}
              <IconStop />
            {:else}
              <IconSend />
            {/if}
          </span>
        {/key}
      </button>
    </div>
  </form>
</div>

<style>
  .fade {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 96px;
    pointer-events: none;
    z-index: 19;
    background: linear-gradient(
      to top,
      var(--surface-recess) 22%,
      var(--surface-recess-clear)
    );
  }
  .composer {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
    width: min(720px, calc(100% - 50px));
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    pointer-events: none;
  }
  .composer > :global(*) {
    pointer-events: auto;
  }
  .prompts {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  /* The snippet is always passed; with nothing parked it renders only its
     anchors, and an empty wrapper would still take a flex gap in the measured
     composer. A leaving prompt keeps it open until its exit has played. */
  .prompts:empty {
    display: none;
  }

  /* One shape, always. --radius-lg outside, --space-2 of inset, and the
     controls inside carry (panel − inset) so the curves are concentric rather
     than two unrelated roundings stacked. Nothing here changes on focus. */
  .cin {
    --cin-pad: var(--space-2);
    --cin-ctl: 34px;
    position: relative;
    border: 1px solid var(--border-control);
    background: var(--surface-raised-82);
    -webkit-backdrop-filter: blur(16px) saturate(1.6);
    backdrop-filter: blur(16px) saturate(1.6);
    border-radius: var(--radius-lg);
    padding: var(--cin-pad) var(--cin-pad) var(--cin-pad) var(--space-3);
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    box-shadow: var(--shadow-tile);
  }
  .field {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
  }
  textarea {
    flex: 1 1 auto;
    border: 0;
    outline: 0;
    background: transparent;
    resize: none;
    font-family: var(--font-body);
    font-size: var(--a-input-fs, 16px);
    line-height: var(--leading-ui);
    color: var(--ink-strong);
    /* Grows with what is in it (motion/autosize.svelte.ts), a line at a time
       over 120ms, from one line's worth of the control height to a ceiling,
       and scrolls past that. The control row sets the resting height so a
       single line sits on the buttons' midline. */
    height: var(--cin-ctl);
    min-height: var(--cin-ctl);
    max-height: 200px;
    transition: height var(--dur-control) var(--ease-out);
    padding: calc((var(--cin-ctl) - 1lh) / 2) 0;
    min-width: 0;
  }
  /* One line, always: the field is sized from its value, so a placeholder
     that wrapped would be clipped to the first line. */
  textarea::placeholder {
    color: var(--ink-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hidden-file {
    display: none;
  }

  /* The `/` and `@` menu, above the pill and matched to its width. */
  .menu {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(100% + var(--space-2));
    max-height: 320px;
    overflow: hidden;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    /* It floats above the input, so it settles UPWARD into place — 4px of
       travel, one --dur-control, and then it is still. Dismissal is instant: a menu
       that lingers on the way out sits over the sentence being written. */
    animation: menu-open var(--dur-control) var(--ease-out) both;
  }
  @keyframes menu-open {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .menu {
      animation: none;
    }
  }

  /* The Command primitive is shadcn's; its parts are addressed by slot so the
     menu wears Quiet Ledger tokens rather than the stock ladder. The list is the
     one thing that scrolls; the shell stays put. */
  :global(.menu [data-slot="command"]) {
    background: transparent;
  }
  :global(.menu [data-slot="command-list"]) {
    max-height: 320px;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-1);
  }

  /* Each family is a titled section, ruled off from the one above so "Skills"
     and "Commands" read as two kinds of thing rather than one long list. */
  :global(.menu [data-slot="command-group"]) {
    padding: var(--space-1) 0;
  }
  :global(.menu [data-slot="command-group"] + [data-slot="command-group"]) {
    border-top: 1px solid var(--border-hairline);
  }
  :global(.menu [data-slot="command-group"] [data-command-group-heading]) {
    padding: var(--space-1) var(--space-2) var(--space-2);
    font-size: var(--text-meta);
    font-weight: var(--weight-medium);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ink-muted);
  }

  /* One row: the name, its prose, and where it came from — on a single line,
     the selected one carrying fill and stronger ink so the highlight survives
     greyscale (it is never colour alone). */
  :global(.menu [data-slot="command-item"]) {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-height: 30px;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--ink-strong);
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);
  }
  :global(.menu [data-slot="command-item"][data-selected="true"]) {
    background: var(--surface-hover);
    color: var(--ink-strong);
  }
  @media (pointer: coarse) {
    :global(.menu [data-slot="command-item"]) {
      min-height: 44px;
    }
  }

  .e-label {
    font-family: var(--font-mono);
    font-weight: var(--weight-medium);
    color: var(--ink-strong);
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .e-detail {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-label);
    color: var(--ink-muted);
    flex: 1 1 auto;
  }

  /* Attach + send, together and bottom-aligned, so they hold their box as the
     text above them runs on. On a coarse pointer the gap opens to 10px, so
     each 34px control's touch area reaches 44px before meeting its
     neighbour's. */
  .ctrls {
    --hit-gap-x: var(--space-2);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 0 0 auto;

    @media (pointer: coarse) {
      --hit-gap-x: 10px;
      gap: 10px;
    }
  }
  .att-btn,
  .stop {
    width: var(--cin-ctl);
    height: var(--cin-ctl);
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    cursor: pointer;
    /* Concentric with the shell: outer radius less the inset that seats it. */
    border-radius: calc(var(--radius-lg) - var(--cin-pad));
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out),
      transform var(--dur-control) var(--ease-out);
  }
  .att-btn {
    border: 1px solid var(--border-control);
    background: var(--surface-raised);
    color: var(--ink-muted);
  }
  .att-btn :global(svg) {
    width: 17px;
    height: 17px;
  }
  @media (hover: hover) and (pointer: fine) {
    .att-btn:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  .stop {
    border: 0;
    background: var(--brand-solid);
    color: var(--on-brand);
  }
  .stop :global(svg) {
    width: 16px;
    height: 16px;
  }
  /* The glyph carrier, not the button: it is content-sized and centred, so
     scaling it in cannot change the control's box. */
  .stop .swap {
    display: grid;
    place-items: center;
    animation: icon-swap var(--dur-control) var(--ease-out) both;
  }
  @keyframes icon-swap {
    from {
      opacity: 0;
      transform: scale(0.6);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  /* Optical centring: the send plane's mass sits low-left of its box, so the
     glyph is nudged up and right to look centred rather than measure centred.
     The stop square is symmetric and needs none of it. */
  .stop:not(:disabled) :global(svg) {
    transform: translate(0.5px, -0.5px);
  }
  .att-btn:active,
  .stop:active:not(:disabled) {
    transform: scale(0.96);
  }
  .stop:disabled {
    opacity: 0.45;
    cursor: default;
    box-shadow: none;
    background-image: none;
  }
  .att-btn:focus-visible,
  .stop:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  /* Pending attachment chips, above the input pill. The row scrolls, so on
     a coarse pointer it takes 8px more padding into an equal negative margin:
     the remove buttons' touch areas fit inside its clip, nothing moves. */
  .atts {
    --hit-gap-x: var(--space-2);
    --hit-gap-y: var(--space-2);
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    max-height: 180px;
    overflow-y: auto;
    padding: var(--space-1);

    @media (pointer: coarse) {
      padding: calc(var(--space-1) + 8px);
      margin: -8px;
    }
  }
  .att {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    max-width: 100%;
    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-2);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    font-size: var(--text-label);
    color: var(--ink-strong);
    /* A chip appearing under the input is a small confirmation, so it gets a
       small one: 2px of travel and one --dur-control. Removal stays instant — the
       reader who clicked × has already decided. */
    animation: att-in var(--dur-control) var(--ease-out) both;
  }
  @keyframes att-in {
    from {
      opacity: 0;
      transform: translateY(2px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  /* The name carries the ellipsis, so the chip itself does not clip its
     remove button's touch area. */
  .att-name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .att img {
    width: 20px;
    height: 20px;
    border-radius: var(--radius-xs);
    object-fit: cover;
    flex: 0 0 auto;
  }
  .att button {
    display: grid;
    place-items: center;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    flex: 0 0 auto;
  }
  .att button :global(svg) {
    width: 13px;
    height: 13px;
  }
  .att button:hover {
    background: var(--surface-recess);
    color: var(--ink-strong);
  }

  /* Mobile: the composer goes full-width, edge to edge. It stays absolute
     (docked at the bottom of the transcript pane) rather than viewport-fixed,
     so it sits ABOVE the thumb bar instead of overlapping it — the thumb bar
     owns the safe-area inset. */
  @media (max-width: 900px) {
    .composer {
      left: var(--space-3);
      right: var(--space-3);
      width: auto;
      transform: none;
      /* Clear the home indicator / gesture bar — the resting gap plus the safe
         area inset, so the composer never sits under the rounded-screen chrome. */
      bottom: calc(var(--space-2) + env(safe-area-inset-bottom));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .att-btn,
    .stop {
      transition: none;
    }
    .att-btn:active,
    .stop:active:not(:disabled) {
      transform: none;
    }
    .stop .swap,
    .att {
      animation: none;
    }
  }
</style>
