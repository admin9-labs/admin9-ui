<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue';
  import { useFormItem } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';
  import AFilePicker from '../file-picker/index.vue';
  import type { FileItem } from '../../services/types';
  import type { ACoverPickerProps, CoverMode, CoverPickerValue } from './types';

  defineOptions({ name: 'ACoverPicker' });

  const props = withDefaults(defineProps<ACoverPickerProps>(), {
    modelValue: () => ({ mode: 'single', images: [null] }),
    size: 'medium',
    service: undefined,
    canUpload: false,
    accept: 'image/*',
    disabled: false,
  });

  const emit = defineEmits<{
    (e: 'update:modelValue', value: CoverPickerValue): void;
    (e: 'change', value: CoverPickerValue): void;
    (e: 'visibleChange', visible: boolean): void;
    (e: 'uploadSuccess', item: FileItem): void;
    (e: 'uploadError', error: unknown): void;
  }>();

  const { t } = useI18n();
  const { mergedDisabled } = useFormItem({ disabled: toRef(props, 'disabled') });
  const picker = ref<{ open: () => void; close: () => void; clear: () => void }>();
  const pickerValue = ref<FileItem>();
  const currentValue = ref<CoverPickerValue>({ mode: 'single', images: [null] });
  const previewStates = ref<[number, number, number]>([0, 0, 0]);
  const slotButtons: Array<HTMLButtonElement | undefined> = [];
  const activeIndex = ref<number>();
  const pickerVisible = ref(false);
  let operationGeneration = 0;
  let suppressFocusRestore = false;
  let lastCorrectionSignature = '';
  let lastEmittedSignature = '';

  const itemFields: (keyof FileItem)[] = [
    'id',
    'name',
    'type',
    'groupId',
    'url',
    'path',
    'size',
    'mime',
    'extension',
    'thumbnail',
    'duration',
    'createdAt',
    'status',
  ];

  const sameItem = (left: FileItem, right: FileItem) => itemFields.every((field) => left[field] === right[field]);
  const sameSlot = (left: FileItem | null, right: FileItem | null) => {
    if (left === null || right === null) return left === right;
    return sameItem(left, right);
  };
  const sameValue = (left: CoverPickerValue, right: CoverPickerValue) =>
    left.mode === right.mode &&
    left.images.length === right.images.length &&
    left.images.every((item, index) => sameSlot(item, right.images[index] ?? null));
  const isEligibleImage = (value: unknown): value is FileItem => {
    if (!value || typeof value !== 'object') return false;
    const item = value as FileItem;
    return (
      typeof item.id === 'string' &&
      item.id.trim().length > 0 &&
      item.type === 'image' &&
      typeof item.url === 'string' &&
      item.url.trim().length > 0 &&
      (item.status === undefined || item.status === 'ready')
    );
  };
  const sanitizeSlot = (value: unknown) => (isEligibleImage(value) ? value : null);
  const normalizeValue = (value: unknown): CoverPickerValue => {
    if (!value || typeof value !== 'object') return { mode: 'single', images: [null] };
    const candidate = value as { mode?: unknown; images?: unknown };
    const images = Array.isArray(candidate.images) ? candidate.images : [];
    if (candidate.mode === 'none') return { mode: 'none', images: [] };
    if (candidate.mode === 'triple') {
      return {
        mode: 'triple',
        images: [sanitizeSlot(images[0]), sanitizeSlot(images[1]), sanitizeSlot(images[2])],
      };
    }
    return { mode: 'single', images: [sanitizeSlot(images[0])] };
  };
  const rawMatchesValue = (value: unknown, normalized: CoverPickerValue) => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { mode?: unknown; images?: unknown };
    if (candidate.mode !== normalized.mode || !Array.isArray(candidate.images)) return false;
    if (candidate.images.length !== normalized.images.length) return false;
    return candidate.images.every((item, index) => {
      const normalizedItem = normalized.images[index] ?? null;
      if (item === null || normalizedItem === null) return item === normalizedItem;
      return isEligibleImage(item) && sameItem(item, normalizedItem);
    });
  };
  const valueSignature = (value: CoverPickerValue) =>
    `${value.mode}:${value.images
      .map((item) => (item ? JSON.stringify(itemFields.map((field) => item[field] ?? null)) : 'null'))
      .join('|')}`;
  const inputSignature = (value: unknown) => {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  const slots = computed<(FileItem | null)[]>(() => currentValue.value.images);
  const slotCountClass = computed(() => `is-${currentValue.value.mode}`);
  const resetPreviews = () => {
    previewStates.value = [0, 0, 0];
  };
  const previewSource = (item: FileItem, index: number) => {
    const state = previewStates.value[index] ?? 0;
    if (state >= 2) return undefined;
    if (state === 1) return item.url || undefined;
    return item.thumbnail || item.url || undefined;
  };
  const onPreviewError = (item: FileItem, index: number) => {
    const state = previewStates.value[index] ?? 0;
    if (state === 0 && item.thumbnail && item.url && item.thumbnail !== item.url) previewStates.value[index] = 1;
    else previewStates.value[index] = 2;
  };
  const slotLabel = (item: FileItem | null, index: number) =>
    item
      ? t('admin9Ui.coverPicker.replacePosition', { index: index + 1, name: item.name })
      : t('admin9Ui.coverPicker.selectPosition', { index: index + 1 });
  const setSlotButton = (element: unknown, index: number) => {
    if (typeof HTMLButtonElement !== 'undefined' && element instanceof HTMLButtonElement) slotButtons[index] = element;
    else slotButtons[index] = undefined;
  };

  const closePicker = (restoreFocus: boolean) => {
    operationGeneration += 1;
    suppressFocusRestore = !restoreFocus;
    picker.value?.close();
    if (!pickerVisible.value) {
      activeIndex.value = undefined;
      pickerValue.value = undefined;
      suppressFocusRestore = false;
    }
  };
  const publish = (value: CoverPickerValue) => {
    const normalized = normalizeValue(value);
    if (sameValue(currentValue.value, normalized)) return false;
    currentValue.value = normalized;
    resetPreviews();
    lastEmittedSignature = valueSignature(normalized);
    emit('update:modelValue', normalized);
    emit('change', normalized);
    return true;
  };
  const changeMode = (value: string | number | boolean) => {
    if (mergedDisabled.value || !['single', 'triple', 'none'].includes(String(value))) return;
    const mode = String(value) as CoverMode;
    if (mode === currentValue.value.mode) return;
    closePicker(false);
    if (mode === 'none') {
      publish({ mode: 'none', images: [] });
      return;
    }
    const firstImage = currentValue.value.images.find((item): item is FileItem => item !== null) ?? null;
    if (mode === 'single') publish({ mode: 'single', images: [firstImage] });
    else publish({ mode: 'triple', images: [firstImage, null, null] });
  };
  const openPicker = async (index: number) => {
    if (mergedDisabled.value || index < 0 || index >= currentValue.value.images.length) return;
    closePicker(false);
    const generation = operationGeneration;
    activeIndex.value = index;
    pickerValue.value = currentValue.value.images[index] ?? undefined;
    await nextTick();
    if (generation !== operationGeneration || mergedDisabled.value || activeIndex.value !== index) return;
    picker.value?.open();
  };
  const removeImage = (index: number) => {
    if (mergedDisabled.value || currentValue.value.mode === 'none') return;
    closePicker(false);
    if (currentValue.value.mode === 'single') {
      publish({ mode: 'single', images: [null] });
      return;
    }
    const images: [FileItem | null, FileItem | null, FileItem | null] = [...currentValue.value.images];
    images[index] = null;
    publish({ mode: 'triple', images });
  };
  const onPickerChange = (items: FileItem[]) => {
    const index = activeIndex.value;
    const item = items[0] ?? null;
    if (index === undefined || mergedDisabled.value || (item !== null && !isEligibleImage(item))) return;
    if (currentValue.value.mode === 'single' && index === 0) {
      publish({ mode: 'single', images: [item] });
      return;
    }
    if (currentValue.value.mode !== 'triple' || index >= 3) return;
    const images: [FileItem | null, FileItem | null, FileItem | null] = [...currentValue.value.images];
    images[index] = item;
    publish({ mode: 'triple', images });
  };
  const onPickerVisibleChange = (visible: boolean) => {
    pickerVisible.value = visible;
    emit('visibleChange', visible);
    if (visible) return;
    const focusIndex = activeIndex.value;
    activeIndex.value = undefined;
    picker.value?.clear();
    pickerValue.value = undefined;
    operationGeneration += 1;
    const shouldRestoreFocus = !suppressFocusRestore && focusIndex !== undefined;
    suppressFocusRestore = false;
    if (shouldRestoreFocus) nextTick(() => slotButtons[focusIndex]?.focus());
  };

  watch(
    () => props.modelValue,
    (value) => {
      const normalized = normalizeValue(value);
      const signature = valueSignature(normalized);
      const isOwnEcho = signature === lastEmittedSignature;
      if (pickerVisible.value && !isOwnEcho && !sameValue(currentValue.value, normalized)) closePicker(false);
      currentValue.value = normalized;
      resetPreviews();
      if (isOwnEcho) lastEmittedSignature = '';

      if (rawMatchesValue(value, normalized)) {
        lastCorrectionSignature = '';
        return;
      }
      const correctionSignature = `${inputSignature(value)}=>${signature}`;
      if (correctionSignature === lastCorrectionSignature) return;
      lastCorrectionSignature = correctionSignature;
      lastEmittedSignature = signature;
      emit('update:modelValue', normalized);
      emit('change', normalized);
    },
    { deep: true, immediate: true }
  );
  watch(
    () => props.service,
    (service, previous) => {
      if (service !== previous && pickerVisible.value) closePicker(false);
    }
  );
  watch(
    () => mergedDisabled.value,
    (disabled) => {
      if (disabled && pickerVisible.value) closePicker(false);
    }
  );
  onBeforeUnmount(() => closePicker(false));
</script>

<template>
  <div class="a9-cover-picker" :class="[`a9-cover-picker--${size}`, { 'is-disabled': mergedDisabled }]">
    <a-radio-group
      class="a9-cover-picker__modes"
      :model-value="currentValue.mode"
      :aria-label="t('admin9Ui.coverPicker.modeLabel')"
      @update:model-value="changeMode"
    >
      <a-radio value="single" :disabled="mergedDisabled" data-testid="cover-picker-mode-single">
        {{ t('admin9Ui.coverPicker.single') }}
      </a-radio>
      <a-radio value="triple" :disabled="mergedDisabled" data-testid="cover-picker-mode-triple">
        {{ t('admin9Ui.coverPicker.triple') }}
      </a-radio>
      <a-radio value="none" :disabled="mergedDisabled" data-testid="cover-picker-mode-none">
        {{ t('admin9Ui.coverPicker.none') }}
      </a-radio>
    </a-radio-group>

    <div v-if="currentValue.mode !== 'none'" class="a9-cover-picker__slots" :class="slotCountClass">
      <div v-for="(item, index) in slots" :key="index" class="a9-cover-picker__slot-wrap">
        <button
          :ref="(element) => setSlotButton(element, index)"
          type="button"
          class="a9-cover-picker__slot"
          :class="{ 'has-image': item }"
          :disabled="mergedDisabled"
          :aria-label="slotLabel(item, index)"
          :data-testid="`cover-picker-slot-${index}`"
          @click="openPicker(index)"
        >
          <template v-if="item">
            <img
              v-if="previewSource(item, index)"
              class="a9-cover-picker__preview"
              :src="previewSource(item, index)"
              :alt="item.name"
              :data-testid="`cover-picker-preview-${index}`"
              @error="onPreviewError(item, index)"
            />
            <span
              v-else
              class="a9-cover-picker__preview-fallback"
              aria-hidden="true"
              :data-testid="`cover-picker-preview-fallback-${index}`"
            >
              <icon-image-close />
            </span>
            <span class="a9-cover-picker__replace-icon" aria-hidden="true"><icon-edit /></span>
          </template>
          <icon-plus v-else class="a9-cover-picker__add-icon" aria-hidden="true" />
        </button>
        <a-tooltip v-if="item" :content="t('admin9Ui.coverPicker.removePosition', { index: index + 1 })">
          <a-button
            class="a9-cover-picker__remove"
            :size="size === 'large' ? 'small' : 'mini'"
            shape="circle"
            status="danger"
            :disabled="mergedDisabled"
            :aria-label="t('admin9Ui.coverPicker.removePosition', { index: index + 1 })"
            :data-testid="`cover-picker-remove-${index}`"
            @click.stop="removeImage(index)"
          >
            <template #icon><icon-delete /></template>
          </a-button>
        </a-tooltip>
      </div>
    </div>

    <div class="a9-cover-picker__file-picker">
      <AFilePicker
        ref="picker"
        v-model="pickerValue"
        :service="service"
        :file-types="['image']"
        :can-upload="canUpload"
        :accept="accept"
        :multiple="false"
        @change="onPickerChange"
        @visible-change="onPickerVisibleChange"
        @upload-success="emit('uploadSuccess', $event)"
        @upload-error="emit('uploadError', $event)"
      >
        <template #trigger><span aria-hidden="true" /></template>
      </AFilePicker>
    </div>
  </div>
</template>

<style lang="less" scoped>
  .a9-cover-picker {
    position: relative;
    min-width: 0;

    &--small {
      --a9-cover-picker-slot-width: 120px;
      --a9-cover-picker-icon-size: 26px;
      --a9-cover-picker-replace-size: 24px;
    }

    &--medium {
      --a9-cover-picker-slot-width: 160px;
      --a9-cover-picker-icon-size: 34px;
      --a9-cover-picker-replace-size: 28px;
    }

    &--large {
      --a9-cover-picker-slot-width: 200px;
      --a9-cover-picker-icon-size: 42px;
      --a9-cover-picker-replace-size: 32px;
    }

    &__modes {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 24px;
      align-items: center;
    }

    &__slots {
      display: grid;
      gap: 12px;
      width: 100%;
      margin-top: 20px;

      &.is-single {
        grid-template-columns: minmax(0, 1fr);
        max-width: var(--a9-cover-picker-slot-width);
      }

      &.is-triple {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        max-width: calc(var(--a9-cover-picker-slot-width) * 3 + 24px);
      }
    }

    &__slot-wrap {
      position: relative;
      min-width: 0;
      aspect-ratio: 4 / 3;
    }

    &__slot {
      position: relative;
      display: flex;
      width: 100%;
      height: 100%;
      padding: 0;
      overflow: hidden;
      color: var(--color-text-3);
      font: inherit;
      background: var(--color-fill-1);
      border: 1px dashed var(--color-border-3);
      border-radius: 4px;
      cursor: pointer;
      transition: border-color 0.2s ease, background-color 0.2s ease;

      &.has-image {
        border-style: solid;
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }

      &:focus-visible {
        background: var(--color-fill-2);
        border-color: rgb(var(--primary-6));
        outline: none;
        box-shadow: 0 0 0 2px var(--color-primary-light-3);
      }

      &:hover:not(:disabled) {
        background: var(--color-fill-2);
        border-color: rgb(var(--primary-6));
        outline: none;
      }
    }

    &__add-icon,
    &__preview-fallback {
      margin: auto;
      font-size: var(--a9-cover-picker-icon-size);
    }

    &__preview {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &__preview-fallback {
      display: inline-flex;
    }

    &__replace-icon {
      position: absolute;
      right: 8px;
      bottom: 8px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--a9-cover-picker-replace-size);
      height: var(--a9-cover-picker-replace-size);
      color: #fff;
      background: rgb(0 0 0 / 62%);
      border-radius: 50%;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    &__slot:hover &__replace-icon,
    &__slot:focus-visible &__replace-icon {
      opacity: 1;
    }

    &__remove {
      position: absolute;
      top: 6px;
      right: 6px;
      z-index: 1;
      background: var(--color-bg-2);
      box-shadow: 0 1px 4px rgb(0 0 0 / 18%);
    }

    &__file-picker {
      :deep(.a9-file-picker__trigger-row) {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      &__slot,
      &__replace-icon {
        transition: none;
      }
    }
  }
</style>
