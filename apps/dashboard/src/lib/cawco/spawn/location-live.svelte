<script lang="ts">
  /**
   * The location chip and its popover as the New session form holds them
   * (LocationPicker.stories.ts): the real LocationChip, open under its chip,
   * on a bench's hub whose machine answers its gh and its folders from
   * location-mock.ts. A pick, a paste, a switch to Folder or a typed path
   * changes what the form would hold, as its own handlers do. A pasted URL's
   * repository is answered by the URL, `lookupMs` after it is asked; the
   * `paste` dial pastes one of the mock's URLs into the search, as the
   * person's paste would.
   */
  import { spawnWords } from "@cawco/core/words/spawn";
  import { type BenchFs, standSocket } from "../hub/socket.svelte";
  import LifetimeChip from "./LifetimeChip.svelte";
  import LocationChip from "./LocationChip.svelte";
  import LocationSection from "./LocationSection.svelte";
  import {
    filesOf,
    lookupOf,
    type MockAnswer,
    type MockPaste,
    mockMachine,
    PASTES,
    reposOf,
  } from "./location-mock";
  import NsPopoverGroup from "./NsPopoverGroup.svelte";

  let {
    answer,
    mode: startMode,
    repo: startRepo,
    dir: startDir,
    height,
    bare = false,
    paste = "Nothing pasted",
    lookupMs = 900,
  }: {
    /** What the machine's gh answers. */
    answer: MockAnswer;
    /** Where the form stands as it opens: Repository or Folder. */
    mode: "repo" | "dir";
    /** The git URL picked as it opens, "" for none. */
    repo: string;
    /** The path box as it opens. */
    dir: string;
    /** The frame's least height, px: room for the popover under its chip. */
    height: number;
    /** The popover's form alone in the frame, for its states to be read off the frame itself. */
    bare?: boolean;
    /** The URL pasted into the repository search, by what its lookup answers. */
    paste?: MockPaste;
    /** How long the machine takes to say what a pasted URL's repository is, ms. */
    lookupMs?: number;
  } = $props();

  const files: BenchFs = (_machineId, op, path) => filesOf(op, path);
  standSocket({
    hub: () => undefined,
    spawn: null,
    control: (machineId, method, args) => {
      switch (method) {
        case "ghRepos":
          return reposOf(machineId);
        case "ghRepo":
          return lookupOf(String(args[0]), lookupMs);
        default:
          return null;
      }
    },
    fs: files,
  });

  // What the form holds: the story's args, and what a press sets in place.
  let mode = $derived(startMode);
  let repo = $derived(startRepo);
  let dir = $derived(startDir);
  /** The chip whose popover stands open; the location's as it opens. */
  let popover = $state<"location" | "lifetime" | null>("location");
  let ephemeral = $state(false);
  /** What the form's own handlers do with the location: a press sets it in place. */
  const form = {
    ondir: (value: string) => {
      dir = value;
    },
    onmode: (value: "dir" | "repo") => {
      mode = value;
      dir ||= "~";
    },
    onoverride: () => undefined,
    onrepo: (value: string) => {
      repo = value;
    },
  };

  /** The frame's root: the repository search is found under it, or in the popover it opened. */
  let root = $state<HTMLElement>();
  /** The repository search, by its name. */
  const SEARCH = `[role="combobox"][aria-label="${spawnWords.location.search}"]`;
  /** Most frames the paste waits for the search to mount (the popover opening). */
  const PASTE_FRAMES = 60;
  // The dial's URL pasted into the search as the person pastes one: its
  // value set and an `input` sent, which RepoPicker's own handler reads.
  $effect(() => {
    const url = PASTES[paste];
    const at = root;
    if (!at) {
      return;
    }
    let frame = 0;
    let tries = 0;
    const put = () => {
      const search =
        at.querySelector<HTMLInputElement>(SEARCH) ??
        document.querySelector<HTMLInputElement>(SEARCH);
      if (!search) {
        tries += 1;
        frame = tries < PASTE_FRAMES ? requestAnimationFrame(put) : 0;
        return;
      }
      if (search.value !== url) {
        search.value = url;
        search.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    put();
    return () => cancelAnimationFrame(frame);
  });
</script>

<div
  bind:this={root}
  class="relative flex min-h-(--frame-h) items-start gap-space-2 p-space-5"
  style:--frame-h={`${height}px`}
>
  {#if bare}
    <div class="w-130 max-w-full">
      <LocationSection
        {dir}
        locked={false}
        machineId={mockMachine(answer)}
        machineName="obelisk-of-light"
        {mode}
        {...form}
        reading=""
        {repo}
      />
    </div>
  {:else}
    <NsPopoverGroup>
      <LocationChip
        {dir}
        locked={false}
        machineId={mockMachine(answer)}
        machineName="obelisk-of-light"
        {mode}
        onchange={(next) => {
          popover = next ? "location" : null;
        }}
        onclosefocus={() => false}
        oncommit={() => {
          popover = null;
        }}
        {...form}
        open={popover === "location"}
        reading=""
        {repo}
      />
      <LifetimeChip
        {ephemeral}
        onchange={(next) => {
          popover = next ? "lifetime" : null;
        }}
        onlifetime={(value) => {
          ephemeral = value;
        }}
        open={popover === "lifetime"}
      />
    </NsPopoverGroup>
  {/if}
</div>
