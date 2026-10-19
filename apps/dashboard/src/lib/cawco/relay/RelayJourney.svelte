<script lang="ts">
  /**
   * The stream relay's guided journey, one card in every place it is drawn
   * (the browser panel's stream when a take-over through a domain fails,
   * Caw's Needs you, Settings › Browsers), built on HTTPS on the tailnet's
   * row (NeedsCard, `item.kind === "tailnet"`): a title, one lead line, then
   * every step that applies in order, each its label, a note and one control
   * while it stands, and its tick as the hub finds it taken.
   *
   * Three faces, by `view`: `entry`, the take-over's stream place saying why
   * it didn't connect, whose Set up unfolds the journey in place; `journey`,
   * the step list; `summary`, the live relay as Settings shows it, with Add a
   * name while none stands. Everything it shows arrives as props (the hub's
   * journey record); what the person presses leaves as `onact`.
   */
  import { STREAM_RELAY_WORDS } from "@cawco/core";
  import Field from "#lib/cawco/config/Field.svelte";
  import CopyBox from "#lib/cawco/join/CopyBox.svelte";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import {
    IconError,
    IconMonitor,
    IconRefresh,
    IconSuccess,
  } from "#lib/icons.js";
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
    /** Which face: the take-over's entry, the journey's steps, or the live relay's summary. */
    view?: "entry" | "journey" | "summary";
    /** The domain the person reached CawCo through, seen through a proxy; null by IP or the tailnet. */
    domain?: string | null;
    /** The machine the relay runs on. */
    machine: RelayMachine;
    /** Every step that applies, in order, with where each stands. */
    steps?: RelayStep[];
    /** The live relay, for `summary`. */
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
  /** A name stands, or will: its TLS port is in every port list. */
  const named = $derived(
    nameStep !== undefined && nameStep.state !== "skipped"
  );
  /** Step 7's number, for the router's "proven in step N". */
  const proveAt = $derived(steps.findIndex((one) => one.step === "prove") + 1);
  /** Every step ticked: no Later. */
  const finished = $derived(
    steps.every((one) => one.state === "done" || one.state === "skipped")
  );

  /** Let CawCo add it: its token field, opened here or by the record. */
  let tokenOpenHere = $state<boolean | null>(null);
  const tokenOpen = $derived(tokenOpenHere ?? nameStep?.tokenOpen ?? false);
  let token = $state("");

  const act = (kind: Exclude<RelayAct, { act: "add-record" }>["act"]) =>
    onact?.({ act: kind });

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
        return words.nameUnresolved(step.name, machine.address);
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
  /** A step's controls: side by side, each the column's width in a narrow card. */
  const CONTROLS =
    "flex min-w-0 flex-wrap items-center gap-(--space-2) @max-md:[&>*]:w-full";
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
        <span
          aria-hidden="true"
          class="box-border grid size-full place-items-center rounded-full border border-(--border-control) text-meta leading-none tabular-nums before:content-[attr(data-n)]"
          data-n={n}
        ></span>
      {/if}
    </span>
  </span>
{/snippet}

