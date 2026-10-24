<script lang="ts">
  /**
   * A Call step's fields: the connection and its tool (the approved
   * actions' own connections), the arguments as a template over the run's
   * inputs, and when he approves it: on the start sheet each run, or for
   * every run (a standing approval, only for arguments nothing fills at run
   * time). Kit fields, stacked on a narrow column, two across on a wide one.
   */
  import { Label } from "#lib/components/ui/label/index.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { stepOf } from "./release";

  let { id = "wf-call" }: { id?: string } = $props();
  const step = stepOf("post");
</script>

<div
  data-slot="wf-call"
  class="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,var(--c-key-field-basis)),1fr))] gap-space-3"
>
  <div class="flex min-w-0 flex-col gap-space-1">
    <Label for="{id}-connection">Connection</Label>
    <NativeSelect id="{id}-connection" value="slack-brand">
      <NativeSelectOption value="slack-brand">slack-brand · Slack</NativeSelectOption>
      <NativeSelectOption value="releases-hook">releases-hook · http</NativeSelectOption>
    </NativeSelect>
  </div>
  <div class="flex min-w-0 flex-col gap-space-1">
    <Label for="{id}-tool">Tool</Label>
    <NativeSelect id="{id}-tool" value="post">
      <NativeSelectOption value="post">post</NativeSelectOption>
      <NativeSelectOption value="reply">reply</NativeSelectOption>
    </NativeSelect>
  </div>
  <div class="col-span-full flex min-w-0 flex-col gap-space-1">
    <Label for="{id}-args">Arguments</Label>
    <Textarea face="mono" id="{id}-args" value={step.call?.args ?? ""} />
  </div>
  <div class="col-span-full flex min-w-0 flex-col gap-space-1">
    <span class="type-label text-ink-strong" id="{id}-approve">Approve it</span>
    <OptionGroup aria-labelledby="{id}-approve" value={["start"]}>
      <OptionGroupItem value="start">On the start sheet, each run</OptionGroupItem>
      <OptionGroupItem disabled value="every">For every run</OptionGroupItem>
    </OptionGroup>
    <span class="type-meta text-ink-muted"
      >Its text comes from step 1, so it can't stand approved for every run.</span
    >
  </div>
</div>
