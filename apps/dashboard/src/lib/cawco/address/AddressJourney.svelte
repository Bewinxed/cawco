<script lang="ts" module>
  /** An address's scheme, which a typed address leaves off. */
  const SCHEME = /^https?:\/\//;
</script>

<script lang="ts">
  /**
   * "Open CawCo at cawco", the recommended design (the address design,
   * 2026-10-22): one journey card in RelayJourney's shape, the same card in
   * Needs you (`row`: its meta line and Later) and in Settings. Only the
   * sign-in stops on the person; every other step ticks from the hub's own
   * checks, and the two optional ones stand with Skip as a peer of their
   * link (The Peer Rule). Once the address answers, it stands above the
   * steps with Copy and Open, so the person has what they came for before
   * the optional work.
   *
   * Seven faces, by `view`: `journey`, the step list; `failure`, CawCo's
   * failure form in the list's place; `done`, Needs you's ticked row;
   * `lapsing`, the row before the key runs out; `summary`, Settings once it
   * is done; `none`, Settings with no private network on the machine;
   * `no-word`, Settings on a network that gives no word without a port.
   *
   * It is drawn live as the hub's ticks land: the marks swap in their
   * cells, the open step's note and controls unfold, the address line
   * unfolds in, and the card tweens to its new height (motion/morph).
   *
   * A preview: nothing here talks to a hub; what the person presses leaves
   * as `onact`.
   */
  import { presenceWords, tailnetWords } from "@cawco/core";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
  import Field from "#lib/cawco/config/Field.svelte";
  import JourneyCard from "#lib/cawco/journey/JourneyCard.svelte";
  import JourneyCopy from "#lib/cawco/journey/JourneyCopy.svelte";
  import JourneyStep from "#lib/cawco/journey/JourneyStep.svelte";
  import JourneySummary from "#lib/cawco/journey/JourneySummary.svelte";
  import {
    CONTROLS,
    type JourneyMark as Mark,
    META,
    NOTE,
  } from "#lib/cawco/journey/journey.js";
  import { crossIn, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import type { BadgeVariant } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { CopyButton } from "#lib/components/ui/copy-button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconExternal, IconGlobe } from "#lib/icons.js";
  import FailurePlace from "./FailurePlace.svelte";
  import type {
    AddressAct,
    AddressFailure,
    AddressNet,
    AddressPlace,
    AddressStep,
    AddressSummary,
    NoWordNet,
  } from "./model";
  import { addressPages, addressWords as words } from "./words";

  let {
    view = "journey",
    row = false,
    net = "tailscale",
    host,
    steps = [],
    place,
    signIn,
    server = "",
    failure = "link-expired",
    noWord = "zerotier",
    days = 12,
    summary = null,
    onact,
  }: {
    view?:
      | "journey"
      | "failure"
      | "done"
      | "lapsing"
      | "summary"
      | "none"
      | "no-word";
    /** Drawn as Needs you's row: its meta line and Later. */
    row?: boolean;
    net?: AddressNet;
    /** The hub's machine. */
    host: string;
    steps?: AddressStep[];
    /** Where it answers. */
    place: AddressPlace;
    /** The sign-in link the hub's device holds, fetched when the row was raised. */
    signIn: string;
    /** Headscale's server, read from the machine's Tailscale prefs. */
    server?: string;
    failure?: AddressFailure;
    noWord?: NoWordNet;
    /** Days until the key runs out, for `lapsing`. */
    days?: number;
    summary?: AddressSummary | null;
    onact?: (act: AddressAct) => void;
  } = $props();

  /** How a step's mark reads. */
  function markOf(step: AddressStep): Mark {
    switch (step.state) {
      case "done":
      case "skipped":
        return "done";
      case "approval":
      case "checking":
        return "working";
      case "needs":
        return "standing";
      case "waiting":
        break;
    }
    // The sign-in, pressed, waits on Tailscale: work at the hub's end.
    return step.step === "sign-in" ? "working" : "waiting";
  }

  /** The one step whose note and controls are shown: the first that stands on the person, else the first at work. */
  const open = $derived.by(() => {
    const asking = steps.findIndex((step) => markOf(step) === "standing");
    return asking === -1
      ? steps.findIndex((step) => markOf(step) === "working")
      : asking;
  });

  /** The first step, before anyone pressed it: the lead says why. */
  const lead = $derived(
    steps[0]?.state === "needs" &&
      (steps[0].step === "sign-in" || steps[0].step === "setup-key")
  );
  /** The address answers: it stands above the steps with Copy and Open. */
  const answered = $derived(
    steps.some((step) => step.step === "answers" && step.state === "done")
  );
  /** An address as it is typed: no scheme. */
  const bare = (address: string) => address.replace(SCHEME, "");
  /** The address the box holds: the https one once certificates are on. */
  const shownAddress = $derived(place.https ?? place.http);

  const said: Record<Mark, string> = {
    done: tailnetWords.stepDone,
    failed: "Failed:",
    working: "In progress:",
    standing: "",
    waiting: "",
  };

  function labelOf(step: AddressStep): string {
    const done = markOf(step) === "done";
    switch (step.step) {
      case "sign-in":
        return step.state === "done" ? words.signInDone : words.signIn;
      case "setup-key":
        return step.state === "done" ? words.signInDone : words.setupKey;
      case "headscale":
        return step.state === "done" ? words.signInDone : words.headscaleSignIn;
      case "answers":
        return done ? words.answersDone(place.http) : words.answers(place.http);
      case "https":
        if (step.state === "skipped") {
          return words.httpsSkipped;
        }
        if (done) {
          return words.httpsDone(place.https ?? "");
        }
        return step.magicDns
          ? tailnetWords.stepMagicDns
          : tailnetWords.stepHttps;
      case "expiry":
        break;
    }
    if (step.state === "skipped") {
      return words.expirySkipped;
    }
    return done ? words.expiryDone : words.expiry;
  }

  /** The setup key typed. */
  let key = $state("");

  /** The summary's badge: its state in words, and its tint. */
  const badge = $derived.by((): { said: string; tint: BadgeVariant } => {
    switch (summary?.state) {
      case "signed-out":
        return { said: words.signedOut, tint: "attn" };
      case "lapsing":
        return { said: words.keyRunsOut(days), tint: "attn" };
      case "not-answering":
        return { said: words.notAnswering, tint: "fail" };
      case "live":
      case undefined:
        break;
    }
    return { said: words.live, tint: "done" };
  });

  /** Remove, asked in place under the summary. */
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

<!-- The title: thing and action, `cawco` set in the mono face as the word
     to type. -->
{#snippet heading()}
  {words.titleBefore}<code class="font-mono">{words.word}</code>
{/snippet}

<!-- A page to open in a new tab: the kit's secondary button with the
     external glyph. -->
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

{#snippet skip(act: AddressAct)}
  <Button
    label={presenceWords.skip}
    onclick={() => onact?.(act)}
    size="sm"
    variant="secondary"
  />
{/snippet}

<!-- Where it answers, with Copy and Open: the house's copy box wide, the
     address across the card and Copy under it narrow; Open beside. -->
{#snippet address()}
  <div class={CONTROLS} data-address-place>
    <div class="min-w-0 flex-1">
      <JourneyCopy
        copyLabel={words.copy}
        label={words.addressLabel}
        text={shownAddress}
      />
    </div>
    {@render link(words.open, shownAddress)}
  </div>
{/snippet}

{#snippet foot()}
  {#if row}
    <p class={META} data-address-meta>{words.meta(net, host)}</p>
    <div class="flex justify-end">
      <!-- A ghost's ink ends inside its box: it hangs past the trailing
           edge by its edge and padding, as the relay's Later does. -->
      <Button
        class="-me-space-3"
        label={words.later}
        onclick={() => onact?.("later")}
        size="sm"
        variant="ghost"
      />
    </div>
  {/if}
{/snippet}

{#snippet stepBody(step: AddressStep)}
  {#if step.step === "sign-in"}
    <p class={NOTE}>
      {#if step.state === "needs"}
        {words.signInNote}
      {:else if step.state === "approval"}
        {words.approval}
      {:else}
        {words.signInWaiting}
      {/if}
    </p>
    <div class={CONTROLS}>
      {#if step.state === "approval"}
        {@render link(words.openMachines, addressPages.machines)}
      {:else}
        {@render link(words.signIn, signIn, "sign-in")}
      {/if}
    </div>
  {:else if step.step === "setup-key"}
    <p class={NOTE}>{words.setupKeyNote}</p>
    <div class={CONTROLS}>
      {@render link(words.openSetupKeys, addressPages.netbirdKeys)}
    </div>
    <Field id="address-setup-key" label={words.setupKeyLabel}>
      <Input
        autocapitalize="off"
        autocomplete="off"
        class="w-full max-w-field-group"
        id="address-setup-key"
        spellcheck={false}
        type="password"
        bind:value={key}
      />
    </Field>
    <div class={CONTROLS}>
      <Button
        disabled={key.trim() === ""}
        label={words.addCawco}
        onclick={() => onact?.("add-cawco")}
        size="sm"
      />
    </div>
  {:else if step.step === "headscale"}
    <p class={NOTE}>{words.headscaleNote(server)}</p>
    <div class={CONTROLS}>
      {@render link(words.headscaleButton(server), signIn, "sign-in")}
    </div>
    {#if step.command}
      <JourneyCopy
        copyLabel={words.copyCommand}
        label={words.commandLabel}
        text={step.command}
      />
    {/if}
  {:else if step.step === "answers"}
    <p class={NOTE}>{words.answersChecking(host)}</p>
  {:else if step.step === "https"}
    <p class={NOTE}>
      {step.state === "checking" ? words.httpsChecking : tailnetWords.adminNote}
    </p>
    <div class={CONTROLS}>
      {@render link(tailnetWords.openDnsPage, tailnetWords.dnsPage)}
      {@render skip("skip-https")}
    </div>
  {:else}
    <p class={NOTE}>{words.expiryNote}</p>
    <div class={CONTROLS}>
      {@render link(words.openMachines, addressPages.machines)}
      {@render skip("skip-expiry")}
    </div>
  {/if}
{/snippet}

{#snippet journey()}
  <JourneyCard
    class="text-body"
    data-address-journey
    {heading}
    icon={IconGlobe}
    title={words.title}
    under="gap-space-3"
  >
    {#if lead}
      {@const long =
        net === "netbird"
          ? words.netbirdLead(bare(place.http), host)
          : words.lead(host)}
      {@const short =
        net === "netbird"
          ? words.netbirdLeadShort(bare(place.http))
          : words.leadShort}
      <div class="flex min-w-0 flex-col" out:unfold>
        <p
          class="text-body text-ink-strong text-pretty wrap-anywhere @max-field-group:hidden"
        >
          {long}
        </p>
        <p
          class="hidden text-body text-ink-strong text-pretty wrap-anywhere @max-field-group:block"
        >
          {short}
        </p>
      </div>
    {/if}
    {#if answered}
      <div class="flex min-w-0 flex-col gap-space-2" in:unfold out:unfold>
        <p class="text-body text-ink-strong text-pretty wrap-anywhere">
          {words.opensAt(place.http, place.https)}
        </p>
        {@render address()}
      </div>
    {/if}
    <!-- biome-ignore lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list); these steps are still a numbered list. -->
    <ol class="m-0 grid list-none gap-space-3 p-0" role="list">
      {#each steps as step, index (step.step)}
        {@const mark =
          index !== open && markOf(step) === "standing"
            ? "waiting"
            : markOf(step)}
        <JourneyStep
          label={labelOf(step)}
          {mark}
          moves
          n={index + 1}
          open={index === open}
          said={said[mark]}
          state={step.state}
          step={step.step}
        >
          {@render stepBody(step)}
        </JourneyStep>
      {/each}
    </ol>
    {@render foot()}
  </JourneyCard>
{/snippet}

<div class="relative min-w-0" {@attach morph({ followUnfolds: true })}>
  {#key view}
    <div class="min-w-0" in:crossIn out:crossOut>
      {#if view === "failure"}
        <JourneyCard
          class="text-body"
          data-address-journey
          {heading}
          icon={IconGlobe}
          title={words.title}
          under="gap-space-2"
        >
          <FailurePlace {failure} {host} {onact} {signIn} />
          {@render foot()}
        </JourneyCard>
      {:else if view === "done"}
        <JourneyCard
          data-address-done
          done
          {heading}
          icon={IconGlobe}
          title={words.title}
          under="gap-space-2"
        >
          <p class="text-body text-ink-strong text-pretty wrap-anywhere">
            {words.doneLine(place.http, place.https)}
          </p>
          {#if row}
            <p class={META} data-address-meta>{words.meta(net, host)}</p>
          {/if}
          <div class="{CONTROLS} justify-end">
            <CopyButton
              aria-label={words.copyNamed(place.http)}
              size="sm"
              text={place.http}
              variant="secondary">{words.copy}</CopyButton
            >
            {@render link(words.openAt(place.http), place.http)}
          </div>
        </JourneyCard>
      {:else if view === "lapsing"}
        <JourneyCard
          data-address-lapsing
          {heading}
          icon={IconGlobe}
          title={words.title}
          under="gap-space-2"
        >
          <p class="text-body text-ink-strong text-pretty wrap-anywhere">
            {words.lapsing(days)}
          </p>
          {#if row}
            <p class={META} data-address-meta>{words.meta(net, host)}</p>
          {/if}
          <div class="{CONTROLS} justify-end">
            {@render link(words.disableExpiry, addressPages.machines)}
            {@render link(words.signInAgain, signIn, "sign-in-again")}
          </div>
        </JourneyCard>
      {:else if view === "summary" && summary}
        <JourneySummary
          {badge}
          data-address-summary
          hook="address"
          label={words.title}
          name={words.word}
        >
          {#snippet line()}
            <code class="font-mono text-ink-strong">{place.http}</code
            >{#if place.https}{" · "}<code class="font-mono text-ink-strong"
                >{place.https}</code
              >{/if}
          {/snippet}
          {#snippet actions()}
            <Button
              label={words.checkAgain}
              onclick={() => onact?.("check-again")}
              size="sm"
              variant="outline"
            />
            <Button
              aria-expanded={asker.pending?.at === "address-remove"}
              disabled={asker.pending?.at === "address-remove"}
              label={words.remove}
              onclick={askRemove}
              size="sm"
              variant="destructive"
            />
          {/snippet}
          <div class="col-span-full {CONTROLS}">
            <CopyButton
              aria-label={words.copyNamed(shownAddress)}
              size="sm"
              text={shownAddress}
              variant="secondary">{words.copy}</CopyButton
            >
            {@render link(words.open, shownAddress)}
          </div>
          <p class="col-span-full {NOTE}">
            {words.summaryWhere(net, host, summary.account)}
          </p>
          <!-- biome-ignore-start lint/a11y/noRedundantRoles: WebKit drops a list's semantics once its markers are styled away (VoiceOver reads no list); these lines are still a numbered list. -->
          <ol
            class="col-span-full m-0 grid list-none gap-space-3 p-0"
            role="list"
          >
            <!-- biome-ignore-end lint/a11y/noRedundantRoles: the list above -->
            {#if summary.https === "on"}
              <JourneyStep
                label={words.httpsOn}
                mark="done"
                n={1}
                said={said.done}
                state="done"
                step="https"
              />
            {:else}
              <JourneyStep
                label={tailnetWords.stepHttps}
                mark="standing"
                n={1}
                open
                state="needs"
                step="https"
              >
                <div class={CONTROLS}>
                  {@render link(tailnetWords.openDnsPage, tailnetWords.dnsPage)}
                </div>
              </JourneyStep>
            {/if}
            {#if summary.expiry === "off"}
              <JourneyStep
                label={words.expiryDone}
                mark="done"
                n={2}
                said={said.done}
                state="done"
                step="expiry"
              />
            {:else}
              <JourneyStep
                label={words.expiry}
                mark="standing"
                n={2}
                open
                state="needs"
                step="expiry"
              >
                <div class={CONTROLS}>
                  {@render link(words.openMachines, addressPages.machines)}
                </div>
              </JourneyStep>
            {/if}
          </ol>
          <p class="col-span-full {NOTE}">
            {words.answeredFrom(host, summary.ago)}
          </p>
          <div class="col-span-full min-w-0 @max-field-group:order-last">
            <AskHere {asker} at="address-remove" />
          </div>
        </JourneySummary>
      {:else if view === "none" || view === "no-word"}
        <JourneyCard
          data-address-none
          {heading}
          icon={IconGlobe}
          title={words.title}
          under="gap-space-3"
        >
          <p class="text-body text-ink-strong text-pretty wrap-anywhere">
            {view === "none"
              ? words.noNetwork(host)
              : words.noWord(noWord, host)}
          </p>
        </JourneyCard>
      {:else}
        {@render journey()}
      {/if}
    </div>
  {/key}
</div>
