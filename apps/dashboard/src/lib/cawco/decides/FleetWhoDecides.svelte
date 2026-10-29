<script lang="ts">
  /**
   * Settings › Who decides (core decides.ts): the fleet's default table,
   * which every project shows until it routes a kind itself, and the
   * delegate type an advisor runs as, picked from the fleet's types
   * (`GET /api/delegate-types`). Each change is the fleet's at once (`PUT
   * /api/decides`), the row asked breathing until the hub answers.
   */
  import {
    DEFAULT_ADVISOR,
    type DecidesRoute,
    type DecisionKind,
    type FleetDecides,
    fleetRoutes,
  } from "@cawco/core/decides";
  import type { DelegateTypesPayload } from "#lib/cawco/delegate-types.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { send } from "#lib/cawco/project-tasks.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { readFleetDecides, saveFleetDecides } from "./decides-client.js";
  import WhoDecidesTable from "./WhoDecidesTable.svelte";

  let {
    narrow = "short",
  }: {
    /** Where the four don't fit their row (WhoDecidesTable). */
    narrow?: "short" | "menu" | "scroll";
  } = $props();

  const uid = $props.id();

  type Read =
    | { state: "reading" }
    | { state: "failed"; reason: string }
    | { state: "read"; fleet: FleetDecides; types: string[] };

  let read = $state<Read>({ state: "reading" });

  async function load(): Promise<void> {
    read = { state: "reading" };
    try {
      const [fleet, catalog] = await Promise.all([
        readFleetDecides(),
        send<DelegateTypesPayload>("/api/delegate-types"),
      ]);
      read = {
        state: "read",
        fleet,
        types: catalog.types.map((each) => each.name),
      };
    } catch (error) {
      read = { state: "failed", reason: failureWords(error) };
    }
  }

  $effect(() => {
    load();
  });

  let pending = $state<{ kind: DecisionKind; route: DecidesRoute } | null>(
    null
  );
  let fault = $state<{
    kind: DecisionKind;
    route: DecidesRoute;
    reason: string;
  } | null>(null);

  async function route(kind: DecisionKind, next: DecidesRoute): Promise<void> {
    if (pending || read.state !== "read") {
      return;
    }
    pending = { kind, route: next };
    fault = null;
    try {
      const fleet = await saveFleetDecides({
        advisor: read.fleet.advisor,
        routes: { ...read.fleet.routes, [kind]: next },
      });
      read = { ...read, fleet };
    } catch (error) {
      fault = { kind, route: next, reason: failureWords(error) };
    } finally {
      pending = null;
    }
  }

  let advisorAsked = $state<string | null>(null);
  let advisorFault = $state<string | null>(null);
  const advisor = $derived(
    advisorAsked ??
      (read.state === "read"
        ? (read.fleet.advisor ?? DEFAULT_ADVISOR)
        : DEFAULT_ADVISOR)
  );

  async function pickAdvisor(next: string): Promise<void> {
    if (read.state !== "read" || advisorAsked !== null) {
      return;
    }
    advisorAsked = next;
    advisorFault = null;
    try {
      const fleet = await saveFleetDecides({
        routes: read.fleet.routes,
        advisor: next,
      });
      read = { ...read, fleet };
    } catch (error) {
      advisorFault = failureWords(error);
    } finally {
      advisorAsked = null;
    }
  }
</script>

<section
  aria-labelledby="{uid}-title"
  class="flex min-w-0 flex-col gap-space-3"
  data-fleet-decides
>
  <div class="flex min-w-0 flex-col gap-space-row">
    <h2 class="type-title text-ink-strong" id="{uid}-title">Who decides</h2>
    <p class="type-meta max-w-c-measure text-pretty text-ink-muted">
      Who settles each kind of question an agent can't answer alone. A project
      follows this until it changes a kind in its details.
    </p>
  </div>
  {#if read.state === "reading"}
    <p class="mark-line flex items-center gap-space-2 type-meta text-ink-muted">
      <LiveDot /><span>Reading Who decides…</span>
    </p>
  {:else if read.state === "failed"}
    <RowFault again={load} reason={read.reason} />
  {:else}
    {@const types = read.types.includes(advisor)
      ? read.types
      : [advisor, ...read.types]}
    <div
      class="@container flex min-w-0 flex-col gap-space-1 rounded-md border border-border-hairline bg-surface-raised px-space-4 py-space-3 shadow-raised"
    >
      <span class="type-label text-ink-muted">Fleet default</span>
      <WhoDecidesTable
        {narrow}
        {fault}
        label="Who decides in this fleet"
        onchange={route}
        {pending}
        routes={fleetRoutes(read.fleet)}
      />
      <div
        class="grid min-w-0 grid-cols-1 items-center gap-x-space-4 gap-y-space-2 border-t border-border-hairline pt-space-3 @decides-side:grid-cols-(--advisor-cols)"
        style:--advisor-cols="minmax(0, 1fr) var(--c-project-details-select-w)"
      >
        <div class="flex min-w-0 flex-col gap-space-row">
          <label class="type-label text-ink-strong" for="{uid}-advisor"
            >Advisor</label
          >
          <span class="type-meta text-pretty text-ink-muted"
            >The delegate type every advisor runs as.</span
          >
        </div>
        <NativeSelect.Root
          class="w-full"
          data-pending={advisorAsked === null ? undefined : ""}
          disabled={advisorAsked !== null}
          id="{uid}-advisor"
          bind:value={() => advisor, (next) => pickAdvisor(next)}
        >
          {#each types as name (name)}
            <NativeSelect.Option value={name}
              >{read.types.includes(name)
                ? name
                : `${name} (no such type yet)`}</NativeSelect.Option
            >
          {/each}
        </NativeSelect.Root>
      </div>
      <RowFault again={() => pickAdvisor(advisor)} reason={advisorFault} />
    </div>
  {/if}
</section>
