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
   * printed in a bar"). A press opens the project page's Settings view
   * (settings/, `onsettings`). Caw's words are not in the head:
   * his seat's face, his panel and Needs you carry them.
   *
   * Trailing, Caw at 48px with his switch beside him (CawSeatSwitch: awake
   * or asleep, a press on him still opening his conversation), at the
   * head's end so the name's start edge stays where it is when he stands
   * over the empty board instead; then one glass
   * capsule (the kit's BarGlass, `form="group"`) of bare symbols, each named
   * in its tooltip: Ask Caw (his panel on a new conversation, the caret in his
   * composer: work in a project starts by telling Caw, PRD §5.6), Spin off,
   * and More holding its setup (Finish setting it up while it is not set
   * up, Change how it runs once it is: the project-setup skill's one page,
   * through Caw), Project settings (the Settings view), Caw's settings (CawSettings, off More: a popover on a desk, the
   * bottom sheet on a phone, CawSettingsLayer), Spend, then Forget and Delete
   * (and, under 640px, Spin off, New task, Filter tasks… and Ask Caw for a
   * view), each with its glyph. Nothing in the head is on the coral: no view
   * of a project is for asking Caw (One prominent action, trailing).
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
  import { projectEndWords } from "@cawco/core/words/project-ends";
  import { viewsWords } from "@cawco/core/words/views";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import ProjectEndTray from "#lib/cawco/ProjectEndTray.svelte";
  import { askEnd, endHost } from "#lib/cawco/project-end.svelte.js";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import { checkoutOf } from "#lib/cawco/projects.js";
  import RenameField from "#lib/cawco/RenameField.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { newSession, spawning } from "#lib/cawco/spawn/new-session.svelte.js";
  import { cawOffAt, stopWork } from "#lib/cawco/stop-work.svelte.js";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import { editProject } from "#lib/cawco/stores/projects.svelte.js";
  import {
    BarGlass,
    BarItem,
    BarMenu,
  } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import {
    IconArchive,
    IconChatAddLinear,
    IconColumns,
    IconDeleteForGood,
    IconFilter,
    IconFolderLinear,
    IconFork,
    IconForkLinear,
    IconInfo,
    IconMaximizeLinear,
    IconMinimizeLinear,
    IconMoreLinear,
    IconPlus,
    IconSettings,
    IconSparkles,
    IconUsage,
  } from "#lib/icons.js";
  import { failureWords as message } from "#lib/platform/hub-read.js";
  import {
    dur,
    easeInOut,
    motionOk,
  } from "#lib/platform/motion/curves.svelte.js";
  import { goto } from "$app/navigation";
  import CawSeatSwitch from "../caw-settings/CawSeatSwitch.svelte";
  import CawSettingsLayer from "../caw-settings/CawSettingsLayer.svelte";
  import ProjectCawSettings from "../caw-settings/ProjectCawSettings.svelte";
  import { fullSize } from "../workspace/full-size.svelte";
  import type { CawLead } from "./caw-lead.svelte";

  let {
    project,
    machine,
    lead,
    seated,
    onnewtask,
    onask,
    onfilter,
    onsettings,
    setup,
  }: {
    /** Open the project page's Settings view (ProjectPage's `settings` tab). */
    onsettings: () => void;
    /** Filter the tasks, from the menu on a phone, where the strip has no room for it. */
    onfilter: (anchor: HTMLElement) => void;
    project: ProjectRow;
    machine: Machine | null;
    lead: CawLead;
    /** Caw sits here; off while he stands over the empty board. */
    seated: boolean;
    /** Add a task by hand, from the menu; null while the project has no stage to add one into (not set up). */
    onnewtask: (() => void) | null;
    /** Ask Caw for a view, from the menu; null while Caw can't start. */
    onask: ((anchor: HTMLElement) => void) | null;
    /** Its setup, from the menu: finish it, or change how it runs; null while Caw can't start. */
    setup: { label: string; run: () => void } | null;
  } = $props();

  const narrow = new MediaQuery(PHONE_QUERY);
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
  /** The place an end asked from this head's More stands (project-end.svelte.ts). */
  const endAt = $derived(`head:${project.id}`);

  /** Its primary checkout; none while its one place is its folder on the hub. */
  const primary = $derived(checkoutOf(project));
  /** The place's tooltip: its machine's name, or the hub's folder. */
  const placeTip = $derived.by(() => {
    if (!primary) {
      return projectWords.hubFolder;
    }
    return machine ? machineLabel(machine.hostname) : projectWords.details;
  });

  /**
   * His slot opens and closes over --duration-panel on --ease-in-out as he comes
   * and goes; the capsule beside it slides with its width.
   */
  function slot(node: HTMLElement) {
    const width = node.offsetWidth;
    if (!motionOk.current) {
      return {
        duration: dur("--duration-base"),
        css: (t: number) => `opacity:${t}`,
      };
    }
    return {
      duration: dur("--duration-slow"),
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
  class="flex flex-none flex-nowrap items-center gap-x-space-4 min-h-12 pt-space-6 pe-space-6 pb-space-4 ps-space-6 max-desk:pt-space-4 max-desk:pe-space-4 max-desk:pb-space-3 max-desk:ps-space-4"
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
        <RenameField
          data-slot="name"
          label="Project name"
          look="heading"
          oncancel={stopEditing}
          onsend={commitName}
          refused={renameFault !== null}
          sending={renaming !== null}
          bind:value={draft}
        />
      {:else}
        <button
          data-slot="name"
          class="select-none press-tint block max-w-full overflow-hidden text-ellipsis cursor-text rounded-xs border border-transparent bg-transparent px-space-1 font-inherit text-start text-inherit transition-[background-color] duration-(--duration-fast) ease-out hover:bg-surface-hover focus-visible:-outline-offset-2"
          onclick={editName}
          title="Rename {project.name}"
          type="button"
        >
          {project.name}
        </button>
      {/if}
    </h1>
    <!-- The place, a bare BarItem outside the glass: its machine's mark in its linear face, or
         the hub's folder, named in its tooltip. It opens the project's
         Settings view. -->
    <BarItem
      data-place-line
      label={projectWords.details}
      onclick={onsettings}
      tip={placeTip}
    >
      {#if primary && machine}
        <OsMark
          data-slot="bar-symbol"
          aria-hidden="true"
          face="linear"
          os={machine.os}
        />
      {:else}
        <IconFolderLinear data-slot="bar-symbol" aria-hidden="true" />
      {/if}
    </BarItem>
  </div>
  <div data-slot="acts" class="ms-auto flex flex-none items-center gap-space-2">
    <!-- He sits at the head's end, by the capsule, so the name's start edge
         is the same whether he sits here or stands over the empty board.
         His seat holds its place while he is read; a read the hub refused
         draws no one, so no empty seat stands by the capsule. -->
    {#if seated && !(lead.refused !== null && lead.project === null)}
      <div data-slot="seat" class="flex-none" transition:slot>
        <CawSeatSwitch
          {lead}
          projectId={project.id}
          projectName={project.name}
        />
      </div>
    {/if}
    <!-- One capsule of the panel's glass, the top bar's trailing group its
         recipe: bare symbols, each named for a screen reader and in its
         tooltip. Under 640px it holds More alone. -->
    <BarGlass form="group">
      <!-- New work starts by telling Caw (PRD §5.6): his panel on a new
           conversation, the caret in his composer. -->
      <BarItem
        data-new-session
        icon={IconChatAddLinear}
        label={projectWords.askCaw}
        layout="wide"
        onclick={() => lead.newConversation()}
      />
      {#if primary}
        <BarItem
          aria-haspopup="dialog"
          data-spin-off
          icon={IconForkLinear}
          label={projectWords.spinOff}
          layout="wide"
          onclick={(event) => spinOff(event.currentTarget)}
        />
      {/if}
      <!-- Full size: the tab fills the window, the rail and the tabs put
           away; pressed again, or Escape, they come back (full-size.svelte.ts). -->
      <BarItem
        aria-keyshortcuts={fullSize.on ? "Escape" : undefined}
        data-full-size
        icon={fullSize.on ? IconMinimizeLinear : IconMaximizeLinear}
        label={fullSize.on ? projectWords.exitFullSize : projectWords.fullSize}
        onclick={() => fullSize.toggle()}
        pressed={fullSize.on}
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <BarItem
              data-head-more
              icon={IconMoreLinear}
              label={commonWords.moreFor(project.name)}
              {props}
              bind:ref={more}
            />
          {/snippet}
        </DropdownMenu.Trigger>
        <!-- An end asked here keeps the focus its tray took, and the New
             Session form a Spin off opened keeps the focus it took: the menu
             doesn't hand it back to More as it closes. -->
        <!-- Hung from the head's glass as one shape with it (BarMenu). -->
        <BarMenu
          label={commonWords.moreFor(project.name)}
          width="regular"
          onCloseAutoFocus={(event) => {
            if (endHost.at === endAt || spawning.open) {
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
            {#if onnewtask}
              <DropdownMenu.Item onSelect={onnewtask}>
                <IconPlus />
                <span>New task</span>
              </DropdownMenu.Item>
            {/if}
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
          {#if setup}
            <DropdownMenu.Item onSelect={() => setup?.run()}>
              <IconColumns />
              <span>{setup.label}</span>
            </DropdownMenu.Item>
          {/if}
          <DropdownMenu.Item onSelect={onsettings}>
            <IconInfo />
            <span>{projectWords.details}</span>
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
        </BarMenu>
      </DropdownMenu.Root>
    </BarGlass>
  </div>
</header>
<!-- What the hub refused, under the head as a line of its own, in its
     words: a rename. -->
<div
  data-slot="head-faults"
  class="ps-space-6 pe-space-6 max-desk:ps-space-4 max-desk:pe-space-4"
>
  <RowFault again={commitName} reason={renameFault} />
</div>
<!-- Caw's settings, off More: the project's own, beside its other settings. -->
<CawSettingsLayer anchor={more} projectName={project.name} bind:open={cawOpen}>
  {#snippet panel(sheet)}
    <ProjectCawSettings {lead} {machine} {project} {sheet} />
  {/snippet}
</CawSettingsLayer>
<!-- An end asked from More, under the head, from where its title starts. -->
<!-- The tray on the page's gutters: 25px in at the start (18 under the desk
     line, DESIGN.md, Layout) and 18 at the end, so it never meets the screen. -->
<div
  data-slot="project-end"
  class="contents"
  style:--ask-end="var(--spacing-space-4)"
>
  <ProjectEndTray
    at={endAt}
    opener={() => more}
    projectId={project.id}
    class="tray-indent-space-6 max-w-128 max-desk:tray-indent-space-4"
  />
</div>
