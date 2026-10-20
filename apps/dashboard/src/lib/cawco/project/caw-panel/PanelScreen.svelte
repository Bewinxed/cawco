<script lang="ts">
  /**
   * Caw's panel in one of the scenes the decision page asks about, every
   * open part as a prop and every other part as recommended. Each option's
   * states file mounts this with the args it changes.
   *
   * - `thread`: the reply that filed three tasks (the head, the filed tasks,
   *   the resize options, the fixes from his pins).
   * - `cant-read`, `cant-start`: the blocking states, at the panel's centre.
   * - `not-woken`: your message that didn't wake him.
   * - `empty`: a new thread, with the things to ask him.
   *
   * `landed` off: his reply before its tasks land (their arrival is a move).
   * `long` draws each scene stretched: five tasks, 40-word lines, more
   * suggestions, the long reason and the long error. `peek`, `menu` and
   * `lit` are Panel's: only its top (your question and his whole
   * reply, the fade below his last line), More open, a grip under the pointer;
   * `sized` the size it opens at.
   */
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import Blocked from "./Blocked.svelte";
  import Chips from "./Chips.svelte";
  import FiledTasks from "./FiledTasks.svelte";
  import {
    ASKED,
    CANT_READ,
    CANT_READ_LONG,
    CANT_START,
    FILED,
    FILED_LONG,
    LONG_ASK,
    LONG_THREAD,
    MACHINES,
    MACHINES_LONG,
    NOT_WOKEN,
    NOT_WOKEN_LONG,
    NOT_WOKEN_RAW,
    PROJECT,
    READ_RAW,
    READ_RAW_LONG,
    SHIP,
    SUGGESTIONS,
    SUGGESTIONS_LONG,
    THREAD,
    THREADS,
  } from "./fixtures";
  import NotWoken from "./NotWoken.svelte";
  import Panel from "./Panel.svelte";
  import Said from "./Said.svelte";

  let {
    form,
    scene,
    head = "who",
    fact = null,
    resize = null,
    tasks = "rows",
    layout = "edge",
    open = false,
    note = "under",
    suggest = "rows",
    long = false,
    landed = true,
    peek = null,
    menu = false,
    lit = false,
    sized = null,
  }: {
    form: "desk" | "phone";
    scene: "thread" | "cant-read" | "cant-start" | "not-woken" | "empty";
    head?: "who" | "name";
    fact?: { text: string; tone: BadgeVariant } | null;
    resize?: "edges" | "corner" | "menu" | null;
    tasks?: "cards" | "rows";
    layout?: "stack" | "edge";
    open?: boolean;
    note?: "under" | "caw";
    suggest?: "rows" | "chips";
    long?: boolean;
    /** The filed tasks have landed under his reply. */
    landed?: boolean;
    peek?: number | null;
    menu?: boolean;
    lit?: boolean;
    sized?: { w: number; h: number } | null;
  } = $props();

  /** The thread on show in each scene; null for a new one. */
  const THREAD_OF = {
    thread: THREAD,
    "cant-read": THREAD,
    "cant-start": null,
    "not-woken": THREADS[1],
    empty: null,
  } as const;
  /** The message box's placeholder; null where the thread can't be read. */
  const PLACEHOLDER_OF = {
    thread: "Message Caw",
    "cant-read": null,
    "cant-start": "Waits until Caw can start",
    "not-woken": "Message Caw",
    empty: "Message Caw",
  } as const;
  const thread = $derived(
    long && THREAD_OF[scene] === THREAD ? LONG_THREAD : THREAD_OF[scene]
  );
  const asked = $derived(long ? [...ASKED, LONG_ASK] : ASKED);
  const last = $derived(asked.at(-1)?.id);
  const placeholder = $derived(PLACEHOLDER_OF[scene]);
  const filed = $derived(long ? FILED_LONG : FILED);
  const pose = $derived(
    scene === "cant-read" || scene === "cant-start" ? "needs-you" : "ready"
  );
</script>

<Panel
  centre={scene === "cant-read" || scene === "cant-start"}
  composer={placeholder}
  {fact}
  {form}
  {head}
  {lit}
  {menu}
  {peek}
  {pose}
  {resize}
  {sized}
  {thread}
>
  {#if scene === "thread"}
    <Said messages={SHIP}>
      {#snippet under(one)}
        {#if one.tasks}
          <FiledTasks form={tasks} tasks={landed ? filed : []} />
        {/if}
      {/snippet}
    </Said>
  {:else if scene === "cant-read"}
    <Blocked
      act={CANT_READ.act}
      {layout}
      line={(long ? CANT_READ_LONG : CANT_READ).line}
      {open}
      raw={long ? READ_RAW_LONG : READ_RAW}
      second={CANT_READ.second}
      title={CANT_READ.title}
    />
  {:else if scene === "cant-start"}
    <Blocked
      act={CANT_START.act}
      {layout}
      line={CANT_START.line}
      {open}
      rows={long ? MACHINES_LONG : MACHINES}
      title={CANT_START.title}
    />
  {:else if scene === "not-woken"}
    <Said messages={asked}>
      {#snippet under(one)}
        {#if one.id === last}
          <NotWoken
            details={NOT_WOKEN_RAW}
            place={note}
            reason={long ? NOT_WOKEN_LONG : NOT_WOKEN}
          />
        {/if}
      {/snippet}
    </Said>
  {:else}
    <!-- Its action row as wide as the column, as the thread pane's hero
         sets it (ThreadPane `.hero :global(.kit-empty-action)`): the empty
         state lines its parts up on their start edge, so unstretched the
         row is only as wide as what's in it, and the rows' container
         (StarterCards, `container-type: inline-size`) counts as nothing
         there, which left every row 0 wide, its words one letter a line. -->
    <EmptyState
      class="[&>.kit-empty-action]:self-stretch"
      title="What’s next for {PROJECT}?"
    >
      {#snippet mark()}
        <!-- mark-line: Caw stands over the empty thread's title -->
        <span class="mbe-(--space-3) grid justify-items-start" data-box
          ><CawFace size={80} status="ready" /></span
        >
      {/snippet}
      {#snippet action()}
        {#if suggest === "rows"}
          <StarterCards
            onpick={() => undefined}
            rows
            starters={long ? SUGGESTIONS_LONG : SUGGESTIONS}
          />
        {:else}
          <Chips
            onpick={() => undefined}
            suggestions={long ? SUGGESTIONS_LONG : SUGGESTIONS}
          />
        {/if}
      {/snippet}
    </EmptyState>
  {/if}
</Panel>
