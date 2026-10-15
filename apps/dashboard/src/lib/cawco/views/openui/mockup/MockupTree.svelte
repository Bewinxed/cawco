<script lang="ts">
  /**
   * A mockup's program drawn by the one OpenUI binding (OpenUiRenderer),
   * with no tool provider: a mockup reads nothing. Mounted inside the
   * frame's shadow root for a project's own design, or in place for a
   * project drawn as CawCo (MockupFrame).
   */
  import type { OpenUIError } from "@openuidev/lang-core";
  import OpenUiRenderer, { type OpenUILibrary } from "../OpenUiRenderer.svelte";

  let {
    source,
    library,
    onError,
  }: {
    source: string;
    library: OpenUILibrary;
    onError: (errors: OpenUIError[]) => void;
  } = $props();
</script>

<OpenUiRenderer class="mk-root" {library} {onError} response={source} />
