<script lang="ts">
  import { spawnWords } from "@cawco/core";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  /**
   * Location as a composer chip: where the session works — an existing folder
   * or a repository to clone by its git URL — named on the chip, chosen in
   * its popover.
   * The popover is the same Location form the dialog used to show as its own
   * section, so browsing, override and clone behave exactly as they did.
   */
  import {
    IconChevronDown as Down,
    IconFolderGit as FolderGit,
    IconFolderOpen as FolderOpen,
  } from "#lib/icons.js";
  import LocationSection, {
    type LocationFields,
  } from "./LocationSection.svelte";
  import NsPopover from "./NsPopover.svelte";

  let {
    open,
    onchange,
    oncommit,
    onclosefocus,
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
    informational,
  }: {
    open: boolean;
    onchange: (open: boolean) => void;
    /** The location is set (Enter, or "Use this folder"); the popover closes. */
    oncommit: () => void;
    /** Where focus goes as the popover closes (NsPopover `onclosefocus`). */
    onclosefocus: () => boolean;
  } & LocationFields = $props();

  /** The last two segments are what tells two checkouts apart. */
  const short = (path: string) => {
    const parts = path.split("/").filter(Boolean);
    return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
  };
  const label = $derived.by(() => {
    if (mode === "repo") {
      return repo.trim() || spawnWords.location.cloneRepo;
    }
    return dir.trim() ? short(dir.trim()) : spawnWords.location.chooseFolder;
  });
  const empty = $derived(mode === "repo" ? !repo.trim() : !dir.trim());
</script>

<NsPopover
  gap={2}
  id="session-location"
  label={spawnWords.location.chip(label)}
  {onchange}
  {onclosefocus}
  {open}
  triggerClass={chipVariants({
    variant: "setting",
    tone: empty ? "muted" : undefined,
    // Never wider than its row: a long name ends in its ellipsis.
    class: "min-w-0",
  })}
  width={440}
>
  {#snippet trigger()}
    {#if mode === "repo"}
      <FolderGit class="text-hue-amber-500" />
    {:else}
      <FolderOpen class="text-hue-amber-500" />
    {/if}
    <span
      data-slot="chip-label"
      class="data-mono:font-(family-name:--font-mono)"
      data-mono={!empty || undefined}
      title={mode === "repo" ? repo : dir}>{label}</span
    >
    <Down data-slot="chevron" />
  {/snippet}
  <LocationSection
    {dir}
    embedded
    {informational}
    {locked}
    {machineId}
    {machineName}
    {mode}
    {oncommit}
    {ondir}
    {onmode}
    {onoverride}
    {onrepo}
    {reading}
    {repo}
  />
</NsPopover>
