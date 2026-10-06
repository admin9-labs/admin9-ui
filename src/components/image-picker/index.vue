<script setup lang="ts">
  import { computed, inject, nextTick, onBeforeUnmount, ref, shallowRef, toRef, watch } from 'vue';
  import { FormItem, Message, Upload, useFormItem, type FileItem as UploadFileItem } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';
  import AFilePicker from '../file-picker/index.vue';
  import type { AFilePickerExposed } from '../file-picker/types';
  import type { FileItem, FilePickerAdapter } from '../../services/types';
  import admin9UIOptionsKey from '../../internal/options';
  import safeFileUrl from '../../internal/file-url';
  import FileImagePreview from '../../internal/file-image-preview.vue';
  import type { AImagePickerEmits, AImagePickerExposed, AImagePickerProps, AImagePickerSlots, ImagePickerValue } from './types';
  import {
    imageLimit,
    imageValueSignature,
    isEligibleImage,
    modelMatchesImages,
    normalizeImages,
    replaceImage,
    sameImages,
  } from './selection';

  defineOptions({ name: 'AImagePicker' });
  const props = withDefaults(defineProps<AImagePickerProps>(), {
    modelValue: undefined,
    multiple: false,
    limit: 0,
    showFileList: true,
    displayMode: 'square',
    fit: 'contain',
    service: undefined,
    canUpload: false,
    canCreateGroup: false,
    canDeleteFiles: false,
    canMoveFiles: false,
    accept: 'image/*',
    disabled: false,
    readonly: false,
    size: undefined,
    buttonText: '',
    pageSize: undefined,
    defaultView: 'grid',
  });
  const emit = defineEmits<AImagePickerEmits>();
  defineSlots<AImagePickerSlots>();
  const { t } = useI18n();
  const { mergedDisabled, mergedSize, mergedError, eventHandlers } = useFormItem({
    disabled: toRef(props, 'disabled'),
    size: toRef(props, 'size'),
  });
  const blocked = computed(() => Boolean(mergedDisabled.value || props.readonly));
  const options = inject(admin9UIOptionsKey, undefined);
  const service = computed(() => props.service ?? options?.fileService);
  const limit = computed(() => imageLimit(props.limit));
  const images = computed(() => normalizeImages(props.modelValue, props.multiple, limit.value));
  const limitReached = computed(() => images.value.length >= (props.multiple ? limit.value || Infinity : 1));
  const label = computed(() => props.buttonText || t('admin9Ui.imagePicker.choose'));
  const modelKey = computed(() => imageValueSignature(props.modelValue));
  const operationKey = computed(() => JSON.stringify([modelKey.value, props.multiple, limit.value]));
  const pendingValidation = shallowRef<{ key: string }>();
  const picker = ref<AFilePickerExposed>();
  const pickerValue = ref<ImagePickerValue>();
  const operation = shallowRef<{ targetId?: string; key: string; service?: FilePickerAdapter }>();
  const pickerMultiple = computed(() => props.multiple && operation.value?.targetId === undefined);
  const visible = ref(false);
  const previewStates = ref(new Map<string, number>());
  const previewIndex = ref<number>();
  let previewTrigger: HTMLElement | undefined;
  const previewItems = computed(() => images.value.map((item) => ({ src: safeFileUrl(item.url) || '', name: item.name })));
  const closePreview = async () => {
    previewIndex.value = undefined;
    const trigger = previewTrigger;
    previewTrigger = undefined;
    await nextTick();
    if (!mergedDisabled.value && trigger?.isConnected) trigger.focus();
  };
  const rememberPreviewTrigger = (event: MouseEvent) => {
    previewTrigger = event.currentTarget as HTMLElement;
  };
  const openPreview = (item: UploadFileItem) => {
    if (mergedDisabled.value) return;
    const index = images.value.findIndex((image) => image.id === item.uid);
    if (index < 0) return;
    previewTrigger ??= document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    previewIndex.value = index;
  };
  const uploadItems = computed<UploadFileItem[]>(() =>
    images.value.map((item) => ({
      uid: item.id,
      name: item.name,
      url: safeFileUrl(item.url),
      status: 'done',
    }))
  );
  const previewKey = computed(() =>
    JSON.stringify([Boolean(mergedDisabled.value), uploadItems.value.map(({ uid, url }) => [uid, url])])
  );

  // Run after the parent render, before resetFields releases its validation guard.
  // Vue also cancels this component-owned watcher when the field is unmounted.
  watch(
    pendingValidation,
    (pending) => {
      if (pending?.key === operationKey.value) eventHandlers.value?.onChange?.();
    },
    { flush: 'post' }
  );

  const close = () => {
    operation.value = undefined;
    picker.value?.close();
  };
  const startSelection = async (targetId?: string) => {
    if (blocked.value || visible.value || operation.value) return;
    const selected = targetId === undefined ? images.value : images.value.filter((item) => item.id === targetId);
    if (targetId !== undefined && selected.length === 0) return;
    const current = { targetId, key: operationKey.value, service: service.value };
    operation.value = current;
    const snapshot = selected.map((item) => ({ ...item }));
    pickerValue.value = props.multiple && targetId === undefined ? snapshot : snapshot[0];
    await nextTick();
    if (operation.value !== current || blocked.value || current.key !== operationKey.value || current.service !== service.value)
      return;
    picker.value?.open();
  };
  const open = () => {
    startSelection();
  };
  const publish = (items: FileItem[]) => {
    if (sameImages(images.value, items) && modelMatchesImages(props.modelValue, items, props.multiple)) return false;
    const value = props.multiple ? items : items[0];
    pendingValidation.value = { key: JSON.stringify([imageValueSignature(value), props.multiple, limit.value]) };
    emit('update:modelValue', value);
    emit('change', value);
    return true;
  };
  const confirm = (selection: FileItem[]) => {
    const current = operation.value;
    if (!current || blocked.value || current.key !== operationKey.value || current.service !== service.value) return;
    operation.value = undefined;
    let next: FileItem[];
    if (current.targetId !== undefined) {
      const item = selection[0];
      if (!isEligibleImage(item)) {
        Message.warning(t('admin9Ui.imagePicker.selectImage'));
        return;
      }
      const replacement = replaceImage(images.value, current.targetId, item);
      if (!replacement) {
        Message.warning(t('admin9Ui.imagePicker.duplicate'));
        return;
      }
      next = replacement;
    } else {
      next = normalizeImages(props.multiple ? selection : selection[0], props.multiple, limit.value);
    }
    publish(next);
    emit('confirm', next);
  };
  const remove = (item: UploadFileItem) => {
    if (!blocked.value) {
      close();
      publish(images.value.filter((image) => image.id !== item.uid));
    }
    return false;
  };
  const clear = () => {
    if (blocked.value) return;
    close();
    if (publish([])) emit('clear');
  };
  const refresh = async () => {
    await picker.value?.refresh();
  };
  const onVisibleChange = (value: boolean) => {
    visible.value = value;
    if (!value) operation.value = undefined;
    emit('visibleChange', value);
  };
  const previewSource = (id: string) => {
    const item = images.value.find((image) => image.id === id);
    const state = previewStates.value.get(id) ?? 0;
    if (!item || state >= 2) return undefined;
    return state === 0 ? safeFileUrl(item.thumbnail) || safeFileUrl(item.url) : safeFileUrl(item.url);
  };
  const onPreviewError = (id: string) => {
    const item = images.value.find((image) => image.id === id);
    const thumbnail = safeFileUrl(item?.thumbnail);
    previewStates.value.set(id, !previewStates.value.get(id) && thumbnail && thumbnail !== safeFileUrl(item?.url) ? 1 : 2);
  };
  watch([operationKey, service, blocked], () => {
    if (operation.value) close();
  });
  watch(previewKey, closePreview);
  watch(modelKey, () => {
    previewStates.value = new Map();
  });
  onBeforeUnmount(close);
  defineExpose<AImagePickerExposed>({ open, close, clear, refresh });
