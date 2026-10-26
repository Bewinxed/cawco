<script lang="ts">
  /**
   * Who decides as a table (core decides.ts): one
   * row per kind, its name and its one-line example, and the segmented four
   * of its route (You · An advisor · Common practice · The agent), the
   * chosen one on the thumb. A project's table (`fleet` given) says
   * "Fleet default" beside a row whose route is the fleet's. Where the table
   * is wide the choices stand at the row's end; narrower, each row stacks:
   * the kind, then its choices.
   *
   * A press asks at once: the row's segments breathe until the caller's
   * write answers (`pending`), and its refusal stands under that row with
   * Try again (RowFault), as Work lands does in Project details.
   */
  import {
    DECIDES_ROUTES,
    DECISION_KIND_WORDS,
    DECISION_KINDS,
    type DecidesRoute,
    type DecisionKind,
    ROUTE_WORDS,
  } from "@cawco/core";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";

  let {
    routes,
    fleet = null,
    pending = null,
    fault = null,
    label,
    narrow = "short",
    onchange,
  }: {
    /** Each kind's route as shown now. */
    routes: Record<DecisionKind, DecidesRoute>;
    /** The fleet's routes, for a project's table; null in the fleet's own. */
    fleet?: Record<DecisionKind, DecidesRoute> | null;
    /** The kind whose route is being written, and to what. */
    pending?: { kind: DecisionKind; route: DecidesRoute } | null;
    /** The last write's refusal, on its row. */
    fault?: {
      kind: DecisionKind;
      route: DecidesRoute;
      reason: string;
    } | null;
    /** The table's name for assistive tech. */
    label: string;
    /**
     * Where the four don't fit their row (under 352px of table): their
     * short labels, a menu of them, or the row scrolling sideways. The
     * owner's pick is open (the Who decides bench); the others go once he
     * picks.
     */
    narrow?: "short" | "menu" | "scroll";
    onchange: (kind: DecisionKind, route: DecidesRoute) => void;
  } = $props();

  const uid = $props.id();

  /** Each route in a word, for a row too narrow for the four in full. */
  const SHORT: Record<DecidesRoute, string> = {
    you: "You",
    advisor: "Advisor",
    practice: "Practice",
    agent: "Agent",
  };
</script>

<!-- biome-ignore-start lint/a11y/noRedundantRoles : WebKit drops list semantics when list styles are removed; an explicit role="list" keeps them (scottohara.me/blog/2019/01/12/lists-and-safari.html) -->
<ul
  aria-label={label}
  class="@container/decides m-0 flex list-none flex-col p-0"
  data-slot="who-decides"
  role="list"
>
  <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
  {#each DECISION_KINDS as kind, at (kind)}
    {@const shown = pending?.kind === kind ? pending.route : routes[kind]}
    {@const words = DECISION_KIND_WORDS[kind]}
    <li
      class="grid min-w-0 grid-cols-1 items-center gap-x-space-4 gap-y-space-2 border-border-hairline py-space-3 not-first:border-t @decides-side/decides:grid-cols-(--decides-cols)"
      data-kind={kind}
      style:--decides-cols="minmax(0, 1fr) max-content"
    >
      <div class="flex min-w-0 flex-col gap-space-row">
        <p class="flex min-w-0 flex-wrap items-baseline gap-x-space-2">
          <span class="type-label text-ink-strong" id="{uid}-kind-{at}"
            >{words.name}</span
          >
          {#if fleet && shown === fleet[kind]}
            <span class="type-meta text-ink-subtle" data-fleet-default
              >Fleet default</span
            >
          {/if}
        </p>
        <span class="type-meta text-pretty text-ink-muted">{words.example}</span
        >
      </div>
      <div
        class="flex min-w-0 flex-col gap-space-1 @decides-side/decides:items-end"
      >
        <!-- A group wider than its row scrolls in its own row (ToggleGroup: it never wraps); under 352px the short labels or the menu stand instead, by `narrow`. -->
        <div
          class={[
            "max-w-full overflow-x-auto overscroll-x-contain",
            narrow === "menu" && "@max-decides-full/decides:hidden",
          ]}
        >
          <ToggleGroup.Root
            aria-labelledby="{uid}-kind-{at}"
            data-pending={pending?.kind === kind ? "" : undefined}
            type="single"
            bind:value={
              () => shown,
              (next) => {
                if (next && next !== routes[kind]) {
                  onchange(kind, next as DecidesRoute);
                }
              }
            }
          >
            {#each DECIDES_ROUTES as route (route)}
              <ToggleGroup.Item
                aria-label={ROUTE_WORDS[route].label}
                value={route}
                >{#if narrow === "short"}<span
                    class="@max-decides-full/decides:hidden"
                    >{ROUTE_WORDS[route].label}</span
                  ><span
                    aria-hidden="true"
                    class="hidden @max-decides-full/decides:inline"
                    >{SHORT[route]}</span
                  >{:else}{ROUTE_WORDS[route].label}{/if}</ToggleGroup.Item
              >
            {/each}
          </ToggleGroup.Root>
        </div>
        {#if narrow === "menu"}
          <div class="hidden @max-decides-full/decides:block">
            <NativeSelect.Root
              aria-labelledby="{uid}-kind-{at}"
              class="w-full"
              data-pending={pending?.kind === kind ? "" : undefined}
              bind:value={
                () => shown,
                (next) => {
                  if (next && next !== routes[kind]) {
                    onchange(kind, next as DecidesRoute);
                  }
                }
              }
            >
              {#each DECIDES_ROUTES as route (route)}
                <NativeSelect.Option value={route}
                  >{ROUTE_WORDS[route].label}</NativeSelect.Option
                >
              {/each}
            </NativeSelect.Root>
          </div>
        {/if}
      </div>
      {#if fault?.kind === kind}
        <RowFault
          again={() => onchange(kind, fault.route)}
          class="col-span-full"
          reason={fault.reason}
        />
      {/if}
    </li>
  {/each}
</ul>
