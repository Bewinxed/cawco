<script lang="ts">
  /**
   * Connect a machine: the one dialog every "add a machine" entry opens,
   * mounted once in the shell.
   *
   * Two ways in, one install. SSH has the hub run its install script on the
   * machine over `ssh` and follows it step by step; Command hands over the
   * same script as a one-liner to run there by hand and waits for the machine
   * to check in. Either way the script installs Bun if needed, clones CawCo
   * and ends in `cawco binary-install agent`, and the fleet is what says it worked.
   * Both end on the same view: the title, the joined row and Close.
   */
  import type { SshJoinJob } from "@cawco/core";
  import { INSTALL_STEP_PREFIX, machineLabel } from "@cawco/core";
  import { MediaQuery } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Alert from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Label } from "#lib/components/ui/label/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { followTail } from "#lib/hooks/follow-tail.js";
  import { IconChevronRight, IconError, IconSuccess } from "#lib/icons.js";
  import { cawco } from "./client.svelte";
  import { answerMachine, hubAuth } from "./hub-auth.svelte";
  import { failureWords } from "./hub-read";
  import CheckInStatus from "./join/CheckInStatus.svelte";
  import CopyBox from "./join/CopyBox.svelte";
  import JoinedRow from "./join/JoinedRow.svelte";
  import {
    addMachine,
    CheckIn,
    installCommand,
    JOIN_WAYS,
    type JoinWay,
    joinInfo,
    sshJoin,
  } from "./join/join.svelte";
  import { macReadiness } from "./join/readiness.svelte";

  /** Under 640px the dialog is a bottom sheet (DESIGN.md, Breakpoints). */
  const phone = new MediaQuery("(max-width: 640px)");
  /** The way in shown, which every entry can name as it opens the dialog. */
  const tab = $derived(addMachine.way);
  let target = $state("");
  let port = $state("");
  let hubUrl = $state("");
  let keyOpen = $state(false);
  let checkIn = $state<CheckIn | null>(null);
  let starting = $state(false);
  /** A waiting machine's Admit on its way, and the hub's refusal of the last. */
  let admitting = $state<string | null>(null);
  let admitRefused = $state<string | null>(null);
  async function admit(machineId: string) {
    admitting = machineId;
    admitRefused = null;
    try {
      await answerMachine(machineId, true);
    } catch (error) {
      admitRefused = failureWords(error);
    } finally {
      admitting = null;
    }
  }

  /**
   * Everything that belongs to one opening is set as it opens: the hub's
   * addresses are read again, the watcher starts from the fleet as it is now,
   * and the address picks up Tailscale unless one is already chosen. Driven
   * by `open` itself because the entries open it by setting it.
   */
  let opened = false;
  /**
   * Set when the dialog closes on a joined machine, so the next opening starts
   * on the form. Cleared at that opening rather than at close, so the closing
   * dialog fades out on the row it showed.
   */
  let closedJoined = false;
  $effect.pre(() => {
    if (!addMachine.open) {
      opened = false;
      return;
    }
    if (opened) {
      return;
    }
    opened = true;
    if (closedJoined) {
      closedJoined = false;
      sshJoin.reset();
    }
    checkIn = new CheckIn();
    // biome-ignore lint/complexity/noVoid: fire-and-forget; the address list renders from joinInfo when it lands
    void joinInfo.refresh();
  });

  const addresses = $derived(joinInfo.value?.addresses ?? []);
  $effect.pre(() => {
    if (!addresses.some((address) => address.url === hubUrl)) {
      hubUrl = addresses[0]?.url ?? "";
    }
  });

  const job = $derived(sshJoin.job);

  /** Once a second while the dialog is open and the install is still going. */
  $effect(() => {
    if (!(addMachine.open && job?.state === "running")) {
      return;
    }
    const timer = setInterval(() => {
      // biome-ignore lint/complexity/noVoid: each read updates sshJoin.job, which this dialog renders
      void sshJoin.poll();
    }, 1000);
    return () => clearInterval(timer);
  });

  /** The install script's and `cawco binary-install agent`'s steps, in the order they ran. */
  const stepsOf = (run: SshJoinJob): string[] =>
    run.lines
      .filter((line) => line.startsWith(INSTALL_STEP_PREFIX))
      .map((line) => line.slice(INSTALL_STEP_PREFIX.length));

  const portNumber = $derived(port.trim() === "" ? undefined : Number(port));
  const portValid = $derived(
    portNumber === undefined ||
      (Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65_535)
  );
  const canStart = $derived(
    target.trim() !== "" && hubUrl !== "" && portValid && !starting
  );

  async function start(event: SubmitEvent) {
    event.preventDefault();
    if (!canStart) {
      return;
    }
    starting = true;
    try {
      await sshJoin.start({
        target: target.trim(),
        hubUrl,
        ...(portNumber === undefined ? {} : { port: portNumber }),
      });
    } finally {
      starting = false;
    }
  }

  const joinedName = (machineId: string | null): string => {
    const row = cawco.machines.find((entry) => entry.machineId === machineId);
    return row ? machineLabel(row.hostname) : (machineId ?? "The machine");
  };

  /**
   * The machine this way in added, once the fleet has it: the SSH run that
   * finished, or the machine that checked in while the command showed.
   */
  const joined = $derived.by(() => {
    if (tab === "ssh") {
      return job?.state === "done"
        ? { machineId: job.machineId, name: joinedName(job.machineId) }
        : null;
    }
    const machine = checkIn?.joined;
    return machine
      ? { machineId: machine.machineId, name: machineLabel(machine.hostname) }
      : null;
  });

  /** The SSH form shows while nothing runs, and again after a failure so it can be fixed. */
  const view = $derived(job?.state === "running" ? "running" : "form");

  const close = () => {
    if (joined) {
      closedJoined = true;
    }
    addMachine.open = false;
  };

  /** `ssh`'s "host" in the run's target, for the host-key fix. */
  const hostOf = (value: string): string => value.split("@").at(-1) ?? value;

  /**
   * A failed run, said with the error formula: what happened, why, how to fix
   * it, what next. The key and the output ride along where they are the fix.
   */
  const failure = $derived.by(() => {
    if (job?.state !== "failed") {
      return null;
    }
    const where = job.target;
    const { problem } = job;
    if (!problem) {
      return { text: sshJoin.refused ?? "", tail: [] as string[] };
    }
    switch (problem.kind) {
      case "key":
        return {
          text: `${where} refused this hub's SSH key. Add the key below to ~/.ssh/authorized_keys on that machine, then Retry.`,
          tail: [],
        };
      case "host-key":
        return {
          text: `${where} answered with a different SSH host key than this hub saw before, so the hub stopped. If the machine was reinstalled, remove the old key on the hub with ssh-keygen -R ${hostOf(where)}, then Retry.`,
          tail: [],
        };
      case "unreachable":
        return {
          text: `${where} did not answer on port ${job.port ?? 22} (${problem.detail}). Check the address and that SSH is running there, then Retry.`,
          tail: [],
        };
      case "download":
        return {
          text: `SSH got into ${where}, but it could not download the install script from ${job.hubUrl}. Pick a hub address that machine can reach, then Retry.`,
          tail: job.lines.slice(-20),
        };
      case "step":
        return {
          text: `The step "${problem.step}" failed on ${where}. Its last output is below. Fix what it names, then Retry.`,
          tail: job.lines.slice(-20),
        };
      case "unregistered":
        return {
          text: `CawCo installed on ${where}, but the machine never came online on this hub. Its last output is below. Check that it can reach ${job.hubUrl}, then Retry.`,
          tail: job.lines.slice(-20),
        };
      default:
        return null;
    }
  });

  $effect.pre(() => {
    if (job?.problem?.kind === "key") {
      keyOpen = true;
    }
  });
