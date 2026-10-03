<script lang="ts">
  import { machineLabel } from "@cawco/core";
  /**
   * The project home (NEW.md §1, north star 4): what this is and what is
   * happening — read from the repo's own files, never from a store of
   * CawCo's own.
   */
  import { flushSync, tick, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { InstanceRow, ProjectRow } from "#lib/cawco/client.svelte.js";
  import {
    cawco,
    deleteProject,
    machineFs,
    spawnSession,
  } from "#lib/cawco/client.svelte.js";
  import { type Doc, readDocs } from "#lib/cawco/docs.js";
  import ErrorText from "#lib/cawco/ErrorText.svelte";
  import LiveSessionRow from "#lib/cawco/LiveSessionRow.svelte";
  import { conversationHref } from "#lib/cawco/links.js";
  import MachineInventory from "#lib/cawco/MachineInventory.svelte";
  import {
    crossIn,
    crossOut,
    dur,
    ease,
  } from "#lib/cawco/motion/curves.svelte.js";
  import { fold } from "#lib/cawco/motion/fold.svelte.js";
  import { route } from "#lib/cawco/motion/route.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { handOver, land } from "#lib/cawco/motion/share.svelte.js";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import StoredSessionRow from "#lib/cawco/StoredSessionRow.svelte";
  import { rememberSpawn, spawnPrefs } from "#lib/cawco/spawnPrefs.svelte.js";
  import MemoryCard from "#lib/components/features/MemoryCard.svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Card } from "#lib/components/ui/card/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Markdown } from "#lib/components/ui/markdown/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconChat, IconDocument } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const project = $derived<ProjectRow | null>(
    (data.project && cawco.project(data.project.id)) ?? data.project
  );
  const machine = $derived(
    cawco.machines.find((row) => row.machineId === project?.machineId) ??
      data.machine
  );

  /** Null until the checkout has answered what markdown it holds. */
  let docs = $state<Doc[] | null>(null);
  let open = $state<Doc | null>(null);
  let content = $state("");
  /** The document whose content is on screen: the open one, once it is read. */
  let shown = $state<string | null>(null);
  let draft = $state<string | null>(null);
  let docsError = $state<string | null>(null);
  let docError = $state<string | null>(null);
  let saving = $state(false);

  /**
   * Nothing on this page says "empty" before the machine has answered: until
   * the docs list and the first document are read, the card stands at the
   * size it will have, as a skeleton, and the text cross-fades into it.
   */
  const docsRead = $derived(
    docs !== null && (docs.length === 0 || shown !== null)
  );

  /**
   * 24 lines of `prose-sm`, whose line box is exactly 1.5rem — so the clamp
   * lands between lines instead of through one. What is left over fades under
   * the card's edge until "Read more" lifts it.
   */
  const COLLAPSED_DOC = "calc(1.5rem * 24)";
  /**
   * The reading pane's height: the clamp and its Read more row. Every view
   * but the editor stands at least this tall — the skeleton, a short file, a
   * checkout with no markdown — so what a file turns out to hold never moves
   * the page under it; a longer one opens past it only when asked.
   */
  const PANE = "calc(1.5rem * 24 + 2.25rem)";
  const COLLAPSED_LINES = 36;
  let docBody = $state<HTMLElement | null>(null);
  /** The card's body: what it shows changes, and its height follows. */
  let bodyBox = $state<HTMLElement | null>(null);
  let expanded = $state(false);
  let clipped = $state(false);
  let showMore = $state(false);
  let forgetOpen = $state(false);
  let forgetting = $state(false);
  /** The last forget went through (a failed one leaves the dialog open). */
  let forgotten = $state(false);
  let spawnOpen = $state(false);
  let spawnPrompt = $state("");

  /**
   * At xl the docs run down a column beside the reader; below, across it.
   * The layout is the stylesheet's (so the server draws it right); this is
   * only which arrow keys walk the tabs.
   */
  const docsColumn = new MediaQuery("(min-width: 1280px)");

  /** What the card's body shows: its skeleton, a document, or its editor. */
  const view = $derived.by(() => {
    if (docsError) {
      return "unlisted";
    }
    if (docs?.length === 0) {
      return "none";
    }
    if (shown === null) {
      return "reading";
    }
    return `${shown}:${draft === null ? "read" : "edit"}`;
  });
  /** What the docs row and the card's header say when there is no doc to open. */
  const docsStatus = $derived(
    docsError ? "Could not list the docs" : "No markdown yet"
  );

  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  /**
   * Change what the card's body shows: the two views cross-fade (crossIn /
   * crossOut) while the body's height moves from the one it is drawn at to
   * the new one's, over --dur-panel on --ease-in-out.
   */
  async function reshape(change: () => void) {
    const from = bodyBox?.getBoundingClientRect().height;
    change();
    await tick();
    if (bodyBox && from !== undefined) {
      fold(
        bodyBox,
        true,
        { ms: dur("--dur-panel"), easing: ease("--ease-in-out") },
        from
      );
    }
  }

  let loadedFor = "";

  $effect(() => {
    const current = project;
    const ready = cawco.status === "connected";
    if (!(current && ready) || loadedFor === current.id) {
      return;
    }
    loadedFor = current.id;
    untrack(() => {
      liveMounted = LIVE_FIRST;
      liveFirst = null;
      rowsWatched = false;
      liveFollowed = false;
      // biome-ignore lint/complexity/noVoid: fire-and-forget — each load manages its own state, independent of the other
      void loadDocs(current);
      // biome-ignore lint/complexity/noVoid: fire-and-forget — each load manages its own state, independent of the other
      void loadClaude(current);
    });
  });

  async function loadDocs(target: ProjectRow) {
    docs = null;
    open = null;
    shown = null;
    draft = null;
    docsError = null;
    try {
      const listed = await readDocs(target.machineId, target.cwd);
      docs = listed;
      if (listed.length > 0) {
        await openDoc(listed[0]);
      }
    } catch (error) {
      docsError = message(error);
    }
  }

  async function openDoc(doc: Doc) {
    if (!project) {
      return;
    }
    open = doc;
    docError = null;
    if (draft !== null) {
      await reshape(() => {
        draft = null;
      });
    }
    // The document on screen stays until the next one is read, then the two
    // cross-fade: no blank card between them.
    let next = "";
    try {
      next = await machineFs<string>(project.machineId, "read", doc.path);
    } catch (error) {
      if (open?.path === doc.path) {
        docError = message(error);
      }
    }
    if (open?.path !== doc.path) {
      return;
    }
    // A document arrives clamped, with its Read more, as the skeleton stood;
    // one shorter than the clamp gives the row back once it is measured.
    await reshape(() => {
      content = next;
      shown = doc.path;
      expanded = false;
      clipped = true;
    });
  }

  async function save() {
    if (!(project && open) || draft === null) {
      return;
    }
    const text = draft;
    saving = true;
    docError = null;
    try {
      await machineFs(project.machineId, "write", open.path, text);
      await reshape(() => {
        content = text;
        draft = null;
      });
    } catch (error) {
      docError = message(error);
    } finally {
      saving = false;
    }
  }

  /**
   * Read more lifts the clamp and Show less puts it back: the body folds from
   * the height it is drawn at, 240ms open and --dur-exit shut.
   */
  function toggleExpanded() {
    const node = docBody;
    if (!node) {
      return;
    }
    const from = node.getBoundingClientRect().height;
    const opening = !expanded;
    expanded = opening;
    flushSync();
    if (!opening) {
      node.scrollTop = 0;
    }
    fold(
      node,
      true,
      { ms: opening ? 240 : dur("--dur-exit"), easing: ease("--ease-out") },
      from
    );
  }

  /**
   * Only a document with more to show earns a "Read more". Measured against
   * the clamp rather than the box, so a fold in flight never changes the
   * answer, and on every resize of the text, so markdown that paints late is
   * measured once it has.
   */
  function overClamp(node: HTMLElement): boolean {
    const rem = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize
    );
    return node.scrollHeight > COLLAPSED_LINES * rem + 4;
  }

  function measureClip(node: HTMLElement) {
    const measure = () => {
      clipped = overClamp(node);
    };
    const sizes = new ResizeObserver(measure);
    for (const child of node.children) {
      sizes.observe(child);
    }
    return () => sizes.disconnect();
  }

  let claude = $state<string | null>(null);
  /** CLAUDE.md has been read, or has answered that it is not there. */
  let claudeRead = $state(false);
  let claudeEditing = $state(false);
  let claudeError = $state<string | null>(null);

  const claudePath = $derived(project ? `${project.cwd}/CLAUDE.md` : "");
  const claudeOnline = $derived(machine?.status === "online");

  async function loadClaude(target: ProjectRow) {
    claude = null;
    claudeRead = false;
    claudeEditing = false;
    claudeError = null;
    try {
      claude = await machineFs<string>(
        target.machineId,
        "read",
        `${target.cwd}/CLAUDE.md`
      );
    } catch (error) {
      if (!message(error).includes("does not exist")) {
        claudeError = message(error);
      }
    } finally {
      claudeRead = true;
    }
  }

  async function saveClaude(text: string): Promise<boolean> {
    if (!project) {
      return false;
    }
    claudeError = null;
    try {
      await machineFs(project.machineId, "write", claudePath, text);
      claude = text;
      // CLAUDE.md is in the docs nav too; the viewer must not go on showing
      // what the rail just replaced.
      if (open?.path === claudePath) {
        content = text;
      }
      return true;
    } catch (error) {
      claudeError = message(error);
      return false;
    }
  }

  const live = $derived(project ? cawco.liveIn(project) : []);
  const stored = $derived(project ? cawco.storedIn(project) : []);
  /**
   * The rail's two lists answer separately, and each shows when its own
   * source has: the live sessions with the fleet's first read, the stored
   * ones once the machine has listed them (or is not online to ask).
   */
  const liveRead = $derived(cawco.fleetRead);

  /**
   * The live list mounts a screenful at once and the rest a chunk a frame. A
   * checkout with hundreds of live sessions (cockpit has 363) otherwise held
   * its first row back for the whole list's mount, ~300ms of it. Every row
   * still renders; the ones past the first screenful follow a frame or two
   * later, below the fold, where nothing on screen is under them.
   *
   * While it mounts, the list is the sessions that were live when the fleet
   * answered (each row's own data stays current); a session that starts or
   * stops in those few hundred ms is taken in once it is whole. Then the
   * list's reflow is attached, and a frame later the list follows the live
   * set: what arrived or left meanwhile opens or closes in place, and from
   * then on every change does, instead of pushing the rows under it.
   */
  const LIVE_FIRST = 24;
  const LIVE_STEP = 32;
  let liveMounted = $state(LIVE_FIRST);
  let liveFirst = $state.raw<InstanceRow[] | null>(null);
  let rowsWatched = $state(false);
  let liveFollowed = $state(false);
  $effect(() => {
    if (liveRead && liveFirst === null) {
      liveFirst = untrack(() => live);
    }
  });
  $effect(() => {
    if (liveFirst === null || liveFollowed) {
      return;
    }
    if (liveMounted < liveFirst.length) {
      const frame = requestAnimationFrame(() => {
        liveMounted += LIVE_STEP;
      });
      return () => cancelAnimationFrame(frame);
    }
    if (!rowsWatched) {
      rowsWatched = true;
      return;
    }
    const frame = requestAnimationFrame(() => {
      liveFollowed = true;
    });
    return () => cancelAnimationFrame(frame);
  });
  const liveById = $derived(new Map(live.map((row) => [row.id, row])));
  const liveShown = $derived(
    liveFollowed
      ? live
      : (liveFirst ?? [])
          .slice(0, liveMounted)
          .map((row) => liveById.get(row.id) ?? row)
  );
  const storedRead = $derived(
    project !== null &&
      cawco.fleetRead &&
      (machine?.status !== "online" || cawco.catalogRead(project.machineId))
  );
  /** Indices for skeleton rows: `{#each}` wants something to walk. */
  const count = (n: number) => Array.from({ length: n }, (_, i) => i);
  const SESSION_SKELETON = 8;
  /** Stored sessions shown before "Show more". */
  const STORED_FIRST = 8;
  /** The rows "Show more" adds open in place through the list's reflow. */
  const storedShown = $derived(
    showMore ? stored : stored.slice(0, STORED_FIRST)
  );

  function startSession(scratch: boolean) {
    if (!project) {
      return;
    }
    const perm = spawnPrefs.permissionMode;
    const mod = spawnPrefs.model;
    // This start has no pickers of its own — it runs on what the new-session
    // form was last set to, effort included, since the level was chosen against
    // that same model.
    const level = spawnPrefs.effort;
    const prompt = spawnPrompt.trim() || undefined;
    const instanceId = spawnSession({
      machineId: project.machineId,
      cwd: project.cwd,
      projectId: project.id,
      permissionMode: perm,
      harness: spawnPrefs.harness,
      model: mod,
      effort: level ?? undefined,
      prompt,
      scratch: scratch ? {} : undefined,
    });
    rememberSpawn({
      harness: spawnPrefs.harness,
      model: mod,
      permissionMode: perm,
      effort: level,
    });
    // The button that started it departed as `session:new`; the tab to land
    // it is this session's.
    handOver("session:new", `session:${instanceId}`);
    spawnPrompt = "";
    spawnOpen = false;
    // biome-ignore lint/complexity/noVoid: fire-and-forget navigation after the spawn already succeeded
    void goto(conversationHref(instanceId, cawco.instanceIndex));
  }

  async function forget() {
    if (!project) {
      return;
    }
    forgetting = true;
    forgotten = false;
    try {
      await deleteProject(project.id);
      forgotten = true;
      forgetOpen = false;
    } finally {
      forgetting = false;
    }
    // Back to the spoke the project was opened from; the project's row folds
    // out of the sidebar as its list drops it, and the dead page is not left
    // behind in the history.
    await goto(route.spoke, { replace: true });
  }
