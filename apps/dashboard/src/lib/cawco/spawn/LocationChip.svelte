<script lang="ts">
  import { isGitUrl, repoIdentity, repoPath } from "@cawco/core/protocol";
  import { spawnWords } from "@cawco/core/words/spawn";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  /**
   * Location as a composer chip: where the session works, a repository
   * cloned for it or an existing folder, named on the chip and chosen in its
   * popover (LocationSection). A repository is named `owner/name`, beside
   * GitHub's mark when it is on GitHub; a folder by its path.
   */
  import {
    IconChevronDown as Down,
    IconFolderGit as FolderGit,
    IconFolderOpen as FolderOpen,
  } from "#lib/icons.js";
  import { morph } from "#lib/platform/motion/morph.svelte.js";
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
  const picked = $derived(isGitUrl(repo) ? repo.trim() : "");
  const onGithub = $derived(
    !picked || repoIdentity(picked).startsWith("github.com/")
  );
  const label = $derived.by(() => {
    if (mode === "repo") {
      return picked ? repoPath(picked) : spawnWords.location.chooseRepo;
    }
    return dir.trim() ? short(dir.trim()) : spawnWords.location.chooseFolder;
  });
  const empty = $derived(mode === "repo" ? !picked : !dir.trim());
</script>

<NsPopover
  gap={2}
  id="session-location"
  label={spawnWords.location.chip(label)}
  {onchange}
  {onclosefocus}
  {open}
  prebuild
  triggerClass={chipVariants({
    variant: "setting",
    tone: empty ? "muted" : undefined,
    // Never wider than its row: a long name ends in its ellipsis.
    class: "min-w-0",
  })}
  tall
  width="calc(var(--spacing) * 80)"
>
  {#snippet trigger()}
    {#if mode === "repo" && onGithub}
      <ProviderLogo provider="github" />
    {:else if mode === "repo"}
      <FolderGit class="text-mark-3" />
    {:else}
      <FolderOpen class="text-mark-3" />
    {/if}
    <!-- A folder is a path, set in the mono face; a repository is a name. -->
    <span
      data-slot="chip-label"
      class="data-mono:font-(family-name:--font-mono)"
      data-mono={(mode === "dir" && !empty) || undefined}
      title={mode === "repo" ? picked : dir}
      {@attach morph({ width: true, on: ["data-mono"] })}>{label}</span
    >
    <Down data-slot="chevron" />
  {/snippet}
  <LocationSection
    {dir}
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
    shown={open}
  />
</NsPopover>
