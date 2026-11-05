<script lang="ts">
  /**
   * The artifact panel's title control (the artifact panel's surface brief,
   * The head): the shown artifact's title, the HIG's bar title (Headline:
   * plain text, the row role) with a menu chevron, opening the session's
   * artifacts, newest first, as a card hung from the title (BarGlass
   * `form="title"`, BarMenu), one shape with it, as Caw's card hangs from
   * his glass. Each is named by its title, the words its agent wrote, never
   * its slug, which is an id; each promoted one tagged with its commit and
   * each waiting on the person (core artifact-needs.ts) wearing the
   * needs-you dot, the status's own glyph ink (The Glyph, Word, Hue Rule);
   * choosing one shows it.
   * Its line (the ask, or "Sent to <session>") is the menu's first row, and
   * the control's tooltip and description; never a line under the title.
   * While the page says this title itself, in view (`titleAway`, the page's
   * `cawco:page-title`), the words go from the bar and the control is the
   * artifact's kind glyph and the chevron, so the title is never read twice
   * and the menu stands where it stood (HIG, Toolbars, Titles: "If titling a
   * toolbar seems redundant, you can leave the title area empty"); they come
   * back once the page's own has scrolled out of view.
   * The row on show is marked (the selection wash, and its words at full
   * ink). No row carries a Remove at rest: the menu's last item removes the
   * one on show, and Delete or Backspace on a highlighted row asks for that
   * one; either asks in the menu, under its last item (AskHere), since a
   * removal can't be undone. The row leaves once the hub says it is gone,
   * closing as the rows under it slide up (motion/rows), in every tab: the
   * panel's frame lists the session's artifacts (`held`), and the panel
   * follows that frame when the removed one was shown.
   *
   * A refusal is never a toast (DESIGN.md, The Work Outlives Its Surface
   * Rule): a list the hub would not read is said at the top of the open
   * menu, and a removal under its row, each with Try again; a show refused
   * after the menu closed goes to `onrefused`, which the pane says on its
   * own failure line.
   */
  import type { ArtifactKind } from "@cawco/core/artifact-kinds";
  import type { ArtifactSummary } from "@cawco/core/protocol";
  import { artifactWords } from "@cawco/core/words/artifacts";
  import { type Component, untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { MediaQuery, SvelteSet } from "svelte/reactivity";
  import { BarGlass, BarMenu } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconArtifactSheet,
    IconChevronDown,
    IconGlobe,
    IconTrash,
    IconWindow,
  } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import AskHere from "../AskHere.svelte";
  import { listArtifacts, removeArtifact, showArtifact } from "../artifact-api";
  import { Asker, type AskHereRequest } from "../ask-here.svelte";
  import { failureClause } from "../hub-read";
  import { reveal } from "../motion/curves.svelte";
  import { reflow } from "../motion/rows.svelte";
  import RowFault from "../RowFault.svelte";
  import { refusals } from "../refusals.svelte";

  let {
    instanceId,
    held,
    line,
    lineId,
    shown,
    titleAway = false,
    described = false,
    onrefused,
  }: {
    instanceId: string;
    /** What describes the title (the ask, or "Sent to <session>"); empty: the title alone. */
    line: string;
    /** The description's element (SideSurface's subtitle), which describes this control. */
    lineId: string;
    /**
     * The session's artifacts by id, as its panel's frame lists them: a row
     * whose id leaves it (removed in any tab, or by the agent) leaves the
     * open list at once, and a new id reads the list again.
     */
    held: string[] | undefined;
    /** The artifact the panel shows. */
    shown: { id: string; kind: ArtifactKind; title: string };
    /** The page says this title itself, in view: the bar draws its glyph, the words only for a screen reader. */
    titleAway?: boolean;
    /** The line stands under the title in the bar, a window's subtitle (macOS: a toolbar's title over its subtitle), each one line cut at its end. */
    described?: boolean;
    /** A chosen artifact the hub would not show: the words, and which it was. */
    onrefused: (
      reason: string,
      artifact: { id: string; title: string }
    ) => void;
  } = $props();

  const GLYPHS: Record<ArtifactKind, Component> = {
    page: IconArtifactPage,
    canvas: IconArtifactCanvas,
    preview: IconWindow,
    component: IconArtifactSheet,
    browser: IconGlobe,
  };

  /** Under the phone line the title takes two lines, centred as a box: its optical trim's padding would show a third. */
  const phone = new MediaQuery("(width < 640px)");
  const KindGlyph = $derived(GLYPHS[shown.kind]);
  let open = $state(false);
  let listed = $state<ArtifactSummary[] | null>(null);
  /** Until the list is read, the one the panel shows, with no age or promote to say. */
  const rows = $derived<
    (Pick<ArtifactSummary, "id" | "kind" | "title"> & {
      createdAt: string | null;
      promoted: ArtifactSummary["promoted"];
      waiting: boolean;
    })[]
  >(
    listed?.filter((row) => held?.includes(row.id) ?? true) ?? [
      { ...shown, createdAt: null, promoted: null, waiting: false },
    ]
  );

  /** An id the frame lists that the list read has not: the list is read again. */
  const unread = $derived(
    listed !== null &&
      (held?.some((id) => !listed?.some((row) => row.id === id)) ?? false)
  );

  /** Where the list's refusal is said: the menu's top, kept through a reload. */
  const listKey = $derived(`artifact-list:${instanceId}`);
  function readList(): Promise<void> {
    const key = listKey;
    return listArtifacts(instanceId).then(
      (artifacts) => {
        listed = artifacts;
        refusals.delete(key);
      },
      (error: unknown) => {
        refusals.set(key, {
          reason: `This session's artifacts were not read: ${failureClause(error)}. The one shown stays listed.`,
        });
      }
    );
  }

  // Read on every open, and again when the frame names one it hasn't.
  $effect(() => {
    if (open) {
      readList();
    }
  });
  $effect(() => {
    if (open && unread) {
      readList();
    }
  });

  function choose(artifact: { id: string; title: string }): Promise<void> {
    if (artifact.id === shown.id) {
      return Promise.resolve();
    }
    return showArtifact(instanceId, artifact.id).then(
      () => undefined,
      (error: unknown) =>
        onrefused(
          `${artifact.title} was not shown: ${failureClause(error)}. ${shown.title} stays in the panel.`,
          artifact
        )
    );
  }

  /** Rows whose removal the hub has not answered yet. */
  const removing = new SvelteSet<string>();
  /** Where a row's refused removal is said: under it, kept through a reload. */
  const removeKey = (id: string) => `artifact-remove:${instanceId}:${id}`;

  function remove(artifact: { id: string; title: string }): Promise<void> {
    if (removing.has(artifact.id)) {
      return Promise.resolve();
    }
    removing.add(artifact.id);
    refusals.delete(removeKey(artifact.id));
    return removeArtifact(instanceId, artifact.id).then(
      () => {
        removing.delete(artifact.id);
        listed = listed?.filter((row) => row.id !== artifact.id) ?? null;
      },
      (error: unknown) => {
        removing.delete(artifact.id);
        refusals.set(removeKey(artifact.id), {
          reason: `${artifactWords.notRemoved(artifact.title, failureClause(error))}. It stays in the list.`,
        });
      }
    );
  }

  /** The menu's one question: a removal, asked under its last item. */
  const asks = new Asker<AskHereRequest>();
  function askRemove(artifact: { id: string; title: string }) {
    asks.ask({
      at: "remove",
      title:
        artifact.id === shown.id
          ? artifactWords.removeShownAsk
          : artifactWords.removeArtifactAsk(artifact.title),
      body: artifactWords.removeArtifactBody,
      confirmLabel: artifactWords.remove,
      destructive: true,
      pendingLabel: artifactWords.removingArtifact,
      run: () => remove(artifact),
    });
  }
  // The menu shut: a question asked in it goes with it.
  $effect(() => {
    if (!open) {
      untrack(() => asks.dismiss());
    }
  });

  /** Each row's name is its name and tags, never its Remove's words. */
  const uid = $props.id();
  const part = (id: string, what: "name" | "promoted" | "waiting" | "age") =>
    `${uid}-${what}-${id}`;

  /**
   * A row that leaves while it holds focus (removed here, in another tab, or
   * by the agent) hands it to the row that took its place, else the one above
   * it, else the menu, so the keys keep working where the reader was.
   */
  let list = $state<HTMLElement | null>(null);
  /** The rows as last drawn, to find a leaving row's neighbours. */
  let drawn: string[] = [];
  /**
   * The row that holds focus, kept from its own focus events: the row's
   * element is gone, and focus with it, before the list's effects run.
   */
  let focusedRow: string | undefined;
  const keepFocus: Attachment<HTMLElement> = (node) => {
    const into = (event: FocusEvent) => {
      focusedRow = (event.target as Element).closest<HTMLElement>(
        "[data-artifact]"
      )?.dataset.artifact;
    };
    // Focus the reader moved out of the menu is no longer the menu's to keep.
    const out = (event: FocusEvent) => {
      if (
        event.relatedTarget instanceof Node &&
        !node.contains(event.relatedTarget)
      ) {
        focusedRow = undefined;
      }
    };
    node.addEventListener("focusin", into);
    node.addEventListener("focusout", out);
    return () => {
      node.removeEventListener("focusin", into);
      node.removeEventListener("focusout", out);
    };
  };
  $effect(() => {
    const ids = rows.map((row) => row.id);
    const before = drawn;
    drawn = ids;
    const left = focusedRow;
    if (
      left === undefined ||
      ids.includes(left) ||
      list?.contains(document.activeElement)
    ) {
      return;
    }
    const at = before.indexOf(left);
    const heir =
      before.slice(at + 1).find((id) => ids.includes(id)) ??
      before
        .slice(0, at)
        .reverse()
        .find((id) => ids.includes(id));
    const next =
      heir === undefined
        ? null
        : list?.querySelector<HTMLElement>(
            `[data-artifact-row][data-artifact="${CSS.escape(heir)}"]`
          );
    (next ?? list)?.focus();
  });
