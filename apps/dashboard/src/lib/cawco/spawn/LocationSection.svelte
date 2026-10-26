<script lang="ts" module>
  /** Where a session works, as the Location form edits it. */
  export interface LocationFields {
    dir: string;
    informational?: boolean;
    locked: boolean;
    machineId: string;
    machineName: string;
    mode: "dir" | "repo";
    ondir: (dir: string) => void;
    onmode: (mode: "dir" | "repo") => void;
    onoverride: () => void;
    onrepo: (repo: string) => void;
    /** Validation line under the field; empty when nothing to say. */
    reading: string;
    repo: string;
  }
</script>

<script lang="ts">
  /**
   * Location (§1.5, §2.8): Existing files | Clone a repository, by its git
   * URL on any host. The directory
   * browser lists the selected machine's real filesystem through `machineFs`.
   * No branch API exists, so the design's branch panel is not rendered.
   */
  import type { FsEntry } from "@cawco/core";
  import { spawnWords } from "@cawco/core";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { CURVE, dur } from "#lib/cawco/motion/curves.svelte.js";
  import { folds } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import {
    IconFolder as Folder,
    IconFolderGit as FolderGit,
    IconFolderOpen as FolderOpen,
    IconArrowLeft as Left,
    IconRefresh as Refresh,
    IconArrowRight as Right,
    IconSearch as Search,
    IconChevronUp as Up,
  } from "#lib/icons.js";
  import { didntAnswer, machineFs } from "../client.svelte";
  import { TRY_AGAIN } from "../unanswered";
  import Segmented from "./Segmented.svelte";

  let {
    mode,
    onmode,
    dir,
    ondir,
    locked,
    onoverride,
    repo,
    onrepo,
    machineId,
    machineName,
    reading,
    informational = false,
    embedded = false,
    oncommit,
  }: LocationFields & {
    /** Inside the composer's location popover: no header, no reading line —
        the dialog shows the reading under the composer, where it stays in view. */
    embedded?: boolean;
    /**
     * The location is set: Enter in the directory or repository field, or
     * "Use this folder". A popover holding the form closes on it, and the
     * next keys go back where the reader was typing.
     */
    oncommit?: () => void;
  } = $props();
  function commitOnEnter(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      oncommit?.();
    }
  }
  let browsing = $state(false);
  let path = $state("~");
  let folders = $state<FsEntry[]>([]);
  let listing = $state(false);
  let listError = $state("");
  let request = 0;
  const trailing = /\/+$/u;
  const rootPrefix = /^~\/?|^\//u;
  const crumbs = $derived.by(() => {
    const root = path.startsWith("/") ? "/" : "~";
    const rest = path.replace(rootPrefix, "").split("/").filter(Boolean);
    return [
      { label: root, to: root },
      ...rest.map((label, i) => ({
        label,
        to: `${root === "/" ? "" : root}/${rest.slice(0, i + 1).join("/")}`,
      })),
    ];
  });
  const canGoUp = $derived(crumbs.length > 1);
  async function list(next: string) {
    request += 1;
    const id = request;
    listing = true;
    listError = "";
    try {
      const read = await machineFs<FsEntry[]>(machineId, "list", next);
      if (id !== request) {
        return;
      }
      let rows: FsEntry[];
      switch (read.kind) {
        case "answered":
          rows = read.value;
          break;
        case "unanswered":
          // The listing on screen stands; this says why it did not move.
          listError = didntAnswer(machineId, read, {
            missed: spawnWords.location.listingMissed,
            again: TRY_AGAIN,
          });
          return;
        default: {
          const unhandled: never = read;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
      path = next;
      folders = rows
        .filter((row) => row.kind === "dir")
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (cause) {
      if (id !== request) {
        return;
      }
      listError = failureWords(cause);
    } finally {
      if (id === request) {
        listing = false;
      }
    }
  }
  function toggleBrowse() {
    browsing = !browsing;
    if (browsing) {
      const start = dir.trim().replace(trailing, "");
      list(start.startsWith("/") || start.startsWith("~") ? start : "~");
    }
  }
  function enter(name: string) {
    list(`${path === "/" ? "" : path.replace(trailing, "")}/${name}`);
  }
  function goUp() {
    const up = crumbs.at(-2);
    if (up) {
      list(up.to);
    }
  }
  function useFolder() {
    ondir(path);
    browsing = false;
    oncommit?.();
  }
  $effect(() => {
    if (mode === "repo") {
      browsing = false;
    }
  });

  /** The browser and the clone field open under their controls. */
  /** Read when a fold plays, in the browser: the duration is a root token. */
  const PANEL = {
    get ms() {
      return dur("--dur-panel");
    },
    easing: CURVE.inOut,
  };
</script>

<section
  class="grid gap-space-2 data-embedded:p-space-1"
  data-embedded={embedded || undefined}
>
  {#if embedded}
    {@render source()}
  {:else}
    <SectionHeader
      hue="var(--hue-amber-500)"
      icon={Folder}
      label={spawnWords.location.name}
      wrap
    >
      {#snippet right()}
        {@render source()}
      {/snippet}
    </SectionHeader>
  {/if}
  {#snippet source()}
    <Segmented
      class={embedded ? "justify-self-box-start" : ""}
      items={[
        { value: "dir", label: spawnWords.location.existingFiles },
        { value: "repo", label: spawnWords.location.cloneRepo },
      ]}
      label={spawnWords.location.source}
      onchange={onmode}
      value={mode}
    >
      {#snippet icon(value, on)}
        {#if value === "dir"}
          <Folder class="text-hue-amber-500" />
        {:else}
          <FolderGit style={`opacity:${on ? 1 : 0.6}`} />
        {/if}
      {/snippet}
    </Segmented>
  {/snippet}

  <!-- It clips its corners and is no scroller (the browser's foot sticks
       past it to the popover's), so as the section's grid item it takes no
       width of its own content's: `min-w-0`, or the folder rows widened the
       popover past a phone's edge. -->
  <div
    data-slot="location-section-field"
    class="field-edge min-w-0 overflow-clip rounded-md border border-border-control bg-surface-raised shadow-xs transition-control data-locked:bg-surface-recess"
    data-locked={locked || undefined}
  >
    <div
      data-slot="row"
      class="flex h-c-row-h items-center gap-space-2 ps-space-3 pe-space-2"
    >
      <FolderOpen
        data-location-section-lead
        class="size-icon-md flex-none text-hue-amber-500"
      />
      <input
        aria-invalid={reading && !informational ? true : undefined}
        aria-label={spawnWords.location.directory}
        autocapitalize="off"
        class="min-h-c-btn-h-sm max-phone:min-h-c-row-h min-w-0 flex-1 border-none border-current bg-transparent p-0 font-(family-name:--font-mono) text-size-label leading-label font-normal text-ink-strong placeholder:text-ink-muted"
        id="session-dir"
        oninput={(event) => ondir(event.currentTarget.value)}
        onkeydown={commitOnEnter}
        placeholder={spawnWords.location.directoryPlaceholder}
        readonly={locked}
        spellcheck="false"
        value={dir}
      />
      {#if locked}
        <span
          class="ns-in mark-line inline-flex h-c-pill-h items-center gap-space-1 rounded-sm bg-status-live-bg px-space-2 font-body text-size-label leading-none font-medium whitespace-nowrap text-status-live-ink"
          ><span>{spawnWords.location.fromProject}</span></span
        >
        <span class="ns-in flex flex-none" style="--delay:40ms">
          <Button onclick={onoverride} size="sm" tone="quiet" variant="ghost">
            {spawnWords.location.override}
          </Button>
        </span>
      {:else}
        <span class="ns-in flex flex-none">
          <Button
            aria-expanded={browsing}
            disabled={!machineId}
            id="session-browse"
            onclick={toggleBrowse}
            size="sm"
            variant="secondary"
          >
            {#if browsing}
              <Up class="size-icon-md flex-none text-ink-muted" /><span
                >{spawnWords.location.close}</span
              >
            {:else}
              <Search class="size-icon-md flex-none text-ink-muted" />
              <span>{spawnWords.location.browse}</span>
            {/if}
          </Button>
        </span>
      {/if}
    </div>
    <div inert={!browsing} {@attach folds(() => browsing, PANEL)}>
      <div class="min-h-0">
        <div class="border-t border-t-border-hairline bg-surface-recess">
          <!-- The machine and the crumb on one line at every width. The folder
               you are in stands whole at the crumb's end (its name ending in
               an ellipsis only past the whole row); the folders above it
               scroll sideways in the room left, opening at their end, the
               one above yours: a right-to-left scroller starts at its right,
               round a left-to-right run of crumbs. -->
          <div
            class="flex items-center gap-space-2 border-b border-b-border-hairline bg-surface-recess p-space-2 ps-space-3"
          >
            <span
              data-slot="machine"
              class="mark-line inline-flex h-c-pill-h flex-none items-center gap-space-2 rounded-sm bg-surface-lift px-space-2 font-body text-size-label leading-none font-medium whitespace-nowrap text-ink-strong"
              ><span
                data-slot="dot"
                class="size-space-2 rounded-pill bg-hue-green-500"
                data-box
              ></span><span>{machineName}</span></span
            >
            <div
              data-slot="crumbs"
              class="flex min-w-0 flex-1 items-center gap-space-row whitespace-nowrap font-(family-name:--font-mono) text-size-label leading-label font-normal text-ink-muted"
            >
              {#if crumbs.length > 1}
                <div
                  data-slot="above"
                  class="fai-scroll dir-rtl min-w-0 overflow-x-auto overscroll-x-contain"
                >
                  <div
                    class="inline-flex items-center gap-space-row align-middle"
                    dir="ltr"
                  >
                    {#each crumbs.slice(0, -1) as crumb (crumb.to)}
                      <button
                        data-slot="crumb"
                        class="select-none press-tint transition-control min-h-c-row-h min-w-c-row-h flex-none rounded-xs border-none border-current bg-transparent px-space-2 text-inherit hover:bg-surface-hover"
                        onclick={() => list(crumb.to)}
                        type="button"
                      >
                        {crumb.label}
                      </button>
                      <span aria-hidden="true" class="text-neutral-8">/</span>
                    {/each}
                  </div>
                </div>
              {/if}
              <button
                data-slot="crumb"
                aria-current="location"
                class="select-none press-tint transition-control min-h-c-row-h min-w-c-row-h max-w-full shrink-0 rounded-xs border-none border-current bg-surface-lift px-space-2 text-start font-medium text-ink-strong"
                onclick={() => list(path)}
                type="button"
              >
                <span class="block truncate">{crumbs.at(-1)?.label}</span>
              </button>
            </div>
          </div>
          <div
            class="fai-scroll grid max-h-c-folder-list-max-h content-box-start gap-space-row overflow-auto overscroll-contain p-space-2"
          >
            {#if canGoUp}
              <button
                class="select-none press-tint transition-control flex h-c-btn-h max-phone:h-c-row-h min-w-0 items-center justify-start gap-space-3 rounded-sm border-none border-current bg-transparent px-space-2 text-start font-(family-name:--font-mono) text-size-label leading-none font-normal text-ink-muted hover:bg-surface-hover"
                onclick={goUp}
                type="button"
              >
                <Left class="size-icon-md flex-none" /><span
                  >{spawnWords.location.parentFolder}</span
                >
              </button>
            {/if}
            {#if listing}
              <div
                data-slot="location-section-empty"
                class="type-meta px-space-2 py-space-7 text-center wrap-anywhere text-ink-subtle"
                role="status"
              >
                {spawnWords.location.loadingFolders}
              </div>
            {:else if listError}
              <div
                data-slot="location-section-empty"
                class="type-meta px-space-2 py-space-7 text-center wrap-anywhere text-status-fail-ink"
                role="alert"
              >
                {listError}
              </div>
            {:else}
              {#each folders as folder (`${path}/${folder.name}`)}
                <button
                  class="select-none press-tint transition-control flex h-c-btn-h max-phone:h-c-row-h min-w-0 items-center justify-start gap-space-3 rounded-sm border-none border-current bg-transparent px-space-2 text-start font-(family-name:--font-mono) text-size-label leading-none font-normal text-ink-strong hover:bg-surface-hover"
                  onclick={() => enter(folder.name)}
                  title={folder.name}
                  type="button"
                >
                  <Folder
                    class="size-icon-md flex-none"
                    style={`color:${folder.name.startsWith(".") ? "var(--neutral-8)" : "var(--hue-amber-500)"}`}
                  />
                  <span data-slot="name" class="min-w-0 flex-1 truncate"
                    >{folder.name}</span
                  >
                  <Right class="size-icon-md text-neutral-8" />
                </button>
              {/each}
              {#if !folders.length}
                <div
                  data-slot="location-section-empty"
                  class="type-meta px-space-2 py-space-7 text-center wrap-anywhere text-ink-subtle"
                  role="status"
                >
                  {spawnWords.location.noSubfolders}
                </div>
              {/if}
            {/if}
          </div>
          <!-- The foot stands whole on the popover's floor while what is
               above it scrolls (the popover is held to the room it has, a
               phone's above all): it sticks to the surface's foot, the one
               scroller round it (the field clips, it does not scroll). -->
          <div
            data-slot="browse-foot"
            class="sticky bottom-0 flex max-phone:flex-wrap items-center justify-between gap-space-2 border-t border-t-border-hairline bg-surface-lift p-space-2"
          >
            <span
              data-slot="path"
              class="max-phone:basis-full min-w-0 truncate font-(family-name:--font-mono) text-size-meta leading-label font-normal text-ink-muted"
              title={path}>{path}</span
            >
            <Button
              class="flex-none max-phone:w-full"
              onclick={useFolder}
              size="sm"
            >
              {spawnWords.location.useFolder}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div {@attach folds(() => mode === "repo", PANEL)}>
    <div class="min-h-0">
      <div
        data-slot="repo"
        class="grid gap-space-2 transition-[opacity] duration-(--dur-panel) ease-out motion-safe:transition-panel-travel"
        style:transform={`translateY(${mode === "repo" ? "0px" : "calc(-1 * var(--pop-rise))"})`}
        style:opacity={mode === "repo" ? 1 : 0}
        style:pointer-events={mode === "repo" ? "auto" : "none"}
      >
        <div
          data-slot="location-section-field"
          class="field-edge overflow-hidden rounded-md border border-border-control bg-surface-raised shadow-xs transition-control"
        >
          <div
            data-slot="row"
            class="flex h-c-row-h items-center gap-space-2 px-space-3"
          >
            <FolderGit class="size-icon-md flex-none text-hue-amber-500" />
            <input
              aria-label={spawnWords.location.repository}
              autocapitalize="off"
              class="min-h-c-btn-h-sm max-phone:min-h-c-row-h min-w-0 flex-1 border-none border-current bg-transparent p-0 font-(family-name:--font-mono) text-size-label leading-label font-normal text-ink-strong placeholder:text-ink-muted"
              id="session-repo"
              oninput={(event) => onrepo(event.currentTarget.value)}
              onkeydown={commitOnEnter}
              placeholder={spawnWords.location.repoPlaceholder}
              spellcheck="false"
              tabindex={mode === "repo" ? 0 : -1}
              value={repo}
            />
          </div>
        </div>
        <div
          data-slot="note"
          class="flex items-start gap-space-2 rounded-md border border-border-hairline bg-surface-recess p-space-3"
        >
          <Refresh class="size-icon-md flex-none text-hue-blue-500" />
          <span class="type-meta min-w-0 text-pretty text-ink-muted"
            >{spawnWords.location.clonedInto}
            <span
              class="min-w-0 type-meta font-(family-name:--font-mono) text-pretty text-ink-strong"
              >{dir.trim() || "~"}</span
            >{spawnWords.location.clonedWhere}</span
          >
        </div>
      </div>
    </div>
  </div>
  {#if !embedded}
    <p
      data-slot="reading"
      aria-live="polite"
      class="type-meta m-0 min-h-lh truncate text-status-fail-ink data-informational:text-ink-muted"
      data-informational={informational || undefined}
      title={reading}
    >
      {reading || " "}
    </p>
  {/if}
</section>
