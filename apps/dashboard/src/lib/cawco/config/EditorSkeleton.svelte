<script lang="ts">
  /**
   * An editor before its row is read: the editor's own frame, footer and
   * all, standing at the height that editor settled at last time (cards),
   * with skeleton rows where its sections will be. The editor arrives into
   * the same layout (EditorRoute). If the hub refused the read, it says so
   * where the sections would be.
   */
  import { goto } from "$app/navigation";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import EditorFrame from "./EditorFrame.svelte";
  import type { ConfigSection } from "./sections";

  let {
    section,
    saveLabel,
    problem,
  }: {
    section: ConfigSection;
    /** The label the editor's Save will carry. */
    saveLabel: string;
    /** Why the row could not be read, or null while it is on its way. */
    problem: string | null;
  } = $props();
</script>

<EditorFrame
  canSave={false}
  oncancel={() => goto(`/config/${section.slug}`)}
  onsubmit={() => undefined}
  {saveLabel}
  saving={false}
  settling={problem === null}
  title={section.label}
>
  {#snippet header()}
    <!-- The title field's 29px line. -->
    <Skeleton class="h-[29px] w-2/5" />
  {/snippet}
  {#if problem}
    <Alert.Root variant="destructive">
      <IconWarningTriangle />
      <Alert.Description>{problem}</Alert.Description>
    </Alert.Root>
  {/if}
</EditorFrame>
