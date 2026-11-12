<script lang="ts">
  /**
   * Files, the item the top bar's glass group leads with (GlassCard's
   * surface brief, "The top bar's glass, Caw's head and its cards"): the folder as the group's bar symbol in its
   * muted ink and, once there is anything, the number beside it as the
   * machines show theirs (BarItem's `count`): the
   * number in the label role, `--spacing-space-2` past the folder, never on its
   * ink, so the folder keeps its shape (owner: "the count is bigger than
   * the icon … can't u put it as part of the integrated icon group?").
   * The folder is Solar's bold-duotone `folder-2`: its front at full ink
   * under a half-ink tab, a folder at 20px where `folder-with-files` read
   * as a half-ink square. A press shows Files in the glass's one card
   * (GlassCard), or shuts it.
   */
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { IconFilesLinear } from "#lib/icons.js";
  import { barGlass } from "../bar-glass.svelte";

  let {
    count,
  }: {
    /** Its artifacts and attachments, once both lists are read. */
    count: number | null;
  } = $props();

  /* The number only above 0 (DESIGN.md, The Earned Count Rule). */
  const label = $derived(
    count !== null && count > 0 ? `Files, ${count}` : "Files"
  );
</script>

<BarItem
  aria-haspopup="dialog"
  {count}
  data-files-control
  data-glass-opens="files"
  expanded={barGlass.open === "files"}
  icon={IconFilesLinear}
  {label}
  onclick={() => barGlass.toggle("files")}
  tip="Files"
/>
