<script setup>
defineProps({ label: { type: String, default: "Save" } });
</script>

<template>
  <button class="k-btn" type="button">{{ label }}</button>
</template>
