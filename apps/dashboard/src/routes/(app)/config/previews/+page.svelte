<script lang="ts">
  /**
   * Previews: how every session's preview is reached, fleet-wide (hub
   * preview.ts). Each preview is an origin of its own, never the
   * dashboard's: by default a port of the hub's range, which needs nothing
   * set up; or a host name per session, for a fleet whose DNS or proxy
   * sends those names to the hub. The hub tries a host pattern before it
   * keeps it, and says why when it doesn't.
   */
  import type { PreviewSettings } from "@cawco/core";
  import { onMount } from "svelte";
  import Field from "#lib/cawco/config/Field.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";

  const section = sectionOf("previews");

  let settings = $state<PreviewSettings | null>(null);
  let mode = $state<"port" | "host">("port");
  let pattern = $state("");
  let problem = $state<string | null>(null);
  let refused = $state<string | undefined>(undefined);
  let saving = $state(false);

  const read = (answer: PreviewSettings) => {
    settings = answer;
    ({ mode } = answer);
    pattern = answer.mode === "host" ? answer.pattern : "";
  };

  onMount(() => {
    fetch("/api/preview-settings")
      .then(async (answer) => {
        if (!answer.ok) {
          throw new Error((await answer.text()) || `HTTP ${answer.status}`);
        }
        read((await answer.json()) as PreviewSettings);
      })
      .catch((error: unknown) => {
        problem = `Could not read how previews are reached — ${error instanceof Error ? error.message : String(error)}.`;
      });
  });

  /** The range's first port: where host mode's names have to reach. */
  const firstPort = $derived(settings?.ports.split("–")[0] ?? "");
  const lastPort = $derived(settings?.ports.split("–")[1] ?? "");
  /** The pattern names sessions by their kept port: a fixed name per port, not a wildcard. */
  const byPort = $derived(pattern.includes("{port}"));

  const changed = $derived(
    !!settings &&
      (mode !== settings.mode ||
        (mode === "host" &&
          pattern.trim() !==
            (settings.mode === "host" ? settings.pattern : "")))
  );

  async function save() {
    saving = true;
    refused = undefined;
    try {
      const answer = await fetch("/api/preview-settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          mode === "host" ? { mode, pattern: pattern.trim() } : { mode }
        ),
      });
      if (!answer.ok) {
        refused = (await answer.text()) || `HTTP ${answer.status}`;
        return;
      }
      read((await answer.json()) as PreviewSettings);
    } catch (error) {
      refused = error instanceof Error ? error.message : String(error);
    } finally {
      saving = false;
    }
  }
</script>

<SectionFrame
  problem={settings === null ? problem : null}
  purpose={section.purpose}
  ready={settings !== null}
  title={section.label}
