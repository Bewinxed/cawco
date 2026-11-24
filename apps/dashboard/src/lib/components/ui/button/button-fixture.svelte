<script lang="ts">
  /**
   * The kit's Button running a flow of its own (its states file's), to be
   * pressed: its work is mock work on a timer, so each press plays the flow
   * through as the product does.
   *
   * - `succeeds`: a press runs the work; the slot spins, then draws a check.
   * - `fails`: a press runs the work; the slot spins, then draws a cross.
   * - `confirms`: a first press arms it (its words turn, a line runs out
   *   along its rim); a second press in time runs the work.
   * - `icon`: each press puts its icon on or takes it off.
   */
  import type { Component } from "svelte";
  import type { SVGAttributes } from "svelte/elements";
  import type { ButtonVariant } from "./button.svelte";
  import Button from "./button.svelte";

  let {
    flow,
    label,
    pendingLabel,
    confirm,
    icon,
    variant,
    work = 1400,
  }: {
    flow: "succeeds" | "fails" | "confirms" | "icon";
    label: string;
    pendingLabel?: string;
    confirm?: string;
    icon?: Component<SVGAttributes<SVGSVGElement>>;
    variant?: ButtonVariant;
    /** How long the mock work runs, ms. */
    work?: number;
  } = $props();

  let pending = $state(false);
  let failed = $state(false);
  let iconOn = $state(true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(timer));

  const run = () => {
    if (flow === "icon") {
      iconOn = !iconOn;
      return;
    }
    failed = false;
    pending = true;
    timer = setTimeout(() => {
      failed = flow === "fails";
      pending = false;
    }, work);
  };
</script>

<Button
  {confirm}
  {failed}
  icon={flow === "icon" && !iconOn ? undefined : icon}
  {label}
  onclick={run}
  {pending}
  {pendingLabel}
  {variant}
/>
