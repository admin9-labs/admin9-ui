<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { Size } from '@arco-design/web-vue';
  import {
    AIconPicker,
    ACoordinatePicker,
    AFilePicker,
    AImagePicker,
    AFileUploader,
    ACoverPicker,
    AFilterForm,
    AProTable,
    ATiptapEditor,
    AChatComposer,
    AChatMessageList,
    type FilePickerValue,
    type CoordinateValue,
    type CoverPickerValue,
    type ChatMessage,
  } from '../src';
  import createFakeFilePickerService from './fake-file-picker-service';
  import type { AcceptanceState } from './fake-acceptance-utils';

  const { locale } = useI18n();
  const size = ref<Size>('medium');
  const disabled = ref(false);
  const readonly = ref(false);
  const dark = ref(false);
  const narrow = ref(false);
  const state = ref<AcceptanceState>('normal');
  const service = computed(() => createFakeFilePickerService(state.value));
  const icon = ref<string>();
  const coordinate = ref<CoordinateValue>();
  const images = ref<FilePickerValue>([]);
  const files = ref<FilePickerValue>([]);
  const cover = ref<CoverPickerValue>({ mode: 'single', images: [null] });
  const html = ref('<p>编辑这段文字 / Edit this text</p>');
  const draft = ref('你好 Admin9');
  const messages = ref<ChatMessage[]>([]);
  const selected = ref<(string | number)[]>([]);
  const filter = ref({ keyword: 'initial' });
  const result = ref('等待操作');
  const key = import.meta.env.VITE_TENCENT_MAP_KEY || '';
  const send = (content: string) => {
    messages.value.push({ id: String(messages.value.length), role: 'user', content });
    messages.value.push({
      id: String(messages.value.length),
      role: 'assistant',
      content: '**收到** / Received\n\n```ts\nconst ready = true;\n```',
      status: 'complete',
    });
    draft.value = '';
    result.value = 'sent';
  };
  const fetcher = async ({ page, pageSize }: { page: number; pageSize: number }) => ({
    list: Array.from({ length: Math.min(pageSize, 30 - (page - 1) * pageSize) }, (_, index) => ({
      id: (page - 1) * pageSize + index + 1,
      name: `Row ${(page - 1) * pageSize + index + 1}`,
    })),
    total: 30,
  });
  watch(dark, (value) => {
    document.body.setAttribute('arco-theme', value ? 'dark' : 'light');
  });
</script>

<template>
  <main class="audit" :class="{ 'audit--narrow': narrow }">
    <h1>全组件契约验收</h1>
    <div class="audit__controls">
      <label
        >Size
        <select v-model="size" aria-label="Audit size"
          ><option>mini</option
          ><option>small</option
          ><option>medium</option
          ><option>large</option></select
        ></label
      >
      <label
        >Locale
        <select v-model="locale" aria-label="Audit locale"
          ><option>zh-CN</option
          ><option>en-US</option></select
        ></label
      >
      <label><input v-model="dark" type="checkbox" /> Dark</label>
      <label><input v-model="disabled" type="checkbox" /> Form disabled</label>
      <label><input v-model="readonly" type="checkbox" /> Readonly</label>
      <label><input v-model="narrow" type="checkbox" /> Narrow container</label>
      <label
        >Service
        <select v-model="state" aria-label="Audit service"
          ><option>normal</option
          ><option>empty</option
          ><option>error</option
          ><option>loading</option></select
        ></label
      >
    </div>
    <output id="audit-result">{{ result }}</output>
    <a-config-provider :size="size">
      <a-form
        :model="{ icon, coordinate, files, images, cover, html, draft }"
        :size="size"
        :disabled="disabled"
        layout="vertical"
      >
        <section id="audit-icon"
          ><h2>AIconPicker</h2
          ><a-form-item field="icon" label="Icon"><AIconPicker v-model="icon" :readonly="readonly" allow-clear /></a-form-item
        ></section>
        <section id="audit-coordinate"
          ><h2>ACoordinatePicker</h2
          ><a-form-item field="coordinate" label="Coordinate"
            ><ACoordinatePicker v-model="coordinate" :api-key="key" :readonly="readonly" allow-clear /></a-form-item
          ><output>{{ JSON.stringify(coordinate) }}</output></section
        >
        <section id="audit-image"
          ><h2>AImagePicker</h2
          ><a-form-item field="images" label="Images"
            ><AImagePicker
              v-model="images"
              :service="service"
              :readonly="readonly"
              display-mode="landscape"
              fit="cover"
              multiple
              :limit="3"
              can-upload /></a-form-item
        ></section>
        <section id="audit-file"
          ><h2>AFilePicker</h2
          ><a-form-item field="files" label="Files"
            ><AFilePicker
              v-model="files"
              :limit="4"
              :page-size="6"
              :service="service"
              :readonly="readonly"
              multiple
              can-upload
              @confirm="result = `files:${$event.length}`" /></a-form-item
        ></section>
        <section id="audit-upload"
          ><h2>AFileUploader</h2
          ><a-form-item label="Upload"
            ><AFileUploader
              :service="service"
              :file-types="['image']"
              @complete="result = `uploads:${$event.succeeded.length}`" /></a-form-item
        ></section>
        <section id="audit-cover"
          ><h2>ACoverPicker</h2
          ><a-form-item field="cover" label="Cover"
            ><ACoverPicker v-model="cover" :service="service" :readonly="readonly" /></a-form-item
        ></section>
        <section id="audit-editor"
          ><h2>ATiptapEditor</h2
          ><a-form-item field="html" label="Editor"
            ><ATiptapEditor v-model="html" :readonly="readonly" :service="service" /></a-form-item
        ></section>
        <section id="audit-composer"
          ><h2>AChatComposer</h2
          ><a-form-item field="draft" label="Draft"
            ><AChatComposer
              v-model="draft"
              :readonly="readonly"
              :textarea-attrs="{ 'aria-label': 'Audit composer' }"
              @submit="send" /></a-form-item
        ></section>
      </a-form>
      <section id="audit-messages"
        ><h2>AChatMessageList</h2><AChatMessageList :messages="messages" style="height: 280px"
      /></section>
      <section id="audit-filter"
        ><h2>AFilterForm</h2
        ><AFilterForm
          :model="filter"
          :size="size"
          :disabled="disabled"
          @search="result = `search:${$event.keyword}`"
          @reset="result = 'reset'"
          ><a-form-item field="keyword" label="Keyword"><a-input v-model="filter.keyword" /></a-form-item></AFilterForm
      ></section>
      <section id="audit-table"
        ><h2>AProTable</h2
        ><AProTable
          v-model:selected-keys="selected"
          :columns="[{ title: 'Name', dataIndex: 'name' }]"
          :fetcher="fetcher"
          :size="size"
          multiple
          searchable
          @selection-change="result = `keys:${$event.join(',')}`"
      /></section>
    </a-config-provider>
  </main>
</template>

<style scoped>
  .audit {
    max-width: 1100px;
    margin: auto;
    padding: 16px;
    color: var(--color-text-1);
    background: var(--color-bg-1);
  }

  .audit--narrow {
    max-width: 420px;
  }

  .audit__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 0;
  }

  section {
    min-width: 0;
    padding: 16px 0;
    border-bottom: 1px solid var(--color-border-2);
  }

  h2 {
    font-size: 18px;
  }
</style>
