<script setup lang="ts">
  import { reactive, ref } from 'vue';
  import {
    AChatMessageList,
    AChatComposer,
    ACoverPicker,
    type AChatMessageListExposed,
    type AChatComposerExposed,
    type ChatComposerSize,
    type ChatMessage,
    type CoverPickerValue,
    type CoverPickerSize,
    AIconPicker,
    ACoordinatePicker,
    AFilePicker,
    AImagePicker,
    type AImagePickerExposed,
    AFileUploader,
    AFilterForm,
    AProTable,
    ATiptapEditor,
    type FilePickerAdapter,
    type FileUploadCapability,
    type FileItem,
    type ProTableAction,
    type ProTableRefreshHandler,
    type TiptapDocument,
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
  const refreshRows: ProTableRefreshHandler = ({ refresh }) => refresh();
  const rowActions: ProTableAction<FixtureRow>[] = [{ label: 'Edit', permissions: 'records.update', onClick: () => undefined }];
  const chatMessages = ref<ChatMessage[]>([{ id: 'a', role: 'assistant', content: '**fixture**' }]);
  const draft = ref('draft');
  const chatComposerSize: ChatComposerSize = 'medium';
  const chatList = ref<AChatMessageListExposed>();
  const composer = ref<AChatComposerExposed>();
  const submitChat = (value: string) => {
    chatMessages.value.push({ id: `u-${chatMessages.value.length}`, role: 'user', content: value });
  };
  const image = ref<FileItem>();
  const imagePicker = ref<AImagePickerExposed>();
  const attachments = ref<FileItem[]>([]);
  const cover = ref<CoverPickerValue>({ mode: 'triple', images: [null, null, null] });
  const coverSize: CoverPickerSize = 'small';
  const filters = reactive({ keyword: '', status: undefined as string | undefined });
  const htmlContent = ref('<p>HTML model</p>');
  const jsonContent = ref<TiptapDocument>({ type: 'doc', content: [{ type: 'paragraph' }] });
  const editorRef = ref<InstanceType<typeof ATiptapEditor>>();
  const onHTMLChange = (value: string) => {
    htmlContent.value = value;
  };
  const onJSONChange = (value: TiptapDocument) => {
    jsonContent.value = value;
  };
</script>

<template>
  <section data-testid="host-baseline-sfc">
    <AImagePicker
      ref="imagePicker"
      v-model="image"
      :service="filePickerService"
      display-mode="landscape"
      fit="cover"
      can-create-group
      can-delete-files
      can-move-files
    />
    <AImagePicker v-model="attachments" :service="filePickerService" multiple :limit="2"
      ><template #trigger="{ open, disabled, selectedCount, limitReached }"
        ><button :disabled="disabled" :data-full="limitReached" @click="open">{{ selectedCount }}</button></template
      ></AImagePicker
    >
    <AChatMessageList ref="chatList" :messages="chatMessages" style="height: 240px">
      <template #footer="{ message, index }"
        ><span>{{ message.id }}:{{ index }}</span></template
      >
    </AChatMessageList>
    <AChatComposer
      ref="composer"
      v-model="draft"
      :size="chatComposerSize"
      @submit="submitChat"
      @stop="chatList?.scrollToBottom()"
    >
      <template #toolbar="{ size, disabled, generating, submitDisabled }"
        ><button :data-size="size" :disabled="disabled || submitDisabled" @click="composer?.focus()">{{
          generating
        }}</button></template
      >
      <template #action="{ size, disabled, generating, canSubmit, activate }">
        <button :data-size="size" :disabled="disabled || (!generating && !canSubmit)" @click="activate">Send</button>
      </template>
    </AChatComposer>
    <ACoverPicker
      v-model="cover"
      :size="coverSize"
      :service="filePickerService"
      can-create-group
      can-delete-files
      can-move-files
    />
    <AIconPicker model-value="" />
    <ATiptapEditor
      ref="editorRef"
      :service="filePickerService"
      can-create-group
      can-delete-files
      can-move-files
      v-model="htmlContent"
      @change="(value) => onHTMLChange(value)"
      @update:model-value="onHTMLChange"
    />
    <ATiptapEditor
      v-model="jsonContent"
      value-format="json"
      @change="(value) => onJSONChange(value)"
      @update:model-value="onJSONChange"
    />
    <AFilterForm :model="filters" :field-flex="{ keyword: 2, status: 1 }">
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
      :pagination-options="{ showTotal: false, showPageSize: false }"
      :selection-options="{ showCheckedAll: true, onlyCurrent: true }"
      :refresh-handler="refreshRows"
      title="Fixture records"
      refreshable
      surface
      multiple
      @data-change="() => undefined"
      @loading-change="() => undefined"
    >
      <template #surface-title>Fixture records slot</template>
      <template #toolbar-left><a-button>Create</a-button></template>
      <template #toolbar-right><a-button>Export</a-button></template>
      <template #before-table><span>Fixture summary</span></template>
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
    <AFilePicker
      v-model="attachments"
      :service="filePickerService"
      :file-types="['image', 'document']"
      :limit="3"
      multiple
      can-create-group
      can-delete-files
      can-move-files
    />
    <AFileUploader :service="fileUploaderService" :file-types="['image']" group-id="fixture-images" accept="image/*" />
  </section>
</template>
