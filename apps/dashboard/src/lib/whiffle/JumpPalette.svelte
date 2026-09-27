<script lang="ts">
  import { Command as CommandPrimitive } from "bits-ui";
  import { flip } from "svelte/animate";
  import { expoOut } from "svelte/easing";
  import { fade, scale } from "svelte/transition";
  import { goto } from "$app/navigation";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Command from "$lib/components/ui/command";
  import { Kbd } from "$lib/components/ui/kbd";
  import {
    IconAgent,
    IconChat,
    IconCpu,
    IconDocument,
    IconFolder,
    IconMonitor,
    IconSearch,
    IconUser,
  } from "$lib/icons";
  import { ACTIVITY_LABEL } from "./activity";
  import { whiffle } from "./client.svelte";
  import JumpMatch from "./JumpMatch.svelte";
  import { buildJumpIndex, filterJumpIndex, type JumpKind } from "./jump-index";
  import {
    AUTHORS,
    type AuthorToken,
    applyAuthor,
    authorFragment,
    JumpTranscriptSearch,
    parseQuery,
    stripFragment,
  } from "./jump-search.svelte";
  import { conversationHref } from "./links";

  let { open = $bindable(false) }: { open?: boolean } = $props();
  let query = $state("");

  const index = $derived.by(() =>
    buildJumpIndex({
      instances: whiffle.instances,
      projects: whiffle.projects,
      onlineMachines: whiffle.onlineMachines,
      running: whiffle.runningInstances.map((instance) => ({
        id: instance.id,
        cwd: instance.cwd,
        activityLabel: ACTIVITY_LABEL[whiffle.activityOf(instance.id)],
      })),
      stored: whiffle.machines.map((machine) => ({
        machineId: machine.machineId,
        hostname: machine.hostname,
        catalog: whiffle.catalogOf(machine.machineId),
      })),
    })
  );
  const grouped = $derived(filterJumpIndex(index, query));
  const search = new JumpTranscriptSearch();
  $effect(() => {
    search.update(open ? query : "", scope ? scoped?.role : undefined);
  });
  const hostOf = $derived(
    new Map(whiffle.machines.map((m) => [m.machineId, m.hostname]))
  );

  /** A row's kind decides its mark. Drawn icons, one stroke weight, never glyphs. */
  const MARK = {
    project: IconFolder,
    machine: IconMonitor,
    live: IconCpu,
    stored: IconChat,
  } as const satisfies Record<JumpKind, unknown>;

  const snippetMarkers = /「|」/;
  /** The same markers for stripping: `replaceAll` refuses a non-global regex. */
  const allSnippetMarkers = /「|」/g;
  /** FTS5 wraps every matched term in 「…」; odd segments are the matches. */
  const segments = (snippet: string) => snippet.split(snippetMarkers);
  const plain = (snippet: string) => snippet.replaceAll(allSnippetMarkers, "");
  const leaf = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

  /**
   * Motion is opt-out at the source, not only in CSS: `animate:` and
   * `transition:` run in JS and ignore the media query on their own.
   */
  const reduced =
    typeof matchMedia === "function"
      ? matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  let still = $state(reduced?.matches ?? false);
  $effect(() => {
    if (!reduced) {
      return;
    }
    const sync = () => {
      still = reduced.matches;
    };
    reduced.addEventListener("change", sync);
    return () => reduced.removeEventListener("change", sync);
  });
  /** Rows settle into their new rank; they never slide in from nowhere. */
  const settle = $derived({ duration: still ? 0 : 180, easing: expoOut });
  const arrive = $derived({ duration: still ? 0 : 140 });
  /** The chip lands rather than pops: it grows the last twentieth into place. */
  const chipMotion = $derived({
    duration: still ? 0 : 190,
    start: 0.95,
    easing: expoOut,
  });

  const SKELETONS = [0, 1, 2];

  /** The `@…` the reader is part-way through typing, if any. */
  const fragment = $derived(authorFragment(query));
  /** The authors that `@…` could still become. */
  const authorChoices = $derived(
    fragment === null ? [] : AUTHORS.filter((a) => a.token.startsWith(fragment))
  );
  const AUTHOR_MARK = { me: IconUser, agent: IconAgent } as const;

  /**
   * Who the search is scoped to. Held as state rather than left in the query
   * text: a scope is a thing you can see and dismiss, and an `<input>` cannot
   * render one inside its own value.
   */
  let scope = $state<AuthorToken | null>(null);
  const scoped = $derived(AUTHORS.find((a) => a.token === scope));
  let input = $state<HTMLInputElement | null>(null);

  /** Settle the token into a chip and leave the caret ready for the terms. */
  function chooseAuthor(token: AuthorToken) {
    scope = token;
    query = stripFragment(query);
    input?.focus();
  }

  /**
   * A token typed out in full — `@me ` — becomes the same chip the menu makes,
   * so the two ways of naming a scope end in one state rather than two.
   */
  $effect(() => {
    const parsed = parseQuery(query);
    if (!parsed.role) {
      return;
    }
    scope = AUTHORS.find((a) => a.role === parsed.role)?.token ?? null;
    query = parsed.text;
  });

  /** Backspace at the start of an empty-ish query takes the chip off. */
  function onSearchKey(event: KeyboardEvent) {
    if (event.key !== "Backspace" || !scope) {
      return;
    }
    const el = event.target as HTMLInputElement;
    if (el.selectionStart === 0 && el.selectionEnd === 0) {
      event.preventDefault();
      scope = null;
    }
  }

  async function jump(href: string) {
    open = false;
    await goto(href);
  }
