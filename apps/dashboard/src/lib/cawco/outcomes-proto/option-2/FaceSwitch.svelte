<script lang="ts" module>
  /** What an opened line shows: the line itself, or the agents' plan under its outcome. */
  export type LeadFace = "line" | "plan";
</script>

<script lang="ts">
  /**
   * The two-way switch over an opened line (option 2, decision 5): This
   * line, or The agents' plan. The kit's segmented control, its thumb under
   * the chosen face.
   */
  import * as Tabs from "#lib/components/ui/tabs/index.js";

  let {
    face,
    onface,
  }: {
    face: LeadFace;
    onface: (face: LeadFace) => void;
  } = $props();
</script>

<Tabs.Root
  onValueChange={(value) => onface(value === "plan" ? "plan" : "line")}
  value={face}
>
  <Tabs.List aria-label="What to show">
    <Tabs.Trigger value="line">This line</Tabs.Trigger>
    <Tabs.Trigger value="plan">The agents' plan</Tabs.Trigger>
  </Tabs.List>
</Tabs.Root>
