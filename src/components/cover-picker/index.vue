<script setup lang="ts">
  import { computed, inject, nextTick, onBeforeUnmount, ref, toRef, watch } from 'vue';
  import { FormItem, useFormItem } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';
  import safeFileUrl from '../../internal/file-url';
  import AImageCropper from '../image-cropper/index.vue';
  import type { AImageCropperExposed } from '../image-cropper/types';
  import admin9UIOptionsKey from '../../internal/options';
  import createImageCropSession, { type CropSessionState } from '../../internal/image-crop-session';
  import { validateCropOptions } from '../../internal/image-crop';
  import AFilePicker from '../file-picker/index.vue';
  import type { FileItem } from '../../services/types';
  import type { ACoverPickerProps, ACoverPickerExposed, CoverMode, CoverPickerValue } from './types';

  defineOptions({ name: 'ACoverPicker' });

  const props = withDefaults(defineProps<ACoverPickerProps>(), {
    modelValue: () => ({ mode: 'single', images: [null] }),
    size: undefined,
    service: undefined,
    canUpload: false,
    canCreateGroup: false,
    canDeleteFiles: false,
    canMoveFiles: false,
    accept: 'image/*',
    aspectRatio: 4 / 3,
    disabled: false,
    readonly: false,
    beforeUpload: undefined,
    beforeSelect: undefined,
  });

  const emit = defineEmits<{
    (e: 'update:modelValue', value: CoverPickerValue): void;
    (e: 'change', value: CoverPickerValue): void;
    (e: 'processingChange', processing: boolean): void;
    (e: 'visibleChange', visible: boolean): void;
    (e: 'uploadSuccess', item: FileItem): void;
    (e: 'uploadError', error: unknown): void;
  }>();

  const { t } = useI18n();
  const { mergedDisabled, mergedSize, mergedError, eventHandlers } = useFormItem({
    disabled: toRef(props, 'disabled'),
    size: toRef(props, 'size'),
  });
  const interactionDisabled = computed(() => mergedDisabled.value || props.readonly);
  const resolvedSize = computed(() => mergedSize.value ?? 'medium');
  const slotStyle = computed(() => ({ '--a9-cover-picker-slot-ratio': String(props.aspectRatio) }));
  const globalOptions = inject(admin9UIOptionsKey, undefined);
  const resolvedService = computed(() => props.service ?? globalOptions?.fileService);
  const cropper = ref<AImageCropperExposed>();
  const cropState = ref<CropSessionState>({ stage: 'idle' });
  const cropRatio = computed(() => {
    if (typeof props.aspectRatio === 'number') return props.aspectRatio;
    const parts = props.aspectRatio.split('/').map(Number);
    return parts.length === 2 ? parts[0] / parts[1] : Number(props.aspectRatio);
  });
  const libraryCropUnavailable = computed(() => Boolean(props.crop && !resolvedService.value?.readOriginal));
  const cropConfigurationError = computed(() => {
    if (!props.crop) return false;
    try {
      validateCropOptions(cropRatio.value, props.crop);
      return Boolean(props.beforeUpload || props.beforeSelect || !resolvedService.value?.upload);
    } catch {
      return true;
    }
  });
  const cropSession = createImageCropSession(
    (state) => {
      cropState.value = state;
    },
    (error) => emit('uploadError', error)
  );
  const picker = ref<{ open: () => void; close: () => void; clear: () => void }>();
  const pickerValue = ref<FileItem>();
  const currentValue = ref<CoverPickerValue>({ mode: 'single', images: [null] });
  const previewStates = ref<[number, number, number]>([0, 0, 0]);
  const slotButtons: Array<HTMLButtonElement | undefined> = [];
  const activeIndex = ref<number>();
  const pickerVisible = ref(false);
  const selectionPending = ref(false);
  let selectionGeneration = 0;
  let selectionTarget: number | undefined;
  let operationGeneration = 0;
  let suppressFocusRestore = false;
  let lastEmittedSignature = '';
  let modelNeedsNormalization = false;

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
    'width',
    'height',
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
      Boolean(safeFileUrl(item.url)) &&
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
  const valueSignature = (value: CoverPickerValue) =>
    `${value.mode}:${value.images
      .map((item) => (item ? JSON.stringify(itemFields.map((field) => item[field] ?? null)) : 'null'))
      .join('|')}`;
  const modelMatches = (value: unknown, normalized: CoverPickerValue) => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { mode?: unknown; images?: unknown };
    if (candidate.mode !== normalized.mode || !Array.isArray(candidate.images)) return false;
    if (candidate.images.length !== normalized.images.length) return false;
    return candidate.images.every((item, index) => {
      const normalizedItem = normalized.images[index];
      if (item === null || normalizedItem === null) return item === normalizedItem;
      return isEligibleImage(item) && sameItem(item, normalizedItem);
    });
  };
  const slots = computed<(FileItem | null)[]>(() => currentValue.value.images);
  const slotCountClass = computed(() => `is-${currentValue.value.mode}`);
  const resetPreviews = () => {
    previewStates.value = [0, 0, 0];
  };
  const previewSource = (item: FileItem, index: number) => {
    const state = previewStates.value[index] ?? 0;
    if (state >= 2) return undefined;
    if (state === 1) return safeFileUrl(item.url);
    return safeFileUrl(item.thumbnail) || safeFileUrl(item.url);
  };
  const onPreviewError = (item: FileItem, index: number) => {
    const state = previewStates.value[index] ?? 0;
    if (state === 0 && item.thumbnail && item.url && item.thumbnail !== item.url) previewStates.value[index] = 1;
    else previewStates.value[index] = 2;
  };
  const slotLabel = (item: FileItem | null, index: number) =>
    item
      ? t('admin9Ui.coverPicker.replacePosition', { index: index + 1, name: item.name })
      : t(`admin9Ui.coverPicker.${interactionDisabled.value ? 'emptyPosition' : 'selectPosition'}`, { index: index + 1 });
  const setSlotButton = (element: unknown, index: number) => {
    if (typeof HTMLButtonElement !== 'undefined' && element instanceof HTMLButtonElement) slotButtons[index] = element;
    else slotButtons[index] = undefined;
  };

  const closePicker = (restoreFocus: boolean) => {
    const previousIndex = activeIndex.value;
    cropSession.cancel();
    cropper.value?.cancel();
    operationGeneration += 1;
    selectionGeneration += 1;
    selectionPending.value = false;
    selectionTarget = undefined;
    suppressFocusRestore = !restoreFocus;
    picker.value?.close();
    if (!pickerVisible.value) {
      activeIndex.value = undefined;
      pickerValue.value = undefined;
      suppressFocusRestore = false;
      if (restoreFocus && previousIndex !== undefined) nextTick(() => slotButtons[previousIndex]?.focus());
    }
  };
  const publish = (value: CoverPickerValue) => {
    const normalized = normalizeValue(value);
    if (sameValue(currentValue.value, normalized) && !modelNeedsNormalization) return false;
    modelNeedsNormalization = false;
    currentValue.value = normalized;
    resetPreviews();
    lastEmittedSignature = valueSignature(normalized);
    emit('update:modelValue', normalized);
    emit('change', normalized);
    eventHandlers.value?.onChange?.();
    return true;
  };
  const changeMode = (value: string | number | boolean) => {
    if (interactionDisabled.value || selectionPending.value || !['single', 'triple', 'none'].includes(String(value))) return;
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
    if (
      cropConfigurationError.value ||
      libraryCropUnavailable.value ||
      interactionDisabled.value ||
      selectionPending.value ||
      index < 0 ||
      index >= currentValue.value.images.length
    )
      return;
    closePicker(false);
    const generation = operationGeneration;
    activeIndex.value = index;
    pickerValue.value = currentValue.value.images[index] ?? undefined;
    await nextTick();
    if (generation !== operationGeneration || interactionDisabled.value || activeIndex.value !== index) return;
    picker.value?.open();
  };
  const removeImage = (index: number) => {
    if (interactionDisabled.value || selectionPending.value || currentValue.value.mode === 'none') return;
    closePicker(false);
    if (currentValue.value.mode === 'single') {
      publish({ mode: 'single', images: [null] });
      return;
    }
    const images: [FileItem | null, FileItem | null, FileItem | null] = [...currentValue.value.images];
    images[index] = null;
    publish({ mode: 'triple', images });
  };
  const onPickerChange = async (items: FileItem[]) => {
    const index = activeIndex.value;
    if (index === undefined || interactionDisabled.value || selectionPending.value) return;
    selectionGeneration += 1;
    const generation = selectionGeneration;
    selectionTarget = index;
    selectionPending.value = true;
    try {
      if (generation !== selectionGeneration) return;
      let item: FileItem | null = items[0] ?? null;
      if (item !== null && props.crop) {
        if (cropConfigurationError.value || !resolvedService.value || !cropper.value) return;
        const cropperInstance = cropper.value;
        const output = await cropSession.run(item, resolvedService.value, (file) => cropperInstance.open(file));
        if (!output) return;
        item = output;
      }
      if (item !== null && props.beforeSelect) {
        try {
          const transformed = await props.beforeSelect(item);
          if (transformed === null) return;
          item = transformed;
        } catch {
          return;
        }
      }
      if (
        generation !== selectionGeneration ||
        selectionTarget !== index ||
        interactionDisabled.value ||
        (item !== null && !isEligibleImage(item))
      )
        return;
      if (props.crop && item) {
        emit('uploadSuccess', item);
        if (generation !== selectionGeneration) return;
      }
      if (currentValue.value.mode === 'single' && index === 0) {
        publish({ mode: 'single', images: [item] });
        return;
      }
      if (currentValue.value.mode !== 'triple' || index >= 3) return;
      const images: [FileItem | null, FileItem | null, FileItem | null] = [...currentValue.value.images];
      images[index] = item;
      publish({ mode: 'triple', images });
    } catch (error) {
      if (generation === selectionGeneration) emit('uploadError', error);
    } finally {
      if (generation === selectionGeneration) {
        selectionPending.value = false;
        selectionTarget = undefined;
        const focusIndex = activeIndex.value;
        activeIndex.value = undefined;
        pickerValue.value = undefined;
        operationGeneration += 1;
        if (!suppressFocusRestore && focusIndex !== undefined) nextTick(() => slotButtons[focusIndex]?.focus());
        suppressFocusRestore = false;
      }
    }
  };
  defineExpose<ACoverPickerExposed>({ cancel: () => closePicker(false) });

  const onPickerVisibleChange = (visible: boolean) => {
    pickerVisible.value = visible;
    emit('visibleChange', visible);
    if (visible) return;
    if (selectionPending.value) {
      picker.value?.clear();
      pickerValue.value = undefined;
      return;
    }
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
      modelNeedsNormalization = !modelMatches(value, normalized);
      const signature = valueSignature(normalized);
      const isOwnEcho = signature === lastEmittedSignature;
      if ((pickerVisible.value || selectionPending.value) && !isOwnEcho && !sameValue(currentValue.value, normalized))
        closePicker(false);
      currentValue.value = normalized;
      resetPreviews();
      if (isOwnEcho) lastEmittedSignature = '';
    },
    { deep: true, immediate: true }
  );
  watch(
    () => resolvedService.value,
    (service, previous) => {
      if (service !== previous && (pickerVisible.value || selectionPending.value)) closePicker(false);
    }
  );
  watch(
    () => interactionDisabled.value,
    (disabled) => {
      if (disabled && (pickerVisible.value || selectionPending.value)) closePicker(false);
    }
  );
  watch(
    () => [props.crop, props.beforeUpload, props.beforeSelect, props.aspectRatio],
    (current, previous) => {
      if (current[0] || previous[0]) closePicker(false);
    },
    { deep: true, flush: 'sync' }
  );
  watch(selectionPending, (processing) => emit('processingChange', processing), { immediate: true, flush: 'sync' });
  onBeforeUnmount(() => closePicker(false));
