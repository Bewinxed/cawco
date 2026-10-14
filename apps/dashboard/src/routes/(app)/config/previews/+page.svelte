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
    mode = answer.mode;
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
  <div class="group">
    <p class="note">
      A previewed app runs on an origin of its own, so it never shares the
      dashboard's storage or sign-ins. Every open preview moves to the new
      address once this is saved.
    </p>
    <Field
      hint={mode === "port"
        ? `Each session's previews take a port of ${settings?.ports ?? "the hub's range"} on the host you reach the dashboard by. Nothing to set up; the ports have to be reachable from your browser.`
        : `Each session's previews get a host name of their own. Point those names at the hub's first preview port (${settings?.ports.split("–")[0] ?? ""}), through DNS or your proxy.`}
      id="preview-mode"
      label="Reach previews by"
      problem={mode === "port" ? refused : undefined}
    >
      <NativeSelect
        class="w-full max-w-sm"
        id="preview-mode"
        onchange={(event) => {
          mode = (event.currentTarget as HTMLSelectElement).value as
            | "port"
            | "host";
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
        hint={"{session} stands for the session's id, e.g. p-{session}.example.com. The hub checks one name resolves before it keeps the pattern."}
        id="preview-pattern"
        label="Host pattern"
        problem={refused}
      >
        <Input
          autocomplete="off"
          class="w-full max-w-sm"
          id="preview-pattern"
          placeholder={"p-{session}.example.com"}
          spellcheck={false}
          bind:value={pattern}
        />
      </Field>
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
</style>
