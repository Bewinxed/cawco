<script lang="ts">
  const value = 1;
  const cast = value as unknown as string;
</script>

<p>{value as unknown as string}{cast}</p>
