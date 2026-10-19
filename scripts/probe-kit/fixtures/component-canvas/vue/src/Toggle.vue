<script setup>
defineProps({ on: { type: Boolean, default: false }, label: { type: String, default: "Wi-Fi" } });
</script>

<template>
  <label class="k-row">
    <span>{{ label }}</span>
    <span class="k-track" :data-on="on"><span class="k-knob" /></span>
  </label>
</template>
