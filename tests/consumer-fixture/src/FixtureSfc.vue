<script setup lang="ts">
import {
  AIconPicker,
  AMediaLibrary,
  AMediaPicker,
  AProTable,
  type MediaLibraryService,
} from '@admin9-labs/admin9-ui';

defineProps<{
  service: MediaLibraryService;
}>();

const fetchRows = async () => ({ list: [], total: 0 });
</script>

<template>
  <section data-testid="host-baseline-sfc">
    <AIconPicker model-value="" />
    <AProTable :columns="[{ title: 'Name', dataIndex: 'name' }]" :fetcher="fetchRows" />
    <AMediaPicker :service="service" :can-upload="false" :show-file-list="false" />
    <AMediaLibrary
      :service="service"
      :can-upload="false"
      :can-delete="false"
      :can-move="false"
      :can-manage-groups="false"
    />
  </section>
</template>
