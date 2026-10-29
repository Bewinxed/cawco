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
   * The artifacts are a masonry of their thumbnails (ArtifactCards), or one
   * row each in the attachments' shape, as the person picks in the
   * Artifacts head (owner: "i want to be able to toggle this to list or
   * thumbnails"): the house rail (motion/Rail), Thumbnails | List by their
   * icons, at the head's trailing edge, kept in this browser
   * (files.svelte.ts `artifactsView`), so the bar's card, the drawer and the
   * float all open on it. On the drawer, whose segments are the heads, it
   * stands over the artifacts at the same trailing edge. An
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
  import type { ArtifactSummary } from "@cawco/core/protocol";
  import { accountsWords } from "@cawco/core/words/accounts";
  import { filesWords } from "@cawco/core/words/files";
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { Button } from "#lib/components/ui/button/index.js";
  import EmptyState from "#lib/components/ui/empty/empty-state.svelte";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import Skeleton from "#lib/components/ui/skeleton/skeleton.svelte";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import {
    IconChevronDown,
    IconChevronRight,
    IconDocument,
    IconFiles,
    IconLayers,
    IconListRows,
    IconPaperclip,
    IconThumbnails,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { searchArtifacts } from "../artifact-api";
  import { cawco } from "../client.svelte";
  import FindField from "../find/FindField.svelte";
  import { excerptParts } from "../find/find-rows";
  import { frameObserver } from "../frame-observer";
  import { failureWords } from "../hub-read";
  import { lightbox } from "../lightbox/lightbox-state.svelte";
  import { crossIn, dur, reveal, revealOut } from "../motion/curves.svelte";
  import Rail from "../motion/Rail.svelte";
  import RowFault from "../RowFault.svelte";
  import ArtifactCards from "./ArtifactCards.svelte";
  import {
    type ArtifactCard,
    type ArtifactsView,
    type AttachmentRow,
    artifactsOf,
    artifactsView,
    attachmentsOf,
    readArtifacts,
    readAttachments,
    searchAttachments,
  } from "./files.svelte";
  import { drawMissingPages } from "./page-thumbs";

  let {
    instanceId,
    segmented = false,
    onpick,
    onshow,
    onask,
    onattach,
    pickRefused = null,
  }: {
    /** The session whose files these are. */
    instanceId: string;
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
    /**
     * An artifact chosen here that the hub would not show: said over the
     * artifacts, in its words, with Try again, never a toast (DESIGN.md,
     * The Work Outlives Its Surface Rule).
     */
    pickRefused?: { reason: string; again: () => unknown } | null;
  } = $props();

  /**
   * The Empty Starts Work Rule, a session's own case: "Ask" takes its
   * object by name (DESIGN.md, Voice), the session's own agent by its harness, as
   * a sentence names it (core `accountsWords.harnesses`: Claude Code,
   * OpenCode, pi).
   */
  const askLabel = $derived.by(() => {
    const harness = cawco.session(instanceId)?.harness;
    const agent = harness ? accountsWords.harnesses[harness] : "the agent";
    return `Ask ${agent} for a page`;
  });

  /** The artifact on show in the session's panel: its card wears the selection pill. */
  const chosen = $derived.by(() => {
    const preview = cawco.previews[instanceId];
    return preview?.state === "open" ? preview.artifact.id : null;
  });

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
  // The pages no pane has a picture of yet are drawn unseen, one at a time
  // (page-thumbs); their cards take the pictures as the list is read again.
  $effect(() => {
    const read = artifacts;
    const id = instanceId;
    if (read) {
      untrack(() => drawMissingPages(id, read));
    }
  });
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
   * reveal (motion/curves `reveal`, `revealOut`). Started again for each
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
  /** Thumbnails, or one row each: the person's pick, the same in every Files. */
  const view = $derived(artifactsView.shown);
  const VIEWS: { id: ArtifactsView; label: string }[] = [
    { id: "thumbnails", label: filesWords.thumbnails },
    { id: "list", label: filesWords.list },
  ];
  /** The masonry's floor is its head and a card; the list's, its rows' as the attachments' are. */
  const artifactsFloor = $derived.by(() => {
    if (view === "list") {
      return floor(artifactsGhost ? 2 : cards.length);
    }
    return cards.length > 0 || artifactsGhost ? "cards" : "own";
  });
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
          // Where it stands once a slide in flight lands (reflow's
          // `translate`): the sign counts the list as it will rest.
          const [, y = "0"] = getComputedStyle(item).translate.split(" ");
          const sliding = Number.parseFloat(y) || 0;
          if (item.getBoundingClientRect().bottom - sliding > foot + 1) {
            past += 1;
          }
        }
        writeMore(region, past);
      };
      // Measured now, so the first frame painted has its sign; a resize or
      // a list that changed in the next frame's callbacks (frameObserver):
      // the sign coming or going resizes the region and Files' card above
      // it, which a delivery, and the mutations a write inside one makes,
      // had already passed.
      measure();
      const seen = frameObserver(measure);
      seen.observe(scroller);
      for (const child of scroller.children) {
        seen.observe(child);
      }
      let frame = 0;
      const added = new MutationObserver(() => {
        if (frame === 0) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            measure();
          });
        }
      });
      added.observe(scroller, { childList: true, subtree: true });
      scroller.addEventListener("scroll", measure, { passive: true });
      return () => {
        cancelAnimationFrame(frame);
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

<!-- The calcs every row and head reads. A row's inset from the lead column's
     centre: its glyph's box, the lead's margin inside it; and the room a row
     keeps at its end for Show in conversation (the kit's xs button and the
     gap). Files' column: the search, then the regions or the segmented list,
     filling what its card or its drawer gives it. -->
<div
  class="relative flex min-h-0 flex-1 flex-col"
  style:--lead-pad={"calc(var(--c-row-inset) - (var(--c-row-lead) - var(--icon-md)) / 2)"}
  style:--row-end="calc(var(--c-btn-h-xs) + var(--space-2))"
>
  {#if nothing}
    <!-- What the skeleton stood in for, in its reveal (reveal). -->
    <div data-files-empty class="flex min-h-0 flex-1 flex-col" in:reveal>
      <EmptyState
        class="flex-1"
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
    <div class="flex min-h-0 flex-1 flex-col" out:revealOut>
      <!-- The finder's own field (FindField), as Jump's. -->
      <div class="mb-space-1 flex-none" data-files-search>
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
           each segment its noun and its count, equal widths. The phone's one
           list: the chosen list fills what is left of the drawer with its own
           scroll. -->
        <Tabs.Root bind:value={list} class="flex-1" layout="column">
          <Tabs.List aria-label="Artifacts or attachments" class="mt-space-1">
            <Tabs.Trigger data-files-segment="artifacts" value="artifacts">
              <span>Artifacts</span>
              {#if artifactsCount}
                <span class="num text-ink-muted" data-files-head-count
                  >{artifactsCount}</span
                >
              {/if}
            </Tabs.Trigger>
            <Tabs.Trigger data-files-segment="attachments" value="attachments">
              <span>Attachments</span>
              {#if attachmentsCount}
                <span class="num text-ink-muted" data-files-head-count
                  >{attachmentsCount}</span
                >
              {/if}
            </Tabs.Trigger>
          </Tabs.List>
          <!-- A region's only overflow is its scroller (The 44 Touch Rule:
               nothing around it clips its scrollbar or its rows' touch
               areas). -->
          <Tabs.Content
            data-files-region="artifacts"
            layout="column"
            value="artifacts"
          >
            {#if artifacts && artifacts.length > 0}
              <!-- The segment is the region's head: its switch stands over
                   the list at the same trailing edge. -->
              <div
                class="flex min-h-c-section-head-h flex-none items-center justify-end pe-c-row-inset"
                data-files-head
              >
                {@render viewSwitch()}
              </div>
            {/if}
            {@render artifactsBody()}
          </Tabs.Content>
          <Tabs.Content
            data-files-region="attachments"
            layout="column"
            value="attachments"
          >
            {@render attachmentsBody()}
          </Tabs.Content>
        </Tabs.Root>
      {:else}
        <!-- The two regions share the panel's height. Each track starts at
             its floor (its head and a card, two rows, one, or its own words)
             and grows toward what it holds; the room left is shared out
             evenly between the tracks still growing (grid track sizing), so a
             short region keeps all of itself and a long one takes the rest,
             and two long ones split it. On a short window (a landscape
             phone's, a desk at 200% zoom) the floors are each region's head
             alone, so both heads stay in sight and the rows scroll under
             them. A card's height: a landscape thumbnail and its two lines. -->
        <div
          class="grid min-h-0 flex-1 grid-rows-(--region-rows) content-box-start short-window:artifacts-floor-cards:artifacts-min-(--c-section-head-h) short-window:artifacts-floor-one:artifacts-min-(--c-section-head-h) short-window:artifacts-floor-two:artifacts-min-(--c-section-head-h) short-window:attachments-floor-one:attachments-min-(--seam-head-floor) short-window:attachments-floor-two:attachments-min-(--seam-head-floor) tall-window:artifacts-floor-cards:artifacts-min-(--cards-floor) tall-window:artifacts-floor-one:artifacts-min-(--row-floor) tall-window:artifacts-floor-two:artifacts-min-(--rows-floor) tall-window:attachments-floor-one:attachments-min-(--one-floor) tall-window:attachments-floor-two:attachments-min-(--two-floor)"
          data-artifacts-floor={artifactsFloor}
          data-attachments-floor={attachmentsFloor}
          style:--region-rows={"minmax(var(--artifacts-min, min-content), auto) minmax(var(--attachments-min, min-content), auto)"}
          style:--region-seam="calc(1px + 2 * var(--space-2))"
          style:--seam-head-floor={"calc(var(--c-section-head-h) + var(--region-seam))"}
          style:--cards-floor={"calc(var(--c-section-head-h) + 4 * var(--c-artifact-row-h))"}
          style:--rows-floor={"calc(var(--c-section-head-h) + 2 * var(--c-artifact-row-h))"}
          style:--row-floor={"calc(var(--c-section-head-h) + var(--c-artifact-row-h))"}
          style:--two-floor={"calc(var(--c-section-head-h) + 2 * var(--c-artifact-row-h) + var(--region-seam))"}
          style:--one-floor={"calc(var(--c-section-head-h) + var(--c-artifact-row-h) + var(--region-seam))"}
        >
          <section
            aria-labelledby="{uid}-artifacts"
            class="flex min-h-0 flex-col"
            data-files-region="artifacts"
          >
            <!-- A section's head as Caw's panel heads its sections: its 16px
                 Solar duotone glyph in the rows' lead column, its name in the
                 label role and strong ink, its count in meta at the end, over
                 its region's scroll; the artifacts' Thumbnails | List after
                 the count, outside the heading, so the heading's name is its
                 own words. -->
            <div
              class="flex min-h-c-section-head-h flex-none items-center gap-c-row-inset ps-(--lead-pad) pe-c-row-inset"
              data-files-head
            >
              <h3
                class="type-label mark-line flex min-w-0 flex-auto items-center gap-c-row-inset text-ink-strong"
                id="{uid}-artifacts"
              >
                <span
                  class="grid w-c-row-lead flex-none place-items-center text-ink-muted"
                  data-box
                  ><IconLayers aria-hidden="true" class="size-icon-md" /></span
                >
                <span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                  >Artifacts</span
                >
                {#if artifactsCount}
                  <span
                    class="num type-meta ms-auto flex-none whitespace-nowrap text-ink-muted"
                    data-files-head-count>{artifactsCount}</span
                  >
                {/if}
              </h3>
              {@render viewSwitch()}
            </div>
            {@render artifactsBody()}
          </section>
          <!-- The regions part on Caw's panel's vermillion hairline: 1px of
               `brand-solid`, whole (tokens: "Caw's panel's hairline between
               its sections is brand-solid whole"). -->
          <section
            aria-labelledby="{uid}-attachments"
            class="mt-space-2 flex min-h-0 flex-col border-t border-brand-solid pt-space-2"
            data-files-region="attachments"
            data-files-rule
          >
            <h3
              class="type-label mark-line flex min-h-c-section-head-h flex-none items-center gap-c-row-inset ps-(--lead-pad) pe-c-row-inset text-ink-strong"
              data-files-head
              id="{uid}-attachments"
            >
              <span
                class="grid w-c-row-lead flex-none place-items-center text-ink-muted"
                data-box
                ><IconPaperclip aria-hidden="true" class="size-icon-md" /></span
              >
              <span
                class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                >Attachments</span
              >
              {#if attachmentsCount}
                <span
                  class="num type-meta ms-auto flex-none whitespace-nowrap text-ink-muted"
                  data-files-head-count>{attachmentsCount}</span
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

<!-- Thumbnails | List: the house rail (motion/Rail, the new-session
     dialog's harness switch) across, each way its icon, its name the
     travelling label and the radio's accessible name. Earned: shown once
     the session has an artifact to show either way. -->
{#snippet viewSwitch()}
  {#if artifacts && artifacts.length > 0}
    <Rail
      axis="x"
      class="flex flex-none gap-space-row rounded-md bg-surface-recess-deep p-space-row"
      itemClass="touch-hit press-tint grid size-c-btn-h-xs place-items-center"
      items={VIEWS}
      label={filesWords.artifactsView}
      onpick={(id) => artifactsView.set(id as ArtifactsView)}
      value={view}
    >
      {#snippet item(way)}
        {#if way.id === "list"}
          <IconListRows aria-hidden="true" class="size-icon-md" />
        {:else}
          <IconThumbnails aria-hidden="true" class="size-icon-md" />
        {/if}
      {/snippet}
    </Rail>
  {/if}
{/snippet}

<!-- The sign at the region's trailing foot, over its fade, clear of the
     scrollbar. -->
{#snippet moreSign(region: string)}
  {#if (more[region] ?? 0) > 0}
    <div class="absolute end-space-3 bottom-space-1 z-1">
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
  <RowFault
    again={pickRefused?.again}
    data-files-pick-refused
    reason={pickRefused?.reason}
  />
  {#if artifactsFailed}
    <RowFault
      again={() => readArtifacts(instanceId)}
      data-files-failed
      details={artifactsFailed}
      reason={filesWords.cantReadArtifacts}
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
         the skeleton handing its place to the read in its reveal (reveal,
         revealOut), and one read to the next in a cross-fade (crossIn). It
         holds its skeleton, its read, and the "N more" sign over its foot;
         `relative` pins the view leaving (revealOut). -->
    <div class="relative flex min-h-0 flex-auto flex-col">
      {#if artifacts === null}
        {#if artifactsGhost}
          <div
            aria-busy="true"
            aria-label="Reading artifacts"
            class="min-h-0 flex-auto -me-space-2 overflow-hidden pe-space-2"
            data-files-wait="artifacts"
            role="status"
            out:revealOut
          >
            <ArtifactCards
              cards={[]}
              ghosts={view === "list" ? 2 : GHOST_CARDS}
              {onpick}
              {view}
            />
          </div>
        {/if}
      {:else if artifacts.length === 0}
        <!-- A region with nothing made offers to ask for it, on the same
             line, wrapping under the words when the line is short. -->
        <div
          class="type-meta flex min-h-c-section-head-h flex-wrap items-center justify-between gap-x-space-2 gap-y-space-1 px-c-row-inset wrap-anywhere text-ink-muted"
          in:reveal
        >
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
        <p
          class="type-meta flex min-h-c-section-head-h items-center px-c-row-inset wrap-anywhere text-ink-muted"
          data-files-none
          in:crossIn
        >
          {filesWords.noArtifactsMatch(shownHits.q)}
        </p>
      {:else}
        <!-- Each region's own scroll, with the house fade at its foot while
             more is below, at its full length on every width as Caw's panel
             has it. It pads its end into an equal negative margin (The 44
             Touch Rule), by Files' card's own inset (`--space-2`, FilesFace),
             so a row's Show in conversation keeps its touch area in the
             scroller's own box, the cards and rows still end on their head's
             trailing edge, and the scroller (and its scrollbar) ends on the
             card's edge, never past it. -->
        <div
          aria-busy={searching || undefined}
          class="kit-edge-fade-block fade-len-c-edge-fade-len min-h-0 flex-auto -me-space-2 overflow-y-auto overscroll-contain pe-space-2 scrollbar-thin scrollbar-thumb-border-control scrollbar-track-transparent"
          data-files-scroll
          id="{uid}-artifacts-scroll"
          in:reveal
          {@attach measured("artifacts", "[data-files-card]")}
        >
          <ArtifactCards {cards} {chosen} {onpick} {view} />
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
      reason={filesWords.cantReadAttachments}
    />
  {:else}
    <div class="relative flex min-h-0 flex-auto flex-col">
      {#if attachments === null}
        {#if attachmentsGhost}
          <div
            aria-busy="true"
            aria-label="Reading attachments"
            class="min-h-0 flex-auto -me-space-2 overflow-hidden pe-space-2"
            data-files-wait="attachments"
            role="status"
            out:revealOut
          >
            <!-- A row as it will stand (The Claim Of Nothing Rule: the
                 skeleton at the real layout's size). -->
            {#each [0.46, 0.34] as share (share)}
              <div
                class="flex min-h-c-artifact-row-h items-center gap-c-row-inset ps-(--lead-pad) pe-c-row-inset"
              >
                <span
                  class="grid w-c-row-lead flex-none place-items-center text-ink-muted"
                  data-box><Skeleton cell="glyph" radius="text" /></span
                >
                <Skeleton
                  class="w-(--name-w)"
                  height="x-height"
                  radius="line"
                  style="--name-w: {share * 100}%"
                  type="label"
                />
                <Skeleton
                  class="ms-auto"
                  height="x-height"
                  radius="line"
                  type="meta"
                  width="age"
                />
              </div>
            {/each}
          </div>
        {/if}
      {:else if attachments.length === 0}
        <!-- The Empty Starts Work Rule's by-hand way: a person sends
             attachments, so the composer's own Attach is offered. -->
        <div
          class="type-meta flex min-h-c-section-head-h flex-wrap items-center justify-between gap-x-space-2 gap-y-space-1 px-c-row-inset wrap-anywhere text-ink-muted"
          in:reveal
        >
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
        <p
          class="type-meta flex min-h-c-section-head-h items-center px-c-row-inset wrap-anywhere text-ink-muted"
          data-files-none
          in:crossIn
        >
          {filesWords.noAttachmentsMatch(asked)}
        </p>
      {:else}
        <div
          class="kit-edge-fade-block fade-len-c-edge-fade-len min-h-0 flex-auto -me-space-2 overflow-y-auto overscroll-contain pe-space-2 scrollbar-thin scrollbar-thumb-border-control scrollbar-track-transparent"
          data-files-scroll
          id="{uid}-attachments-scroll"
          in:reveal
          {@attach measured("attachments", "[data-files-row]")}
          {@attach highlight({ rows: "[data-files-row]" })}
        >
          <ul class="relative pb-space-6">
            {#each attachmentHits as file (file.id)}
              <!-- Every row stands on one grid with the heads: its mark
                   centred in one 28px lead column, so every name starts on
                   one text column; its Show in conversation at the row's
                   end. -->
              <li
                class="group/row relative grid grid-cols-1 rounded-sm *:col-start-1 *:row-start-1"
                data-files-row
              >
                {#if file.open.kind === "file"}
                  {#if file.open.href}
                    <a
                      class={menuItemVariants({
                        class:
                          "relative flex min-h-c-artifact-row-h w-full items-center gap-c-row-inset border-none border-current bg-transparent ps-(--lead-pad) pe-(--row-end) text-start text-ink-strong no-underline select-none focus-inset",
                      })}
                      data-menu-item
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
                    <span
                      class={menuItemVariants({
                        class:
                          "relative flex min-h-c-artifact-row-h w-full cursor-default items-center gap-c-row-inset border-none border-current bg-transparent ps-(--lead-pad) pe-(--row-end) text-start text-ink-strong no-underline select-none focus-inset",
                      })}
                      data-menu-item
                      title={file.name}
                    >
                      {@render attachmentFace(file)}
                    </span>
                  {/if}
                {:else}
                  <button
                    class={menuItemVariants({
                      class:
                        "relative flex min-h-c-artifact-row-h w-full items-center gap-c-row-inset border-none border-current bg-transparent ps-(--lead-pad) pe-(--row-end) text-start text-ink-strong no-underline select-none focus-inset",
                    })}
                    data-menu-item
                    onclick={(event) =>
                      openAttachment(file, event.currentTarget)}
                    title={file.name}
                    type="button"
                  >
                    {@render attachmentFace(file)}
                  </button>
                {/if}
                <!-- Show in conversation: the kit's ghost icon button at the
                     row's end, shown on the row's hover and focus, and always
                     under a finger. -->
                <Button
                  aria-label="Show {file.name} in conversation"
                  class="relative me-space-1 self-center justify-self-end"
                  data-files-show
                  icon={IconChevronRight}
                  onclick={() => onshow(file)}
                  reveal="row-reach"
                  size="icon-xs"
                  title="Show in conversation"
                  tone="muted"
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
  <span
    class="grid size-c-row-lead flex-none place-items-center overflow-clip text-ink-muted"
    data-box
  >
    {#if file.picture}
      <img
        alt=""
        class="size-c-row-lead max-w-none rounded-sm bg-surface-well object-cover -outline-offset-1 outline-1 outline-image-outline"
        decoding="async"
        loading="lazy"
        src={file.picture}
      />
    {:else}
      <IconDocument aria-hidden="true" class="size-icon-md" />
    {/if}
  </span>
  <span class="flex min-w-0 flex-auto flex-col">
    <span class="type-label min-w-0 truncate">{file.name}</span>
    <span class="type-meta truncate text-ink-muted"
      >{file.kind} · {file.who}{#if file.at !== null}
        · <span class="num">{formatAgeShort(file.at)}</span>{/if}</span
    >
  </span>
{/snippet}
