<script lang="ts">
  import {
    DRAFT_LIMITS,
    type InstallRoute,
    type InstallSignIn,
  } from "@cawco/core/install";
  /**
   * Reach: the window's details for a machine not yet added, under the two
   * ways in as tabs (Over SSH, By a command), the one the entry point
   * implied chosen as it opens, else Over SSH.
   *
   * Over SSH: where it is (`user@host` or a Host the hub's ssh knows, a port
   * when it isn't 22), how it signs in (the hub's key; a password once,
   * which plants the hub's key and is then forgotten; or a key the person
   * puts there, its line shown to copy), the promise that the person may
   * leave, and what the installer needs. Everything is checked here before
   * anything starts, its words on the line kept under the field, the field
   * shaking once. A second Add machine for a machine mid-install opens that
   * install.
   *
   * By a command: the hub's addresses one per kind with where each works,
   * the one line with its one-time code, what it may ask, what it does on
   * a machine that has CawCo, what the installer needs. Copy command is the
   * start: the install's row arrives in the band and the hub listens.
   *
   * A tab switches in place: the panes cross-fade inside the window's
   * resize, and what was typed in each stays (the draft is the hub's).
   */
  import { commonWords } from "@cawco/core/words/common";
  import { connectWords } from "@cawco/core/words/connect";
  import { flushSync } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { UseClipboard } from "#lib/hooks/use-clipboard.svelte.js";
  import { IconChevronDown } from "#lib/icons.js";
  import {
    CURVE,
    crossIn,
    crossOut,
    dur,
    motionOk,
  } from "../motion/curves.svelte";
  import { departBox } from "../motion/share.svelte";
  import Checklist, { departChecks } from "./Checklist.svelte";
  import Choice from "./Choice.svelte";
  import { connect, phone } from "./installs.svelte";
  import MonoWell from "./MonoWell.svelte";
  import PasswordField from "./PasswordField.svelte";
  import { CONNECT_WAYS } from "./ways";

  const route = $derived(connect.tab);
  const join = $derived(connect.join);
  /** The hub has no SSH key: nothing can sign in by key, nor plant one. */
  const noKey = $derived(join !== null && join.sshPublicKey === null);

  const SIGN_INS: { value: InstallSignIn; words: string; says?: string }[] = [
    { value: "key", words: "with the hub's key" },
    {
      value: "password",
      words: "with a password, once",
      says: "It plants the hub's key, then the hub forgets it.",
    },
    { value: "by-hand", words: "I'll put the key there myself" },
  ];

  /**
   * The hub's key, by hand: a two-line well on the desk. On a phone one line
   * when it follows the hub's-key variant and two after the password one, so
   * either neighbour stands 36px or more from it (the height ladder).
   */
  let cameFrom = $state<InstallSignIn>("key");
  const keyRows = $derived(phone.current && cameFrom !== "password" ? 1 : 2);
  const keyLines = $derived.by(() => {
    const key = join?.sshPublicKey ?? "";
    if (keyRows === 1) {
      return [key];
    }
    // Two lines: the one line wrapped at its middle, so the whole key shows.
    const half = Math.ceil(key.length / 2);
    return [key.slice(0, half), key.slice(half)];
  });

  /** The port's field stands open: asked for, or holding a port. */
  let portOpen = $state(false);
  let portField = $state<HTMLInputElement | null>(null);

  /** The check's words under the field, empty until there are any. */
  let said = $state("");
  $effect(() => {
    // A password typed again clears the words the last check said of it.
    if (connect.password) {
      said = "";
    }
  });
  let targetField = $state<HTMLInputElement | null>(null);
  let pending = $state(false);
  let refused = $state("");

  function edit(patch: Partial<typeof connect.fields>) {
    said = "";
    refused = "";
    connect.edit(patch);
  }

  /** The field shakes once on a refusal; with less motion it only says why. */
  function shake(field: HTMLElement | null) {
    if (!(field && motionOk.current)) {
      return;
    }
    field.animate(
      [
        { translate: "0 0" },
        { translate: "-4px 0" },
        { translate: "4px 0" },
        { translate: "-2px 0" },
        { translate: "0 0" },
      ],
      { duration: dur("--dur-panel"), easing: CURVE.out }
    );
  }

  const PORT = /^\d+$/u;
  const SPACE = /\s/u;
  const SCHEME = /^https?:\/\//u;
  const LINE_BREAK = /[\r\n]/u;
  /** What stops an SSH install before anything starts, in words; empty when nothing does. */
  function check(): string {
    const target = connect.fields.target.trim();
    if (!target) {
      return "Type the machine's address: user@host, or a Host from the hub's ~/.ssh/config.";
    }
    if (SPACE.test(target)) {
      return "An address has no spaces: user@host, or a Host from the hub's ~/.ssh/config.";
    }
    if (target.startsWith("-")) {
      return "An address can't start with a dash.";
    }
    const port = connect.fields.port.trim();
    if (
      port &&
      !(PORT.test(port) && Number(port) >= 1 && Number(port) <= 65_535)
    ) {
      return "The port is a whole number from 1 to 65535.";
    }
    if (connect.fields.signIn === "password") {
      if (!connect.password) {
        return "Type the machine's password for its one sign-in.";
      }
      if (LINE_BREAK.test(connect.password)) {
        return "That password has a line break, which SSH can't be handed.";
      }
    }
    return "";
  }

  async function addOverSsh() {
    said = check();
    if (said) {
      shake(targetField);
      return;
    }
    const target = connect.fields.target.trim();
    const port = connect.fields.port.trim()
      ? Number(connect.fields.port)
      : null;
    // A machine mid-install: its window, at Running.
    const running = connect.runningFor(target, port);
    if (running) {
      connect.openInstall(running.id, connect.anchor);
      return;
    }
    pending = true;
    departChecks();
    if (targetField) {
      departBox("connect-title", targetField, false);
    }
    try {
      await connect.start({
        route: "ssh",
        target,
        ...(port === null ? {} : { port }),
        signIn: connect.fields.signIn,
        ...(connect.fields.signIn === "password"
          ? { password: connect.password }
          : {}),
      });
    } catch (error) {
      refused = (error as Error).message;
      shake(targetField);
    } finally {
      pending = false;
    }
  }

  // ---- By a command ------------------------------------------------------

  /** The four kinds of address, each with where it works; the hub's first of each. */
  const KINDS = [
    {
      kind: "tailscale",
      name: "Tailscale",
      where: "anywhere on the tailnet",
      missing: ["No Tailscale address", "Tailscale isn't on the hub's machine"],
      match: (label: string) => label === "Tailscale",
    },
    {
      kind: "tailscale-dns",
      name: "Tailscale name",
      where: "anywhere on the tailnet",
      missing: ["No Tailscale name", "MagicDNS is off on the tailnet"],
      match: (label: string) => label === "Tailscale DNS",
    },
    {
      kind: "lan",
      name: "This network only",
      where: "not for a Mac",
      missing: ["No network address", "the hub's machine has none"],
      match: (label: string) =>
        !["Tailscale", "Tailscale DNS", connectWords.onThisNetwork].includes(
          label
        ),
    },
    {
      kind: "local",
      name: "This network or ZeroTier",
      where: "not for a Mac",
      missing: ["No .local name", "it is off on the hub"],
      match: (label: string) => label === connectWords.onThisNetwork,
    },
  ] as const;

  const addresses = $derived(
    KINDS.map((kind) => ({
      ...kind,
      address:
        join?.addresses.find((one) => kind.match(one.label))?.url ?? null,
    }))
  );

  /** The address chosen: the draft's, else the first the hub has. */
  const address = $derived(
    connect.fields.address &&
      addresses.some((one) => one.address === connect.fields.address)
      ? connect.fields.address
      : (addresses.find((one) => one.address)?.address ?? null)
  );
  const code = $derived(connect.hubDraft?.code ?? null);
  const line = $derived(
    address && code ? `curl -fsSL ${address}/install.sh?code=${code} | sh` : ""
  );

  const clipboard = new UseClipboard();
  /** "Copied · Listening for it…" while the copy settles, before Running. */
  let copied = $state(false);
  async function copyCommand() {
    if (!(address && line)) {
      return;
    }
    pending = true;
    refused = "";
    try {
      await clipboard.copy(line);
      copied = true;
      departChecks();
      await connect.start({ route: "command", address }, dur("--dur-hold"));
    } catch (error) {
      copied = false;
      refused = (error as Error).message;
    } finally {
      pending = false;
    }
  }

  /**
   * The window read the hub's addresses and key as it opened. While the hub
   * has no key, or that read failed, they are asked again now and then:
   * Reach changes on its own once the key exists or the hub answers.
   */
  const rereads = $derived(
    connect.joinFailed !== null || (noKey && route === "ssh")
  );
  $effect(() => {
    if (!rereads) {
      return;
    }
    const again = setInterval(() => {
      connect.loadJoin().catch(() => undefined);
    }, 3000);
    return () => clearInterval(again);
  });
  let rereading = $state(false);
  async function readAgain() {
    rereading = true;
    try {
      await connect.loadJoin();
    } finally {
      rereading = false;
    }
  }

  /** Why Copy command can't start yet, in words beside it; empty when it can. */
  const copyWaits = $derived.by(() => {
    if (copied || line) {
      return "";
    }
    if (connect.joinFailed) {
      return connectWords.waitsForAddresses;
    }
    if (join && !address) {
      return "The hub lists no address for it";
    }
    return "Waits for the hub's line";
  });

  const user = $derived(
    connect.fields.target.includes("@")
      ? connect.fields.target.slice(0, connect.fields.target.indexOf("@"))
      : "its login user"
  );
