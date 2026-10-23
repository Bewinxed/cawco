<script lang="ts">
  /**
   * The preview's loading cover with its line, for the preview-cover probe:
   * the real CoverState in a box drawn as PreviewPane's cover is
   * (`data-slot="cover"`: the recess, `space-5` in), `?w=` px wide (the
   * window's width unless named), saying a sheet's stage starting in
   * `?dir=`, or `?line=` alone.
   */
  import CoverState from "#lib/cawco/preview/CoverState.svelte";
  import { page } from "$app/state";

  const asked = page.url.searchParams.get("w");
  const dir = page.url.searchParams.get("dir");
  const line = page.url.searchParams.get("line") ?? "";
</script>

<div
  data-bench="cover"
  class="group/cover relative h-dvh w-(--pane-w) max-w-full p-space-5 bg-surface-recess"
  style:--pane-w={asked ? `${Number(asked)}px` : "100%"}
>
  <CoverState waiting={dir === null ? { line } : { dir }} />
</div>