</script>

<svelte:head>
  <title>{project?.name ?? "Project"} &middot; CawCo</title>
</svelte:head>

{#snippet skeletonRows(
  rows: number
)}
  {#each count(rows) as i (i)}
    <div class="flex min-h-9 items-center gap-3 px-4 py-1.5">
      <Skeleton class="size-5 shrink-0 rounded-[var(--radius-xs)]" />
      <Skeleton class="h-3 max-w-40 flex-1" />
      <Skeleton class="ml-auto h-3 w-10 shrink-0" />
    </div>
  {/each}
{/snippet}

{#if !project}
  <div class="flex flex-1 items-center justify-center">
    <p class="text-body text-muted-foreground">No such project.</p>
  </div>
{:else}
  <div class="flex h-full flex-1 flex-col overflow-hidden">
    <!-- Header -->
    <header class="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 pt-6 pb-4">
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h1 class="text-title">{project.name}</h1>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span class="truncate font-mono text-label text-muted-foreground"
            >{project.cwd}</span
          >
          {#if machine}
            <span class="flex items-center gap-1.5">
              <OsMark class="size-4 text-muted-foreground" os={machine.os} />
              <span class="text-label text-muted-foreground">
                {machineLabel(machine.hostname)}
              </span>
              <span
                class="size-2 shrink-0 rounded-full transition-[background-color] duration-(--dur-panel) ease-(--ease-out) {machine.status ===
                "online"
                  ? "bg-success"
                  : "bg-muted-foreground/40"}"
                title={machine.status}
              ></span>
            </span>
          {:else if !cawco.fleetRead}
            <Skeleton class="h-4 w-32" />
          {/if}
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Popover.Root bind:open={spawnOpen}>
          <Popover.Trigger>
            {#snippet child({
              props,
            })}
              <Button {...props} class="pressable">New session</Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content align="end" class="w-80 p-0">
            <form
              class="flex flex-col gap-3 p-4"
              onsubmit={(e) => {
                e.preventDefault();
                startSession(false);
              }}
            >
              <!-- biome-ignore lint/a11y/noLabelWithoutControl: the <Input> component renders a native input as its only child; Biome can't see through the component boundary -->
              <label
                class="flex flex-col gap-1 text-meta text-muted-foreground"
              >
                First prompt (optional)
                <Input
                  autocomplete="off"
                  class="text-label"
                  placeholder="What should this session do?"
                  spellcheck="false"
                  bind:value={spawnPrompt}
                />
              </label>
              <div class="flex items-center justify-end gap-2">
                <!-- The session each start opens lands in its tab from the
                     button that started it. -->
                <Button
                  data-share="session:new"
                  data-share-ttl="8000"
                  onclick={() => startSession(false)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Start empty
                </Button>
                <Button
                  data-share="session:new"
                  data-share-ttl="8000"
                  size="sm"
                  type="submit"
                  >Start</Button
                >
              </div>
            </form>
          </Popover.Content>
        </Popover.Root>
        <Button
          class="pressable"
          data-share="session:new"
          data-share-ttl="8000"
          onclick={() => startSession(true)}
          variant="outline"
        >
          Side quest
        </Button>
        <AlertDialog.Root bind:open={forgetOpen}>
          <AlertDialog.Trigger>
            {#snippet child({
              props,
            })}
              <Button
                {...props}
                class="text-muted-foreground"
                data-share="forget:{project.id}"
                variant="ghost"
              >
                Forget project&hellip;
              </Button>
            {/snippet}
          </AlertDialog.Trigger>
          <!-- Opens out of the button that asked for it. -->
          <AlertDialog.Content
            {@attach land(() => `forget:${project?.id}`, { uniform: true })}
          >
            <AlertDialog.Header>
              <AlertDialog.Title>Forget {project.name}?</AlertDialog.Title>
              <AlertDialog.Description>
                The grouping is removed. The checkout and its sessions stay on
                disk.
              </AlertDialog.Description>
            </AlertDialog.Header>
            <AlertDialog.Footer>
              <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
              <AlertDialog.Action>
                {#snippet child({
                  props,
                })}
                  <Button
                    {...props}
                    failed={!forgotten}
                    label="Forget"
                    onclick={forget}
                    pending={forgetting}
                    pendingLabel="Forgetting…"
                  />
                {/snippet}
              </AlertDialog.Action>
            </AlertDialog.Footer>
          </AlertDialog.Content>
        </AlertDialog.Root>
      </div>
    </header>

    <!-- Body: columns at >=768 -->
    <div
      class="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 pb-6 lg:flex-row lg:gap-6 lg:overflow-hidden"
    >
      <!-- Main column: docs -->
      <!-- p/-m 1px: at lg+ this column is the scrollport, and a card flush with
           its edge would lose the ring-1 it draws outside its border box. -->
      <div
        class="flex min-w-0 flex-1 flex-col gap-4 lg:-m-px lg:overflow-y-auto lg:p-px"
      >
        <!-- Phone: the docs are a Select. From 768: the kit's segmented
             control, across the reader, and down a column beside it at xl.
             With no doc to open, the same shape says why. -->
        <Tabs.Root
          class="min-h-0 flex-1 gap-4 xl:flex-row xl:data-[orientation=horizontal]:flex-row"
          onValueChange={(val) => {
            const doc = docs?.find((d) => d.path === val);
            if (doc) {
              // biome-ignore lint/complexity/noVoid: fire-and-forget — openDoc manages its own loading state
              void openDoc(doc);
            }
          }}
          orientation={docsColumn.current ? "vertical" : "horizontal"}
          value={open?.path ?? ""}
        >
          <div class="block md:hidden">
            {#if docs?.length}
              <Select.Root
                onValueChange={(val) => {
                  const doc = docs?.find((d) => d.path === val);
                  if (doc) {
                    // biome-ignore lint/complexity/noVoid: fire-and-forget — openDoc manages its own loading state
                    void openDoc(doc);
                  }
                }}
                type="single"
                value={open?.path ?? ""}
              >
                <Select.Trigger
                  class="w-full font-mono text-label"
                  press="tint"
                >
                  {open?.name ?? "Select a document"}
                </Select.Trigger>
                <Select.Content>
                  {#each docs as doc (doc.path)}
                    <Select.Item class="font-mono text-label" value={doc.path}
                      >{doc.name}</Select.Item
                    >
                  {/each}
                </Select.Content>
              </Select.Root>
            {:else if docs || docsError}
              <p class="flex h-9 items-center text-label text-muted-foreground">
                {docsStatus}
              </p>
            {:else}
              <Skeleton class="h-9 w-full rounded-md" />
            {/if}
          </div>

          <div
            class="hidden shrink-0 items-start overflow-x-auto md:flex xl:w-48 xl:overflow-x-visible"
          >
            {#if docs?.length}
              <Tabs.List
                aria-label="Project docs"
                class="xl:flex xl:w-full xl:flex-col xl:items-stretch"
              >
                {#each docs as doc (doc.path)}
                  <Tabs.Trigger
                    class="min-w-0 flex-none font-mono xl:justify-start"
                    title={doc.name}
                    value={doc.path}
                  >
                    <span class="truncate">{doc.name}</span>
                  </Tabs.Trigger>
                {/each}
              </Tabs.List>
            {:else if docs || docsError}
              <p class="flex h-9 items-center text-label text-muted-foreground">
                {docsStatus}
              </p>
            {:else}
              <div
                aria-hidden="true"
                class="kit-segmented xl:flex xl:w-full xl:flex-col xl:items-stretch"
              >
                {#each count(5) as i (i)}
                  <Skeleton class="h-[30px] w-24 xl:w-full" />
                {/each}
              </div>
            {/if}
          </div>

          <div class="flex min-w-0 flex-1 flex-col">
            <Card
              aria-busy={!docsRead}
              class="gap-0 rounded-[var(--radius-lg)] py-0 shadow-md"
            >
              <header
                class="flex min-h-[calc(30px+var(--space-2)*2)] items-center gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-2)]"
              >
                {#if open && docsRead}
                  <span
                    class="min-w-0 truncate font-mono text-label text-muted-foreground"
                    >{open.name}</span
                  >
                {:else if docsError}
                  <span
                    class="min-w-0 truncate text-label text-muted-foreground"
                    >Docs</span
                  >
                {:else if docs?.length === 0}
                  <span
                    class="min-w-0 truncate font-mono text-label text-muted-foreground"
                    >README.md — not in this checkout</span
                  >
                {:else}
                  <Skeleton class="h-3.5 w-32" />
                {/if}
                {#if docError}
                  <ErrorText
                    class="text-label text-error"
                    message={docError}
                    title="Error with {open?.name ?? "the document"}"
                  />
                {/if}
                {#if docs === null && !docsError}
                  <Skeleton class="ml-auto h-[30px] w-[50px] shrink-0" />
                {:else if !open}
                  <!-- No doc to edit. -->
                {:else if !docsRead}
                  <Skeleton class="ml-auto h-[30px] w-[50px] shrink-0" />
                {:else if draft === null}
                  <Button
                    class="ml-auto shrink-0"
                    onclick={() =>
                      reshape(() => {
                        draft = content;
                      })}
                    size="sm"
                    variant="outline"
                  >
                    Edit
                  </Button>
                {:else}
                  <Button
                    class="ml-auto shrink-0"
                    onclick={() =>
                      reshape(() => {
                        draft = null;
                      })}
                    size="sm"
                    variant="ghost"
                  >
                    Cancel
                  </Button>
                  <Button
                    class="shrink-0"
                    failed={docError !== null}
                    label="Save"
                    onclick={save}
                    pending={saving}
                    pendingLabel="Saving…"
                    size="sm"
                    variant="outline"
                  />
                {/if}
              </header>
              <div class="relative border-t border-border" bind:this={bodyBox}>
                {#key view}
                  <div
                    class="min-w-0"
                    style:min-height={draft === null ? PANE : null}
                    in:crossIn
                    out:crossOut
                  >
                    {#if docsError}
                      <div
                        class="px-[var(--space-6)] py-[var(--space-4)] md:px-[var(--space-7)]"
                      >
                        <Alert variant="warning">
                          <AlertDescription>{docsError}</AlertDescription>
                        </Alert>
                      </div>
                    {:else if docs?.length === 0}
                      <EmptyState
                        class="px-[var(--space-6)] md:px-[var(--space-7)]"
                        icon={IconDocument}
                        line="Add a README.md at the top of the checkout and it shows up here."
                        title="No markdown yet"
                      />
                    {:else if shown === null}
                      <!-- The size the document will stand at, clamped,
                             with the row its Read more takes. -->
                      <div
                        aria-hidden="true"
                        class="flex flex-col gap-3 overflow-hidden px-[var(--space-6)] py-[var(--space-4)] md:px-[var(--space-7)]"
                        style:height={COLLAPSED_DOC}
                      >
                        <Skeleton class="mb-3 h-6 w-2/5" />
                        {#each count(3) as block (block)}
                          <Skeleton class="h-3.5 w-full max-w-[72ch]" />
                          <Skeleton class="h-3.5 w-full max-w-[72ch]" />
                          <Skeleton class="h-3.5 w-11/12 max-w-[72ch]" />
                          <Skeleton class="mb-5 h-3.5 w-3/5" />
                        {/each}
                      </div>
                      <div class="min-h-9"></div>
                    {:else if draft === null}
                      <!-- Read to a line boundary and stop: the collapsed
                             height is a whole number of prose lines, and the
                             last one fades out rather than being sliced
                             through by the card's edge. -->
                      <div class="relative">
                        <div
                          class="overflow-y-auto px-[var(--space-6)] py-[var(--space-4)] md:px-[var(--space-7)]"
                          bind:this={docBody}
                          style:max-height={expanded ? "70vh" : COLLAPSED_DOC}
                          {@attach measureClip}
                        >
                          <div
                            class="prose prose-sm dark:prose-invert max-w-[72ch]"
                          >
                            <Markdown source={content} />
                          </div>
                        </div>
                        {#if !expanded && clipped}
                          <div
                            class="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-b from-transparent to-card"
                          ></div>
                        {/if}
                      </div>
                      {#if clipped || expanded}
                        <button
                          class="press-tint flex min-h-9 w-full items-center justify-center rounded-b-[var(--radius-lg)] text-label
                              transition-colors hover:bg-accent hover:text-foreground"
                          onclick={toggleExpanded}
                          type="button"
                        >
                          {expanded ? "Show less" : "Read more"}
                        </button>
                      {/if}
                    {:else}
                      <Textarea
                        aria-label={open?.name}
                        class="h-[60vh] min-h-0 rounded-none border-0 bg-transparent px-[var(--space-6)] py-[var(--space-4)] font-mono text-[length:var(--text-label)] text-foreground md:px-[var(--space-7)]"
                        spellcheck="false"
                        bind:value={draft}
                      />
                    {/if}
                  </div>
                {/key}
              </div>
            </Card>
          </div>
        </Tabs.Root>
      </div>

      <!-- Right rail (320-380px on lg; stacked on mobile) -->
      <!-- p/-m 1px for the same reason as the docs column: this rail is the
           scrollport at lg+, and it holds the CLAUDE.md MemoryCard. -->
      <aside
        class="mt-6 flex w-full shrink-0 flex-col gap-4 lg:-m-px lg:mt-0 lg:w-[340px] lg:overflow-y-auto lg:p-px xl:w-[360px]"
      >
        <!-- Sized cards first, the open-ended list last. What the rail
             holds above the sessions is one size from the first frame (the
             machine comes with the page; CLAUDE.md is two lines in every
             state), and the sessions, whose count only the machine knows,
             grow into the space below them, where nothing stands to be
             pushed. -->
        <!-- CLAUDE.md. The file itself reads in the docs viewer beside this,
         which is where a 360px rail cannot compete — so the rail only says
         it is there and opens the editor. One reader on screen. -->
        <MemoryCard
          content={claude}
          emptyText={claudeOnline
            ? "No CLAUDE.md in this project — click to create it."
            : `No machine online — ${machine ? machineLabel(machine.hostname) : project.machineId} has to be up to read this file.`}
          loading={!claudeRead}
          path="CLAUDE.md"
          save={claudeOnline ? saveClaude : undefined}
          summary="Project memory — every session started here reads it."
          bind:editing={claudeEditing}
        >
          {#snippet meta()}
            {#if claudeError}
              <ErrorText
                class="text-label text-error"
                message={claudeError}
                title="Error with CLAUDE.md"
              />
            {/if}
          {/snippet}
          {#snippet footer()}
            {#if claudeEditing}
              <p
                class="border-t border-border px-4 py-2 text-label text-muted-foreground"
              >
                This file is the repo's own — commit it to share it. Git is its
                sync; CawCo does not replicate it.
              </p>
            {/if}
          {/snippet}
        </MemoryCard>

        <!-- Machine inventory -->
        {#if project && machine}
          <MachineInventory
            kind="mcp"
            machines={machine ? [machine] : []}
            taken={[]}
          />
        {/if}
        <!-- Sessions -->
        <Card
          aria-busy={!storedRead}
          class="gap-0 rounded-[var(--radius-lg)] py-0 shadow-md"
        >
          <header class="px-[var(--space-4)] py-[var(--space-3)]">
            <h2 class="text-title">Sessions</h2>
          </header>
          <div
            class="flex flex-col gap-1.5 px-[var(--space-3)] pb-[var(--space-3)]"
            {@attach highlight({ rows: "a" })}
            {@attach rowsWatched && reflow()}
          >
            <!-- Each answer takes the place of the skeleton that stood for it:
                 a branch arrives after the one it replaces, so the leaving
                 skeleton is pinned where it stood (crossOut) and nothing
                 already drawn moves. -->
            {#if liveRead}
              <div class="flex flex-col gap-1.5" in:crossIn>
                <!-- Sessions start and stop all day: a row that arrives or
                     leaves opens or closes in place and the rows after it
                     slide (motion/rows), as the sidebar's do. -->
                {#each liveShown as instance (instance.id)}
                  <div data-flip>
                    <LiveSessionRow groupCwd={project.cwd} {instance} />
                  </div>
                {/each}
                {#if storedRead}
                  <div class="flex flex-col gap-1.5" in:crossIn>
                    {#each storedShown as info (info.sessionId)}
                      <div data-flip>
                        <StoredSessionRow
                          groupCwd={project.cwd}
                          {info}
                          machineId={project.machineId}
                        />
                      </div>
                    {:else}
                      {#if live.length === 0}
                        <EmptyState
                          class="px-1"
                          icon={IconChat}
                          line="Nothing is running in this project, and nothing has been recorded."
                          title="No sessions yet"
                        />
                      {/if}
                    {/each}
                  </div>
                  {#if !showMore && stored.length > STORED_FIRST}
                    <Button
                      class="self-start text-muted-foreground"
                      onclick={() => {
                        showMore = true;
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      Show {stored.length - STORED_FIRST} more
                    </Button>
                  {/if}
                {:else}
                  <div
                    aria-hidden="true"
                    class="flex flex-col gap-1.5"
                    out:crossOut
                  >
                    {@render skeletonRows(SESSION_SKELETON)}
                  </div>
                {/if}
              </div>
            {:else}
              <div
                aria-hidden="true"
                class="flex flex-col gap-1.5"
                out:crossOut
              >
                {@render skeletonRows(SESSION_SKELETON)}
              </div>
            {/if}
          </div>
        </Card>
      </aside>
    </div>
  </div>
{/if}