</script>

<template>
  <div
    class="a9-cover-picker"
    :class="[
      `a9-cover-picker--${resolvedSize}`,
      slotCountClass,
      { 'is-disabled': interactionDisabled, 'is-error': mergedError },
    ]"
    :style="slotStyle"
  >
    <FormItem no-style :validate-trigger="[]">
      <a-radio-group
        class="a9-cover-picker__modes"
        :model-value="currentValue.mode"
        :aria-label="t('admin9Ui.coverPicker.modeLabel')"
        @update:model-value="changeMode"
      >
        <a-radio value="single" :disabled="interactionDisabled || selectionPending" data-testid="cover-picker-mode-single">
          {{ t('admin9Ui.coverPicker.single') }}
        </a-radio>
        <a-radio value="triple" :disabled="interactionDisabled || selectionPending" data-testid="cover-picker-mode-triple">
          {{ t('admin9Ui.coverPicker.triple') }}
        </a-radio>
        <a-radio value="none" :disabled="interactionDisabled || selectionPending" data-testid="cover-picker-mode-none">
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
            :disabled="interactionDisabled || selectionPending || cropConfigurationError || libraryCropUnavailable"
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
            <span v-else class="a9-cover-picker__empty">
              <icon-plus v-if="!interactionDisabled" class="a9-cover-picker__add-icon" aria-hidden="true" />
              <span>{{ t('admin9Ui.coverPicker.positionLabel', { index: index + 1 }) }}</span>
            </span>
          </button>
          <div
            v-if="activeIndex === index && cropState.stage !== 'idle' && cropState.stage !== 'cropping'"
            class="a9-cover-picker__crop-status"
            :class="{ 'is-error': cropState.stage === 'error' }"
            :data-testid="`cover-picker-status-${index}`"
            role="status"
          >
            <a-tooltip v-if="cropState.stage === 'error'" :content="t(`admin9Ui.imageCropper.errors.${cropState.error}`)">
              <span class="a9-cover-picker__status-text" tabindex="0">{{
                t(cropState.error === 'upload' ? 'admin9Ui.filePicker.uploadFailed' : 'admin9Ui.filePicker.failed')
              }}</span>
            </a-tooltip>
            <div v-else class="a9-cover-picker__status-message">
              <a-spin :size="14" />
              <span class="a9-cover-picker__status-text">{{
                t(cropState.stage === 'uploading' ? 'admin9Ui.fileUploader.status.uploading' : 'admin9Ui.filePicker.processing')
              }}</span>
            </div>
            <div class="a9-cover-picker__status-actions">
              <a-button v-if="cropState.stage === 'error'" size="mini" @click="cropSession.retry()">{{
                t('admin9Ui.imageCropper.retry')
              }}</a-button>
              <a-button size="mini" @click="closePicker(true)">{{ t('admin9Ui.imageCropper.cancel') }}</a-button>
            </div>
          </div>
          <a-tooltip
            v-if="item && !(activeIndex === index && selectionPending)"
            :content="t('admin9Ui.coverPicker.removePosition', { index: index + 1 })"
          >
            <a-button
              class="a9-cover-picker__remove"
              :size="resolvedSize === 'large' ? 'small' : 'mini'"
              shape="circle"
              status="danger"
              :disabled="interactionDisabled || selectionPending"
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
          :can-create-group="canCreateGroup"
          :can-delete-files="canDeleteFiles"
          :can-move-files="canMoveFiles"
          :accept="accept"
          :multiple="false"
          :before-upload="beforeUpload"
          @confirm="onPickerChange"
          @visible-change="onPickerVisibleChange"
          @upload-success="emit('uploadSuccess', $event)"
          @upload-error="emit('uploadError', $event)"
        >
          <template #trigger><span aria-hidden="true" /></template>
        </AFilePicker>
      </div>
      <AImageCropper v-if="crop && !cropConfigurationError" ref="cropper" :crop="crop" :aspect-ratio="cropRatio" />
      <a-alert v-if="libraryCropUnavailable && !cropConfigurationError" type="error">{{
        t('admin9Ui.imageCropper.errors.configuration')
      }}</a-alert>
      <a-alert v-if="cropConfigurationError" type="error">{{ t('admin9Ui.imageCropper.errors.configuration') }}</a-alert>
    </FormItem>
  </div>
