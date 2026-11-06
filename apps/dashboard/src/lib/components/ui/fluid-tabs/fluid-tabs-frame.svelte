<script lang="ts">
  /**
   * The fluid track (Tabs, TabsList, TabItem) in a frame of its own, on a
   * page's ground: the segmented groove, its chosen segment a lifted sheet
   * placed from the tabs' measures, its hover the kit ghost, its focus ring
   * an overlay placed on `focusin`. `size` is the ladder's step; `glyphs`
   * draws each tab's glyph alone, its name its accessible name.
   */
  import { IconInteract, IconPen, IconPin } from "#lib/icons.js";
  import { TabItem, Tabs, TabsList } from "./index.js";

  type Mode = "interact" | "comment" | "draw";

  let {
    size = "default",
    glyphs = false,
    chosen = "interact",
  }: {
    /** The size ladder's step: 36px, or 28px compact. */
    size?: "default" | "compact";
    /** Each tab its glyph alone. */
    glyphs?: boolean;
    /** The chosen tab. */
    chosen?: Mode;
  } = $props();

  const TABS = [
    { value: "interact", label: "Interact", icon: IconInteract },
    { value: "comment", label: "Comment", icon: IconPin },
    { value: "draw", label: "Draw", icon: IconPen },
  ] as const;

  // The story's tab until a press picks another (house/follows-props).
  let value = $derived<string>(chosen);
</script>

<div class="flex bg-surface-page p-space-5">
  <Tabs
    onValueChange={(next) => {
      value = next;
    }}
    {size}
    {value}
    values={TABS.map((one) => one.value)}
  >
    <TabsList aria-label="Mode">
      {#each TABS as one (one.value)}
        <TabItem
          glyphOnly={glyphs}
          icon={one.icon}
          label={one.label}
          value={one.value}
        />
      {/each}
    </TabsList>
  </Tabs>
</div>
