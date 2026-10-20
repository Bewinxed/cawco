<script lang="ts">
  import { onMount } from "svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import SwitchField from "#lib/cawco/config/SwitchField.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { failureClause, hubRefusal } from "#lib/cawco/hub-read.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
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
      readError = `Could not read the push settings — ${failureClause(error)}.`;
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
      deviceError = (await hubRefusal(response)).message;
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
      deviceError = (await hubRefusal(response)).message;
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
      deviceError = (await hubRefusal(response)).message;
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
  <div data-slot="group" class="flex flex-col gap-space-2">
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
    <p data-slot="note" class="type-meta max-w-c-measure text-ink-muted">
      A push names the session or task and nothing else; the app reads the rest
      over your tailnet.
    </p>
    {#each testLines as line, index (index)}
      <p
        data-slot="num"
        class="num mark-line group type-body flex items-center gap-space-2 text-ink-muted tone-ok:text-ink-strong"
        data-tone={line.tone}
        transition:unfold
      >
        <span
          data-slot="dot"
          aria-hidden="true"
          class="size-space-2 flex-none rounded-pill bg-ink-muted opacity-50 group-tone-bad:bg-status-attn-glyph group-tone-bad:opacity-100 group-tone-ok:bg-status-done-glyph group-tone-ok:opacity-100"
          data-box
        ></span>
        <span>{line.text}</span>
      </p>
    {/each}
    {#if devices.length === 0}
      <!-- Where Caw can't start it, the way by hand (DESIGN.md, The Empty
           Starts Work Rule): the app pairs as a device, approved in
           Devices, then registers here once notifications are allowed. -->
      <EmptyState
        icon={IconPhone}
        line="Open the CawCo app on your phone, approve its code in Devices, and allow notifications to register it."
        title="No phones yet"
      >
        {#snippet action()}
          <Button
            href="/config/devices"
            icon={sectionOf("devices").icon}
            label="Open Devices"
            variant="outline"
          />
        {/snippet}
      </EmptyState>
    {:else}
      <ul class="flex flex-col">
        {#each devices as device (device.id)}
          <!-- minmax(0, 1fr) auto auto, and minmax(0, 1fr) auto on a phone (the row's tracks) -->
          <li
            data-slot="device"
            class="grid grid-cols-(--device-cols) items-center gap-space-3 not-first:border-t not-first:border-t-border-hairline py-space-3 max-phone:grid-cols-(--device-cols-phone)"
            style:--device-cols="minmax(0, 1fr) auto auto"
            style:--device-cols-phone="minmax(0, 1fr) auto"
          >
            <div data-slot="who" class="flex min-w-0 flex-col">
              <span data-slot="name" class="type-body text-ink-strong"
                >{device.name}</span
              >
              <span
                data-num
                data-slot="meta"
                class="num type-meta wrap-anywhere text-ink-muted"
                >{platformName(device.platform)}</span
              >
              <span
                data-num
                data-slot="meta"
                class="num type-meta wrap-anywhere text-ink-muted tone-bad:text-status-fail-ink"
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
              class="max-phone:col-start-2 max-phone:row-span-2 max-phone:row-start-1"
              size="sm"
              variant="ghost"
            />
          </li>
        {/each}
      </ul>
    {/if}
    {#if deviceError}
      <p
        class="type-meta wrap-anywhere whitespace-pre-wrap text-status-fail-ink"
        role="alert"
        transition:unfold
      >
        {deviceError}
      </p>
    {/if}
  </div>
</SectionFrame>
