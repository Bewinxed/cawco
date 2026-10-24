<script lang="ts" module>
  import { SvelteMap } from "svelte/reactivity";

  /**
   * Each project's details tray while it stands, and how many times `· N
   * places` asked for its places. Kept past the head: on a phone a task
   * opens as its own page, and Back finds the tray where it was (The Open
   * Page Rule: the surface waits).
   */
  const standing = new SvelteMap<string, { placesAsked: number }>();
</script>

<script lang="ts">
  /**
   * The project's head (design §2 Fit, fable-lead-switch.md §3): the
   * project's name, and one line under it. The name wraps at its spaces
   * only and never under the actions, which wrap under it first.
   * The line is where the project lives — its machine and folder, `· N
   * places` when it has more — and Caw's words take its place only while he
   * has something to say: what his session is doing, his question as a
   * link to its thread, a task that landed. The name is renamed where it
   * stands; the line opens the project's details under the head
   * (ProjectDetails), `· N places` opens them at its places. Then Caw at
   * 48px, sitting at the head's end so the name's start edge stays where it
   * is when he stands over the empty board instead, Ask Caw (his panel on a
   * new thread, the caret in his composer: work in a project starts by
   * telling Caw, PRD §5.6), New session (the New Session form on the
   * project's checkout, outlined, so Ask Caw stays the head's one coral
   * action; the owner's pin on Spin off: "what the fuck is this button
   * supposed to be?"), and `⋯`
   * holding Pick stages (while the code
   * stages stand in), Project details…, Caw's settings (CawPanel, off `⋯`:
   * a popover on a desk, the bottom sheet on touch), Spend, Other people's
   * repositories (the upstream choice: the fleet's answer until the project
   * picks its own) and Forget (and, under 640px, New session first, New task, Filter
   * tasks… and Ask Caw for a view), each with its glyph. One tray stands
   * under the head at a time: the details or a forget.
   *
   * Under 640px the head carries no button but `⋯`: Ask Caw is the
   * coral "+" of the page's views bar (ViewBar), which opens Caw's panel as
   * this one does, and New session is in `⋯` (Apple HIG,
   * Toolbars: "Prioritize only the most important items for inclusion in
   * the main toolbar area … Create a More menu to include additional
   * items").
   *
   * With the board empty and the lead on, Caw stands over the empty board
   * instead (picks.md), and his slot here closes.
   */
  import {
    commonWords,
    machineLabel,
    projectWords,
    viewsWords,
  } from "@cawco/core";
  import {
    UPSTREAM_WORDS,
    type UpstreamPosts,
    upstreamPostsWords,
  } from "@cawco/core/upstream-guard";
  import { untrack } from "svelte";
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
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import {
    IconColumns,
    IconFilter,
    IconInfo,
    IconMore,
    IconPlus,
    IconSessionAdd,
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
  /** The place a forget asked from this head's `⋯` stands (forget.svelte.ts). */
  const forgetAt = $derived(`head:${project.id}`);

  /**
   * Its places on machines: the line counts these (its folder on the hub is
   * every project's, listed with them but not counted).
   */
  const checkouts = $derived(
    project.places.filter((each) => each.kind !== "hub").length
  );
  /** Its primary checkout; none while its one place is its folder on the hub. */
  const primary = $derived(checkoutOf(project));
  /** Where the project lives: its machine and folder (WORDS.md: place). */
  const place = $derived.by(() => {
    if (!primary) {
      return "Its folder on the hub";
    }
    return machine
      ? `${machineLabel(machine.hostname)} · ${primary.path}`
      : primary.path;
  });
  const words = $derived(lead.words);

  /**
   * The project's details, under the head (ProjectDetails): open, and
   * whether they were opened at its places (`· N places`). One tray stands
   * under the head at a time, so a forget asked here gives way to them and
   * they give way to a forget.
   */
  const details = $derived(standing.get(project.id) ?? null);
  /** The line that opens them: Escape and Done hand the focus back to it. */
  let placeLine = $state<HTMLButtonElement | null>(null);

  function openDetails(atPlaces: boolean): void {
    if (forgetHost.at === forgetAt) {
      forgetHost.close();
    }
    // A forget's tray standing here gives way too; stops under way park.
    const forgetting = stopWork.of("forget", project.id);
    if (forgetting?.open && forgetting.at === forgetAt) {
      stopWork.dismiss(forgetting);
    }
    const asked = details?.placesAsked ?? 0;
    standing.set(project.id, { placesAsked: atPlaces ? asked + 1 : asked });
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
   * and goes; the title and line beside it slide with its width.
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
   * the ⋯ that asked stands, with Try again; never a toast (DESIGN.md, The
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
   * New session: the New Session form at `trigger` (the button, or `⋯` on a
   * phone, where the menu holds it), on the project and its checkout when
   * it has one. Harness, model, mode and lifetime are the form's own (a
   * spin-off is its own choice there), and Start waits for a mode.
   */
  function openNewSession(trigger: HTMLElement | null) {
    if (!trigger) {
      return;
    }
    newSession(
      primary
        ? {
            machineId: primary.machineId,
            cwd: primary.path,
            projectId: project.id,
          }
        : { projectId: project.id },
      trigger
    );
  }
</script>

<header
  data-slot="project-head"
  class="flex flex-wrap items-center gap-x-space-4 gap-y-space-3 pt-space-6 pe-space-6 pb-space-4 ps-space-7 max-desk:pt-space-5 max-desk:pe-space-5 max-desk:pb-space-3 max-desk:ps-space-5"
>
  <div
    data-slot="who"
    class="flex min-w-0 shrink grow basis-c-head-who-basis items-center gap-space-3"
  >
    <div
      data-slot="txt"
      class="flex min-w-0 flex-col gap-space-1 has-data-field:flex-auto"
    >
      <!-- The name bleeds space-1 past its column on each side (its tint and
           field): the title takes both bleeds into its own box, so the name
           fills it whole and nothing stands outside the title. -->
      <h1
        data-slot="title"
        class="-mx-space-1 min-w-0 type-title text-ink-strong"
      >
        {#if draft !== null}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            data-slot="name"
            data-field
            aria-label="Project name"
            autocomplete="off"
            autofocus
            class="focus-inset block w-full overflow-hidden text-ellipsis cursor-text rounded-xs border border-border-control bg-surface-raised px-space-1 font-inherit text-start text-inherit transition-[background-color] duration-(--dur-control) ease-out read-only:text-ink-muted"
            onblur={() => {
              // Left after a refusal, it stays as typed, the reason under
              // it; Enter or Try again sends it.
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
            class="select-none press-tint block max-w-full overflow-hidden text-ellipsis cursor-text rounded-xs border border-transparent bg-transparent px-space-1 font-inherit text-start text-inherit transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover"
            onclick={editName}
            title="Rename {project.name}"
            type="button"
          >
            {project.name}
          </button>
        {/if}
      </h1>
      <!-- A rename the hub refused, under the name, in its words. -->
      <RowFault again={commitName} reason={renameFault} />
      <!-- The upstream choice the hub refused, under the head its ⋯ is on. -->
      <RowFault
        again={() =>
          setUpstream((upstreamFault?.asked as UpstreamPosts | null) ?? null)}
        data-upstream-refusal
        reason={upstreamFault?.reason}
      />
      <!-- Words change by MorphText. The line is one ellipsized line as wide
           as its column, with nothing standing after it on its row: its box
           neither grows nor narrows, so there is no size for morph() to
           tween. -->
      <p
        class="mark-line type-label flex min-w-0 items-center gap-space-2 whitespace-nowrap text-ink-muted"
      >
        {#if words?.kind === "ask"}
          <a
            data-slot="ask"
            class="min-w-0 overflow-hidden text-ellipsis text-link-ink no-underline hover:underline hover:underline-offset-(--underline-offset)"
            href="/session/thread:{words.threadId}"
            ><MorphText text={words.text} /></a
          >
          {#if words.more > 0}
            <span data-num data-slot="more" class="num text-ink-muted"
              >+{words.more}</span
            >
          {/if}
        {:else if words}
          <span class="min-w-0 overflow-hidden text-ellipsis"
            ><MorphText text={words.text} /></span
          >
        {:else}
          <!-- The place is a press, as the name is: the project's details
               unfold under the head. -->
          <button
            aria-expanded={details !== null}
            class="select-none mark-line -mx-space-1 flex min-w-0 items-center gap-space-2 rounded-xs border-none border-current bg-transparent px-space-1 font-inherit text-start text-inherit transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover can-hover:aria-expanded:bg-surface-hover"
            data-box
            data-place-line
            onclick={() => {
              if (details) {
                closeDetails();
              } else {
                openDetails(false);
              }
            }}
            title="Project details"
            type="button"
            bind:this={placeLine}
          >
            {#if machine}
              <OsMark class="size-icon-sm flex-none" os={machine.os} />
            {/if}
            <span class="min-w-0 overflow-hidden text-ellipsis"
              ><MorphText text={place} /></span
            >
          </button>
          {#if checkouts > 1}
            <!-- Words on the mark line, so the line's recipe trims them to
                 their x-height and gives the room back as block padding
                 (app.css .mark-line): only the inline padding is the
                 button's to take away. `p-0` took the recipe's too, and left
                 a 7px box round a 15px line of words. -->
            <button
              class="select-none flex-none rounded-xs border-none border-current bg-transparent px-0 font-inherit text-ink-muted transition-[background-color] duration-(--dur-control) ease-out hover:bg-surface-hover"
              data-places-line
              onclick={() => openDetails(true)}
              type="button">· {checkouts} places</button
            >
          {/if}
        {/if}
      </p>
    </div>
  </div>
  <div
    data-slot="acts"
    class="flex shrink-0 grow-0 basis-auto items-center gap-space-2 phone:max-desk:shrink phone:max-desk:grow phone:max-desk:basis-full max-phone:shrink-0 max-phone:grow-0 max-phone:basis-auto"
  >
    <!-- He sits at the head's end, by Ask Caw, so the name's start edge is
         the same whether he sits here or stands over the empty board. His
         seat holds its place while he is read; a read the hub refused draws
         no one, so no empty seat stands by Ask Caw. -->
    {#if seated && !(lead.refused !== null && lead.project === null)}
      <div data-slot="seat" class="flex-none" transition:slot>
        <CawSeat {lead} projectId={project.id} projectName={project.name} />
      </div>
    {/if}
    <!-- New work starts by telling Caw (PRD §5.6): his panel on a new
         thread, the caret in his composer. -->
    <Button
      layout="wide"
      press="pressable"
      data-new-session
      onclick={() => lead.newThread()}>{projectWords.askCaw}</Button
    >
    <!-- A session without Caw, on the project: the New Session form. -->
    <Button
      aria-haspopup="dialog"
      data-new-session-form
      layout="wide"
      press="pressable"
      label={projectWords.newSession}
      onclick={(event) => openNewSession(event.currentTarget)}
      variant="outline"
    />
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            aria-label={commonWords.moreFor(project.name)}
            class="max-desk:ms-auto max-desk:me-(--more-bleed)"
            size="icon"
            style="--more-bleed: calc((var(--c-btn-h) - var(--icon-md)) / -2)"
            variant="ghost"
            bind:ref={more}
          >
            <IconMore />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <!-- A forget asked here keeps the focus its tray took, and the New
           Session form New session opened keeps the focus it took: the menu
           doesn't hand it back to `⋯` as it closes. -->
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
          <DropdownMenu.Item onSelect={() => openNewSession(more)}>
            <IconSessionAdd />
            <span>{projectWords.newSession}</span>
          </DropdownMenu.Item>
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
        <DropdownMenu.Item onSelect={() => openDetails(false)}>
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
  </div>
</header>
<!-- Caw's settings, off `⋯`: the project's own, beside its other settings. -->
{#if touch.current}
  <Drawer.Root bind:open={cawOpen}>
    <!-- The recipe's foot: 16px plus the safe area (DESIGN.md, Drawer). -->
    <Drawer.Content title={`Caw, lead of ${project.name}`}>
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
      aria-label="Caw, lead of {project.name}"
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
    placesAsked={details.placesAsked}
    {lead}
    {machine}
    onclose={closeDetails}
    {place}
    {project}
  />
{/if}
<!-- A forget asked from `⋯`, under the head, from where its title starts. -->
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
