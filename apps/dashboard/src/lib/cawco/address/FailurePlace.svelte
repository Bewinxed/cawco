<script lang="ts">
  import { tailnetWords } from "@cawco/core";
  /**
   * CawCo's failure form inside the address card: the failure takes the
   * card's centre with Caw (48px, as the panel's empty block draws him),
   * what happened and why in one ink at the row's body size, the way out
   * (a peer pair side by side at the desk, stacked on a phone), and Show
   * details with its chevron, which unfolds the hub's own lines under it
   * (motion/fold `unfold`) in the figure face. The card's title, meta line
   * and Later stay around it, so the row is still the same row.
   *
   * Signed into another tailnet, Sign in again and Remove stand as every
   * failure's pair does, centred side by side at the desk and the column's
   * width on a phone; Remove is set apart by its destructive edge and ink
   * and a wider gap, and the hint about which account to use stands under
   * the pair, named by Sign in again.
   */
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { NOTE } from "#lib/cawco/journey/journey.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronDown, IconExternal } from "#lib/icons.js";
  import { CENTRED_APART, CENTRED_PEERS } from "./looks";
  import type { AddressAct, AddressFailure } from "./model";
  import { addressPages, failureWords, addressWords as words } from "./words";

  let {
    failure,
    host,
    signIn,
    word = words.word,
    onact,
  }: {
    failure: AddressFailure;
    /** The hub's machine. */
    host: string;
    /** The sign-in link the hub's device holds. */
    signIn: string;
    /** The device's name. */
    word?: string;
    onact?: (act: AddressAct) => void;
  } = $props();

  const said = $derived(failureWords[failure]);
  /** The details stand unfolded. */
  let shown = $state(false);
  const id = $props.id();
  const detailsId = `${id}-details`;
  const hintId = `${id}-hint`;

  /** Remove, asked in place (DESIGN.md, Asking in the page). */
  const asker = new Asker<AskHereRequest>();
  const askRemove = () =>
    asker.ask({
      at: "address-remove",
      title: words.removeTitle(word),
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

{#snippet out(label: string, href: string, act?: AddressAct, hint?: string)}
  <Button
    aria-describedby={hint}
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

<!-- mark-line: Caw stands above the words, not beside them -->
<div
  class="flex min-w-0 flex-col items-center gap-space-3 py-space-3 text-center"
  data-address-failure={failure}
>
  <CawFace size={48} status="needs-you" />
  <div class="flex min-w-0 max-w-c-measure-short flex-col gap-space-1">
    <p
      class="m-0 type-body text-ink-strong text-balance wrap-anywhere"
      role="alert"
    >
      {said.what}
    </p>
    {#if said.why}
      <p class="m-0 type-body text-ink-strong text-balance wrap-anywhere">
        {said.why}
      </p>
    {/if}
  </div>
  {#if failure === "wrong-tailnet"}
    <!-- The pair centred as every failure's way out stands, Sign in
         again first; Remove kept apart by its destructive edge and ink and
         a wider gap; the hint about which account under the pair. -->
    <div class={CENTRED_APART}>
      {@render out(words.signInAgain, signIn, "sign-in-again", hintId)}
      <Button
        aria-expanded={asker.pending?.at === "address-remove"}
        disabled={asker.pending?.at === "address-remove"}
        label={words.remove}
        onclick={askRemove}
        size="sm"
        variant="destructive"
      />
    </div>
    <p class="m-0 {NOTE}" id={hintId}>{words.signInWithHost(host)}</p>
    <div class="min-w-0 self-stretch text-start">
      <AskHere {asker} at="address-remove" />
    </div>
  {:else}
    <div class={CENTRED_PEERS}>
      {#if failure === "link-expired"}
        {@render press(words.getNewLink, "new-link")}
      {:else if failure === "name-taken"}
        {@render out(words.renameOther, addressPages.machines)}
        {@render press(words.useSuffix(`${words.word}-1`), "use-suffix")}
      {:else if failure === "no-answer"}
        {@render out(words.openDnsPage, tailnetWords.dnsPage)}
        {@render press(words.checkAgain, "check-again")}
      {:else}
        {@render out(words.signInAgain, signIn, "sign-in-again")}
      {/if}
    </div>
  {/if}
  <!-- The disclosure: its words and its chevron, which turns as it opens. -->
  <Button
    aria-controls={detailsId}
    aria-expanded={shown}
    class="group"
    data-details
    onclick={() => {
      shown = !shown;
    }}
    size="xs"
    variant="ghost"
  >
    <span>{shown ? words.hideDetails : words.showDetails}</span>
    <IconChevronDown
      aria-hidden="true"
      class="size-icon-sm text-ink-muted group-aria-expanded:rotate-180 motion-safe:transition-[rotate] motion-safe:duration-(--dur-control) motion-safe:ease-out"
      data-icon="inline-end"
    />
  </Button>
  {#if shown}
    <p
      class="m-0 min-w-0 max-w-c-measure-short font-mono type-meta text-pretty whitespace-pre-wrap wrap-anywhere text-ink-muted"
      data-slot="details"
      id={detailsId}
      transition:unfold
    >
      {said.details}
    </p>
  {/if}
</div>
