<script lang="ts">
  /**
   * The project page around an Outcomes prototype, as the page ships: its
   * dock (Caw's conversation docks at 600 beside the page), its head with
   * Caw seated, the view strip from 640 (the views as tabs, Needs you, and
   * the view's own act in the slot New task takes on the Board), the views'
   * bar under 640, and the pane's inset, where the prototype's view stands.
   * The project is "cockpit". The pane's snippet is handed the way to open
   * Caw's conversation, for any act that goes through Caw.
   */
  import { HOUR_MS } from "@cawco/core/time";
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import CawFloat from "#lib/cawco/project/CawFloat.svelte";
  import { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import NeedsYouChip from "#lib/cawco/project/NeedsYouChip.svelte";
  import ProjectDock from "#lib/cawco/project/ProjectDock.svelte";
  import ProjectHead from "#lib/cawco/project/ProjectHead.svelte";
  import { PANE_INSET } from "#lib/cawco/project/pane-inset.js";
  import ViewBar, { type BarView } from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import type { ProjectRow } from "#lib/cawco/projects.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { IconPlus } from "#lib/icons.js";

  let {
    view,
    act,
    needs,
    conversation = false,
    pane,
  }: {
    /** The Outcomes view's name in the tabs. */
    view: string;
    /** The view's own act in the strip, which opens Caw's conversation. */
    act: string;
    /** What waits on him across the project. */
    needs: number;
    /** Caw's conversation stands open beside the page. */
    conversation?: boolean;
    pane: Snippet<[() => void]>;
  } = $props();

  const PROJECT: ProjectRow = {
    id: "cockpit",
    name: "cockpit",
    account: null,
    accountAtLimit: "wait",
    cawHarness: "claude",
    cawModel: null,
    conversationInstanceId: null,
    createdAt: new Date(Date.now() - 24 * 30 * HOUR_MS).toISOString(),
    eventsOn: true,
    lands: "main",
    lfsConnection: null,
    lfsUrl: null,
    links: ["github.com/bewinxed/cockpit"],
    places: [],
    primaryPlaceId: null,
    review: true,
  };
  const lead = new CawLead({
    id: () => PROJECT.id,
    machinesOnline: () => true,
    project: () => PROJECT,
    reading: () => false,
    tasks: () => [],
  });
  $effect(() => {
    lead.open = conversation;
  });
  const docked = $derived(lead.open && lead.anchor !== null);
  const askCaw = () => {
    lead.open = true;
  };

  const views = $derived<BarView[]>([
    { value: "board", label: "Board", draft: false, count: 0 },
    { value: "table", label: "Table", draft: false, count: 0 },
    { value: "outcomes", label: view, draft: false, count: 0 },
    { value: "routines", label: "Routines", draft: false, count: 0 },
    { value: "decisions", label: "Decisions", draft: false, count: 0 },
  ]);
  const phone = new MediaQuery(PHONE_QUERY, false);
  let current = $state("outcomes");
  let needsOn = $state(false);
  const choose = (next: string) => {
    current = next;
  };
  const toggleNeeds = () => {
    needsOn = !needsOn;
  };
</script>

<div class="flex h-dvh w-dvw min-h-0 flex-col bg-surface-page">
  <ProjectDock {docked} preview={false}>
    {#snippet page()}
      <div class="relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <div
          class="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          data-project-page
          data-slot="project-page"
        >
          <ProjectHead
            {lead}
            machine={null}
            onask={null}
            onfilter={() => undefined}
            onnewtask={null}
            project={PROJECT}
            seated
            setup={null}
          />
          {#if !phone.current}
            <div
              class="flex min-w-0 items-center gap-space-3 pt-0 pe-space-6 pb-space-4 ps-space-7 max-desk:px-space-5"
              data-slot="strip"
            >
              <ViewTabs
                {current}
                hrefOf={(next) => `#${next}`}
                onchoose={choose}
                {views}
              />
              <span
                aria-hidden="true"
                class="h-c-btn-h-sm w-px flex-none bg-border-hairline"
              ></span>
              <div
                class="flex flex-none items-center gap-space-2"
                data-form="compact"
              >
                {#if needs > 0}
                  <NeedsYouChip
                    count={needs}
                    on={needsOn}
                    ontoggle={toggleNeeds}
                  />
                {/if}
                <Button
                  icon={IconPlus}
                  label={act}
                  onclick={askCaw}
                  press="pressable"
                  size="sm"
                  variant="ghost"
                />
              </div>
            </div>
          {/if}
          <div
            class={[
              "flex min-h-0 flex-1 flex-col pb-space-5 max-phone:pb-(--bar-reach)",
              PANE_INSET,
            ]}
            data-safe-bottom
            data-slot="pane"
            style:--bar-reach={"calc(var(--spacing-c-composer-panel) + var(--spacing-space-4) + var(--safe-bottom) + var(--spacing-space-3))"}
          >
            {@render pane(askCaw)}
          </div>
        </div>
        {#if phone.current}
          <ViewBar
            {current}
            {needs}
            {needsOn}
            onchoose={choose}
            onnewsession={() => undefined}
            ontoggleneeds={toggleNeeds}
            {views}
          />
        {/if}
      </div>
    {/snippet}
    {#snippet dock()}
      <CawFloat
        front
        {lead}
        projectId={PROJECT.id}
        projectName={PROJECT.name}
      />
    {/snippet}
  </ProjectDock>
</div>
