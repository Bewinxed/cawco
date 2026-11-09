<script lang="ts">
  /**
   * The app's markdown: the kit's (components/ui/markdown) with what it
   * draws of CawCo in the words: each mention a session's reference, each
   * skill the session has its chip, a fence the console's code well, and a
   * `cawco:` link its kind's element.
   */
  import type { ComponentProps, Snippet } from "svelte";
  import OutputBlock from "#lib/components/features/tool-cards/OutputBlock.svelte";
  import { Markdown } from "#lib/components/ui/markdown/index.js";
  import { markMentions } from "./find/mention.svelte";
  import {
    markdownFleetHere,
    plainReferenceOf,
    writtenLabel,
  } from "./markdown-fleet";
  import { outsideCode } from "./outside-code";
  import {
    markSkills,
    skillNamed,
    skillsHere,
    skillWords,
  } from "./skill-chips";

  let {
    said = false,
    ...rest
  }: Omit<
    ComponentProps<typeof Markdown>,
    "marks" | "code" | "codespan" | "link"
  > & {
    /**
     * The person's own words: each `/name` of a skill the session has is
     * drawn as its chip (skill-chips.ts `markSkills`), and every mention the
     * composer wrote is a session's reference (mention.svelte.ts
     * `markMentions`).
     */
    said?: boolean;
  } = $props();

  /**
   * The skills of the session whose words these are (SessionPane): a code
   * span that is exactly one's name, with or without its slash, is its
   * chip, in anyone's words.
   */
  const skills = skillsHere();
  /**
   * What this markdown reads of the fleet, as its host provides it: a
   * reference's chip and a skill's. None on the stage or in a comment
   * card's thread, which draw each reference as its label and load no store.
   */
  const fleet = markdownFleetHere();

  /**
   * Words as drawn, outside their code: each mention a session's reference
   * (mention.svelte.ts `markMentions`), and in the person's own each skill
   * marked.
   */
  function marked(words: string): string {
    // An agent's reply with no "@" holds no mention: drawn as written, with
    // no walk of its lines on every chunk.
    if (!(said || words.includes("@"))) {
      return words;
    }
    const named = said ? skillWords(skills().keys()) : null;
    return outsideCode(words, (run) =>
      markMentions(run, said, (between) => markSkills(between, named))
    );
  }
</script>

<Markdown {...rest} marks={marked}>
  <!-- A fence is code, and the console has one surface for code: the same well a
	     tool result opens into, painted by the same highlighter. Streamdown can
	     highlight fences itself, but it resolves one shiki theme at a time and
	     writes it as inline colours — registering a custom pair through its
	     `shikiThemes` pins every fence to whichever theme is listed first, and
	     following the appearance instead means re-tokenizing every block on every
	     switch, through a second shiki with a second cache. Ours paints each token
	     with a house code token that carries both appearances. The well is
	     `not-prose`, so prose's `pre` and `code` dressing leaves it alone;
	     inline code (`codespan`) keeps it, because it is prose, not a
	     listing. -->
  {#snippet code({ token })}
    <div class="not-prose my-3">
      <OutputBlock language={token.lang} text={token.text} />
    </div>
  {/snippet}
  <!-- A code span naming a skill of this session, exactly, is that
         skill's chip (SkillChip); any other is code. -->
  {#snippet codespan({
    token,
    children,
  }: {
    token: { text: string };
    children: Snippet;
  })}
    {@const skill = skillNamed(skills(), token.text)}
    {@const Chip = fleet()?.SkillChip}
    {#if skill && Chip}
      <Chip {skill} />
    {:else}
      <code>{@render children()}</code>
    {/if}
  {/snippet}
  <!-- A link: a `cawco:` reference is drawn as its kind's element (a
         session as its chip), or as its label alone when the dashboard
         knows no such kind or id (references.ts). Any other link is the
         anchor streamdown draws (its Link element), `href` being the
         destination streamdown allowed. -->
  {#snippet link({
    children,
    href,
    token,
  }: {
    children: Snippet;
    href?: string | null;
    /** The fields of marked's link token read here. */
    token: { href: string; text?: string; title?: string | null };
  })}
    {@const drawn = (fleet()?.referenceOf ?? plainReferenceOf)(token.href)}
    {#if drawn.draw === "element"}
      <drawn.element
        id={drawn.id}
        kind={drawn.kind}
        label={writtenLabel(token.text)}
      />
    {:else if drawn.draw === "label"}
      {@render children()}
    {:else if token.href.startsWith("/")}
      <a href={token.href} title={token.title}>{@render children()}</a>
    {:else}
      <a {href} rel="noopener noreferrer" target="_blank" title={token.title}
        >{@render children()}</a
      >
    {/if}
  {/snippet}
</Markdown>
