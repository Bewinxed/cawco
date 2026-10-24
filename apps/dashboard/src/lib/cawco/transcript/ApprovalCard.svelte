<script lang="ts">
  /**
   * A permission, said as one sentence (the owner, 10-19: "[caw branding]
   * [agent] on [session] needs to [reason] allow it to [action] [target]
   * edit [x] with [a], and [b] with chips"): Caw's face, then who asks and
   * why, then what approving lets it do, each thing it names a chip, the
   * session and the target links to their pages. Under the sentence, what
   * it moves: each setting before and after, the command whole, the change
   * itself as its diff, and the input the sentence leaves unsaid.
   *
   * The words are the hub's (core permission-presentation.ts, the
   * presentation's `sentence`); this draws them. It is the head and the body
   * of the ask in the composer's grown shape: Prompt keeps the answer row
   * under it, and the two come up with the shape one after the other
   * (`--part` 0 and 1, Prompt's stagger).
   */
  import type { HarnessKind, PermissionPresentation } from "@cawco/core";
  import DiffView from "#lib/components/features/DiffView.svelte";
  import { kindFamily } from "#lib/components/features/tool-cards/descriptors.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import {
    IconArrowUpRight,
    IconChat,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import HarnessLogo from "../HarnessLogo.svelte";
  import CawFace from "../home/CawFace.svelte";

  let {
    presentation,
    agent,
    harness = null,
    sessionHref,
    place = null,
  }: {
    presentation: PermissionPresentation;
    /** The agent that asks, as the conversation names it: "Claude Code", "Caw". */
    agent: string;
    /** Which harness runs the asking session, for the agent chip's mark. */
    harness?: HarnessKind | null;
    /** The asking session's page, for its chip. */
    sessionHref?: string;
    /** Where this ask stands among the ones waiting ("2 of 3"); none when it is alone. */
    place?: { at: number; of: number } | null;
  } = $props();

  const FULL_STOP = /\.$/;
  const sentence = $derived(presentation.sentence);
  const family = $derived(kindFamily(sentence.family));
  /** The session is named apart from the agent only when they differ: Caw asks as himself. */
  const session = $derived(
    presentation.asker === agent ? null : presentation.asker
  );
  /**
   * The reason as it follows "needs to": its first letter lower-cased where
   * the second is too (an acronym keeps its case), its full stop dropped.
   */
  const reason = $derived.by(() => {
    const said = sentence.reason?.trim().replace(FULL_STOP, "");
    if (!said) {
      return null;
    }
    return said.length > 1 && said[1] === said[1]?.toLowerCase()
      ? `${said.charAt(0).toLowerCase()}${said.slice(1)}`
      : said;
  });
  const command = $derived(presentation.command ?? null);
  /** What the sentence goes on to show under it, which its colon points at. */
  const shows = $derived(
    sentence.changed.length > 0 || !!command || presentation.changes.length > 0
  );
  /**
   * A path of three or more parts as its last two, so the file's own name
   * is what the chip keeps ("…/transcript/TrayChipLabel.svelte"); the whole
   * path stands over the diff, and in the chip's title.
   */
  const pathTail = (name: string): string => {
    const parts = name.split("/").filter(Boolean);
    return parts.length < 3 || name.includes("://")
      ? name
      : `…/${parts.slice(-2).join("/")}`;
  };
  /** A web address opens in its own tab; a dashboard page in this one. */
  const away = (href: string) => href.startsWith("https://");
  /** The house inline chip, as a link: it tints under a hovering pointer and presses (The Press Rule). */
  const LINK =
    "no-underline can-hover:hover:bg-surface-hover motion-safe:active:[transform:scale(var(--press-scale))]";
</script>

<!-- Who asks, and why: Caw's face, the agent and its session as chips, the
     session's own reason in its words. The card's title, so its name too.
     mark-line: Caw stands on the sentence's first line as it wraps. -->
<h2
  data-slot="ask-who"
  class="mark-line flex items-start gap-space-2 mb-space-2 text-size-body font-normal leading-body text-ink-strong opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
  style:--part="0"
  style:--part-delay="calc(var(--part) * var(--dur-stagger))"
