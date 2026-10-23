<script lang="ts">
  /**
   * A connect ask's sign-in address, whole, before anything opens (MCP
   * URL-mode elicitation: "MUST show the full URL to the user for
   * examination before consent", "SHOULD highlight the domain of the URL to
   * mitigate subdomain spoofing"). The host in strong ink, broken only after
   * its dots as a browser ask's origin is (OriginText); the scheme and the
   * path in muted ink, broken anywhere, since a sign-in path is one long
   * query. Never a link: Connect is the only way it opens.
   */
  import OriginText from "../OriginText.svelte";
  import { addressParts } from "./connect-ask";

  let { url }: { url: string } = $props();
  const parts = $derived(addressParts(url));
</script>

<code
  data-slot="connect-address"
  class="min-w-0 type-code text-ink-muted wrap-anywhere"
  >{parts.head}<span data-slot="connect-host" class="text-ink-strong"
    ><OriginText origin={parts.host} /></span
  >{parts.rest}</code
>
