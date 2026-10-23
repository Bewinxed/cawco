<script lang="ts">
  /**
   * "Open CawCo at cawco", the alternative design (the address design,
   * 2026-10-22, its section 3): one row with no step list, as a domain
   * detail shows a domain. The address as the row's line, its state as a
   * badge in words after the title, and the one next thing. HTTPS and key
   * expiry are not steps: they come later as rows of their own.
   *
   * Five faces, by `view`: `entry`, `pending`, `ready`, `failure`, which is
   * CawCo's failure form in the row's place, its badge after the title, and
   * `expiry`, the second row that comes once it is ready: Keep cawco signed
   * in.
   * A preview: what the person presses leaves as `onact`.
   */
  import { presenceWords } from "@cawco/core";
  import JourneyCard from "#lib/cawco/journey/JourneyCard.svelte";
  import { META } from "#lib/cawco/journey/journey.js";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Badge, type BadgeVariant } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { CopyButton } from "#lib/components/ui/copy-button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconExternal, IconGlobe } from "#lib/icons.js";
  import FailurePlace from "./FailurePlace.svelte";
  import { END_PEERS } from "./looks";
  import type { AddressAct, AddressFailure, AddressNet } from "./model";
  import { addressPages, addressWords as words } from "./words";

  let {
    view = "entry",
    net = "tailscale",
    host,
    http,
    signIn,
    failure = "no-answer",
    onact,
  }: {
    view?: "entry" | "pending" | "ready" | "failure" | "expiry";
    net?: AddressNet;
    host: string;
    /** Where it answers. */
    http: string;
    signIn: string;
    failure?: AddressFailure;
    onact?: (act: AddressAct) => void;
  } = $props();

  /** The failure's badge: signed out for a link or key that ran out, else what it is. */
  const FAILURE_BADGE: Record<AddressFailure, string> = {
    "link-expired": words.signedOut,
    "key-expired": words.signedOut,
    "name-taken": "Name taken",
    "no-answer": words.notAnswering,
    "wrong-tailnet": "Wrong tailnet",
  };

  const badge = $derived.by((): { said: string; tint: BadgeVariant } => {
    switch (view) {
      case "pending":
        return { said: words.joining, tint: "live" };
      case "ready":
        return { said: words.live, tint: "done" };
      case "failure":
        return { said: FAILURE_BADGE[failure], tint: "fail" };
      case "entry":
      case "expiry":
        break;
    }
    return { said: words.notYet, tint: "secondary" };
  });
</script>

{#snippet heading()}
  {words.titleBefore}<code class="font-mono">{words.word}</code>
{/snippet}

<!-- The state after the title, in words: never by its tint alone. -->
{#snippet state()}
  <Badge class="ms-auto flex-none" data-address-state variant={badge.tint}>
    {#if view === "pending"}<Spinner aria-hidden="true" role="none" />{/if}
    <span>{badge.said}</span>
  </Badge>
{/snippet}

{#snippet link(label: string, href: string, act?: AddressAct)}
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

<div class="relative min-w-0" {@attach morph({ followUnfolds: true })}>
  {#key view}
    <div class="min-w-0" in:crossIn out:crossOut>
      {#if view === "expiry"}
        <JourneyCard
          data-address-status={view}
          icon={IconGlobe}
          title={words.expiry(words.word)}
          under="gap-space-2"
        >
          <p class="text-body text-ink-strong text-pretty wrap-anywhere">
            {words.expiryNote(words.word)}
          </p>
          <p class={META} data-address-meta>{words.meta(net, host)}</p>
          <div class={END_PEERS}>
            {@render link(words.openMachines, addressPages.machines)}
            <Button
              label={presenceWords.skip}
              onclick={() => onact?.("skip-expiry")}
              size="sm"
              variant="secondary"
            />
          </div>
        </JourneyCard>
      {:else}
        <JourneyCard
          data-address-status={view}
          done={view === "ready"}
          end={state}
          {heading}
          icon={IconGlobe}
          title={words.title(words.word)}
          under="gap-space-2"
        >
          {#if view === "failure"}
            <FailurePlace {failure} {host} {onact} {signIn} />
          {:else}
            <p class="text-body text-ink-strong text-pretty wrap-anywhere">
              {#if view === "entry"}
                {words.statusLead}
              {:else if view === "pending"}
                {words.statusPending(host)}
              {:else}
                {words.doneLine(http, null)}
              {/if}
            </p>
          {/if}
          <p class={META} data-address-meta>{words.meta(net, host)}</p>
          {#if view === "ready"}
            <!-- Open, the one primary action, on the trailing edge at the
                 desk and first on a phone; Copy beside it. -->
            <div class={END_PEERS}>
              <Button
                href={http}
                icon={IconExternal}
                label={words.openAt(http)}
                rel="noopener"
                size="sm"
                target="_blank"
              />
              <CopyButton
                aria-label={words.copyNamed(http)}
                size="sm"
                text={http}
                variant="secondary">{words.copy}</CopyButton
              >
            </div>
          {:else if view !== "failure"}
            <div class={END_PEERS}>
              {@render link(words.signIn, signIn, "sign-in")}
            </div>
          {/if}
        </JourneyCard>
      {/if}
    </div>
  {/key}
</div>
