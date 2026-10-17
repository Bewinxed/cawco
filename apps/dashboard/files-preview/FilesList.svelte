<script lang="ts">
  /**
   * What Files holds: a search over all of it, then a session's artifacts
   * and its attachments, two regions both in sight the moment it opens,
   * each under its own head (its glyph, its name, its count) and each
   * scrolling on its own, so neither ever hides below the other; the two
   * part on the vermillion rule Caw's panel parts its sections with. The
   * panel's height is shared between them (`.files-regions`): each keeps at
   * least its head and a card or two rows (or its one line when it has
   * none) and grows with what it holds up to an even share; what one leaves,
   * the other takes.
   *
   * The artifacts are a masonry of their thumbnails (ArtifactCards). An
   * attachment row leads with its picture or the file glyph, its name over
   * "kind · who · age", and ends on Show in conversation. The search is the
   * find engine's matcher (search.ts): names, and the words on an
   * artifact's page, both regions filtered as it is typed; a region nothing
   * matches says so in its own place.
   */
  import { untrack } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import EmptyState from "#lib/components/ui/empty/empty-state.svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import { IconClose, IconLayers, IconPaperclip } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import IconChevronRight from "~icons/solar/alt-arrow-right-linear";
  import IconAlert from "~icons/solar/danger-circle-bold-duotone";
  import IconDocument from "~icons/solar/file-text-bold-duotone";
  import IconToolFiles from "~icons/solar/folder-with-files-bold-duotone";
  import IconSearch from "~icons/solar/magnifer-bold-duotone";
  import ArtifactCards from "./ArtifactCards.svelte";
  import {
    type ArtifactRow,
    type AttachmentRow,
    loadedAt,
  } from "./fixtures";
  import { searchArtifacts, searchAttachments } from "./search";

  let {
    artifacts,
    attachments,
    chosen = null,
    loading = false,
    failed = null,
    details = false,
    query = "",
  }: {
    artifacts: ArtifactRow[];
    attachments: AttachmentRow[];
    /** The artifact on show beside the conversation. */
    chosen?: string | null;
    /** The artifacts are still being read. */
    loading?: boolean;
    /** The list read's refusal, in the hub's words; the attachments are the store's and stand. */
    failed?: string | null;
    /** The refusal's words are unfolded under it. */
    details?: boolean;
    /** The words in the search as the panel opens. */
    query?: string;
  } = $props();

  let shown = $state(untrack(() => details));
  let words = $state(untrack(() => query));

  const uid = $props.id();
  const age = (offset: number) => formatAgeShort(loadedAt - offset, loadedAt);
  const nothing = $derived(
    !(loading || failed) && artifacts.length === 0 && attachments.length === 0
  );
  const asked = $derived(words.trim());
  const artifactHits = $derived(searchArtifacts(artifacts, words));
  const attachmentHits = $derived(searchAttachments(attachments, words));
  /** A head's count: the whole, or while searching, how many of the whole match. */
  const countOf = (hits: number, all: number) =>
    asked ? `${hits} of ${all}` : `${all}`;
  /** A region's floor: its head and two rows, one, or its own words. */
  const floor = (rows: number) =>
    rows >= 2 ? "two" : rows === 1 ? "one" : "own";
  const artifactsFloor = $derived(
    loading || failed || artifactHits.length === 0 ? "own" : "cards"
  );
  const attachmentsFloor = $derived(floor(attachmentHits.length));
</script>

