<script lang="ts">
  /**
   * The location chip and its popover as the New session form holds them
   * (LocationPicker.stories.ts): the real LocationChip, open under its chip,
   * on a bench's hub whose machine answers its gh and its folders from
   * location-mock.ts. A pick, a paste, a switch to Folder or a typed path
   * changes what the form would hold, as its own handlers do.
   */
  import { type BenchFs, standSocket } from "../hub/socket.svelte";
  import LifetimeChip from "./LifetimeChip.svelte";
  import LocationChip from "./LocationChip.svelte";
  import LocationSection from "./LocationSection.svelte";
  import {
    filesOf,
    type MockAnswer,
    mockMachine,
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
  } = $props();

  const files: BenchFs = (_machineId, op, path) => filesOf(op, path);
  standSocket({
    hub: () => undefined,
    spawn: null,
    control: (machineId, method) =>
      method === "ghRepos" ? reposOf(machineId) : null,
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
</script>

<div
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
