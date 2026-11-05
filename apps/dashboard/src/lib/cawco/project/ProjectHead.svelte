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
  /**
   * The project's head: one row at every width, nothing wraps (DESIGN.md,
   * The Title Bars Follow Liquid Glass Rule: "One bar, one row"), as tall as
   * Caw's 48px seat, every control centred on it.
   *
   * Leading, the name, renamed where it stands, on one line that ends in an
   * ellipsis; then the place, a bare BarItem as the top bar's glass holds
   * (GlassCard's surface brief, "The top bar's glass, Caw's head and its
   * cards"): the primary checkout's machine as its OS mark, or the folder
   * while the project's one place is its folder on the hub, named in its
   * tooltip (DESIGN.md, "A place shown as a place. … a path is never
   * printed in a bar"). A press unfolds the project's details under the head
   * (ProjectDetails), and again folds them. Caw's words are not in the head:
   * his seat's face, his panel and Needs you carry them.
   *
   * After the pair, the page's `views` (its views menu: the one place the
   * views are chosen), and at the trailing end the page's `tools` (Needs
   * you, the filter, New task), then Caw at 48px, at the head's end so the
   * name's start edge stays where it is when he stands over the empty board
   * instead: his seat is the one switch of his panel (the owner's rule 8),
   * so nothing else in the head opens him. Then one glass capsule (the kit's
   * BarGlass, `form="group"`) of bare symbols, each named in its tooltip:
   * Spin off, Full size, and More holding its setup (Finish setting it up
   * while it is not set up, Change how it runs once it is: the
   * project-setup skill's one page, through Caw), Ask Caw for a view (his
   * panel, the words going as a view request), Spend, then Forget and
   * Delete, each with its glyph. Caw's settings are his panel's own (its
   * bar), and the project's details are the place's: each is reached from
   * one place (rule 4). Nothing in the head is on the coral. One tray
   * stands under the head at a time: the details or an end.
   *
   * Where the head itself is under 640px wide (a phone, a narrow split: it
   * measures its own box), More also holds Spin off, New task, Filter
   * tasks…, Project details (the place's own press, which steps out of the
   * row with Full size so the name keeps its room) and Full size, and
   * `tools` is drawn compact (Apple HIG, Toolbars: "Prioritize
   * only the most important items for inclusion in the main toolbar area …
   * Create a More menu to include additional items").
   *
   * With the board empty and events on, Caw stands over the empty board
   * instead (picks.md), and his slot here closes.
   */
  import { commonWords } from "@cawco/core/words/common";
  import { projectWords } from "@cawco/core/words/project";
  import { projectEndWords } from "@cawco/core/words/project-ends";
  import { viewsWords } from "@cawco/core/words/views";
  import { type Snippet, untrack } from "svelte";
  import type { Machine, ProjectRow } from "#lib/cawco/client.svelte.js";
  import { editProject } from "#lib/cawco/client.svelte.js";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import ProjectEndTray from "#lib/cawco/ProjectEndTray.svelte";
  import { askEnd, endHost } from "#lib/cawco/project-end.svelte.js";
  import { checkoutOf } from "#lib/cawco/projects.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { newSession, spawning } from "#lib/cawco/spawn/new-session.svelte.js";
  import { stopWork } from "#lib/cawco/stop-work.svelte.js";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconArchive,
    IconColumns,
    IconDeleteForGood,
    IconFilter,
    IconFolder,
    IconFork,
    IconMaximize,
    IconMinimize,
    IconMore,
    IconPlus,
    IconSparkles,
    IconUsage,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import { fullSize } from "../workspace/full-size.svelte";
  import CawSeat from "./CawSeat.svelte";
  import type { CawLead } from "./caw-lead.svelte";
  import ProjectDetails from "./ProjectDetails.svelte";

  let {
    project,
    machine,
    lead,
    seated,
    onnewtask,
    onaskview,
    onfilter,
    setup,
    detailsAfterChecks,
    views,
    tools,
  }: {
    /** The page's views menu, after the name and the place; told whether the head is compact. */
    views?: Snippet<[boolean]>;
    /** What acts on the view, before Caw's seat; told whether the head is compact. */
    tools?: Snippet<[boolean]>;
    /** Filter the tasks, from the menu on a phone, where the strip has no room for it. */
    onfilter: (anchor: HTMLElement) => void;
    project: ProjectRow;
    machine: Machine | null;
    lead: CawLead;
    /** Caw sits here; off while he stands over the empty board. */
    seated: boolean;
    onnewtask: () => void;
    /** Ask Caw for a view, from the menu; null while Caw can't start. */
    onaskview: (() => void) | null;
    /** Its setup, from the menu: finish it, or change how it runs; null while Caw can't start. */
    setup: { label: string; run: () => void } | null;
    /** Rows the details show under Merge checks (ProjectDetails). */
    detailsAfterChecks?: Snippet;
  } = $props();

  /**
   * The head's own width is under 640px (a phone, a narrow split): More
   * takes Spin off, New task and the filter, and `tools` draws compact.
   */
  let compact = $state(false);
  const COMPACT_BELOW = 640;
  const measureHead = frameSize<HTMLElement>((node) => {
    compact = node.clientWidth < COMPACT_BELOW;
  });
  let more = $state<HTMLElement | null>(null);
  /** The place an end asked from this head's More stands (project-end.svelte.ts). */
  const endAt = $derived(`head:${project.id}`);

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
   * stands under the head at a time, so an end asked here gives way to
   * them and they give way to an end.
   */
  const details = $derived(standing.has(project.id));
  /** The place that opens them: Escape and Done hand the focus back to it. */
  let placeLine = $state<HTMLButtonElement | null>(null);

  function openDetails(): void {
    if (endHost.at === endAt) {
      endHost.close();
    }
    // An end's tray standing here gives way too; stops under way park.
    for (const kind of ["forget", "delete"] as const) {
      const ending = stopWork.of(kind, project.id);
      if (ending?.open && ending.at === endAt) {
        stopWork.dismiss(ending);
      }
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

  // An end asked here: the details give way to it.
  $effect.pre(() => {
    if (endHost.at === endAt) {
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
  data-compact={compact || undefined}
  {@attach measureHead}
  class="flex flex-none flex-nowrap items-center gap-x-space-4 min-h-c-project-head-h pt-space-6 pe-space-6 pb-space-4 ps-space-7 max-desk:pt-space-5 max-desk:pe-space-5 max-desk:pb-space-3 max-desk:ps-space-5"
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
          class="select-none touch-hit press-tint in-data-compact:hidden"
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
  {#if views}
    <div data-slot="views" class="flex min-w-0 flex-none items-center">
      {@render views(compact)}
    </div>
  {/if}
  <div data-slot="acts" class="ms-auto flex flex-none items-center gap-space-2">
    {#if tools}
      <div
        data-slot="tools"
        data-form={compact ? "compact" : undefined}
        class="flex flex-none items-center gap-space-2"
      >
        {@render tools(compact)}
      </div>
    {/if}
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
              class="select-none touch-hit press-tint in-data-compact:hidden"
              type="button"
            >
              <IconFork data-slot="bar-symbol" aria-hidden="true" />
            </button>
          {/snippet}
        </Tip>
      {/if}
      <!-- Full size: the tab fills the window, the rail and the tabs put
           away; pressed again, or Escape, they come back (full-size.svelte.ts). -->
      <BarItem
        aria-keyshortcuts={fullSize.on ? "Escape" : undefined}
        data-full-size
        icon={fullSize.on ? IconMinimize : IconMaximize}
        label={fullSize.on ? projectWords.exitFullSize : projectWords.fullSize}
      >
        {#snippet children(tip)}
          <button
            data-bar-item
            data-box
            data-full-size
            {...mergeProps(tip, { onclick: () => fullSize.toggle() })}
            aria-label={fullSize.on
              ? projectWords.exitFullSize
              : projectWords.fullSize}
            aria-pressed={fullSize.on}
            aria-keyshortcuts={fullSize.on ? "Escape" : undefined}
            class="select-none touch-hit press-tint in-data-compact:hidden"
            type="button"
          >
            {#if fullSize.on}
              <IconMinimize data-slot="bar-symbol" aria-hidden="true" />
            {:else}
              <IconMaximize data-slot="bar-symbol" aria-hidden="true" />
            {/if}
          </button>
        {/snippet}
      </Tip>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <BarItem
              data-head-more
              icon={IconMore}
              label={commonWords.moreFor(project.name)}
              {props}
              bind:ref={more}
            />
          {/snippet}
        </DropdownMenu.Trigger>
        <!-- An end asked here keeps the focus its tray took, and the New
             Session form a Spin off opened keeps the focus it took: the menu
             doesn't hand it back to More as it closes. -->
        <DropdownMenu.Content
          align="end"
          width="regular"
          onCloseAutoFocus={(event) => {
            if (endHost.at === endAt || spawning.open) {
              event.preventDefault();
            }
          }}
        >
          {#if compact}
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
            <DropdownMenu.Item onSelect={() => openDetails()}>
              {#if primary && machine}
                <OsMark os={machine.os} />
              {:else}
                <IconFolder />
              {/if}
              <span>{projectWords.projectDetails}</span>
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => fullSize.toggle()}>
              {#if fullSize.on}
                <IconMinimize />
              {:else}
                <IconMaximize />
              {/if}
              <span
                >{fullSize.on
                  ? projectWords.exitFullSize
                  : projectWords.fullSize}</span
              >
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
          {/if}
          {#if setup}
            <DropdownMenu.Item onSelect={() => setup?.run()}>
              <IconColumns />
              <span>{setup.label}</span>
            </DropdownMenu.Item>
          {/if}
          {#if onaskview}
            <DropdownMenu.Item onSelect={() => onaskview?.()}>
              <IconSparkles />
              <span>{viewsWords.ask}</span>
            </DropdownMenu.Item>
          {/if}
          <DropdownMenu.Item
            onSelect={() =>
              goto(`/usage?project=${encodeURIComponent(project.id)}`)}
          >
            <IconUsage />
            <span>Spend</span>
          </DropdownMenu.Item>
          <!-- The project's two ends, set apart at the end: Forget, which
               can be undone, a plain row with the archive glyph; Delete,
               which cannot, the house's destructive item. -->
          <DropdownMenu.Separator />
          <!-- Each end unfolds under this head (project-end.svelte.ts). -->
          <DropdownMenu.Item onSelect={() => askEnd(project, endAt, "forget")}>
            <IconArchive />
            <span>{projectEndWords.forgetProject}</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={() => askEnd(project, endAt, "delete")}
            variant="destructive"
          >
            <IconDeleteForGood />
            <span>{projectEndWords.deleteProject}</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </BarGlass>
  </div>
</header>
<!-- What the hub refused, under the head as a line of its own, in its
     words: a rename. -->
<div
  data-slot="head-faults"
  class="ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5"
>
  <RowFault again={commitName} reason={renameFault} />
</div>
<!-- The project's details, under the head, from where its title starts. -->
{#if details}
  <ProjectDetails
    afterChecks={detailsAfterChecks}
    {machine}
    onclose={closeDetails}
    {place}
    {project}
  />
{/if}
<!-- An end asked from More, under the head, from where its title starts. -->
<!-- The tray on the page's gutters: 25px in at the start (18 under the desk
     line, DESIGN.md, Layout) and 18 at the end, so it never meets the screen. -->
<div data-slot="project-end" class="contents" style:--ask-end="var(--space-5)">
  <ProjectEndTray
    at={endAt}
    opener={() => more}
    projectId={project.id}
    class="tray-indent-space-7 max-w-128 max-desk:tray-indent-space-5"
  />
</div>
