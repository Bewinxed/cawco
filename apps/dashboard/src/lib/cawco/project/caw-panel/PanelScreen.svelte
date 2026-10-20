<script lang="ts">
  /**
   * Caw's one panel in each state the decision page draws (advisor report
   * §2, the per-state table), every open part as a prop and every other as
   * recommended. Each states file mounts this with the args it changes.
   *
   * - `idle`: the thread a few messages on, opened at its latest.
   * - `waiting`: card 1's: a short conversation that stands whole, with two
   *   asks waiting in other projects (`today`: the floating thread's head as
   *   it ships, and the asks not in it).
   * - `working`: his words at the tail, the tool row under them, Stop.
   * - `needs-you`: his question grown into the composer.
   * - `no-machine`, `budget`: the block at the body's centre; `composer`
   *   says whether the message box stays.
   * - `off`: the thread, the Off chip, his seat asleep.
   * - `cant-read`: the block, and no message box (nothing to write to).
   * - `not-woken`: your message's row saying why he didn't read it.
   * - `empty`: a new thread: Caw on the start edge, What's next?, the
   *   things to ask him.
   *
   * `title` is Head's (named or offscreen); `open` stands Show details
   * open; `long` stretches what can run long (the thread's name, the
   * hub's error); `latest` is Panel's.
   */
  import type { CawStatus } from "#lib/cawco/home/Caw.svelte";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import StarterCards from "#lib/cawco/project/StarterCards.svelte";
  import type { ComposerAsk } from "#lib/cawco/transcript/Composer.svelte";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import Blocked from "./Blocked.svelte";
  import FiledTasks from "./FiledTasks.svelte";
  import {
    ASKED,
    BUDGET,
    CANT_READ,
    CANT_READ_LONG,
    FILED,
    FIRST,
    LONG_NAMED,
    NAMED,
    NO_MACHINE,
    NO_MACHINE_SHUT,
    QUESTION,
    SHIP,
    SHIP_LATE,
    SHIP_ON,
    SUGGESTIONS,
    THREADS,
    TOOL,
    WAITING,
    WORKING,
  } from "./fixtures";
  import NotWoken from "./NotWoken.svelte";
  import Panel from "./Panel.svelte";
  import Said from "./Said.svelte";

  type Scene =
    | "idle"
    | "waiting"
    | "working"
    | "needs-you"
    | "no-machine"
    | "budget"
    | "off"
    | "cant-read"
    | "not-woken"
    | "empty";

  let {
    form,
    scene,
    title = "named",
    composer = "stays",
    open = false,
    long = false,
    latest = true,
    today = false,
  }: {
    form: "desk" | "phone";
    scene: Scene;
    title?: "named" | "offscreen";
    /** While he can't start: the message box stays, or goes. */
    composer?: "stays" | "goes";
    open?: boolean;
    long?: boolean;
    latest?: boolean;
    /** Card 1's other side: the floating thread's head as it ships, and no asks in the panel. */
    today?: boolean;
  } = $props();

  const block = $derived.by(() => {
    switch (scene) {
      case "no-machine":
        return composer === "goes" ? NO_MACHINE_SHUT : NO_MACHINE;
      case "budget":
        return BUDGET;
      case "cant-read":
        return long ? CANT_READ_LONG : CANT_READ;
      case "idle":
      case "waiting":
      case "working":
      case "needs-you":
      case "off":
      case "not-woken":
      case "empty":
        return null;
    }
  });
  /** The onboarding thread: his question and the message that didn't wake him are there. */
  const onboarding = $derived(scene === "needs-you" || scene === "not-woken");
  const name = $derived.by(() => {
    if (scene === "empty") {
      return null;
    }
    if (title === "offscreen") {
      return onboarding ? (ASKED[0]?.words[0] ?? FIRST) : FIRST;
    }
    if (long) {
      return LONG_NAMED;
    }
    return onboarding ? (THREADS[1] ?? NAMED) : NAMED;
  });
  const writable = $derived(
    scene !== "cant-read" &&
      !((scene === "no-machine" || scene === "budget") && composer === "goes")
  );
  const pose = $derived.by((): CawStatus => {
    switch (scene) {
      case "working":
        return "working";
      case "off":
        return "sleeping";
      case "needs-you":
      case "no-machine":
      case "budget":
      case "cant-read":
        return "needs-you";
      case "idle":
      case "waiting":
      case "not-woken":
      case "empty":
        return "ready";
    }
  });
  /** Card 1's scene: the conversation, with what waits in other projects. */
  const waits = $derived(scene === "waiting");
  const ask = $derived<ComposerAsk | null>(
    scene === "needs-you"
      ? {
          request: QUESTION,
          asker: "Caw",
          more: 0,
          onanswer: () => null,
        }
      : null
  );
</script>

<Panel
  {ask}
  busy={scene === "working"}
  centre={block !== null}
  composer={writable}
  {form}
  latest={latest && block === null && scene !== "empty" && !waits}
  {name}
  off={scene === "off"}
  {pose}
  {title}
  {today}
  waiting={waits && !today ? WAITING : []}
  whole={waits}
>
  {#if block}
    <Blocked {block} {open} />
  {:else if scene === "working"}
    <Said messages={WORKING}>
      {#snippet under(one)}
        {#if one.id === "w2"}
          <p
            class="mark-line m-0 flex min-inline-0 items-center gap-space-2 text-ink-muted text-meta"
            data-panel-tool
          >
            <Spinner aria-label="Working" box="small" />
            <span
              class="min-inline-0 overflow-clip text-ellipsis whitespace-nowrap"
              >{TOOL}</span
            >
          </p>
        {/if}
      {/snippet}
    </Said>
  {:else if onboarding}
    <Said messages={scene === "needs-you" ? ASKED.slice(0, 2) : ASKED}>
      {#snippet under(one)}
        {#if scene === "not-woken" && one.id === "c3"}
          <NotWoken />
        {/if}
      {/snippet}
    </Said>
  {:else if scene === "empty"}
    <EmptyState actionWidth="fill" title="What’s next?">
      {#snippet mark()}
        <span class="mbe-space-3 grid justify-items-start" data-box
          ><CawFace size={56} status="ready" /></span
        >
      {/snippet}
      {#snippet action()}
        <StarterCards onpick={() => undefined} rows starters={SUGGESTIONS} />
      {/snippet}
    </EmptyState>
  {:else if waits}
    <!-- Card 1 compares one panel with today's three on one conversation,
         short enough to stand whole in either. -->
    <Said messages={SHIP_LATE} />
  {:else}
    <Said messages={latest ? SHIP_ON : SHIP}>
      {#snippet under(one)}
        {#if one.tasks}
          <FiledTasks tasks={FILED} />
        {/if}
      {/snippet}
    </Said>
  {/if}
</Panel>
