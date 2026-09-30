<script lang="ts">
  /**
   * Location (§1.5, §2.8): Existing files | Clone from GitHub. The directory
   * browser lists the selected machine's real filesystem through `machineFs`.
   * No branch API exists, so the design's branch panel is not rendered.
   */
  import type { FsEntry } from "@whiffle/core";
  import { SectionHeader } from "$lib/components/ui/section-header";
  import { CURVE } from "$lib/whiffle/motion/curves.svelte";
  import { folds } from "$lib/whiffle/motion/fold.svelte";
  import GitHub from "~icons/logos/github-icon";
  import Up from "~icons/solar/alt-arrow-up-linear";
  import Left from "~icons/solar/arrow-left-linear";
  import Right from "~icons/solar/arrow-right-linear";
  import Folder from "~icons/solar/folder-bold-duotone";
  import FolderOpen from "~icons/solar/folder-open-bold-duotone";
  import Search from "~icons/solar/magnifer-bold-duotone";
  import Refresh from "~icons/solar/refresh-bold-duotone";
  import { machineFs } from "../client.svelte";
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
      const rows = await machineFs<FsEntry[]>(machineId, "list", next);
      if (id !== request) {
        return;
      }
      path = next;
      folders = rows
        .filter((row) => row.kind === "dir")
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (cause) {
      if (id !== request) {
        return;
      }
      listError = cause instanceof Error ? cause.message : String(cause);
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
  const PANEL = { ms: 280, easing: CURVE.inOut };
</script>

<section class="loc" class:embedded={embedded}>
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
      items={[{ value: "dir", label: "Existing files" }, { value: "repo", label: "Clone from GitHub" }]}
      label="Location source"
      onchange={onmode}
      value={mode}
    >
      {#snippet icon(value, on)}
        {#if value === "dir"}
          <Folder style="color:var(--hue-amber-500)" />
        {:else}
          <GitHub style={`opacity:${on ? 1 : 0.6}`} />
        {/if}
      {/snippet}
    </Segmented>
  {/snippet}

  <div class="field field-shell" class:locked={locked}>
    <div class="row">
      <FolderOpen class="lead" />
      <input
        aria-invalid={reading && !informational ? true : undefined}
        aria-label="Directory"
        autocapitalize="off"
        id="session-dir"
        oninput={(event) => ondir(event.currentTarget.value)}
        onkeydown={commitOnEnter}
        placeholder="~/code/project"
        readonly={locked}
        spellcheck="false"
        value={dir}
      >
      {#if locked}
        <span class="badge ns-in">From project</span>
        <button
          class="override ns-in"
          onclick={onoverride}
          style="--delay:40ms"
          type="button"
        >
          Override
        </button>
      {:else}
        <button
          aria-expanded={browsing}
          class="browse ns-in"
          disabled={!machineId}
          id="session-browse"
          onclick={toggleBrowse}
          style={`opacity:${machineId ? 1 : 0.5}`}
          type="button"
        >
          {#if browsing}
            <Up /><span>Close</span>
          {:else}
            <Search />
            <span>Browse</span>
          {/if}
        </button>
      {/if}
    </div>
    <div class="panel" inert={!browsing} {@attach folds(() => browsing, PANEL)}>
      <div class="clip">
        <div class="browser">
          <div class="crumbs">
            <span class="machine"><span class="dot"></span>{machineName}</span>
            <div class="trail">
              <div class="ancestors fai-scroll">
                {#each crumbs.slice(0, -1) as crumb (crumb.to)}
                  <button
                    class="crumb"
                    onclick={() => list(crumb.to)}
                    type="button"
                  >
                    {crumb.label}
                  </button>
                  <span aria-hidden="true" class="sep">/</span>
                {/each}
              </div>
              <button
                aria-current="location"
                class="crumb current"
                onclick={() => list(path)}
                type="button"
              >
                {crumbs.at(-1)?.label}
              </button>
            </div>
          </div>
          <div class="folders fai-scroll">
            {#if canGoUp}
              <button class="folder up press-tint" onclick={goUp} type="button">
                <Left /><span>Parent folder</span>
              </button>
            {/if}
            {#if listing}
              <div class="empty" role="status">Loading folders...</div>
            {:else if listError}
              <div class="empty error" role="alert">{listError}</div>
            {:else}
              {#each folders as folder (`${path}/${folder.name}`)}
                <button
                  class="folder press-tint"
                  onclick={() => enter(folder.name)}
                  title={folder.name}
                  type="button"
                >
                  <Folder
                    style={`color:${folder.name.startsWith('.') ? 'var(--neutral-8)' : 'var(--hue-amber-500)'}`}
                  />
                  <span class="name">{folder.name}</span>
                  <Right class="go" />
                </button>
              {/each}
              {#if !folders.length}
                <div class="empty" role="status">No subfolders</div>
              {/if}
            {/if}
          </div>
          <div class="use">
            <span class="path" title={path}>{path}</span>
            <button
              class="ns-btn sm primary touch-hit"
              onclick={useFolder}
              type="button"
            >
              Use this folder
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="panel" {@attach folds(() => mode === "repo", PANEL)}>
    <div class="clip">
      <div
        class="repo"
        style={`transform:translateY(${mode === "repo" ? 0 : -12}px);opacity:${mode === "repo" ? 1 : 0};pointer-events:${mode === "repo" ? "auto" : "none"}`}
      >
        <div class="field">
          <div class="row repo-row">
            <GitHub class="lead gh" />
            <input
              aria-label="Repository"
              autocapitalize="off"
              id="session-repo"
              oninput={(event) => onrepo(event.currentTarget.value)}
              onkeydown={commitOnEnter}
              placeholder="owner/repository"
              spellcheck="false"
              tabindex={mode === "repo" ? 0 : -1}
              value={repo}
            >
          </div>
        </div>
        <div class="note">
          <Refresh />
          <span
            >Cloned into <span class="mono">{dir.trim() || "~"}</span> on each
            machine, pulled fresh before the agent starts.</span
          >
        </div>
      </div>
    </div>
  </div>
  {#if !embedded}
    <p aria-live="polite" class="reading" title={reading} class:informational>
      {reading || " "}
    </p>
  {/if}
</section>

<style>
  .loc {
    display: grid;
    gap: 8px;
  }
  .loc.embedded {
    padding: 4px;
  }
  .loc.embedded > :global(.segmented) {
    justify-self: start;
  }
  .field {
    background: var(--surface-raised);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-xs);
    overflow: hidden;
    transition: var(--transition-control);
  }
  .field.locked {
    background: var(--surface-recess);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 42px;
    padding: 0 6px 0 12px;
  }
  .repo-row {
    padding-right: 12px;
  }
  .row :global(svg.lead) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--hue-amber-500);
  }
  .row :global(svg.gh) {
    opacity: 0.8;
    color: var(--ink-strong);
  }
  input {
    flex: 1;
    min-width: 0;
    min-height: 30px;
    border: 0;
    outline: none;
    background: transparent;
    font: 400 var(--text-label) / 1.4 var(--font-mono);
    color: var(--ink-strong);
    padding: 0;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    background: var(--status-live-bg);
    color: var(--status-live-ink);
    font: 500 var(--text-label) / 1 var(--font-body);
    white-space: nowrap;
  }
  .override {
    flex: none;
    height: 30px;
    padding: 0 10px;
    border: 0;
    background: transparent;
    border-radius: var(--radius-sm);
    font: 500 var(--text-label) / 1 var(--font-body);
    color: var(--ink-muted);
    cursor: pointer;
    white-space: nowrap;
  }
  .browse {
    display: inline-flex;
    flex: none;
    justify-content: flex-start;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--border-control);
    background: var(--surface-recess);
    box-shadow:
      inset 0 0 0 1px var(--neutral-8),
      var(--shadow-raised);
    border-radius: var(--radius-sm);
    font: 500 var(--text-label) / 1 var(--font-body);
    color: var(--ink-strong);
    cursor: pointer;
    white-space: nowrap;
  }
  .browse:disabled {
    animation: none;
    cursor: not-allowed;
  }
  .browse :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--ink-muted);
  }
  @media (hover: hover) {
    .override:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
    .browse:not(:disabled):hover,
    .crumb:hover {
      background: var(--surface-hover);
    }
    .folder:hover {
      background: var(--surface-hover);
    }
  }
  /* A panel opens by growing to its content's height and folds shut the
     same way (280ms, --ease-in-out; motion/fold.svelte.ts). */
  .clip {
    min-height: 0;
  }
  .browser {
    border-top: 1px solid var(--border-hairline);
    background: var(--surface-recess);
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 8px 10px;
    border-bottom: 1px solid var(--border-hairline);
    background: var(--surface-recess);
  }
  .machine {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 24px;
    padding: 0 8px;
    border-radius: var(--radius-sm);
    background: var(--surface-lift);
    font: 500 var(--text-label) / 1 var(--font-body);
    color: var(--ink-strong);
    white-space: nowrap;
    flex: none;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-pill);
    background: var(--hue-green-500);
  }
  .trail {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    font: 400 var(--text-label) / 1.4 var(--font-mono);
    color: var(--ink-muted);
  }
  .ancestors {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 2px;
    overflow-x: auto;
    white-space: nowrap;
  }
  .crumb {
    min-height: 44px;
    min-width: 44px;
    flex: none;
    padding: 0 6px;
    border: 0;
    background: transparent;
    border-radius: var(--radius-xs);
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .crumb.current {
    max-width: 100%;
    padding: 8px;
    background: var(--surface-lift);
    color: var(--ink-strong);
    font-weight: 500;
    text-align: left;
    overflow-wrap: anywhere;
  }
  .sep {
    color: var(--neutral-8);
  }
  .folders {
    max-height: 196px;
    overflow: auto;
    padding: 6px;
    display: grid;
    align-content: start;
    overscroll-behavior: contain;
    gap: 1px;
  }
  .folder {
    display: flex;
    justify-content: flex-start;
    min-width: 0;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 8px;
    border: 0;
    background: transparent;
    border-radius: var(--radius-sm);
    font: 400 var(--text-label) / 1 var(--font-mono);
    color: var(--ink-strong);
    cursor: pointer;
    text-align: left;
  }
  .folder.up {
    color: var(--ink-muted);
  }
  .folder :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .folder :global(svg.go) {
    width: 16px;
    height: 16px;
    color: var(--neutral-8);
  }
  .folder .name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .empty {
    padding: 24px 8px;
    font: var(--type-meta);
    color: var(--ink-subtle);
    text-align: center;
    overflow-wrap: anywhere;
  }
  .empty.error {
    color: var(--status-fail-ink);
  }
  .use {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px;
    border-top: 1px solid var(--border-hairline);
    background: var(--surface-lift);
  }
  .use .ns-btn {
    flex: none;
    white-space: nowrap;
  }
  .path {
    font: 400 var(--text-meta) / 1.3 var(--font-mono);
    color: var(--ink-muted);
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .repo {
    display: grid;
    gap: 8px;
    transition: opacity 280ms ease;
    @media (prefers-reduced-motion: no-preference) {
      transition:
        transform 280ms var(--ease-in-out),
        opacity 280ms ease;
    }
  }
  .note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 9px 10px;
    background: var(--surface-recess);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-md);
  }
  .note :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
    margin-top: 1px;
    color: var(--hue-blue-500);
  }
  .note span {
    font: var(--type-meta);
    color: var(--ink-muted);
    text-wrap: pretty;
    min-width: 0;
  }
  .note .mono {
    font-family: var(--font-mono);
    color: var(--ink-strong);
  }
  .reading {
    margin: 0;
    font: var(--type-meta);
    color: var(--status-fail-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: 16px;
  }
  .reading.informational {
    color: var(--ink-muted);
  }
  @media (max-width: 640px) {
    .crumbs {
      flex-wrap: wrap;
    }
    .trail {
      flex-basis: 100%;
      flex-direction: column;
      align-items: flex-start;
    }
    .ancestors {
      max-width: 100%;
    }
    .row {
      height: 46px;
    }
    .row:not(.repo-row) {
      height: 56px;
    }
    input {
      min-height: 44px;
      font-size: 1rem;
    }
    .browse,
    .override {
      height: 44px;
    }
    .folder {
      height: 44px;
    }
    .use {
      flex-wrap: wrap;
    }
    .path {
      flex-basis: 100%;
    }
    .use .ns-btn {
      width: 100%;
      min-height: 44px;
    }
  }
</style>