</script>

<!-- The title: plain text with its menu chevron, no glass at rest; open,
     its card hangs from it and the join is its ground. -->
<BarGlass flare="end" form="title">
  <DropdownMenu.Root bind:open>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          data-artifact-trigger
          aria-describedby={line ? lineId : undefined}
          class="select-none touch-hit press-tint mark-line max-w-full gap-space-1 ps-space-2 pe-space-1 max-phone:h-auto max-phone:min-h-c-bar-item max-phone:rounded-lg data-described:h-auto data-described:min-h-c-bar-item data-described:rounded-lg data-described:py-space-1"
          data-artifact={shown.id}
          data-described={(described && !!line) || undefined}
          data-bar-item
          data-box
          title={line || undefined}
          type="button"
        >
          {#if described && line}
            <!-- The title over its line, a window's subtitle: one line each,
                 cut at its end, the chevron beside the title. -->
            <span
              class="flex min-w-0 flex-col items-start text-start"
              data-slot="name-lead"
              in:reveal
            >
              <span
                class="max-w-full overflow-clip text-ellipsis whitespace-nowrap text-ink-strong type-label"
                data-slot="name-words">{shown.title}</span
              >
              <span
                class="max-w-full overflow-clip text-ellipsis whitespace-nowrap text-ink-muted type-meta"
                data-slot="name-line">{line}</span
              >
            </span>
          {:else if titleAway}
            <KindGlyph aria-hidden="true" data-slot="bar-symbol" />
            <span class="sr-only" data-slot="name-words">{shown.title}</span>
          {:else}
            <!-- On a phone two lines, clamped in the bar's row, so a title of
                 ordinary length reads whole at 390 (the artifact panel's
                 surface brief, The title), its chevron inline after its last
                 word (a wrapped box is as wide as its room, so a chevron after
                 the box stood far from the words); one line, cut at its end,
                 and the chevron after it on a desk. -->
            <span
              class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-start text-ink-strong type-row max-phone:line-clamp-2 max-phone:whitespace-normal max-phone:text-pretty mark-line"
              data-box={phone.current || undefined}
              data-slot="name-lead"
              in:reveal
              ><span data-slot="name-words">{shown.title}</span
              >{#if phone.current}&nbsp;<IconChevronDown
                  aria-hidden="true"
                  class="inline size-icon-sm align-middle text-ink-muted"
                />{/if}</span
            >
          {/if}
          {#if titleAway || !phone.current || (described && line)}
            <IconChevronDown
              aria-hidden="true"
              class="size-icon-sm flex-none text-ink-muted"
            />
          {/if}
        </button>
      {/snippet}
    </DropdownMenu.Trigger>
    <BarMenu
      data-artifact-list
      label={artifactWords.artifacts}
      width="titles"
      bind:ref={list}
    >
      {#if line}
        <DropdownMenu.Label data-slot="menu-line" kind="line"
          >{line}</DropdownMenu.Label
        >
      {/if}
      <RowFault
        again={readList}
        data-artifact-list-refused
        indent="calc(var(--spacing) * 2.5)"
        end="calc(var(--spacing) * 2.5)"
        reason={refusals.reason(listKey)}
      />
      <div {@attach reflow()} {@attach keepFocus}>
        {#each rows as artifact (artifact.id)}
          {@const Glyph = GLYPHS[artifact.kind]}
          <DropdownMenu.Item
            data-artifact-row
            aria-busy={removing.has(artifact.id) || undefined}
            aria-current={artifact.id === shown.id || undefined}
            aria-keyshortcuts="Delete Backspace"
            aria-labelledby={[
              part(artifact.id, "name"),
              artifact.promoted ? part(artifact.id, "promoted") : "",
              artifact.waiting ? part(artifact.id, "waiting") : "",
              artifact.createdAt ? part(artifact.id, "age") : "",
            ]
              .filter(Boolean)
              .join(" ")}
            class="group/artifact"
            data-artifact={artifact.id}
            data-flip
            marks="current-busy"
            row="artifact"
            onkeydown={(event: KeyboardEvent) => {
              if (event.key === "Delete" || event.key === "Backspace") {
                event.preventDefault();
                askRemove(artifact);
              }
            }}
            onSelect={() => choose(artifact)}
          >
            <Glyph />
            <!-- The name and its promoted tag: the name whole while it fits
               in two lines (an agent's title runs to 80 characters), the tag
               giving way first. -->
            <span class="flex min-w-0 flex-auto gap-inherit" data-box>
              <span
                data-slot="row-name"
                class="max-w-full flex-none line-clamp-2 text-pretty type-label"
                id={part(artifact.id, "name")}>{artifact.title}</span
              >
              {#if artifact.promoted}
                <span
                  data-slot="row-promoted"
                  class="min-w-0 flex-initial overflow-clip text-ellipsis whitespace-nowrap text-ink-muted text-size-meta num"
                  id={part(artifact.id, "promoted")}
                  title={artifactWords.promotedTitle}
                  >{artifactWords.promoted(
                    artifact.promoted.commit.slice(0, 7)
                  )}</span
                >
              {/if}
            </span>
            {#if artifact.waiting}
              <!-- The needs-you dot (DESIGN.md, Status dot), its words for the
                 screen reader. -->
              <span
                data-slot="row-waiting"
                aria-label={artifactWords.waitingOnYou}
                class="size-(--status-dot-size) flex-none rounded-pill bg-status-attn-glyph"
                data-box
                id={part(artifact.id, "waiting")}
                role="img"
              ></span>
            {/if}
            {#if artifact.createdAt}
              <span
                data-slot="row-age"
                class="text-ink-muted text-size-meta num"
                id={part(artifact.id, "age")}
                >{formatAgeShort(Date.parse(artifact.createdAt))}</span
              >
            {/if}
          </DropdownMenu.Item>
          <RowFault
            again={() => remove(artifact)}
            data-artifact-remove-refused={artifact.id}
            data-flip
            indent="calc(var(--spacing) * 2.5)"
            end="calc(var(--spacing) * 2.5)"
            reason={refusals.reason(removeKey(artifact.id))}
          />
        {/each}
      </div>
      <DropdownMenu.Separator />
      <!-- Remove, for the one on show: the menu's last item, asked under it. -->
      <DropdownMenu.Item
        closeOnSelect={false}
        data-artifact-remove
        disabled={removing.has(shown.id)}
        onSelect={() => askRemove(shown)}
        variant="destructive"
      >
        <IconTrash />
        <span>{artifactWords.removeShown}</span>
      </DropdownMenu.Item>
      <AskHere
        asker={asks}
        at="remove"
        end="calc(var(--spacing) * 2.5)"
        indent="calc(var(--spacing) * 2.5)"
      />
    </BarMenu>
  </DropdownMenu.Root>
</BarGlass>
