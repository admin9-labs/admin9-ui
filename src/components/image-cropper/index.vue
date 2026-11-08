<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import Modal from '../../internal/modal.vue';
  import {
    decodeImageSource,
    encodeImageCrop,
    cropOutputSize,
    validateCropOptions,
    ImageCropError,
  } from '../../internal/image-crop';
  import type { AImageCropperProps, AImageCropperExposed } from './types';

  defineOptions({ name: 'AImageCropper' });
  const props = defineProps<AImageCropperProps>();
  const emit = defineEmits<{ (event: 'visibleChange', visible: boolean): void }>();
  const { t } = useI18n();
  const cropVisible = ref(false);
  const cropLoading = ref(false);
  const cropSaving = ref(false);
  const cropImage = ref<HTMLCanvasElement>();
  const cropViewport = ref<HTMLElement>();
  const cropNatural = reactive({ width: 0, height: 0 });
  const cropBox = reactive({ x: 10, y: 10, width: 80, height: 80 });
  const error = ref('');
  let source: File | undefined;
  let bitmap: ImageBitmap | undefined;
  let generation = 0;
  let frame = 0;
  let interacted = false;
  let cropAutoPositioned = false;
  let resolve: ((file: File | null) => void) | undefined;
  type CropHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  let cropDrag:
    | { handle?: CropHandle; startX: number; startY: number; x: number; y: number; width: number; height: number }
    | undefined;
  const message = (failure: unknown) =>
    t(`admin9Ui.imageCropper.errors.${failure instanceof ImageCropError ? failure.code : 'decode'}`);
  const outputSize = computed(() => {
    if (!cropNatural.width || !cropNatural.height) return undefined;
    try {
      return cropOutputSize(
        (cropNatural.width * cropBox.width) / 100,
        (cropNatural.height * cropBox.height) / 100,
        props.aspectRatio,
        props.crop.output
      );
    } catch {
      return undefined;
    }
  });
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const cropStageStyle = computed(() =>
    cropNatural.width && cropNatural.height ? { aspectRatio: `${cropNatural.width} / ${cropNatural.height}` } : undefined
  );
  const fitCropBoxToRatio = (ratio: number) => {
    const naturalWidth = cropNatural.width || 1;
    const naturalHeight = cropNatural.height || 1;
    const heightPerWidth = naturalWidth / (ratio * naturalHeight);
    const centerX = cropBox.x + cropBox.width / 2;
    const centerY = cropBox.y + cropBox.height / 2;
    let { width } = cropBox;
    let height = width * heightPerWidth;
    if (height > 100) {
      height = 100;
      width = height / heightPerWidth;
    }
    cropBox.width = width;
    cropBox.height = height;
    cropBox.x = clamp(centerX - width / 2, 0, 100 - width);
    cropBox.y = clamp(centerY - height / 2, 0, 100 - height);
  };
  const revealCropBox = () => {
    if (cropAutoPositioned || !cropVisible.value || interacted) return;
    const viewport = cropViewport.value;
    const stage = cropImage.value?.parentElement;
    const box = stage?.querySelector<HTMLElement>('.a9-image-cropper-stage__box');
    if (!viewport || !stage || !box) return;
    if (!viewport.clientHeight || !stage.clientHeight) {
      frame = requestAnimationFrame(revealCropBox);
      return;
    }
    const minimumMargin = 12;
    const boxHeight = box.offsetHeight;
    const maxVisibleHeight = viewport.clientHeight - minimumMargin * 2;
    if (boxHeight > maxVisibleHeight && maxVisibleHeight > 0) {
      const scale = maxVisibleHeight / boxHeight;
      const centerX = cropBox.x + cropBox.width / 2;
      const centerY = cropBox.y + cropBox.height / 2;
      cropBox.width *= scale;
      cropBox.height *= scale;
      cropBox.x = clamp(centerX - cropBox.width / 2, 0, 100 - cropBox.width);
      cropBox.y = clamp(centerY - cropBox.height / 2, 0, 100 - cropBox.height);
    }
    const boxTop = (cropBox.y / 100) * stage.clientHeight;
    const renderedBoxHeight = (cropBox.height / 100) * stage.clientHeight;
    const targetScrollTop = boxTop + renderedBoxHeight / 2 - viewport.clientHeight / 2;
    viewport.scrollTop = clamp(targetScrollTop, 0, viewport.scrollHeight - viewport.clientHeight);
    cropAutoPositioned = true;
  };
  const onCropPointerDown = (event: PointerEvent) => {
    if (cropSaving.value || cropLoading.value) return;
    interacted = true;
    const target = event.currentTarget as HTMLElement;
    const handle = (event.target as HTMLElement).dataset.cropHandle as CropHandle | undefined;
    target.setPointerCapture?.(event.pointerId);
    cropDrag = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      x: cropBox.x,
      y: cropBox.y,
      width: cropBox.width,
      height: cropBox.height,
    };
    event.preventDefault();
  };
  const onCropPointerMove = (event: PointerEvent) => {
    if (!cropDrag) return;
    const stage = cropImage.value?.parentElement;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    const dx = ((event.clientX - cropDrag.startX) / bounds.width) * 100;
    const dy = ((event.clientY - cropDrag.startY) / bounds.height) * 100;
    if (!cropDrag.handle) {
      cropBox.x = clamp(cropDrag.x + dx, 0, 100 - cropDrag.width);
      cropBox.y = clamp(cropDrag.y + dy, 0, 100 - cropDrag.height);
      return;
    }
    const minimum = Math.min(12, cropDrag.width);
    const heightPerWidth = (cropNatural.width || 1) / (props.aspectRatio * (cropNatural.height || 1));
    const right = cropDrag.x + cropDrag.width;
    const bottom = cropDrag.y + cropDrag.height;
    const horizontalDelta = cropDrag.handle.includes('left') ? -dx : dx;
    const verticalDelta = cropDrag.handle.includes('top') ? -dy : dy;
    const widthFromPointer = cropDrag.width + horizontalDelta;
    const widthFromVerticalPointer = cropDrag.width + verticalDelta / heightPerWidth;
    let width =
      Math.abs(horizontalDelta) >= Math.abs(verticalDelta / heightPerWidth) ? widthFromPointer : widthFromVerticalPointer;
    const maxWidth = cropDrag.handle.includes('left') ? right : 100 - cropDrag.x;
    const maxHeight = cropDrag.handle.includes('top') ? bottom : 100 - cropDrag.y;
    const minimumWidth = Math.min(minimum, maxWidth, maxHeight / heightPerWidth);
    width = clamp(width, minimumWidth, Math.min(maxWidth, maxHeight / heightPerWidth));
    const height = width * heightPerWidth;
    cropBox.width = width;
    cropBox.height = height;
    cropBox.x = cropDrag.handle.includes('left') ? right - width : cropDrag.x;
    cropBox.y = cropDrag.handle.includes('top') ? bottom - height : cropDrag.y;
  };
  const onCropPointerUp = () => {
    cropDrag = undefined;
  };

  const release = () => {
    cancelAnimationFrame(frame);
    bitmap?.close();
    bitmap = undefined;
    if (cropImage.value) {
      cropImage.value.width = 0;
      cropImage.value.height = 0;
    }
    cropDrag = undefined;
  };
  const finish = (file: File | null) => {
    generation += 1;
    const pending = resolve;
    resolve = undefined;
    source = undefined;
    release();
    cropVisible.value = false;
    cropLoading.value = false;
    cropSaving.value = false;
    emit('visibleChange', false);
    pending?.(file);
  };
  const cancel = () => finish(null);
  const drawPreview = () => {
    if (!bitmap || !cropImage.value || !cropVisible.value) return;
    const scale = Math.min(1, 1024 / bitmap.width, 8192 / bitmap.height);
    cropImage.value.width = Math.max(1, Math.round(bitmap.width * scale));
    cropImage.value.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = cropImage.value.getContext('2d');
    if (!context) {
      error.value = message(new ImageCropError('decode'));
      return;
    }
    context.drawImage(bitmap, 0, 0, cropImage.value.width, cropImage.value.height);
    frame = requestAnimationFrame(revealCropBox);
  };
  const prepare = async () => {
    if (!source) return;
    const current = generation;
    cropLoading.value = true;
    error.value = '';
    try {
      const decoded = await decodeImageSource(source, props.crop.source);
      if (current !== generation) {
        decoded.close();
        return;
      }
      bitmap = decoded;
      cropNatural.width = decoded.width;
      cropNatural.height = decoded.height;
      fitCropBoxToRatio(props.aspectRatio);
      cropLoading.value = false;
      await nextTick();
      if (current === generation) drawPreview();
    } catch (failure) {
      if (current !== generation) return;
      cropLoading.value = false;
      error.value = message(failure);
    }
  };
  const open = (file: File) => {
    cancel();
    validateCropOptions(props.aspectRatio, props.crop);
    source = file;
    cropNatural.width = 0;
    cropNatural.height = 0;
    Object.assign(cropBox, { x: 10, y: 10, width: 80, height: 80 });
    cropAutoPositioned = false;
    interacted = false;
    cropVisible.value = true;
    emit('visibleChange', true);
    const result = new Promise<File | null>((done) => {
      resolve = done;
    });
    prepare();
    return result;
  };
  const confirm = async () => {
    if (!bitmap || !source || !outputSize.value || cropLoading.value || cropSaving.value) return;
    const current = generation;
    cropSaving.value = true;
    error.value = '';
    try {
      const file = await encodeImageCrop(
        bitmap,
        {
          x: (cropBox.x * bitmap.width) / 100,
          y: (cropBox.y * bitmap.height) / 100,
          width: (cropBox.width * bitmap.width) / 100,
          height: (cropBox.height * bitmap.height) / 100,
        },
        props.aspectRatio,
        props.crop.output,
        source.name
      );
      if (current === generation) finish(file);
    } catch (failure) {
      if (current !== generation) return;
      error.value = message(failure);
      cropSaving.value = false;
    }
  };
  const onCropKeydown = (event: KeyboardEvent) => {
    if (cropLoading.value || cropSaving.value || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key))
      return;
    event.preventDefault();
    interacted = true;
    const dx = Number(event.key === 'ArrowRight') - Number(event.key === 'ArrowLeft');
    const dy = Number(event.key === 'ArrowDown') - Number(event.key === 'ArrowUp');
    const handle = (event.target as HTMLElement).dataset.cropHandle as CropHandle | undefined;
    const stage = cropImage.value?.parentElement;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    cropDrag = { handle, startX: 0, startY: 0, ...cropBox };
    onCropPointerMove({ clientX: (dx * bounds.width) / 100, clientY: (dy * bounds.height) / 100 } as PointerEvent);
    cropDrag = undefined;
  };
  watch(cropImage, drawPreview);
  watch(() => [props.aspectRatio, props.crop], cancel, { deep: true, flush: 'sync' });
  onMounted(() => {
    window.addEventListener('pointermove', onCropPointerMove);
    window.addEventListener('pointerup', onCropPointerUp);
    window.addEventListener('pointercancel', onCropPointerUp);
  });
  onBeforeUnmount(() => {
    cancel();
    window.removeEventListener('pointermove', onCropPointerMove);
    window.removeEventListener('pointerup', onCropPointerUp);
    window.removeEventListener('pointercancel', onCropPointerUp);
  });
  defineExpose<AImageCropperExposed>({ open, cancel });
