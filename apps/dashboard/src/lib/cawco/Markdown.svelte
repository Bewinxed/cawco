<script lang="ts">
  /**
   * The app's markdown: the kit's (components/ui/markdown) with what it
   * draws of CawCo in the words: each mention a session's reference, each
   * skill the session has its chip, a fence the console's code well, and a
   * `cawco:` link its kind's element.
   */
  import { inlineBlockName } from "@cawco/core/inline-blocks";
  import { renameFences } from "@cawco/core/markdown-code";
  import { outsideCode } from "@cawco/core/outside-code";
  import { skillWords } from "@cawco/core/skill-words";
  import type { ComponentProps } from "svelte";
  import type {
    CodeOptions,
    MarkdownInlineCode,
    MarkdownLink,
  } from "svelte-words";
  import OutputBlock from "#lib/components/features/tool-cards/OutputBlock.svelte";
  import { Markdown } from "#lib/components/ui/markdown/index.js";
  import { markMentions } from "./find/mention.svelte";
  import { markdownBlocksHere } from "./markdown-blocks";
  import {
    markdownFleetAbove,
    markdownFleetHere,
    plainReferenceOf,
  } from "./markdown-fleet";
  import { markSkills, skillNamed, skillsHere } from "./skill-chips";

  let {
    said = false,
    blocksAt,
    ...rest
  }: Omit<
    ComponentProps<typeof Markdown>,
    "marks" | "code" | "inlineCode" | "link" | "when"
  > & {
    /**
     * The person's own words: each `/name` of a skill the session has is
     * drawn as its chip (skill-chips.ts `markSkills`), and every mention the
     * composer wrote is a session's reference (mention.svelte.ts
     * `markMentions`).
     */
    said?: boolean;
    /**
     * The reply these words are, in a transcript that draws an agent's
     * blocks (markdown-blocks.ts): a named `openui` fence is its block, by
     * this reply. Left out, every fence is code.
     */
    blocksAt?: string;
  } = $props();

  /** The block component a transcript provides; none elsewhere. */
  const Block = markdownBlocksHere();

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
   * Whether a host provides the fleet: then every code span is drawn here,
   * a chip as soon as the skill it names and the fleet are read, whenever
   * that is. Where none does, a code span is code.
   */
  const chips = markdownFleetAbove() !== undefined;

  /**
   * Words as drawn, outside their code: each mention a session's reference
   * (mention.svelte.ts `markMentions`), and in the person's own each skill
   * marked.
   */
  function marked(words: string): string {
    const blocks = Block && blocksAt !== undefined ? named(words) : words;
    // An agent's reply with no "@" holds no mention: drawn as written, with
    // no walk of its lines on every chunk.
    if (!(said || blocks.includes("@"))) {
      return blocks;
    }
    const names = said ? skillWords(skills().keys()) : null;
    return outsideCode(blocks, (run) =>
      markMentions(run, said, (between) => markSkills(between, names))
    );
  }

  /**
   * The language a named block's fence is drawn under: `openui:` and its
   * name. Markdown hands a fence's code only the first word of its info
   * string, and a block's name is in the rest (`name="…"`).
   */
  const BLOCK = "openui:";

  /** `words` with each fence naming a block written under its block's language ({@link BLOCK}). */
  function named(words: string): string {
    if (!words.includes("openui")) {
      return words;
    }
    return renameFences(words, ({ lang, meta }) => {
      const name = inlineBlockName(lang, meta);
      return name ? `${BLOCK}${encodeURIComponent(name)}` : null;
    });
  }

  /** The block a fence's language names, or null when it is code. */
  const blockNamed = (language: string): string | null =>
    language.startsWith(BLOCK)
      ? decodeURIComponent(language.slice(BLOCK.length))
      : null;
</script>

<!-- A fence is code, and the console has one surface for code: the same
     well a tool result opens into, painted by the same highlighter, whose
     house code tokens carry both appearances. The well is `not-prose`, so
     prose's `pre` and `code` dressing leaves it alone; inline code keeps
     it, because it is prose, not a listing. A fence's lines each end in a
     line feed, and the well's text ends at its last line. -->
{#snippet code({ code: lines, language, isIncomplete }: CodeOptions)}
  {@const text = lines.endsWith("\n") ? lines.slice(0, -1) : lines}
  {@const name = Block && blocksAt !== undefined ? blockNamed(language) : null}
  {#if Block && blocksAt !== undefined && name}
    <!-- A named openui fence in a reply is the agent's block (tsk-330),
         drawn in place of its code; one still open is being written. -->
    <Block
      at={blocksAt}
      {name}
      source={text}
      streaming={!!rest.streaming && isIncomplete}
    />
  {:else}
    <div class="not-prose my-3">
      <OutputBlock
        language={language === "text" ? undefined : language}
        {text}
      />
    </div>
  {/if}
{/snippet}

<!-- A code span naming a skill of this session, exactly, is that skill's
     chip (SkillChip); any other is code. -->
{#snippet inlineCode({ code: text }: MarkdownInlineCode)}
  {@const skill = skillNamed(skills(), text)}
  {@const Chip = fleet()?.SkillChip}
  {#if skill && Chip}
    <Chip {skill} />
  {:else}
    <code>{text}</code>
  {/if}
{/snippet}

<!-- A `cawco:` reference is drawn as its kind's element (a session as its
     chip), or as its label alone when the dashboard knows no such kind or
     id (references.ts). Every other link is markdown's own anchor. -->
{#snippet link({ href, html, text }: MarkdownLink)}
  {@const drawn = (fleet()?.referenceOf ?? plainReferenceOf)(href ?? "")}
  {#if drawn.draw === "element"}
    <drawn.element id={drawn.id} kind={drawn.kind} label={text} />
  {:else}
    {@html html}
  {/if}
{/snippet}

<Markdown
  {...rest}
  {code}
  {inlineCode}
  {link}
  marks={marked}
  when={{
    inlineCode: () => chips,
    link: (found) => !!found.href?.startsWith("cawco:"),
  }}
/>
