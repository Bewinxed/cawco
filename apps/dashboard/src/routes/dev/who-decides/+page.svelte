<script lang="ts">
  import PageFixture from "#lib/cawco/decides/preview/PageFixture.svelte";
  /**
   * WHO DECIDES (dev only): the page whole on its fixtures, in the
   * situation `?state=` names (an export of WhoDecides.stories.ts; his
   * fleet as it stands when none), dark unless `?scheme=light`, its cards
   * and lists floating as on the page. Every control works; nothing
   * reaches a hub.
   */
  import {
    AddingAKind,
    AddingAnAgent,
    AddingWithNothingFilledIn,
    AdvisorsCard,
    AgentCantRun,
    CawsCard,
    DidntLoad,
    FileDoesntRead,
    HandingScopeOver,
    ProjectHandedKindsOver,
    RemovingAKind,
    YourFleet,
  } from "#lib/cawco/decides/WhoDecides.stories.js";
  import { page } from "$app/state";

  interface Story {
    args?: Record<string, unknown>;
    name: string;
  }
  const STORIES: Record<string, Story> = {
    YourFleet,
    HandingScopeOver,
    AdvisorsCard,
    AddingAnAgent,
    AddingWithNothingFilledIn,
    ProjectHandedKindsOver,
    CawsCard,
    AgentCantRun,
    AddingAKind,
    RemovingAKind,
    DidntLoad,
    FileDoesntRead,
  };
  const story = $derived(
    STORIES[page.url.searchParams.get("state") ?? "YourFleet"] ?? YourFleet
  );
  $effect(() => {
    document.documentElement.classList.toggle(
      "dark",
      page.url.searchParams.get("scheme") !== "light"
    );
  });
</script>

{#key story}
  <PageFixture {...story.args ?? {}} inPlace={false} />
{/key}
