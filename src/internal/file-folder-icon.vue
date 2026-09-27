<script setup lang="ts">
  defineProps<{ open: boolean }>();
</script>

<template>
  <svg
    viewBox="0 0 48 48"
    width="1em"
    height="1em"
    stroke="currentColor"
    stroke-width="4"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="open">
      <path d="M6 37V11a2 2 0 0 1 2-2h13l4 5h13a2 2 0 0 1 2 2v5H14Z" />
      <path d="M6 39h29a2 2 0 0 0 2-1.5L43 21H14Z" />
    </template>
    <path
      v-else
      d="M6 13h18l-2.527-3.557a1.077 1.077 0 0 0-.88-.443H7.06C6.474 9 6 9.448 6 10v3Zm0 0h33.882c1.17 0 2.118.895 2.118 2v21c0 1.105-.948 3-2.118 3H8.118C6.948 39 6 38.105 6 37V13Z"
    />
  </svg>
</template>
