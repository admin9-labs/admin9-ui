<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    AImagePicker,
    type AImagePickerExposed,
    type ImagePickerDisplayMode,
    type ImagePickerFit,
    type ImagePickerValue,
  } from '../src';
  import createFakeFilePickerService from './fake-file-picker-service';
  import type { AcceptanceState } from './fake-acceptance-utils';

  const { locale } = useI18n();
  const multiple = ref(false);
  const value = ref<ImagePickerValue>();
  const disabled = ref(false);
  const readonly = ref(false);
  const canUpload = ref(true);
  const canCreateGroup = ref(true);
  const canDeleteFiles = ref(true);
  const canMoveFiles = ref(true);
  const showFileList = ref(true);
  const displayMode = ref<ImagePickerDisplayMode>('square');
  const fit = ref<ImagePickerFit>('contain');
  const custom = ref(false);
  const narrow = ref(false);
  const dark = ref(false);
  const state = ref<AcceptanceState>('normal');
  const fixedPageSize = ref(false);
  const serverPageSize = ref(0);
  const showGroups = ref(true);
  const completedRequests = ref(0);
  const requestSummary = ref('尚未请求');
  const service = computed(() => {
    const adapter = createFakeFilePickerService(state.value, {
      pageSize: serverPageSize.value || undefined,
      onList: (params, result) => {
        completedRequests.value += 1;
        requestSummary.value = `第 ${params.page} 页 · 请求 ${params.pageSize} · 实际 ${result.pagination.pageSize} · 返回 ${result.list.length} / ${result.pagination.total} · ${completedRequests.value} 次响应`;
      },
    });
    if (!showGroups.value) delete adapter.listGroups;
    return adapter;
  });
  const picker = ref<AImagePickerExposed>();
  const changes = ref(0);
  const confirmations = ref(0);
  const uploads = ref(0);
  watch(multiple, (enabled) => {
    value.value = enabled ? [] : undefined;
  });
  watch(dark, (enabled) => {
    document.body.setAttribute('arco-theme', enabled ? 'dark' : 'light');
  });
</script>

<template>
  <section id="image-picker" class="acceptance-section image-acceptance">
    <h2>AImagePicker</h2>
    <div class="image-acceptance-controls">
      <label><input v-model="multiple" type="checkbox" /> 多图（上限 2 张）</label>
      <label><input v-model="disabled" type="checkbox" /> Form disabled</label>
      <label><input v-model="readonly" type="checkbox" /> Readonly</label>
      <label><input v-model="canUpload" type="checkbox" /> 弹窗上传</label>
      <label><input v-model="canCreateGroup" type="checkbox" /> 新增分组</label>
      <label><input v-model="canDeleteFiles" type="checkbox" /> 删除素材</label>
      <label><input v-model="canMoveFiles" type="checkbox" /> 移动素材</label>
      <label><input v-model="showFileList" type="checkbox" /> 显示图片列表</label>
      <label
        >展示模式
        <select v-model="displayMode" aria-label="Image display mode">
          <option>square</option>
          <option>landscape</option>
          <option>portrait</option>
          <option>banner</option>
        </select></label
      >
      <label
        >缩略图填充
        <select v-model="fit" aria-label="Image fit"
          ><option>contain</option
          ><option>cover</option></select
        ></label
      >
      <label><input v-model="custom" type="checkbox" /> 自定义入口</label>
      <label><input v-model="narrow" type="checkbox" /> 320px 容器</label>
      <label><input v-model="dark" type="checkbox" /> Dark</label>
      <label><input v-model="fixedPageSize" type="checkbox" /> 固定每页 24 张</label>
      <label><input v-model="showGroups" type="checkbox" /> 显示分组</label>
      <label
        >服务实际每页
        <select v-model="serverPageSize" aria-label="Image server page size">
          <option :value="0">按请求数量</option>
          <option :value="10">10</option>
          <option :value="24">24</option>
        </select></label
      >
      <label
        >语言
        <select v-model="locale"
          ><option>zh-CN</option
          ><option>en-US</option></select
        ></label
      >
      <label
        >Service
        <select v-model="state"
          ><option>normal</option
          ><option>empty</option
          ><option>error</option
          ><option>loading</option></select
        ></label
      >
      <a-button @click="value = multiple ? [] : undefined">外部重置</a-button>
      <a-button @click="picker?.clear()">清空字段</a-button>
    </div>
    <div class="component-frame image-acceptance-field" :class="{ 'is-narrow': narrow }">
      <a-form :model="{ image: value }" :disabled="disabled" layout="vertical">
        <a-form-item field="image" label="图片 / Images" :rules="[{ required: true, message: '请选择图片 / Choose images' }]">
          <AImagePicker
            ref="picker"
            v-model="value"
            :multiple="multiple"
            :limit="2"
            :service="service"
            :can-upload="canUpload"
            :can-create-group="canCreateGroup && showGroups"
            :can-delete-files="canDeleteFiles"
            :can-move-files="canMoveFiles && showGroups"
            :readonly="readonly"
            :show-file-list="showFileList"
            :display-mode="displayMode"
            :fit="fit"
            :page-size="fixedPageSize ? 24 : undefined"
            @change="changes += 1"
            @confirm="confirmations += 1"
            @upload-success="uploads += 1"
          >
            <template v-if="custom" #trigger="{ open, disabled: blocked, selectedCount, limitReached }"
              ><a-button :disabled="blocked" @click="open"
                >自定义选择（{{ selectedCount }}{{ limitReached ? '，已满' : '' }}）</a-button
              ></template
            >
          </AImagePicker>
        </a-form-item>
      </a-form>
    </div>
    <p aria-live="polite">change: {{ changes }} · confirm: {{ confirmations }} · upload: {{ uploads }}</p>
    <p data-testid="image-picker-request-summary">{{ requestSummary }}</p>
    <pre class="image-acceptance-value">{{ JSON.stringify(value ?? null, null, 2) }}</pre>
  </section>
</template>

<style scoped lang="less">
  .image-acceptance {
    padding: 24px;
    color: var(--color-text-1);
    background: var(--color-bg-1);
  }

  .image-acceptance-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
  }

  .image-acceptance-field {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    color: var(--color-text-1);
    background: var(--color-bg-2);
  }

  .image-acceptance-field.is-narrow {
    width: 320px;
  }

  .image-acceptance-value {
    overflow: auto;
  }
</style>