</script>

<!-- The address the machine is told to reach this hub on, the same choice on
     both tabs: the script is downloaded from it and `join` saves it. -->
{#snippet addressField(id: string)}
  <!-- literal: 6px -->
  <div
    data-slot="add-machine-dialog-field"
    class="flex min-w-0 flex-col gap-(--field-gap) text-ink-strong"
    style:--field-gap="6px"
  >
    <Label for={id}>Hub address this machine should use</Label>
    <NativeSelect.Root
      class="w-full"
      disabled={addresses.length === 0}
      {id}
      bind:value={hubUrl}
    >
      {#each addresses as address (address.url)}
        <NativeSelect.Option value={address.url}
          >{address.label}
          · {address.url}</NativeSelect.Option
        >
      {/each}
    </NativeSelect.Root>
    <span class="type-meta text-ink-subtle">
      The machine downloads the install script from here, so it has to be able
      to reach it.
    </span>
  </div>
{/snippet}

<!-- What the dialog and the phone's sheet both hold. -->
{#snippet body()}
  {#if joined}
    <JoinedRow
      name={joined.name}
      readiness={macReadiness.of(joined.machineId)}
    />
  {:else}
    <Tabs
      onValueChange={(value) => {
        addMachine.way = value as JoinWay;
      }}
      value={tab}
    >
      <TabsList aria-label="How to connect the machine">
        {#each JOIN_WAYS as way (way.way)}
          <TabItem icon={way.icon} label={way.name} value={way.way} />
        {/each}
      </TabsList>
    </Tabs>

    {#if joinInfo.error}
      <Alert.Root variant="destructive">
        <Alert.Description>{joinInfo.error}</Alert.Description>
      </Alert.Root>
    {/if}

    {#if hubAuth.waiting.length > 0}
      <!-- This hub requires paired devices: the machine that just connected
           waits here for its Admit (hub hub-auth.ts). -->
      <ul
        aria-label="Machines waiting to be admitted"
        class="m-0 flex list-none flex-col gap-space-2 rounded-md bg-surface-recess p-space-3"
      >
        {#each hubAuth.waiting as machine (machine.machineId)}
          <li class="flex items-center gap-space-3">
            <span data-slot="who" class="flex min-w-0 flex-auto flex-col">
              <span
                data-slot="name"
                class="type-body text-ink-strong wrap-anywhere"
                >{machine.hostname ?? machine.machineId} waits to be admitted</span
              >
              {#if machine.address}
                <span class="type-meta text-ink-subtle">{machine.address}</span>
              {/if}
            </span>
            <Button
              aria-label="Admit {machine.hostname ?? machine.machineId}"
              disabled={admitting !== null}
              label="Admit"
              onclick={() => admit(machine.machineId)}
              pending={admitting === machine.machineId}
              size="sm"
              variant="secondary"
            />
          </li>
        {/each}
      </ul>
      {#if admitRefused}
        <Alert.Root role="alert" variant="destructive">
          <IconError aria-hidden="true" />
          <Alert.Description>{admitRefused}</Alert.Description>
        </Alert.Root>
      {/if}
    {/if}

    {#if tab === "ssh"}
      {#if view === "running" && job}
        {@const steps = stepsOf(job)}
        <div class="flex flex-col gap-space-3">
          <p class="text-body text-ink-muted">
            Adding {job.target}. It keeps installing if you close this.
          </p>
          <!-- literal: 8px -->
          <ol
            aria-live="polite"
            class="m-0 flex list-none flex-col gap-(--steps-gap) p-0"
            style:--steps-gap="8px"
          >
            {#each steps as step, index (index)}
              <!-- literal: 10px -->
              <li
                class="mark-line flex min-w-0 items-center gap-(--step-gap) type-body text-ink-muted data-current:text-ink-strong"
                data-current={index === steps.length - 1 || undefined}
                style:--step-gap="10px"
              >
                {#if index === steps.length - 1}
                  <Spinner class="size-icon-md" />
                {:else}
                  <IconSuccess
                    data-add-machine-dialog-done
                    aria-hidden="true"
                    class="size-icon-md flex-none text-status-done-ink"
                  />
                {/if}
                <span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                  >{step}</span
                >
              </li>
            {:else}
              <!-- literal: 10px -->
              <li
                class="mark-line flex min-w-0 items-center gap-(--step-gap) type-body text-ink-muted data-current:text-ink-strong"
                data-current
                style:--step-gap="10px"
              >
                <Spinner class="size-icon-md" /><span
                  class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
                  >Connecting over SSH</span
                >
              </li>
            {/each}
          </ol>
          <!-- literal: rotate(90deg) -->
          <details class="group" style:--chev-turn="rotate(90deg)">
            <!-- literal: 6px -->
            <summary
              class="mark-line inline-flex cursor-pointer list-none items-center gap-(--summary-gap) rounded-xs type-label text-ink-muted hover:text-ink-strong"
              style:--summary-gap="6px"
            >
              <IconChevronRight
                data-chev
                aria-hidden="true"
                class="size-icon-md flex-none transition-[transform] dur-control ease-out group-open:transform-(--chev-turn)"
              /><span>Output</span>
            </summary>
            <!-- literal: 10px, 12px, 14rem, 8px -->
            <pre
              class="mx-0 mb-0 mt-(--pre-top) max-h-(--pre-max) overflow-auto border border-border-control rounded-md bg-surface-hover px-(--pre-x) py-(--pre-y) text-size-meta leading-root wrap-anywhere whitespace-pre-wrap text-ink-strong"
              style:--pre-max="14rem"
              style:--pre-top="8px"
              style:--pre-x="12px"
              style:--pre-y="10px"
              {@attach followTail()}>{job.lines.join("\n")}</pre>
          </details>
        </div>
      {:else}
        <form class="flex flex-col gap-space-4" id="ssh-join" onsubmit={start}>
          <!-- literal: minmax(0, 1fr) 6rem -->
          <div
            data-slot="grid"
            class="grid grid-cols-(--grid-cols) gap-space-3"
            style:--grid-cols="minmax(0, 1fr) 6rem"
          >
            <!-- literal: 6px -->
            <div
              data-slot="add-machine-dialog-field"
              class="flex min-w-0 flex-col gap-(--field-gap) text-ink-strong"
              style:--field-gap="6px"
            >
              <Label for="join-target">SSH target</Label>
              <Input
                autocapitalize="off"
                autocomplete="off"
                id="join-target"
                placeholder="user@host or SSH alias"
                spellcheck="false"
                bind:value={target}
              />
            </div>
            <!-- literal: 6px -->
            <div
              data-slot="add-machine-dialog-field"
              class="flex min-w-0 flex-col gap-(--field-gap) text-ink-strong"
              style:--field-gap="6px"
            >
              <Label for="join-port">Port</Label>
              <Input
                aria-invalid={portValid ? undefined : "true"}
                id="join-port"
                inputmode="numeric"
                placeholder="22"
                bind:value={port}
              />
            </div>
          </div>
          {@render addressField("join-address-ssh")}

          {#if failure}
            <div class="flex flex-col gap-space-2" role="alert">
              <Alert.Root variant="destructive">
                <IconError aria-hidden="true" />
                <Alert.Description>{failure.text}</Alert.Description>
              </Alert.Root>
              {#if failure.tail.length > 0}
                <!-- literal: 10px, 12px, 12rem -->
                <pre
                  class="m-0 max-h-(--pre-max) overflow-auto border border-border-control rounded-md bg-surface-hover px-(--pre-x) py-(--pre-y) text-size-meta leading-root wrap-anywhere whitespace-pre-wrap text-ink-strong"
                  style:--pre-max="12rem"
                  style:--pre-x="12px"
                  style:--pre-y="10px">{failure.tail.join("\n")}</pre>
              {/if}
            </div>
          {:else if sshJoin.refused}
            <Alert.Root role="alert" variant="destructive">
              <IconError aria-hidden="true" />
              <Alert.Description>{sshJoin.refused}</Alert.Description>
            </Alert.Root>
          {/if}

          <!-- literal: rotate(90deg) -->
          <details
            class="group"
            style:--chev-turn="rotate(90deg)"
            bind:open={keyOpen}
          >
            <!-- literal: 6px -->
            <summary
              class="mark-line inline-flex cursor-pointer list-none items-center gap-(--summary-gap) rounded-xs type-label text-ink-muted hover:text-ink-strong"
              style:--summary-gap="6px"
            >
              <IconChevronRight
                data-chev
                aria-hidden="true"
                class="size-icon-md flex-none transition-[transform] dur-control ease-out group-open:transform-(--chev-turn)"
              />
              <span>This hub's SSH key</span>
            </summary>
            <div class="flex flex-col gap-space-2 pt-space-2">
              {#if joinInfo.value?.sshPublicKey}
                <p class="type-meta text-ink-subtle">
                  The machine has to accept this key: it goes in
                  ~/.ssh/authorized_keys for the user you sign in as.
                </p>
                <CopyBox
                  label="This hub's SSH public key"
                  text={joinInfo.value.sshPublicKey}
                />
              {:else if joinInfo.value}
                <p class="type-meta text-ink-subtle">
                  This hub has no SSH key yet. Create one on
                  {joinInfo.value.hubHostname}
                  with ssh-keygen -t ed25519, then reopen this.
                </p>
              {/if}
            </div>
          </details>
        </form>
      {/if}
    {:else}
      <div class="flex flex-col gap-space-3">
        {@render addressField("join-address-command")}
        <p class="text-body text-ink-muted">
          Run this on the machine you want to add. It installs Bun if needed,
          clones CawCo and starts the agent.
        </p>
        {#if hubUrl}
          <CopyBox label="Install command" text={installCommand(hubUrl)} />
        {/if}
        <CheckInStatus />
      </div>
    {/if}
  {/if}
{/snippet}

<!-- Close dismisses; it is never the task's act, so it is never coral. -->
{#snippet actions()}
  {#if tab === "ssh" && view === "form" && !joined}
    <Button onclick={close} variant="outline">Cancel</Button>
    <Button disabled={!canStart} form="ssh-join" type="submit">
      {#if starting}
        <Spinner class="size-icon-md" />
      {/if}
      <span>{job?.state === "failed" ? "Retry" : "Add machine"}</span>
    </Button>
  {:else}
    <Button onclick={close} variant="outline">Close</Button>
  {/if}
{/snippet}

{#snippet description()}
  Install the CawCo agent on a machine and it joins this fleet.
{/snippet}

{#if phone.current}
  <!-- On a phone the dialog is the kit's bottom sheet. -->
  <Drawer.Root
    noBodyStyles
    onOpenChange={(value) => {
      if (value) {
        addMachine.open = true;
      } else {
        close();
      }
    }}
    open={addMachine.open}
    shouldScaleBackground={false}
  >
    <!-- The head's Close is the sheet's way out, as on every kit sheet, so
         joined it is the only one: the done view is the head, then the row. -->
    <Drawer.Content aria-label="Connect a machine">
      <Drawer.Header>
        <Drawer.Title>Connect a machine</Drawer.Title>
      </Drawer.Header>
      <div
        class="kit-sheet-scroll flex min-h-0 flex-col gap-(--sheet-gap) overflow-y-auto overscroll-contain"
        style:--sheet-gap="calc(var(--spacing) * 6)"
      >
        {#if !joined}
          <Drawer.Description class="text-body text-ink-muted">
            {@render description()}
          </Drawer.Description>
        {/if}
        {@render body()}
      </div>
      {#if !joined}
        <Drawer.Footer class="flex-col-reverse px-0 pb-0">
          {@render actions()}
        </Drawer.Footer>
      {/if}
    </Drawer.Content>
  </Drawer.Root>
{:else}
  <Dialog.Root
    bind:open={
      () => addMachine.open,
      (value) => {
        if (value) {
          addMachine.open = true;
        } else {
          close();
        }
      }
    }
  >
    <!-- Joined, Close is the one act the dialog offers, so it is the one button. -->
    <Dialog.Content class="phone:max-w-128" showCloseButton={!joined}>
      <Dialog.Header>
        <Dialog.Title>Connect a machine</Dialog.Title>
        {#if !joined}
          <Dialog.Description>{@render description()}</Dialog.Description>
        {/if}
      </Dialog.Header>
      {@render body()}
      <Dialog.Footer>{@render actions()}</Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
{/if}

<style>
  /* residual: pseudo */
  summary::-webkit-details-marker {
    display: none;
  }
</style>
