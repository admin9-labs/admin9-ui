<script setup lang="ts">
  import {
    AIconPicker,
    AMediaLibrary,
    AMediaPicker,
    AProTable,
    ATiptapEditor,
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
    <ATiptapEditor
      model-value="<p>Fixture <img src='/fixture-inline.png' alt='Inline fixture' data-display='inline' data-size='1em'> content</p><audio src='/fixture-sfc.mp3' data-width='compact' data-align='right'></audio>"
      :service="service"
      default-image-display="inline"
      max-height="32rem"
      :can-upload-image="false"
      :can-upload-video="false"
      :can-upload-audio="false"
    />
    <AMediaPicker :service="service" :can-upload="false" :show-file-list="false" />
    <AMediaLibrary :service="service" :can-upload="false" :can-delete="false" :can-move="false" :can-manage-groups="false" />
  </section>
</template>
