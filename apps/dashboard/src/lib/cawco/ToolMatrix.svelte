<script lang="ts">
  import { machineLabel } from "@cawco/core/machine-names";
  import type { ToolPolicy, ToolSpec, ToolStatus } from "@cawco/core/tools";
  import { unhandled } from "@cawco/core/unhandled";
  import { toolWords } from "@cawco/core/words/tools";
  import Check from "#lib/cawco/accounts/Check.svelte";
  import SigninPanel from "#lib/cawco/accounts/SigninPanel.svelte";
  import { failureWords as message } from "#lib/cawco/hub-read.js";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button, buttonVariants } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import {
    IconCheck,
    IconExternal,
    IconTerminal,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { didntAnswer, type Machine } from "./client.svelte";
  import NoMachines from "./config/NoMachines.svelte";
  import { EMPTY_LINES } from "./empty-asks";
  import MachineLedger from "./MachineLedger.svelte";
  import NsPopover from "./spawn/NsPopover.svelte";
  import NsPopoverGroup from "./spawn/NsPopoverGroup.svelte";
  import {
    dropToolSignin,
    heldToolSignin,
    openToolSignin,
    reopenToolSignin,
    showToolSignin,
    signinOf,
    toolSigninFlow,
    toolSigninKey,
  } from "./tool-signin.svelte";
  import { installTool, policyFor, setPolicy } from "./tools";
  import { TRY_AGAIN } from "./unanswered";

  let {
    machines,
    catalog,
    policies,
  }: {
    machines: Machine[];
    catalog: ToolSpec[];
    policies: ToolPolicy[];
  } = $props();

  /**
   * A version with a mark beside it (Not updated, Updating…): on a phone's
   * card the mark goes under the version, so the state stays narrow and
   * the machine's name beside it reads whole.
   */
  const STACKED =
    "flex items-center gap-space-2 @max-phone/table:flex-col @max-phone/table:items-end @max-phone/table:gap-space-1";

  let written = $state<Record<string, ToolPolicy>>({});
  const policyOf = (spec: ToolSpec): ToolPolicy =>
    written[spec.id] ?? policyFor(policies, spec.id);
  let saving = $state<Record<string, boolean>>({});
  let asked = $state<Record<string, boolean>>({});
  /** Why a cell's last install request was refused: said in the cell. */
  let refused = $state<Record<string, string>>({});
  /** Why a column's Required switch did not save: said under it. */
  let policyRefused = $state<Record<string, string>>({});
  const cellKey = (machineId: string, toolId: string): string =>
    `${machineId}:${toolId}`;
  /** Machines with a copy there: one being updated (a version beside its progress) still has it. */
  const installedOn = (spec: ToolSpec): number =>
    machines.filter((machine) => {
      const tool = machine.tools?.[spec.id];
      return (
        tool?.state === "installed" ||
        (tool?.state === "installing" && tool.version !== undefined)
      );
    }).length;

  /** A copy of the tool is there: installed, or being updated or refused with its version kept. */
  const hasCopy = (tool: ToolStatus | undefined): boolean =>
    tool?.state === "installed" ||
    ((tool?.state === "installing" || tool?.state === "failed") &&
      tool.version !== undefined);
  /** Machines whose copy of a tool with its own sign-in reads signed in. */
  const signedInOn = (spec: ToolSpec): number =>
    machines.filter((machine) => {
      const tool = machine.tools?.[spec.id];
      return hasCopy(tool) && tool?.signin?.state === "signed-in";
    }).length;

  /**
   * A sign-in's popover (core `ToolSpec.signin`), one per cell, all one
   * surface gliding between them (NsPopoverGroup). Opening draws the cell's
   * sign-in, the same one if it is under way; ×, Esc or a press outside put
   * it away and leave the sign-in going, parked on its cell. One with
   * nothing under way and nothing to tell is let go.
   */
  function setOpen(machineId: string, toolId: string, open: boolean) {
    const key = toolSigninKey(machineId, toolId);
    if (open) {
      toolSigninFlow(machineId, toolId);
      showToolSignin(key);
      return;
    }
    if (openToolSignin() === key) {
      showToolSignin(null);
    }
    const flow = heldToolSignin(key);
    if (
      flow &&
      !flow.live &&
      (flow.problem === null || flow.phase === "signed-in")
    ) {
      dropToolSignin(key);
    }
  }

  reopenToolSignin();

  // Signed in: the tick draws and holds, then the popover goes; the cell
  // reads the machine's new status, which the hub published with its answer.
  $effect(() => {
    const key = openToolSignin();
    if (key === null || heldToolSignin(key)?.phase !== "signed-in") {
      return;
    }
    const { machineId, toolId } = signinOf(key);
    const timer = setTimeout(() => {
      setOpen(machineId, toolId, false);
    }, dur("--dur-hold"));
    return () => clearTimeout(timer);
  });

  /** A refusal's sentence, without the tool's screen it quotes, for the cell's line; the popover shows it whole. */
  const sentence = (problem: string): string =>
    problem.split(` ${toolWords.signinScreen} `)[0] ?? problem;

  async function install(machine: Machine, spec: ToolSpec) {
    const key = cellKey(machine.machineId, spec.id);
    asked[key] = true;
    delete refused[key];
    try {
      const read = await installTool(machine.machineId, spec.id);
      switch (read.kind) {
        case "answered":
          break;
        case "unanswered":
          // The cell follows the hub's publish; this says the machine went quiet.
          refused[key] = didntAnswer(machine.machineId, read, {
            outcome: "whether the install finished is not known",
            again: TRY_AGAIN,
          });
          break;
        default:
          unhandled("read", read);
      }
    } catch (err) {
      refused[key] = message(err);
    } finally {
      delete asked[key];
    }
  }

  async function requireEverywhere(spec: ToolSpec, required: boolean) {
    saving[spec.id] = true;
    delete policyRefused[spec.id];
    try {
      written[spec.id] = await setPolicy(spec.id, { required });
    } catch (err) {
      policyRefused[spec.id] = message(err);
    } finally {
      delete saving[spec.id];
    }
  }
</script>

{#snippet cell(machine: Machine, spec: ToolSpec, online: boolean)}
  {@const toolStatus = machine.tools?.[spec.id]}
  {@const pending = asked[cellKey(machine.machineId, spec.id)] === true}
  {@const shown = toolStatus?.state ?? "unknown"}
  {@const failed = cellKey(machine.machineId, spec.id) in refused}
  <!-- A copy there at a version CawCo doesn't run (older than its floor, or
       not its one version) is the probe's, and carries that version; an
       attempt that failed carries none (agent tools.ts), but on a tool CawCo
       keeps current, whose failures keep the copy's version. -->
  {@const outdated = toolStatus?.state === "failed" && !!toolStatus.version}
  <!-- CawCo keeps it at its newest release by itself (core ToolSpec.release:
       Claude Code): no press updates it, and a failed update takes Retry. -->
  {@const kept = spec.release !== undefined}
  {@const where = machineLabel(machine.hostname)}
  <!-- The act that installs the tool on the machine: an outlined button, or
       a quiet ghost one beside a state that already says enough. -->
  {#snippet installAct(label: string, pendingLabel: string, quiet: boolean)}
    <Button
      disabled={!online}
      {failed}
      {label}
      onclick={() => install(machine, spec)}
      {pending}
      {pendingLabel}
      size="xs"
      tone={quiet ? "muted" : undefined}
      variant={quiet ? "ghost" : "outline"}
    />
  {/snippet}

  {#if shown === "installed" && toolStatus?.detail}
    <!-- A copy an update left older than its newest release (core
         ToolStatus.detail on installed): it still runs, so its version stays
         in ink; beside it the Needs you mark (a mark, never a surface), a
         button that opens why, in the updater's words, and Retry, the one
         press it takes. -->
    {@const head = toolWords.notUpdatedHead(
      spec.name,
      toolStatus.version ?? "",
      where
    )}
    <span class={STACKED}>
      <code data-slot="num" class="num type-code text-ink-strong"
        >{toolStatus.version ?? "—"}</code
      >
      <Popover.Root>
        <Popover.Trigger aria-label={head} look="mark">
          <Badge size="cell" variant="attn">
            <span>{toolWords.notUpdated}</span>
          </Badge>
        </Popover.Trigger>
        <Popover.Content
          align="start"
          frame="panel-high"
          pad="none"
          width="widest"
        >
          <header
            class="flex items-baseline gap-space-1 border-b border-border-hairline px-space-3 py-space-2"
          >
            <span class="type-label text-ink-strong">{head}</span>
            {#if toolStatus.method}
              <code class="ml-auto shrink-0 type-code text-ink-muted"
                >{toolStatus.method}</code
              >
            {/if}
          </header>
          <pre
            class="max-h-56 overflow-auto px-space-3 py-space-2 type-code whitespace-pre-wrap wrap-anywhere">{toolStatus.detail}</pre>
          <footer class="border-t border-border-hairline px-space-3 py-space-2">
            {@render installAct("Retry", toolWords.updating, false)}
          </footer>
        </Popover.Content>
      </Popover.Root>
    </span>
  {:else if shown === "installed"}
    <!-- Installed is the quiet state: the check and the version in ink, no
         chip (DESIGN.md, The Idle Has No Fill Rule's quiet row). A tool
         CawCo keeps current has no Reinstall: its own update is the one
         path. -->
    <span class="flex items-center gap-space-2">
      <span
        class="mark-line inline-flex items-center gap-space-1 text-ink-strong"
      >
        <IconCheck class="size-icon-md shrink-0 text-status-done-glyph" />
        <code data-slot="num" class="num type-code"
          >{toolStatus?.version ?? "—"}</code
        >
      </span>
      {#if !kept}
        <span
          class="transition-opacity group-focus-within/cell:opacity-100 group-hover/cell:opacity-100 hover-hover:opacity-0"
        >
          {@render installAct("Reinstall", "Installing…", true)}
        </span>
      {/if}
    </span>
  {:else if shown === "installing"}
    <!-- An update keeps the copy's version in ink beside its progress. -->
    <span class={STACKED}>
      {#if toolStatus?.version}
        <code data-slot="num" class="num type-code text-ink-strong"
          >{toolStatus.version}</code
        >
      {/if}
      <Badge size="cell" tone="muted" variant="ghost">
        <Spinner class="shrink-0" />
        <span
          >{kept && toolStatus?.version
            ? toolWords.updating
            : "Installing…"}</span
        >
      </Badge>
    </span>
  {:else if shown === "missing"}
    {@render installAct("Install", "Installing…", false)}
  {:else if shown === "failed"}
    <span class="flex items-center gap-space-1">
      <Popover.Root>
        <!-- A real button, its badge its whole look (the trigger's `mark`). -->
        <Popover.Trigger
          aria-label="Why {spec.name} {outdated
            ? `${toolStatus?.version} can't run`
            : 'did not install'} on {where}"
          look="mark"
        >
          <Badge size="cell" variant="destructive">
            <IconWarningTriangle class="size-icon-sm shrink-0" />
            {#if outdated}
              <code data-slot="num" class="num type-code"
                >{toolStatus?.version}</code
              >
            {:else}
              <span>Failed</span>
            {/if}
          </Badge>
        </Popover.Trigger>
        <Popover.Content
          align="start"
          frame="panel-high"
          pad="none"
          width="widest"
        >
          <header
            class="flex items-baseline gap-space-1 border-b border-border-hairline px-space-3 py-space-2"
          >
            <span class="type-label text-ink-strong"
              >{spec.name}
              {outdated
                ? `${toolStatus?.version} isn't one CawCo runs`
                : "did not install"}</span
            >
            {#if toolStatus?.method}
              <code class="ml-auto shrink-0 type-code text-ink-muted"
                >{toolStatus.method}</code
              >
            {/if}
          </header>
          {#if toolStatus?.detail}
            <pre
              class="max-h-56 overflow-auto px-space-3 py-space-2 type-code whitespace-pre-wrap wrap-anywhere">{toolStatus.detail}</pre>
          {:else}
            <p class="px-space-3 py-space-2 type-body text-ink-muted">
              The machine did not say why.
            </p>
          {/if}
          <footer class="border-t border-border-hairline px-space-3 py-space-2">
            {@render installAct(
              outdated && !kept ? "Update" : "Retry",
              outdated ? toolWords.updating : "Installing…",
              false
            )}
          </footer>
        </Popover.Content>
      </Popover.Root>
      {@render installAct(
        outdated && !kept ? "Update" : "Retry",
        outdated ? toolWords.updating : "Installing…",
        true
      )}
    </span>
  {:else if shown === "unsupported"}
    <Popover.Root>
      <Popover.Trigger
        aria-label="Why {spec.name} cannot run on {where}"
        look="mark"
      >
        <Badge size="cell" tone="muted" variant="ghost">
          <span>Unsupported</span>
        </Badge>
      </Popover.Trigger>
      <Popover.Content align="start" frame="panel-high" width="wide">
        <p class="type-body text-ink-strong">
          {toolStatus?.detail ?? "No install method for this platform."}
        </p>
      </Popover.Content>
    </Popover.Root>
  {:else}
    <span class="flex items-center gap-space-1">
      <Tooltip.Root>
        <Tooltip.Trigger>
          {#snippet child({ props })}
            <Badge {...props} size="cell" tone="subtle" variant="ghost"
              ><span>Unknown</span></Badge
            >
          {/snippet}
        </Tooltip.Trigger>
        <Tooltip.Content>The daemon has not reported this tool</Tooltip.Content>
      </Tooltip.Root>
      <Button
        disabled={!online}
        {failed}
        label="Install"
        onclick={() => install(machine, spec)}
        {pending}
        pendingLabel="Installing…"
        size="xs"
        tone="muted"
        variant="ghost"
      />
    </span>
  {/if}
  <!-- An install the hub refused, in its words, in the cell it was asked in. -->
  <RowFault
    again={online ? () => install(machine, spec) : undefined}
    reason={refused[cellKey(machine.machineId, spec.id)]}
  />
{/snippet}

<!-- A tool's own sign-in on the machine (core ToolSpec.signin), beside the
     machine it is about. Nothing where there is no copy to sign in; signed
     in is the quiet tick and its word; any other state says so in muted
     words and carries its one act, Sign in, which opens the sign-in popover
     on the cell. Put away, a sign-in under way parks here (Waiting for the
     pasted code, and Paste code, which opens it again as it was), and a
     refusal stays under the cell, its sentence without the tool's screen
     (the popover holds that), until it is tried again. Offline, the state
     stands alone. -->
{#snippet signinCell(machine: Machine, spec: ToolSpec, online: boolean)}
  {@const toolStatus = machine.tools?.[spec.id]}
  {@const key = toolSigninKey(machine.machineId, spec.id)}
  {@const flow = heldToolSignin(key)}
  {@const open = openToolSignin() === key}
  {@const where = machineLabel(machine.hostname)}
  {@const read = toolStatus?.signin}
  {@const signedIn = read?.state === "signed-in"}
  {@const parked = flow?.live === true}
  {@const verb = parked ? toolWords.pasteCode : toolWords.signIn}
  {#if hasCopy(toolStatus) || flow}
    <!-- The state at the column's start, its act at its end. -->
    <span class="flex items-center justify-between gap-space-2">
      {#if signedIn}
        <span
          class="mark-line inline-flex items-center gap-space-1 type-label text-ink-strong"
          data-signin="signed-in"
        >
          {#if flow?.phase === "signed-in"}
            <Check />
          {:else}
            <IconCheck class="size-icon-md shrink-0 text-status-done-glyph" />
          {/if}
          <span>{toolWords.signedIn}</span>
        </span>
      {:else if read?.state === "unknown" && !parked}
        <Popover.Root>
          <Popover.Trigger
            aria-label={toolWords.signinUnknownHead(spec.name, where)}
            look="mark"
          >
            <Badge size="cell" tone="muted" variant="ghost">
              <span>{toolWords.signinUnknown}</span>
            </Badge>
          </Popover.Trigger>
          <Popover.Content
            align="start"
            frame="panel-high"
            pad="none"
            width="widest"
          >
            <header
              class="border-b border-border-hairline px-space-3 py-space-2"
            >
              <span class="type-label text-ink-strong"
                >{toolWords.signinTitle(spec.name, where)}</span
              >
            </header>
            {#if read.detail}
              <pre
                class="max-h-56 overflow-auto px-space-3 py-space-2 type-code whitespace-pre-wrap wrap-anywhere">{read.detail}</pre>
            {:else}
              <p class="px-space-3 py-space-2 type-body text-ink-muted">
                {toolWords.signinUnknownSilent}
              </p>
            {/if}
          </Popover.Content>
        </Popover.Root>
      {:else}
        <span
          class="type-meta whitespace-nowrap text-ink-muted"
          data-signin={parked ? "waiting" : "signed-out"}
          >{parked ? toolWords.signinWaiting : toolWords.signedOut}</span
        >
      {/if}
      {#if online && (!signedIn || open)}
        <NsPopover
          align="start"
          id="tool-signin-{key}"
          label={toolWords.signInOn(verb, spec.name, where)}
          onchange={(next) => setOpen(machine.machineId, spec.id, next)}
          {open}
          triggerClass={buttonVariants({ variant: "outline", size: "xs" })}
          width="var(--c-signin-pop-w)"
        >
          {#snippet trigger()}
            {verb}
          {/snippet}
          <div class="flex flex-col gap-space-3 p-space-2">
            <p data-slot="title" class="type-label text-ink-strong">
              {toolWords.signinTitle(spec.name, where)}
            </p>
            {#if flow}
              <SigninPanel
                {flow}
                got={toolWords.signedIn}
                machine={where}
                {online}
              />
            {/if}
          </div>
        </NsPopover>
      {/if}
    </span>
    {#if !open && flow?.problem && flow.phase !== "signed-in"}
      <!-- The sign-in's refusal, said on its cell while the popover is put
           away, until it is opened and tried again. -->
      <!-- Its way on is the cell's own Sign in, beside the state above. -->
      <RowFault reason={sentence(flow.problem)} />
    {/if}
  {/if}
{/snippet}

{#if catalog.length === 0}
  <!-- The catalog ships in the hub's build (core TOOL_CATALOG), so no
       session can fill it (The Empty Starts Work Rule's second sentence):
       the line says so, and the way by hand is updating the hub. -->
  <EmptyState
    icon={IconTerminal}
    line={EMPTY_LINES.cliTools}
    title="Nothing to install"
  >
    {#snippet action()}
      <Button href="/config/updates" label="Open Updates" variant="outline" />
    {/snippet}
  </EmptyState>
{:else if machines.length === 0}
  <NoMachines
    line="Tools install on your own machines, and none has joined this hub. Add one and it reports what it already has."
  />
{:else}
  <!-- One ledger per tool (DESIGN.md, ledger-header and ledger-row): its head
       names the tool, how many machines have it and whether every machine
       must; under it a 32px band and a 44px row per machine. Nothing
       scrolls sideways: under 640px each row is a card, the machine across
       its start and the tool's state at its end. An offline machine says so
       in words; its row keeps full ink. -->
  <NsPopoverGroup>
    <div class="flex flex-col gap-space-6">
      {#each catalog as spec (spec.id)}
        {@const policy = policyOf(spec)}
        <section
          aria-labelledby="tool-{spec.id}"
          class="flex min-w-0 flex-col gap-space-2"
          data-tool={spec.id}
        >
          <header
            class="flex flex-wrap items-center justify-between gap-x-space-4 gap-y-space-2"
          >
            <span class="mark-line flex min-w-0 items-center gap-space-2">
              <h2 id="tool-{spec.id}" class="type-label text-ink-strong">
                {spec.name}
              </h2>
              <a
                data-box
                aria-label="{spec.name} homepage"
                class="pointer-hit touch-hit pressable text-ink-muted transition-colors hover:text-ink-strong"
                href={spec.homepage}
                rel="noreferrer"
                target="_blank"
                title={spec.homepage}
              >
                <IconExternal class="size-icon-sm" />
              </a>
              <span data-slot="num" class="num type-meta text-ink-muted"
                >{installedOn(spec)}/{machines.length} installed{#if spec.signin && signedInOn(spec) > 0}{` · ${toolWords.signedInCount(signedInOn(spec))}`}{/if}</span
              >
            </span>
            <label
              class="mark-line flex items-center gap-space-2 type-label text-ink-muted"
            >
              <Switch
                data-box
                checked={policy.required}
                disabled={saving[spec.id] === true}
                onCheckedChange={(next) => requireEverywhere(spec, next)}
                size="sm"
              />
              <span>Required on every machine</span>
            </label>
          </header>
          <RowFault
            again={() => requireEverywhere(spec, !policy.required)}
            reason={policyRefused[spec.id]}
          />
          <MachineLedger
            {machines}
            online={(machine) => machine.status === "online"}
            rowClass="group/cell"
          >
            {#snippet heads()}
              {#if spec.signin}
                <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
                <Table.Head class="w-c-signin-col-w" scope="col" variant="band"
                  >{toolWords.signinHead}</Table.Head
                >
              {/if}
              <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
              <Table.Head class="w-c-matrix-col-w" scope="col" variant="band"
                >State</Table.Head
              >
            {/snippet}
            {#snippet cells(machine: Machine, online: boolean)}
              {#if spec.signin}
                <!-- On a phone's card, its own line under the machine and its
                     State, from the machine's name to the card's end. -->
                <Table.Cell
                  class="@max-phone/table:col-span-full @max-phone/table:row-start-2"
                  variant="ledger-stacks"
                >
                  <div
                    class="flex flex-col gap-space-1 whitespace-normal @max-phone/table:ps-c-ledger-text-inset"
                  >
                    {@render signinCell(machine, spec, online)}
                  </div>
                </Table.Cell>
              {/if}
              <Table.Cell variant="ledger-stacks">
                <div class="flex flex-col gap-space-1 whitespace-normal">
                  {@render cell(machine, spec, online)}
                </div>
              </Table.Cell>
            {/snippet}
          </MachineLedger>
        </section>
      {/each}
    </div>
  </NsPopoverGroup>
{/if}
