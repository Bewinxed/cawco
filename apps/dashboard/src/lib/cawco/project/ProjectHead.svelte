<script lang="ts" module>
  import { SvelteSet } from "svelte/reactivity";

  /**
   * The projects whose details tray stands. Kept past the head: on a phone a
   * task opens as its own page, and Back finds the tray where it was (The
   * Open Page Rule: the surface waits).
   */
  const standing = new SvelteSet<string>();
</script>

<script lang="ts">
  import { machineLabel } from "@cawco/core/machine-names";
  import {
    UPSTREAM_WORDS,
    type UpstreamPosts,
    upstreamPostsWords,
  } from "@cawco/core/upstream-guard";
  /**
   * The project's head: one row at every width, nothing wraps (DESIGN.md,
   * The Title Bars Follow Liquid Glass Rule: "One bar, one row"), as tall as
   * Caw's 48px seat, every control centred on it.
   *
   * Leading, the name, renamed where it stands, on one line that ends in an
   * ellipsis; then the place, a bare item of the top bar's recipe (DESIGN.md,
   * Top bar's trailing edge): the primary checkout's machine as its OS mark,
   * or the folder while the project's one place is its folder on the hub,
   * named in its tooltip ("A place shown as a place … A path is never
   * printed in a bar"). A press unfolds the project's details under the head
   * (ProjectDetails), and again folds them. Caw's words are not in the head:
   * his seat's face, his panel and Needs you carry them.
   *
   * Trailing, Caw at 48px, at the head's end so the name's start edge stays
   * where it is when he stands over the empty board instead; then one glass
   * capsule (the kit's BarGlass, `form="group"`) of bare symbols, each named
   * in its tooltip: Ask Caw (his panel on a new conversation, the caret in his
   * composer: work in a project starts by telling Caw, PRD §5.6), Spin off,
   * and More holding Pick stages (while the code stages stand in), Project
   * details…, Caw's settings (CawPanel, off More: a popover on a desk, the
   * bottom sheet on touch), Spend, Other people's repositories (the upstream
   * choice: the fleet's answer until the project picks its own) and Forget
   * (and, under 640px, Spin off, New task, Filter tasks… and Ask Caw for a
   * view), each with its glyph. Nothing in the head is on the coral: no view
   * of a project is for asking Caw (One prominent action, trailing). One tray
   * stands under the head at a time: the details or a forget.
   *
   * Under 640px the capsule holds More alone: Ask Caw is the "+" of the
   * page's views bar (ViewBar), which opens Caw's panel as this one does,
   * and Spin off is in More (Apple HIG, Toolbars: "Prioritize only the most
   * important items for inclusion in the main toolbar area … Create a More
   * menu to include additional items").
   *
   * With the board empty and events on, Caw stands over the empty board
   * instead (picks.md), and his slot here closes.
   */
  import { commonWords } from "@cawco/core/words/common";
  import { projectWords } from "@cawco/core/words/project";
  import { viewsWords } from "@cawco/core/words/views";
  import { mergeProps } from "bits-ui";
  import { type Snippet, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { Machine, ProjectRow } from "#lib/cawco/client.svelte.js";
  import { cawco, editProject } from "#lib/cawco/client.svelte.js";
  import ForgetProjectTray from "#lib/cawco/ForgetProjectTray.svelte";
  import { forgetHost, forgetProject } from "#lib/cawco/forget.svelte.js";
  import {
    failureClause,
    failureWords as message,
  } from "#lib/cawco/hub-read.js";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import UpstreamMenu from "#lib/cawco/project/UpstreamMenu.svelte";
  import { checkoutOf } from "#lib/cawco/projects.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { refusals } from "#lib/cawco/refusals.svelte.js";
  import { newSession, spawning } from "#lib/cawco/spawn/new-session.svelte.js";
  import { cawOffAt, stopWork } from "#lib/cawco/stop-work.svelte.js";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChatAdd,
    IconColumns,
    IconFilter,
    IconFolder,
    IconFork,
    IconInfo,
    IconMore,
    IconPlus,
    IconSettings,
    IconSparkles,
    IconTrash,
    IconUsage,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import CawPanel from "./CawPanel.svelte";
  import CawSeat from "./CawSeat.svelte";
  import type { CawLead } from "./caw-lead.svelte";
  import ProjectDetails from "./ProjectDetails.svelte";

  let {
    project,
    machine,
    lead,
    seated,
    onnewtask,
    onask,
    onfilter,
    onstages,
    detailsAfterChecks,
  }: {
    /** Filter the tasks, from the menu on a phone, where the strip has no room for it. */
    onfilter: (anchor: HTMLElement) => void;
    project: ProjectRow;
    machine: Machine | null;
    lead: CawLead;
    /** Caw sits here; off while he stands over the empty board. */
    seated: boolean;
    onnewtask: () => void;
    /** Ask Caw for a view, from the menu; null while Caw can't start. */
    onask: ((anchor: HTMLElement) => void) | null;
    /** Pick the project's stages, from the menu; null once it has its own. */
    onstages: ((anchor: HTMLElement) => void) | null;
    /** Rows the details show under Merge checks (ProjectDetails). */
    detailsAfterChecks?: Snippet;
  } = $props();

  const narrow = new MediaQuery("(max-width: 639px)");
  /** Caw's settings rise as the bottom sheet on touch, as the head's other sheets do. */
  const touch = new MediaQuery(
    "(hover: none), (pointer: coarse), (max-width: 640px)"
  );
  /**
   * Caw's settings stand open: open again after a reload while his off
   * tray stands in them (stop-work.svelte.ts), so it comes back where it was.
   */
  let cawOpen = $state(
    untrack(() => {
      const off = stopWork.of("caw-off", project.id);
      return off?.open === true && off.at === cawOffAt(project.id);
    })
  );
  let more = $state<HTMLElement | null>(null);
  /** The place a forget asked from this head's More stands (forget.svelte.ts). */
  const forgetAt = $derived(`head:${project.id}`);

  /** Its primary checkout; none while its one place is its folder on the hub. */
  const primary = $derived(checkoutOf(project));
  /**
   * Where the project lives, its machine and folder (place), said
   * in the details it opens; the head draws it as a place, never its path.
   */
  const place = $derived.by(() => {
    if (!primary) {
      return projectWords.hubFolder;
    }
    return machine
      ? `${machineLabel(machine.hostname)} · ${primary.path}`
      : primary.path;
  });
  /** The place's tooltip: its machine's name, or the hub's folder. */
  const placeTip = $derived.by(() => {
    if (!primary) {
      return projectWords.hubFolder;
    }
    return machine ? machineLabel(machine.hostname) : projectWords.details;
  });

  /**
   * The project's details stand under the head (ProjectDetails). One tray
   * stands under the head at a time, so a forget asked here gives way to
   * them and they give way to a forget.
   */
  const details = $derived(standing.has(project.id));
  /** The place that opens them: Escape and Done hand the focus back to it. */
  let placeLine = $state<HTMLButtonElement | null>(null);

  function openDetails(): void {
    if (forgetHost.at === forgetAt) {
      forgetHost.close();
    }
    // A forget's tray standing here gives way too; stops under way park.
    const forgetting = stopWork.of("forget", project.id);
    if (forgetting?.open && forgetting.at === forgetAt) {
      stopWork.dismiss(forgetting);
    }
    standing.add(project.id);
  }

  function closeDetails(): void {
    const hadFocus = document.activeElement?.closest("[data-project-details]");
    standing.delete(project.id);
    if (hadFocus) {
      placeLine?.focus();
    }
  }

  // A forget asked here: the details give way to it.
  $effect.pre(() => {
    if (forgetHost.at === forgetAt) {
      untrack(() => standing.delete(project.id));
    }
  });

  /**
   * His slot opens and closes over --dur-panel on --ease-in-out as he comes
   * and goes; the capsule beside it slides with its width.
   */
  function slot(node: Element) {
    const width = (node as HTMLElement).offsetWidth;
    if (!motionOk.current) {
      return {
        duration: dur("--dur-fade"),
        css: (t: number) => `opacity:${t}`,
      };
    }
    return {
      duration: dur("--dur-panel"),
      easing: easeInOut,
      css: (t: number) => `inline-size:${t * width}px;opacity:${t}`,
    };
  }

  /**
   * The name is edited where it stands: a press on it turns it into a field
   * of the same type, size and place, holding the name. Enter, or leaving
   * it, sends it; the field stays, read-only, until the project is named by
   * it, and Escape puts the name back. A refusal leaves what was typed in
   * the field and the hub's words under it.
   */
  let draft = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let renameFault = $state<string | null>(null);

  function editName(): void {
    draft = project.name;
    renameFault = null;
  }

  function stopEditing(): void {
    draft = null;
    renaming = null;
    renameFault = null;
  }

  async function commitName(): Promise<void> {
    if (draft === null || renaming !== null) {
      return;
    }
    const next = draft.trim();
    if (next === project.name) {
      stopEditing();
      return;
    }
    renaming = next;
    renameFault = null;
    try {
      await editProject(project.id, { name: next });
    } catch (error) {
      renaming = null;
      renameFault = message(error);
    }
  }

  /**
   * What the hub refused of the upstream choice, said under the head where
   * the More that asked stands, with Try again; never a toast (DESIGN.md, The
   * Work Outlives Its Surface Rule).
   */
  const upstreamKey = $derived(`upstream:${project.id}`);
  const upstreamFault = $derived(refusals.get(upstreamKey));

  /** The project's own upstream answer, or null for the fleet's (UpstreamMenu). */
  async function setUpstream(posts: UpstreamPosts | null): Promise<void> {
    refusals.delete(upstreamKey);
    try {
      await editProject(project.id, { upstreamPosts: posts });
    } catch (error) {
      const asked = posts ? upstreamPostsWords(posts) : UPSTREAM_WORDS.inherit;
      refusals.set(upstreamKey, {
        reason: `${UPSTREAM_WORDS.title} was not set to “${asked}”: ${failureClause(error)}. It stays as it was.`,
        asked: posts,
      });
    }
  }

  // Named: the field gives way to the name it sent.
  $effect.pre(() => {
    if (renaming !== null && project.name === renaming) {
      stopEditing();
    }
  });

  // Another project's page: its name is not this one's draft.
  let editedId: string | undefined;
  $effect.pre(() => {
    if (editedId !== undefined && project.id !== editedId) {
      stopEditing();
    }
    editedId = project.id;
  });

  /**
   * Spin off: the New Session form at `trigger` (its symbol, or More on a
   * phone, where the menu holds it), as a spin-off on the project's
   * checkout. Harness, model and mode are the form's own: the mode the
   * person last started in, and with none, Start says it waits for one.
   */
  function spinOff(trigger: HTMLElement | null) {
    if (!(primary && trigger)) {
      return;
    }
    newSession(
      {
        machineId: primary.machineId,
        cwd: primary.path,
        projectId: project.id,
        spinOff: true,
      },
      trigger
    );
  }
</script>

<header
  data-slot="project-head"
  class="flex flex-nowrap items-center gap-x-space-4 min-h-c-project-head-h pt-space-6 pe-space-6 pb-space-4 ps-space-7 max-desk:pt-space-5 max-desk:pe-space-5 max-desk:pb-space-3 max-desk:ps-space-5"
>
  <!-- Leading: the name, then the place. The pair is as wide as it holds
       and gives way first: the name ends in its ellipsis before anything
       trailing moves. While the name is a field the pair takes the row's
       room, so the field has it to type in. -->
  <div
    data-slot="who"
    class="flex min-w-0 shrink items-center gap-space-3 has-data-field:grow"
  >
    <!-- The name bleeds space-1 past the page's edge on each side (its tint
         and field): the title takes both bleeds into its own box, so the
         name fills it whole and nothing stands outside the title. Its ring
         sits inside the name's box, which the title clips to one line. -->
    <h1
      data-slot="title"
      class="-mx-space-1 min-w-0 shrink grow truncate type-title text-ink-strong"
    >
      {#if draft !== null}
        <!-- svelte-ignore a11y_autofocus: the field opens on the person's own Rename, and takes the focus they asked for -->
        <input
          data-slot="name"
          data-field
          aria-label="Project name"
          autocomplete="off"
          autofocus
          class="field-edge block w-full overflow-hidden text-ellipsis cursor-text rounded-xs border border-border-control bg-surface-raised px-space-1 font-inherit text-start text-inherit transition-control read-only:text-ink-muted"
          onblur={() => {
            // Left after a refusal, it stays as typed, the reason under
            // the head; Enter or Try again sends it.
            if (renameFault === null) {
              commitName();
            }
          }}
          onkeydown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitName();
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              stopEditing();
            }
          }}
          readonly={renaming !== null}
          spellcheck="false"
          bind:value={draft}
          {@attach (node) => node.select()}
        />
      {:else}
        <button
          data-slot="name"
          class="select-none press-tint block max-w-full overflow-hidden text-ellipsis cursor-text rounded-xs border border-transparent bg-transparent px-space-1 font-inherit text-start text-inherit transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover focus-visible:outline-offset-(--focus-ring-inset)"
          onclick={editName}
          title="Rename {project.name}"
          type="button"
        >
          {project.name}
        </button>
      {/if}
    </h1>
    <!-- The place, a bare item of the top bar's recipe (app.css, the bar's
         glass group): its machine's mark, or the hub's folder, named in its
         tooltip. The project's details unfold under the head. -->
    <Tip label={placeTip}>
      {#snippet children(tip)}
        <button
          data-bar-item
          data-box
          data-place-line
          {...mergeProps(tip, {
            onclick: () => {
              if (details) {
                closeDetails();
              } else {
                openDetails();
              }
            },
          })}
          aria-expanded={details}
          aria-label={projectWords.details}
          class="select-none touch-hit press-tint"
          type="button"
          bind:this={placeLine}
        >
          {#if primary && machine}
            <OsMark class="size-c-bar-symbol text-ink-muted" os={machine.os} />
          {:else}
            <IconFolder data-slot="bar-symbol" aria-hidden="true" />
          {/if}
        </button>
      {/snippet}
    </Tip>
  </div>
  <div data-slot="acts" class="ms-auto flex flex-none items-center gap-space-2">
    <!-- He sits at the head's end, by the capsule, so the name's start edge
         is the same whether he sits here or stands over the empty board.
         His seat holds its place while he is read; a read the hub refused
         draws no one, so no empty seat stands by the capsule. -->
    {#if seated && !(lead.refused !== null && lead.project === null)}
      <div data-slot="seat" class="flex-none" transition:slot>
        <CawSeat {lead} projectId={project.id} projectName={project.name} />
      </div>
    {/if}
    <!-- One capsule of the panel's glass, the top bar's trailing group its
         recipe: bare symbols, each named for a screen reader and in its
         tooltip. Under 640px it holds More alone. -->
    <BarGlass form="group">
      <!-- New work starts by telling Caw (PRD §5.6): his panel on a new
           conversation, the caret in his composer. -->
      <Tip label={projectWords.askCaw}>
        {#snippet children(tip)}
          <button
            data-bar-item
            data-box
            data-new-session
            {...mergeProps(tip, { onclick: () => lead.newConversation() })}
            aria-label={projectWords.askCaw}
            class="select-none touch-hit press-tint max-phone:hidden"
            type="button"
          >
            <IconChatAdd data-slot="bar-symbol" aria-hidden="true" />
          </button>
        {/snippet}
      </Tip>
      {#if primary}
        <Tip label={projectWords.spinOff}>
          {#snippet children(tip)}
            <button
              data-bar-item
              data-box
              data-spin-off
              {...mergeProps(tip, {
                onclick: (event: MouseEvent) =>
                  spinOff(event.currentTarget as HTMLElement),
              })}
              aria-haspopup="dialog"
              aria-label={projectWords.spinOff}
              class="select-none touch-hit press-tint max-phone:hidden"
              type="button"
            >
              <IconFork data-slot="bar-symbol" aria-hidden="true" />
            </button>
          {/snippet}
        </Tip>
      {/if}
      <DropdownMenu.Root>
        <Tip label={commonWords.moreFor(project.name)}>
          {#snippet children(tip)}
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <button
                  data-bar-item
                  data-box
                  data-head-more
                  {...mergeProps(tip, props)}
                  aria-label={commonWords.moreFor(project.name)}
                  class="select-none touch-hit press-tint"
                  type="button"
                  bind:this={more}
                >
                  <IconMore data-slot="bar-symbol" aria-hidden="true" />
                </button>
              {/snippet}
            </DropdownMenu.Trigger>
          {/snippet}
        </Tip>
        <!-- A forget asked here keeps the focus its tray took, and the New
             Session form a Spin off opened keeps the focus it took: the menu
             doesn't hand it back to More as it closes. -->
        <DropdownMenu.Content
          align="end"
          width="regular"
          onCloseAutoFocus={(event) => {
            if (forgetHost.at === forgetAt || spawning.open) {
              event.preventDefault();
            }
          }}
        >
          {#if narrow.current}
            {#if primary}
              <DropdownMenu.Item onSelect={() => spinOff(more)}>
                <IconFork />
                <span>{projectWords.spinOff}</span>
              </DropdownMenu.Item>
            {/if}
            <DropdownMenu.Item onSelect={onnewtask}>
              <IconPlus />
              <span>New task</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item
              onSelect={() => {
                if (more) {
                  onfilter(more);
                }
              }}
            >
              <IconFilter />
              <span>Filter tasks…</span>
            </DropdownMenu.Item>
            {#if onask}
              <DropdownMenu.Item
                onSelect={() => {
                  if (more) {
                    onask?.(more);
                  }
                }}
              >
                <IconSparkles />
                <span>{viewsWords.ask}</span>
              </DropdownMenu.Item>
            {/if}
            <DropdownMenu.Separator />
          {/if}
          {#if onstages}
            <DropdownMenu.Item
              onSelect={() => {
                if (more) {
                  onstages?.(more);
                }
              }}
            >
              <IconColumns />
              <span>{projectWords.pickStages}</span>
            </DropdownMenu.Item>
          {/if}
          <DropdownMenu.Item onSelect={() => openDetails()}>
            <IconInfo />
            <span>{projectWords.projectDetails}</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => {
              cawOpen = true;
            }}
          >
            <IconSettings />
            <span>{projectWords.cawSettings}</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() =>
              goto(`/usage?project=${encodeURIComponent(project.id)}`)}
          >
            <IconUsage />
            <span>Spend</span>
          </DropdownMenu.Item>
          <!-- The upstream choice: the fleet's answer until the project picks
                 its own; every workspace of it judges by it from its next beat. -->
          <UpstreamMenu
            fleet={cawco.fleetUpstream}
            onchange={setUpstream}
            posts={project.upstreamPosts}
          />
          <!-- The one destructive row, as every menu draws one: the house's
                 destructive item, set apart at the end. -->
          <DropdownMenu.Separator />
          <!-- The forget unfolds under this head (forget.svelte.ts). -->
          <DropdownMenu.Item
            onSelect={() => forgetProject(project, forgetAt)}
            variant="destructive"
          >
            <IconTrash />
            <span>{projectWords.forgetProject}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </BarGlass>
  </div>
</header>
<!-- What the hub refused, under the head as a line of its own, in its
     words: a rename, and the upstream choice its More asked. -->
<div
  data-slot="head-faults"
  class="ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5"
>
  <RowFault again={commitName} reason={renameFault} />
  <RowFault
    again={() =>
      setUpstream((upstreamFault?.asked as UpstreamPosts | null) ?? null)}
    data-upstream-refusal
    reason={upstreamFault?.reason}
  />
</div>
<!-- Caw's settings, off More: the project's own, beside its other settings. -->
{#if touch.current}
  <Drawer.Root bind:open={cawOpen}>
    <!-- The recipe's foot: 16px plus the safe area (DESIGN.md, Drawer). -->
    <Drawer.Content title={`Caw, ${project.name}`}>
      <CawPanel
        {lead}
        projectId={project.id}
        projectName={project.name}
        sheet
      />
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Popover.Root bind:open={cawOpen}>
    <Popover.Content
      align="end"
      aria-label="Caw, {project.name}"
      class="w-(--settings-w) max-desk:w-(--settings-w-narrow)"
      pad="inset"
      style="--settings-w: min(var(--c-panel-w), calc(100vw - var(--space-7))); --settings-w-narrow: min(var(--c-panel-w), calc(100vw - var(--space-3) - env(safe-area-inset-right, 0px)))"
      collisionPadding={12}
      customAnchor={more}
      side="bottom"
      sideOffset={4}
    >
      <CawPanel {lead} projectId={project.id} projectName={project.name} />
    </Popover.Content>
  </Popover.Root>
{/if}
<!-- The project's details, under the head, from where its title starts. -->
{#if details}
  <ProjectDetails
    afterChecks={detailsAfterChecks}
    {lead}
    {machine}
    onclose={closeDetails}
    {place}
    {project}
  />
{/if}
<!-- A forget asked from More, under the head, from where its title starts. -->
<!-- The tray on the page's gutters: 25px in at the start (18 under the desk
     line, DESIGN.md L643) and 18 at the end, so it never meets the screen. -->
<div
  data-slot="project-forget"
  class="contents"
  style:--ask-end="var(--space-5)"
>
  <ForgetProjectTray
    at={forgetAt}
    projectId={project.id}
    class="tray-indent-space-7 max-w-128 max-desk:tray-indent-space-5"
  />
</div>
