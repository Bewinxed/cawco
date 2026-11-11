<script lang="ts">
  /**
   * The delegate-type editor as Configure's pane holds it, for its states
   * file: the config store the area's layout provides (never read here: a
   * story saves nothing), and the pane's recessed column round the editor.
   */
  import { onMount, tick } from "svelte";
  import type { DelegateType } from "../../delegate-types";
  import { ConfigStore, provideConfig } from "../store.svelte";
  import DelegateTypeEditor from "./DelegateTypeEditor.svelte";

  let {
    type,
    taken,
    left = [],
  }: { type: DelegateType | null; taken: string[]; left?: string[] } = $props();

  provideConfig(new ConfigStore());

  onMount(async () => {
    await tick();
    for (const id of left) {
      document.getElementById(id)?.dispatchEvent(new FocusEvent("blur"));
    }
  });
</script>

<div class="flex min-h-0 min-w-0 flex-auto flex-col bg-surface-recess">
  <DelegateTypeEditor {taken} {type} />
</div>
