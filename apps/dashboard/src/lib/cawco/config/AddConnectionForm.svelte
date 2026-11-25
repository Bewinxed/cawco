<script lang="ts">
  /**
   * The form that signs the hub in to a service (Connections' Sign in to):
   * how it signs in where the service has more than one way, its server
   * where the service is self-hosted, the account's words, and the way's
   * secret (a key, a Linear app, a GitHub App's organization), or a
   * machine's gh accounts (`gh`, its host's). Props in, events out: what a
   * submit makes is its host's (ConnectionsSection, a project's large-file
   * key).
   */
  import { connectionsWords as words } from "@cawco/core/words/connections";
  import type { Snippet } from "svelte";
  import Choice from "#lib/cawco/config/Choice.svelte";
  import Field from "#lib/cawco/config/Field.svelte";
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { unfold } from "#lib/platform/motion/fold.svelte.js";
  import { cn } from "#lib/utils.js";
  import AppFields from "./AppFields.svelte";
  import type { AppDraft, Service, Way } from "./connection-form";

  let {
    service,
    way,
    onway,
    account = $bindable(),
    address = $bindable(),
    organization = $bindable(),
    key = $bindable(),
    app = $bindable(),
    addressProblem = $bindable(),
    problem,
    pending,
    secretAskedAgain,
    callbackUrl,
    gh,
    onsubmit,
    oncancel,
    class: className,
  }: {
    service: Service;
    /** The way it signs in, of the service's. */
    way: Way | null;
    onway: (label: string) => void;
    account: string;
    address: string;
    organization: string;
    key: string;
    app: AppDraft;
    /** The server address's fault, said under its field. */
    addressProblem: string | null;
    /** Why the last submit was refused. */
    problem: string | null;
    pending: boolean;
    /** A secret typed before a reload, which the page does not keep. */
    secretAskedAgain: boolean;
    callbackUrl: string;
    /** A machine's gh accounts, for the way that reads them. */
    gh?: Snippet;
    onsubmit: (event: SubmitEvent) => void;
    oncancel: () => void;
    class?: string;
  } = $props();

  /** A field that opens on a press takes the next keystroke. */
  const focusOnOpen = (node: HTMLElement) => {
    node.focus({ preventScroll: true });
  };
</script>

<form
  data-slot="add"
  aria-label={words.signInService(service.label)}
  class={cn(
    "mb-space-4 flex max-w-measure flex-col gap-space-3 rounded-sm border border-ui bg-bg p-space-3 shadow-sm",
    className
  )}
  {onsubmit}
  transition:unfold
>
  <p class="flex items-center gap-space-2 mark-line text-tx type-label">
    <ProviderLogo class="flex-none" provider={service.service} />
    <span>{words.signInService(service.label)}</span>
  </p>
  {#if service.ways.length > 1}
    <div data-slot="way" class="flex min-w-0 flex-col gap-space-1">
      <p class="text-tx-2 type-meta">{words.signsInWith}</p>
      <Choice
        label={words.signsInWith}
        onchange={onway}
        options={service.ways.map((each) => ({
          value: each.label,
          label: each.label,
        }))}
        value={way?.label ?? ""}
      />
      {#if way}
        <p class="max-w-measure text-pretty text-tx-2 type-meta" data-way-says>
          {way.says}
        </p>
      {/if}
    </div>
  {/if}
  {#if way?.auth === "gh"}
    {@render gh?.()}
  {:else}
    {#if service.serverExample}
      <Field
        id="connection-server"
        label={words.serverAddress}
        problem={addressProblem ?? undefined}
      >
        <Input
          autocomplete="off"
          id="connection-server"
          inputmode="url"
          oninput={() => {
            addressProblem = null;
          }}
          oninvalid={(event: Event) => {
            // Said under the field, never as the browser's bubble.
            event.preventDefault();
            addressProblem = words.serverAddressProblem;
          }}
          placeholder={service.serverExample}
          spellcheck="false"
          type="url"
          bind:value={address}
        />
      </Field>
    {/if}
    <Field
      hint={words.accountHint}
      id="connection-account"
      label={words.account(service.label)}
    >
      <Input
        autocomplete="off"
        id="connection-account"
        placeholder={words.accountPlaceholder}
        required
        {@attach focusOnOpen}
        bind:value={account}
      />
    </Field>
  {/if}
  {#if way?.auth === "bearer"}
    <Field hint={way.key} id="connection-key" label={words.key(service.label)}>
      <Input
        autocomplete="off"
        id="connection-key"
        required
        type="password"
        bind:value={key}
      />
    </Field>
  {:else if way?.auth === "app" && service.service === "github"}
    <Field
      hint={words.appOrganizationHint}
      id="connection-organization"
      label={words.appOrganization}
    >
      <Input
        autocomplete="off"
        id="connection-organization"
        spellcheck="false"
        bind:value={organization}
      />
    </Field>
  {:else if way?.auth === "app"}
    <AppFields at="connection" {callbackUrl} bind:draft={app} />
  {/if}
  {#if secretAskedAgain && way && (way.auth === "bearer" || (way.auth === "app" && service.service !== "github"))}
    <p
      data-slot="secret-again"
      class="max-w-measure text-pretty text-tx-2 type-meta"
      transition:unfold
    >
      {words.secretNotKept}
    </p>
  {/if}
  {#if problem}
    <p
      data-slot="add-problem"
      class="wrap-anywhere text-red type-meta"
      role="alert"
      transition:unfold
    >
      {problem}
    </p>
  {/if}
  <div class="flex justify-end gap-space-2">
    <Button
      disabled={pending}
      label={words.cancel}
      onclick={oncancel}
      size="sm"
      variant="ghost"
    />
    {#if way?.auth !== "gh"}
      <Button
        label={words.signIn}
        {pending}
        pendingLabel={words.signingIn}
        size="sm"
        type="submit"
      />
    {/if}
  </div>
</form>
