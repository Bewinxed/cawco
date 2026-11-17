<script lang="ts" module>
  import type { HarnessKind } from "@cawco/core/harness/kinds";
  import { LogoAntigravity, LogoClaude, LogoOpenai } from "@cawco/icons/marks";
  import OpenCodeLogo from "./OpenCodeLogo.svelte";
  import PiLogo from "./PiLogo.svelte";

  /**
   * Each CLI's mark, by its id: the harnesses CawCo runs, and the CLIs it
   * installs beside them (core TOOL_CATALOG). Antigravity's is Iconify's
   * `logos:antigravity`; Codex's is OpenAI's, `logos:openai-icon`.
   */
  const MARKS = {
    claude: LogoClaude,
    opencode: OpenCodeLogo,
    pi: PiLogo,
    codex: LogoOpenai,
    antigravity: LogoAntigravity,
  } satisfies Record<HarnessKind | "antigravity", unknown>;

  /** A CLI with a mark: a harness, or a tool of the catalog that has one. */
  export type MarkedCli = keyof typeof MARKS;

  /**
   * The marks drawn in one ink: Codex's (OpenAI's) ships black, which
   * vanishes on the dark theme, so it is filled with `--color-ink-strong`
   * and follows the theme, as ProviderLogo's single-ink marks do.
   */
  const INK: ReadonlySet<MarkedCli> = new Set(["codex"]);

  /** Whether the CLI with this id has a mark to draw. */
  export const hasMark = (id: string): id is MarkedCli => id in MARKS;
</script>

<script lang="ts">
  /** A harness's mark, or a catalog CLI's (Configure › Command-line tools' heads). */
  let {
    harness,
    ...rest
  }: {
    harness: MarkedCli;
    /** Its root's hooks: `data-box` on a mark line. */
    [attribute: `data-${string}`]: unknown;
  } = $props();
  const Mark = $derived(MARKS[harness]);
</script>

<span
  data-slot="harness-logo"
  class="inline-flex size-icon-md flex-none text-inherit data-ink:text-ink-strong data-ink:[&_path]:fill-current"
  data-harness-logo={harness}
  data-ink={INK.has(harness) || undefined}
  {...rest}><Mark class="size-full" /></span
>
