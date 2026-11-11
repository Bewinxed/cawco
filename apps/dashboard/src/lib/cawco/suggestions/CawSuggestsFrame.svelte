<script lang="ts">
  /**
   * The states file's seam (CawSuggests.stories.ts): Caw's suggestion on a
   * page's surface, with the words of the first thing he suggests, the
   * routine that finds unused skills and servers. A press here goes
   * nowhere; on its page it turns the routine on or waves the offer away.
   */
  import CawSuggests from "./CawSuggests.svelte";

  const WORDS = {
    routine: {
      title: "Unused skills and servers",
      reason:
        "Each Monday, counts what this project's sessions call and proposes unlisting what nobody has called in 30 days.",
    },
    long: {
      title: "Unused skills and servers across every project on this fleet",
      reason:
        "Each Monday, counts what every project's sessions call, on Claude Code, OpenCode and pi, and proposes unlisting what nobody has called in 30 days. Nothing is unlisted until you press, and anything unlisted stays installed.",
    },
  } as const;

  let {
    words = "routine",
    dismissable = true,
  }: {
    words?: keyof typeof WORDS;
    /** The place lets the offer be waved away. */
    dismissable?: boolean;
  } = $props();

  const said = $derived(WORDS[words]);
  const nowhere = () => undefined;
</script>

<div class="w-full min-w-0 p-space-5">
  <CawSuggests
    act="Turn on"
    dismiss={dismissable ? "Not now" : undefined}
    label="Caw suggests a routine"
    onaccept={nowhere}
    ondismiss={dismissable ? nowhere : undefined}
    reason={said.reason}
    title={said.title}
  />
</div>
