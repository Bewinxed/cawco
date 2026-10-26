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
   * Five faces, by `view`: `entry`, the take-over's stream place saying why
   * it didn't connect, whose Set up unfolds the journey in place; `start`,
   * Settings › Browsers before anyone set it up, the lead and Set up;
   * `journey`, the step list; `summary`, the relay once it has gone live, as
   * Settings shows it, with Add a name while none stands and Stop and Remove
   * asked in place; `done`, Caw's Needs you row once it is live and proven.
   * Everything it shows arrives as props (the hub's journey, core
   * stream-relay.ts); what the person presses leaves as `onact`, whose
   * refusal stands under the step in the hub's words.
   */
  import {
    type RelayAct,
    type RelayChoice,
    type RelayMachine,
    type RelayStep,
    type RelaySummary,
    STREAM_RELAY_WORDS as words,
    zoneOf,
  } from "@cawco/core/stream-relay";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import CopyBox from "#lib/cawco/CopyBox.svelte";
  import Field from "#lib/cawco/config/Field.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Badge, type BadgeVariant } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { UseClipboard } from "#lib/hooks/use-clipboard.svelte.js";
  import { IconError, IconMonitor, IconSuccess } from "#lib/icons.js";

  let {
    view = "journey",
    domain = null,
    machine = null,
    candidates = 0,
    steps = [],
    summary = null,
    row = false,
    onact,
  }: {
    /** Drawn as Caw's Needs you row: its kind and where under it, as every onboarding row says. */
    row?: boolean;
    /** Which face: the take-over's entry, Settings' Set up, the journey's steps, the live relay's summary, or Needs you's ticked row. */
    view?: "entry" | "start" | "journey" | "summary" | "done";
    /** The domain the person reached CawCo through, seen through a proxy; null by IP or the tailnet. */
    domain?: string | null;
    /** The machine the relay runs on; null before a pick. */
    machine?: RelayMachine | null;
    /** How many machines could run it, for the row's meta before a pick. */
    candidates?: number;
    /** Every step that applies, in order, with where each stands. */
    steps?: RelayStep[];
    /** The live relay, for `summary` and `done`. */
    summary?: RelaySummary | null;
    /** What the person pressed: the hub's to act on; a rejection is its refusal, said under the step. */
    onact?: (act: RelayAct) => void | Promise<void>;
  } = $props();

  /** The entry's Set up was pressed: the journey stands in its place. */
  let entered = $state(false);
  const face = $derived(view === "entry" && entered ? "journey" : view);

  /** The act on its way, by its kind, and the hub's last refusal of one. */
  let pending = $state<RelayAct["act"] | null>(null);
  let refusal = $state<string | null>(null);
  async function run(next: RelayAct): Promise<void> {
    if (pending) {
      return;
    }
    pending = next.act;
    refusal = null;
    try {
      await onact?.(next);
    } catch (error) {
      refusal = failureWords(error);
    } finally {
      pending = null;
    }
  }
  const act = (kind: Extract<RelayAct, { act: string }>["act"]) =>
    run({ act: kind } as RelayAct);

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
        return "waiting";
      case "inside":
      case "needs":
      case "none":
        break;
    }
    return "standing";
  }

  /** A step to act on, or one that failed. */
  const standsOn = (step: RelayStep): boolean => {
    const mark = markOf(step);
    return mark === "standing" || mark === "failed";
  };
  /**
   * The router's forwards give way once another step stands on the person
   * or the relay is live: nothing waits on them, and the last step proves
   * them from outside.
   */
  const routerYields = $derived(
    steps.some(
      (one) =>
        one.step !== "router" &&
        (standsOn(one) || (one.step === "start" && one.state === "done"))
    )
  );
  /** Something stands on the person now. */
  const asks = (step: RelayStep): boolean =>
    standsOn(step) && !(step.step === "router" && routerYields);
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

  /** A step's note and control: none for one whose spinner says all it has (the runtime, checked). */
  const hasBody = (step: RelayStep): boolean =>
    !(step.step === "runtime" && step.state === "checking");

  /** Let CawCo add it: its token field, opened here or by Cloudflare's refusal. */
  let tokenOpenHere = $state<boolean | null>(null);
  const tokenOpen = $derived(tokenOpenHere ?? nameStep?.tokenWhy !== undefined);
  let token = $state("");
  /** The name typed, where none is known yet. */
  let typed = $state("");

  /** The phone's copy row: one step's body is shown at a time, so one clipboard serves it. */
  const clipboard = new UseClipboard();
  const copyWord = (label: string): string => {
    if (clipboard.status === "success") {
      return words.copied;
    }
    return clipboard.status === "failure" ? words.copyFailed : label;
  };

  /** Stop and Remove, asked in place under the summary (DESIGN.md, Asking in the page). */
  const asker = new Asker<AskHereRequest>();
  const asking = (at: string): boolean => asker.pending?.at === at;
  const askStop = (relay: RelaySummary) =>
    asker.ask({
      at: "relay-stop",
      title: words.stopTitle(relay.machine.name),
      body: words.stopBody,
      confirmLabel: words.stop,
      pendingLabel: "Stopping…",
      destructive: true,
      run: () => onact?.({ act: "stop" }) ?? Promise.resolve(),
    });
  const askRemove = (relay: RelaySummary) =>
    asker.ask({
      at: "relay-remove",
      title: words.removeTitle(relay.machine.name),
      body: words.removeBody(relay.name),
      confirmLabel: words.remove,
      pendingLabel: "Removing…",
      destructive: true,
      run: () => onact?.({ act: "remove" }) ?? Promise.resolve(),
    });

  /** The machine's words, before a pick: none yet. */
  const machineNow = $derived<RelayMachine>(
    machine ?? { name: "", address: "", lan: null }
  );
  /** The forwards to make on the router, behind one: its step's, and an outside proof's failure's. */
  const forwardsLine = $derived.by(() => {
    const router = steps.find(
      (one): one is Extract<RelayStep, { step: "router" }> =>
        one.step === "router"
    );
    return router ? words.forwards(machineNow.lan ?? machineNow.address) : null;
  });

  /** What a ticked step says was done. */
  function doneLabelOf(step: RelayStep): string {
    switch (step.step) {
      case "machine":
        return words.machineDone(machineNow);
      case "name":
        return step.state === "skipped"
          ? words.nameSkipped
          : words.nameDone(step.name);
      case "router":
        return words.routerDone;
      case "runtime":
        return words.runtimeDone;
      case "certificate":
        return words.certificateDone(relayName, step.endsAt ?? Date.now());
      case "start":
        return words.startDone(machineNow.name, named);
      case "prove":
        break;
    }
    return words.proveDone(
      step.device ?? "",
      step.at ?? Date.now(),
      step.ports ?? ""
    );
  }

  /** A step's label: what to do while it stands, what was done once ticked. */
  function labelOf(step: RelayStep): string {
    if (markOf(step) === "done") {
      return doneLabelOf(step);
    }
    switch (step.step) {
      case "machine":
        return words.machine;
      case "name":
        return words.name;
      case "router":
        return words.router;
      case "runtime":
        return words.runtime;
      case "certificate":
        return words.certificate;
      case "start":
        return words.start;
      case "prove":
        break;
    }
    return words.prove;
  }

  /** The name check's finding, in the error formula's words. */
  function findingOf(step: Extract<RelayStep, { step: "name" }>): string {
    switch (step.finding) {
      case "proxied":
        return words.nameProxied(step.name, machineNow.address);
      case "elsewhere":
        return words.nameElsewhere(step.name, step.answers ?? "", machineNow);
      case "unresolved":
      case undefined:
        break;
    }
    return words.nameUnresolved(step.name);
  }

  /** Seconds since the hub last asked DNS, on the clock's next tick, while the name is checked. */
  let now = $state(Date.now());
  $effect(() => {
    if (nameStep?.state !== "checking") {
      return;
    }
    const timer = setInterval(() => {
      now = Date.now();
    }, 1000);
    return () => clearInterval(timer);
  });

  /** The state word a screen reader hears before a step's label. */
  const SAID: Record<Mark, string> = {
    done: words.stepDone,
    failed: words.stepFailed,
    working: words.stepWorking,
    standing: "",
    waiting: "",
  };

  /** A live relay with a port that did not answer: said in words, never by tint alone. */
  const portDown = $derived(
    summary?.state === "live" && summary.ports.some((port) => !port.up)
  );
  /** The summary's badge: its state in words, and its tint. */
  const badge = $derived.by((): { said: string; tint: BadgeVariant } => {
    switch (summary?.state) {
      case "live":
        return portDown
          ? { said: words.portDown, tint: "attn" }
          : { said: words.live, tint: "done" };
      case "pulling":
        return { said: summary.progress ?? words.starting, tint: "live" };
      case "starting":
        return { said: words.starting, tint: "live" };
      case "failed":
        return { said: words.failed, tint: "fail" };
      case "stopped":
      case undefined:
        break;
    }
    return { said: words.stopped, tint: "secondary" };
  });
  /** The relay is pulling or starting: Stop waits, said under the buttons. */
  const busy = $derived(
    summary?.state === "pulling" || summary?.state === "starting"
  );

  /** The words of a copy box, each a unit that never breaks inside: a parenthesis is one ("(DNS only, no proxy)"). */
  const unitsOf = (text: string): string[] =>
    text.match(/\([^)]*\)|\S+/gu) ?? [text];

  /** A step's note: meta, muted; a failure's in the fail ink. */
  const NOTE = "min-w-0 text-meta text-ink-muted text-pretty wrap-anywhere";
  const FAIL =
    "min-w-0 text-meta text-status-fail-ink text-pretty wrap-anywhere";
  /** Needs you's meta line (NeedsCard's `.meta`): meta, muted, one line, at every width. */
  const META = "min-w-0 max-w-full truncate text-meta text-ink-muted";
  /** A step's controls: side by side, each the column's width in a narrow card (one grid column), `space-2` apart. */
  const CONTROLS =
    "flex min-w-0 flex-wrap items-center gap-space-2 @max-field-group:grid @max-field-group:grid-cols-1";
  /** The words under the title: on the title's edge (the lead column and `space-3`), on the card's own edge in a narrow card. */
  const UNDER_TITLE =
    "flex min-w-0 flex-col ps-(--title-edge) @max-field-group:ps-0";
