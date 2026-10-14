<script lang="ts">
  import { onMount } from "svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SwitchField from "#lib/cawco/config/SwitchField.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { IconPhone } from "#lib/icons.js";
  import { formatDistanceToNow } from "#lib/utils/time.js";

  /**
   * Pushes to the iOS app (push.ts in the hub). Devices register themselves
   * from the app; here each can be made quiet or removed, and sent a test.
   */
  const section = sectionOf("phone");
  const HUE = section.hue;

  interface Device {
    id: string;
    lastError: string | null;
    lastSentAt: number | null;
    name: string;
    platform: string;
    quiet: boolean;
    registeredAt: number;
  }
  interface Outcome {
    name: string;
    pruned: boolean;
    reason: string | null;
    status: number;
  }

  let devices = $state<Device[]>([]);
  let loaded = $state(false);
  let readError = $state<string | null>(null);

  let testing = $state(false);
  let outcomes = $state<Outcome[]>([]);
  let deviceError = $state<string | null>(null);

  async function read() {
    try {
      const response = await fetch("/api/push");
      if (!response.ok) {
        throw new Error(`the hub answered ${response.status}`);
      }
      ({ devices } = (await response.json()) as { devices: Device[] });
      loaded = true;
    } catch (error) {
      readError = `Could not read the push settings — ${error instanceof Error ? error.message : String(error)}.`;
    }
  }

  async function test() {
    testing = true;
    deviceError = null;
    outcomes = [];
    const response = await fetch("/api/push/test", { method: "POST" });
    if (response.ok) {
      ({ outcomes } = (await response.json()) as { outcomes: Outcome[] });
      await read();
    } else {
      deviceError = await response.text();
    }
    testing = false;
  }

  async function setQuiet(device: Device, quiet: boolean) {
    deviceError = null;
    const response = await fetch(
      `/api/push/devices/${encodeURIComponent(device.id)}`,
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
      `/api/push/devices/${encodeURIComponent(device.id)}`,
      { method: "DELETE" }
    );
    if (response.ok) {
      devices = devices.filter((each) => each.id !== device.id);
    } else {
      deviceError = await response.text();
    }
  }

  /** One line per device the test reached. */
  const testLines = $derived(
    outcomes.map((outcome): { tone: "ok" | "bad"; text: string } => {
      if (outcome.status === 200) {
        return { tone: "ok", text: `${outcome.name}: sent.` };
      }
      if (outcome.pruned) {
        return {
          tone: "bad",
          text: `${outcome.name}: no longer registered. Removed until the app opens again.`,
        };
      }
      return {
        tone: "bad",
        text: `${outcome.name}: ${outcome.reason ?? (outcome.status ? `Cawrier answered ${outcome.status}` : "Cawrier not reached")}.`,
      };
    })
  );

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
  <div class="group">
    <SectionHeader hue={HUE} icon={IconPhone} label="Devices">
      {#snippet right()}
        <Button
          label="Send test push"
          onclick={test}
          pending={testing}
          pendingLabel="Sending…"
          size="sm"
          variant="outline"
        />
      {/snippet}
    </SectionHeader>
    <p class="note">
      A push names the session or task and nothing else; the app reads the rest
      over your tailnet.
    </p>
    {#each testLines as line, index (index)}
      <p class="status num" data-tone={line.tone} transition:unfold>
        <span aria-hidden="true" class="dot"></span>
        {line.text}
      </p>
    {/each}
    {#if devices.length === 0}
      <p class="note">
        Your devices will appear here. Open the CawCo app on your phone and
        allow notifications to register it.
      </p>
    {:else}
      <ul class="devices">
        {#each devices as device (device.id)}
          <li class="device">
            <div class="who">
              <span class="name">{device.name}</span>
              <span class="meta num">{platformName(device.platform)}</span>
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
              id={`quiet-${device.id}`}
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
