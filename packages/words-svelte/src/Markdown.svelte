<script lang="ts" module>
  import type { HTMLAttributes } from "svelte/elements";
  import type { MarkdownOptions } from "./types.js";

  export interface MarkdownProps
    extends MarkdownOptions, Omit<HTMLAttributes<HTMLDivElement>, "children"> {
    /** The whole markdown so far. */
    source: string;
    /** More of the source is still coming. */
    streaming?: boolean;
  }
</script>

<script lang="ts">
  import { getAllContexts, untrack } from "svelte";
  import { markdownDefaults } from "./defaults.js";
  import { markdown } from "./markdown.svelte.js";
  import { renderMarkdown } from "./render.js";
  import type { MarkdownInput } from "./types.js";

  let {
    source,
    streaming = false,
    animated,
    caret,
    options,
    repair,
    when,
    link,
    image,
    inlineCode,
    code,
    ...rest
  }: MarkdownProps = $props();

  const id = $props.id();
  const defaults = markdownDefaults();
  const context = getAllContexts();

  /** Each prop given, over the inherited one; Words' options merged one by one, each instance with its own footnote ids. */
  const input = (): MarkdownInput => {
    const given: MarkdownOptions = {
      animated,
      caret,
      repair,
      when,
      link,
      image,
      inlineCode,
      code,
    };
    const merged: MarkdownOptions = { ...defaults };
    for (const [key, value] of Object.entries(given)) {
      if (value !== undefined) {
        Object.assign(merged, { [key]: value });
      }
    }
    return {
      ...merged,
      options: { idPrefix: `${id}-`, ...defaults.options, ...options },
      source,
      streaming,
      context,
    };
  };

  // Each snippet's element is written as Words would write it, so a server
  // render reads whole before it hydrates; the attachment mounts the
  // snippets in their place.
  const html = untrack(() => renderMarkdown(input()));
</script>

<div {...rest} data-markdown="root" {@attach markdown(input)}>
  {@html html}
</div>
