<script lang="ts">
  /**
   * The states file's seam (FilesList.stories.ts): one session's Files as
   * the bar's card holds it, its reads answered by the page's fetch
   * (files-fixture `answerFiles`). A press that leaves Files (a pick, Show
   * in conversation, Ask, Attach) goes nowhere here.
   */
  import FilesList from "./FilesList.svelte";
  import { type ArtifactsView, artifactsView } from "./files.svelte";
  import { answerFiles } from "./files-fixture";

  let {
    session,
    view = "thumbnails",
    segmented = false,
  }: {
    /** The session whose Files these are (files-fixture `SESSIONS`). */
    session: string;
    /** The artifacts as thumbnails or a list, as the person last picked. */
    view?: ArtifactsView;
    segmented?: boolean;
  } = $props();
  answerFiles();
  $effect.pre(() => {
    artifactsView.set(view);
  });
  const none = () => undefined;
</script>

<div class="flex h-120 min-h-0 flex-col p-space-2">
  <FilesList
    instanceId={session}
    onask={none}
    onattach={none}
    onpick={none}
    onshow={none}
    {segmented}
  />
</div>
