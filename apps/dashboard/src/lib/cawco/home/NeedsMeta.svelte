<script lang="ts">
  /**
   * A Needs you row's last line where it is one plain line (a watch notice's,
   * a budget's, a pairing's): the kind, then where it is, in meta ink, cut
   * with an ellipsis, under the want line (NeedsRow's third row).
   */
  let { text }: { text: string } = $props();
</script>

<span
  data-slot="meta"
  class="pointer-events-none relative col-start-2 col-end-4 row-3 overflow-hidden type-meta text-ellipsis whitespace-nowrap text-ink-muted"
  >{text}</span
>
