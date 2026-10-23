<script lang="ts">
  import { tailnetWords } from "@cawco/core";
  /**
   * CawCo's failure form inside the address card: Caw on the words' start
   * edge, what happened in the strong ink and why in the muted one, at the
   * row's body size (the empty block's title role, 20px, outweighed the
   * row's own 13px title in Caw's panel), then the way out (a peer pair
   * where there are two) and Show details, which unfolds the hub's own
   * lines under it (motion/fold `unfold`) in the figure face. One start
   * edge for all of it, never centred line by line (DESIGN.md, Empty). The
   * card's title, meta line and Later stay around it, so the row is still
   * the same row.
   */
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { CONTROLS, NOTE } from "#lib/cawco/journey/journey.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconExternal } from "#lib/icons.js";
  import type { AddressAct, AddressFailure } from "./model";
  import { addressPages, failureWords, addressWords as words } from "./words";

  let {
    failure,
    host,
    signIn,
    onact,
  }: {
    failure: AddressFailure;
    /** The hub's machine. */
    host: string;
    /** The sign-in link the hub's device holds. */
    signIn: string;
    onact?: (act: AddressAct) => void;
  } = $props();

  const said = $derived(failureWords[failure]);
  /** The details stand unfolded. */
  let shown = $state(false);
  const detailsId = $props.id();

  /** Remove, asked in place (DESIGN.md, Asking in the page). */
  const asker = new Asker<AskHereRequest>();
  const askRemove = () =>
    asker.ask({
      at: "address-remove",
      title: words.removeTitle,
      body: words.removeBody,
      confirmLabel: words.remove,
      pendingLabel: "Removing…",
      destructive: true,
      run: () => {
        onact?.("remove");
        return Promise.resolve();
      },
    });
</script>

{#snippet out(label: string, href: string, act?: AddressAct)}
  <Button
    {href}
    icon={IconExternal}
    {label}
    onclick={() => act && onact?.(act)}
    rel="noopener"
    size="sm"
    target="_blank"
    variant="secondary"
  />
{/snippet}

{#snippet press(label: string, act: AddressAct)}
  <Button {label} onclick={() => onact?.(act)} size="sm" variant="secondary" />
{/snippet}

<div
  class="flex min-w-0 flex-col items-start gap-space-2 py-space-2"
  data-address-failure={failure}
>
  <CawFace size={36} status="needs-you" />
  <div class="flex min-w-0 flex-col gap-space-1 self-stretch">
    <p
      class="m-0 type-body text-ink-strong text-pretty wrap-anywhere"
      role="alert"
    >
      {said.what}
    </p>
    {#if said.why}
      <p class="m-0 type-body text-ink-muted text-pretty wrap-anywhere">
        {said.why}
      </p>
    {/if}
  </div>
  <div class="flex min-w-0 flex-col gap-space-2 self-stretch">
    <div class={CONTROLS}>
      {#if failure === "link-expired"}
        {@render press(words.getNewLink, "new-link")}
      {:else if failure === "name-taken"}
        {@render out(words.renameOther, addressPages.machines)}
        {@render press(words.useSuffix("cawco-1"), "use-suffix")}
      {:else if failure === "no-answer"}
        {@render out(words.openDnsPage, tailnetWords.dnsPage)}
        {@render press(words.checkAgain, "check-again")}
      {:else if failure === "key-expired"}
        {@render out(words.signInAgain, signIn, "sign-in-again")}
      {:else}
        {@render out(words.signInAgain, signIn, "sign-in-again")}
        <Button
          aria-expanded={asker.pending?.at === "address-remove"}
          disabled={asker.pending?.at === "address-remove"}
          label={words.remove}
          onclick={askRemove}
          size="sm"
          variant="destructive"
        />
      {/if}
    </div>
    {#if failure === "wrong-tailnet"}
      <p class={NOTE}>{words.signInWithHost(host)}</p>
      <AskHere {asker} at="address-remove" />
    {/if}
    <div class="flex">
      <!-- A ghost's ink starts inside its box: it hangs back by its edge
           and padding so its first letter stands on the words' edge. -->
      <Button
        aria-controls={detailsId}
        aria-expanded={shown}
        class="-ms-space-2"
        data-details
        label={shown ? words.hideDetails : words.showDetails}
        onclick={() => {
          shown = !shown;
        }}
        size="xs"
        variant="ghost"
      />
    </div>
    {#if shown}
      <p
        class="m-0 min-w-0 font-mono type-meta whitespace-pre-wrap wrap-anywhere text-ink-muted"
        data-slot="details"
        id={detailsId}
        transition:unfold
      >
        {said.details}
      </p>
    {/if}
  </div>
</div>
