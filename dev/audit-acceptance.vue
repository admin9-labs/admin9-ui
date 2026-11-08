<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import arcoZhCN from '@arco-design/web-vue/es/locale/lang/zh-cn';
  import arcoEnUS from '@arco-design/web-vue/es/locale/lang/en-us';
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
    type FileItem,
  } from '../src';
  import createFakeFilePickerService from './fake-file-picker-service';
  import type { AcceptanceState } from './fake-acceptance-utils';

  const { locale } = useI18n();
  const arcoLocale = computed(() => (locale.value === 'en-US' ? arcoEnUS : arcoZhCN));
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
  const coverNeedsRecrop = ref(false);
  const cropVisible = ref(false);
  const cropImage = ref<HTMLImageElement>();
  const cropItem = ref<FileItem>();
  const cropSource = ref('');
  const cropLoading = ref(false);
  const cropSaving = ref(false);
  const cropViewport = ref<HTMLElement>();
  const cropNatural = reactive({ width: 0, height: 0 });
  const cropBox = reactive({ x: 10, y: 10, width: 80, height: 80 });
  const pendingRecropIds = new Set<FileItem['id']>();
  const cropObjectUrls = new Set<string>();
  let cropAutoPositioned = false;
  const cropRatioOptions = [
    { label: '4:3', scene: '列表封面', value: '4:3', ratio: 4 / 3 },
    { label: '16:9', scene: '详情主图', value: '16:9', ratio: 16 / 9 },
    { label: '1:1', scene: '方形卡片', value: '1:1', ratio: 1 },
    { label: '3:4', scene: '海报封面', value: '3:4', ratio: 3 / 4 },
  ] as const;
  type CropRatioKey = (typeof cropRatioOptions)[number]['value'];
  const cropRatio = ref<CropRatioKey>('4:3');
  const cropRatioConfig = computed(
    () => cropRatioOptions.find((option) => option.value === cropRatio.value) ?? cropRatioOptions[0]
  );
  const cropOutputSize = computed(() => {
    const { ratio } = cropRatioConfig.value;
    return ratio >= 1 ? { width: 640, height: Math.round(640 / ratio) } : { width: Math.round(640 * ratio), height: 640 };
  });
  let cropResolve: ((item: FileItem | null) => void) | undefined;
  type CropHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  let cropDrag:
    | {
        handle?: CropHandle;
        startX: number;
        startY: number;
        x: number;
        y: number;
        width: number;
        height: number;
      }
    | undefined;
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
  const setCropRatio = (value: string | number | boolean) => {
    if (!cropRatioOptions.some((option) => option.value === String(value))) return;
    const nextRatio = String(value) as CropRatioKey;
    const changed = cropRatio.value !== nextRatio;
    cropRatio.value = nextRatio;
    fitCropBoxToRatio(cropRatioConfig.value.ratio);
    if (changed && !cropVisible.value) {
      pendingRecropIds.clear();
      cover.value.images.forEach((item) => {
        if (item) pendingRecropIds.add(item.id);
      });
      coverNeedsRecrop.value = pendingRecropIds.size > 0;
      if (coverNeedsRecrop.value) result.value = '已切换封面规格，请重新裁剪已有封面';
    }
  };
  const updateRecropWarning = () => {
    const currentIds = new Set(cover.value.images.flatMap((item) => (item ? [item.id] : [])));
    pendingRecropIds.forEach((id) => {
      if (!currentIds.has(id)) pendingRecropIds.delete(id);
    });
    coverNeedsRecrop.value = pendingRecropIds.size > 0;
  };
  const releaseUnusedCropUrls = () => {
    const activeUrls = new Set(
      cover.value.images.flatMap((item) =>
        item ? [item.url, item.thumbnail].filter((url): url is string => Boolean(url)) : []
      )
    );
    cropObjectUrls.forEach((url) => {
      if (!activeUrls.has(url)) {
        URL.revokeObjectURL(url);
        cropObjectUrls.delete(url);
      }
    });
  };
  const syncRecropState = () => {
    updateRecropWarning();
    releaseUnusedCropUrls();
  };
  const finishCrop = (item: FileItem | null) => {
    const resolve = cropResolve;
    cropResolve = undefined;
    cropVisible.value = false;
    cropItem.value = undefined;
    cropSource.value = '';
    cropLoading.value = false;
    cropSaving.value = false;
    resolve?.(item);
    nextTick(syncRecropState);
  };
  const cancelCrop = () => {
    result.value = '已取消裁剪';
    finishCrop(null);
  };
  const revealCropBox = () => {
    if (cropAutoPositioned || !cropVisible.value) return;
    const viewport = cropViewport.value;
    const stage = cropImage.value?.parentElement;
    const box = stage?.querySelector<HTMLElement>('.crop-stage__box');
    if (!viewport || !stage || !box) return;
    if (!viewport.clientHeight || !stage.clientHeight) {
      requestAnimationFrame(revealCropBox);
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
  const onCropImageLoad = () => {
    const image = cropImage.value;
    if (!image) return;
    cropNatural.width = image.naturalWidth;
    cropNatural.height = image.naturalHeight;
    fitCropBoxToRatio(cropRatioConfig.value.ratio);
    cropLoading.value = false;
    nextTick(() => requestAnimationFrame(revealCropBox));
  };
  const onCropPointerDown = (event: PointerEvent) => {
    if (cropSaving.value) return;
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
    const minimum = 12;
    const heightPerWidth = (cropNatural.width || 1) / (cropRatioConfig.value.ratio * (cropNatural.height || 1));
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
  const cropFileItem = async (item: FileItem) => {
    const image = cropImage.value;
    if (!image || !cropNatural.width || !cropNatural.height) return item;
    const canvas = document.createElement('canvas');
    const sx = Math.round((cropBox.x / 100) * cropNatural.width);
    const sy = Math.round((cropBox.y / 100) * cropNatural.height);
    const sourceWidth = Math.max(1, Math.round((cropBox.width / 100) * cropNatural.width));
    const sourceHeight = Math.max(1, Math.round((cropBox.height / 100) * cropNatural.height));
    const { ratio } = cropRatioConfig.value;
    const outputLongEdge = 640;
    const width = ratio >= 1 ? outputLongEdge : Math.round(outputLongEdge * ratio);
    const height = ratio >= 1 ? Math.round(outputLongEdge / ratio) : outputLongEdge;
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')?.drawImage(image, sx, sy, sourceWidth, sourceHeight, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png', 0.92);
    });
    if (!blob) return item;
    const url = URL.createObjectURL(blob);
    cropObjectUrls.add(url);
    const baseName = item.name.replace(/\.[^.]+$/, '') || 'cover';
    return {
      ...item,
      id: `${item.id}-crop-${Date.now()}`,
      name: `${baseName}-crop.png`,
      url,
      thumbnail: url,
      mime: 'image/png',
      extension: 'png',
      size: blob.size,
      width,
      height,
      status: 'ready' as const,
    };
  };
  const openCropDialog = (item: FileItem) => {
    cropItem.value = item;
    cropSource.value = item.url ?? '';
    cropNatural.width = 0;
    cropNatural.height = 0;
    cropBox.x = 10;
    cropBox.y = 10;
    cropBox.width = 80;
    cropBox.height = 80;
    cropAutoPositioned = false;
    cropLoading.value = true;
    cropVisible.value = true;
    result.value = `待裁剪：${item.name}`;
    return new Promise<FileItem | null>((resolve) => {
      cropResolve = resolve;
    });
  };
  const confirmCrop = async () => {
    const item = cropItem.value;
    if (!item || cropLoading.value || cropSaving.value) return;
    cropSaving.value = true;
    const resolve = cropResolve;
    try {
      const cropped = await cropFileItem(item);
      if (resolve !== cropResolve) {
        if (cropped.url && cropped.url !== item.url && cropObjectUrls.delete(cropped.url)) URL.revokeObjectURL(cropped.url);
        return;
      }
      result.value = `裁剪完成：${cropped.width ?? 0}×${cropped.height ?? 0}`;
      finishCrop(cropped);
    } catch {
      if (resolve !== cropResolve) return;
      cropSaving.value = false;
      result.value = '裁剪失败，请重试';
    }
  };
  window.addEventListener('pointermove', onCropPointerMove);
  window.addEventListener('pointerup', onCropPointerUp);
  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onCropPointerMove);
    window.removeEventListener('pointerup', onCropPointerUp);
    cropResolve?.(null);
    cropResolve = undefined;
    cropObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    cropObjectUrls.clear();
  });
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
  watch(cover, syncRecropState, { deep: true });
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
    <a-config-provider :size="size" :locale="arcoLocale">
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
              can-upload
              can-create-group
              can-delete-files
              can-move-files /></a-form-item
        ></section>
        <section id="audit-file"
          ><h2>AFilePicker</h2
          ><a-form-item field="files" label="Files"
            ><AFilePicker
              v-model="files"
              :limit="4"
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
        <section id="audit-cover">
          <h2>ACoverPicker</h2>
          <div class="crop-scenario">
            <span class="crop-scenario__label">验收业务规格</span>
            <a-radio-group
              :model-value="cropRatio"
              type="button"
              size="small"
              aria-label="验收封面规格"
              :disabled="cropVisible"
              @update:model-value="setCropRatio"
            >
              <a-radio v-for="option in cropRatioOptions" :key="option.value" :value="option.value">
                {{ option.scene }} · {{ option.label }}
              </a-radio>
            </a-radio-group>
            <span class="crop-scenario__hint">仅模拟业务规格，裁剪弹窗会锁定当前比例。</span>
            <span v-if="coverNeedsRecrop" class="crop-scenario__warning">已有封面需重新裁剪</span>
          </div>
          <a-form-item field="cover" label="Cover"
            ><ACoverPicker
              v-model="cover"
              :service="service"
              :readonly="readonly"
              :aspect-ratio="cropRatioConfig.ratio"
              :before-select="openCropDialog"
          /></a-form-item>
        </section>
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
      <a-modal
        v-model:visible="cropVisible"
        title="裁剪封面"
        :width="'min(720px, calc(100vw - 32px))'"
        :mask-closable="false"
        :esc-to-close="false"
        unmount-on-close
        @cancel="cancelCrop"
      >
        <div class="crop-dialog__ratio">
          <span>裁剪比例 {{ cropRatioConfig.label }}</span>
          <span class="crop-dialog__size">输出 {{ cropOutputSize.width }}×{{ cropOutputSize.height }}</span>
        </div>
        <div ref="cropViewport" class="crop-dialog__viewport">
          <div class="crop-stage" :class="{ 'is-natural': cropNatural.width && cropNatural.height }" :style="cropStageStyle">
            <img ref="cropImage" :src="cropSource" :alt="cropItem?.name" class="crop-stage__image" @load="onCropImageLoad" />
            <div
              class="crop-stage__box"
              :style="{ left: `${cropBox.x}%`, top: `${cropBox.y}%`, width: `${cropBox.width}%`, height: `${cropBox.height}%` }"
              @pointerdown="onCropPointerDown"
            >
              <span data-crop-handle="top-left" class="crop-stage__handle crop-stage__handle--top-left" />
              <span data-crop-handle="top-right" class="crop-stage__handle crop-stage__handle--top-right" />
              <span data-crop-handle="bottom-left" class="crop-stage__handle crop-stage__handle--bottom-left" />
              <span data-crop-handle="bottom-right" class="crop-stage__handle crop-stage__handle--bottom-right" />
            </div>
            <span v-if="cropLoading" class="crop-stage__loading">加载图片中…</span>
          </div>
        </div>
        <template #footer>
          <div class="crop-dialog__actions">
            <a-button :disabled="cropSaving" @click="cancelCrop">取消</a-button>
            <a-button type="primary" :loading="cropSaving" :disabled="cropLoading" @click="confirmCrop">确认裁剪</a-button>
          </div>
        </template>
      </a-modal>
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

  .crop-scenario {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
    color: var(--color-text-2);
    font-size: 12px;
  }

  .crop-scenario__label {
    font-weight: 600;
  }

  .crop-scenario__hint {
    color: var(--color-text-3);
  }

  .crop-scenario__warning {
    color: rgb(var(--warning-6));
  }

  .crop-dialog__ratio {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-bottom: 12px;
    color: var(--color-text-2);
    font-size: 12px;
  }

  .crop-dialog__size {
    color: var(--color-text-3);
  }

  .crop-dialog__viewport {
    max-height: min(60vh, calc(100vh - 260px));
    overflow: auto;
  }

  .crop-stage {
    position: relative;
    width: 100%;
    min-height: 220px;
    overflow: hidden;
    background: var(--color-fill-2);
  }

  .crop-stage.is-natural {
    min-height: 0;
  }

  .crop-stage__image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .crop-stage__box {
    position: absolute;
    z-index: 1;
    box-sizing: border-box;
    border: 2px solid rgb(var(--primary-6));
    box-shadow: 0 0 0 9999px rgb(0 0 0 / 45%);
    cursor: move;
    touch-action: none;
  }

  .crop-stage__handle {
    position: absolute;
    width: 8px;
    height: 8px;
    background: #fff;
    border: 1px solid rgb(var(--primary-6));
    border-radius: 50%;
  }

  .crop-stage__handle--top-left {
    top: -5px;
    left: -5px;
    cursor: nwse-resize;
  }

  .crop-stage__handle--top-right {
    top: -5px;
    right: -5px;
    cursor: nesw-resize;
  }

  .crop-stage__handle--bottom-left {
    bottom: -5px;
    left: -5px;
    cursor: nesw-resize;
  }

  .crop-stage__handle--bottom-right {
    right: -5px;
    bottom: -5px;
    cursor: nwse-resize;
  }

  .crop-stage__loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #fff;
    background: rgb(0 0 0 / 35%);
  }

  .crop-dialog__actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 16px;
  }
</style>