</script>

<template>
  <Modal
    :visible="cropVisible"
    :title="t('admin9Ui.imageCropper.title')"
    :width="720"
    :align-center="true"
    :mask-closable="false"
    :esc-to-close="true"
    modal-class="a9-image-cropper-modal"
    @cancel="cancel"
  >
    <div class="a9-image-cropper__ratio">
      <span>{{ t('admin9Ui.imageCropper.hint') }}</span>
      <span v-if="cropNatural.width && !outputSize" role="alert">{{ t('admin9Ui.imageCropper.errors.pixels') }}</span>
      <span v-if="outputSize" class="a9-image-cropper__size">{{ outputSize.width }} × {{ outputSize.height }}</span>
    </div>
    <div
      ref="cropViewport"
      class="a9-image-cropper__viewport"
      @wheel.passive="interacted = true"
      @touchstart.passive="interacted = true"
    >
      <div
        class="a9-image-cropper-stage"
        :class="{ 'is-natural': cropNatural.width && cropNatural.height }"
        :style="cropStageStyle"
      >
        <canvas ref="cropImage" class="a9-image-cropper-stage__image" :aria-label="t('admin9Ui.imageCropper.image')" />
        <div
          v-if="cropNatural.width && !cropLoading"
          class="a9-image-cropper-stage__box"
          tabindex="0"
          :aria-label="t('admin9Ui.imageCropper.move')"
          :style="{ left: `${cropBox.x}%`, top: `${cropBox.y}%`, width: `${cropBox.width}%`, height: `${cropBox.height}%` }"
          @pointerdown="onCropPointerDown"
          @keydown="onCropKeydown"
        >
          <span
            v-for="handle in (['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const)"
            :key="handle"
            :data-crop-handle="handle"
            class="a9-image-cropper-stage__handle"
            :class="`a9-image-cropper-stage__handle--${handle}`"
            tabindex="0"
            :aria-label="t('admin9Ui.imageCropper.resize')"
          />
        </div>
        <span v-if="cropLoading" class="a9-image-cropper-stage__loading">{{ t('admin9Ui.imageCropper.loading') }}</span>
      </div>
    </div>
    <a-alert v-if="error" type="error" class="a9-image-cropper__error">{{ error }}</a-alert>
    <template #footer>
      <div class="a9-image-cropper__actions">
        <a-button @click="cancel">{{ t('admin9Ui.imageCropper.cancel') }}</a-button>
        <a-button v-if="error && !cropNatural.width" @click="prepare">{{ t('admin9Ui.imageCropper.retry') }}</a-button>
        <a-button type="primary" :loading="cropSaving" :disabled="cropLoading || !outputSize" @click="confirm">{{
          t('admin9Ui.imageCropper.confirm')
        }}</a-button>
      </div>
    </template>
  </Modal>
