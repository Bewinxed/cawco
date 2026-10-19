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
   * Both lists are the hub's (files.svelte.ts): until one answers it claims
   * nothing (no count, no "nothing" line); past `--dur-wait-grace` its
   * skeleton stands at the real layout's size, and the read arrives over one
   * `--dur-fade` cross-fade. A read refused says so in its region's place
   * (RowFault), with Try again and the hub's own words.
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
    IconChevronDown,
    IconChevronRight,
    IconDocument,
    IconFiles,
    IconLayers,
    IconPaperclip,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { searchArtifacts } from "../artifact-api";
  import { cawco } from "../client.svelte";
  import FindField from "../find/FindField.svelte";
  import { excerptParts } from "../find/find-rows";
  import { failureWords } from "../hub-read";
  import { lightbox } from "../lightbox/lightbox-state.svelte";
  import { crossIn, crossOut, dur } from "../motion/curves.svelte";
  import RowFault from "../RowFault.svelte";
  import { speakerName } from "../transcript/speaker";
  import ArtifactCards from "./ArtifactCards.svelte";
  import {
    type ArtifactCard,
    type AttachmentRow,
    artifactsOf,
    attachmentsOf,
    readArtifacts,
    readAttachments,
    searchAttachments,
  } from "./files.svelte";

  let {
    instanceId,
    chosen = null,
    segmented = false,
    onpick,
    onshow,
    onask,
    onattach,
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
    /** The empty state's one action pressed: the ask is in the composer. */
    onask: () => void;
    /** Attach a file pressed: the composer's own attach picker opens. */
    onattach: () => void;
  } = $props();

  /**
   * The Empty Starts Work Rule, a session's own case: "Ask" takes its
   * object by name (WORDS.md), the session's agent by its harness.
   */
  const askLabel = $derived(
    `Ask ${speakerName(cawco.session(instanceId)?.harness)} for a page`
  );

  const uid = $props.id();
  let words = $state("");
  /** The list the segmented control shows. */
  let list = $state("artifacts");

  // Read again each time Files opens: what the session made and was sent
  // since, and the pictures the pane kept.
  $effect(() => {
    const id = instanceId;
    untrack(() => {
      readArtifacts(id);
      readAttachments(id);
    });
  });
  const artifactsRead = $derived(artifactsOf(instanceId));
  const attachmentsRead = $derived(attachmentsOf(instanceId));
  const artifacts = $derived(artifactsRead?.list ?? null);
  const attachments = $derived(attachmentsRead?.list ?? null);
  const artifactsFailed = $derived(
    artifacts === null ? (artifactsRead?.failed ?? null) : null
  );
  const attachmentsFailed = $derived(
    attachments === null ? (attachmentsRead?.failed ?? null) : null
  );
  const nothing = $derived(
    artifacts?.length === 0 && attachments?.length === 0
  );

  /**
   * The Claim Of Nothing Rule: inside `--dur-wait-grace` a list still read
   * shows nothing of its own; past it, its skeleton stands, and what the
   * read brings (the list, or its "nothing" line) takes its place in one
   * cross-fade (motion/curves `crossIn`, `crossOut`). Started again for each
   * session Files shows.
   */
  let waited = $state(false);
  $effect(() => {
    if (!instanceId) {
      return;
    }
    waited = false;
    const timer = setTimeout(() => {
      waited = true;
    }, dur("--dur-wait-grace"));
    return () => clearTimeout(timer);
  });
  const artifactsGhost = $derived(
    waited && artifacts === null && !artifactsFailed
  );
  const attachmentsGhost = $derived(
    waited && attachments === null && !attachmentsFailed
  );
  /** How many skeleton cards stand for the masonry. */
  const GHOST_CARDS = 6;

  const asked = $derived(words.trim());

  /* ── The search ─────────────────────────────────────────────────── */
  /** The hub's hits for the words asked, in its order; null while none have come back. */
  let hits = $state<{
    q: string;
    ids: string[];
    within: Map<string, string>;
  } | null>(null);
  let searchFault = $state<string | null>(null);
  /** Try again on a refused search: the ask goes again, at once. */
  let searchTry = $state(0);
  /** The Try again last asked for, read as plain: only a new one skips the settle. */
  let triedAt = 0;
  /** Try again's own promise: settled once the hub answers the words again. */
  let retried: (() => void) | null = null;
  const searchAgain = () =>
    new Promise<void>((settled) => {
      retried = settled;
      searchTry += 1;
    });
  /** As the words settle, the hub is asked; a later ask supersedes. */
  const SETTLE_MS = 120;
  $effect(() => {
    const q = asked;
    const id = instanceId;
    const again = searchTry !== triedAt;
    triedAt = searchTry;
    if (!q) {
      hits = null;
      searchFault = null;
      return;
    }
    const stop = new AbortController();
    const done = () => {
      retried?.();
      retried = null;
    };
    const timer = setTimeout(
      () => {
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
            done();
          },
          (error: unknown) => {
            if (!stop.signal.aborted) {
              searchFault = failureWords(error);
              done();
            }
          }
        );
      },
      again ? 0 : SETTLE_MS
    );
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  });
  /**
   * What the cards show while a search stands: before the hub's first
   * answer to it, every artifact; after, its last answer and its "N of M",
   * standing until the next answer replaces them, so a keystroke never
   * flashes the whole grid back.
   */
  const shownHits = $derived(asked ? hits : null);
  /** The hub has not answered the words as they stand yet. */
  const searching = $derived(!!asked && hits?.q !== asked && !searchFault);
  const cards = $derived.by<ArtifactCard[]>(() => {
    if (!artifacts) {
      return [];
    }
    if (!shownHits) {
      return artifacts.map((artifact) => ({ artifact, within: null }));
    }
    const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    return shownHits.ids.flatMap((id) => {
      const artifact = byId.get(id);
      const excerpt = shownHits.within.get(id);
      return artifact
        ? [{ artifact, within: excerpt ? excerptParts(excerpt) : null }]
        : [];
    });
  });
  const attachmentHits = $derived(
    attachments ? searchAttachments(attachments, words) : []
  );
  /** A count: the whole, or once a search is answered, how many of the whole match. */
  const countOf = (shown: number, all: number, searched: boolean) =>
    searched ? `${shown} of ${all}` : `${all}`;
  /** The Earned Count Rule: a head counts only above 0. */
  const artifactsCount = $derived(
    artifacts && artifacts.length > 0
      ? countOf(cards.length, artifacts.length, !!shownHits)
      : null
  );
  const attachmentsCount = $derived(
    attachments && attachments.length > 0
      ? countOf(attachmentHits.length, attachments.length, !!asked)
      : null
  );
  /** A region's floor: its head and two rows, one, or its own words. */
  const floor = (rows: number) => {
    if (rows >= 2) {
      return "two";
    }
    return rows === 1 ? "one" : "own";
  };
  const artifactsFloor = $derived(
    cards.length > 0 || artifactsGhost ? "cards" : "own"
  );
  const attachmentsFloor = $derived(
    floor(attachmentsGhost ? 2 : attachmentHits.length)
  );

  /* ── Each region's own scroll ───────────────────────────────────── */
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
  /** A region's scroll, measured as it scrolls and resizes: how many of its items stand past its foot (the "N more" sign). */
  const measured =
    (region: string, items: string): Attachment<HTMLElement> =>
    (scroller) => {
      const measure = () => {
        const foot = scroller.getBoundingClientRect().bottom;
        let past = 0;
        for (const item of scroller.querySelectorAll(items)) {
          if (item.getBoundingClientRect().bottom > foot + 1) {
            past += 1;
          }
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

<div class="files">
  {#if nothing}
    <!-- What the skeleton stood in for, in one cross-fade (crossIn). -->
    <div class="files-empty-place" in:crossIn>
      <EmptyState
        class="files-empty"
        data-files-empty
        icon={IconFiles}
        line="Pages, canvases, previews and the files you and the agent share collect here."
        title="Nothing here yet"
      >
        {#snippet action()}
          <Button
            data-files-ask
            label={askLabel}
            onclick={onask}
            size="sm"
            variant="outline"
          />
        {/snippet}
      </EmptyState>
    </div>
  {:else}
    <div class="files-main" out:crossOut>
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
          <Tabs.List
            aria-label="Artifacts or attachments"
            class="files-segments"
          >
            <Tabs.Trigger data-files-segment="artifacts" value="artifacts">
              <span>Artifacts</span>
              {#if artifactsCount}
                <span class="files-segment-count num" data-files-head-count
                  >{artifactsCount}</span
                >
              {/if}
            </Tabs.Trigger>
            <Tabs.Trigger data-files-segment="attachments" value="attachments">
              <span>Attachments</span>
              {#if attachmentsCount}
                <span class="files-segment-count num" data-files-head-count
                  >{attachmentsCount}</span
                >
              {/if}
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
              {#if artifactsCount}
                <span class="files-head-count num" data-files-head-count
                  >{artifactsCount}</span
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
              {#if attachmentsCount}
                <span class="files-head-count num" data-files-head-count
                  >{attachmentsCount}</span
                >
              {/if}
            </h3>
            {@render attachmentsBody()}
          </section>
        </div>
      {/if}
    </div>
  {/if}
</div>

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
  {#if artifactsFailed}
    <RowFault
      again={() => readArtifacts(instanceId)}
      data-files-failed
      details={artifactsFailed}
      reason="Couldn't read this session's artifacts"
    />
  {:else if asked && searchFault}
    <RowFault
      again={searchAgain}
      data-files-search-failed
      details={searchFault}
      reason="Couldn't search this session's artifacts"
    />
  {:else}
    <!-- The region's one place: its skeleton, then what the read brought,
         one handing its place to the next (crossIn, crossOut). -->
    <div class="files-body">
      {#if artifacts === null}
        {#if artifactsGhost}
          <div
            aria-busy="true"
            aria-label="Reading artifacts"
            class="files-scroll files-wait"
            data-files-wait="artifacts"
            role="status"
            out:crossOut
          >
            <ArtifactCards cards={[]} ghosts={GHOST_CARDS} {onpick} />
          </div>
        {/if}
      {:else if artifacts.length === 0}
        <div class="files-none files-none-ask" in:crossIn>
          <span>Nothing made yet</span>
          <Button
            data-files-ask
            label={askLabel}
            onclick={onask}
            size="xs"
            variant="ghost"
          />
        </div>
      {:else if shownHits && cards.length === 0}
        <p class="files-none" data-files-none in:crossIn>
          No artifacts match “{shownHits.q}”
        </p>
      {:else}
        <div
          aria-busy={searching || undefined}
          class="files-scroll kit-edge-fade-block"
          data-files-scroll
          id="{uid}-artifacts-scroll"
          in:crossIn
          {@attach measured("artifacts", "[data-files-card]")}
        >
          <ArtifactCards {cards} {chosen} {onpick} />
        </div>
        {@render moreSign("artifacts")}
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet attachmentsBody()}
  {#if attachmentsFailed}
    <RowFault
      again={() => readAttachments(instanceId)}
      data-files-failed
      details={attachmentsFailed}
      reason="Couldn't read this session's attachments"
    />
  {:else}
    <div class="files-body">
      {#if attachments === null}
        {#if attachmentsGhost}
          <div
            aria-busy="true"
            aria-label="Reading attachments"
            class="files-scroll files-wait"
            data-files-wait="attachments"
            role="status"
            out:crossOut
          >
            {#each [0.46, 0.34] as share (share)}
              <div class="files-ghost-row">
                <span class="lead" data-box
                  ><Skeleton class="ghost-glyph" /></span
                >
                <Skeleton
                  class="ghost-name"
                  style="inline-size: {share * 100}%"
                />
                <Skeleton class="ghost-age" />
              </div>
            {/each}
          </div>
        {/if}
      {:else if attachments.length === 0}
        <!-- The Empty Starts Work Rule's by-hand way: a person sends
             attachments, so the composer's own Attach is offered. -->
        <div class="files-none files-none-ask" in:crossIn>
          <span>Nothing attached yet</span>
          <Button
            data-files-attach
            label="Attach a file"
            onclick={onattach}
            size="xs"
            variant="ghost"
          />
        </div>
      {:else if attachmentHits.length === 0}
        <p class="files-none" data-files-none in:crossIn>
          No attachments match “{asked}”
        </p>
      {:else}
        <div
          class="files-scroll kit-edge-fade-block"
          data-files-scroll
          id="{uid}-attachments-scroll"
          in:crossIn
          {@attach measured("attachments", "[data-files-row]")}
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
                    <!-- Its harness's copy names only the first characters
                         of its hash: the hub can't serve it, so it is a
                         plain row, and Show in conversation still finds
                         where it was sent. -->
                    <span class="kit-item attachment-row" title={file.name}>
                      {@render attachmentFace(file)}
                    </span>
                  {/if}
                {:else}
                  <button
                    class="kit-item attachment-row"
                    onclick={(event) =>
                      openAttachment(file, event.currentTarget)}
                    title={file.name}
                    type="button"
                  >
                    {@render attachmentFace(file)}
                  </button>
                {/if}
                <Button
                  aria-label="Show {file.name} in conversation"
                  class="files-show"
                  data-files-show
                  icon={IconChevronRight}
                  onclick={() => onshow(file)}
                  size="icon-xs"
                  title="Show in conversation"
                  variant="ghost"
                />
              </li>
            {/each}
          </ul>
        </div>
        {@render moreSign("attachments")}
      {/if}
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
  /* Files' column: the search, then the regions or the segmented list,
     filling what its card or its drawer gives it. */
  .files {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
  }
  /* The whole, or the empty state in its place: each fills the column. */
  .files-main,
  .files-empty-place {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
  }
  /* The two regions share the panel's height. Each track starts at its
     floor (its head and a card, two rows, one, or its own words) and grows
     toward what it holds; the room left is shared out evenly between the
     tracks still growing (grid track sizing), so a short region keeps all
     of itself and a long one takes the rest, and two long ones split it.
     On a short window (a landscape phone's, a desk at 200% zoom) the floors
     are each region's head alone, so both heads stay in sight and the rows
     scroll under them. */
  .files-regions {
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

    @media (height < 560px) {
      &[data-artifacts-floor="cards"] {
        --artifacts-min: var(--c-section-head-h);
      }
      &:is([data-attachments-floor="two"], [data-attachments-floor="one"]) {
        --attachments-min: calc(var(--c-section-head-h) + var(--region-seam));
      }
    }
    @media (height >= 560px) {
      /* A card's height: a landscape thumbnail and its two lines. */
      &[data-artifacts-floor="cards"] {
        --artifacts-min: calc(
          var(--c-section-head-h) + 4 * var(--c-artifact-row-h)
        );
      }
      &[data-attachments-floor="two"] {
        --attachments-min: calc(
          var(--c-section-head-h) + 2 * var(--c-artifact-row-h) +
            var(--region-seam)
        );
      }
      &[data-attachments-floor="one"] {
        --attachments-min: calc(
          var(--c-section-head-h) + var(--c-artifact-row-h) + var(--region-seam)
        );
      }
    }
  }
  /* The phone's one list: the kit's segmented control under the search,
     the chosen list filling what is left of the drawer with its own scroll. */
  .files :global(.files-tabs) {
    flex: 1;
    min-block-size: 0;
  }
  .files :global(.files-segments) {
    margin-block-start: var(--space-1);
  }
  /* A region's only overflow is its scroller (The 44 Touch Rule: nothing
     around it clips its scrollbar or its rows' touch areas). */
  .files :global(.files-pane) {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
  }
  .files-segment-count {
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  .files-section {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
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
  /* A region's one place: its skeleton, its read, and the "N more" sign
     over its foot. `position: relative` pins the view leaving (crossOut). */
  .files-body {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
  /* Each region's own scroll, with the house fade at its foot while more is
     below, at its full length on every width as Caw's panel has it. Padded
     at its end, inside the region, so a row's Show in conversation keeps
     its touch area in the scroller's own box, and its scrollbar stands in
     the region. */
  .files-scroll {
    --fade-len: 40px;
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-inline-end: var(--space-3);
    scrollbar-width: thin;
    scrollbar-color: var(--border-control) transparent;
  }
  .files-wait {
    overflow: hidden;
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
    gap: var(--c-row-inset);
    min-block-size: var(--c-section-head-h);
    margin: 0;
    padding-inline: calc(
        var(--c-row-inset) - (var(--c-row-lead) - var(--icon-md)) / 2
      )
      var(--c-row-inset);
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
      (var(--c-row-inset) - (var(--c-row-lead) - var(--icon-md)) / 2) -
        var(--space-1)
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
    gap: var(--c-row-inset);
    inline-size: 100%;
    min-block-size: var(--c-artifact-row-h);
    padding-inline: calc(
        var(--c-row-inset) - (var(--c-row-lead) - var(--icon-md)) / 2
      )
      calc(var(--c-btn-h-xs) + var(--space-2));
    border: 0;
    background: none;
    color: var(--ink-strong);
    text-align: start;
    text-decoration: none;
    cursor: pointer;
    user-select: none;

    /* Inside its scroller the ring stands within its own edge. */
    &:focus-visible {
      outline-offset: var(--focus-ring-inset);
    }
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
  /* Show in conversation: the kit's ghost icon button at the row's end,
     shown on the row's hover and focus, and always under a finger. */
  .files :global(.files-show) {
    position: absolute;
    inset-block-start: 50%;
    inset-inline-end: var(--space-1);
    translate: 0 -50%;
    color: var(--ink-muted);
    opacity: 0;
    transition: opacity var(--dur-control) var(--ease-out);
  }
  .files :global(.attachment:is(:hover, :focus-within) .files-show) {
    opacity: 1;
  }
  @media (pointer: coarse) {
    .files :global(.files-show) {
      opacity: 1;
    }
  }
  .files-none {
    display: flex;
    align-items: center;
    min-block-size: var(--c-section-head-h);
    margin: 0;
    padding-inline: var(--c-row-inset);
    color: var(--ink-muted);
    font: var(--type-meta);
    overflow-wrap: anywhere;
  }
  /* A region with nothing made offers to ask for it, on the same line,
     wrapping under the words when the line is short. */
  .files-none-ask {
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-1) var(--space-2);
  }
  /* A row as it will stand (The Claim Of Nothing Rule: the skeleton at the
     real layout's size). */
  .files-ghost-row {
    display: flex;
    align-items: center;
    gap: var(--c-row-inset);
    min-block-size: var(--c-artifact-row-h);
    padding-inline: calc(
        var(--c-row-inset) - (var(--c-row-lead) - var(--icon-md)) / 2
      )
      var(--c-row-inset);
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
  .files :global(.files-empty) {
    flex: 1;
  }
</style>