{#snippet journey()}
  <section
    aria-label={STREAM_RELAY_WORDS.title}
    class="@container flex min-w-0 max-w-[72ch] flex-col gap-(--space-2) text-body"
    data-relay-journey
  >
    <div class="mark-line flex min-w-0 items-center gap-(--space-3)">
      <span
        class="grid w-7 flex-none place-items-center text-(--ink-muted)"
        data-box
      >
        <IconMonitor aria-hidden="true" class="size-4" />
      </span>
      <h3 class="min-w-0 text-label text-(--ink-strong) text-balance">
        {STREAM_RELAY_WORDS.title}
      </h3>
    </div>
    <div
      class="flex min-w-0 flex-col gap-(--space-3) ps-[calc(--spacing(7)+var(--space-3))]"
    >
      <p class="text-body text-(--ink-strong) text-pretty">
        {domain ? words.leadDomain(domain) : words.leadPlain}
      </p>
      <!-- biome-ignore lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list); these steps are still a numbered list. -->
      <ol class="m-0 grid list-none gap-(--space-3) p-0" role="list">
        {#each steps as step, index (step.step)}
          {@const mark = markOf(step)}
          <li
            class="mark-line grid grid-cols-[var(--icon-md)_minmax(0,1fr)] items-start gap-x-(--space-2) gap-y-(--space-1) text-label"
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
            {#if mark !== "done" && mark !== "waiting"}
              <div
                class="col-start-2 flex min-w-0 flex-col gap-(--space-2)"
                data-box
                data-slot="step-body"
              >
                {#if step.step === "name"}
                  {#if step.state === "checking"}
                    <p class={NOTE}>
                      {words.nameChecking(step.name, step.askedAgo)}
                    </p>
                  {:else}
                    <p class={NOTE}>{findingOf(step)}</p>
                    <CopyBox
                      label={words.recordLabel}
                      text={words.record(step.name, machine.address)}
                      wrap
                    />
                    <div class={CONTROLS}>
                      <Button
                        aria-expanded={tokenOpen}
                        label={words.letCawCoAdd}
                        onclick={() => {
                          tokenOpenHere = !tokenOpen;
                        }}
                        size="sm"
                        variant="secondary"
                      />
                      <Button
                        label={words.skipName}
                        onclick={() => act("skip-name")}
                        size="sm"
                        variant="ghost"
                      />
                    </div>
                    {#if tokenOpen}
                      <div
                        class="flex min-w-0 flex-col gap-(--space-2)"
                        in:unfold
                        out:unfold
                      >
                        <Field
                          hint={words.tokenHint(zoneOf(step.name))}
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
                            onclick={() =>
                              onact?.({
                                act: "add-record",
                                token: token.trim(),
                              })}
                            pendingLabel="Adding…"
                            size="sm"
                          />
                        </div>
                      </div>
                    {/if}
                    <p class={NOTE}>{words.nameWhy(step.name)}</p>
                  {/if}
                {:else if step.step === "router"}
                  {#if step.state === "refused"}
                    <p class={NOTE}>{words.routerRefused(machine)}</p>
                    <CopyBox
                      label={words.forwardsLabel}
                      text={words.forwards(machine.lan ?? machine.address)}
                      wrap
                    />
                  {:else}
                    <p class={NOTE}>{words.routerAsk(machine.name)}</p>
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
                  {#if step.state === "checking"}
                    <p class={NOTE}>{words.runtimeChecking}</p>
                  {:else}
                    <p class={NOTE}>{words.runtimeNote(machine.name)}</p>
                    <CopyBox
                      label={words.commandLabel}
                      text={words.runtimeCommand(step.lowest)}
                      wrap
                    />
                  {/if}
                {:else if step.step === "certificate"}
                  {#if step.state === "failed"}
                    <p class={FAIL}>
                      {words.certificateFailed(relayName, step.why ?? "")}
                    </p>
                    <div class={CONTROLS}>
                      <Button
                        icon={IconRefresh}
                        label={words.retry}
                        onclick={() => act("retry")}
                        size="sm"
                        variant="secondary"
                      />
                    </div>
                  {:else}
                    <p class={NOTE}>
                      {words.certificateRunning(relayName)}
                    </p>
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
                    <div class={CONTROLS}>
                      <Button
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
              </div>
            {/if}
          </li>
        {/each}
      </ol>
      {#if !finished}
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
{:else if face === "summary" && summary}
  {@const live = portDown ? words.portDown : words.live}
  <section
    aria-label={STREAM_RELAY_WORDS.title}
    class="@container flex min-w-0 max-w-[72ch] flex-col gap-(--space-2)"
    data-relay-summary
  >
    <div
      class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-(--space-3) @max-md:grid-cols-1"
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
        class="flex flex-wrap items-center gap-(--space-4) @max-md:justify-self-start"
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
    </div>
    <ul
      aria-label={words.portsLabel}
      class="m-0 flex min-w-0 list-none flex-wrap gap-(--space-2) p-0"
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
      class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-(--space-3) @max-md:grid-cols-1"
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
        class="@max-md:justify-self-start"
        label={words.checkAgain}
        onclick={() => act("check-again")}
        size="sm"
        variant="outline"
      />
    </div>
    {#if !summary.name}
      <div
        class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-(--space-3) @max-md:grid-cols-1"
      >
        <p class="min-w-0 text-meta text-(--ink-muted) text-pretty">
          {words.noName}
        </p>
        <Button
          class="@max-md:justify-self-start"
          label={words.addName}
          onclick={() => act("add-name")}
          size="sm"
          variant="secondary"
        />
      </div>
    {/if}
  </section>
{:else}
  {@render journey()}
{/if}
