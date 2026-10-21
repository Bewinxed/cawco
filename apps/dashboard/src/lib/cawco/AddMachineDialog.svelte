<script lang="ts">
  /**
   * Connect a machine: the one dialog every "add a machine" entry opens,
   * mounted once in the shell. It holds the tray (join/JoinTray) and feeds it
   * the live stores: the SSH add as the hub holds it (`sshJoin`), what the
   * Command way saw check in (`CheckIn`, `hubAuth.waiting`), and the joined
   * machine's readiness.
   *
   * Two ways in, one install. SSH has the hub run its install script on the
   * machine over `ssh` and follows it step by step; Command hands over the
   * same script as a one-liner to run there by hand and waits for the machine
   * to check in. Both end on the same status card: the machine by name,
   * Open machine and Start session.
   */
  import { machineLabel } from "@cawco/core";
  import { MediaQuery } from "svelte/reactivity";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Dialog from "#lib/components/ui/dialog/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import { barGlass } from "./bar-glass.svelte";
  import { cawco } from "./client.svelte";
  import { answerMachine, hubAuth } from "./hub-auth.svelte";
  import { failureWords } from "./hub-read";
  import JoinTray, { JOIN_DESCRIPTION } from "./join/JoinTray.svelte";
  import { addMachine, CheckIn, joinInfo, sshJoin } from "./join/join.svelte";
  import {
    cardOf,
    factsOf,
    hostOf,
    type Joined,
    stepsOf,
  } from "./join/join-view";
  import { macReadiness, readinessLine } from "./join/readiness.svelte";
  import type { JoinWay } from "./join/ways";
  import { machineOs } from "./machine";
  import { newSession } from "./spawn/new-session.svelte";

  /** Under 640px the dialog is a bottom sheet (DESIGN.md, Breakpoints). */
  const phone = new MediaQuery("(max-width: 640px)");
  const way = $derived(addMachine.way);
  let target = $state("");
  let port = $state("");
  /** Sent with the one add it is typed for, then cleared: nothing here keeps it. */
  let password = $state("");
  /** Whether the add in flight was sent a password, for a refused sign-in's words. */
  let sentPassword = $state(false);
  let hubUrl = $state("");
  let checkIn = $state<CheckIn | null>(null);
  let starting = $state(false);
  let stopping = $state(false);
  /** Change details: the form again, the failure or stop said over its fields. */
  let changing = $state(false);
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
   * dialog fades out on the card it showed.
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
      changing = false;
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

  /** When the step on screen began: each new step line restarts it. */
  let stepSince = $state<number | null>(null);
  let stepKey = "";
  $effect.pre(() => {
    const key = job ? `${job.id}:${stepsOf(job.lines).length}` : "";
    if (key !== stepKey) {
      stepKey = key;
      stepSince = job ? Date.now() : null;
    }
  });

  /** The machine as the fleet lists it, once it is there. */
  const rowOf = (machineId: string | null) =>
    cawco.machines.find((entry) => entry.machineId === machineId);

  /**
   * The machine this way in added, once the fleet has it: the SSH run that
   * finished, or the machine that checked in while the command showed.
   */
  /** Which machine joined: the SSH add's once it is done, or the one that checked in. */
  const joinedId = $derived.by((): string | null => {
    if (way !== "ssh") {
      return checkIn?.joined?.machineId ?? null;
    }
    return job?.state === "done" ? job.machineId : null;
  });

  const joined = $derived.by((): Joined | null => {
    const machineId = joinedId;
    if (!machineId) {
      return null;
    }
    const machine =
      rowOf(machineId) ?? (way === "ssh" ? null : checkIn?.joined) ?? null;
    const name = machine ? machineLabel(machine.hostname) : machineId;
    const said = readinessLine(macReadiness.of(machineId), true);
    return {
      sentence: `${name} ${said.rest}`,
      line:
        said.instruction ??
        factsOf(
          machine ? machineOs(machine.os).label : null,
          way === "ssh" && job ? hostOf(job.target) : null,
          machine?.build?.version ?? null
        ),
      machineId,
      glyph: said.glyph,
      hue: said.hue,
      kind: macReadiness.of(machineId).kind,
    };
  });

  const card = $derived(
    changing
      ? null
      : cardOf({
          job: way === "ssh" ? job : null,
          refused: sshJoin.refused,
          stepSince,
          joined,
          passwordTried: sentPassword,
        })
  );

  /** The form's alert: what Change details brought back, or a start the hub refused. */
  const formAlert = $derived.by(() => {
    if (card !== null) {
      return null;
    }
    if (sshJoin.refused && job?.state !== "failed") {
      return { text: sshJoin.refused, tone: "fail" as const };
    }
    const was = changing
      ? cardOf({ job, refused: sshJoin.refused, stepSince, joined: null })
      : null;
    if (!was) {
      return null;
    }
    return {
      text: [was.sentence, was.line].filter(Boolean).join(" "),
      tone: was.tone === "stopped" ? ("status" as const) : ("fail" as const),
    };
  });

  async function start() {
    const portNumber = port.trim() === "" ? undefined : Number(port);
    starting = true;
    const typed = password;
    password = "";
    sentPassword = typed !== "";
    try {
      await sshJoin.start({
        target: target.trim() || (job?.target ?? ""),
        ...(portNumber === undefined ? {} : { port: portNumber }),
        ...(typed === "" ? {} : { password: typed }),
      });
      changing = false;
    } finally {
      starting = false;
    }
  }

  /** The form's target and port from the add it came back from, unless typed already. */
  function carryTarget() {
    if (!job || target.trim() !== "") {
      return;
    }
    ({ target } = job);
    port = job.port && job.port !== 22 ? String(job.port) : "";
  }

  /** Retry from the card: the same target and port, and a password typed into it. */
  function retry() {
    carryTarget();
    // biome-ignore lint/complexity/noVoid: the card follows sshJoin.job
    void start();
  }

  function change() {
    carryTarget();
    changing = true;
  }

  async function stop() {
    stopping = true;
    try {
      await sshJoin.stop();
    } finally {
      stopping = false;
    }
  }

  const close = () => {
    if (joined) {
      closedJoined = true;
    }
    addMachine.open = false;
  };

  function openMachine() {
    const machineId = joined?.machineId;
    close();
    if (machineId) {
      barGlass.showMachine(machineId);
    }
  }

  function startSession() {
    const machineId = joined?.machineId;
    close();
    newSession(machineId ? { machineId } : undefined);
  }
