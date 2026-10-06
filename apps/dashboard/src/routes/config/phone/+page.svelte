<script lang="ts">
  import { onMount } from "svelte";
  import Field from "#lib/cawco/config/Field.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SwitchField from "#lib/cawco/config/SwitchField.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconKey, IconPhone } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";

  /**
   * Pushes to the iOS app (push.ts in the hub). The APNs credentials are
   * entered here and kept by the hub; the .p8 key goes in once and is never
   * read back. Devices register themselves from the app; here each can be
   * made quiet or removed.
   */
  const section = sectionOf("phone");
  const HUE = section.hue;

  type Environment = "sandbox" | "production";
  interface Credentials {
    bundleId: string;
    environment: Environment;
    keyId: string;
    savedAt: number;
    teamId: string;
  }
  interface Device {
    environment: Environment;
    lastError: string | null;
    lastSentAt: number | null;
    name: string;
    platform: string;
    quiet: boolean;
    registeredAt: number;
    token: string;
  }
  interface Outcome {
    device: string;
    name: string;
    pruned: boolean;
    reason: string | null;
    status: number;
  }
  type TestResult =
    | { kind: "devices"; outcomes: Outcome[] }
    | { kind: "probe"; ok: boolean; reason: string | null; status: number };

  let credentials = $state<Credentials | null>(null);
  let devices = $state<Device[]>([]);
  let loaded = $state(false);
  let readError = $state<string | null>(null);

  let teamId = $state("");
  let keyId = $state("");
  let bundleId = $state("dev.cawco.app");
  let environment = $state<Environment>("production");
  let privateKey = $state("");

  let saving = $state(false);
  let testing = $state(false);
  let removing = $state(false);
  let credentialsError = $state<string | null>(null);
  let testResult = $state<TestResult | null>(null);
  let deviceError = $state<string | null>(null);

  async function read() {
    try {
      const response = await fetch("/api/push");
      if (!response.ok) {
        throw new Error(`the hub answered ${response.status}`);
      }
      const body = (await response.json()) as {
        credentials: Credentials | null;
        devices: Device[];
      };
      ({ credentials, devices } = body);
      if (credentials) {
        ({ teamId, keyId, bundleId, environment } = credentials);
      }
      loaded = true;
    } catch (error) {
      readError = `Could not read the push settings — ${error instanceof Error ? error.message : String(error)}.`;
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    saving = true;
    credentialsError = null;
    testResult = null;
    const response = await fetch("/api/push/credentials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: teamId.trim(),
        keyId: keyId.trim(),
        bundleId: bundleId.trim(),
        environment,
        ...(privateKey.trim() === "" ? {} : { privateKey }),
      }),
    });
    if (response.ok) {
      privateKey = "";
      await read();
    } else {
      credentialsError = await response.text();
    }
    saving = false;
  }

  async function test() {
    testing = true;
    credentialsError = null;
    testResult = null;
    const response = await fetch("/api/push/test", { method: "POST" });
    if (response.ok) {
      testResult = (await response.json()) as TestResult;
      await read();
    } else {
      credentialsError = await response.text();
    }
    testing = false;
  }

  async function remove() {
    removing = true;
    credentialsError = null;
    testResult = null;
    const response = await fetch("/api/push/credentials", {
      method: "DELETE",
    });
    if (response.ok) {
      credentials = null;
      teamId = "";
      keyId = "";
    } else {
      credentialsError = await response.text();
    }
    removing = false;
  }

  async function setQuiet(device: Device, quiet: boolean) {
    deviceError = null;
    const response = await fetch(
      `/api/push/devices/${encodeURIComponent(device.token)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quiet }),
      }
    );
    if (response.ok) {
      device.quiet = quiet;
    } else {
      deviceError = await response.text();
    }
  }

  async function forget(device: Device) {
    deviceError = null;
    const response = await fetch(
      `/api/push/devices/${encodeURIComponent(device.token)}`,
      { method: "DELETE" }
    );
    if (response.ok) {
      devices = devices.filter((each) => each.token !== device.token);
    } else {
      deviceError = await response.text();
    }
  }

  /** One line per device the test reached, or the probe's word on the credentials. */
  const testLines = $derived.by((): { tone: "ok" | "bad"; text: string }[] => {
    if (!testResult) {
      return [];
    }
    if (testResult.kind === "probe") {
      return [
        testResult.ok
          ? {
              tone: "ok",
              text: "APNs accepts these credentials. No device is registered yet.",
            }
          : {
              tone: "bad",
              text: `APNs refused the credentials: ${testResult.reason ?? testResult.status}.`,
            },
      ];
    }
    return testResult.outcomes.map((outcome) => {
      if (outcome.status === 200) {
        return { tone: "ok", text: `${outcome.name}: sent.` };
      }
      if (outcome.pruned) {
        return {
          tone: "bad",
          text: `${outcome.name}: no longer registered with APNs. Removed.`,
        };
      }
      return {
        tone: "bad",
        text: `${outcome.name}: ${outcome.reason ?? (outcome.status ? `APNs answered ${outcome.status}` : "APNs not reached")}.`,
      };
    });
  });

  const platformName = (platform: string): string =>
    ({ ios: "iPhone", ipados: "iPad", macos: "Mac" })[platform] ?? platform;

  onMount(() => {
    // biome-ignore lint/complexity/noVoid: the read reports its own outcome in page state
    void read();
  });
</script>

<SectionFrame
  problem={loaded ? null : readError}
  purpose={section.purpose}
  ready={loaded}
  title={section.label}
>
  <form class="group" onsubmit={save}>
    <SectionHeader hue={HUE} icon={IconKey} label="APNs credentials">
      {#snippet right()}
        <Button
          failed={credentialsError !== null}
          label="Save credentials"
          pending={saving}
          pendingLabel="Saving…"
          size="sm"
          type="submit"
        />
      {/snippet}
    </SectionHeader>
    <p class="note">
      An APNs key from the Apple Developer account (Keys, with Apple Push
      Notifications service). The hub keeps the key and signs every push with
      it; it is never shown again. A push names the session or task and nothing
      else; the app reads the rest over your tailnet.
    </p>
    <p
      aria-live="polite"
      class="status num"
      data-tone={credentials ? "ok" : "off"}
    >
      <span aria-hidden="true" class="dot"></span>
      {#if credentials}
        Saved {formatDistanceToNow(new Date(credentials.savedAt))}
      {:else}
        Not set up. Pushes are off.
      {/if}
    </p>
    <div class="fields">
      <Field id="apns-team" label="Team ID">
        <Input
          autocomplete="off"
          class="font-mono"
          id="apns-team"
          placeholder="ABCDE12345"
          spellcheck="false"
          bind:value={teamId}
        />
      </Field>
      <Field id="apns-key-id" label="Key ID">
        <Input
          autocomplete="off"
          class="font-mono"
          id="apns-key-id"
          placeholder="XYZ9876543"
          spellcheck="false"
          bind:value={keyId}
        />
      </Field>
      <Field id="apns-bundle" label="Bundle ID">
        <Input
          autocomplete="off"
          class="font-mono"
          id="apns-bundle"
          spellcheck="false"
          bind:value={bundleId}
        />
      </Field>
      <Field
        hint="For a device that does not say. Each device names its own."
        id="apns-environment"
        label="Environment"
      >
        <NativeSelect
          class="w-full"
          id="apns-environment"
          bind:value={environment}
        >
          <NativeSelectOption value="production"
            >Production (TestFlight, App Store)</NativeSelectOption
          >
          <NativeSelectOption value="sandbox"
            >Sandbox (Xcode builds)</NativeSelectOption
          >
        </NativeSelect>
      </Field>
    </div>
    <Field id="apns-key" label="Private key (.p8)">
      <Textarea
        autocomplete="off"
        class="font-mono"
        id="apns-key"
        placeholder={credentials
          ? "Leave blank to keep the stored key"
          : "-----BEGIN PRIVATE KEY-----"}
        spellcheck="false"
        bind:value={privateKey}
      />
    </Field>
    {#if credentials}
      <div class="actions">
        <Button
          label="Send test push"
          onclick={test}
          pending={testing}
          pendingLabel="Sending…"
          size="sm"
          variant="outline"
        />
        <Button
          label="Remove credentials"
          onclick={remove}
          pending={removing}
          pendingLabel="Removing…"
          size="sm"
          variant="destructive"
        />
      </div>
    {/if}
    {#each testLines as line, index (index)}
      <p class="status num" data-tone={line.tone} transition:unfold>
        <span aria-hidden="true" class="dot"></span>
        {line.text}
      </p>
    {/each}
    {#if credentialsError}
      <p class="problem" role="alert" transition:unfold>{credentialsError}</p>
    {/if}
  </form>

  <div class="group">
    <SectionHeader hue={HUE} icon={IconPhone} label="Devices" />
    {#if devices.length === 0}
      <p class="note">
        Your devices will appear here. Open the CawCo app on your phone and
        allow notifications to register it.
      </p>
    {:else}
      <ul class="devices">
        {#each devices as device (device.token)}
          <li class="device">
            <div class="who">
              <span class="name">{device.name}</span>
              <span class="meta num">
                {platformName(device.platform)}
                · {device.environment} · …{device.token.slice(-6)}
              </span>
              <span
                class="meta num"
                data-tone={device.lastError ? "bad" : "ok"}
              >
                {#if device.lastError}
                  Last push refused: {device.lastError}
                {:else if device.lastSentAt}
                  Last push {formatDistanceToNow(new Date(device.lastSentAt))}
                {:else}
                  Registered
                  {formatDistanceToNow(new Date(device.registeredAt))}
                {/if}
              </span>
            </div>
            <SwitchField
              checked={device.quiet}
              hint={device.quiet ? "Sent nothing." : "Gets what needs you."}
              id={`quiet-${device.token}`}
              label="Quiet"
              onchange={(next) => setQuiet(device, next)}
            />
            <Button
              label="Remove"
              onclick={() => forget(device)}
              size="sm"
              variant="ghost"
            />
          </li>
        {/each}
      </ul>
    {/if}
    {#if deviceError}
      <p class="problem" role="alert" transition:unfold>{deviceError}</p>
    {/if}
  </div>
</SectionFrame>

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .group + .group {
    padding-top: 18px;
    border-top: 1px solid var(--border-hairline);
  }
  .note {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .problem {
    font: var(--type-meta);
    color: var(--status-fail-ink);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .fields {
    display: grid;
    gap: 8px 12px;
  }
  @media (min-width: 640px) {
    .fields {
      grid-template-columns: 1fr 1fr;
    }
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .status {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font: var(--type-body);
    color: var(--ink-muted);
  }
  .status[data-tone="ok"] {
    color: var(--ink-strong);
  }
  .dot {
    width: 7px;
    height: 7px;
    flex: none;
    border-radius: 50%;
    background: var(--ink-muted);
    opacity: 0.5;
    translate: 0 -1px;
  }
  [data-tone="ok"] .dot {
    background: var(--status-live-glyph);
    opacity: 1;
  }
  [data-tone="bad"] .dot {
    background: var(--status-attn-glyph);
    opacity: 1;
  }
  .devices {
    display: flex;
    flex-direction: column;
  }
  .device {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
  }
  .device + .device {
    border-top: 1px solid var(--border-hairline);
  }
  .who {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font: var(--type-body);
    color: var(--ink-strong);
  }
  .meta {
    font: var(--type-meta);
    color: var(--ink-muted);
    overflow-wrap: anywhere;
  }
  .meta[data-tone="bad"] {
    color: var(--status-fail-ink);
  }
  @media (max-width: 639px) {
    .device {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .device > :global(:nth-child(2)) {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
</style>
