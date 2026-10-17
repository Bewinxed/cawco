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
   * The project's head (design §2 Fit, fable-lead-switch.md §3): Caw at
   * 48px on the leading edge, the project's name, and one line under it.
   * The line is where the project lives — its machine and folder, `· N
   * places` when it has more — and Caw's words take its place only while he
   * has something to say: what his session is doing, his question as a
   * link to its thread, a task that landed. The name is renamed where it
   * stands; the line opens the project's details under the head
   * (ProjectDetails), `· N places` opens them at its places. Then New
   * session, Spin off, and `⋯` holding Pick stages (while the code
   * stages stand in), Project details…, Caw's settings (CawPanel, off `⋯`:
   * a popover on a desk, the bottom sheet on touch), Spend, Other people's
   * repositories (the upstream choice: the fleet's answer until the project
   * picks its own) and Forget (and, under 640px, Spin off, New task, Filter
   * tasks… and Ask Caw for a view), each with its glyph. One tray stands
   * under the head at a time: the details or a forget.
   *
   * Under 640px the head carries no button but `⋯`: New session is the
   * coral "+" of the page's views bar (ViewBar), which opens its popover
   * over itself (`newSessionFrom`), and Spin off is in `⋯` (Apple HIG,
   * Toolbars: "Prioritize only the most important items for inclusion in
   * the main toolbar area … Create a More menu to include additional
   * items").
   *
   * With the board empty and the lead on, Caw stands over the empty board
   * instead (picks.md), and his slot here closes.
   */
  import { machineLabel } from "@cawco/core";
  import type { UpstreamPosts } from "@cawco/core/upstream-guard";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import type { Machine, ProjectRow } from "#lib/cawco/client.svelte.js";
  import {
    answeredOr,
    cawco,
    editProject,
    spawnSession,
  } from "#lib/cawco/client.svelte.js";
  import ForgetProjectTray from "#lib/cawco/ForgetProjectTray.svelte";
  import { forgetHost, forgetProject } from "#lib/cawco/forget.svelte.js";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { conversationHref } from "#lib/cawco/links.js";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { handOver } from "#lib/cawco/motion/share.svelte.js";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import { unpickedMode } from "#lib/cawco/permission-modes.js";
  import UpstreamMenu from "#lib/cawco/project/UpstreamMenu.svelte";
  import { checkoutOf } from "#lib/cawco/projects.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { newSession } from "#lib/cawco/spawn/new-session.svelte.js";
  import { rememberSpawn, spawnPrefs } from "#lib/cawco/spawnPrefs.svelte.js";
  import { toast } from "#lib/cawco/toasts.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import {
    IconColumns,
    IconFilter,
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
  let cawOpen = $state(false);
  let spawnOpen = $state(false);
  /** What the New session popover opens over: its button, or the views bar's "+" on a phone. */
  let spawnAnchor = $state<HTMLElement | null>(null);
  let spawnPrompt = $state("");
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
   * Which start is on its way (its button pending, the others held), and
   * why the last one was refused: a start from the popover says it under
   * the popover's form, which stays open with the prompt typed; a spin-off
   * says it under the head's line, where the button stands.
   */
  let starting = $state<"start" | "empty" | "spin" | null>(null);
  let startFault = $state<string | null>(null);
  let spinFault = $state<string | null>(null);

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

  /** The project's own upstream answer, or null for the fleet's (UpstreamMenu). */
  async function setUpstream(posts: UpstreamPosts | null): Promise<void> {
    try {
      await editProject(project.id, { upstreamPosts: posts });
    } catch (error) {
      toast.error(message(error));
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
   * New session from somewhere other than its button (the views bar's "+"
   * on a phone): the same popover, over `anchor`; with no checkout yet, the
   * New Session dialog, as the button does.
   */
  export function newSessionFrom(anchor: HTMLElement): void {
    if (!primary) {
      newSession({ projectId: project.id });
      return;
    }
    spawnAnchor = anchor;
    spawnOpen = true;
  }

  async function startSession(way: "start" | "empty" | "spin") {
    if (!primary || starting) {
      return;
    }
    const scratch = way === "spin";
    starting = way;
    startFault = null;
    spinFault = null;
    const remembered = spawnPrefs.permissionMode;
    const mod = spawnPrefs.model;
    // This start has no pickers of its own — it runs on what the new-session
    // form was last set to, effort included. Full Send is the exception:
    // with no form its warning is never read, so this start runs on Bypass.
    const perm = unpickedMode(remembered);
    const level = spawnPrefs.effort;
    // Start empty is a session with no first prompt, whatever was typed.
    const prompt =
      way === "empty" ? undefined : spawnPrompt.trim() || undefined;
    let instanceId: string;
    try {
      instanceId = answeredOr(
        primary.machineId,
        await spawnSession({
          machineId: primary.machineId,
          cwd: primary.path,
          projectId: project.id,
          permissionMode: perm,
          harness: spawnPrefs.harness,
          model: mod,
          effort: level ?? undefined,
          prompt,
          scratch: scratch ? {} : undefined,
        }),
        "whether the session started is not known"
      );
    } catch (error) {
      if (scratch) {
        spinFault = message(error);
      } else {
        startFault = message(error);
      }
      return;
    } finally {
      starting = null;
    }
    rememberSpawn({
      harness: spawnPrefs.harness,
      model: mod,
      permissionMode: remembered,
      effort: level,
    });
    handOver("session:new", `session:${instanceId}`);
    spawnPrompt = "";
    spawnOpen = false;
    // biome-ignore lint/complexity/noVoid: fire-and-forget navigation after the spawn already succeeded
    void goto(conversationHref(instanceId, cawco.instanceIndex));
  }
</script>

<!-- literal: 18rem, 3px, 24px, 12px -->
<header
  data-slot="project-head"
  class="flex flex-wrap items-center gap-x-space-4 gap-y-space-3 pt-space-6 pr-space-6 pb-space-4 pl-space-7 max-[900px]:pt-space-5 max-[900px]:pr-space-5 max-[900px]:pb-space-3 max-[900px]:pl-space-5"
>
  <div
    data-slot="who"
    class="flex min-w-0 shrink grow basis-(--who-basis) items-center gap-space-3"
    style:--who-basis="18rem"
  >
    {#if seated}
      <div data-slot="seat" class="flex-none" transition:slot>
        <CawSeat {lead} projectId={project.id} projectName={project.name} />
      </div>
    {/if}
    <div
      data-slot="txt"
      class="flex min-w-0 flex-col gap-space-1 has-data-field:flex-auto"
    >
      <h1 data-slot="title" class="type-title wrap-anywhere text-ink-strong">
        {#if draft !== null}
          <!-- svelte-ignore a11y_autofocus -->
          <input
            data-slot="name"
            data-field
            aria-label="Project name"
            autocomplete="off"
            autofocus
            class="focus-inset -mx-space-1 block w-full max-w-full cursor-text rounded-xs border border-border-control bg-surface-raised px-space-1 font-inherit text-start text-inherit transition-[background-color] dur-control ease-out read-only:text-ink-muted"
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
            class="press-tint -mx-space-1 block max-w-full cursor-text rounded-xs border border-transparent bg-transparent px-space-1 font-inherit text-start text-inherit transition-[background-color] dur-control ease-out hover:bg-surface-hover"
            onclick={editName}
            title="Rename"
            type="button"
          >
            {project.name}
          </button>
        {/if}
      </h1>
      <!-- A rename the hub refused, under the name, in its words. -->
      <RowFault again={commitName} reason={renameFault} />
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
            style:--underline-offset="3px"
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
            class="mark-line -mx-space-1 flex min-w-0 cursor-pointer items-center gap-space-2 rounded-xs border-none border-current bg-transparent px-space-1 font-inherit text-start text-inherit transition-[background-color] dur-control ease-out hover:bg-surface-hover can-hover:aria-expanded:bg-surface-hover"
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
              class="flex-none cursor-pointer rounded-xs border-none border-current bg-transparent px-0 font-inherit text-ink-muted transition-[background-color] dur-control ease-out hover:bg-surface-hover"
              data-places-line
              onclick={() => openDetails(true)}
              type="button">· {checkouts} places</button
            >
          {/if}
        {/if}
      </p>
      <!-- A spin-off the hub refused, under the line, by the button pressed. -->
      <RowFault again={() => startSession("spin")} reason={spinFault} />
    </div>
  </div>
  <div
    data-slot="acts"
    class="flex shrink-0 grow-0 basis-auto items-center gap-space-2 phone:max-[900px]:shrink phone:max-[900px]:grow phone:max-[900px]:basis-full max-phone:shrink-0 max-phone:grow-0 max-phone:basis-auto"
  >
    {#if !primary}
      <!-- No checkout yet: a session needs a machine and folder, which the
           New Session dialog asks for. -->
      <Button
        class="max-phone:hidden"
        press="pressable"
        onclick={() => newSession({ projectId: project.id })}
        >New session</Button
      >
    {:else}
      <Popover.Root bind:open={spawnOpen}>
        <Popover.Trigger
          onclick={() => {
            spawnAnchor = null;
          }}
        >
          {#snippet child({ props })}
            <Button {...props} class="max-phone:hidden" press="pressable"
              >New session</Button
            >
          {/snippet}
        </Popover.Trigger>
        <!-- The kit popover's own 6px padding (DESIGN.md, `kit-pop`). Over
             the views bar's "+" it opens upward from the foot. -->
        <Popover.Content
          align="end"
          collisionPadding={8}
          width="wide"
          customAnchor={spawnAnchor}
          side={spawnAnchor ? "top" : "bottom"}
          sideOffset={spawnAnchor ? 8 : 4}
        >
          <form
            class="flex flex-col gap-3"
            onsubmit={(e) => {
              e.preventDefault();
              startSession("start");
            }}
          >
            <!-- biome-ignore lint/a11y/noLabelWithoutControl: the <Input> component renders a native input as its only child; Biome can't see through the component boundary -->
            <label class="flex flex-col gap-space-1 text-meta text-ink-muted">
              First prompt (optional)
              <Input
                autocomplete="off"
                placeholder="What should this session do?"
                text="label"
                spellcheck="false"
                bind:value={spawnPrompt}
              />
            </label>
            <RowFault again={() => startSession("start")} reason={startFault} />
            <div class="flex items-center justify-end gap-2">
              <Button
                data-share="session:new"
                data-share-ttl="8000"
                disabled={starting !== null && starting !== "empty"}
                label="Start empty"
                onclick={() => startSession("empty")}
                pending={starting === "empty"}
                pendingLabel="Starting…"
                size="sm"
                type="button"
                variant="ghost"
              />
              <Button
                data-share="session:new"
                data-share-ttl="8000"
                disabled={starting !== null && starting !== "start"}
                label="Start"
                pending={starting === "start"}
                pendingLabel="Starting…"
                size="sm"
                type="submit"
              />
            </div>
          </form>
        </Popover.Content>
      </Popover.Root>
      <Button
        class="max-phone:hidden"
        press="pressable"
        data-share="session:new"
        data-share-ttl="8000"
        disabled={starting !== null && starting !== "spin"}
        label="Spin off"
        onclick={() => startSession("spin")}
        pending={starting === "spin"}
        pendingLabel="Spinning off…"
        variant="outline"
      />
    {/if}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            aria-label="More for {project.name}"
            class="max-[900px]:ms-auto max-[900px]:me-(--more-bleed)"
            size="icon"
            style="--more-bleed: calc((var(--c-btn-h) - var(--icon-md)) / -2)"
            variant="ghost"
            bind:ref={more}
          >
            <IconMore />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <!-- A forget asked here keeps the focus its tray took: the menu
           doesn't hand it back to `⋯` as it closes. -->
      <DropdownMenu.Content
        align="end"
        width="regular"
        onCloseAutoFocus={(event) => {
          if (forgetHost.at === forgetAt) {
            event.preventDefault();
          }
        }}
      >
        {#if narrow.current}
          {#if primary}
            <DropdownMenu.Item
              disabled={starting !== null}
              onSelect={() => startSession("spin")}
            >
              <IconFork />
              <span>Spin off</span>
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
              <span>Ask Caw for a view</span>
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
            <span>Pick stages…</span>
          </DropdownMenu.Item>
        {/if}
        <DropdownMenu.Item onSelect={() => openDetails(false)}>
          <IconInfo />
          <span>Project details…</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => {
            cawOpen = true;
          }}
        >
          <IconSettings />
          <span>Caw settings…</span>
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
          <span>Forget project…</span>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</header>
<!-- Caw's settings, off `⋯`: the project's own, beside its other settings. -->
{#if touch.current}
  <Drawer.Root bind:open={cawOpen}>
    <Drawer.Content pad="safe-bottom">
      <Drawer.Title class="sr-only">Caw, lead of {project.name}</Drawer.Title>
      <CawPanel {lead} projectId={project.id} projectName={project.name} />
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Popover.Root bind:open={cawOpen}>
    <Popover.Content
      align="end"
      aria-label="Caw, lead of {project.name}"
      class="w-(--settings-w) max-[900px]:w-(--settings-w-narrow)"
      pad="inset"
      style="--settings-w: min(var(--c-panel-w), calc(100vw - 24px)); --settings-w-narrow: min(var(--c-panel-w), calc(100vw - 12px - env(safe-area-inset-right, 0px)))"
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
<ForgetProjectTray at={forgetAt} class="head-forget max-w-128" />

<style>
  /* residual: foreign-dom */
  /* The head's own leading padding, so the tray starts where its words do;
     as wide as the dialog it replaces (`max-w-lg`, set where it is drawn). */
  /* css-scope: the forget tray is drawn by ForgetProjectTray, outside this head's markup; only this head names the class */
  :global(.head-forget) {
    --ask-indent: var(--space-7);
    --fault-indent: var(--space-7);
  }
</style>
