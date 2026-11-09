<script lang="ts">
  /**
   * DESIGN DRAWING, not wired: Caw's settings as the project head's `⋯ ›
   * Caw settings…` opens them (CawPanel in its popover on a desk, its sheet
   * on a phone), with the Caw-off section (StopTrayPick) under the switch,
   * for the owner's call on calls-1031-evening. It plays the flow without a
   * hub, as stop-work.svelte.ts times it: the confirm stops the checked rows
   * one machine at a time, an away machine's stop is recorded, he is off,
   * the landing holds for --duration-hold and the section folds away. The switch
   * on and off again asks again.
   */
  import { conversationWords } from "@cawco/core/words/project-conversation";
  import { grabberVariants } from "#lib/components/ui/drawer/drawer-content.svelte";
  import { sheetHeadVariants } from "#lib/components/ui/drawer/sheet-head.js";
  import { floatingSurface } from "#lib/components/ui/popover/popover-content.svelte";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { dur } from "#lib/platform/motion/curves.svelte.js";
  import { cn } from "#lib/utils.js";
  import CawFace from "../home/CawFace.svelte";
  import StopTrayPick, {
    type PickRow,
    type PickStep,
  } from "../StopTrayPick.svelte";

  let {
    projectName,
    rows,
    form,
    step: stepArg = "pick",
    endsOn = "title",
  }: {
    projectName: string;
    /** What Caw started that still runs, every row checked (hub caw.ts `initiated`). */
    rows: PickRow[];
    /** Where his settings stand: a desk's popover or a phone's sheet. */
    form: "desk" | "phone";
    /** Where the section starts: the confirm (`pick`), or him off. */
    step?: PickStep;
    endsOn?: "title" | "confirm";
  } = $props();

  /** Each stop as its machine confirms it, the away machine's recorded. */
  const landedAll = (all: PickRow[]): PickRow[] =>
    all.map((row) =>
      row.offline
        ? { ...row, ran: "", stop: "away", landed: true }
        : { ...row, ran: "", stop: "stopped", landed: true }
    );

  // The story's args set where it stands; the presses move it from there
  // until the next story's args arrive (it follows its props while
  // mounted: house/follows-props).
  let step = $derived<PickStep>(stepArg);
  let shown = $derived<PickRow[]>(stepArg === "off" ? landedAll(rows) : rows);
  let checked = $derived<string[]>(rows.map((row) => row.id));
  let open = $state(true);
  let on = $derived(stepArg === "pick");

  /** The landings still to come; the frame going clears them. */
  let timers: ReturnType<typeof setTimeout>[] = [];
  const after = (ms: number, run: () => void) => {
    timers.push(setTimeout(run, ms));
  };
  $effect(() => () => {
    for (const timer of timers) {
      clearTimeout(timer);
    }
  });

  /** The gap between two machines' confirmations. */
  const BEAT = 450;

  function confirm(): void {
    const chosen = new Set(checked);
    on = false;
    step = "stopping";
    shown = rows.map((row): PickRow => {
      if (!chosen.has(row.id)) {
        return row;
      }
      return row.offline
        ? { ...row, ran: "", stop: "away", landed: true }
        : { ...row, ran: "1s", stop: "stopping" };
    });
    // Delegates land before the session that started them.
    const landing = rows
      .filter((row) => chosen.has(row.id) && !row.offline)
      .reverse();
    landing.forEach((row, index) => {
      after(BEAT * (index + 1), () => {
        shown = shown.map((each) =>
          each.id === row.id
            ? { ...each, ran: "", stop: "stopped", landed: true }
            : each
        );
      });
    });
    const off = BEAT * (landing.length + 1) + dur("--duration-morph");
    after(off, () => {
      step = "off";
    });
    after(off + dur("--duration-hold"), () => {
      open = false;
    });
  }

  function flip(next: boolean): void {
    on = next;
    if (next) {
      return;
    }
    for (const timer of timers) {
      clearTimeout(timer);
    }
    timers = [];
    step = "pick";
    shown = rows;
    checked = rows.map((row) => row.id);
    open = true;
  }

  const away = $derived(
    shown.filter((row) => row.stop === "away" || row.offline).length
  );
  const sentence = $derived.by(() => {
    if (on) {
      return conversationWords.status.ready;
    }
    return away > 0
      ? conversationWords.status.offFinishing(away)
      : conversationWords.status.off;
  });
  const head = sheetHeadVariants();
</script>

<div class={cn("flex justify-end", form === "desk" && "p-space-3")}>
  <div
    data-slot="host"
    class={cn(
      floatingSurface({ motion: "hang" }),
      "h-fit",
      form === "desk"
        ? "w-c-panel-w max-w-full p-space-2"
        : "w-full rounded-b-none border-x-0 border-b-0 p-space-4 pt-space-2 pb-space-5"
    )}
  >
    {#if form === "phone"}
      <div class={cn(grabberVariants(), "mt-0")}></div>
      <div class={head.head()}>
        <p class={cn(head.title(), "m-0")}>Caw, {projectName}</p>
      </div>
    {/if}
    <div
      data-slot="caw-panel"
      class={cn(
        "type-label flex flex-col gap-space-2 text-ink-strong",
        form === "desk" && "pt-space-3 pr-space-4 pb-space-4 pl-space-4"
      )}
    >
      <div class="mark-line flex flex-wrap items-center gap-space-2">
        <CawFace size={18} status={on ? "ready" : "sleeping"} />
        <span class="min-w-0">{sentence}</span>
      </div>
      <label class="flex flex-wrap items-center gap-space-2">
        <Switch bind:checked={() => on, (next) => flip(next)} />
        <span>Events reach a conversation</span>
      </label>
      {#if open}
        <StopTrayPick
          bind:checked
          {endsOn}
          oncancel={() => {
            open = false;
          }}
          onconfirm={confirm}
          {projectName}
          rows={shown}
          {step}
        />
      {/if}
    </div>
  </div>
</div>
