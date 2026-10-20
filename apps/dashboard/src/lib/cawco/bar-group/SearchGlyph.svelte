<script lang="ts">
  /**
   * Jump's search glyph redrawn for the bar's group, in the cut the group's
   * other symbols are drawn in (Solar bold-duotone: a half-ink body with
   * full-ink detail on it, as the server's slabs carry their marks and the
   * folder its front). Every lens Solar ships in that cut
   * (`magnifer-bold-duotone`, `magnifier-bold-duotone`, their minimalistic
   * and rounded twins) is a plain half-ink disc and a handle, which at the
   * group's 20px reads as a solid disc beside the server and the folder.
   * This one keeps `magnifer-bold-duotone`'s disc and handle, to the unit,
   * and adds the detail those lack: a full-ink glint on the lens's upper
   * left, 1.5 units wide as Solar's strokes are.
   */
  let { class: className }: { class?: string } = $props();
</script>

<svg
  aria-hidden="true"
  class={className}
  data-search-glyph
  height="1em"
  viewBox="0 0 24 24"
  width="1em"
>
  <path
    d="M20.313 11.157a9.157 9.157 0 1 1-18.313 0a9.157 9.157 0 0 1 18.313 0"
    fill="currentColor"
    opacity=".5"
  />
  <path
    d="m17.1 18.122l3.666 3.666a.723.723 0 0 0 1.023-1.022L18.122 17.1a9 9 0 0 1-1.022 1.022"
    fill="currentColor"
  />
  <path
    d="M5.741 10.202A5.5 5.5 0 0 1 10.202 5.741"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-width="1.5"
  />
</svg>
