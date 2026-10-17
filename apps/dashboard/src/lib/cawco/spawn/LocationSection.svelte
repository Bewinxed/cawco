<script lang="ts">
  /**
   * Location (§1.5, §2.8): Existing files | Clone from GitHub. The directory
   * browser lists the selected machine's real filesystem through `machineFs`.
   * No branch API exists, so the design's branch panel is not rendered.
   */
  import type { FsEntry } from "@cawco/core";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { CURVE, dur } from "#lib/cawco/motion/curves.svelte.js";
  import { folds } from "#lib/cawco/motion/fold.svelte.js";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import Up from "~icons/solar/alt-arrow-up-linear";
  import Left from "~icons/solar/arrow-left-linear";
  import Right from "~icons/solar/arrow-right-linear";
  import Folder from "~icons/solar/folder-bold-duotone";
  import FolderOpen from "~icons/solar/folder-open-bold-duotone";
  import Search from "~icons/solar/magnifer-bold-duotone";
  import Refresh from "~icons/solar/refresh-bold-duotone";
  import { didntAnswer, machineFs } from "../client.svelte";
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
  }: {
    mode: "dir" | "repo";
    onmode: (mode: "dir" | "repo") => void;
    dir: string;
    ondir: (dir: string) => void;
    locked: boolean;
    onoverride: () => void;
    repo: string;
    onrepo: (repo: string) => void;
    machineId: string;
    machineName: string;
    /** Validation line under the field; empty when nothing to say. */
    reading: string;
    informational?: boolean;
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
  const trailing = /\/+$/;
  const rootPrefix = /^~\/?|^\//;
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
          listError = didntAnswer(machineId, read);
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

<!-- literal: 8px gap -->
<section
  class="grid gap-(--gap) data-embedded:p-space-1"
  data-embedded={embedded || undefined}
  style:--gap="8px"
>
  {#if embedded}
    {@render source()}
  {:else}
    <SectionHeader
      hue="var(--hue-amber-500)"
      icon={Folder}
      label="Location"
      wrap
    >
      {#snippet right()}
        {@render source()}
      {/snippet}
    </SectionHeader>
  {/if}
  {#snippet source()}
    <Segmented
      class={embedded ? "justify-self-start" : ""}
      items={[
        { value: "dir", label: "Existing files" },
        { value: "repo", label: "Clone from GitHub" },
      ]}
      label="Location source"
      onchange={onmode}
      value={mode}
    >
      {#snippet icon(value, on)}
        {#if value === "dir"}
          <Folder class="text-hue-amber-500" />
        {:else}
          <ProviderLogo
            fade="set"
            provider="github"
            size={null}
            style={`--o:${on ? 1 : 0.6}`}
          />
        {/if}
      {/snippet}
    </Segmented>
  {/snippet}

  <div
    data-slot="location-section-field"
    class="field-shell overflow-hidden rounded-md border border-border-control bg-surface-raised shadow-xs transition-control data-locked:bg-surface-recess"
    data-locked={locked || undefined}
  >
    <!-- literal: 8px gap, 42px / 56px height, 0 6px 0 12px padding -->
    <div
      data-slot="row"
      class="flex h-(--h) max-phone:h-(--h-phone) items-center gap-(--gap) pr-(--pr) pl-(--pl)"
      style:--gap="8px"
      style:--h="42px"
      style:--h-phone="56px"
      style:--pl="12px"
      style:--pr="6px"
    >
      <FolderOpen
        data-location-section-lead
        class="size-icon-md flex-none text-hue-amber-500"
      />
      <!-- literal: 30px / 44px minimum height, 1.4 line height, 1rem on a phone -->
      <input
        aria-invalid={reading && !informational ? true : undefined}
        aria-label="Directory"
        autocapitalize="off"
        class="min-h-(--min-h) max-phone:min-h-(--min-h-phone) max-phone:text-(length:--fs-phone) min-w-0 flex-1 border-none border-current bg-transparent p-0 font-(family-name:--font-mono) text-size-label leading-(--lh) font-normal text-ink-strong outline-none"
        id="session-dir"
        oninput={(event) => ondir(event.currentTarget.value)}
        onkeydown={commitOnEnter}
        placeholder="~/code/project"
        readonly={locked}
        spellcheck="false"
        style:--fs-phone="1rem"
        style:--lh="1.4"
        style:--min-h="30px"
        style:--min-h-phone="44px"
        value={dir}
      />
      {#if locked}
        <!-- literal: 4px gap, 24px height, 8px inline padding -->
        <span
          class="ns-in mark-line inline-flex h-(--h) items-center gap-space-1 rounded-sm bg-status-live-bg px-(--pad-x) font-body text-size-label leading-none font-medium whitespace-nowrap text-status-live-ink"
          style:--h="24px"
          style:--pad-x="8px"><span>From project</span></span
        >
        <!-- literal: 30px / 44px height, 10px inline padding -->
        <button
          class="ns-in h-(--h) max-phone:h-(--h-phone) flex-none cursor-pointer rounded-sm border-none border-current bg-transparent px-(--pad-x) font-body text-size-label leading-none font-medium whitespace-nowrap text-ink-muted hover:bg-surface-hover hover:text-ink-strong"
          onclick={onoverride}
          style="--delay:40ms"
          style:--h="30px"
          style:--h-phone="44px"
          style:--pad-x="10px"
          type="button"
        >
          Override
        </button>
      {:else}
        <!-- literal: 6px gap, 30px / 44px height, 10px inline padding -->
        <button
          data-slot="browse"
          aria-expanded={browsing}
          class="ns-in inline-flex h-(--h) max-phone:h-(--h-phone) flex-none cursor-pointer items-center justify-start gap-(--gap) rounded-sm border border-border-control bg-surface-recess px-(--pad-x) font-body text-size-label leading-none font-medium whitespace-nowrap text-ink-strong opacity-(--o) shadow-(--browse-shadow) enabled:hover:bg-surface-hover disabled:cursor-not-allowed"
          disabled={!machineId}
          id="session-browse"
          onclick={toggleBrowse}
          style:--browse-shadow={"inset 0 0 0 1px var(--neutral-8), var(--shadow-raised)"}
          style:--gap="6px"
          style:--h="30px"
          style:--h-phone="44px"
          style:--o={machineId ? 1 : 0.5}
          style:--pad-x="10px"
          type="button"
        >
          {#if browsing}
            <Up class="size-icon-md flex-none text-ink-muted" /><span
              >Close</span
            >
          {:else}
            <Search class="size-icon-md flex-none text-ink-muted" />
            <span>Browse</span>
          {/if}
        </button>
      {/if}
    </div>
    <div inert={!browsing} {@attach folds(() => browsing, PANEL)}>
      <div class="min-h-0">
        <div class="border-t border-t-border-hairline bg-surface-recess">
          <!-- literal: 8px gap, 8px 8px 8px 10px padding -->
          <div
            class="flex max-phone:flex-wrap items-center gap-(--gap) border-b border-b-border-hairline bg-surface-recess pt-(--pad) pr-(--pad) pb-(--pad) pl-(--pad-l)"
            style:--gap="8px"
            style:--pad="8px"
            style:--pad-l="10px"
          >
            <!-- literal: 6px gap, 24px height, 8px inline padding, 6px dot -->
            <span
              data-slot="machine"
              class="mark-line inline-flex h-(--h) flex-none items-center gap-(--gap) rounded-sm bg-surface-lift px-(--pad-x) font-body text-size-label leading-none font-medium whitespace-nowrap text-ink-strong"
              style:--gap="6px"
              style:--h="24px"
              style:--pad-x="8px"
              ><span
                data-slot="dot"
                class="size-(--dot) rounded-pill bg-hue-green-500"
                data-box
                style:--dot="6px"
              ></span><span>{machineName}</span></span
            >
            <!-- literal: 1.4 line height -->
            <div
              class="flex max-phone:basis-full max-phone:flex-col min-w-0 flex-1 items-center max-phone:items-start gap-space-row font-(family-name:--font-mono) text-size-label leading-(--lh) font-normal text-ink-muted"
              style:--lh="1.4"
            >
              <div
                class="fai-scroll flex max-phone:max-w-full min-w-0 items-center gap-space-row overflow-x-auto whitespace-nowrap"
              >
                {#each crumbs.slice(0, -1) as crumb (crumb.to)}
                  <!-- literal: 44px minimum size, 6px inline padding -->
                  <button
                    data-slot="crumb"
                    class="min-h-(--min) min-w-(--min) flex-none cursor-pointer rounded-xs border-none border-current bg-transparent px-(--pad-x) text-inherit hover:bg-surface-hover"
                    onclick={() => list(crumb.to)}
                    style:--min="44px"
                    style:--pad-x="6px"
                    type="button"
                  >
                    {crumb.label}
                  </button>
                  <span aria-hidden="true" class="text-neutral-8">/</span>
                {/each}
              </div>
              <!-- literal: 44px minimum size, 8px padding -->
              <button
                data-slot="crumb"
                aria-current="location"
                class="min-h-(--min) min-w-(--min) max-w-full flex-none cursor-pointer rounded-xs border-none border-current bg-surface-lift p-(--pad) text-left font-medium wrap-anywhere text-ink-strong hover:bg-surface-hover"
                onclick={() => list(path)}
                style:--min="44px"
                style:--pad="8px"
                type="button"
              >
                {crumbs.at(-1)?.label}
              </button>
            </div>
          </div>
          <!-- literal: 196px maximum height, 6px padding, 1px gap -->
          <div
            class="fai-scroll grid max-h-(--max-h) content-start gap-(--gap) overflow-auto overscroll-contain p-(--pad)"
            style:--gap="1px"
            style:--max-h="196px"
            style:--pad="6px"
          >
            {#if canGoUp}
              <!-- literal: 10px gap, 34px / 44px height, 8px inline padding -->
              <button
                class="press-tint flex h-(--h) max-phone:h-(--h-phone) min-w-0 cursor-pointer items-center justify-start gap-(--gap) rounded-sm border-none border-current bg-transparent px-(--pad-x) text-left font-(family-name:--font-mono) text-size-label leading-none font-normal text-ink-muted hover:bg-surface-hover"
                onclick={goUp}
                style:--gap="10px"
                style:--h="34px"
                style:--h-phone="44px"
                style:--pad-x="8px"
                type="button"
              >
                <Left class="size-icon-md flex-none" /><span>Parent folder</span
                >
              </button>
            {/if}
            {#if listing}
              <!-- literal: 24px 8px padding -->
              <div
                data-slot="location-section-empty"
                class="type-meta px-(--pad-x) py-(--pad-y) text-center wrap-anywhere text-ink-subtle"
                role="status"
                style:--pad-x="8px"
                style:--pad-y="24px"
              >
                Loading folders...
              </div>
            {:else if listError}
              <!-- literal: 24px 8px padding -->
              <div
                data-slot="location-section-empty"
                class="type-meta px-(--pad-x) py-(--pad-y) text-center wrap-anywhere text-status-fail-ink"
                role="alert"
                style:--pad-x="8px"
                style:--pad-y="24px"
              >
                {listError}
              </div>
            {:else}
              {#each folders as folder (`${path}/${folder.name}`)}
                <!-- literal: 10px gap, 34px / 44px height, 8px inline padding -->
                <button
                  class="press-tint flex h-(--h) max-phone:h-(--h-phone) min-w-0 cursor-pointer items-center justify-start gap-(--gap) rounded-sm border-none border-current bg-transparent px-(--pad-x) text-left font-(family-name:--font-mono) text-size-label leading-none font-normal text-ink-strong hover:bg-surface-hover"
                  onclick={() => enter(folder.name)}
                  style:--gap="10px"
                  style:--h="34px"
                  style:--h-phone="44px"
                  style:--pad-x="8px"
                  title={folder.name}
                  type="button"
                >
                  <Folder
                    class="size-icon-md flex-none text-(--hue)"
                    style={`--hue:${folder.name.startsWith(".") ? "var(--neutral-8)" : "var(--hue-amber-500)"}`}
                  />
                  <span data-slot="name" class="min-w-0 flex-1 truncate"
                    >{folder.name}</span
                  >
                  <Right class="size-icon-md text-neutral-8" />
                </button>
              {/each}
              {#if !folders.length}
                <!-- literal: 24px 8px padding -->
                <div
                  data-slot="location-section-empty"
                  class="type-meta px-(--pad-x) py-(--pad-y) text-center wrap-anywhere text-ink-subtle"
                  role="status"
                  style:--pad-x="8px"
                  style:--pad-y="24px"
                >
                  No subfolders
                </div>
              {/if}
            {/if}
          </div>
          <!-- literal: 8px gap and padding, 44px button height on a phone, 1.3 line height -->
          <div
            class="flex max-phone:flex-wrap items-center justify-between gap-(--gap) border-t border-t-border-hairline bg-surface-lift p-(--gap)"
            style:--gap="8px"
          >
            <span
              data-slot="path"
              class="max-phone:basis-full min-w-0 truncate font-(family-name:--font-mono) text-size-meta leading-(--lh) font-normal text-ink-muted"
              style:--lh="1.3"
              title={path}>{path}</span
            >
            <button
              data-slot="primary"
              class="ns-btn touch-hit max-phone:min-h-(--min-h) flex-none whitespace-nowrap max-phone:w-full"
              data-size="sm"
              data-variant="primary"
              onclick={useFolder}
              style:--min-h="44px"
              type="button"
            >
              Use this folder
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div {@attach folds(() => mode === "repo", PANEL)}>
    <div class="min-h-0">
      <!-- literal: 8px gap, -12px rise -->
      <div
        data-slot="repo"
        class={[
          "grid gap-(--gap) transform-(--t) opacity-(--o) transition-[opacity] dur-panel ease-out motion-safe:transition-panel-travel",
          mode === "repo" ? "pointer-events-auto" : "pointer-events-none",
        ]}
        style:--gap="8px"
        style:--o={mode === "repo" ? 1 : 0}
        style:--t={`translateY(${mode === "repo" ? 0 : -12}px)`}
      >
        <div
          data-slot="location-section-field"
          class="overflow-hidden rounded-md border border-border-control bg-surface-raised shadow-xs transition-control"
        >
          <!-- literal: 8px gap, 42px / 46px height, 0 12px padding -->
          <div
            data-slot="row"
            class="flex h-(--h) max-phone:h-(--h-phone) items-center gap-(--gap) pr-(--pad-x) pl-(--pad-x)"
            style:--gap="8px"
            style:--h="42px"
            style:--h-phone="46px"
            style:--pad-x="12px"
          >
            <ProviderLogo
              class="size-icon-md flex-none"
              provider="github"
              fade="dim"
              size={null}
            />
            <!-- literal: 30px / 44px minimum height, 1.4 line height, 1rem on a phone -->
            <input
              aria-label="Repository"
              autocapitalize="off"
              class="min-h-(--min-h) max-phone:min-h-(--min-h-phone) max-phone:text-(length:--fs-phone) min-w-0 flex-1 border-none border-current bg-transparent p-0 font-(family-name:--font-mono) text-size-label leading-(--lh) font-normal text-ink-strong outline-none"
              id="session-repo"
              oninput={(event) => onrepo(event.currentTarget.value)}
              onkeydown={commitOnEnter}
              placeholder="owner/repository"
              spellcheck="false"
              style:--fs-phone="1rem"
              style:--lh="1.4"
              style:--min-h="30px"
              style:--min-h-phone="44px"
              tabindex={mode === "repo" ? 0 : -1}
              value={repo}
            />
          </div>
        </div>
        <!-- literal: 8px gap, 9px 10px padding, 1px icon offset -->
        <div
          data-slot="note"
          class="flex items-start gap-(--gap) rounded-md border border-border-hairline bg-surface-recess px-(--pad-x) py-(--pad-y)"
          style:--gap="8px"
          style:--mt="1px"
          style:--pad-x="10px"
          style:--pad-y="9px"
        >
          <Refresh class="mt-(--mt) size-icon-md flex-none text-hue-blue-500" />
          <span class="type-meta min-w-0 text-pretty text-ink-muted"
            >Cloned into <span
              class="min-w-0 font-(family-name:--font-mono) text-size-meta leading-(--lh) font-normal text-pretty text-ink-strong"
              style:--lh="1.35">{dir.trim() || "~"}</span
            > on each machine, pulled fresh before the agent starts.</span
          >
        </div>
      </div>
    </div>
  </div>
  {#if !embedded}
    <!-- literal: 16px minimum height -->
    <p
      aria-live="polite"
      class="type-meta m-0 min-h-(--min-h) truncate text-status-fail-ink data-informational:text-ink-muted"
      data-informational={informational || undefined}
      style:--min-h="16px"
      title={reading}
    >
      {reading || " "}
    </p>
  {/if}
</section>

<style>
  /* residual: keyframes */
  [data-slot="browse"]:disabled {
    animation: none;
  }
</style>