</script>

{#snippet stepMark(mark: Mark, n: number)}
  <span class="mark-cell">
    <span
      class="grid size-icon-md place-items-center text-ink-muted"
      data-slot="step-mark"
    >
      {#if mark === "done"}
        <IconSuccess
          aria-hidden="true"
          class="size-icon-md text-status-done-ink"
        />
      {:else if mark === "failed"}
        <IconError
          aria-hidden="true"
          class="size-icon-md text-status-fail-ink"
        />
      {:else if mark === "working"}
        <Spinner aria-hidden="true" role="none" />
      {:else}
        <!-- A step's number, no fill: in the muted ink on the control edge
             while it waits, in the strong ink on the outline button's edge
             (3:1) while it stands on you, so neither reads as a tick. -->
        <span
          aria-hidden="true"
          class={[
            "box-border grid size-full place-items-center rounded-pill border bg-transparent text-meta leading-none num before:content-data-n",
            mark === "standing"
              ? "border-border-button-outline text-ink-strong"
              : "border-border-control text-ink-muted",
          ]}
          data-n={n}
        ></span>
      {/if}
    </span>
  </span>
{/snippet}

<!-- Something to paste elsewhere: the house's copy box in a wide card; in a
     narrow one the text across the card, wrapping between its units (a
     parenthesis stays whole), or clamped to two lines (`clamp`), and Copy on
     a full-width row of its own, naming what it copies. Copy takes the whole
     text, as it reads, either way. -->
{#snippet copyable(
  label: string,
  text: string,
  copyLabel: string,
  clamp: boolean
)}
  <div class="min-w-0 @max-field-group:hidden" data-box>
    <CopyBox {label} {text} wrap />
  </div>
  <div
    class="hidden min-w-0 flex-col gap-space-2 @max-field-group:flex"
    data-box
  >
    <!-- The box keeps its edge and padding; the clamp is on the words
         inside it, so a third line is cut at the words' edge, never shown
         in the box's padding. -->
    <code
      class="block min-w-0 rounded-md border border-border-control bg-surface-hover px-space-3 py-space-2 font-mono text-meta text-ink-strong"
      title={text}
      ><span class={clamp ? "line-clamp-2" : "block"} data-slot="copy-words"
        ><span class="sr-only">{label}:{" "}</span
        >{#each unitsOf(text) as unit, index (index)}{#if index > 0}{" "}{/if}<span
            class={[
              "inline-block max-w-full",
              unit.startsWith("(") ? "whitespace-nowrap" : "wrap-anywhere",
            ]}
            data-unit>{unit}</span
          >{/each}</span
      ></code
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

<!-- The title's line: the card's mark in the lead column (Caw's panel's
     28px one); in a narrow card, where the steps take the card's own edge,
     the mark stands in the steps' mark column and the title on their
     labels' edge. -->
{#snippet head(done: boolean)}
  <div
    class="mark-line flex min-w-0 items-center gap-space-3 @max-field-group:gap-space-2"
  >
    <span
      class="grid w-c-row-lead flex-none place-items-center text-ink-muted @max-field-group:w-icon-md"
      data-box
    >
      {#if done}
        <IconSuccess
          aria-hidden="true"
          class="size-icon-md text-status-done-ink"
        />
      {:else}
        <IconMonitor aria-hidden="true" class="size-icon-md" />
      {/if}
    </span>
    <h3 class="min-w-0 text-label text-ink-strong text-balance">
      {words.title}
    </h3>
  </div>
{/snippet}

<!-- The name step's way past it: no name, the machine's own address. -->
{#snippet skipName()}
  <Button
    disabled={pending !== null}
    label={words.skipName}
    onclick={() => act("skip-name")}
    size="sm"
    variant="secondary"
  />
{/snippet}

{#snippet refused()}
  {#if refusal}
    <p class={FAIL} data-relay-refusal role="alert">{refusal}</p>
  {/if}
{/snippet}

{#snippet choiceRow(choice: RelayChoice)}
  <li
    class="grid min-w-0 grid-cols-fluid-auto items-center gap-x-space-3 gap-y-space-1 py-space-2 not-first:border-t not-first:border-border-hairline @max-field-group:grid-cols-1"
    data-relay-choice={choice.machineId}
  >
    <div class="flex min-w-0 flex-col gap-space-1">
      <span class="min-w-0 text-label text-ink-strong wrap-anywhere"
        >{choice.name}</span
      >
      <p class="min-w-0 text-meta text-ink-muted wrap-anywhere">
        <code class="font-mono text-ink-strong">{choice.address}</code
        >{#if choice.lan}{`, ${words.behindRouter}`}{/if}{#if !choice.online}{` · ${words.offline}`}{/if}
      </p>
    </div>
    <Button
      class="@max-field-group:w-full"
      disabled={pending !== null}
      label={words.runHere}
      onclick={() => run({ act: "pick", machineId: choice.machineId })}
      pending={pending === "pick"}
      size="sm"
      variant="outline"
    />
  </li>
{/snippet}

{#snippet machineBody(step: Extract<RelayStep, { step: "machine" }>)}
  {#if step.state === "none"}
    <p class={NOTE}>{words.none}</p>
  {:else}
    <ul
      aria-label={words.machine}
      class="m-0 flex min-w-0 list-none flex-col p-0"
    >
      {#each step.choices ?? [] as choice (choice.machineId)}
        {@render choiceRow(choice)}
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet nameBody(step: Extract<RelayStep, { step: "name" }>)}
  {#if step.name === ""}
    <!-- No domain known: the name typed here. -->
    <p class={NOTE}>{words.nameWhyNone}</p>
    <Field id="relay-name" label={words.nameLabel}>
      <Input
        autocapitalize="off"
        autocomplete="off"
        class="w-full max-w-field-group"
        data-relay-name-field
        id="relay-name"
        inputmode="url"
        placeholder={words.namePlaceholder}
        spellcheck={false}
        bind:value={typed}
      />
    </Field>
    <div class={CONTROLS}>
      <Button
        disabled={typed.trim() === "" || pending !== null}
        label={words.useName}
        onclick={() => run({ act: "name", name: typed.trim() })}
        pending={pending === "name"}
        size="sm"
      />
      {@render skipName()}
    </div>
  {:else}
    {#if step.state === "checking"}
      <p class={NOTE}>
        {words.nameChecking(
          step.name,
          step.askedAt === undefined
            ? undefined
            : Math.max(0, Math.round((now - step.askedAt) / 1000))
        )}
      </p>
    {:else}
      <p class={NOTE}>{findingOf(step)}</p>
      {@render copyable(
        words.recordLabel,
        words.record(step.name, machineNow.address),
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
      {@render skipName()}
    </div>
    {#if step.state !== "checking" && zone && tokenOpen}
      <div class="flex min-w-0 flex-col gap-space-2" in:unfold out:unfold>
        {@render tokenField(zone, step.tokenWhy)}
        <div class={CONTROLS}>
          <Button
            disabled={token.trim() === "" || pending !== null}
            label={words.addRecord}
            onclick={() => run({ act: "add-record", token: token.trim() })}
            pending={pending === "add-record"}
            pendingLabel={words.addingRecord}
            size="sm"
          />
        </div>
      </div>
    {/if}
  {/if}
{/snippet}

<!-- The Cloudflare token's field: the name step's Let CawCo add it and the
     certificate step's ask share it (one step's body shows at a time), with
     Cloudflare's refusal of the last one under it. -->
{#snippet tokenField(zone: string, why: string | undefined)}
  <Field hint={words.tokenHint(zone)} id="relay-token" label={words.tokenLabel}>
    <Input
      autocapitalize="off"
      autocomplete="off"
      class="w-full"
      data-relay-token
      id="relay-token"
      spellcheck={false}
      type="password"
      bind:value={token}
    />
  </Field>
  {#if why}
    <p class={FAIL} data-relay-token-why>{why}</p>
  {/if}
{/snippet}

{#snippet stepBody(step: RelayStep)}
  {#if step.step === "machine"}
    {@render machineBody(step)}
  {:else if step.step === "name"}
    {@render nameBody(step)}
  {:else if step.step === "router"}
    <p class={NOTE}>{words.routerNote}</p>
    {#if forwardsLine}
      {@render copyable(
        words.forwardsLabel,
        forwardsLine,
        words.copyForwards,
        false
      )}
    {/if}
  {:else if step.step === "runtime"}
    <p class={NOTE}>{words.runtimeNote(step, machineNow.name)}</p>
    {@render copyable(
      words.commandLabel,
      words.runtimeCommand(step),
      words.copyCommand,
      true
    )}
  {:else if step.step === "certificate"}
    {#if step.state === "needs"}
      <!-- No token reaches the name's zone: the certificate is issued only
           through Cloudflare's DNS, so the step asks for one, or the name
           goes and the relay runs plain. -->
      <p class={NOTE}>{words.certificateToken(relayName)}</p>
      {@render tokenField(zone ?? relayName, step.tokenWhy)}
      <div class={CONTROLS}>
        <Button
          disabled={token.trim() === "" || pending !== null}
          label={words.useToken}
          onclick={() => run({ act: "token", token: token.trim() })}
          pending={pending === "token"}
          pendingLabel={words.checkingToken}
          size="sm"
        />
        {@render skipName()}
      </div>
    {:else if step.state === "failed"}
      <p class={FAIL}>{step.why}</p>
      <div class={CONTROLS}>
        <Button
          disabled={pending !== null}
          label={words.retry}
          onclick={() => act("retry")}
          pending={pending === "retry"}
          size="sm"
          variant="secondary"
        />
      </div>
    {:else}
      <p class={NOTE}>{words.certificateRunning(relayName)}</p>
    {/if}
  {:else if step.step === "start"}
    {#if step.state === "failed"}
      <p class={FAIL}>
        {#if step.command && step.why?.includes(step.command)}
          {@const at = step.why.indexOf(step.command)}
          {step.why.slice(0, at)}<code class="font-mono text-ink-strong"
            >{step.command}</code
          >{step.why.slice(at + step.command.length)}
        {:else}
          {step.why}
        {/if}
      </p>
      <div class={CONTROLS}>
        <Button
          disabled={pending !== null}
          label={words.startAgain}
          onclick={() => act("start-again")}
          pending={pending === "start-again"}
          size="sm"
          variant="secondary"
        />
      </div>
    {:else}
      <p class={NOTE}>{step.progress ?? words.starting}</p>
    {/if}
  {:else if step.step === "prove"}
    {#if step.state === "checking"}
      <p class={NOTE}>{words.proveChecking}</p>
    {:else if step.state === "inside"}
      <p class={NOTE}>
        {words.proveInside(
          step.device ?? "",
          machineNow.name,
          step.ports ?? ""
        )}
      </p>
      <div class="flex">
        <!-- A ghost's ink starts inside its box: it hangs back by its edge
             and padding so its first letter stands on the note's edge. -->
        <Button
          class="-ms-space-3"
          disabled={pending !== null}
          label={words.doneForNow}
          onclick={() => act("done-for-now")}
          size="sm"
          variant="ghost"
        />
      </div>
    {:else}
      <p class={FAIL}>
        {#if step.refused}
          {words.proveRefused}
        {:else if step.outside}
          {words.proveFailedOutside(machineNow.name)}
        {:else}
          {words.proveFailedInside(machineNow.name)}
        {/if}
      </p>
      {#if step.outside && !step.refused && forwardsLine}
        {@render copyable(
          words.forwardsLabel,
          forwardsLine,
          words.copyForwards,
          false
        )}
      {/if}
      <div class={CONTROLS}>
        {#if step.refused}
          <!-- Another secret than the hub's: the start gives it the hub's. -->
          <Button
            disabled={pending !== null}
            label={words.startAgain}
            onclick={() => act("start-again")}
            pending={pending === "start-again"}
            size="sm"
            variant="secondary"
          />
        {/if}
        <Button
          disabled={pending !== null}
          label={words.checkAgain}
          onclick={() => act("check-again")}
          pending={pending === "check-again"}
          size="sm"
          variant="secondary"
        />
      </div>
    {/if}
  {/if}
{/snippet}

{#snippet journey()}
  <section
    aria-label={words.title}
    class="@container flex min-w-0 max-w-c-measure flex-col gap-space-2 text-body"
    data-relay-journey
  >
    {@render head(false)}
    <div
      class="{UNDER_TITLE} gap-space-3"
      style:--title-edge="calc(var(--c-row-lead) + var(--space-3))"
    >
      {#if lead}
        <p
          class="text-body text-ink-strong text-pretty @max-field-group:hidden"
        >
          {domain ? words.leadDomain(domain) : words.leadPlain}
        </p>
        <p
          class="hidden text-body text-ink-strong text-pretty @max-field-group:block"
        >
          {domain ? words.leadDomainShort(domain) : words.leadPlainShort}
        </p>
      {/if}
      <!-- biome-ignore lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list); these steps are still a numbered list. -->
      <ol class="m-0 grid list-none gap-space-3 p-0" role="list">
        {#each steps as step, index (step.step)}
          <!-- Only the open step stands on the person; another that will
               ask once it is reached waits in the meantime. -->
          {@const mark =
            index !== open && markOf(step) === "standing"
              ? "waiting"
              : markOf(step)}
          <li
            class="mark-line grid grid-cols-mark-fluid items-start gap-x-space-2 gap-y-space-1 text-label"
            data-open={index === open || undefined}
            data-state={step.state}
            data-step={step.step}
          >
            {@render stepMark(mark, index + 1)}
            <span
              class={[
                "min-w-0 text-label wrap-anywhere",
                mark === "done" || mark === "waiting"
                  ? "text-ink-muted"
                  : "text-ink-strong",
              ]}
              data-slot="step-label"
              >{#if SAID[mark]}<span class="sr-only">{SAID[mark]}{" "}</span
                >{/if}{labelOf(step)}</span
            >
            {#if index === open && hasBody(step)}
              <div
                class="col-start-2 flex min-w-0 flex-col gap-space-2 @max-field-group:col-span-2 @max-field-group:col-start-1"
                data-box
                data-slot="step-body"
              >
                {@render stepBody(step)}
                {@render refused()}
              </div>
            {/if}
          </li>
        {/each}
      </ol>
      {#if open === -1}
        {@render refused()}
      {/if}
      {#if row}
        <p class={META} data-relay-meta>
          {words.rowMeta(machine?.name ?? null, candidates)}
        </p>
      {/if}
      {#if later}
        <div class="flex justify-end">
          <Button
            class="-me-space-3"
            disabled={pending !== null}
            label={words.later}
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
    aria-label={words.title}
    class="@container flex min-w-0 max-w-c-measure-short flex-col items-start gap-space-3"
    data-relay-entry
  >
    <p
      class="text-body text-ink-strong text-pretty wrap-anywhere @max-field-group:hidden"
    >
      {words.entry(domain)}
    </p>
    <p
      class="hidden text-body text-ink-strong text-pretty wrap-anywhere @max-field-group:block"
    >
      {words.entryShort(domain)}
    </p>
    <Button
      class="@max-field-group:w-full"
      label={words.setUp}
      onclick={() => {
        entered = true;
        act("set-up");
      }}
      pending={pending === "set-up"}
    />
    {@render refused()}
  </section>
{:else if face === "start"}
  <!-- Settings › Browsers before anyone set it up: why, and Set up. -->
  <section
    aria-label={words.title}
    class="@container flex min-w-0 max-w-c-measure flex-col gap-space-2"
    data-relay-start
  >
    {@render head(false)}
    <div
      class="{UNDER_TITLE} items-start gap-space-3"
      style:--title-edge="calc(var(--c-row-lead) + var(--space-3))"
    >
      <p class="text-body text-ink-strong text-pretty wrap-anywhere">
        {domain ? words.leadDomain(domain) : words.leadPlain}
      </p>
      <Button
        class="@max-field-group:w-full"
        data-relay-set-up
        label={words.setUp}
        onclick={() => act("set-up")}
        pending={pending === "set-up"}
      />
      {@render refused()}
    </div>
  </section>
{:else if face === "done" && summary}
  <!-- Needs you's ticked row: the relay's tick, where it is live, and where
       it is seen from now on. -->
  <section
    aria-label={words.title}
    class="@container flex min-w-0 max-w-c-measure flex-col gap-space-2"
    data-relay-done
  >
    {@render head(true)}
    <div
      class="{UNDER_TITLE} items-start gap-space-2"
      style:--title-edge="calc(var(--c-row-lead) + var(--space-3))"
    >
      <p class="text-body text-ink-strong text-pretty wrap-anywhere">
        {words.doneRow(summary.name ?? summary.machine.address)}
      </p>
      {#if row}
        <p class={META} data-relay-meta>
          {words.rowMeta(summary.machine.name, candidates)}
        </p>
      {/if}
      <Button
        class="@max-field-group:w-full"
        href="/config/browsers"
        label={words.openSettings}
        size="sm"
        variant="secondary"
      />
    </div>
  </section>
{:else if face === "summary" && summary}
  <!-- The relay once it has gone live, one grid: who and where, with Stop
       (or Start relay) and Remove at the trailing edge (last, under
       everything, in a narrow card, so its state reads before the
       destructive control); its ports; then each line with its one action in
       a trailing column of its own, so those actions stand on one edge at
       one width. -->
  <section
    aria-label={words.title}
    class="@container min-w-0 max-w-c-measure"
    data-relay-summary
  >
    <div
      class="grid min-w-0 grid-cols-fluid-auto items-center gap-x-space-3 gap-y-space-2 @max-field-group:grid-cols-1"
    >
      <div class="flex min-w-0 flex-col gap-space-1">
        <div class="flex min-w-0 flex-wrap items-center gap-space-2">
          <span
            class="min-w-0 text-label text-ink-strong wrap-anywhere"
            data-relay-machine>{summary.machine.name}</span
          >
          <Badge data-relay-state variant={badge.tint}
            ><span>{badge.said}</span></Badge
          >
        </div>
        <p
          class="min-w-0 text-meta text-ink-muted wrap-anywhere"
          data-relay-line
        >
          <code class="font-mono text-ink-strong"
            >{summary.machine.address}</code
          >{#if summary.name}{" · "}<code class="font-mono text-ink-strong"
              >{summary.name}</code
            >{/if}
        </p>
      </div>
      <div
        class="flex flex-wrap items-center gap-space-4 @max-field-group:order-last @max-field-group:justify-self-start"
      >
        {#if summary.state === "stopped" || summary.state === "failed"}
          <Button
            data-relay-start-again
            disabled={pending !== null}
            label={words.startRelay}
            onclick={() => act("start")}
            pending={pending === "start"}
            size="sm"
            variant="outline"
          />
        {:else}
          <!-- The machine runs one relay command at a time: a stop sent
               while it starts would wait out the start. -->
          <Button
            aria-describedby={busy ? "relay-stop-wait" : undefined}
            aria-expanded={asking("relay-stop")}
            class="@max-field-group:-ms-space-3"
            data-relay-stop
            disabled={asking("relay-stop") || busy}
            label={words.stop}
            onclick={() => askStop(summary)}
            size="sm"
            variant="ghost"
          />
        {/if}
        <Button
          aria-expanded={asking("relay-remove")}
          data-relay-remove
          disabled={asking("relay-remove")}
          label={words.remove}
          onclick={() => askRemove(summary)}
          size="sm"
          variant="destructive"
        />
      </div>
      {#if busy}
        <p
          class="col-span-full text-meta text-ink-muted text-pretty"
          data-relay-wait
          id="relay-stop-wait"
        >
          {words.stopWhileStarting}
        </p>
      {/if}
      {#if summary.ports.length > 0}
        <ul
          aria-label={words.portsLabel}
          class="col-span-full m-0 flex min-w-0 list-none flex-wrap gap-space-2 p-0"
          data-relay-ports
        >
          {#each summary.ports as port (port.name)}
            <li>
              <Badge
                data-relay-port={port.name}
                variant={port.up ? "done" : "fail"}
                ><span>{port.name} {port.up ? "up" : "down"}</span></Badge
              >
            </li>
          {/each}
        </ul>
        {#each summary.ports.filter((port) => port.error) as port (port.name)}
          <p
            class="col-span-full min-w-0 text-meta text-ink-muted wrap-anywhere"
            data-relay-port-error={port.name}
          >
            <span class="text-ink-strong">{port.name}:</span>
            {port.error}
          </p>
        {/each}
      {/if}
      {#if summary.why}
        <p class="col-span-full {FAIL}" data-relay-why>
          {#if summary.whyCommand && summary.why.includes(summary.whyCommand)}
            {@const at = summary.why.indexOf(summary.whyCommand)}
            {summary.why.slice(0, at)}<code class="font-mono text-ink-strong"
              >{summary.whyCommand}</code
            >{summary.why.slice(at + summary.whyCommand.length)}
          {:else}
            {summary.why}
          {/if}
        </p>
      {/if}
      <div
        class="col-span-full grid min-w-0 grid-cols-fluid-auto items-center gap-x-space-3 gap-y-space-2 @max-field-group:grid-cols-1 @max-field-group:justify-items-start"
      >
        <p
          class="min-w-0 text-meta text-ink-muted text-pretty wrap-anywhere"
          data-relay-proven
        >
          {#if summary.endsAt}{words.certificateEnds(
              summary.endsAt
            )}{" · "}{/if}{summary.proven
            ? words.provenBy(summary.proven.device, summary.proven.at)
            : words.notProven}
        </p>
        <Button
          data-relay-check-again
          disabled={pending !== null || summary.state !== "live"}
          label={words.checkAgain}
          onclick={() => act("check-again")}
          pending={pending === "check-again"}
          size="sm"
          variant="outline"
        />
        {#if !summary.name}
          <p class="min-w-0 text-meta text-ink-muted text-pretty">
            {words.noName}
          </p>
          <Button
            data-relay-add-name
            disabled={pending !== null}
            label={words.addName}
            onclick={() => act("add-name")}
            pending={pending === "add-name"}
            size="sm"
            variant="outline"
          />
        {/if}
      </div>
      <!-- Under Stop and Remove in every layout: in a narrow card they move
           last, and the question they ask moves with them. -->
      <div class="col-span-full min-w-0 @max-field-group:order-last">
        {@render refused()}
        <AskHere {asker} at="relay-stop" />
        <AskHere {asker} at="relay-remove" />
      </div>
    </div>
  </section>
{:else}
  {@render journey()}
{/if}
