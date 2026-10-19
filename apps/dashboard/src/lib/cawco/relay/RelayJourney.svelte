<script lang="ts">
  /**
   * The stream relay's guided journey, one card in every place it is drawn
   * (the browser panel's stream when a take-over through a domain fails,
   * Caw's Needs you, Settings › Browsers), built on HTTPS on the tailnet's
   * row (NeedsCard, `item.kind === "tailnet"`): a title, then every step
   * that applies in order, each its label and its tick as the hub finds it
   * taken. It stops at the first step that needs the person and shows only
   * that one's note and control; every other step is its number and label.
   * The lead line stands only while nothing asks yet.
   *
   * Four faces, by `view`: `entry`, the take-over's stream place saying why
   * it didn't connect, whose Set up unfolds the journey in place; `journey`,
   * the step list; `summary`, the live relay as Settings shows it, with Add a
   * name while none stands; `done`, Caw's Needs you row once it is live and
   * proven. Everything it shows arrives as props (the hub's journey record);
   * what the person presses leaves as `onact`.
   */
  import { STREAM_RELAY_WORDS } from "@cawco/core";
  import Field from "#lib/cawco/config/Field.svelte";
  import CopyBox from "#lib/cawco/join/CopyBox.svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { UseClipboard } from "#lib/hooks/use-clipboard.svelte.js";
  import { IconError, IconMonitor, IconSuccess } from "#lib/icons.js";
  import {
    type RelayAct,
    type RelayMachine,
    type RelayStep,
    type RelaySummary,
    JOURNEY_WORDS as words,
    zoneOf,
  } from "./journey.js";

  let {
    view = "journey",
    domain = null,
    machine,
    steps = [],
    summary = null,
    onact,
  }: {
    /** Which face: the take-over's entry, the journey's steps, the live relay's summary, or Needs you's ticked row. */
    view?: "entry" | "journey" | "summary" | "done";
    /** The domain the person reached CawCo through, seen through a proxy; null by IP or the tailnet. */
    domain?: string | null;
    /** The machine the relay runs on. */
    machine: RelayMachine;
    /** Every step that applies, in order, with where each stands. */
    steps?: RelayStep[];
    /** The live relay, for `summary` and `done`. */
    summary?: RelaySummary | null;
    /** What the person pressed: the hub's to act on. */
    onact?: (act: RelayAct) => void;
  } = $props();

  /** The entry's Set up was pressed: the journey stands in its place. */
  let entered = $state(false);
  const face = $derived(view === "entry" && entered ? "journey" : view);

  const nameStep = $derived(
    steps.find(
      (one): one is Extract<RelayStep, { step: "name" }> => one.step === "name"
    )
  );
  /** The relay's name, suggested or standing. */
  const relayName = $derived(nameStep?.name ?? "");
  /** The name's zone at its DNS host: Let CawCo add it is offered only for a name that has one. */
  const zone = $derived(relayName ? zoneOf(relayName) : null);
  /** A name stands, or will: its TLS port is in every port list. */
  const named = $derived(
    nameStep !== undefined && nameStep.state !== "skipped"
  );
  /** Step 7's number, for the router's "proven in step N". */
  const proveAt = $derived(steps.findIndex((one) => one.step === "prove") + 1);
  /** Every step ticked. */
  const finished = $derived(
    steps.every((one) => one.state === "done" || one.state === "skipped")
  );

  /** How a step's mark reads: its tick, its failure, work running, or its number. */
  type Mark = "done" | "failed" | "working" | "standing" | "waiting";
  function markOf(step: RelayStep): Mark {
    switch (step.state) {
      case "done":
      case "skipped":
        return "done";
      case "failed":
        return "failed";
      case "checking":
      case "running":
        return "working";
      case "waiting":
      case "by-hand":
        return "waiting";
      default:
        return "standing";
    }
  }

  /** Something stands on the person: a step to act on, or one that failed. */
  const asks = (step: RelayStep): boolean => {
    const mark = markOf(step);
    return mark === "standing" || mark === "failed";
  };
  /**
   * The one step whose note and control are shown: the first that stands on
   * the person, else the first at work (its progress, and the name's Skip
   * while it is checked). The rest are their number and label.
   */
  const open = $derived.by(() => {
    const asking = steps.findIndex(asks);
    return asking === -1
      ? steps.findIndex((step) => markOf(step) === "working")
      : asking;
  });
  /** The lead says why, until something asks; the entry has said it already. */
  const lead = $derived(!((view === "entry" && entered) || steps.some(asks)));
  /** Done for now stands in Later's place while it is proven only from inside. */
  const later = $derived(
    !(
      finished ||
      steps.some((one) => one.step === "prove" && one.state === "inside")
    )
  );

  /** A step's note and control: none for one whose spinner says all it has (the low ports, checked). */
  const hasBody = (step: RelayStep): boolean =>
    !(step.step === "runtime" && step.state === "checking");

  /** Let CawCo add it: its token field, opened here or by the record. */
  let tokenOpenHere = $state<boolean | null>(null);
  const tokenOpen = $derived(tokenOpenHere ?? nameStep?.tokenOpen ?? false);
  let token = $state("");

  /** The phone's copy row: one step's body is shown at a time, so one clipboard serves it. */
  const clipboard = new UseClipboard();
  const copyWord = (label: string): string => {
    if (clipboard.status === "success") {
      return words.copied;
    }
    return clipboard.status === "failure" ? words.copyFailed : label;
  };

  const act = (kind: Exclude<RelayAct, { act: "add-record" }>["act"]) =>
    onact?.({ act: kind });

  /** What a ticked step says was done. */
  function doneLabelOf(step: RelayStep): string {
    switch (step.step) {
      case "machine":
        return words.machineDone(machine);
      case "name":
        return step.state === "skipped"
          ? words.nameSkipped
          : words.nameDone(step.name);
      case "router":
        return words.routerDone;
      case "runtime":
        return words.runtimeDone;
      case "certificate":
        return words.certificateDone(relayName, step.ends ?? "");
      case "start":
        return words.startDone(machine.name, named);
      default:
        return words.proveDone(step.device ?? "", step.at ?? "", named);
    }
  }

  /** A step's label: what to do while it stands, what was done once ticked. */
  function labelOf(step: RelayStep): string {
    if (markOf(step) === "done") {
      return doneLabelOf(step);
    }
    switch (step.step) {
      case "name":
        return words.name;
      case "router":
        return step.state === "by-hand"
          ? words.routerByHand(proveAt)
          : words.router;
      case "runtime":
        return words.runtime(step.lowest);
      case "certificate":
        return words.certificate;
      case "start":
        return words.start;
      default:
        return words.prove;
    }
  }

  /** The name check's finding, in the error formula's words. */
  function findingOf(step: Extract<RelayStep, { step: "name" }>): string {
    switch (step.finding) {
      case "proxied":
        return words.nameProxied(step.name, machine.address);
      case "elsewhere":
        return words.nameElsewhere(step.name, step.answers ?? "", machine);
      default:
        return words.nameUnresolved(step.name);
    }
  }

  /** The state word a screen reader hears before a step's label. */
  const SAID: Record<Mark, string> = {
    done: words.stepDone,
    failed: words.stepFailed,
    working: words.stepWorking,
    standing: "",
    waiting: "",
  };

  /** A live relay with a port that did not answer: said in words, never by tint alone. */
  const portDown = $derived(summary?.ports.some((port) => !port.up) ?? false);

  /** A step's note: meta, muted; a failure's in the fail ink. */
  const NOTE =
    "min-w-0 text-meta text-(--ink-muted) text-pretty [overflow-wrap:anywhere]";
  const FAIL =
    "min-w-0 text-meta text-(--status-fail-ink) text-pretty [overflow-wrap:anywhere]";
  /** A step's controls: side by side, each the column's width in a narrow card, `space-2` apart. */
  const CONTROLS =
    "flex min-w-0 flex-wrap items-center gap-(--space-2) @max-md:[&>*]:w-full";
  /** The words under the title: on the title's edge, on the card's own edge in a narrow card. */
  const UNDER_TITLE =
    "flex min-w-0 flex-col ps-[calc(--spacing(7)+var(--space-3))] @max-md:ps-0";
