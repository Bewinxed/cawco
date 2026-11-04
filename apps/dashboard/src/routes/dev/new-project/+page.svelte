<script lang="ts">
  /**
   * NEW PROJECT BENCH (dev only): New project with no hub, the fleet online,
   * for the decision page `onboarding-first-minutes`: `?under=cards|row|fold`
   * draws what stands under the field (NewProject `under`); `?words=` types
   * the person's words in, `?tapped=` picks a template.
   */
  import NewProject from "#lib/cawco/project/NewProject.svelte";
  import { TEMPLATE_CARDS } from "#lib/cawco/project/new-project.js";
  import { page } from "$app/state";

  const query = page.url.searchParams;
  const UNDER = ["cards", "row", "fold"] as const;
  const under = UNDER.find((one) => one === query.get("under")) ?? "cards";
  const tapped =
    TEMPLATE_CARDS.find((card) => card.template === query.get("tapped"))
      ?.template ?? null;
</script>

<div class="h-dvh overflow-y-auto bg-background">
  <NewProject
    create={() => new Promise(() => undefined)}
    fleet="online"
    onmachines={() => undefined}
    onmade={() => undefined}
    {tapped}
    {under}
    words={query.get("words") ?? ""}
  />
</div>
