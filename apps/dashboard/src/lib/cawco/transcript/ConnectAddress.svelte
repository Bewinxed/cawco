<script lang="ts">
  /**
   * A connect ask's sign-in address, whole, before anything opens (MCP
   * URL-mode elicitation: "MUST show the full URL to the user for
   * examination before consent", "SHOULD highlight the domain of the URL to
   * mitigate subdomain spoofing"). The host in strong ink, broken only after
   * its dots as a browser ask's origin is (OriginText); the scheme and the
   * path in the house's quiet code ink (`ink-subtle`, as an id or a path
   * beside a title is), so the question and Connect lead and the host is
   * what the eye finds in it. The path breaks only after a dot, a slash,
   * `&`, `=` or `?` (addressRuns), on a desk as on a phone, and its last
   * few characters never stand alone. Never a link: Connect is the only way
   * it opens.
   */
  import OriginText from "../OriginText.svelte";
  import { addressParts, addressRuns } from "./connect-ask";

  let { url }: { url: string } = $props();
  const parts = $derived(addressParts(url));
  const runs = $derived(addressRuns(parts.rest));
</script>

<code
  data-slot="connect-address"
  class="min-w-0 type-code liga-none text-ink-subtle wrap-break-word text-pretty"
  ><span class="whitespace-nowrap">{parts.head}</span><wbr /><span
    data-slot="connect-host"
    class="text-ink-strong"><OriginText origin={parts.host} /></span
  >{#each runs as run, at (at)}<wbr /><span
      data-address-run
      class="whitespace-nowrap">{run}</span
    >{/each}</code
>
