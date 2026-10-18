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
      at: "relay",
      title: words.startTitle(view.machineName),
      body: words.startBody,
      confirmLabel: words.start,
      pendingLabel: "Starting…",
      run: () => change("POST", "/api/stream-relay/start"),
    });

  const askStop = (view: StreamRelayView) =>
    asks.ask({
      at: "relay",
      title: words.stopTitle(view.machineName),
      body: words.stopBody,
      confirmLabel: words.stop,
      pendingLabel: "Stopping…",
      destructive: true,
      run: () => change("POST", "/api/stream-relay/stop"),
    });

  const askRemove = (view: StreamRelayView) =>
    asks.ask({
      at: "relay",
      title: words.removeTitle(view.machineName),
      body: words.removeBody(view.machineName, view.hostname),
      confirmLabel: words.remove,
      pendingLabel: "Removing…",
      destructive: true,
      run: () => change("DELETE", "/api/stream-relay"),
    });

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

  const stateWord = (view: StreamRelayView): string =>
    view.state === "pulling" && view.progress
      ? `Pulling ${view.progress.done} of ${view.progress.total}`
      : STATE_WORD[view.state];

  const answering = (view: StreamRelayView): boolean =>
    view.state === "live" &&
    view.health.length > 0 &&
    view.health.every((port) => port.up);

  /** A port's chip words: its name and whether it answered. */
  const chip = (port: RelayPortHealth): string =>
    `${port.port} ${port.up ? "up" : "down"}`;
</script>

<SectionFrame
  problem={answer === null ? problem : null}
  purpose={section.purpose}
  ready={answer !== null}
  title={section.label}
>
  <section
    aria-labelledby="stream-relay-title"
    class="flex min-w-0 flex-col gap-(--space-4)"
    data-stream-relay
  >
    <div class="flex min-w-0 flex-col gap-(--space-1)">
      <h2
        class="text-label text-(--ink-strong) text-balance"
        id="stream-relay-title"
      >
        {words.title}
      </h2>
      <p class="max-w-[72ch] text-meta text-(--ink-muted) text-pretty">
        {words.lead}
      </p>
    </div>

    {#if relay}
      {@const view = relay}
      <div class="flex min-w-0 flex-col" data-relay-row>
        <div
          class="flex min-w-0 flex-wrap items-center gap-x-(--space-4) gap-y-(--space-2)"
        >
          <div class="flex min-w-0 flex-1 basis-64 flex-col gap-(--space-1)">
            <div class="flex min-w-0 flex-wrap items-center gap-(--space-2)">
              <span
                class="min-w-0 text-label text-(--ink-strong) [overflow-wrap:anywhere]"
                >{view.machineName}</span
              >
              <Badge data-relay-state variant={STATE_TINT[view.state]}
                ><span>{stateWord(view)}</span></Badge
              >
            </div>
            <p
              class="min-w-0 text-meta text-(--ink-muted) [overflow-wrap:anywhere]"
              data-relay-line
            >
              {"Relay · "}<code class="font-mono text-(--ink-strong)"
                >{view.address}</code
              >{#if view.hostname}{" · "}<code
                  class="font-mono text-(--ink-strong)">{view.hostname}</code
                >{/if}{#if answering(view)}{" · answering"}{/if}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-(--space-2)">
            {#if view.state === "stopped" || view.state === "failed"}
              <Button
                label={words.start}
                onclick={() => askStartAgain(view)}
                size="sm"
                variant="outline"
              />
            {:else}
              <Button
                label={words.stop}
                onclick={() => askStop(view)}
                size="sm"
                variant="ghost"
              />
            {/if}
            <Button
              label={words.remove}
              onclick={() => askRemove(view)}
              size="sm"
              variant="destructive"
            />
          </div>
        </div>
        {#if view.state === "live" && view.health.length > 0}
          <ul
            aria-label="Each port's answer"
            class="mt-(--space-2) flex min-w-0 flex-wrap gap-(--space-2)"
            data-relay-ports
          >
            {#each view.health as port (port.port)}
              <li class="flex min-w-0 max-w-full flex-col gap-(--space-1)">
                <Badge
                  data-relay-port={port.port}
                  title={port.error}
                  variant={port.up ? "done" : "fail"}
                  ><span>{chip(port)}</span></Badge
                >
                {#if port.error}
                  <span
                    class="max-w-[40ch] text-meta text-(--ink-muted) [overflow-wrap:anywhere]"
                    data-relay-port-error>{port.error}</span
                  >
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if view.why}
          <p
            class="mt-(--space-2) max-w-[72ch] text-meta text-(--status-fail-ink) [overflow-wrap:anywhere]"
            data-relay-why
          >
            {view.why}
          </p>
        {/if}
        <AskHere asker={asks} at="relay" />
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
        class="flex min-w-0 flex-col gap-(--space-3)"
      >
        {#each candidates as machine (machine.machineId)}
          {@const chosen = picked === machine.machineId}
          <li
            class="flex min-w-0 flex-col gap-(--space-3)"
            data-relay-candidate={machine.machineId}
          >
            <div
              class="flex min-w-0 flex-wrap items-center gap-x-(--space-4) gap-y-(--space-2)"
            >
              <div
                class="flex min-w-0 flex-1 basis-64 flex-col gap-(--space-1)"
              >
                <span
                  class="min-w-0 text-label text-(--ink-strong) [overflow-wrap:anywhere]"
                  >{machine.name}</span
                >
                <p
                  class="min-w-0 text-meta text-(--ink-muted) [overflow-wrap:anywhere]"
                >
                  <code class="font-mono text-(--ink-strong)"
                    >{machine.address}</code
                  >{#if machine.seen}{` · ${words.seenAs(machine.seen)}`}{/if}{#if !machine.online}{" · offline"}{/if}
                </p>
              </div>
              <Button
                aria-pressed={chosen}
                data-relay-pick
                label={words.runHere}
                onclick={() => {
                  picked = machine.machineId;
                }}
                size="sm"
                variant={chosen ? "secondary" : "outline"}
              />
            </div>
            {#if chosen}
              <div class="flex min-w-0 flex-col gap-(--space-3)">
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
                    data-relay-start
                    disabled={!machine.online}
                    label={words.start}
                    onclick={() => askStart(machine)}
                    size="sm"
                    title={machine.online
                      ? undefined
                      : `${machine.name} is offline`}
                  />
                </div>
                <AskHere asker={asks} at={`start:${machine.machineId}`} />
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</SectionFrame>