>
  <span class="mark-cell" data-box
    ><CawFace size={18} status="needs-you" /></span
  >
  <span
    data-slot="ask-who-words"
    class="min-w-0 flex-1 max-w-c-measure wrap-anywhere text-pretty"
    ><span
      data-chip="agent"
      class={chipVariants({
        variant: "inline",
        class: harness ? undefined : "ps-space-2",
      })}
      >{#if harness}<span data-box class="inline-flex"
          ><HarnessLogo {harness} /></span
        >{/if}<span data-slot="label">{agent}</span></span
    >{#if session}{" "}on{" "}{#if sessionHref}<a
          data-chip="session"
          class={chipVariants({ variant: "inline", class: LINK })}
          href={sessionHref}
          ><IconChat class="text-ink-muted" /><span data-slot="label"
            >{session}</span
          ><IconArrowUpRight class="text-ink-muted" /></a
        >{:else}<span
          data-chip="session"
          class={chipVariants({ variant: "inline" })}
          ><IconChat class="text-ink-muted" /><span data-slot="label"
            >{session}</span
          ></span
        >{/if}{/if}{#if reason}{" "}needs to {reason}.{:else}{" "}needs your
      approval.{/if}</span
  >
  {#if place && place.of > 1}
    <Kbd data-num class="flex-none ms-auto" data-box figures="tabular"
      >{place.at} of {place.of}</Kbd
    >
  {/if}
</h2>
<!-- What approving lets it do, then what that moves. Every box sizes to the
     card: a long name or value wraps (`wrap-anywhere`) rather than pushing
     past it, and the body scrolls between the head and the answer row. -->
<div
  data-slot="body"
  class="relative flex-auto min-h-0 min-w-0 overflow-y-auto overscroll-contain opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
  style:--part="1"
  style:--part-delay="calc(var(--part) * var(--dur-stagger))"
>
  <!-- The line the grant is made on: the act in its tool family's glyph and
       ink, the kind in words, the target a chip that opens its page. -->
  <p
    data-slot="ask-grant"
    class="mb-space-2 max-w-c-measure text-size-body font-medium leading-body text-ink-strong wrap-anywhere text-pretty"
  >
    <span>Allow it to</span>
    <span data-chip="act" class={chipVariants({ variant: "inline" })}
      ><family.icon class={family.color} data-box /><span data-slot="label"
        >{sentence.act}</span
      ></span
    >{#if sentence.kind}{" "}<span>{sentence.kind}</span
      >{/if}{#if sentence.target}{" "}{#if sentence.target.href}<a
          data-chip="target"
          class={chipVariants({ variant: "inline", class: LINK })}
          href={sentence.target.href}
          rel={away(sentence.target.href) ? "noopener" : undefined}
          target={away(sentence.target.href) ? "_blank" : undefined}
          ><span data-slot="label">{sentence.target.name}</span
          ><IconArrowUpRight class="text-ink-muted" /></a
        >{:else}<span
          data-chip="target"
          class={chipVariants({ variant: "inline", class: "ps-space-2" })}
          title={sentence.target.name}
          ><span aria-hidden="true" data-slot="label"
            >{pathTail(sentence.target.name)}</span
          ><span class="sr-only">{sentence.target.name}</span></span
        >{/if}{/if}<span>{shows ? ":" : "."}</span>
  </p>
  <!-- What it loses for good, said before the answer is given, in the
       serious register (WORDS.md, Honest). -->
  {#if sentence.caution}
    <Alert
      class="mb-space-2"
      data-slot="ask-caution"
      role="note"
      variant="warning"
    >
      <IconWarningTriangle />
      <AlertDescription>{sentence.caution}</AlertDescription>
    </Alert>
  {/if}
  <!-- Each setting it moves, once: what it holds now in muted ink, what it
       will hold in strong. A key and its value side by side; a long value
       wraps under itself and scrolls in place past the well's cap. -->
  {#if sentence.changed.length > 0}
    <dl
      data-slot="ask-settings"
      style:--cols="fit-content(14ch) minmax(0, 1fr)"
      class="grid grid-cols-(--cols) gap-x-space-3 gap-y-space-2 mb-space-2 p-space-3 rounded-sm bg-surface-recess"
    >
      {#each sentence.changed as setting, i (`${i}:${setting.key}`)}
        <dt
          class="min-w-0 text-size-label font-medium text-ink-muted wrap-anywhere"
        >
          {setting.key}
        </dt>
        <dd
          class="m-0 flex min-w-0 max-h-c-ask-value-max-h flex-wrap items-baseline gap-x-space-1 overflow-y-auto overscroll-contain font-mono text-size-meta whitespace-pre-wrap wrap-anywhere"
        >
          {#if setting.before !== undefined}
            <span data-slot="was" class="min-w-0 text-ink-muted"
              >{setting.before}</span
            >
            <span aria-hidden="true" class="flex-none font-body text-ink-muted"
              >→</span
            ><span class="sr-only">becomes</span>
          {/if}
          <span data-slot="now" class="min-w-0 text-ink-strong"
            >{setting.after}</span
          >
        </dd>
      {/each}
    </dl>
  {/if}
  <!-- The command whole, never a line of it: what runs is what is approved. -->
  {#if command}
    <pre
      data-slot="ask-command"
      class="mb-space-2 max-h-c-ask-value-max-h overflow-y-auto overscroll-contain border-s-2 border-s-border-hairline py-space-1 ps-space-3 font-mono text-size-label text-ink-strong whitespace-pre-wrap wrap-anywhere"><code
        >{command}</code
      ></pre>
  {/if}
  <!-- The change itself, open: each diff stands to the token's share of the
       screen and scrolls inside it, so the answer row stays in reach. -->
  {#if presentation.changes.length > 0}
    {#if presentation.detail}
      <p
        data-slot="ask-count"
        class="mb-space-2 text-size-label text-ink-muted"
      >
        {presentation.detail}
      </p>
    {/if}
    <div class="flex flex-col gap-space-2 mb-space-2">
      {#each presentation.changes as change, i (i)}
        <DiffView
          cap="calc(var(--c-ask-diff-share) * 100dvh)"
          filePath={change.path}
          newContent={change.after}
          oldContent={change.before}
        />
      {/each}
    </div>
  {/if}
  <!-- The rest of the input: what the sentence and the settings leave unsaid. -->
  {#if sentence.rest.length > 0}
    <dl
      data-slot="ask-rest"
      style:--cols="fit-content(14ch) minmax(0, 1fr)"
      class="grid grid-cols-(--cols) gap-x-space-3 gap-y-space-1 mb-space-2 text-size-meta"
    >
      {#each sentence.rest as field, i (`${i}:${field.key}`)}
        <dt class="min-w-0 text-ink-muted wrap-anywhere">{field.key}</dt>
        <dd
          class="m-0 min-w-0 max-h-c-ask-value-max-h overflow-y-auto overscroll-contain text-ink-strong whitespace-pre-wrap wrap-anywhere"
        >
          {field.value}
        </dd>
      {/each}
    </dl>
  {/if}
</div>