</template>

<style lang="less" scoped>
  .a9-image-cropper__ratio {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
    color: var(--color-text-2);
    font-size: 12px;
  }

  .a9-image-cropper__size {
    color: var(--color-text-3);
  }

  .a9-image-cropper__viewport {
    flex-shrink: 1;
    min-height: 0;
    max-height: min(60dvh, calc(100dvh - 260px));
    overflow: auto;
  }

  .a9-image-cropper-stage {
    position: relative;
    width: 100%;
    min-height: 220px;
    overflow: hidden;
    background: var(--color-fill-2);
  }

  .a9-image-cropper-stage.is-natural {
    min-height: 0;
  }

  .a9-image-cropper-stage__image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .a9-image-cropper-stage__box {
    position: absolute;
    z-index: 1;
    box-sizing: border-box;
    border: 2px solid rgb(var(--primary-6));
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 45%);
    cursor: move;
    touch-action: none;
  }

  .a9-image-cropper-stage__handle {
    position: absolute;
    width: 8px;
    height: 8px;
    background: #fff;
    border: 1px solid rgb(var(--primary-6));
    border-radius: 50%;
  }

  .a9-image-cropper-stage__handle--top-left {
    top: -5px;
    left: -5px;
    cursor: nwse-resize;
  }

  .a9-image-cropper-stage__handle--top-right {
    top: -5px;
    right: -5px;
    cursor: nesw-resize;
  }

  .a9-image-cropper-stage__handle--bottom-left {
    bottom: -5px;
    left: -5px;
    cursor: nesw-resize;
  }

  .a9-image-cropper-stage__handle--bottom-right {
    right: -5px;
    bottom: -5px;
    cursor: nwse-resize;
  }

  .a9-image-cropper-stage__loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    background: rgb(0 0 0 / 35%);
  }

  .a9-image-cropper__actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 0;
  }

  .a9-image-cropper__error {
    margin-top: 12px;
  }
</style>

<style lang="less">
  .a9-image-cropper-modal {
    display: inline-flex;
    flex-direction: column;
    max-width: calc(100vw - 32px);
    max-height: calc(100dvh - 32px);

    .arco-modal-header,
    .arco-modal-footer {
      flex: none;
    }

    .arco-modal-body {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }
  }
</style>