</script>

<div class="flex flex-col gap-space-3">
  <!-- The two ways in, the house's tab switch; each tab's details stay as
       typed while the other shows (the hub's draft). -->
  <Tabs
    onValueChange={(next) => {
      said = "";
      refused = "";
      connect.chooseTab(next as InstallRoute);
    }}
    value={route}
    values={CONNECT_WAYS.map((way) => way.route)}
  >
    <TabsList aria-label="How to add it">
      {#each CONNECT_WAYS as way (way.route)}
        <TabItem
          aria-controls="connect-tab-panel"
          icon={way.icon}
          id={`connect-tab-${way.route}`}
          label={way.name}
          value={way.route}
        />
      {/each}
    </TabsList>
  </Tabs>

  <div class="grid">
    {#key route}
      <div
        id="connect-tab-panel"
        role="tabpanel"
        aria-labelledby={`connect-tab-${route}`}
        class="col-start-1 row-start-1 flex min-w-0 flex-col gap-space-3"
        in:crossIn
        out:crossOut
      >
        {#if route === "ssh"}
          <div class="flex flex-col gap-space-1">
            <div class="flex items-center gap-space-2">
              <label
                for="connect-target"
                class="flex-none type-body text-ink-strong"
                >{connectWords.reachItAt}</label
              >
              <input
                bind:this={targetField}
                id="connect-target"
                data-autofocus
                autocapitalize="off"
                autocomplete="off"
                spellcheck="false"
                aria-describedby="connect-said"
                aria-invalid={said ? "true" : undefined}
                class="field-edge h-c-input-h min-w-0 flex-1 rounded-md border border-border-control bg-surface-raised px-space-3 font-mono type-body text-ink-strong shadow-xs transition-control placeholder:text-ink-subtle aria-invalid:border-error-9"
                placeholder="deploy@build-01.example.net"
                maxlength={DRAFT_LIMITS.target}
                value={connect.fields.target}
                oninput={(event) => edit({ target: event.currentTarget.value })}
                onkeydown={(event) => {
                  if (event.key === "Enter") {
                    addOverSsh().catch(() => undefined);
                  }
                }}
              />
              <!-- The port: "Port 22 ▾" until it is asked for, then its field in
                   the same cell, so nothing beside it moves. -->
              <span class="grid w-c-port-field-w flex-none" data-box>
                {#if portOpen || connect.fields.port}
                  <input
                    bind:this={portField}
                    id="connect-port"
                    aria-label="Port"
                    inputmode="numeric"
                    autocomplete="off"
                    class="field-edge num col-start-1 row-start-1 h-c-input-h w-full min-w-0 rounded-md border border-border-control bg-surface-raised px-space-2 text-center type-body text-ink-strong shadow-xs transition-control placeholder:text-ink-subtle"
                    placeholder="22"
                    maxlength={DRAFT_LIMITS.port}
                    value={connect.fields.port}
                    oninput={(event) =>
                      edit({ port: event.currentTarget.value })}
                    onblur={() => {
                      portOpen = false;
                    }}
                  />
                {:else}
                  <button
                    type="button"
                    data-slot="port"
                    aria-label="Port 22. Change the port"
                    class="select-none pressable touch-hit mark-line col-start-1 row-start-1 inline-flex h-c-input-h w-full items-center justify-center gap-space-1 rounded-md border border-border-control bg-surface-raised type-body text-ink-strong shadow-xs transition-control hover:bg-surface-hover"
                    onclick={() => {
                      // Its field takes focus in this press's own task. A
                      // frame later (`tick`, in async mode) it would take
                      // focus from wherever the person went in that frame,
                      // and what they typed next would land in the port.
                      flushSync(() => {
                        portOpen = true;
                      });
                      portField?.focus();
                    }}
                  >
                    <span class="num">Port 22</span>
                    <IconChevronDown
                      aria-hidden="true"
                      class="size-icon-sm text-ink-muted"
                    />
                  </button>
                {/if}
              </span>
            </div>
            <p
              id="connect-said"
              aria-live="polite"
              class="m-0 min-h-lh ps-c-row-lead type-meta text-status-fail-ink"
            >
              {said || refused}
            </p>
          </div>

          {#if noKey}
            <div data-slot="no-key" class="flex flex-col gap-space-2">
              <p class="m-0 type-body text-pretty text-ink-strong">
                The hub has no SSH key yet. Make one on the hub's machine; this
                changes on its own once it exists.
              </p>
              <MonoWell
                copy="ssh-keygen -t ed25519"
                copyLabel="Copy ssh-keygen -t ed25519"
                label="The command that makes the hub's key"
                lines={["ssh-keygen -t ed25519"]}
              />
            </div>
          {:else}
            <div class="flex flex-col gap-space-2">
              <div class="mark-line flex items-center gap-space-2">
                <span class="type-body text-ink-strong">Sign in</span>
                <span data-box
                  ><Choice
                    label="Sign in"
                    onchoose={(next) => {
                      connect.password = "";
                      cameFrom = connect.fields.signIn;
                      edit({ signIn: next });
                    }}
                    options={SIGN_INS}
                    value={connect.fields.signIn}
                  /></span
                >
              </div>
              {#if connect.fields.signIn === "password"}
                <PasswordField
                  id="connect-password"
                  label="The machine's password, for one sign-in"
                  onenter={() => {
                    addOverSsh().catch(() => undefined);
                  }}
                  placeholder={connect.passwordLost
                    ? connectWords.typeItAgain
                    : "Its password, used once"}
                />
              {:else if connect.fields.signIn === "by-hand" && join?.sshPublicKey}
                <div class="flex flex-col gap-space-1">
                  <MonoWell
                    copy={join.sshPublicKey}
                    copyLabel="Copy the hub's public key"
                    label="The hub's public key"
                    lines={keyLines}
                    rows={keyRows}
                  />
                  <p class="m-0 type-meta text-ink-muted">
                    Put it in ~/.ssh/authorized_keys for {user}.
                  </p>
                </div>
              {/if}
            </div>
          {/if}

          <p class="m-0 type-meta text-ink-muted">
            You can leave. The install carries on without you.
          </p>
          <Checklist />
          <!-- A disabled Add machine says why in words beside it. -->
          <div class="flex items-center justify-end gap-space-3">
            {#if noKey}
              <p
                id="connect-add-waits"
                data-slot="waits"
                class="m-0 min-w-0 type-meta text-pretty text-ink-muted"
              >
                {connectWords.waitsForKey}
              </p>
            {/if}
            <Button
              aria-describedby={noKey ? "connect-add-waits" : undefined}
              class="flex-none"
              disabled={noKey}
              label={connectWords.addMachine}
              onclick={addOverSsh}
              {pending}
              pendingLabel="Adding…"
              variant="default"
            />
          </div>
        {:else}
          <div class="flex flex-col gap-space-2">
            <p id="connect-reaches" class="m-0 type-body text-ink-strong">
              {connectWords.reachesHubAt}
            </p>
            {#if connect.joinFailed}
              <div data-slot="join-failed" class="flex items-start gap-space-3">
                <p
                  class="m-0 min-w-0 flex-1 type-meta text-pretty text-status-fail-ink"
                  aria-live="polite"
                >
                  The hub's addresses couldn't be read: {connect.joinFailed} It asks
                  again on its own.
                </p>
                <Button
                  class="flex-none"
                  label={commonWords.tryAgain}
                  onclick={readAgain}
                  pending={rereading}
                  pendingLabel="Reading…"
                  size="sm"
                  variant="outline"
                />
              </div>
            {:else}
              <div
                role="radiogroup"
                aria-labelledby="connect-reaches"
                class="flex flex-col"
              >
                {#each addresses as row (row.kind)}
                  <!-- biome-ignore lint/a11y/noLabelWithoutControl: the address's radio stands inside it -->
                  <label
                    data-address={row.kind}
                    class={[
                      "mark-line flex min-h-c-btn-h-sm items-center gap-space-2 rounded-sm px-space-1 py-space-row coarse:min-h-c-row-h",
                      row.address ? "hover:bg-surface-hover" : "opacity-50",
                    ]}
                  >
                    <input
                      type="radio"
                      name="connect-address"
                      class="size-icon-md flex-none accent-action-solid"
                      data-box
                      disabled={!row.address}
                      checked={row.address !== null && row.address === address}
                      onchange={() => edit({ address: row.address })}
                    />
                    {#if row.address}
                      <!-- On a phone, where it works stands under the address. -->
                      <span
                        data-box
                        class={[
                          "flex min-w-0 flex-1",
                          phone.current
                            ? "flex-col"
                            : "items-center gap-space-2",
                        ]}
                      >
                        <span
                          class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap font-mono type-label text-ink-strong"
                          >{row.address.replace(SCHEME, "")}</span
                        >
                        <span
                          class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
                          >{row.name} · {row.where}</span
                        >
                      </span>
                    {:else}
                      <!-- A missing kind keeps its row's shape: what is missing,
                           then why, where an address would stand. -->
                      <span
                        data-box
                        class={[
                          "flex min-w-0 flex-1",
                          phone.current
                            ? "flex-col"
                            : "items-center gap-space-2",
                        ]}
                      >
                        <span
                          class="min-w-0 flex-1 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-muted"
                          >{row.missing[0]}</span
                        >
                        <span
                          class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-meta text-ink-muted"
                          >{row.missing[1]}</span
                        >
                      </span>
                    {/if}
                  </label>
                {/each}
              </div>
            {/if}
          </div>
          <MonoWell
            label="The command to run on the machine"
            lines={[
              line ||
                (connect.joinFailed
                  ? connectWords.noCommandYet
                  : "Reading the hub's addresses…"),
            ]}
          />
          <div class="flex flex-col gap-space-1">
            <p class="m-0 type-meta text-ink-muted">
              In a real terminal it may ask you questions there.
            </p>
            <p class="m-0 type-meta text-pretty text-ink-muted">
              {connectWords.alreadyHasCawCo}
            </p>
          </div>
          <Checklist />
          {#if refused}
            <p class="m-0 type-meta text-status-fail-ink" aria-live="polite">
              {refused}
            </p>
          {/if}
          <!-- A disabled Copy command says why in words beside it. -->
          <div class="flex items-center justify-end gap-space-3">
            {#if copyWaits}
              <p
                id="connect-copy-waits"
                data-slot="waits"
                class="m-0 min-w-0 type-meta text-pretty text-ink-muted"
              >
                {copyWaits}
              </p>
            {/if}
            <!-- Both wordings stand in one cell, as wide as the wider, so the
                 button never changes width as the copy lands (The Steady Swap
                 Rule); the ellipsis breathes while the hub listens. -->
            <Button
              aria-describedby={copyWaits ? "connect-copy-waits" : undefined}
              aria-label={copied
                ? connectWords.copiedListeningLabel
                : commonWords.copyCommand}
              class="flex-none"
              data-copied={copied || undefined}
              disabled={!line || copied}
              onclick={copyCommand}
              variant="default"
            >
              <span class="grid" data-box>
                <span
                  class={[
                    "col-start-1 row-start-1 transition-opacity duration-(--dur-morph) ease-out",
                    copied && "opacity-0",
                  ]}>{commonWords.copyCommand}</span
                >
                <span
                  aria-hidden="true"
                  class={[
                    "col-start-1 row-start-1 transition-opacity duration-(--dur-morph) ease-out",
                    !copied && "opacity-0",
                  ]}
                  >{connectWords.copiedListening}<span class="breathe loops"
                    >…</span
                  ></span
                >
              </span>
            </Button>
          </div>
        {/if}
      </div>
    {/key}
  </div>
</div>
