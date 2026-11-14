<script lang="ts">
  import { machineLabel } from "@cawco/core/machine-names";
  import { toolUpdateOf } from "@cawco/core/tool-updates";
  import {
    type ToolPolicy,
    type ToolSpec,
    type ToolStatus,
    type ToolUpdates,
    toolRuns,
  } from "@cawco/core/tools";
  import { commonWords } from "@cawco/core/words/common";
  import { toolUpdateWords } from "@cawco/core/words/tool-updates";
  import { toolWords } from "@cawco/core/words/tools";
  import Check from "#lib/cawco/accounts/Check.svelte";
  import SigninPanel from "#lib/cawco/accounts/SigninPanel.svelte";
  import HarnessLogo, { hasMark } from "#lib/cawco/HarnessLogo.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { quotedScreen } from "#lib/cawco/signin-screen.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button, buttonVariants } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import * as Table from "#lib/components/ui/table/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import {
    IconAsk,
    IconCheck,
    IconExternal,
    IconNotYet,
    IconTerminal,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { failureWords as message } from "#lib/platform/hub-read.js";
  import { dur } from "#lib/platform/motion/curves.svelte.js";
  import { blockingBehind } from "./blocking";
  import NoMachines from "./config/NoMachines.svelte";
  import { EMPTY_LINES } from "./empty-asks";
  import MachineLedger from "./MachineLedger.svelte";
  import NsPopover from "./spawn/NsPopover.svelte";
  import NsPopoverGroup from "./spawn/NsPopoverGroup.svelte";
  import type { Machine } from "./stores/board.svelte";
  import ToolUpdateCell from "./ToolUpdateCell.svelte";
  import {
    pressInstall,
    pressPending,
    pressRefused,
  } from "./tool-presses.svelte";
  import {
    dropToolSignin,
    heldToolSignin,
    openToolSignin,
    reopenToolSignin,
    showToolSignin,
    signinOf,
    type ToolSigninFlow,
    toolSigninFlow,
    toolSigninKey,
  } from "./tool-signin.svelte";
  import { policyFor, setPolicy } from "./tools";

  let {
    machines,
    catalog,
    policies,
    releases,
    updates,
  }: {
    machines: Machine[];
    catalog: ToolSpec[];
    policies: ToolPolicy[];
    /** The newest release of each CLI CawCo keeps current, by tool id. */
    releases: Readonly<Record<string, string>>;
    /** The fleet's choice for a copy CawCo doesn't run (core `ToolUpdates`). */
    updates: ToolUpdates;
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
  /** Why a column's Required switch did not save: said under it. */
  let policyRefused = $state<Record<string, string>>({});
  /** A copy of the tool is there: installed, or being updated or refused with its version kept. */
  const hasCopy = (tool: ToolStatus | undefined): boolean =>
    tool?.state === "installed" ||
    ((tool?.state === "installing" || tool?.state === "failed") &&
      tool.version !== undefined);
  /**
   * Machines with a copy there: one being updated (a version beside its
   * progress) still has it, and so does one at a version CawCo doesn't run,
   * which its row shows by that version ({@link cantRunOn}).
   */
  const installedOn = (spec: ToolSpec): number =>
    machines.filter((machine) => hasCopy(machine.tools?.[spec.id])).length;
  /**
   * Machines whose copy CawCo can't run, being updated or not: the head's
   * "can't run", counted as the Out of date group lists them
   * (`blockingBehind`), so the page says one number for one fact.
   */
  const blocked = $derived(blockingBehind(machines, updates, releases));
  const cantRunOn = (spec: ToolSpec): number =>
    blocked.find((entry) => entry.toolId === spec.id)?.machines.length ?? 0;
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
   * nothing under way and nothing to tell is let go; one that signed in
   * stays, so the popover leaves with its outcome drawn.
   *
   * While its popover is open the cell stands as it stood when it opened
   * (`heldView`: its state, its act's words, its refusal line): the popover
   * is where the sign-in moves, so the row behind it never grows, shrinks
   * or says a refusal twice. Put away, the cell says what the sign-in came
   * to, a tick drawing there once it signed in.
   */
  function setOpen(
    machineId: string,
    toolId: string,
    open: boolean,
    shown?: SigninView
  ) {
    const key = toolSigninKey(machineId, toolId);
    if (open) {
      if (shown) {
        heldView[key] = shown;
      }
      toolSigninFlow(machineId, toolId);
      showToolSignin(key);
      return;
    }
    if (openToolSignin() === key) {
      showToolSignin(null);
    }
    delete heldView[key];
    const flow = heldToolSignin(key);
    if (
      flow &&
      !flow.live &&
      flow.problem === null &&
      flow.phase !== "signed-in"
    ) {
      dropToolSignin(key);
    }
  }

  /** What a sign-in cell says: its state, its act's words, its refusal line. */
  interface SigninView {
    line: string | null;
    state: SigninState;
    verb: string;
  }
  /** Each open popover's cell, as it stood when the popover opened. */
  let heldView = $state<Record<string, SigninView>>({});
  /** The cell as the machine's read and the sign-in here make it now. */
  function signinView(
    read: ToolStatus["signin"],
    flow: ToolSigninFlow | undefined
  ): SigninView {
    const parked = flow?.live === true;
    // A refusal is kept on its cell once put away, never one under way or signed in.
    const line =
      flow?.problem && flow.phase !== "signed-in" && !parked
        ? quotedScreen(flow.problem).sentence
        : null;
    return {
      state: signinStateOf(read?.state === "signed-in", parked, read?.state),
      verb: signinVerbOf(parked, line !== null),
      line,
    };
  }

  /**
   * Where focus goes as a sign-in popover closes: onto its cell's Signed in
   * once it signed in (its trigger is gone with it), else back to the
   * trigger (NsPopoverGroup's own).
   */
  function closeFocus(key: string): boolean {
    if (heldToolSignin(key)?.phase !== "signed-in") {
      return false;
    }
    document.getElementById(`tool-signin-state-${key}`)?.focus();
    return true;
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
    }, dur("--duration-hold"));
    return () => clearTimeout(timer);
  });

  type SigninState = "signed-in" | "waiting" | "unknown" | "signed-out";
  /** What a sign-in cell says: the machine's read, or a sign-in under way here. */
  function signinStateOf(
    signedIn: boolean,
    parked: boolean,
    read: string | undefined
  ): SigninState {
    if (signedIn) {
      return "signed-in";
    }
    if (parked) {
      return "waiting";
    }
    return read === "unknown" ? "unknown" : "signed-out";
  }
  const SIGNIN_WORDS: Record<SigninState, string> = {
    "signed-in": toolWords.signedIn,
    waiting: toolWords.signinWaiting,
    unknown: toolWords.signinUnknown,
    "signed-out": toolWords.signedOut,
  };
  /** The cell's act: back to a waiting sign-in, again after a refusal, or a first one. */
  function signinVerbOf(parked: boolean, spent: boolean): string {
    if (parked) {
      return toolWords.pasteCode;
    }
    return spent ? commonWords.signInAgain : toolWords.signIn;
  }
  /** Every wording the act takes, stood in one cell (The Steady Swap Rule). */
  const SIGNIN_VERBS = [
    toolWords.signIn,
    toolWords.pasteCode,
    commonWords.signInAgain,
  ];
  /** The tool's sign-in read whose popover is open (Unknown's), by `machine:tool`. */
  let readOpen = $state<string | null>(null);
  function showRead(key: string, open: boolean) {
    if (open) {
      readOpen = key;
    } else if (readOpen === key) {
      readOpen = null;
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
  {@const pending = pressPending(machine.machineId, spec.id)}
  {@const shown = toolStatus?.state ?? "unknown"}
  {@const failed = pressRefused(machine.machineId, spec.id) !== undefined}
  <!-- A copy there at a version CawCo doesn't run (older than its floor, or
       not its one version) carries that version, the probe's word on it and
       an attempt's that left it there alike (core ToolStatus `triedAt` says
       which); an attempt that failed with no copy there carries none. -->
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
      onclick={() => pressInstall(machine.machineId, spec.id)}
      {pending}
      {pendingLabel}
      size="xs"
      tone={quiet ? "muted" : undefined}
      variant={quiet ? "ghost" : "outline"}
    />
  {/snippet}

  <!-- The state on the row's first line (MachineLedger `settle`), a
       refusal under it. Where the copy stands against the version CawCo
       runs (core tool-updates.ts) is ToolUpdateCell's, but for the quiet
       tick of a copy nobody moved, an install of a tool that wasn't there,
       and a copy an update left older than its newest release (`detail`),
       which keep their own cells below. -->
  {@const update = toolUpdateOf(toolStatus, updates, releases)}
  <!-- A copy the person installed that CawCo runs: left where it is, its
       one press handing it to CawCo (its own install, which then follows
       the fleet's choice), behind the layer that says so. -->
  {@const ownRuns =
    update?.kind === "runs" && toolStatus?.copy?.by === "person"}
  {@const moved =
    update !== undefined &&
    !(
      update.kind === "runs" &&
      !ownRuns &&
      (update.updatedAt === undefined || !!toolStatus?.detail)
    ) &&
    !(update.kind === "updating" && update.from === undefined)}
  <span
    class={[
      "flex items-center self-stretch @phone/table:min-h-c-ledger-row-h",
      // On a phone's card: its own line under the machine and its version,
      // from the machine's name to the card's end, the quiet tick included,
      // so its Reinstall is in reach.
      "@max-phone/table:col-span-full @max-phone/table:ps-c-ledger-text-inset",
    ]}
  >
    {#if moved && update}
      <ToolUpdateCell
        machine={where}
        machineId={machine.machineId}
        method={toolStatus?.method}
        {online}
        ownCopy={ownRuns}
        blocks={update.kind === "updating"
          ? !toolRuns(spec, update.from)
          : toolStatus?.wants !== undefined}
        paused={machine.pausedUntil !== null}
        {spec}
        {update}
      />
    {:else if shown === "installed" && toolStatus?.detail}
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
            gap="none"
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
            <footer
              class="border-t border-border-hairline px-space-3 py-space-2"
            >
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
          <IconCheck
            aria-label="Current"
            class="size-icon-md shrink-0 text-status-done-glyph"
          />
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
            gap="none"
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
            <footer
              class="border-t border-border-hairline px-space-3 py-space-2"
            >
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
          <Tooltip.Content
            >The daemon has not reported this tool</Tooltip.Content
          >
        </Tooltip.Root>
        <Button
          disabled={!online}
          {failed}
          label="Install"
          onclick={() => pressInstall(machine.machineId, spec.id)}
          {pending}
          pendingLabel="Installing…"
          size="xs"
          tone="muted"
          variant="ghost"
        />
      </span>
    {/if}
  </span>
  <!-- An install the hub refused, in its words, in the cell it was asked in;
       on a phone's card, across the card under it from the machine's name,
       so the State stays as narrow as its act. The row's own press is the
       way on, so the fault offers none of its own. -->
  <RowFault
    class="@max-phone/table:col-span-full @max-phone/table:ps-c-ledger-text-inset"
    reason={pressRefused(machine.machineId, spec.id)}
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
  {@const now = signinView(read, flow)}
  {@const { state, verb, line } = open ? (heldView[key] ?? now) : now}
  {#if hasCopy(toolStatus) || flow}
    <div
      class="flex flex-col gap-space-1 whitespace-normal @max-phone/table:ps-c-ledger-text-inset"
    >
      <!-- One line on the row's first line: the state's glyph and word at
         the column's start, in meta, and its act at the column's end. -->
      <span
        class="flex items-center justify-between gap-space-2 @phone/table:min-h-c-ledger-row-h"
      >
        <span
          class="mark-line flex min-w-0 items-start gap-space-2 type-meta text-ink-muted"
          data-signin={state}
        >
          <!-- On the words' first line; a phone's narrow card may wrap them. -->
          <span class="mark-cell w-icon-md">
            {#if state === "signed-in" && flow?.phase === "signed-in"}
              <Check />
            {:else if state === "signed-in"}
              <IconCheck class="size-icon-md text-status-done-glyph" />
            {:else if state === "waiting"}
              <LiveDot />
            {:else if state === "unknown"}
              <IconAsk class="size-icon-md" />
            {:else}
              <IconNotYet class="size-icon-md" />
            {/if}
          </span>
          {#if state === "unknown"}
            <!-- The word is the way to the tool's own words. -->
            <span data-box>
              <NsPopover
                align="start"
                id="tool-signin-read-{key}"
                label={toolWords.signinUnknownHead(spec.name, where)}
                onchange={(next) => showRead(key, next)}
                open={readOpen === key}
                triggerClass="pointer-hit touch-hit rounded-xs text-ink-muted transition-colors hover:text-ink-strong"
                width="var(--spacing-c-signin-pop-w)"
              >
                {#snippet trigger()}
                  {toolWords.signinUnknown}
                {/snippet}
                {@render signinFrame(
                  toolWords.signinTitle(spec.name, where),
                  read?.detail ?? toolWords.signinUnknownSilent
                )}
              </NsPopover>
            </span>
          {:else}
            <!-- Where focus lands once a sign-in here signs in (`closeFocus`). -->
            <span
              id="tool-signin-state-{key}"
              class="min-w-0 rounded-xs text-pretty focus-visible:outline-solid focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)"
              tabindex="-1">{SIGNIN_WORDS[state]}</span
            >
          {/if}
        </span>
        {#if online && (!signedIn || open)}
          <!-- Its end edge holds still on the column's end; its words stand
             in one cell as wide as the widest (The Steady Swap Rule), so
             the popover hung from that edge never moves. -->
          <NsPopover
            align="end"
            id="tool-signin-{key}"
            label={toolWords.signInOn(verb, spec.name, where)}
            onchange={(next) => setOpen(machine.machineId, spec.id, next, now)}
            onclosefocus={() => closeFocus(key)}
            {open}
            triggerClass={buttonVariants({ variant: "outline", size: "xs" })}
            width="var(--spacing-c-signin-pop-w)"
          >
            {#snippet trigger()}
              <span class="grid">
                {#each SIGNIN_VERBS as word (word)}
                  <span
                    class={[
                      "col-start-1 row-start-1 text-center",
                      word !== verb && "invisible",
                    ]}>{word}</span
                  >
                {/each}
              </span>
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
      <!-- The refusal, on its cell until tried again, held as it stood while
         the popover is open (`heldView`). The popover announced it; here it
         stands, said once. Its way on is the cell's own act; the tool's
         screen is in the popover. -->
      <RowFault live={false} reason={line} />
    </div>
  {/if}
{/snippet}

<!-- The frame both sign-in popovers share: the title, then the words. A
     tool's screen it quotes stands as its own lines in the code face, the
     sentence before it in meta. -->
{#snippet signinFrame(title: string, words: string)}
  {@const { sentence, lines } = quotedScreen(words)}
  <div class="flex flex-col gap-space-3 p-space-2">
    <p data-slot="title" class="type-label text-ink-strong">{title}</p>
    <p class="type-meta text-pretty text-ink-strong">{sentence}</p>
    {#if lines}
      <pre
        class="max-h-56 overflow-auto type-code whitespace-pre-wrap wrap-anywhere text-ink-muted">{lines}</pre>
    {/if}
  </div>
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
              <!-- The CLI's own mark, as harness marks stand beside their names. -->
              {#if hasMark(spec.id)}
                <HarnessLogo data-box harness={spec.id} />
              {/if}
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
                >{installedOn(spec)}/{machines.length} installed{#if cantRunOn(spec) > 0}{` · ${toolWords.cantRunCount(cantRunOn(spec))}`}{/if}{#if spec.signin && signedInOn(spec) > 0}{` · ${toolWords.signedInCount(signedInOn(spec))}`}{/if}</span
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
            settle="top"
          >
            {#snippet heads()}
              {#if spec.signin}
                <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
                <Table.Head class="w-c-signin-col-w" scope="col" variant="band"
                  >{toolWords.signinHead}</Table.Head
                >
              {/if}
              <Table.Head class="w-c-version-col-w" variant="band"
                >{toolUpdateWords.versionHead}</Table.Head
              >
              <Table.Head class="w-c-tool-state-col-w" variant="band"
                >{toolUpdateWords.stateHead}</Table.Head
              >
            {/snippet}
            {#snippet cells(machine: Machine, online: boolean)}
              {#if spec.signin}
                <!-- On a phone's card, its own line under the machine and its
                     State, from the machine's name to the card's end; no
                     line where there is nothing to sign in. -->
                <Table.Cell
                  class="@max-phone/table:col-span-full @max-phone/table:row-start-2"
                  inCard="drops-empty"
                  settle="top"
                  variant="ledger-stacks"
                >
                  {@render signinCell(machine, spec, online)}
                </Table.Cell>
              {/if}
              <!-- On a phone's card the cell gives its parts to the card's
                   grid: the state at the card's end beside the machine, a
                   refusal on its own line under them. -->
              {@const v = machine.tools?.[spec.id]}
              <Table.Cell settle="top" variant="ledger-stacks">
                <span
                  class="flex items-center @phone/table:min-h-c-ledger-row-h"
                >
                  <code
                    data-slot="num"
                    class={[
                      "num type-code",
                      v?.version ? "text-ink-strong" : "text-ink-muted",
                    ]}>{v?.version ?? "—"}</code
                  >
                </span>
              </Table.Cell>
              <Table.Cell inCard="lends" settle="top" variant="ledger-stacks">
                <div
                  class="flex flex-col items-start gap-space-1 whitespace-normal @max-phone/table:contents"
                >
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
