<script lang="ts">
  /**
   * A Linear app's client id and secret, with the callback its settings
   * list: the secret in the kit's password field, with show and hide.
   * Connections draws it in its add form (AddConnectionForm) and in a row's
   * Set the app form.
   */
  import { connectionsWords as words } from "@cawco/core/words/connections";
  import Field from "#lib/cawco/config/Field.svelte";
  import { Input } from "#lib/components/ui/input/index.js";
  import * as InputGroup from "#lib/components/ui/input-group/index.js";
  import { IconEye, IconEyeClosed } from "#lib/icons.js";
  import type { AppDraft } from "./connection-form";

  let {
    draft = $bindable(),
    at,
    callbackUrl,
  }: {
    draft: AppDraft;
    /** The fields' ids' stem. */
    at: string;
    /** The hub's OAuth callback, which the app's settings list. */
    callbackUrl: string;
  } = $props();

  let revealed = $state(false);
  const secretId = $derived(`${at}-client-secret`);
</script>

<p
  data-slot="callback"
  class="flex min-w-0 max-w-c-measure flex-col gap-space-1 type-meta text-ink-muted"
>
  <span>{words.callbackLine}</span>
  <code class="min-w-0 font-mono wrap-anywhere text-ink-strong select-all"
    >{callbackUrl}</code
  >
</p>
<Field hint={words.clientIdHint} id="{at}-client-id" label={words.clientId}>
  <Input
    autocomplete="off"
    id="{at}-client-id"
    required
    spellcheck="false"
    bind:value={draft.clientId}
  />
</Field>
<Field hint={words.clientSecretHint} id={secretId} label={words.clientSecret}>
  <InputGroup.Root>
    <InputGroup.Input
      autocomplete="off"
      id={secretId}
      required
      spellcheck="false"
      type={revealed ? "text" : "password"}
      bind:value={draft.clientSecret}
    />
    <InputGroup.Addon align="inline-end">
      <InputGroup.Button
        aria-label={revealed
          ? words.hideSecret(words.clientSecret.toLowerCase())
          : words.showSecret(words.clientSecret.toLowerCase())}
        aria-pressed={revealed}
        onclick={() => {
          revealed = !revealed;
        }}
        size="icon-xs"
      >
        {#if revealed}
          <IconEyeClosed />
        {:else}
          <IconEye />
        {/if}
      </InputGroup.Button>
    </InputGroup.Addon>
  </InputGroup.Root>
</Field>