</script>

{#snippet tray()}
  <JoinTray
    {addresses}
    {admitRefused}
    {admitting}
    arrival={job?.id ?? null}
    {card}
    {formAlert}
    hubHostname={joinInfo.value?.hubHostname ?? null}
    joinError={joinInfo.error}
    onadmit={admit}
    onchange={change}
    onclose={close}
    onopenmachine={openMachine}
    onretry={retry}
    onstart={start}
    onstartsession={startSession}
    onstop={stop}
    onway={(value: JoinWay) => {
      addMachine.way = value;
    }}
    phone={phone.current}
    retry={job?.state === "failed" || job?.state === "stopped"}
    sshKey={joinInfo.value?.sshPublicKey ?? null}
    {starting}
    {stopping}
    waiting={way === "command" ? hubAuth.waiting : []}
    {way}
    bind:target
    bind:port
    bind:password
    bind:hubUrl
  />
{/snippet}

{#if phone.current}
  <!-- On a phone the dialog is the kit's bottom sheet; its head's Close is
       the sheet's way out, as on every kit sheet. -->
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
    <Drawer.Content title="Connect a machine">
      <div
        class="kit-sheet-scroll flex min-h-0 flex-col gap-space-6 overflow-y-auto overscroll-contain"
      >
        {#if card === null}
          <Drawer.Description text="body">{JOIN_DESCRIPTION}</Drawer.Description
          >
        {/if}
        {@render tray()}
      </div>
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
    <Dialog.Content width="form">
      <Dialog.Header>
        <Dialog.Title>Connect a machine</Dialog.Title>
        {#if card === null}
          <Dialog.Description>{JOIN_DESCRIPTION}</Dialog.Description>
        {/if}
      </Dialog.Header>
      {@render tray()}
    </Dialog.Content>
  </Dialog.Root>
{/if}
