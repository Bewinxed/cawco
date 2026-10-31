<script lang="ts">
  import { cn } from "#lib/utils.js";
  import LivePreview, { type PreviewLoad } from "./LivePreview.svelte";
  import type { Decision, Moment, Standing, Thread } from "./model.js";
  import { byCost } from "./model.js";
  import Overlay from "./Overlay.svelte";
  import type { Found } from "./records.js";
  import SearchView, { type SearchLoad } from "./SearchView.svelte";
  import ThreadList, { type ListLoad, type Strip } from "./ThreadList.svelte";
  import ThreadView from "./ThreadView.svelte";
  import WhoDecides from "./WhoDecides.svelte";
  import { FLEET_ROUTES, PROJECT_ROUTES, ROUTE, WORDS } from "./words.js";

  /**
   * The Exchange: each asking session a thread you answer. On a desk the
   * list of who is asking stands in its column and the chosen thread beside
   * it; a live preview or Who decides opens as a third column while the
   * thread stays live, and the list narrows to names. Narrower, one pane at
   * a time: the list, a thread with Back, or search; the preview and Who
   * decides come up as sheets. The layout follows the Exchange's own width
   * (a container), so it holds wherever it is mounted.
   */
  let {
    threads,
    strip,
    view: viewArg = "threads",
    open: openArg,
    filter = "open",
    listLoad = "ready",
    silent,
    aside: asideArg = [],
    moment = {},
    preview: previewArg = "closed",
    who: whoArg = false,
    query = "",
    searchLoad = "ready",
    records = [],
    found: foundArg,
  }: {
    threads: Thread[];
    strip: Strip;
    /** The pane in front where only one fits. */
    view?: "threads" | "thread" | "search";
    /** The open thread; the longest-stopped one when none is chosen. */
    open?: string;
    filter?: string;
    listLoad?: ListLoad;
    silent?: { machine: string; since: string };
    /** Threads set aside with Not now. */
    aside?: string[];
    /** Where the open thread stands as he works it. */
    moment?: Moment;
    /** The live preview: closed, or open and loading, failed or drawn. */
    preview?: "closed" | PreviewLoad;
    who?: boolean;
    query?: string;
    searchLoad?: SearchLoad;
    records?: Found[];
    /** The search result whose thread is open. */
    found?: string;
  } = $props();

  let view = $derived(viewArg);
  let openId = $derived(openArg);
  let preview = $derived(previewArg);
  let who = $derived(whoArg);
  let asideIds = $derived(asideArg);
  let foundId = $derived(foundArg);

  const listed = $derived(
    threads.map((t) =>
      asideIds.includes(t.id) && t.standing === "stopped"
        ? { ...t, standing: "aside" as Standing }
        : t
    )
  );
  const holds = (t: Thread, id: string) =>
    t.messages.some(
      (m) =>
        (m.kind === "ask" && m.decisions.some((d) => d.id === id)) ||
        (m.kind === "settled" && m.decision.id === id)
    );
  const foundThread = $derived(
    foundId ? threads.find((t) => holds(t, foundId ?? "")) : undefined
  );
  const thread = $derived(
    (view === "search" ? foundThread : undefined) ??
      threads.find((t) => t.id === openId) ??
      [...listed].sort(byCost)[0]
  );
  const third = $derived(who || preview !== "closed");

  const goesTo = (d: Decision) => {
    if (!d.kind) {
      return "goes to you";
    }
    const route = PROJECT_ROUTES[d.kind] ?? FLEET_ROUTES[d.kind];
    return `goes to ${route === "you" ? "you" : ROUTE[route].toLowerCase()}`;
  };

  function openThread(id: string) {
    openId = id;
    view = "thread";
  }

  function setAside(on: boolean) {
    const id = thread?.id ?? "";
    asideIds = on ? [...asideIds, id] : asideIds.filter((x) => x !== id);
  }
</script>

<div class="@container/exchange relative h-dvh overflow-hidden bg-surface-page">
  <div class="flex h-full flex-col @wide/exchange:flex-row">
    <!-- The list column: who is asking, or search in its place. -->
    <div
      class={cn(
        "min-h-0 min-w-0 flex-1 overflow-y-auto px-space-5 py-space-5 @phone/exchange:@max-wide/exchange:px-space-7 @wide/exchange:flex-none @wide/exchange:border-border-hairline @wide/exchange:border-e",
        third ? "@wide/exchange:w-75" : "@wide/exchange:w-105",
        view === "thread" && "@max-wide/exchange:hidden"
      )}
    >
      {#if view === "search"}
        <SearchView
          chosen={foundId}
          load={searchLoad}
          onback={() => {
            view = "threads";
          }}
          onresult={(id) => {
            foundId = id;
          }}
          {query}
          {records}
        />
      {:else}
        <ThreadList
          current={thread?.id}
          {filter}
          load={listLoad}
          narrow={third}
          onopen={openThread}
          onsearch={() => {
            view = "search";
          }}
          resumed={moment.replied ? thread?.id : undefined}
          {silent}
          {strip}
          threads={listed}
        />
      {/if}
    </div>

    <!-- The thread: beside the list on a desk, alone with Back narrower. -->
    {#if thread && listLoad !== "empty"}
      <div
        class={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col px-space-5 pt-space-3 @phone/exchange:px-space-7",
          view !== "thread" && "@max-wide/exchange:hidden"
        )}
      >
        {#key thread.id}
          <ThreadView
            aside={asideIds.includes(thread.id)}
            found={view === "search" ? foundId : undefined}
            {goesTo}
            {moment}
            onaside={setAside}
            onback={() => {
              view = "threads";
            }}
            onkind={() => {
              who = true;
              preview = "closed";
            }}
            onpicture={() => {
              preview = "ready";
              who = false;
            }}
            {thread}
          />
        {/key}
      </div>
    {/if}

    {#if who && thread}
      <Overlay
        closeLabel={WORDS.closeWhoDecides}
        onclose={() => {
          who = false;
        }}
        title={WORDS.whoDecides}
      >
        <WhoDecides project={thread.project} />
      </Overlay>
    {:else if preview !== "closed" && thread}
      <Overlay
        closeLabel={WORDS.closePreview}
        onclose={() => {
          preview = "closed";
        }}
        title={WORDS.whoDecides}
      >
        <LivePreview load={preview} project={thread.project} />
      </Overlay>
    {/if}
  </div>
</div>