{#if nothing}
  <EmptyState
    class="files-empty"
    icon={IconToolFiles}
    line="Pages, canvases, previews and files from this conversation collect here."
    title="Nothing here yet"
  />
{:else}
  <!-- The composer finder's field (find/Finder `.field`): the search glyph
       leading, the words, Clear trailing while there are any. -->
  <div class="files-field" data-files-search>
    <IconSearch aria-hidden="true" class="files-field-lead" />
    <input
      aria-label="Search this session's files, by name or by what is in them"
      autocapitalize="off"
      autocomplete="off"
      bind:value={words}
      enterkeyhint="search"
      placeholder="Search names and contents…"
      spellcheck="false"
      type="search"
    />
    {#if words}
      <button
        aria-label="Clear the words"
        class="files-field-clear touch-hit"
        onclick={() => {
          words = "";
        }}
        type="button"
      >
        <IconClose />
      </button>
    {/if}
  </div>
  <div
    class="files-regions"
    data-artifacts-floor={artifactsFloor}
    data-attachments-floor={attachmentsFloor}
  >
      <section
        aria-labelledby="{uid}-artifacts"
        class="files-section"
        data-files-region="artifacts"
      >
        <h3 class="files-head" id="{uid}-artifacts">
          <span class="files-head-lead" data-box><IconLayers aria-hidden="true" /></span>
          <span class="files-head-name">Artifacts</span>
          {#if !(loading || failed)}
            <span class="files-head-count num" data-files-count
              >{countOf(artifactHits.length, artifacts.length)}</span
            >
          {/if}
        </h3>
        {#if failed}
          <div class="files-failed" role="alert">
            <IconAlert aria-hidden="true" class="files-failed-mark" />
            <p class="files-failed-title">Couldn't read this session's artifacts</p>
            <p class="files-failed-line">
              The hub didn't answer the list. Nothing is lost: the artifacts are
              kept on the hub, and the attachments below come from the
              conversation itself.
            </p>
            <div class="files-failed-actions">
              <Button label="Try again" size="sm" />
              <Button
                aria-controls="{uid}-why"
                aria-expanded={shown}
                label={shown ? "Hide details" : "Show details"}
                onclick={() => {
                  shown = !shown;
                }}
                size="sm"
                variant="ghost"
              />
            </div>
            {#if shown}
              <pre class="files-failed-why" id="{uid}-why">{failed}</pre>
            {/if}
          </div>
        {:else if loading}
          <div aria-busy="true" aria-label="Reading artifacts" class="files-wait">
            {#each [0.46, 0.34] as share (share)}
              <div class="files-ghost-row">
                <span class="lead" data-box><Skeleton class="ghost-glyph" /></span>
                <Skeleton class="ghost-name" style="inline-size: {share * 100}%" />
                <Skeleton class="ghost-age" />
              </div>
            {/each}
          </div>
        {:else if artifacts.length === 0}
          <p class="files-none">Nothing made yet</p>
        {:else if artifactHits.length === 0}
          <p class="files-none" data-files-none>No artifacts match “{asked}”</p>
        {:else}
          <div class="files-scroll kit-edge-fade-block" data-files-scroll>
            <ArtifactCards {chosen} hits={artifactHits} />
          </div>
        {/if}
      </section>
      <section
        aria-labelledby="{uid}-attachments"
        class="files-section"
        data-files-region="attachments"
      >
        <h3 class="files-head" id="{uid}-attachments">
          <span class="files-head-lead" data-box><IconPaperclip aria-hidden="true" /></span>
          <span class="files-head-name">Attachments</span>
          <span class="files-head-count num" data-files-count
            >{countOf(attachmentHits.length, attachments.length)}</span
          >
        </h3>
        {#if attachments.length === 0}
          <p class="files-none">Nothing attached yet</p>
        {:else if attachmentHits.length === 0}
          <p class="files-none" data-files-none>No attachments match “{asked}”</p>
        {:else}
          <div class="files-scroll kit-edge-fade-block" data-files-scroll>
          <ul class="files-list" {@attach highlight({ rows: "[data-files-row]" })}>
            {#each attachmentHits as file (file.id)}
              <li class="files-item attachment" data-files-row>
                <button
                  class="kit-item relative flex cursor-default select-none items-center gap-2.5 text-label px-2.5 attachment-row"
                  title={file.name}
                  type="button"
                >
                  <span class="lead" data-box>
                    {#if file.picture}
                      <img
                        alt=""
                        class="thumb"
                        decoding="async"
                        loading="lazy"
                        src={file.picture}
                      />
                    {:else}
                      <IconDocument aria-hidden="true" />
                    {/if}
                  </span>
                  <span class="words">
                    <span class="row-name">{file.name}</span>
                    <span class="row-meta"
                      >{file.kind} · {file.who} · <span class="num"
                        >{age(file.age)}</span
                      ></span
                    >
                  </span>
                </button>
                <button
                  aria-label="Show {file.name} in conversation"
                  class="show touch-hit"
                  title="Show in conversation"
                  type="button"
                >
                  <IconChevronRight aria-hidden="true" />
                </button>
              </li>
            {/each}
          </ul>
          </div>
        {/if}
      </section>
  </div>
{/if}

<style>
  /* The two regions share the panel's height. Each track starts at its
     floor (its head and two rows, one, or its own words) and grows toward
     what it holds; the room left is shared out evenly between the tracks
     still growing (grid track sizing), so a short region keeps all of
     itself and a long one takes the rest, and two long ones split it. */
  .files-regions {
    --head-h: 32px;
    --rows-two: calc(var(--head-h) + 2 * var(--c-artifact-row-h));
    --rows-one: calc(var(--head-h) + var(--c-artifact-row-h));
    /* The second region's hairline and the space under it. */
    --region-seam: calc(1px + var(--space-2));
    --artifacts-min: min-content;
    --attachments-min: min-content;
    flex: 1;
    min-block-size: 0;
    display: grid;
    grid-template-rows:
      minmax(var(--artifacts-min), auto)
      minmax(var(--attachments-min), auto);
    align-content: start;
    padding-block-end: var(--space-2);

    /* A card's height: a landscape thumbnail and its two lines. */
    &[data-artifacts-floor="cards"] {
      --artifacts-min: calc(var(--head-h) + 4 * var(--c-artifact-row-h));
    }
    &[data-attachments-floor="two"] {
      --attachments-min: calc(var(--rows-two) + var(--region-seam));
    }
    &[data-attachments-floor="one"] {
      --attachments-min: calc(var(--rows-one) + var(--region-seam));
    }
  }
  .files-section {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    overflow: hidden;
  }
  /* The regions part on Caw's panel's vermillion hairline (CawPanel
     `.section + .section`): 1px of `brand-solid` at `tab-rim-mix`, the
     strength a status rim holds 3:1 at; solid under Increase Contrast. */
  .files-section + .files-section {
    padding-block-start: var(--space-2);
    border-block-start: 1px solid
      color-mix(in oklab, var(--brand-solid) var(--tab-rim-mix), transparent);

    @media (prefers-contrast: more) {
      border-block-start-color: var(--brand-solid);
    }
  }
  /* The composer finder's field (find/Finder `.field`): the search glyph,
     the words in the body role, Clear while there are any. */
  /* Its glyph on the heads' glyph column and its words on their names'. */
  .files-field {
    display: flex;
    align-items: center;
    gap: calc(10px + (var(--c-row-lead) - var(--icon-md)) / 2);
    flex: none;
    block-size: 44px;
    margin-block-end: var(--space-1);
    padding-inline: 10px var(--space-1);
    border-block-end: 1px solid var(--border-hairline);

    & :global(.files-field-lead) {
      flex: none;
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
      color: var(--ink-muted);
    }
    & input {
      flex: 1;
      min-inline-size: 0;
      block-size: 100%;
      border: 0;
      padding: 0;
      background: none;
      font: var(--type-body);
      color: var(--ink-strong);
      caret-color: var(--brand-solid);
      outline: none;
      appearance: none;

      &::placeholder {
        color: var(--ink-subtle);
        text-overflow: ellipsis;
      }
      &::-webkit-search-cancel-button {
        display: none;
      }
    }
  }
  .files-field-clear {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: 36px;
    block-size: 36px;
    border: 0;
    border-radius: var(--radius-md);
    background: none;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
    @media (hover: hover) {
      &:hover {
        background: var(--surface-hover);
      }
    }
    &:active {
      background: var(--surface-fill);
    }
  }
  /* Each region's own scroll, with the house fade at its foot while more is
     below. */
  .files-scroll {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--border-control) transparent;
    mask-image: linear-gradient(
      to bottom,
      #000 calc(100% - var(--fade-end)),
      transparent
    );
  }
  /* A section's head as Caw's panel heads its sections (DESIGN.md, Caw's
     panel): its 16px Solar duotone glyph in the rows' lead column, its
     name in the label role and strong ink, its count in meta at the end,
     standing over its region's scroll. */
  .files-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: var(--head-h);
    margin: 0;
    padding-inline: calc(10px - (var(--c-row-lead) - var(--icon-md)) / 2) 10px;
    background: var(--surface-raised);
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .files-head-lead {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--c-row-lead);
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
  }
  .files-head-name {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .files-head-count {
    flex: none;
    margin-inline-start: auto;
    color: var(--ink-muted);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  /* The cards' gutter: the rows' edges, so a card's picture lines up with
     the head's glyph. */
  .files-scroll > :global([data-files-cards]) {
    padding-inline: calc((10px - (var(--c-row-lead) - var(--icon-md)) / 2) - var(--space-1));
  }
  .files-list {
    position: relative;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .files-item {
    position: relative;
    border-radius: var(--radius-sm);
  }
  .attachment-row {
    inline-size: 100%;
    min-block-size: var(--c-artifact-row-h);
    border: 0;
    background: none;
    color: var(--ink-strong);
    text-align: start;
    cursor: pointer;
  }
  .row-name {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-label);
  }
  /* Every row stands on one grid with the heads (DESIGN.md, Caw's panel):
     its mark centred in one 28px lead column, so every name starts on one
     text column. */
  .attachment-row,
  .files-ghost-row {
    padding-inline-start: calc(10px - (var(--c-row-lead) - var(--icon-md)) / 2);
  }
  /* An attachment: the name over its meta line; its Show in conversation
     stands at the row's end. */
  .attachment-row {
    padding-inline-end: calc(var(--c-btn-h-xs) + var(--space-2));
  }
  .lead {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--c-row-lead);
    block-size: var(--c-row-lead);
    overflow: clip;
    color: inherit;
  }
  .thumb {
    inline-size: var(--c-row-lead);
    block-size: var(--c-row-lead);
    max-inline-size: none;
    border-radius: var(--radius-sm);
    object-fit: cover;
    outline: 1px solid var(--image-outline);
    outline-offset: -1px;
  }
  .words {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-inline-size: 0;
  }
  .words .row-name {
    flex: none;
  }
  .row-meta {
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink-muted);
    font: var(--type-meta);
  }
  .show {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-end: var(--space-1);
    translate: 0 -50%;
    display: grid;
    place-items: center;
    inline-size: var(--c-btn-h-xs);
    block-size: var(--c-btn-h-xs);
    padding: 0;
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    opacity: 0;
    transition:
      opacity var(--dur-control) var(--ease-out),
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
  }
  .attachment:is(:hover, :focus-within) .show {
    opacity: 1;
  }
  @media (hover: hover) {
    .show:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  @media (pointer: coarse) {
    .show {
      opacity: 1;
    }
  }
  .files-none {
    display: flex;
    align-items: center;
    min-block-size: 32px;
    margin: 0;
    padding-inline: 10px;
    color: var(--ink-muted);
    font: var(--type-meta);
  }
  .files-wait {
    display: grid;
  }
  /* A row as it will stand (The Claim Of Nothing Rule: the skeleton at the
     real layout's size): the glyph, the name and the age, each a block the
     size of what it stands for, so the list's arrival moves nothing. */
  .files-ghost-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: var(--c-artifact-row-h);
    padding-inline-end: 10px;
  }
  .files-ghost-row :global(.ghost-glyph) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    border-radius: var(--radius-xs);
  }
  .files-ghost-row :global(.ghost-name),
  .files-ghost-row :global(.ghost-age) {
    block-size: 1ex;
    border-radius: var(--radius-hair);
    font: var(--type-label);
  }
  .files-ghost-row :global(.ghost-age) {
    inline-size: 2ch;
    margin-inline-start: auto;
  }
  :global(.files-empty) {
    flex: 1;
  }
  /* The list read failed: centred in the Artifacts section, the error
     formula (what happened, what is safe, how to fix it), Try again first,
     the hub's own words a fold away. */
  .files-failed {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-3);
    text-align: center;
  }
  .files-failed :global(.files-failed-mark) {
    inline-size: 20px;
    block-size: 20px;
    color: var(--status-fail-glyph);
  }
  .files-failed-title {
    margin: 0;
    color: var(--ink-strong);
    font: var(--type-label);
    text-wrap: balance;
  }
  .files-failed-line {
    max-inline-size: 60ch;
    margin: 0;
    color: var(--ink-muted);
    font: var(--type-meta);
    text-wrap: pretty;
  }
  .files-failed-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    margin-block-start: var(--space-1);
  }
  .files-failed-why {
    align-self: stretch;
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--code-bg);
    color: var(--ink-strong);
    font: var(--type-code);
    font-variant-ligatures: none;
    text-align: start;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    user-select: text;
  }
</style>
