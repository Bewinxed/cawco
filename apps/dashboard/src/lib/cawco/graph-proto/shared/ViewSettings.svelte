<script lang="ts">
  import { graphProtoWords as words } from "@cawco/core/words/graph-proto";
  import { SYMBOL } from "#lib/cawco/preview/graph/symbol.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { IconMonitor } from "#lib/icons.js";
  import type { Judge } from "./judge.svelte";
  import { PRODUCTION_WIDTH } from "./review.svelte";

  /** View settings (T11): scheme, width and motion for the live component, the production width first. */
  let { judge }: { judge: Judge } = $props();
  const WIDTHS = [PRODUCTION_WIDTH, 390, 680].filter(
    (one, at, all) => all.indexOf(one) === at
  );
</script>

<Popover.Root>
  <Popover.Trigger
    aria-label={words.viewSettings}
    class={SYMBOL}
    title={words.viewSettings}><IconMonitor /></Popover.Trigger
  >
  <Popover.Content align="end" width="wide">
    <div class="flex flex-col gap-space-3 p-space-1" data-view-settings>
      <div class="flex flex-col gap-space-1">
        <span class="type-meta text-ink-muted">{words.scheme}</span>
        <Tabs
          onValueChange={(value) => {
            judge.scheme = value === "dark" ? "dark" : "light";
          }}
          size="compact"
          value={judge.scheme}
        >
          <TabsList aria-label={words.scheme}>
            <TabItem label={words.light} value="light" />
            <TabItem label={words.dark} value="dark" />
          </TabsList>
        </Tabs>
      </div>
      <div class="flex flex-col gap-space-1">
        <span class="type-meta text-ink-muted">{words.width}</span>
        <Tabs
          onValueChange={(value) => {
            judge.width = Number(value);
          }}
          size="compact"
          value={String(judge.width)}
        >
          <TabsList aria-label={words.width}>
            {#each WIDTHS as width (width)}
              <TabItem
                label={width === PRODUCTION_WIDTH
                  ? words.ownWidth(width)
                  : String(width)}
                value={String(width)}
              />
            {/each}
          </TabsList>
        </Tabs>
      </div>
      <label class="flex items-center justify-between gap-space-3">
        <span class="type-label text-ink-strong">{words.reduceMotion}</span>
        <Switch bind:checked={judge.reduced} size="sm" />
      </label>
    </div>
  </Popover.Content>
</Popover.Root>
