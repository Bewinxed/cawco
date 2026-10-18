<script lang="ts">
  /**
   * Browsers: the fleet's stream relay (hub stream-relay.ts), the TURN
   * server a browser's take-over reaches a screen through on any network.
   * With none, the machines that could run it (a public address in their
   * capability report), one picked, its optional DNS name, and Start relay
   * asked in place. With one, its machine, address, state and each port's
   * last STUN answer, and Stop relay and Remove relay asked in place. The
   * words are the onboarding card's (core `STREAM_RELAY_WORDS`).
   */
  import {
    type RelayCandidate,
    type RelayPortHealth,
    type StreamRelayAnswer,
    type StreamRelayState,
    type StreamRelayView,
    STREAM_RELAY_WORDS as words,
  } from "@cawco/core";
  import { onMount } from "svelte";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import Field from "#lib/cawco/config/Field.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { hubRefusal } from "#lib/cawco/hub-read.js";
  import { Badge, type BadgeVariant } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconCheck } from "#lib/icons.js";

  const section = sectionOf("browsers");

  /** How often the record is read again while the relay is coming up, and otherwise. */
  const BUSY_MS = 2000;
  const IDLE_MS = 30_000;

  let answer = $state<StreamRelayAnswer | null>(null);
  let problem = $state<string | null>(null);
  /** The machine picked to run it, and the DNS name typed for it. */
  let picked = $state<string | null>(null);
  let hostname = $state("");
  const asks = new Asker<AskHereRequest>();
  /** Whether the question asked at `at` stands: its trigger is then held (the tile holds Cancel and the verb). */
  const asking = (at: string): boolean => asks.pending?.at === at;

  const read = async (): Promise<void> => {
    try {
      const response = await fetch("/api/stream-relay");
      if (!response.ok) {
        throw await hubRefusal(response);
      }
      answer = (await response.json()) as StreamRelayAnswer;
      problem = null;
    } catch (error) {
      problem = `Could not read the stream relay — ${error instanceof Error ? error.message : String(error)}.`;
    }
  };

  const relay = $derived(answer?.relay ?? null);
  const candidates = $derived(answer?.candidates ?? []);
  const busy = $derived(
    relay?.state === "pulling" || relay?.state === "starting"
  );

  onMount(() => {
    // biome-ignore lint/complexity/noVoid: the read reports its own outcome
    void read();
  });
  $effect(() => {
    const every = busy ? BUSY_MS : IDLE_MS;
    const timer = setInterval(() => {
      // biome-ignore lint/complexity/noVoid: the read reports its own outcome
      void read();
    }, every);
    return () => clearInterval(timer);
  });
  // One machine that could run it is the one picked.
  $effect(() => {
    if (picked === null && candidates.length === 1) {
      picked = candidates[0]?.machineId ?? null;
    }
  });

  /** Sends one change and keeps what the hub answers; a refusal throws its words, so the question stays with them. */
  const change = async (
    method: "POST" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<void> => {
    const response = await fetch(path, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    if (!response.ok) {
      await read();
      throw await hubRefusal(response);
    }
    answer = (await response.json()) as StreamRelayAnswer;
  };

  const askStart = (machine: RelayCandidate) =>
    asks.ask({
      at: `start:${machine.machineId}`,
      title: words.startTitle(machine.name),
      body: words.startBody,
      confirmLabel: words.start,
      pendingLabel: "Starting…",
      run: () =>
        change("POST", "/api/stream-relay", {
          machineId: machine.machineId,
          ...(hostname.trim() ? { hostname: hostname.trim() } : {}),
        }),
    });

  const askStartAgain = (view: StreamRelayView) =>
    asks.ask({
      at: "relay-start",
      title: words.startTitle(view.machineName),
      body: words.startBody,
      confirmLabel: words.start,
      pendingLabel: "Starting…",
      run: () => change("POST", "/api/stream-relay/start"),
    });

  const askStop = (view: StreamRelayView) =>
    asks.ask({
      at: "relay-stop",
      title: words.stopTitle(view.machineName),
      body: words.stopBody,
      confirmLabel: words.stop,
      pendingLabel: "Stopping…",
      destructive: true,
      run: () => change("POST", "/api/stream-relay/stop"),
    });

  const askRemove = (view: StreamRelayView) =>
    asks.ask({
      at: "relay-remove",
      title: words.removeTitle(view.machineName),
      body: words.removeBody(view.hostname),
      confirmLabel: words.remove,
      pendingLabel: "Removing…",
      destructive: true,
      run: () => change("DELETE", "/api/stream-relay"),
    });

  /** Live with a port that did not answer: said in words, never by tint alone. */
  const portDown = (view: StreamRelayView): boolean =>
    view.state === "live" && view.health.some((port) => !port.up);

  const STATE_WORD: Record<StreamRelayState, string> = {
    pulling: "Pulling",
    starting: "Starting",
    live: "Live",
    stopped: "Stopped",
    failed: "Failed",
  };
  const STATE_TINT: Record<StreamRelayState, BadgeVariant> = {
    pulling: "live",
    starting: "live",
    live: "done",
    stopped: "secondary",
    failed: "fail",
  };

  const stateWord = (view: StreamRelayView): string => {
    if (portDown(view)) {
      return "Live, a port is down";
    }
    return view.state === "pulling" && view.progress
      ? `Pulling ${view.progress.done} of ${view.progress.total}`
      : STATE_WORD[view.state];
  };

  const stateTint = (view: StreamRelayView): BadgeVariant =>
    portDown(view) ? "attn" : STATE_TINT[view.state];

  /** A port's chip words: its name and whether it answered. */
  const chip = (port: RelayPortHealth): string =>
    `${port.port} ${port.up ? "up" : "down"}`;

  /**
   * One row of the section (DESIGN.md's Devices row): the words and the
   * trailing controls on one grid, a hairline between rows; under 640px the
   * controls take a cell of their own under the words, at its start.
   */
  const ROW =
    "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-[10px] max-sm:grid-cols-1 [&+&]:border-t [&+&]:border-(--border-hairline)";
  /** The trailing controls' cell. */
  const CONTROLS =
    "flex flex-wrap items-center gap-(--space-4) max-sm:justify-self-start";
</script>

<SectionFrame
  problem={answer === null ? problem : null}
  purpose={section.purpose}
  ready={answer !== null}
  title={section.label}
>
  <section
    aria-label={words.title}
    class="flex min-w-0 flex-col"
    data-stream-relay
  >
    {#if relay}
      {@const view = relay}
      <div class="flex min-w-0 flex-col" data-relay-row>
        <div class={ROW}>
          <div class="flex min-w-0 flex-col gap-(--space-1)">
            <div class="flex min-w-0 flex-wrap items-center gap-(--space-2)">
              <span
                class="min-w-0 text-label text-(--ink-strong) [overflow-wrap:anywhere]"
                data-relay-name>{view.machineName}</span
              >
              <Badge data-relay-state variant={stateTint(view)}
                ><span>{stateWord(view)}</span></Badge
              >
            </div>
            <p
              class="min-w-0 text-meta text-(--ink-muted) [overflow-wrap:anywhere]"
              data-relay-line
            >
              <code class="font-mono text-(--ink-strong)">{view.address}</code
              >{#if view.hostname}{" · "}<code
                  class="font-mono text-(--ink-strong)">{view.hostname}</code
                >{/if}
            </p>
          </div>
          <div class={CONTROLS}>
            {#if view.state === "stopped" || view.state === "failed"}
              <Button
                aria-expanded={asking("relay-start")}
                disabled={asking("relay-start")}
                label={words.start}
                onclick={() => askStartAgain(view)}
                size="sm"
                variant="outline"
              />
            {:else}
              <!-- The machine runs one relay command at a time: a stop sent
                   while it starts would wait out the start. Remove still
                   goes (the hub forgets the relay at once).
                   A ghost's ink starts inside its box (1px edge, 11px
                   padding): wrapped under the words it hangs back by that
                   much, so its first letter stands on their edge. -->
              <Button
                aria-describedby={busy ? "relay-stop-wait" : undefined}
                aria-expanded={asking("relay-stop")}
                class="max-sm:-ms-3"
                data-relay-stop
                disabled={asking("relay-stop") || busy}
                label={words.stop}
                onclick={() => askStop(view)}
                size="sm"
                variant="ghost"
              />
            {/if}
            <Button
              aria-expanded={asking("relay-remove")}
              data-relay-remove
              disabled={asking("relay-remove")}
              label={words.remove}
              onclick={() => askRemove(view)}
              size="sm"
              variant="destructive"
            />
          </div>
        </div>
        <!-- Why Stop waits, in words a touch screen shows too: a line of its
             own under the row, as the why is, so the row keeps one height in
             every state and nothing beside it moves as the relay goes live. -->
        {#if busy}
          <p
            class="mt-(--space-2) max-w-[72ch] text-meta text-(--ink-muted) text-pretty"
            data-relay-wait
            id="relay-stop-wait"
          >
            {words.stopWhileStarting}
          </p>
        {/if}
        {#if view.state === "live" && view.health.length > 0}
          <ul
            aria-label="Each port's answer"
            class="flex min-w-0 flex-wrap gap-(--space-2)"
            data-relay-ports
          >
            {#each view.health as port (port.port)}
              <li>
                <Badge
                  data-relay-port={port.port}
                  variant={port.up ? "done" : "fail"}
                  ><span>{chip(port)}</span></Badge
                >
              </li>
            {/each}
          </ul>
          {#each view.health.filter((port) => port.error) as port (port.port)}
            <p
              class="mt-(--space-2) max-w-[72ch] text-meta text-(--ink-muted) [overflow-wrap:anywhere]"
              data-relay-port-error={port.port}
            >
              <span class="text-(--ink-strong)">{port.port}:</span>
              {port.error}
            </p>
          {/each}
        {/if}
        {#if view.why}
          <p
            class="mt-(--space-2) max-w-[72ch] text-meta text-(--status-fail-ink) [overflow-wrap:anywhere]"
            data-relay-why
          >
            {#if view.whyCommand && view.why.includes(view.whyCommand)}
              {@const at = view.why.indexOf(view.whyCommand)}
              {view.why.slice(0, at)}<code class="font-mono text-(--ink-strong)"
                >{view.whyCommand}</code
              >{view.why.slice(at + view.whyCommand.length)}
            {:else}
              {view.why}
            {/if}
          </p>
        {/if}
        <AskHere asker={asks} at="relay-start" />
        <AskHere asker={asks} at="relay-stop" />
        <AskHere asker={asks} at="relay-remove" />
      </div>
    {:else if candidates.length === 0}
      <p
        class="max-w-[72ch] text-meta text-(--ink-muted) text-pretty"
        data-relay-none
      >
        {words.none}
      </p>
    {:else}
      <ul
        aria-label="Machines with a public address"
        class="flex min-w-0 flex-col"
      >
        {#each candidates as machine (machine.machineId)}
          {@const chosen = picked === machine.machineId}
          {@const at = `start:${machine.machineId}`}
          <li
            class="flex min-w-0 flex-col [&+&]:border-t [&+&]:border-(--border-hairline)"
            data-relay-candidate={machine.machineId}
          >
            <div class={ROW}>
              <div class="flex min-w-0 flex-col gap-(--space-1)">
                <span
                  class="min-w-0 text-label text-(--ink-strong) [overflow-wrap:anywhere]"
                  data-relay-name>{machine.name}</span
                >
                <p
                  class="min-w-0 text-meta text-(--ink-muted) [overflow-wrap:anywhere]"
                  data-relay-address
                >
                  <code class="font-mono text-(--ink-strong)"
                    >{machine.address}</code
                  >{#if machine.seen}{` · ${words.seenAs(machine.seen)}`}{/if}{#if !machine.online}{" · offline"}{/if}
                </p>
              </div>
              <!-- One machine is the one picked: nothing to choose. -->
              {#if candidates.length > 1}
                <div class={CONTROLS}>
                  <Button
                    aria-pressed={chosen}
                    data-relay-pick
                    icon={chosen ? IconCheck : undefined}
                    label={chosen ? words.picked : words.runHere}
                    onclick={() => {
                      picked = machine.machineId;
                    }}
                    size="sm"
                    variant={chosen ? "secondary" : "outline"}
                  />
                </div>
              {/if}
            </div>
            {#if chosen}
              <div class="flex min-w-0 flex-col gap-(--space-3) pb-[10px]">
                <Field
                  hint={words.hostnameHint}
                  id="relay-hostname"
                  label={words.hostnameLabel}
                >
                  <Input
                    autocapitalize="off"
                    autocomplete="off"
                    class="w-full max-w-sm"
                    data-relay-hostname
                    id="relay-hostname"
                    inputmode="url"
                    placeholder="relay.example.com"
                    spellcheck={false}
                    bind:value={hostname}
                  />
                </Field>
                <div>
                  <Button
                    aria-expanded={asking(at)}
                    data-relay-start
                    disabled={!machine.online || asking(at)}
                    label={words.start}
                    onclick={() => askStart(machine)}
                    size="sm"
                    title={machine.online
                      ? undefined
                      : `${machine.name} is offline`}
                  />
                </div>
                <AskHere asker={asks} {at} />
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</SectionFrame>
