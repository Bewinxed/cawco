<script lang="ts">
  /**
   * More code details on the card's top line, closed: its name, then its
   * facts (the connected codebase, where big files are kept), then its
   * chevron. A press opens its region at the top of the card's body
   * (MoreCodeDetails) and folds it again. The facts give way first when the
   * line runs short.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconChevronDown } from "#lib/icons.js";
  import type { BigFiles, Codebase, Read } from "./details";
  import { moreWords, sectionWords } from "./words";

  let {
    codebases,
    bigFiles,
    open,
    controls,
    ontoggle,
  }: {
    codebases: Codebase[];
    bigFiles: Read<BigFiles>;
    open: boolean;
    /** The region it opens. */
    controls: string;
    ontoggle: () => void;
  } = $props();

  const summary = $derived(
    [
      codebases.map((codebase) => codebase.name).join(", "),
      bigFiles.state === "read" && bigFiles.value.mode === "custom"
        ? moreWords.bigCustom
        : moreWords.bigDefaults,
    ]
      .filter(Boolean)
      .join(" · ")
  );
</script>

<Button
  aria-controls={controls}
  aria-expanded={open}
  class="min-w-0 max-w-full shrink"
  onclick={ontoggle}
  size="sm"
  title={summary}
  variant="ghost"
>
  <span class="flex-none">{sectionWords.more.name}</span>
  <span class="min-w-0 overflow-clip text-ellipsis font-normal text-ink-muted"
    >{summary}</span
  >
  <IconChevronDown
    aria-hidden="true"
    class={[
      "size-icon-sm flex-none text-ink-muted transition-transform duration-(--duration-control) ease-out",
      open && "rotate-180",
    ]}
  />
</Button>