</script>

<template>
  <div
    class="a9-image-picker"
    :class="[
      `a9-image-picker--${displayMode}`,
      `a9-image-picker--fit-${fit}`,
      { 'is-disabled': mergedDisabled, 'is-error': mergedError },
    ]"
    :aria-invalid="mergedError || undefined"
  >
    <FormItem no-style :validate-trigger="[]">
      <AFilePicker
        ref="picker"
        v-model="pickerValue"
        :service="service"
        :file-types="['image']"
        :multiple="pickerMultiple"
        :limit="pickerMultiple ? limit : 1"
        :allow-clear="false"
        :disabled="blocked"
        :readonly="readonly"
        :size="mergedSize"
        :accept="accept"
        :can-upload="canUpload"
        :can-create-group="canCreateGroup"
        :can-delete-files="canDeleteFiles"
        :can-move-files="canMoveFiles"
        :page-size="pageSize"
        :default-view="defaultView"
        @confirm="confirm"
        @visible-change="onVisibleChange"
        @upload-success="emit('uploadSuccess', $event)"
        @upload-error="emit('uploadError', $event)"
      >
        <template #toolbar-left><slot name="toolbar-left" /></template>
        <template #toolbar-right><slot name="toolbar-right" /></template>
        <template #trigger>
          <div class="a9-image-picker__content">
            <Upload
              v-if="showFileList"
              :key="previewKey"
              class="a9-image-picker__cards"
              :file-list="uploadItems"
              list-type="picture-card"
              :auto-upload="false"
              :show-upload-button="false"
              :show-retry-button="false"
              :show-cancel-button="false"
              :show-remove-button="!blocked"
              :show-preview-button="!mergedDisabled"
              :image-preview="false"
              :disabled="blocked"
              :on-before-upload="() => false"
              :on-before-remove="remove"
              @preview="openPreview"
            >
              <template #image="{ fileItem }">
                <img
                  v-if="previewSource(fileItem.uid)"
                  :src="previewSource(fileItem.uid)"
                  :alt="fileItem.name"
                  loading="lazy"
                  @error="onPreviewError(fileItem.uid)"
                />
                <span
                  v-else
                  class="a9-image-picker__fallback"
                  role="img"
                  :aria-label="t('admin9Ui.imagePicker.unavailable', { name: fileItem.name })"
                  ><icon-image-close
                /></span>
              </template>
              <template #preview-icon>
                <button
                  type="button"
                  class="a9-image-picker__action"
                  :disabled="mergedDisabled"
                  :aria-label="t('admin9Ui.imagePicker.preview')"
                  :title="t('admin9Ui.imagePicker.preview')"
                  @click="rememberPreviewTrigger"
                  ><icon-eye
                /></button>
              </template>
              <template #remove-icon>
                <button
                  type="button"
                  class="a9-image-picker__action"
                  :disabled="blocked"
                  :aria-label="t('admin9Ui.imagePicker.remove')"
                  :title="t('admin9Ui.imagePicker.remove')"
                  ><icon-close
                /></button>
              </template>
              <template #extra-button="file">
                <button
                  v-if="!blocked"
                  type="button"
                  class="a9-image-picker__action"
                  :aria-label="t('admin9Ui.imagePicker.replace')"
                  :title="t('admin9Ui.imagePicker.replace')"
                  @click.stop="startSelection(file.uid)"
                  ><icon-swap
                /></button>
              </template>
            </Upload>
            <slot
              name="trigger"
              :open="open"
              :selected-items="images"
              :selected-count="images.length"
              :disabled="blocked"
              :readonly="readonly"
              :limit-reached="limitReached"
            >
              <button
                v-if="showFileList && !readonly && !limitReached"
                type="button"
                class="a9-image-picker__add"
                :disabled="blocked"
                @click="open"
                ><icon-plus /><span>{{ label }}</span></button
              >
              <a-button v-else-if="!showFileList && !readonly" :disabled="blocked" :size="mergedSize" @click="open">{{
                label
              }}</a-button>
            </slot>
            <span v-if="showFileList && readonly && !images.length" class="a9-image-picker__empty">{{
              t('admin9Ui.imagePicker.empty')
            }}</span>
          </div>
        </template>
      </AFilePicker>
    </FormItem>
    <FileImagePreview
      v-if="previewIndex !== undefined"
      :src="previewItems[previewIndex].src"
      :name="previewItems[previewIndex].name"
      :items="previewItems"
      :current="previewIndex"
      @close="closePreview"
    />
  </div>
