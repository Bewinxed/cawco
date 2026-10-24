<script lang="ts">
  /**
   * One install in the machines list: the place its work is parked (DESIGN.md,
   * The Work Outlives Its Surface Rule). One button, 56px and two lines,
   * whose one act is opening Add machine's window where the install stands.
   * It arrives as the install starts, behind the window, by the list's
   * reflow (Nothing Jumps), and is the box the window flies into when it is
   * dismissed (`data-install-row`).
   *
   * - First line: the machine's name, or how it is reached, or "New machine
   *   · by a command"; on the desk the steps' marks stand at its end.
   * - Second line: the step it is on and how long, as live work breathes,
   *   or, ended, where it stopped and the one-line cause.
   * - A step past its limit reads stuck: its figures in attn ink and "Past
   *   its limit".
   *
   * The machine it brings back (`returning`) keeps its own tile and name:
   * the row grows out of that machine's own (MachinesList).
   */
  import { causeLine, type Install, installName } from "@cawco/core";
  import { iconTileVariants } from "#lib/components/ui/icon-tile/index.js";
  import {
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import { tickingClock } from "../motion/clock.svelte";
  import { connect, phone } from "./installs.svelte";
  import StepMark from "./StepMark.svelte";
  import { currentRow, stepRows } from "./steps";
  import { clockOf } from "./words";

  let {
    install,
    os = "",
    index = 0,
  }: {
    install: Install;
    /** The machine's kind, when the fleet knows it (a machine coming back). */
    os?: string;
    /** Its place in the list, for its tile's hue. */
    index?: number;
  } = $props();

  const running = $derived(install.state === "running");
  const clock = tickingClock(() => running);
  const rows = $derived(stepRows(install));
  const current = $derived(currentRow(install));
  const elapsed = $derived(
    current?.startedAt ? clock.now - current.startedAt : 0
  );
  const past = $derived(
    current?.limit !== null &&
      current?.limit !== undefined &&
      elapsed > current.limit
  );

  const name = $derived(
    install.target || install.hostname
      ? installName(install)
      : "New machine · by a command"
  );

  /**
   * The step it is on, or how it ended: words that morph as they change (The
   * Steady Swap Rule). Over SSH, from its key on, the steps are the install's
   * own, so they read under "Installing · ".
   */
  const words = $derived.by(() => {
    if (install.state !== "running") {
      return causeLine(install);
    }
    if (!current) {
      return "Starting";
    }
    return install.route === "ssh" &&
      ["key", "fetch", "install", "agent"].includes(current.step)
      ? `Installing · ${current.words}`
      : current.words;
  });
  /** How long it has been on that step, against its limit where it has one: a clock, never morphed. */
  const time = $derived.by(() => {
    if (!(install.state === "running" && current)) {
      return "";
    }
    if (current.limit !== null && past) {
      return ` · ${clockOf(elapsed)} of ${clockOf(current.limit)} · Past its limit`;
    }
    return ` · ${clockOf(elapsed)}`;
  });
  const line = $derived(`${words}${time}`);

  const lead = $derived.by(() => {
    switch (install.state) {
      case "failed":
      case "lost":
        return "failed" as const;
      case "stopped":
        return "stopped" as const;
      case "joined":
        return "done" as const;
      case "running":
        return "current" as const;
      default: {
        const unhandled: never = install.state;
        throw new Error(`unhandled state: ${unhandled}`);
      }
    }
  });

  const Icon = $derived(machineIcon(os));
  /**
   * On the phone the name gives way in its middle, so both ends of an
   * address stay (deploy@bui…ample.net): the end stands whole beside a
   * start that truncates.
   */
  const TAIL = 10;
  const split = $derived(
    phone.current && name.length > TAIL * 2
      ? [name.slice(0, -TAIL), name.slice(-TAIL)]
      : [name, ""]
  );
  /** The marks of every step, for an SSH install: as many as its route has. */
  const showMarks = $derived(install.route === "ssh");
</script>

<button
  type="button"
  data-slot="row"
  data-install-row={install.id}
  data-state={install.state}
  aria-haspopup="dialog"
  aria-label="{name}: {line}. Open"
  class="select-none group/install flex h-c-row-h-two w-full items-center gap-space-2 rounded-sm px-space-2 text-start text-ink-strong transition-control hover:bg-surface-hover press-tint focus-inset"
  onclick={(event) => connect.openInstall(install.id, event.currentTarget)}
  {@attach clock.watch}
>
  <span
    data-slot="tile"
    data-box
    class={iconTileVariants({
      class: [
        "transition-[border-color] duration-(--dur-control) ease-out",
        install.returning === null &&
          install.state !== "joined" &&
          "text-ink-muted",
      ],
    })}
    style:color={machineHue(index, install.state === "joined")}
    ><Icon class="size-icon-md flex-none" /></span
  >
  <span data-slot="words" class="flex min-w-0 flex-1 flex-col gap-space-row">
    <span class="mark-line flex min-w-0 items-center gap-space-2">
      <span
        data-slot="name"
        data-box
        class="flex min-w-0 flex-1 whitespace-nowrap type-label text-ink-row"
        ><span class="min-w-0 overflow-clip text-ellipsis">{split[0]}</span
        >{#if split[1]}<span class="flex-none">{split[1]}</span>{/if}</span
      >
      {#if showMarks && install.state === "running"}
        <span
          data-slot="marks"
          class="flex flex-none items-center gap-space-row"
          aria-hidden="true"
        >
          {#each rows as row (row.step)}
            <StepMark state={row.state} size="sm" />
          {/each}
        </span>
      {/if}
    </span>
    <span
      data-slot="step"
      class={[
        "mark-line flex min-w-0 items-center gap-space-2 type-meta",
        past ? "text-status-attn-ink" : "text-ink-muted",
      ]}
    >
      <StepMark state={lead} size="sm" />
      <span class="flex min-w-0 whitespace-nowrap" data-box
        ><span class="min-w-0 overflow-clip text-ellipsis"
          ><MorphText text={words} /></span
        ><span class="num flex-none">{time}</span></span
      >
    </span>
  </span>
</button>
