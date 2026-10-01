<script lang="ts">
  /**
   * The agent vendor's mark, drawn monochrome in `currentColor` — DESIGN.md keeps
   * item marks graphite, so this is a glyph, never a colour logo. It identifies
   * WHICH agent runs a session (cube = Claude, chevrons = opencode/code, the pi
   * bar = pi); the container's hue is what tells two sessions of the same vendor
   * apart. Paths come from `harnessGlyphPath`, sized by the `.mark`/`.tm` slot it
   * sits in, exactly as the sprites it replaces were.
   */
  import { harnessGlyphPath } from "./mark";

  let { harness }: { harness?: string | null } = $props();

  const d = $derived(harnessGlyphPath(harness));
</script>

<svg
  aria-hidden="true"
  fill="none"
  stroke="currentColor"
  stroke-linecap="round"
  stroke-linejoin="round"
  stroke-width="2"
  viewBox="0 0 24 24"
>
  <path {d} />
</svg>