</template>

<style lang="less" scoped>
  .a9-cover-picker__crop-status {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: center;
    padding: 6px;
    overflow: auto;
    color: var(--color-text-1);
    font-size: 12px;
    background: var(--color-bg-2);
    border: 1px solid var(--color-border-3);
    border-radius: 4px;

    > :first-child {
      margin-top: auto;
    }

    > :last-child {
      margin-bottom: auto;
    }

    &.is-error {
      border-color: rgb(var(--danger-6));
    }
  }

  .a9-cover-picker__status-message {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .a9-cover-picker__status-text {
    text-align: center;
    overflow-wrap: anywhere;
  }

  .a9-cover-picker__status-actions {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: center;
    max-width: 100%;

    :deep(.arco-btn) {
      padding: 0 3px;
      font-size: 12px;
    }
  }

  .a9-cover-picker {
    position: relative;
    width: max-content;
    min-width: 0;
    max-width: 100%;

    &.is-triple {
      width: min(calc(var(--a9-cover-picker-slot-width) * 3 + 24px), 100%);
    }

    &.is-error {
      outline: 1px solid rgb(var(--danger-6));
      outline-offset: 4px;
    }

    &--mini {
      --a9-cover-picker-slot-width: 88px;
      --a9-cover-picker-icon-size: 20px;
      --a9-cover-picker-replace-size: 20px;
    }

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
      aspect-ratio: var(--a9-cover-picker-slot-ratio, 4 / 3);
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

    &__empty {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-width: 0;
      padding: 8px;
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    &__add-icon,
    &__preview-fallback {
      font-size: var(--a9-cover-picker-icon-size);
    }

    &__preview {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &__preview-fallback {
      display: inline-flex;
      margin: auto;
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
