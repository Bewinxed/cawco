<script lang="ts">
  /**
   * The project's head (design §2 Fit, fable-lead-switch.md §3): Caw at
   * 48px on the leading edge, the project's name, and one line under it.
   * The line is where the project lives — its machine and folder, `· N
   * places` when it has more, which lists them — and Caw's words take its
   * place only while he has something to say: what his session is doing,
   * his question as a link to its thread, a task that landed. Then New
   * session, Spin off, and `⋯` holding Pick stages (while the code
   * stages stand in), Spend and Forget (and, under 640px, New task and Ask
   * Caw for a view).
   *
   * With the board empty and the lead on, Caw stands over the empty board
   * instead (picks.md), and his slot here closes.
   */
  import { machineLabel } from "@cawco/core";
  import { MediaQuery } from "svelte/reactivity";
  import { toast } from "svelte-sonner";
  import type { Machine, ProjectRow } from "#lib/cawco/client.svelte.js";
  import {
    cawco,
    deleteProject,
    spawnSession,
  } from "#lib/cawco/client.svelte.js";
  import { conversationHref } from "#lib/cawco/links.js";
  import { dur, easeInOut, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { route } from "#lib/cawco/motion/route.svelte.js";
  import { handOver, land } from "#lib/cawco/motion/share.svelte.js";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import { unpickedMode } from "#lib/cawco/permission-modes.js";
  import { checkoutOf } from "#lib/cawco/projects.js";
  import { newSession } from "#lib/cawco/spawn/new-session.svelte.js";
  import { rememberSpawn, spawnPrefs } from "#lib/cawco/spawnPrefs.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as AlertDialog from "#lib/components/ui/alert-dialog/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { IconMore } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import CawSeat from "./CawSeat.svelte";
  import type { CawLead } from "./caw-lead.svelte";

  let {
    project,
    machine,
    lead,
    seated,
    onnewtask,
    onask,
    onstages,
  }: {
    project: ProjectRow;
    machine: Machine | null;
    lead: CawLead;
    /** Caw sits here; off while he stands over the empty board. */
    seated: boolean;
    onnewtask: () => void;
    /** Ask Caw for a view, from the menu; null while the lead is off. */
    onask: ((anchor: HTMLElement) => void) | null;
    /** Pick the project's stages, from the menu; null once it has its own. */
    onstages: ((anchor: HTMLElement) => void) | null;
  } = $props();

  const narrow = new MediaQuery("(max-width: 639px)");
  let spawnOpen = $state(false);
  let spawnPrompt = $state("");
  let forgetOpen = $state(false);
  let forgetting = $state(false);
  let forgotten = $state(false);
  let more = $state<HTMLElement | null>(null);

  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

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

  async function startSession(scratch: boolean) {
    if (!primary) {
      return;
    }
    const remembered = spawnPrefs.permissionMode;
    const mod = spawnPrefs.model;
    // This start has no pickers of its own — it runs on what the new-session
    // form was last set to, effort included. Full Send is the exception:
    // with no form its warning is never read, so this start runs on Bypass.
    const perm = unpickedMode(remembered);
    const level = spawnPrefs.effort;
    const prompt = spawnPrompt.trim() || undefined;
    let instanceId: string;
    try {
      instanceId = await spawnSession({
        machineId: primary.machineId,
        cwd: primary.path,
        projectId: project.id,
        permissionMode: perm,
        harness: spawnPrefs.harness,
        model: mod,
        effort: level ?? undefined,
        prompt,
        scratch: scratch ? {} : undefined,
      });
    } catch (error) {
      toast.error(message(error));
      return;
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

  async function forget() {
    forgetting = true;
    forgotten = false;
    try {
      await deleteProject(project.id);
      forgotten = true;
      forgetOpen = false;
    } finally {
      forgetting = false;
    }
    await goto(route.spoke, { replace: true });
  }
</script>

<header class="project-head">
  <div class="who">
    {#if seated}
      <div class="seat" transition:slot>
        <CawSeat {lead} projectId={project.id} projectName={project.name} />
      </div>
    {/if}
    <div class="txt">
      <h1 class="title">{project.name}</h1>
      <!-- Words change by TextMorph. The line is one ellipsized line as wide
           as its column, with nothing standing after it on its row: its box
           neither grows nor narrows, so there is no size for morph() to
           tween. -->
      <p class="line">
        {#if words?.kind === "ask"}
          <a class="ask" href="/session/thread:{words.threadId}"
            ><MorphText text={words.text} /></a
          >
          {#if words.more > 0}
            <span class="more num">+{words.more}</span>
          {/if}
        {:else if words}
          <span class="said"><MorphText text={words.text} /></span>
        {:else}
          {#if machine}
            <OsMark class="os" os={machine.os} />
          {/if}
          <span class="place" title={place}><MorphText text={place} /></span>
          {#if checkouts > 1}
            <Popover.Root>
              <Popover.Trigger class="places press-tint"
                >· {checkouts} places</Popover.Trigger
              >
              <Popover.Content align="start" class="w-80">
                <ul class="place-list">
                  {#each project.places as each (each.id)}
                    {@const host = cawco.machines.find(
                      (row) => row.machineId === each.machineId
                    )}
                    <li>
                      <span class="host"
                        >{#if each.kind === "hub"}
                          The hub
                        {:else if host}
                          {machineLabel(host.hostname)}
                        {:else}
                          A machine not joined
                        {/if}</span
                      >
                      <span class="path" title={each.path}
                        ><bdi>{each.path}</bdi></span
                      >
                    </li>
                  {/each}
                </ul>
              </Popover.Content>
            </Popover.Root>
          {/if}
        {/if}
      </p>
    </div>
  </div>
  <div class="acts">
    {#if !primary}
      <!-- No checkout yet: a session needs a machine and folder, which the
           New Session dialog asks for. -->
      <Button
        class="pressable"
        onclick={() => newSession({ projectId: project.id })}
        >New session</Button
      >
    {:else}
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
            <label class="flex flex-col gap-1 text-meta text-muted-foreground">
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
        Spin off
      </Button>
    {/if}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({
          props,
        })}
          <Button
            {...props}
            aria-label="More for {project.name}"
            data-share="forget:{project.id}"
            size="icon"
            variant="ghost"
            bind:ref={more}
          >
            <IconMore />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class="w-52">
        {#if narrow.current}
          <DropdownMenu.Item onSelect={onnewtask}>New task</DropdownMenu.Item>
          {#if onask}
            <DropdownMenu.Item
              onSelect={() => {
                if (more) {
                  onask?.(more);
                }
              }}
              >Ask Caw for a view</DropdownMenu.Item
            >
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
            >Pick stages…</DropdownMenu.Item
          >
        {/if}
        <DropdownMenu.Item
          onSelect={() =>
            goto(`/usage?project=${encodeURIComponent(project.id)}`)}
          >Spend</DropdownMenu.Item
        >
        <!-- The one destructive row, as every menu draws one: the house's
             destructive item, set apart at the end. -->
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          onSelect={() => {
            forgetOpen = true;
          }}
          variant="destructive"
          >Forget project…</DropdownMenu.Item
        >
      </DropdownMenu.Content>
    </DropdownMenu.Root>
    <AlertDialog.Root bind:open={forgetOpen}>
      <!-- Opens out of the button that asked for it. -->
      <AlertDialog.Content
        {@attach land(() => `forget:${project.id}`, { uniform: true })}
      >
        <AlertDialog.Header>
          <AlertDialog.Title>Forget {project.name}?</AlertDialog.Title>
          <AlertDialog.Description>
            The grouping is removed. The checkout and its sessions stay on disk.
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

<style>
  .project-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3) var(--space-4);
    padding: var(--space-6) var(--space-6) var(--space-4) var(--space-7);
  }
  .who {
    display: flex;
    flex: 1 1 18rem;
    align-items: center;
    gap: var(--space-3);
    min-inline-size: 0;
  }
  .seat {
    flex: none;
  }
  .txt {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .title {
    font: var(--type-title);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    font: var(--type-label);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .line :global(.os) {
    inline-size: var(--icon-sm, 14px);
    block-size: var(--icon-sm, 14px);
    flex: none;
  }
  .place,
  .said,
  .ask {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ask {
    color: var(--link-ink);
    text-decoration: none;
  }
  @media (hover: hover) {
    .ask:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
  .more {
    color: var(--ink-muted);
  }
  .line :global(.places) {
    flex: none;
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .place-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .place-list li {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }
  .host {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .path {
    overflow: hidden;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: start;
  }
  .acts {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
  }
  @media (max-width: 899px) {
    .project-head {
      padding: var(--space-5) var(--space-5) var(--space-3);
    }
    .acts {
      flex: 1 1 100%;
    }
    .acts > :global(:last-child),
    .acts :global([aria-label^="More for"]) {
      margin-inline-start: auto;
    }
  }
</style>
