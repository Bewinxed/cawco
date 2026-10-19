<script lang="ts">
  /**
   * What Files holds for one session: a search over all of it, then its
   * artifacts and its attachments, both in sight the moment it opens, each
   * under its own head (its glyph, its name, its count) and each scrolling
   * on its own, so neither hides below the other (owner: "each section
   * should scroll within"); the two part on the vermillion hairline Caw's
   * panel parts its sections with (owner: "use icons for sections and
   * separate them with vermillion"). While a region holds more than it
   * shows, a sign at its foot says how many more, and a press scrolls them
   * into view.
   *
   * The artifacts are a masonry of their thumbnails (ArtifactCards). An
   * attachment row leads with its picture or its file's glyph, its name over
   * "kind · who · age", and ends on Show in conversation. The search is the
   * finder's own field (FindField): artifacts by the hub's search (their
   * names, and the words on their pages, by the find engine's matcher),
   * attachments by the same matcher here; a region nothing matches says so
   * in its own place.
   *
   * On a phone (`segmented`) there is no room for two scrolls one over the
   * other: one list at a time under the kit's segmented control, Artifacts
   * | Attachments, each segment with its count (while searching, its hits),
   * the chosen list filling the rest of the drawer (owner: "aren't tabs for
   * attachments and artifacts a better fit here?").
   */
  import type { ArtifactSummary } from "@cawco/core";
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { Button } from "#lib/components/ui/button/index.js";
  import EmptyState from "#lib/components/ui/empty/empty-state.svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import {
    IconAlert,
    IconChevronDown,
    IconChevronRight,
    IconDocument,
    IconLayers,
    IconPaperclip,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import IconFolder from "~icons/solar/folder-2-bold-duotone";
  import { searchArtifacts } from "../artifact-api";
  import FindField from "../find/FindField.svelte";
  import { excerptParts } from "../find/find-rows";
  import { failureWords } from "../hub-read";
  import { lightbox } from "../lightbox/lightbox-state.svelte";
  import ArtifactCards from "./ArtifactCards.svelte";
  import {
    type ArtifactCard,
    type AttachmentRow,
    artifactsOf,
    attachmentsOf,
    readArtifacts,
    searchAttachments,
  } from "./files.svelte";

  let {
    instanceId,
    chosen = null,
    segmented = false,
    onpick,
    onshow,
  }: {
    /** The session whose files these are. */
    instanceId: string;
    /** The artifact on show beside Files. */
    chosen?: string | null;
    /** One list at a time under a segmented control: the phone's drawer. */
    segmented?: boolean;
    /** An artifact chosen: it opens where the caller shows it. */
    onpick: (artifact: ArtifactSummary) => void;
    /** Show in conversation pressed: the transcript goes to the message. */
    onshow: (attachment: AttachmentRow) => void;
  } = $props();

  const uid = $props.id();
  let words = $state("");
  /** The list the segmented control shows. */
  let list = $state("artifacts");
  /** The refusal's words are unfolded under it. */
  let details = $state(false);

  // Read again each time Files opens: the pictures the pane kept since.
  $effect(() => {
    const id = instanceId;
    untrack(() => readArtifacts(id));
  });
  const read = $derived(artifactsOf(instanceId));
  const artifacts = $derived(read?.list ?? null);
  const loading = $derived(artifacts === null && !read?.failed);
  const failed = $derived(artifacts === null ? (read?.failed ?? null) : null);
  const attachments = $derived(attachmentsOf(instanceId));
  const nothing = $derived(
    artifacts !== null && artifacts.length === 0 && attachments.length === 0
  );
  const asked = $derived(words.trim());

  /* ── The search ─────────────────────────────────────────────────── */
  /** The hub's hits for the words asked, in its order; null while none have come back. */
  let hits = $state<{
    q: string;
    ids: string[];
    within: Map<string, string>;
  } | null>(null);
  let searchFault = $state<string | null>(null);
  /** As the words settle, the hub is asked; a later ask supersedes. */
  const SETTLE_MS = 120;
  $effect(() => {
    const q = asked;
    const id = instanceId;
    if (!q) {
      hits = null;
      searchFault = null;
      return;
    }
    const stop = new AbortController();
    const timer = setTimeout(() => {
      searchArtifacts(id, q, stop.signal).then(
        (answer) => {
          hits = {
            q,
            ids: answer.map((hit) => hit.id),
            within: new Map(
              answer.flatMap((hit) =>
                hit.excerpt ? [[hit.id, hit.excerpt] as const] : []
              )
            ),
          };
          searchFault = null;
        },
        (error: unknown) => {
          if (!stop.signal.aborted) {
            searchFault = failureWords(error);
          }
        }
      );
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  });
  const cards = $derived.by<ArtifactCard[]>(() => {
    if (!artifacts) {
      return [];
    }
    if (!asked) {
      return artifacts.map((artifact) => ({ artifact, within: null }));
    }
    if (!hits) {
      return [];
    }
    const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    return hits.ids.flatMap((id) => {
      const artifact = byId.get(id);
      const excerpt = hits?.within.get(id);
      return artifact
        ? [{ artifact, within: excerpt ? excerptParts(excerpt) : null }]
        : [];
    });
  });
  /** The hub has not answered the words as they stand yet. */
  const searching = $derived(!!asked && hits?.q !== asked && !searchFault);
  const attachmentHits = $derived(searchAttachments(attachments, words));
  /** A head's count: the whole, or while searching, how many of the whole match. */
  const countOf = (shown: number, all: number) =>
    asked ? `${shown} of ${all}` : `${all}`;
  /** A region's floor: its head and two rows, one, or its own words. */
  const floor = (rows: number) => {
    if (rows >= 2) {
      return "two";
    }
    return rows === 1 ? "one" : "own";
  };
  const artifactsFloor = $derived(cards.length > 0 ? "cards" : "own");
  const attachmentsFloor = $derived(floor(attachmentHits.length));

  /* ── Each region's own scroll ───────────────────────────────────── */
  /** The house fade's least length at a region's foot (app.css). */
  const FADE_LEAST = 40;
  /** How many of a region's items stand past its foot, by region. */
  const more = $state<Record<string, number>>({});
  /** The same, as last written: read by the measure, which tracks nothing. */
  const written = new Map<string, number>();
  const writeMore = (region: string, past: number) => {
    if (written.get(region) !== past) {
      written.set(region, past);
      more[region] = past;
    }
  };
  /**
   * A region's scroll, measured as it scrolls and resizes: how many of its
   * items stand past its foot (the "N more" sign), and, for the masonry,
   * where its foot fade starts. The lanes end at different heights, so the
   * fade (the house edge fade's `--fade-len`) runs from the top of the
   * highest card the foot cuts: a card cut short fades whole, picture and
   * name together, never a picture sliced off with no name under it.
   */
  const measured =
    (
      region: string,
      items: string,
      cutWhole: boolean
    ): Attachment<HTMLElement> =>
    (scroller) => {
      const measure = () => {
        const foot = scroller.getBoundingClientRect().bottom;
        let from = foot;
        let past = 0;
        for (const item of scroller.querySelectorAll(items)) {
          const box = item.getBoundingClientRect();
          if (box.bottom > foot + 1) {
            past += 1;
          }
          if (cutWhole && box.top < foot - 1 && box.bottom > foot + 1) {
            from = Math.min(from, box.top);
          }
        }
        if (cutWhole) {
          scroller.style.setProperty(
            "--fade-len",
            `${Math.max(foot - from, FADE_LEAST)}px`
          );
        }
        writeMore(region, past);
      };
      measure();
      const seen = new ResizeObserver(measure);
      seen.observe(scroller);
      for (const child of scroller.children) {
        seen.observe(child);
      }
      const added = new MutationObserver(measure);
      added.observe(scroller, { childList: true, subtree: true });
      scroller.addEventListener("scroll", measure, { passive: true });
      return () => {
        seen.disconnect();
        added.disconnect();
        scroller.removeEventListener("scroll", measure);
        writeMore(region, 0);
      };
    };
  /** The sign's press: the region scrolls on by most of its height. */
  const scrollOn = (region: string) => {
    const scroller = document.getElementById(`${uid}-${region}-scroll`);
    scroller?.scrollBy({
      top: scroller.clientHeight * 0.8,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };

  /** A picture opens in the lightbox at its own size, out of its row's thumbnail. */
  const openPicture = async (
    src: string,
    alt: string,
    element: HTMLElement | null
  ) => {
    const picture = new Image();
    picture.src = src;
    await picture.decode().catch(() => undefined);
    lightbox.open({
      kind: "image",
      index: 0,
      shots: [
        {
          src,
          alt,
          cropped: true,
          element: element ?? undefined,
          width: picture.naturalWidth,
          height: picture.naturalHeight,
        },
      ],
    });
  };

  const openAttachment = (row: AttachmentRow, from: HTMLElement) => {
    if (row.open.kind === "image") {
      openPicture(
        row.open.src,
        row.open.alt,
        from.querySelector<HTMLElement>("img")
      );
    } else if (row.open.kind === "text") {
      lightbox.open({
        kind: "text",
        name: row.name,
        content: row.open.content,
      });
    }
  };
</script>

{#if nothing}
  <EmptyState
    class="files-empty"
    data-files-empty
    icon={IconFolder}
    line="Pages, canvases, previews and the files you and the agent share collect here."
    title="Nothing here yet"
  />
{:else}
  <!-- The finder's own field (FindField), as Jump's. -->
  <div class="files-search" data-files-search>
    <FindField
      aria-label="Search this session's files, by name or by what is in them"
      autocapitalize="off"
      autocomplete="off"
      enterkeyhint="search"
      onclear={() => {
        words = "";
      }}
      oninput={(event) => {
        words = event.currentTarget.value;
      }}
      placeholder="Search names and contents…"
      spellcheck="false"
      type="text"
      value={words}
    />
  </div>
  {#if segmented}
    <!-- One list at a time under the kit's segmented control (Apple HIG,
         Segmented controls: "switch between closely related subviews"),
         each segment its noun and its count, equal widths. -->
    <Tabs.Root bind:value={list} class="files-tabs">
      <Tabs.List aria-label="Artifacts or attachments" class="files-segments">
        <Tabs.Trigger data-files-segment="artifacts" value="artifacts">
          <span>Artifacts</span>
          {#if artifacts}
            <span class="files-segment-count num" data-files-head-count
              >{countOf(cards.length, artifacts.length)}</span
            >
          {/if}
        </Tabs.Trigger>
        <Tabs.Trigger data-files-segment="attachments" value="attachments">
          <span>Attachments</span>
          <span class="files-segment-count num" data-files-head-count
            >{countOf(attachmentHits.length, attachments.length)}</span
          >
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content
        class="files-pane"
        data-files-region="artifacts"
        value="artifacts"
      >
        {@render artifactsBody()}
      </Tabs.Content>
      <Tabs.Content
        class="files-pane"
        data-files-region="attachments"
        value="attachments"
      >
        {@render attachmentsBody()}
      </Tabs.Content>
    </Tabs.Root>
  {:else}
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
        <h3 class="files-head mark-line" id="{uid}-artifacts">
          <span class="files-head-lead" data-box
            ><IconLayers aria-hidden="true" /></span
          >
          <span class="files-head-name">Artifacts</span>
          {#if artifacts}
            <span class="files-head-count num" data-files-head-count
              >{countOf(cards.length, artifacts.length)}</span
            >
          {/if}
        </h3>
        {@render artifactsBody()}
      </section>
      <section
        aria-labelledby="{uid}-attachments"
        class="files-section"
        data-files-region="attachments"
        data-files-rule
      >
        <h3 class="files-head mark-line" id="{uid}-attachments">
          <span class="files-head-lead" data-box
            ><IconPaperclip aria-hidden="true" /></span
          >
          <span class="files-head-name">Attachments</span>
          <span class="files-head-count num" data-files-head-count
            >{countOf(attachmentHits.length, attachments.length)}</span
          >
        </h3>
        {@render attachmentsBody()}
      </section>
    </div>
  {/if}
{/if}

{#snippet moreSign(region: string)}
  {#if (more[region] ?? 0) > 0}
    <div class="files-more">
      <Button
        aria-controls="{uid}-{region}-scroll"
        data-files-more={more[region]}
        icon={IconChevronDown}
        label="{more[region]} more"
        onclick={() => scrollOn(region)}
        size="xs"
        variant="outline"
      />
    </div>
  {/if}
{/snippet}

{#snippet artifactsBody()}
  {#if failed}
    <!-- mark-line: the mark stands over the words, centred above them -->
    <div class="files-failed" data-files-failed role="alert">
      <IconAlert aria-hidden="true" class="files-failed-mark" />
      <p class="files-failed-title">Couldn't read this session's artifacts</p>
      <p class="files-failed-line">
        Nothing is lost: the artifacts are kept on the hub, and the attachments {segmented
          ? "in Attachments"
          : "below"} come from the conversation itself.
      </p>
      <div class="files-failed-actions">
        <Button
          label="Try again"
          onclick={() => readArtifacts(instanceId)}
          pending={read?.reading}
          size="sm"
        />
        <Button
          aria-controls="{uid}-why"
          aria-expanded={details}
          label={details ? "Hide details" : "Show details"}
          onclick={() => {
            details = !details;
          }}
          size="sm"
          variant="ghost"
        />
      </div>
      {#if details}
        <pre class="files-failed-why" id="{uid}-why">{failed}</pre>
      {/if}
    </div>
  {:else if loading}
    <div
      aria-busy="true"
      aria-label="Reading artifacts"
      class="files-wait"
      role="status"
    >
      {#each [0.46, 0.34] as share (share)}
        <div class="files-ghost-row">
          <span class="lead" data-box><Skeleton class="ghost-glyph" /></span>
          <Skeleton class="ghost-name" style="inline-size: {share * 100}%" />
          <Skeleton class="ghost-age" />
        </div>
      {/each}
    </div>
  {:else if artifacts?.length === 0}
    <p class="files-none">Nothing made yet</p>
  {:else if asked && searchFault}
    <p class="files-none" role="alert">
      Couldn't search the artifacts: {searchFault}
    </p>
  {:else if asked && !searching && cards.length === 0}
    <p class="files-none" data-files-none>No artifacts match “{asked}”</p>
  {:else}
    <div class="files-body">
      <div
        class="files-scroll kit-edge-fade-block"
        aria-busy={searching || undefined}
        data-files-scroll
        id="{uid}-artifacts-scroll"
        {@attach measured("artifacts", "[data-files-card]", true)}
      >
        <ArtifactCards {cards} {chosen} {onpick} />
      </div>
      {@render moreSign("artifacts")}
    </div>
  {/if}
{/snippet}

{#snippet attachmentsBody()}
  {#if attachments.length === 0}
    <p class="files-none">Nothing attached yet</p>
  {:else if attachmentHits.length === 0}
    <p class="files-none" data-files-none>No attachments match “{asked}”</p>
  {:else}
    <div class="files-body">
      <div
        class="files-scroll kit-edge-fade-block"
        data-files-scroll
        id="{uid}-attachments-scroll"
        {@attach measured("attachments", "[data-files-row]", false)}
      >
        <ul
          class="files-list"
          {@attach highlight({ rows: "[data-files-row]" })}
        >
          {#each attachmentHits as file (file.id)}
            <li class="files-item attachment" data-files-row>
              {#if file.open.kind === "file"}
                {#if file.open.href}
                  <a
                    class="kit-item attachment-row"
                    download={file.name}
                    href={file.open.href}
                    title={file.name}
                  >
                    {@render attachmentFace(file)}
                  </a>
                {:else}
                  <!-- Its harness's copy names only the first characters of
                       its hash: the hub can't serve it, the transcript still
                       shows where it was sent. -->
                  <span class="kit-item attachment-row" title={file.name}>
                    {@render attachmentFace(file)}
                  </span>
                {/if}
              {:else}
                <button
                  class="kit-item attachment-row"
                  onclick={(event) => openAttachment(file, event.currentTarget)}
                  title={file.name}
                  type="button"
                >
                  {@render attachmentFace(file)}
                </button>
              {/if}
              <button
                aria-label="Show {file.name} in conversation"
                class="show touch-hit"
                data-files-show
                onclick={() => onshow(file)}
                title="Show in conversation"
                type="button"
              >
                <IconChevronRight aria-hidden="true" />
              </button>
            </li>
          {/each}
        </ul>
      </div>
      {@render moreSign("attachments")}
    </div>
  {/if}
{/snippet}

{#snippet attachmentFace(file: AttachmentRow)}
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
      >{file.kind} · {file.who}{#if file.at !== null}
        · <span class="num">{formatAgeShort(file.at)}</span>{/if}</span
    >
  </span>
{/snippet}

<style>
  /* The two regions share the panel's height. Each track starts at its
     floor (its head and a card, two rows, one, or its own words) and grows
     toward what it holds; the room left is shared out evenly between the
     tracks still growing (grid track sizing), so a short region keeps all
     of itself and a long one takes the rest, and two long ones split it. */
  .files-regions {
    --head-h: 32px;
    /* The second region's rule and the space either side of it. */
    --region-seam: calc(1px + 2 * var(--space-2));
    --artifacts-min: min-content;
    --attachments-min: min-content;
    flex: 1;
    min-block-size: 0;
    display: grid;
    grid-template-rows:
      minmax(var(--artifacts-min), auto)
      minmax(var(--attachments-min), auto);
    align-content: start;

    /* A card's height: a landscape thumbnail and its two lines. */
    &[data-artifacts-floor="cards"] {
      --artifacts-min: calc(var(--head-h) + 4 * var(--c-artifact-row-h));
    }
    &[data-attachments-floor="two"] {
      --attachments-min: calc(
        var(--head-h) + 2 * var(--c-artifact-row-h) + var(--region-seam)
      );
    }
    &[data-attachments-floor="one"] {
      --attachments-min: calc(
        var(--head-h) + var(--c-artifact-row-h) + var(--region-seam)
      );
    }
  }
  /* The phone's one list: the kit's segmented control under the search,
     the chosen list filling what is left of the drawer with its own scroll. */
  :global(.files-tabs) {
    flex: 1;
    min-block-size: 0;
  }
  :global(.files-segments) {
    margin-block-start: var(--space-1);
  }
  :global(.files-pane) {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    overflow: hidden;
  }
  .files-segment-count {
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .files-section {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    overflow: hidden;
  }
  /* The regions part on Caw's panel's vermillion hairline: 1px of
     `brand-solid`, whole (tokens: "Caw's panel's hairline between its
     sections is brand-solid whole"). */
  .files-section + .files-section {
    margin-block-start: var(--space-2);
    padding-block-start: var(--space-2);
    border-block-start: 1px solid var(--brand-solid);
  }
  .files-search {
    flex: none;
    margin-block-end: var(--space-1);

    /* Under a finger the words stand at 16px, so iOS doesn't zoom. */
    @media (pointer: coarse) {
      & :global(input) {
        font-size: 16px;
      }
    }
  }
  /* A region's scroll and the "N more" sign standing over its foot. */
  .files-body {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
  .files-scroll {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    scrollbar-color: var(--border-control) transparent;
  }
  /* The sign at the region's trailing foot, over its fade, clear of the
     scrollbar. */
  .files-more {
    position: absolute;
    inset-block-end: var(--space-1);
    inset-inline-end: var(--space-3);
    z-index: 1;
  }
  /* A section's head as Caw's panel heads its sections: its 16px Solar
     duotone glyph in the rows' lead column, its name in the label role and
     strong ink, its count in meta at the end, over its region's scroll. */
  .files-head {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: var(--head-h, 32px);
    margin: 0;
    padding-inline: calc(10px - (var(--c-row-lead) - var(--icon-md)) / 2) 10px;
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
    padding-inline: calc(
      (10px - (var(--c-row-lead) - var(--icon-md)) / 2) - var(--space-1)
    );
    padding-block-end: var(--space-6);
  }
  .files-list {
    position: relative;
    margin: 0;
    padding: 0 0 var(--space-6);
    list-style: none;
  }
  .files-item {
    position: relative;
    border-radius: var(--radius-sm);
  }
  /* Every row stands on one grid with the heads: its mark centred in one
     28px lead column, so every name starts on one text column; its Show in
     conversation at the row's end. */
  .attachment-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    inline-size: 100%;
    min-block-size: var(--c-artifact-row-h);
    padding-inline: calc(10px - (var(--c-row-lead) - var(--icon-md)) / 2)
      calc(var(--c-btn-h-xs) + var(--space-2));
    border: 0;
    background: none;
    color: var(--ink-strong);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
    user-select: none;
  }
  span.attachment-row {
    cursor: default;
  }
  .row-name {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: var(--type-label);
  }
  .lead {
    display: grid;
    place-items: center;
    flex: none;
    inline-size: var(--c-row-lead);
    block-size: var(--c-row-lead);
    overflow: clip;
    color: var(--ink-muted);

    & :global(svg) {
      inline-size: var(--icon-md);
      block-size: var(--icon-md);
    }
  }
  .thumb {
    inline-size: var(--c-row-lead);
    block-size: var(--c-row-lead);
    max-inline-size: none;
    border-radius: var(--radius-sm);
    background: var(--surface-well);
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
  .row-meta {
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink-muted);
    font: var(--type-meta);

    & .num {
      font-variant-numeric: tabular-nums;
    }
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
    overflow-wrap: anywhere;
  }
  .files-wait {
    display: grid;
  }
  /* A row as it will stand (The Claim Of Nothing Rule: the skeleton at the
     real layout's size). */
  .files-ghost-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-block-size: var(--c-artifact-row-h);
    padding-inline: calc(10px - (var(--c-row-lead) - var(--icon-md)) / 2) 10px;
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
  /* The list read failed: the error formula (what happened, what is safe,
     how to fix it), Try again first, the hub's own words a fold away. */
  .files-failed {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6) var(--space-3);
    text-align: center;
  }
  .files-failed :global(.files-failed-mark) {
    inline-size: var(--icon-lg);
    block-size: var(--icon-lg);
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
