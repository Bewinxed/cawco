<script lang="ts" module>
  import type { FsEntry } from "@cawco/core/protocol";
  import { unhandled } from "@cawco/core/unhandled";
  import { machineFs } from "../stores/machines";

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

  /**
   * What starting the session does with the location, as the machine's files
   * say it now: clones the repository into the folder, uses the clone
   * already there, cannot clone into a folder that holds something else,
   * or works in a folder that is not there.
   */
  type Outcome =
    | { kind: "clones" | "uses" | "other"; repo: string; target: string }
    | { kind: "missing"; path: string };

  /** A folder's listing, or that it is not there; unread when the machine did not say. */
  async function listing(
    machineId: string,
    path: string
  ): Promise<FsEntry[] | "missing" | "unread"> {
    try {
      const read = await machineFs(machineId, "list", path);
      switch (read.kind) {
        case "answered":
          return read.value;
        case "unanswered":
          return "unread";
        default:
          return unhandled("read", read);
      }
    } catch (cause) {
      return cause instanceof Error && cause.message.startsWith("ENOENT:")
        ? "missing"
        : "unread";
    }
  }

  /** A file's text; null when it is not there or the machine did not say. */
  async function text(machineId: string, path: string): Promise<string | null> {
    try {
      const read = await machineFs(machineId, "read", path);
      return read.kind === "answered" ? read.value : null;
    } catch {
      return null;
    }
  }

  const ORIGIN_SECTION = /^\s*\[remote\s+"origin"\]\s*$/u;
  const SECTION = /^\s*\[/u;
  const URL_LINE = /^\s*url\s*=\s*(\S+)\s*$/u;
  const GITDIR = /^gitdir:\s*(\S+)/u;

  /** The origin's URL in a git config's text (`[remote "origin"]`, `url = …`). */
  function originIn(config: string): string | null {
    let inOrigin = false;
    for (const line of config.split("\n")) {
      if (SECTION.test(line)) {
        inOrigin = ORIGIN_SECTION.test(line);
      } else if (inOrigin) {
        const url = URL_LINE.exec(line)?.[1];
        if (url) {
          return url;
        }
      }
    }
    return null;
  }

  /** `path` with its `.` and `..` resolved, from `base` when it is relative. */
  function resolved(base: string, path: string): string {
    const parts: string[] = [];
    const whole =
      path.startsWith("/") || path.startsWith("~") ? path : `${base}/${path}`;
    for (const part of whole.split("/")) {
      if (part === "..") {
        parts.pop();
      } else if (part && part !== ".") {
        parts.push(part);
      }
    }
    return whole.startsWith("/") ? `/${parts.join("/")}` : parts.join("/");
  }

  /**
   * The origin of the checkout at `target`: its `.git/config`'s, or for a
   * worktree (a `.git` file naming its git dir) the main checkout's, which
   * the worktree's `commondir` names. Null when it has none, or none is read.
   */
  async function originAt(
    machineId: string,
    target: string
  ): Promise<string | null> {
    const own = await text(machineId, `${target}/.git/config`);
    if (own !== null) {
      return originIn(own);
    }
    const pointer = GITDIR.exec(
      (await text(machineId, `${target}/.git`)) ?? ""
    )?.[1];
    if (!pointer) {
      return null;
    }
    const gitDir = resolved(target, pointer);
    const common = (await text(machineId, `${gitDir}/commondir`))?.trim();
    const config = await text(
      machineId,
      `${common ? resolved(gitDir, common) : gitDir}/config`
    );
    return config === null ? null : originIn(config);
  }
</script>

<script lang="ts">
  /**
   * Location (§1.5, §2.8), the location chip's popover: Repository | Folder.
   * Repository picks one of the machine's GitHub repositories, or takes a
   * pasted git URL on any host (RepoPicker), and clones it into the folder
   * the path box names; Folder works in that folder. The path box browses
   * the selected machine's real folders through `machineFs`. One line under
   * them says what starting does, from the machine's files: the clone it
   * makes or the one already there it uses (agent session.ts `cloneRepo`
   * reuses a clone whose origin is the repository), a folder in the way, or
   * a folder that is not there.
   */
  import {
    isGitUrl,
    repoIdentity,
    repoLeaf,
    repoPath,
  } from "@cawco/core/protocol";
  import { spawnWords } from "@cawco/core/words/spawn";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    IconFolder as Folder,
    IconFolderOpen as FolderOpen,
    IconArrowLeft as Left,
    IconArrowRight as Right,
    IconSearch as Search,
    IconChevronUp as Up,
  } from "#lib/icons.js";
  import { failureWords } from "#lib/platform/hub-read.js";
  import {
    CURVE,
    dur,
    numberOf,
    staggered,
  } from "#lib/platform/motion/curves.svelte.js";
  import { folds, unfold } from "#lib/platform/motion/fold.svelte.js";
  import { didntAnswer } from "../hub/control";
  import { TRY_AGAIN } from "../unanswered";
  import { LOCATION_SETTLE_MS } from "./new-session.svelte";
  import RepoPicker from "./RepoPicker.svelte";

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
    oncommit,
  }: LocationFields & {
    /**
     * The location is set: Enter in the search or the path box, or "Use
     * this folder". The popover holding the form closes on it, and the next
     * keys go back where the reader was typing.
     */
    oncommit?: () => void;
  } = $props();
  const uid = $props.id();
  function commitOnEnter(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      oncommit?.();
    }
  }
  let browsing = $state(false);
  let path = $state("~");
  let folders = $state<FsEntry[]>([]);
  let listingFolders = $state(false);
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
    listingFolders = true;
    listError = "";
    try {
      const read = await machineFs(machineId, "list", next);
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
        default:
          unhandled("read", read);
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
        listingFolders = false;
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

  /** The folder the path box names, as the machine places it: `~` when it names none. */
  const base = $derived(dir.trim().replace(trailing, "") || "~");
  const url = $derived(mode === "repo" && isGitUrl(repo) ? repo.trim() : "");

  /**
   * The outcome as last read, kept on screen while the next is read (its
   * words change in place), and gone where there is nothing to say: no
   * repository picked, or a folder that is there.
   */
  let outcome = $state<Outcome | null>(null);
  /** The location the last read was asked for, so a pick reads at once and typing waits. */
  let askedBase = "";
  $effect(() => {
    const id = machineId;
    const folder = base;
    const clone = url;
    const repoMode = mode === "repo";
    if (!id || (repoMode && !clone)) {
      outcome = null;
      return;
    }
    let stale = false;
    const typed = folder !== askedBase;
    askedBase = folder;
    const timer = setTimeout(
      async () => {
        const next = await outcomeOf(id, folder, clone);
        if (!stale && next !== "unread") {
          outcome = next;
        }
      },
      typed ? LOCATION_SETTLE_MS : 0
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  });

  async function outcomeOf(
    id: string,
    folder: string,
    clone: string
  ): Promise<Outcome | null | "unread"> {
    const there = await listing(id, folder);
    if (there === "unread") {
      return "unread";
    }
    if (!clone) {
      return there === "missing" ? { kind: "missing", path: folder } : null;
    }
    const into = `${folder === "/" ? "" : folder}/${repoLeaf(clone)}`;
    const entry =
      there === "missing"
        ? undefined
        : there.find((one) => one.name === repoLeaf(clone));
    if (!entry) {
      return { kind: "clones", repo: clone, target: into };
    }
    if (entry.kind !== "dir") {
      return { kind: "other", repo: clone, target: into };
    }
    const origin = await originAt(id, into);
    return {
      kind:
        origin && repoIdentity(origin) === repoIdentity(clone)
          ? "uses"
          : "other",
      repo: clone,
      target: into,
    };
  }

  /**
   * The outcome's sentence, and the path in it that is set apart: the last
   * read's, in the mode it was read for, until the next read replaces it.
   */
  const said = $derived.by((): { path: string; sentence: string } | null => {
    if (!outcome || (outcome.kind === "missing") !== (mode === "dir")) {
      return null;
    }
    switch (outcome.kind) {
      case "missing":
        return {
          path: outcome.path,
          sentence: spawnWords.location.folderMissing(
            outcome.path,
            machineName
          ),
        };
      case "clones":
        return {
          path: outcome.target,
          sentence: spawnWords.location.clones(
            repoPath(outcome.repo),
            outcome.target,
            machineName
          ),
        };
      case "uses":
        return {
          path: outcome.target,
          sentence: spawnWords.location.usesClone(outcome.target, machineName),
        };
      case "other":
        return {
          path: outcome.target,
          sentence: spawnWords.location.holdsOther(outcome.target, machineName),
        };
      default:
        return unhandled("outcome", outcome);
    }
  });

  /** The path box's label: where the clone goes, or where the session works. */
  const pathLabel = $derived(
    mode === "repo" ? spawnWords.location.cloneInto : spawnWords.location.workIn
  );
  /** The browser under the path box folds open and shut; read when a fold plays, the duration a root token. */
  const PANEL = {
    get ms() {
      return dur("--duration-panel");
    },
    easing: CURVE.inOut,
  };
  /** The repository part, giving its column's gap back as it folds shut. */
  const REPO_PART = {
    get ms() {
      return dur("--duration-panel");
    },
    easing: CURVE.inOut,
    fade: true,
    get gap() {
      return numberOf("--spacing-space-4");
    },
  };
  /** The mark cell every field and row of the popover leads with: one column, so marks and words start on shared edges. */
  const LEAD = "grid w-c-row-lead flex-none place-items-center self-stretch";
</script>

<section class="grid min-w-0 gap-space-4 p-space-1">
  <Tabs
    class="justify-self-start"
    onValueChange={(next: string) => {
      if (next === "dir" || next === "repo") {
        onmode(next);
      }
    }}
    size="compact"
    value={mode}
  >
    <TabsList aria-label={spawnWords.location.source}>
      <TabItem label={spawnWords.location.repository} value="repo">
        {#snippet lead()}
          <ProviderLogo provider="github" />
        {/snippet}
      </TabItem>
      <TabItem icon={Folder} label={spawnWords.location.folder} value="dir" />
    </TabsList>
  </Tabs>

  <div
    data-slot="repo"
    inert={mode !== "repo"}
    {@attach folds(() => mode === "repo", REPO_PART)}
  >
    <RepoPicker
      focus={mode === "repo"}
      {machineId}
      {machineName}
      {oncommit}
      {onrepo}
      {repo}
    />
  </div>

  <div data-slot="path" class="grid min-w-0 gap-space-2">
    <span class="type-label text-ink-muted" id={`${uid}-path`}
      ><MorphText text={pathLabel} /></span
    >
    <!-- It clips its corners and is no scroller (the browser's foot sticks
         past it to the popover's), so as its grid's item it takes no width
         of its own content's: `min-w-0`, or the folder rows widened the
         popover past a phone's edge. -->
    <div
      data-slot="location-section-field"
      class="field-edge min-w-0 overflow-clip rounded-md border bg-surface-raised shadow-xs transition-control data-locked:bg-surface-recess"
      data-locked={locked || undefined}
    >
      <div
        data-slot="row"
        class="flex h-c-row-h items-center gap-space-3 pe-space-2"
      >
        <span class={LEAD}
          ><FolderOpen
            data-location-section-lead
            class="size-icon-md text-mark-3"
          /></span
        >
        <input
          aria-invalid={reading && !informational ? true : undefined}
          aria-labelledby={`${uid}-path`}
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
            class="ns-in mark-line inline-flex h-c-pill-h items-center gap-space-1 rounded-sm bg-status-live-bg px-space-2 font-sans text-size-label leading-none font-medium whitespace-nowrap text-status-live-ink"
            ><span>{spawnWords.location.fromProject}</span></span
          >
          <span class="ns-in flex flex-none" style:--delay={staggered(1)}>
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
            <!-- The machine and the crumb on one line at every width. The
                 folder you are in stands whole at the crumb's end (its name
                 ending in an ellipsis only past the whole row); the folders
                 above it scroll sideways in the room left, opening at their
                 end, the one above yours: a right-to-left scroller starts at
                 its right, round a left-to-right run of crumbs. -->
            <div
              class="flex items-center gap-space-2 border-b border-b-border-hairline bg-surface-recess p-space-2 ps-space-3"
            >
              <span
                data-slot="machine"
                class="mark-line inline-flex h-c-pill-h flex-none items-center gap-space-2 rounded-sm bg-surface-lift px-space-2 font-sans text-size-label leading-none font-medium whitespace-nowrap text-ink-strong"
                ><span
                  data-slot="dot"
                  class="size-space-2 rounded-pill bg-mark-4"
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
              class="fai-scroll grid max-h-49 content-box-start gap-space-row overflow-auto overscroll-contain p-space-2"
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
              {#if listingFolders}
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
                      style={`color:${folder.name.startsWith(".") ? "var(--color-neutral-8)" : "var(--color-mark-3)"}`}
                    />
                    <span data-slot="name" class="min-w-0 flex-1 truncate"
                      >{folder.name}</span
                    >
                    {#if folder.git}
                      <span
                        data-slot="git"
                        class="flex-none font-sans type-meta text-ink-muted"
                        >{spawnWords.location.gitRepository}</span
                      >
                    {/if}
                    <Right class="size-icon-md flex-none text-neutral-8" />
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
                class="max-phone:basis-full min-w-0 truncate font-(family-name:--font-mono) type-meta text-ink-muted"
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
  </div>

  {#if said}
    {@const at = said.sentence.indexOf(said.path)}
    <p
      data-slot="outcome"
      aria-live="polite"
      class="m-0 min-w-0 type-meta text-pretty text-ink-muted"
      in:unfold
      out:unfold
    >
      {#if at >= 0}{said.sentence.slice(0, at)}<span
          class="font-(family-name:--font-mono) wrap-anywhere text-ink-strong"
          >{said.path}</span
        >{said.sentence.slice(at + said.path.length)}{:else}{said.sentence}{/if}
    </p>
  {/if}
</section>