</script>

<Command.Dialog
  class="jump-dialog top-[9vh] sm:max-w-2xl"
  description="Jump to a project, machine, or session"
  loop
  shouldFilter={false}
  title="Jump to"
  bind:open
>
  <!-- The signature move, applied to the whole panel rather than half of it:
       ONE sunken well inside the raised card, holding the search line, the
       results and the hints. The input was its own bordered control floating
       above a separately bordered list — two boxes, two radii, two insets. -->
  <div class="jump-well">
    <!-- The search line is built here rather than taken from Command.Input:
         its input group owns the field's padding and puts the addon in flow,
         which leaves no place to put a chip except on top of the text. Icon,
         chip and field are flex siblings, so nothing overlaps and nothing
         needs measuring. -->
    <div class="jump-search">
      <IconSearch class="jump-search-icon" height={15} width={15} />
      {#if scoped}
        {@const ScopedMark = AUTHOR_MARK[scoped.token]}
        <span class="jump-chip" transition:scale={chipMotion}>
          <ScopedMark class="jump-chip-mark" height={11} width={11} />
          {scoped.label}
          <button
            aria-label="Clear author filter"
            class="jump-chip-off"
            onclick={() => {
              scope = null;
              input?.focus();
            }}
            type="button"
          >
            ×
          </button>
        </span>
      {/if}
      <CommandPrimitive.Input
        class="jump-field"
        onkeydown={onSearchKey}
        placeholder={scope
          ? "Search these messages…"
          : "Jump to a project, machine, or session…"}
        bind:ref={input}
        bind:value={query}
      />
    </div>

    <Command.List class="jump-list">
      {#if !(search.pending || fragment !== null)}
        <Command.Empty>Nothing matches that.</Command.Empty>
      {/if}

      <!-- Typing `@` asks who wrote the line, so the list answers that question
           and nothing else until it is settled. -->
      {#if fragment !== null}
        <Command.Group heading="Search messages from">
          {#each authorChoices as author (author.token)}
            {@const AuthorMark = AUTHOR_MARK[author.token]}
            <Command.Item
              onSelect={() => chooseAuthor(author.token)}
              value={`author:${author.token}`}
            >
              <AuthorMark class="jump-mark" height={14} width={14} />
              <span class="jump-name">{author.label}</span>
              <span class="jump-trail">@{author.token} · {author.detail}</span>
            </Command.Item>
          {/each}
        </Command.Group>
      {/if}

      {#each fragment === null ? grouped : [] as group (group.name)}
        <Command.Group heading={group.name}>
          {#each group.rows as entry (entry.id)}
            {@const EntryMark = MARK[entry.kind]}
            <div animate:flip={settle}>
              <Command.Item onSelect={() => jump(entry.href)} value={entry.id}>
                <EntryMark class="jump-mark" height={14} width={14} />
                <JumpMatch
                  class="jump-name"
                  ranges={entry.labelRanges}
                  text={entry.label}
                />
                <JumpMatch
                  class="jump-trail"
                  ranges={entry.detailRanges}
                  text={entry.detail}
                />
              </Command.Item>
            </div>
          {/each}
        </Command.Group>
      {/each}

      {#if search.pending || search.hits.length > 0}
        <Command.Group
          heading={scoped ? `Transcripts · from ${scoped.label}` : "Transcripts"}
        >
          {#if search.pending && search.hits.length === 0}
            <!-- The shape of what is coming, so the list does not jump when it lands. -->
            <div aria-hidden="true" class="jump-skeletons">
              {#each SKELETONS as row (row)}
                <div class="jump-skeleton">
                  <span
                    class="jump-skeleton-bar"
                    style="width: {38 - row * 6}%"
                  ></span>
                  <span
                    class="jump-skeleton-bar"
                    style="width: {74 - row * 9}%"
                  ></span>
                </div>
              {/each}
            </div>
            <span class="sr-only" role="status">Searching transcripts</span>
          {/if}
          {#each search.hits as hit (hit.docId)}
            <div in:fade={arrive} animate:flip={settle}>
              <Command.Item
                class="jump-hit"
                onSelect={() =>
                jump(conversationHref(hit.instanceId ?? hit.sessionId, whiffle.instanceIndex))}
                value={`hit:${hit.docId}`}
              >
                <!-- Which conversation this line came out of. Without it a list of
                   snippets is a list of strangers. -->
                <span class="jump-hit-head">
                  <IconDocument class="jump-mark" height={14} width={14} />
                  <span class="jump-name">
                    {index.sessionTitles.get(hit.sessionId) ??
                    (hit.cwd ? leaf(hit.cwd) : hit.sessionId.slice(0, 8))}
                  </span>
                  <span class="jump-trail">
                    {hostOf.get(hit.machineId) ?? hit.machineId}
                    · {hit.role}
                  </span>
                </span>
                <!-- And the line itself, with the terms that matched marked. -->
                <span class="jump-snippet" title={plain(hit.snippet)}>
                  {#each segments(hit.snippet) as part, i (i)}
                    {#if i % 2 === 1}
                      <mark>{part}</mark>
                    {:else}
                      {part}
                    {/if}
                  {/each}
                </span>
              </Command.Item>
            </div>
          {/each}
        </Command.Group>
      {/if}
    </Command.List>

    <div class="jump-footer">
      <span><Kbd>↑↓</Kbd> navigate</span>
      <span><Kbd>↵</Kbd> open</span>
      <span><Kbd>esc</Kbd> close</span>
    </div>
  </div>
</Command.Dialog>

<style>
  /* The dialog opens at 9vh; the well is bounded so the footer is never pushed
     under the fold. Measured before: at `top-1/3` with a 60vh list the panel
     ran 9px past the viewport and the key hints were unreachable. */
  :global(.jump-dialog) {
    /* The inset the well sits at — and the term the concentric radius below
       subtracts. Changing it in one place keeps the corners true. */
    --jump-inset: 7px;
    max-height: 82vh;
    padding: var(--jump-inset);
  }
  /* The command element carries its own 4px padding and an 8px corner that
     nothing paints — left in, they push the well to a 10px inset and the
     concentric radius below stops being true. */
  :global(.jump-dialog [data-slot="command"]) {
    padding: 0;
    border-radius: 0;
  }
  /* One surface for the whole panel. Its radius is the shell's minus the inset
     it sits at (20 − 7 = 13): a well cut to the card's own 7px corner read as
     a tighter, unrelated box inside a rounder one. */
  .jump-well {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border-hairline);
    border-radius: calc(var(--radius-lg) - var(--jump-inset));
    background: var(--surface-recess);
  }
  :global(.jump-list) {
    max-height: calc(82vh - 104px);
    padding: 4px;
    scroll-padding-block: 6px;
  }
  :global(.jump-chip-mark) {
    flex: none;
    color: currentcolor;
    opacity: 0.75;
  }
  /* Its own dismissal, for a pointer. A keyboard takes it off with backspace. */
  .jump-chip-off {
    display: grid;
    width: 14px;
    height: 14px;
    place-items: center;
    border-radius: var(--radius-pill);
    color: currentcolor;
    opacity: 0.65;
    font-size: var(--text-label);
    line-height: 1;
    cursor: pointer;
  }
  .jump-chip-off:hover {
    background: var(--accent-solid-a18);
    color: var(--accent-text);
  }

  /* Icon, chip and field share one row. The field takes what is left, so the
     chip can be any width and nothing overlaps or needs measuring. */
  .jump-search {
    display: flex;
    flex: none;
    align-items: center;
    gap: 7px;
    height: 42px;
    padding: 0 11px;
    border-bottom: 1px solid var(--border-hairline);
  }
  :global(.jump-search-icon) {
    flex: none;
    color: var(--ink-muted);
  }
  :global(.jump-field) {
    min-width: 0;
    flex: 1;
    border: 0;
    background: transparent;
    color: var(--ink-strong);
    font-size: var(--text-body);
    outline: none;
  }
  :global(.jump-field)::placeholder {
    color: var(--ink-muted);
  }
  /* An active filter is state the reader has to see, and this design keeps its
     colour for exactly this — chips, badges and small marks. It was filled
     with `--surface-recess`, the same token as the well behind it, so only a
     hairline separated them; tinting alone did not fix it either, since a pale
     tint on a pale well measured 1.03:1 against its background. Salience comes
     the way this design already makes a control salient — a tint, its own ink
     and a real edge — rather than from `--accent-solid` as a fill, which
     belongs to the assistant orb. */
  .jump-chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 4px;
    height: 21px;
    padding: 0 3px 0 7px;
    transform-origin: left center;
    border: 1px solid var(--accent-solid);
    border-radius: var(--radius-pill);
    background: var(--accent-bg-subtle);
    color: var(--accent-text);
    font-size: var(--text-label);
    font-weight: var(--weight-medium);
    line-height: 1;
    white-space: nowrap;
  }
  :global(.jump-mark) {
    flex: none;
    color: var(--ink-muted);
  }
  /* The name is the anchor step; everything factual about it sits one rung
     down. Without the step the name, the folder and the matched line all
     rendered at 12.5px and the row had no hierarchy to read. */
  :global(.jump-name) {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--ink-strong);
    font-size: var(--text-label);
    font-weight: var(--weight-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The trailing fact — machine, folder, role. Muted ink, the chip step of the
     ladder, and never wider than the name it follows. */
  :global(.jump-trail) {
    flex: none;
    margin-left: auto;
    max-width: 45%;
    overflow: hidden;
    color: var(--ink-muted);
    font-size: var(--text-label);
    letter-spacing: var(--track-caps);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :global(.jump-hit) {
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
  }
  :global(.jump-hit-head) {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  /* A session row and a transcript row invert each other, which is what tells
     them apart before either is read. In a session row the name IS the thing.
     In a transcript row the reader is scanning the line that matched, and the
     session name above it is only the label saying which conversation it came
     out of — so the name drops to the metadata rung and the line takes the
     anchor. */
  :global(.jump-hit .jump-name) {
    color: var(--ink-muted);
    font-size: var(--text-label);
    font-weight: var(--weight-body);
  }
  :global(.jump-snippet) {
    display: block;
    overflow: hidden;
    margin-left: 22px;
    color: var(--ink-strong);
    font-size: var(--text-label);
    font-weight: var(--weight-medium);
    line-height: var(--leading-ui);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The matched terms. Weight and ink carry the emphasis — 500 is the top of
     this system's ladder, and the mark's own yellow is not in the palette. */
  :global(.jump-snippet mark) {
    background: transparent;
    color: var(--ink-strong);
    font-weight: 500;
  }
  .jump-skeletons {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 6px 8px 10px;
  }
  .jump-skeleton {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .jump-skeleton-bar {
    height: 7px;
    border-radius: var(--radius-pill);
    background: var(--border-hairline);
    animation: jump-breathe var(--breath) var(--ease-in-out) infinite;
  }
  .jump-skeleton:nth-child(2) .jump-skeleton-bar {
    animation-delay: 120ms;
  }
  .jump-skeleton:nth-child(3) .jump-skeleton-bar {
    animation-delay: 240ms;
  }
  @keyframes jump-breathe {
    0%,
    100% {
      opacity: 0.45;
    }
    50% {
      opacity: 0.9;
    }
  }
  /* Inside the well, divided from the results by the same hairline as the
     search line above them — the panel reads as one object, top to bottom. */
  .jump-footer {
    display: flex;
    flex: none;
    gap: 16px;
    padding: 7px 12px;
    border-top: 1px solid var(--border-hairline);
    color: var(--ink-muted);
    font-size: var(--text-label);
  }
  @media (prefers-reduced-motion: reduce) {
    .jump-skeleton-bar {
      animation: none;
      opacity: 0.6;
    }
  }
</style>
