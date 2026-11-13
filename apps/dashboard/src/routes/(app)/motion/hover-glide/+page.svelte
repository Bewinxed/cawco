<script lang="ts">
  import type { ProjectRow } from "#lib/cawco/projects.js";
  /**
   * The kit highlight's hover ghost in each place it glides, for its glide's
   * proof in one Chromium session over the DevTools protocol: the Animation
   * domain's runs as the pointer goes down the rail (each a `transform` on
   * --duration-ghost and --ease-in-out, the fade an `opacity` on --duration-control),
   * a Performance trace of that hover at 4x CPU (no non-composited run of
   * the highlight's, no forced layout from it), and the glide paused at its
   * midpoint across the widest change of size, the tabs'. The rail is the
   * Shell's own Sidebar, its Projects list stood in from the client's own
   * state (`__cawcoDebug`: twenty projects, the fleet read with no machine
   * online), so it holds a twenty-row list; on the page, the fluid tabs
   * (labels of every length), a command list, a select and a menu.
   * `?open=select` or `?open=menu` opens that one.
   */

  import * as Command from "#lib/components/ui/command/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import * as Select from "#lib/components/ui/select/index.js";
  import { page } from "$app/state";

  const NAMES = [
    "cockpit",
    "landing",
    "billing-service",
    "ios-app",
    "docs",
    "design-system",
    "hub",
    "agent",
    "release-tools",
    "onboarding-flow",
    "marketing-site",
    "data-pipeline",
    "search",
    "notifications",
    "payments-webhooks",
    "admin",
    "analytics-dashboard",
    "cli",
    "sandbox",
    "infra",
  ];
  const debug = window.__cawcoDebug;
  debug.projectsState.projects = NAMES.map((name, n): ProjectRow => ({
    account: null,
    accountAtLimit: "wait",
    cawHarness: "claude",
    cawModel: null,
    conversationInstanceId: null,
    createdAt: "2026-10-01T09:00:00Z",
    eventsOn: false,
    id: `p${n}`,
    lands: "main",
    lfsConnection: null,
    lfsUrl: null,
    links: [],
    name,
    places: [],
    primaryPlaceId: null,
    review: false,
  }));
  debug.projectsState.projectsRead = true;
  debug.boardState.fleetRead = true;

  const open = $derived(page.url.searchParams.get("open"));
  const TABS = [
    ["plan", "Plan"],
    ["preview", "Preview"],
    ["changes", "Changes across every repository"],
    ["log", "Log"],
    ["tasks", "Tasks"],
  ] as const;
  const MODELS = [
    "Opus 4.5",
    "Sonnet 4.5",
    "Haiku 4.5",
    "GPT-5 Codex",
    "Gemini 3 Pro",
    "DeepSeek V4 Pro",
    "Kimi K3",
    "Qwen 3 Coder",
  ];
  let chosen = $state("Sonnet 4.5");
</script>

<div class="flex flex-col gap-space-6 p-space-6" data-bench="hover-glide">
  <section data-part="tabs">
    <Tabs value="plan">
      <TabsList aria-label="Panel">
        {#each TABS as [value, label] (value)}
          <TabItem {label} {value} />
        {/each}
      </TabsList>
    </Tabs>
  </section>

  <section class="w-c-pin-card-w max-w-full" data-part="command">
    <Command.Root>
      <Command.List>
        <Command.Group heading="Models">
          {#each MODELS as model (model)}
            <Command.Item value={model}>{model}</Command.Item>
          {/each}
        </Command.Group>
      </Command.List>
    </Command.Root>
  </section>

  <section class="flex gap-space-4" data-part="overlays">
    <Select.Root open={open === "select"} type="single" bind:value={chosen}>
      <Select.Trigger data-open="select" look="field">{chosen}</Select.Trigger>
      <Select.Content>
        {#each MODELS as model (model)}
          <Select.Item label={model} value={model} />
        {/each}
      </Select.Content>
    </Select.Root>
    <DropdownMenu.Root open={open === "menu"}>
      <DropdownMenu.Trigger data-open="menu" size="sm" variant="outline"
        >Session</DropdownMenu.Trigger
      >
      <DropdownMenu.Content>
        <DropdownMenu.Item>Rename</DropdownMenu.Item>
        <DropdownMenu.Item>Open in a new tab</DropdownMenu.Item>
        <DropdownMenu.Item>Copy the session's link</DropdownMenu.Item>
        <DropdownMenu.Item>Archive</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </section>
</div>