</script>

{#snippet stepMark(mark: Mark, n: number)}
  <span class="mark-cell">
    <span
      class="grid size-(--icon-md) place-items-center text-(--ink-muted)"
      data-slot="step-mark"
    >
      {#if mark === "done"}
        <IconSuccess
          aria-hidden="true"
          class="size-(--icon-md) text-(--status-done-ink)"
        />
      {:else if mark === "failed"}
        <IconError
          aria-hidden="true"
          class="size-(--icon-md) text-(--status-fail-ink)"
        />
      {:else if mark === "working"}
        <Spinner aria-hidden="true" class="size-(--icon-md)" role="none" />
      {:else}
        <!-- A step's number, no fill: in the muted ink on the control edge
             while it waits, in the strong ink on the outline button's edge
             (3:1) while it stands on you, so neither reads as a tick. -->
        <span
          aria-hidden="true"
          class={[
            "box-border grid size-full place-items-center rounded-full border bg-transparent text-meta leading-none tabular-nums before:content-[attr(data-n)]",
            mark === "standing"
              ? "border-(--border-button-outline) text-(--ink-strong)"
              : "border-(--border-control) text-(--ink-muted)",
          ]}
          data-n={n}
        ></span>
      {/if}
    </span>
  </span>
{/snippet}

<!-- Something to paste elsewhere: the house's copy box in a wide card; in a
     narrow one the text across the card, wrapping between its words (or
     clamped to two lines, `clamp`), and Copy on a full-width row of its
     own, naming what it copies. Copy takes the whole text either way. -->
{#snippet copyable(
  label: string,
  text: string,
  copyLabel: string,
  clamp: boolean
)}
  <div class="min-w-0 @max-md:hidden" data-box>
    <CopyBox {label} {text} wrap />
  </div>
  <div class="hidden min-w-0 flex-col gap-(--space-2) @max-md:flex" data-box>
    <code
      class={[
        "min-w-0 rounded-md border border-(--border-control) bg-(--surface-hover) px-(--space-3) py-(--space-2) font-mono text-meta text-(--ink-strong)",
        clamp ? "line-clamp-2" : "block",
      ]}
      title={text}
      ><span class="sr-only">{label}:{" "}</span
      >{#each text.split(" ") as word, index (index)}{#if index > 0}{" "}{/if}<span
          class="inline-block max-w-full [overflow-wrap:anywhere]">{word}</span
        >{/each}</code
    >
    <Button
      class="w-full"
      label={copyWord(copyLabel)}
      onclick={() => clipboard.copy(text)}
      size="sm"
      variant="secondary"
    />
  </div>
{/snippet}

{#snippet head(done: boolean)}
  <div class="mark-line flex min-w-0 items-center gap-(--space-3)">
    <span
      class="grid w-7 flex-none place-items-center text-(--ink-muted)"
      data-box
    >
      {#if done}
        <IconSuccess
          aria-hidden="true"
          class="size-4 text-(--status-done-ink)"
        />
      {:else}
        <IconMonitor aria-hidden="true" class="size-4" />
      {/if}
    </span>
    <h3 class="min-w-0 text-label text-(--ink-strong) text-balance">
      {STREAM_RELAY_WORDS.title}
    </h3>
  </div>
{/snippet}

{#snippet nameBody(step: Extract<RelayStep, { step: "name" }>)}
  {#if step.state === "checking"}
    <p class={NOTE}>{words.nameChecking(step.name, step.askedAgo)}</p>
  {:else}
    <p class={NOTE}>{findingOf(step)}</p>
    {@render copyable(
      words.recordLabel,
      words.record(step.name, machine.address),
      words.copyRecord,
      false
    )}
  {/if}
  <p class={NOTE}>{words.nameWhy(step.name)}</p>
  <div class={CONTROLS}>
    {#if step.state !== "checking" && zone}
      <Button
        aria-expanded={tokenOpen}
        label={words.letCawCoAdd}
        onclick={() => {
          tokenOpenHere = !tokenOpen;
        }}
        size="sm"
        variant="secondary"
      />
    {/if}
    <Button
      label={words.skipName}
      onclick={() => act("skip-name")}
      size="sm"
      variant="secondary"
    />
  </div>
  {#if step.state !== "checking" && zone && tokenOpen}
    <div class="flex min-w-0 flex-col gap-(--space-2)" in:unfold out:unfold>
      <Field
        hint={words.tokenHint(zone)}
        id="relay-token"
        label={words.tokenLabel}
      >
        <Input
          autocapitalize="off"
          autocomplete="off"
          class="w-full"
          id="relay-token"
          spellcheck={false}
          type="password"
          bind:value={token}
        />
      </Field>
      <div class={CONTROLS}>
        <Button
          disabled={token.trim() === ""}
          label={words.addRecord}
          onclick={() => onact?.({ act: "add-record", token: token.trim() })}
          pendingLabel="Adding…"
          size="sm"
        />
      </div>
    </div>
  {/if}
{/snippet}

{#snippet stepBody(step: RelayStep)}
  {#if step.step === "name"}
    {@render nameBody(step)}
  {:else if step.step === "router"}
    {#if step.state === "refused"}
      <p class={NOTE}>{words.routerRefused}</p>
      {@render copyable(
        words.forwardsLabel,
        words.forwards(machine.lan ?? machine.address),
        words.copyForwards,
        false
      )}
    {:else}
      <p class={NOTE}>{words.routerAsk}</p>
      <div class={CONTROLS}>
        <Button
          label={words.openPorts}
          onclick={() => act("open-ports")}
          pending={step.state === "asking"}
          pendingLabel={words.openingPorts}
          size="sm"
          variant="secondary"
        />
      </div>
    {/if}
  {:else if step.step === "runtime"}
    <p class={NOTE}>{words.runtimeNote(machine.name)}</p>
    {@render copyable(
      words.commandLabel,
      words.runtimeCommand(step.lowest),
      words.copyCommand,
      true
    )}
  {:else if step.step === "certificate"}
    {#if step.state === "failed"}
      <p class={FAIL}>{words.certificateFailed(relayName, step.why ?? "")}</p>
      <div class={CONTROLS}>
        <Button
          label={words.retry}
          onclick={() => act("retry")}
          size="sm"
          variant="secondary"
        />
      </div>
    {:else}
      <p class={NOTE}>{words.certificateRunning(relayName)}</p>
    {/if}
  {:else if step.step === "start"}
    {#if step.state === "failed"}
      <p class={FAIL}>{step.why}</p>
      <div class={CONTROLS}>
        <Button
          label={words.startAgain}
          onclick={() => act("start-again")}
          size="sm"
          variant="secondary"
        />
      </div>
    {:else}
      <p class={NOTE}>{step.progress ?? "Starting…"}</p>
    {/if}
  {:else if step.step === "prove"}
    {#if step.state === "checking"}
      <p class={NOTE}>{words.proveChecking}</p>
    {:else if step.state === "inside"}
      <p class={NOTE}>{words.proveInside(machine.name, named)}</p>
      <div class="flex">
        <!-- A ghost's ink starts inside its box: it hangs back by its edge
             and padding so its first letter stands on the note's edge. -->
        <Button
          class="-ms-3"
          label={words.doneForNow}
          onclick={() => act("done-for-now")}
          size="sm"
          variant="ghost"
        />
      </div>
    {:else}
      <p class={FAIL}>
        {step.outside
          ? words.proveFailedOutside(machine.name)
          : words.proveFailedInside(machine.name)}
      </p>
      <div class={CONTROLS}>
        <Button
          label={words.checkAgain}
          onclick={() => act("check-again")}
          size="sm"
          variant="secondary"
        />
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet journey()}
  <section
    aria-label={STREAM_RELAY_WORDS.title}
    class="@container flex min-w-0 max-w-[72ch] flex-col gap-(--space-2) text-body"
    data-relay-journey
  >
    {@render head(false)}
    <div class="{UNDER_TITLE} gap-(--space-3)">
      {#if lead}
        <p class="text-body text-(--ink-strong) text-pretty @max-md:hidden">
          {domain ? words.leadDomain(domain) : words.leadPlain}
        </p>
        <p
          class="hidden text-body text-(--ink-strong) text-pretty @max-md:block"
        >
          {domain ? words.leadDomainShort(domain) : words.leadPlainShort}
        </p>
      {/if}
      <!-- biome-ignore lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list); these steps are still a numbered list. -->
      <ol class="m-0 grid list-none gap-(--space-3) p-0" role="list">
        {#each steps as step, index (step.step)}
          {@const mark = markOf(step)}
          <li
            class="mark-line grid grid-cols-[var(--icon-md)_minmax(0,1fr)] items-start gap-x-(--space-2) gap-y-(--space-1) text-label"
            data-open={index === open || undefined}
            data-state={step.state}
            data-step={step.step}
          >
            {@render stepMark(mark, index + 1)}
            <span
              class={[
                "min-w-0 text-label [overflow-wrap:anywhere]",
                mark === "done" || mark === "waiting"
                  ? "text-(--ink-muted)"
                  : "text-(--ink-strong)",
              ]}
              >{#if SAID[mark]}<span class="sr-only">{SAID[mark]}{" "}</span
                >{/if}{labelOf(step)}</span
            >
            {#if index === open && hasBody(step)}
              <div
                class="col-start-2 flex min-w-0 flex-col gap-(--space-2) @max-md:col-span-2 @max-md:col-start-1"
                data-box
                data-slot="step-body"
              >
                {@render stepBody(step)}
              </div>
            {/if}
          </li>
        {/each}
      </ol>
      {#if later}
        <div class="flex justify-end">
          <Button
            class="-me-3"
            label={STREAM_RELAY_WORDS.later}
            onclick={() => act("later")}
            size="sm"
            variant="ghost"
          />
        </div>
      {/if}
    </div>
  </section>
{/snippet}

{#if face === "entry" && domain}
  <!-- The take-over's stream place: why the stream didn't connect, and the
       one way on. Set up unfolds the journey here; the browser keeps
       running underneath. -->
  <section
    aria-label={STREAM_RELAY_WORDS.title}
    class="@container flex min-w-0 max-w-[60ch] flex-col items-start gap-(--space-3)"
    data-relay-entry
  >
    <p
      class="text-body text-(--ink-strong) text-pretty [overflow-wrap:anywhere]"
    >
      {words.entry(domain)}
    </p>
    <Button
      class="@max-md:w-full"
      label={words.setUp}
      onclick={() => {
        entered = true;
        act("set-up");
      }}
    />
  </section>
{:else if face === "done" && summary}
  <!-- Needs you's ticked row: the relay's tick, where it is live, and where
       it is seen from now on. -->
  <section
    aria-label={STREAM_RELAY_WORDS.title}
    class="@container flex min-w-0 max-w-[72ch] flex-col gap-(--space-2)"
    data-relay-done
  >
    {@render head(true)}
    <div class="{UNDER_TITLE} items-start gap-(--space-2)">
      <p
        class="text-body text-(--ink-strong) text-pretty [overflow-wrap:anywhere]"
      >
        {words.doneRow(summary.name ?? summary.machine.address)}
      </p>
      <Button
        class="@max-md:w-full"
        href="/config/browsers"
        label={words.openSettings}
        size="sm"
        variant="secondary"
      />
    </div>
  </section>
{:else if face === "summary" && summary}
  {@const live = portDown ? words.portDown : words.live}
  <!-- The live relay, one grid: who and where, with Stop and Remove at the
       trailing edge (last, under everything, in a narrow card, so its state
       reads before the destructive control); its ports; then each line with
       its one action in a trailing column of its own, so those actions
       stand on one edge at one width. -->
  <section
    aria-label={STREAM_RELAY_WORDS.title}
    class="@container min-w-0 max-w-[72ch]"
    data-relay-summary
  >
    <div
      class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-(--space-3) gap-y-(--space-2) @max-md:grid-cols-1"
    >
      <div class="flex min-w-0 flex-col gap-(--space-1)">
        <div class="flex min-w-0 flex-wrap items-center gap-(--space-2)">
          <span
            class="min-w-0 text-label text-(--ink-strong) [overflow-wrap:anywhere]"
            >{summary.machine.name}</span
          >
          <Badge variant={portDown ? "attn" : "done"}><span>{live}</span></Badge
          >
        </div>
        <p
          class="min-w-0 text-meta text-(--ink-muted) [overflow-wrap:anywhere]"
        >
          <code class="font-mono text-(--ink-strong)"
            >{summary.machine.address}</code
          >{#if summary.name}{" · "}<code class="font-mono text-(--ink-strong)"
              >{summary.name}</code
            >{/if}
        </p>
      </div>
      <div
        class="flex flex-wrap items-center gap-(--space-4) @max-md:order-last @max-md:justify-self-start"
      >
        <Button
          class="@max-md:-ms-3"
          label={STREAM_RELAY_WORDS.stop}
          onclick={() => act("stop")}
          size="sm"
          variant="ghost"
        />
        <Button
          label={STREAM_RELAY_WORDS.remove}
          onclick={() => act("remove")}
          size="sm"
          variant="destructive"
        />
      </div>
      <ul
        aria-label={words.portsLabel}
        class="col-span-full m-0 flex min-w-0 list-none flex-wrap gap-(--space-2) p-0"
      >
        {#each summary.ports as port (port.name)}
          <li>
            <Badge variant={port.up ? "done" : "fail"}
              ><span>{port.name} {port.up ? "up" : "down"}</span></Badge
            >
          </li>
        {/each}
      </ul>
      <div
        class="col-span-full grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-(--space-3) gap-y-(--space-2) @max-md:grid-cols-1 @max-md:justify-items-start"
      >
        <p
          class="min-w-0 text-meta text-(--ink-muted) text-pretty [overflow-wrap:anywhere]"
        >
          {#if summary.ends}{words.certificateEnds(
              summary.ends
            )}{" · "}{/if}{summary.proven
            ? words.provenBy(summary.proven.device, summary.proven.at)
            : words.notProven}
        </p>
        <Button
          label={words.checkAgain}
          onclick={() => act("check-again")}
          size="sm"
          variant="outline"
        />
        {#if !summary.name}
          <p class="min-w-0 text-meta text-(--ink-muted) text-pretty">
            {words.noName}
          </p>
          <Button
            label={words.addName}
            onclick={() => act("add-name")}
            size="sm"
            variant="outline"
          />
        {/if}
      </div>
    </div>
  </section>
{:else}
  {@render journey()}
{/if}
