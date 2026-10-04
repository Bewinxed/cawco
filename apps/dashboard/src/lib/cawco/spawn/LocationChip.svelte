<script lang="ts">
  /**
   * Location as a composer chip: where the session works — an existing folder
   * or a GitHub repo to clone — named on the chip, chosen in its popover.
   * The popover is the same Location form the dialog used to show as its own
   * section, so browsing, override and clone behave exactly as they did.
   */
  import GitHub from "~icons/logos/github-icon";
  import Down from "~icons/solar/alt-arrow-down-linear";
  import FolderOpen from "~icons/solar/folder-open-bold-duotone";
  import LocationSection from "./LocationSection.svelte";
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
    mode: "dir" | "repo";
    onmode: (mode: "dir" | "repo") => void;
    dir: string;
    ondir: (dir: string) => void;
    locked: boolean;
    onoverride: () => void;
    repo: string;
    onrepo: (repo: string) => void;
    machineId: string;
    machineName: string;
    reading: string;
    informational: boolean;
  } = $props();

  /** The last two segments are what tells two checkouts apart. */
  const short = (path: string) => {
    const parts = path.split("/").filter(Boolean);
    return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
  };
  const label = $derived.by(() => {
    if (mode === "repo") {
      return repo.trim() || "Clone from GitHub";
    }
    return dir.trim() ? short(dir.trim()) : "Choose folder";
  });
  const empty = $derived(mode === "repo" ? !repo.trim() : !dir.trim());
</script>

<NsPopover
  gap={2}
  id="session-location"
  label={`Location: ${label}`}
  {onchange}
  {onclosefocus}
  {open}
  triggerClass="ns-chip-btn"
  triggerStyle={empty ? "color:var(--ink-muted)" : ""}
  width={440}
>
  {#snippet trigger()}
    {#if mode === "repo"}
      <GitHub />
    {:else}
      <FolderOpen style="color:var(--hue-amber-500)" />
    {/if}
    <span
      class="chip-label"
      title={mode === "repo" ? repo : dir}
      class:mono={!empty}
      >{label}</span
    >
    <Down class="chevron" />
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

<style>
  .mono {
    font-family: var(--font-mono);
  }
</style>