</template>

<style scoped lang="less">
  .a9-image-picker {
    --a9-image-picker-card-width: 80px;
    --a9-image-picker-card-height: 80px;

    width: 100%;
    min-width: 0;

    &--landscape {
      --a9-image-picker-card-width: 144px;
      --a9-image-picker-card-height: 81px;
    }

    &--portrait {
      --a9-image-picker-card-width: 80px;
      --a9-image-picker-card-height: 112px;
    }

    &--banner {
      --a9-image-picker-card-width: 200px;
      --a9-image-picker-card-height: 64px;
    }

    :deep(.a9-file-picker__trigger-row),
    :deep(.a9-file-picker__trigger) {
      width: 100%;
      min-width: 0;
    }

    &__content {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: flex-start;
      width: 100%;
      min-width: 0;
    }

    &__cards,
    :deep(.arco-upload-list) {
      display: contents;
    }

    :deep(.arco-upload-list-picture) {
      flex: 0 1 var(--a9-image-picker-card-width);
      width: var(--a9-image-picker-card-width);
      max-width: 100%;
      height: var(--a9-image-picker-card-height);
      margin: 0;
      background: var(--color-fill-2);
    }

    :deep(.arco-upload-list-picture img) {
      object-fit: contain;
    }

    &--fit-cover :deep(.arco-upload-list-picture img) {
      object-fit: cover;
    }

    :deep(.arco-upload-list-picture-operation) {
      display: flex;
      align-items: center;
      justify-content: space-evenly;
      height: 100%;
    }

    :deep(.arco-upload-list-picture:focus-within .arco-upload-list-picture-mask) {
      opacity: 1;
    }

    &__add {
      display: flex;
      flex: 0 1 var(--a9-image-picker-card-width);
      flex-direction: column;
      gap: 8px;
      align-items: center;
      justify-content: center;
      width: var(--a9-image-picker-card-width);
      max-width: 100%;
      height: var(--a9-image-picker-card-height);
      padding: 4px;
      color: var(--color-text-2);
      font: inherit;
      background: var(--color-fill-2);
      border: 1px dashed var(--color-border-3);
      border-radius: var(--border-radius-small);
      cursor: pointer;
    }

    &__action {
      padding: 2px;
      color: inherit;
      font: inherit;
      line-height: 1;
      background: transparent;
      border: 0;
      cursor: pointer;
    }

    &__add:disabled,
    &__action:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    &__add:focus-visible,
    &__action:focus-visible {
      outline: 2px solid rgb(var(--primary-6));
      outline-offset: 2px;
    }

    &__fallback {
      color: var(--color-text-3);
      font-size: 24px;
    }

    &__empty {
      color: var(--color-text-3);
    }

    &.is-error &__add {
      border-color: rgb(var(--danger-6));
    }

    &.is-error :deep(.arco-upload-list-picture) {
      box-shadow: 0 0 0 1px rgb(var(--danger-6));
    }

    @media (hover: none) {
      :deep(.arco-upload-list-picture-mask) {
        opacity: 1;
      }
    }
  }
</style>
