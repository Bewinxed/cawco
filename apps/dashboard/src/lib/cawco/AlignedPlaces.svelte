<script lang="ts">
  /**
   * The places brought to DESIGN.md's The Alignment Rule, each the real
   * component standing in its surface's own padding, for their states file
   * (AlignedPlaces.stories.ts). The app never mounts it.
   *
   * - `hero`: Caw's panel before a conversation (ConversationHero), in the
   *   panel's pane with its own composer docked under it, as
   *   ProjectConversation draws them: the panel's width at a desk, the
   *   sheet's on a phone.
   * - `machines`: the fleet with no machine (MachinesEmpty `none`), in the
   *   wide screen's empty detail (SessionSurface).
   * - `new-project`: New project with no machine joined (NewProject), the
   *   page bringing its own padding.
   * - `board-panel`: the empty board while Caw's panel holds the starters
   *   (EmptyOnAxis `panel`), in the project page's pane inset.
   */
  import { onboardingWords } from "@cawco/core/words/onboarding";
  import EmptyOnAxis from "#lib/components/ui/empty/EmptyOnAxis.svelte";
  import MachinesEmpty from "./MachinesEmpty.svelte";
  import ConversationHero from "./project/ConversationHero.svelte";
  import NewProject from "./project/NewProject.svelte";
  import ProjectPaneFrame from "./project/ProjectPaneFrame.svelte";
  import Composer from "./transcript/Composer.svelte";
  import { ComposerDraft } from "./transcript/composer-draft.svelte";
  import { composerFleet } from "./transcript/composer-fleet.js";

  let {
    place,
  }: {
    place: "hero" | "machines" | "new-project" | "board-panel";
  } = $props();

  const STARTERS = [
    { glyph: "stages", text: "Set up the stages this launch moves through" },
    {
      glyph: "tasks",
      text: "Turn the open issues on the pricing page into tasks",
    },
    { glyph: "routine", text: "Check the build every morning before standup" },
  ] as const;

  /** The panel's room under the hero for its composer (ProjectConversation `reserved`, before the composer has measured its foot). */
  const RESERVED =
    "calc(var(--spacing-space-4) + var(--safe-bottom) + var(--spacing-c-composer-panel) + var(--spacing-space-2))";

  const draft = new ComposerDraft();
  /** A send that waits: the story never leaves the page. */
  const waits = () => new Promise<never>(() => undefined);
</script>

{#if place === "hero"}
  <div
    data-slot="panel"
    class="flex h-c-caw-panel-h w-c-panel-w max-w-full flex-col overflow-hidden rounded-modal bg-surface-raised shadow-tile max-desk:w-full max-desk:rounded-none"
  >
    <div
      data-slot="pane"
      class="@container relative flex min-h-0 min-w-0 flex-auto flex-col bg-surface-recess pb-(--reserved)"
      style:--composer-clearance="var(--spacing-space-4)"
      style:--reserved={RESERVED}
    >
      <ConversationHero
        off={false}
        onpick={(text) => draft.press(text, "board")}
        projectName="Pricing page launch"
        starters={[...STARTERS]}
      />
      <div
        data-slot="composer-dock"
        class="pointer-events-none absolute inset-0 z-1"
      >
        <Composer
          agentName="Caw"
          {draft}
          fleet={composerFleet}
          onstop={() => undefined}
          onsubmit={() => undefined}
          paneVisible
          placeholder="Message Caw…"
          sendError=""
          sending={false}
        />
      </div>
    </div>
  </div>
{:else if place === "machines"}
  <div
    class="flex min-h-dvh items-start justify-center bg-surface-recess px-space-6 pt-(--pad-top) pb-space-8"
    style:--pad-top="calc(var(--spacing-space-8) * 2)"
  >
    <MachinesEmpty fleet="none" />
  </div>
{:else if place === "new-project"}
  <NewProject
    create={waits}
    fleet="none"
    onmachines={() => undefined}
    onmade={() => undefined}
    words={onboardingWords.templateAsks.social}
  />
{:else}
  <ProjectPaneFrame>
    <EmptyOnAxis look="panel" />
  </ProjectPaneFrame>
{/if}
