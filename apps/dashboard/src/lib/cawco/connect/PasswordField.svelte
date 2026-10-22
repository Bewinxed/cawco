<script lang="ts">
  /**
   * The machine's password for its one sign-in: the kit's input group,
   * masked, with Show password inside it at its end, which flips it to
   * plain text and back (its name and `aria-pressed` with it). A password
   * manager may fill it (`current-password`); nothing corrects or
   * capitalises it. It lives in this page alone (connect.password): never
   * kept by the hub, gone with a reload, which its placeholder then says.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { IconEye, IconEyeClosed } from "#lib/icons.js";
  import { connect } from "./installs.svelte";

  let {
    id,
    label,
    placeholder,
    onenter,
  }: {
    id: string;
    /** Its accessible name: what the sign-in is for. */
    label: string;
    placeholder: string;
    onenter?: () => void;
  } = $props();

  let shown = $state(false);
</script>

<InputGroup.Root>
  <InputGroup.Input
    {id}
    aria-label={label}
    autocapitalize="off"
    autocomplete="current-password"
    {placeholder}
    spellcheck="false"
    type={shown ? "text" : "password"}
    bind:value={connect.password}
    onkeydown={(event) => {
      if (event.key === "Enter") {
        onenter?.();
      }
    }}
  />
  <InputGroup.Addon align="inline-end">
    <InputGroup.Button
      aria-controls={id}
      aria-label={shown ? "Hide password" : "Show password"}
      aria-pressed={shown}
      onclick={() => {
        shown = !shown;
      }}
      size="icon-xs"
    >
      {#if shown}
        <IconEyeClosed aria-hidden="true" />
      {:else}
        <IconEye aria-hidden="true" />
      {/if}
    </InputGroup.Button>
  </InputGroup.Addon>
</InputGroup.Root>