>
  <!-- literal: 72ch -->
  <!-- literal: 8px -->
  <div
    data-slot="group"
    class="flex flex-col gap-(--group-gap)"
    style:--group-gap="8px"
    style:--note-measure="72ch"
  >
    <p data-slot="note" class="type-meta max-w-(--note-measure) text-ink-muted">
      A previewed app runs on an origin of its own, so it never shares the
      dashboard's storage or sign-ins. Every open preview moves to the new
      address once this is saved.
    </p>
    <Field
      hint={mode === "port"
        ? `Each session's previews take a port of ${settings?.ports ?? "the hub's range"} on the host you reach the dashboard by. Nothing to set up; the ports have to be reachable from your browser.`
        : `Each session's previews get a host name of their own. Point those names at the hub's first preview port (${firstPort}), through DNS or your proxy. They open on those names when you reach the dashboard under the pattern's domain, example.com for p-{port}.example.com. At any other address, like a tailnet name, a LAN address or localhost, they open on each session's port of ${settings?.ports ?? "the hub's range"}, as with a port per session.`}
      id="preview-mode"
      label="Reach previews by"
      problem={mode === "port" ? refused : undefined}
    >
      <NativeSelect
        class="w-full"
        id="preview-mode"
        measure="cap-md"
        onchange={(event) => {
          mode = (event.currentTarget as HTMLSelectElement).value as
            "port" | "host";
          refused = undefined;
        }}
        value={mode}
      >
        <NativeSelectOption value="port">A port per session</NativeSelectOption>
        <NativeSelectOption value="host"
          >A host name per session</NativeSelectOption
        >
      </NativeSelect>
    </Field>
    {#if mode === "host"}
      <Field
        hint={"Start with the scheme the names are served on, https:// or http://: previews open on it whichever way you reach the hub. Then use one of {session} or {port}. {session} stands for the session's id, e.g. https://p-{session}.example.com, and needs a wildcard name. {port} stands for the preview port the session keeps, e.g. https://p-{port}.example.com, so one name per port of the range serves every session. The hub checks one name resolves before it keeps the pattern."}
        id="preview-pattern"
        label="Host pattern"
        problem={refused}
      >
        <Input
          autocomplete="off"
          class="w-full"
          id="preview-pattern"
          measure="cap-md"
          placeholder={"https://p-{port}.example.com"}
          spellcheck={false}
          bind:value={pattern}
        />
      </Field>
      <!-- What the names need before Save, where the operator sets them. -->
      <div class="flex flex-col gap-space-2">
        <p class="type-label text-ink-strong">Before you save</p>
        <p
          data-slot="note"
          class="type-meta max-w-(--note-measure) text-ink-muted"
        >
          Every name the pattern makes has to reach the hub's port {firstPort}.
          Behind Cloudflare, with the dashboard on a tunnel already:
        </p>
        <ol
          data-slot="note"
          class="type-meta flex max-w-(--note-measure) flex-col gap-space-1 ps-space-5 text-ink-muted list-decimal"
        >
          {#if byPort}
            <li>
              In DNS, add a proxied CNAME record for each port of the range,
              <code class="font-mono text-ink-strong">p-{firstPort}</code>
              to <code class="font-mono text-ink-strong">p-{lastPort}</code>,
              whose target is your tunnel,
              <code class="font-mono text-ink-strong"
                >&lt;tunnel-id&gt;.cfargotunnel.com</code
              >. No wildcard is needed, so one you already use elsewhere stays
              as it is.
            </li>
            <li>
              In Networking › Tunnels › your tunnel › Routes, add a published
              application for each of those names, service
              <code class="font-mono text-ink-strong"
                >http://localhost:{firstPort}</code
              >
              on the hub's machine.
            </li>
            <li>
              Set the pattern to <code class="font-mono text-ink-strong"
                >https://p-{"{port}"}.example.com</code
              >
              and save.
            </li>
          {:else}
            <li>
              In DNS, add a proxied CNAME record named <code
                class="font-mono text-ink-strong">*</code
              >
              whose target is your tunnel,
              <code class="font-mono text-ink-strong"
                >&lt;tunnel-id&gt;.cfargotunnel.com</code
              >. Records you already have keep their own targets.
            </li>
            <li>
              In Networking › Tunnels › your tunnel › Routes, add a published
              application: hostname <code class="font-mono text-ink-strong"
                >*.example.com</code
              >, service
              <code class="font-mono text-ink-strong"
                >http://localhost:{firstPort}</code
              >
              on the hub's machine.
            </li>
            <li>
              Set the pattern to
              <code class="font-mono text-ink-strong"
                >https://p-{"{session}"}.example.com</code
              >
              and save. Keep {"{session}"} in the first label: Cloudflare's free certificate
              covers one level of subdomain, not
              <code class="font-mono text-ink-strong"
                >*.previews.example.com</code
              >.
            </li>
          {/if}
        </ol>
        <p
          data-slot="note"
          class="type-meta max-w-(--note-measure) text-ink-muted"
        >
          Leave these names out of Cloudflare Access, or any sign-in in front of
          them. The hub locks them itself: a name opens only for the dashboard
          and the app, which ask the hub for a pass, and answers anyone else
          with 401.
        </p>
        <p
          data-slot="note"
          class="type-meta max-w-(--note-measure) text-ink-muted"
        >
          Without Cloudflare: point the pattern's names ({byPort
            ? "one per port"
            : "a wildcard"}) at the hub, or at a proxy that sends them to port
          {firstPort}, then save. Over plain http, a dashboard frame keeps the
          pass only on localhost names or when the dashboard is on the same
          site, so serve the names over https.
        </p>
      </div>
    {/if}
    <div>
      <Button
        disabled={!changed || saving}
        label="Save"
        onclick={save}
        pending={saving}
        pendingLabel="Saving…"
        size="sm"
      />
    </div>
  </div>
</SectionFrame>
