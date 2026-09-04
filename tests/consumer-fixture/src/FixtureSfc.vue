<script setup lang="ts">
  import { reactive, ref } from 'vue';
  import {
    AIconPicker,
    ACoordinatePicker,
    AFilePicker,
    AFileUploader,
    AFilterForm,
    AProTable,
    ATiptapEditor,
    type FilePickerAdapter,
    type FileUploadCapability,
    type FileItem,
    type Action,
  } from '@admin9-labs/admin9-ui';

  defineProps<{
    service: FilePickerAdapter;
    filePickerService: FilePickerAdapter;
    fileUploaderService: FileUploadCapability;
  }>();

  interface FixtureRow {
    id: number;
    name: string;
  }

  const fetchRows = async () => ({ list: [] as FixtureRow[], total: 0 });
  const rowActions: Action<FixtureRow>[] = [
    { label: 'Edit', permissions: 'records.update', onClick: () => undefined },
  ];
  const attachments = ref<FileItem[]>([]);
  const filters = reactive({ keyword: '', status: undefined as string | undefined });
</script>

<template>
  <section data-testid="host-baseline-sfc">
    <AIconPicker model-value="" />
    <AFilterForm :model="filters">
      <a-form-item field="keyword" label="Keyword"><a-input v-model="filters.keyword" /></a-form-item>
      <a-form-item field="status" label="Status"><a-select v-model="filters.status" /></a-form-item>
    </AFilterForm>
    <ACoordinatePicker :model-value="{ latitude: 27.8945, longitude: 102.2644 }" api-key="fixture-key" readonly />
    <AProTable
      :columns="[{ title: 'Name', dataIndex: 'name' }]"
      :fetcher="fetchRows"
      :actions="rowActions"
      :permission="(permission) => permission === 'records.update'"
      :pagination="false"
      @loading-change="() => undefined"
    >
      <template #footer="{ total }">{{ total }}</template>
      <template #popover><span data-testid="fixture-table-popover" /></template>
    </AProTable>
    <ATiptapEditor
      model-value="<p>Fixture <img src='/fixture-inline.png' alt='Inline fixture' data-display='inline' data-size='1em'> content</p><audio src='/fixture-sfc.mp3' data-width='compact' data-align='right'></audio>"
      :service="service"
      default-image-display="inline"
      max-height="32rem"
      :can-upload-image="false"
      :can-upload-video="false"
      :can-upload-audio="false"
    />
    <AFilePicker v-model="attachments" :service="filePickerService" :file-types="['image', 'document']" :limit="3" multiple />
    <AFileUploader :service="fileUploaderService" file-type="image" group-id="fixture-images" accept="image/*" />
  </section>
</template>
