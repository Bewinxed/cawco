<script lang="ts">
  /**
   * A member's picture, picked under its settings' head (build spec §3.5).
   * Caw's flock wear one of his poses: the fourteen as named radio tiles,
   * "Caw's poses, drawn from his files." under them. An agent he added wears
   * one of the eight identity hues: each tile shows its mark on that hue. A
   * press picks and folds the picker; the keys are the house's radio
   * group's. Seven across, four on a phone.
   */
  import { CAW_POSES, type CawPoseId, type Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import MemberFace from "./MemberFace.svelte";

  let {
    member,
    onpicked,
  }: {
    /** The member as it would be drawn: a new one wears its draft's hue. */
    member: Member;
    onpicked: (picture: { pose: CawPoseId } | { hue: number }) => void;
  } = $props();

  const HUES = [1, 2, 3, 4, 5, 6, 7, 8];
  const flock = $derived(member.pose !== null);
  const chosen = $derived(
    member.pose === null ? [String(member.hue ?? "")] : [member.pose]
  );
</script>

<div class="flex min-w-0 flex-col gap-space-2">
  <OptionGroup
    aria-label={decidesWords.pictureFor(member.name)}
    layout="tiles"
    style="--tiles-cols: repeat(7, var(--c-pose-tile)); --tiles-cols-phone: repeat(4, var(--c-pose-tile))"
    bind:value={
      () => chosen,
      (next) => {
        const [picked] = next;
        if (picked === undefined) {
          return;
        }
        if (!flock) {
          onpicked({ hue: Number(picked) });
          return;
        }
        const pose = CAW_POSES.find((one) => one.id === picked);
        if (pose) {
          onpicked({ pose: pose.id });
        }
      }
    }
  >
    {#if flock}
      {#each CAW_POSES as pose (pose.id)}
        <OptionGroupItem aria-label={pose.name} tile="picture" value={pose.id}>
          <MemberFace member={{ ...member, pose: pose.id }} size={56} />
        </OptionGroupItem>
      {/each}
    {:else}
      {#each HUES as hue (hue)}
        <OptionGroupItem
          aria-label={decidesWords.hueName(hue)}
          tile="picture"
          value={String(hue)}
        >
          <MemberFace member={{ ...member, hue }} size={56} />
        </OptionGroupItem>
      {/each}
    {/if}
  </OptionGroup>
  {#if flock}
    <p class="m-0 type-meta text-ink-muted">{decidesWords.posesNote}</p>
  {/if}
</div>
