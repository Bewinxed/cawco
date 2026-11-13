<!--
  Words in one of the house text roles, plain text with its `cawco:`
  references drawn as the dashboard's (Words.svelte): the view library's
  Text by name and shape, each role its type utility (DESIGN.md, The Role,
  Not Size Rule), a title balanced and running text pretty.
-->
<script lang="ts">
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";
  import Words from "./Words.svelte";

  let { props }: OpenUIRenderProps<{ text: unknown; variant?: unknown }> =
    $props();

  const ROLES = {
    title: "type-title text-balance text-ink-strong",
    label: "type-label text-pretty text-ink-strong",
    body: "type-body text-pretty text-ink-strong",
    meta: "type-meta text-pretty text-ink-muted",
  } as const;
  /** Its role: the library's schema takes one of the four, "body" when left out. */
  function roleOf(variant: unknown): keyof typeof ROLES {
    if (variant === undefined) {
      return "body";
    }
    if (
      variant === "title" ||
      variant === "label" ||
      variant === "body" ||
      variant === "meta"
    ) {
      return variant;
    }
    throw new Error(
      `A Text's variant is ${JSON.stringify(variant)}, not one of title, label, body or meta`
    );
  }
  const role = $derived(roleOf(props.variant));
</script>

<p class={["wrap-anywhere", ROLES[role]]} data-role={role} data-slot="text">
  <Words text={String(props.text ?? "")} />
</p>
