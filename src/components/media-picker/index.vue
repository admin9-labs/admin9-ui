<script setup lang="ts">
  import { computed, inject, onMounted, ref, watch } from 'vue';
  import { Message } from '@arco-design/web-vue';
  import type { FileItem, RequestOption, UploadRequest } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';
  import { useLoading, useVisible } from '../../hooks';
  import { admin9UIOptionsKey } from '../../locale';
  import type { MediaItem, MediaService } from '../../services/types';

  /**
   * AMediaPicker —— 后端无关的素材选择器。
   *
   * 设计要点（见 DESIGN.md §5.1）：
   * - 库不直接调任何后端，列表/上传/删除全部走注入的 MediaService。
   * - 上传用 a-upload :custom-request → service.upload（不再 :action 绕过 axios）。
   * - emit 与 onMounted 反构统一用 id，避免 uid/id 混用。
   * - 单选(multiple=false)即选即关；多选(multiple=true)底部确认。
   */
  type ModelValue = MediaItem[] | MediaItem | string | undefined;

  const props = withDefaults(
    defineProps<{
      modelValue?: ModelValue;
      /** 多选开关；false 时单选即选即关 */
      multiple?: boolean;
      /** 最多可选数量，0 = 不限（仅 multiple 生效） */
      limit?: number;
      /** 每页条数 */
      pageSize?: number;
      /** 外层触发按钮文案 */
      buttonText?: string;
      /** 上传接受的 MIME */
      accept?: string;
      /** 是否允许在素材弹窗中上传 */
      canUpload?: boolean;
      /** 是否允许在素材弹窗中删除 */
      canDelete?: boolean;
      /** 媒体服务；未传时回退到插件全局注入 */
      service?: MediaService;
      /** 是否展示外层已选文件列表 */
      showFileList?: boolean;
    }>(),
    {
      multiple: false,
      limit: 0,
      pageSize: 24,
      buttonText: '',
      accept: 'image/png,image/jpeg,image/gif',
      canUpload: true,
      canDelete: true,
      showFileList: true,
    }
  );

  const emit = defineEmits<{
    (e: 'update:modelValue', value: ModelValue): void;
    (e: 'change', items: MediaItem[]): void;
    (e: 'select', items: MediaItem[]): void;
    (e: 'upload-success', item: MediaItem): void;
    (e: 'upload-error', error: unknown): void;
  }>();

  const { t } = useI18n();
  const { visible, setVisible } = useVisible();
  const { loading, setLoading } = useLoading();
  const globalOptions = inject(admin9UIOptionsKey, undefined);
  const service = props.service ?? globalOptions?.mediaService;
  if (!service) {
    throw new Error(
      '[admin9-ui] AMediaPicker requires a MediaService. Pass the service prop or install Admin9UI with { mediaService }.'
    );
  }

  /* ------------------------------ 列表数据 ------------------------------ */
  const list = ref<MediaItem[]>([]);
  const current = ref(1);
  const pageSize = ref(props.pageSize);
  const total = ref(0);
  let latestListRequest = 0;
  const isEmpty = computed(() => list.value.length === 0 && !loading.value);
  type SelectableMediaItem = MediaItem & { url: string };
  const isSelectable = (item: MediaItem): item is SelectableMediaItem =>
    (!item.status || item.status === 'ready') && typeof item.url === 'string' && item.url.length > 0;
  const previewUrl = (item: MediaItem) => (isSelectable(item) ? item.thumbnail || item.url : undefined);
  const statusLabel = (item: MediaItem) =>
    item.status === 'pending' ? t('admin9Ui.mediaPicker.processing') : t('admin9Ui.mediaPicker.failed');

  const fetchList = async () => {
    const request = latestListRequest + 1;
    latestListRequest = request;
    setLoading(true);
    try {
      const { list: items, pagination } = await service.list({
        page: current.value,
        pageSize: pageSize.value,
      });
      if (request !== latestListRequest) return;
      list.value = items;
      total.value = pagination.total;
      pageSize.value = pagination.pageSize;
    } catch {
      if (request !== latestListRequest) return;
      // service 抛错时给出提示并清空，不阻塞交互
      Message.error(t('admin9Ui.mediaPicker.loadFailed'));
      list.value = [];
      total.value = 0;
    } finally {
      if (request === latestListRequest) setLoading(false);
    }
  };

  const onPageChange = (page: number) => {
    current.value = page;
    fetchList();
  };

  /* ---------------------- 已选模型（emit 源，保留完整 MediaItem） --------- */
  const selectedItems = ref<MediaItem[]>([]);
  const fileList = ref<FileItem[]>([]);

  const toFileItem = (item: MediaItem): FileItem => ({
    uid: item.id,
    name: item.name,
    url: item.url ?? undefined,
    status: 'done',
  });

  const isStringModel = computed(() => typeof props.modelValue === 'string');

  const emitSingle = (item: MediaItem | undefined) => {
    if (item === undefined) {
      emit('update:modelValue', undefined);
      return;
    }
    // 保留消费者原始形态：字符串模式回传 URL，否则回传 MediaItem
    emit('update:modelValue', isStringModel.value ? item.url ?? undefined : item);
  };

  const confirmSelection = (items: MediaItem[]) => {
    const selectableItems = items.filter(isSelectable);
    setVisible(false);
    selectedItems.value = selectableItems;
    fileList.value = selectableItems.map(toFileItem);
    emit('change', selectableItems);
    if (props.multiple) {
      emit('update:modelValue', selectableItems);
    } else {
      emitSingle(selectableItems[selectableItems.length - 1]);
    }
  };

  /* ------------------------------ 选中状态 ------------------------------ */
  // 多选：跨页累积（Map 保序去重，key=id）
  const selectedMap = ref(new Map<string, MediaItem>());
  const selectedKeys = computed(() => Array.from(selectedMap.value.keys()));
  const selectCount = computed(() => selectedMap.value.size);
  // 单选
  const singleKey = ref<string>('');
  // limit 达到上限：禁止再勾未选项（多选）
  const limitReached = computed(() => props.multiple && props.limit > 0 && selectCount.value >= props.limit);

  const onMultiSelect = (value: (string | number | boolean)[]) => {
    const incoming = new Set(value.map((v) => String(v)));
    const next = new Map(selectedMap.value);
    // 仅同步当前页：勾上→加入，取消→移除（其它页选中项保留）
    list.value.forEach((item) => {
      if (!isSelectable(item)) {
        next.delete(item.id);
        return;
      }
      if (incoming.has(item.id)) next.set(item.id, item);
      else next.delete(item.id);
    });
    selectedMap.value = next;
    emit('select', Array.from(next.values()));
  };

  const onSingleSelect = (value: string | number | boolean) => {
    const id = String(value);
    const item = list.value.find((m) => m.id === id);
    if (!item || !isSelectable(item)) return;
    singleKey.value = id;
    // 即选即关
    confirmSelection([item]);
  };

  const onConfirm = () => {
    confirmSelection(Array.from(selectedMap.value.values()));
  };

  /* ------------------------------ 删除 ------------------------------ */
  const deletingIds = ref(new Set<string>());
  const deleteLoading = computed(() => selectedKeys.value.some((id) => deletingIds.value.has(id)));
  const isDeleting = (id: string) => deletingIds.value.has(id);
  const removeItems = async (inputIds: string[]) => {
    const ids = Array.from(new Set(inputIds));
    if (ids.length === 0 || ids.some(isDeleting)) return;
    deletingIds.value = new Set([...deletingIds.value, ...ids]);
    try {
      await service.remove(ids);
      const next = new Map(selectedMap.value);
      ids.forEach((id) => next.delete(id));
      selectedMap.value = next;
      await fetchList();
    } catch {
      selectedMap.value = new Map();
      emit('select', []);
      await fetchList();
      Message.error(t('admin9Ui.mediaPicker.deleteFailed'));
    } finally {
      const remaining = new Set(deletingIds.value);
      ids.forEach((id) => remaining.delete(id));
      deletingIds.value = remaining;
    }
  };
  const onDeleteItems = () => removeItems(selectedKeys.value);
  const onDeleteFailed = (id: string) => removeItems([id]);

  /* ----------------------- 上传（走 service，不绕过 axios） ------------- */
  const uploadCount = ref(0);
  const uploadLoading = computed(() => uploadCount.value > 0);

  const customUpload = (option: RequestOption): UploadRequest => {
    const controller = new AbortController();
    const { file } = option.fileItem;
    if (!file) {
      option.onError(new Error('No file'));
      return { abort: () => controller.abort() };
    }
    uploadCount.value += 1;
    service
      .upload({ file, onProgress: option.onProgress, signal: controller.signal })
      .then((item) => {
        option.onSuccess(item);
        // Public event names are intentionally preserved for compatibility.
        // eslint-disable-next-line vue/custom-event-name-casing
        emit('upload-success', item);
        // service.upload 可能不返回稳定 id（见 DESIGN.md §11.1），上传后强制刷新
        fetchList();
      })
      .catch((error: unknown) => {
        option.onError(error);
        // eslint-disable-next-line vue/custom-event-name-casing
        emit('upload-error', error);
        Message.error(t('admin9Ui.mediaPicker.uploadFailed'));
      })
      .finally(() => {
        uploadCount.value -= 1;
      });
    return { abort: () => controller.abort() };
  };

  /* ------------------------------ 弹窗开关 ------------------------------ */
  const openModal = () => {
    setVisible(true);
    current.value = 1;
    selectedMap.value = new Map();
    singleKey.value = '';
    fetchList();
  };

  const closeModal = () => {
    setVisible(false);
    selectedMap.value = new Map();
    singleKey.value = '';
  };

  /* ------------------------------ 外层 a-upload ------------------------- */
  // 外层展示列表（a-upload 拥有；uid 一致用 id，修 uid/id 混用 bug）
  // 点击触发按钮：打开弹窗，并返回空 FileList 阻止 a-upload 原生上传
  const onTriggerClick = () => {
    openModal();
    return new Promise<FileList>((resolve) => {
      resolve(new DataTransfer().files);
    });
  };

  // 外层移除已选项
  const onRemoveDisplay = (fileItem: FileItem) =>
    new Promise<boolean>((resolve) => {
      selectedItems.value = selectedItems.value.filter((m) => m.id !== fileItem.uid);
      const items = selectedItems.value;
      emit('change', items);
      if (props.multiple) {
        emit('update:modelValue', items);
      } else {
        emitSingle(items[items.length - 1]);
      }
      // resolve(true) 让 a-upload 自行从 fileList 移除该项（与 selectedItems 同步）
      resolve(true);
    });

  /* ----------------------- modelValue 反构（统一用 id） ------------------ */
  const basename = (url: string) => {
    const idx = url.lastIndexOf('/');
    return idx >= 0 ? url.substring(idx + 1) : url;
  };

  const normalizeModelToItems = (value: ModelValue): MediaItem[] => {
    if (value === undefined || value === null || value === '') return [];
    if (typeof value === 'string') {
      // 旧 URL 字符串：无 id，用 url 占位（仅外层展示用，不参与回传 id 语义）
      return [{ id: value, name: basename(value), url: value }];
    }
    if (Array.isArray(value)) return value.filter(Boolean);
    return [value];
  };

  const syncFromModel = (value: ModelValue) => {
    const items = normalizeModelToItems(value);
    selectedItems.value = items;
    fileList.value = items.map(toFileItem);
  };

  onMounted(() => {
    syncFromModel(props.modelValue);
  });

  // 外部变更同步。picker 自身 emit 后父级回填会触发本 watch，
  // 此时 normalize 结果与 selectedItems 一致（等幂 set，不 emit，故无循环）。
  watch(() => props.modelValue, syncFromModel);
</script>

<template>
  <div class="a9-media-picker">
    <!-- 外层：展示已选 + 触发按钮（点击打开弹窗，返回空 FileList 阻止原生上传） -->
    <a-upload
      v-model:file-list="fileList"
      :list-type="showFileList ? 'picture-card' : 'text'"
      :show-file-list="showFileList"
      :auto-upload="false"
      image-preview
      image-loading="lazy"
      @before-remove="onRemoveDisplay"
      @button-click="onTriggerClick"
    >
      <template #upload-button>
        <slot name="upload-button">
          <a-button :loading="uploadLoading" type="primary">
            <template #icon><icon-upload /></template>
            {{ buttonText || t('admin9Ui.mediaPicker.selectImage') }}
          </a-button>
        </slot>
      </template>
    </a-upload>

    <!-- 素材选择弹窗 -->
    <a-modal v-model:visible="visible" :mask-closable="false" width="810px" title-align="start" @close="closeModal">
      <template #title>{{ t('admin9Ui.mediaPicker.title') }}</template>
      <a-space direction="vertical" size="medium" fill>
        <div class="a9-media-picker__toolbar">
          <a-space>
            <a-upload
              v-if="canUpload"
              :multiple="true"
              :show-file-list="false"
              :auto-upload="true"
              :custom-request="customUpload"
              :accept="accept"
            >
              <template #upload-button>
                <a-button :loading="uploadLoading" type="primary">
                  <template #icon><icon-upload /></template>
                  {{ t('admin9Ui.mediaPicker.uploadImage') }}
                </a-button>
              </template>
            </a-upload>
            <a-popconfirm
              v-if="canDelete && selectCount"
              :content="t('admin9Ui.mediaPicker.deleteConfirm')"
              :ok-text="t('admin9Ui.mediaPicker.delete')"
              :cancel-text="t('admin9Ui.mediaPicker.cancel')"
              :ok-loading="deleteLoading"
              @ok="onDeleteItems"
            >
              <a-button :loading="deleteLoading" type="primary" status="danger">
                {{ t('admin9Ui.mediaPicker.deleteCount', { count: selectCount }) }}
              </a-button>
            </a-popconfirm>
          </a-space>
          <a-button @click="fetchList">
            <template #icon><icon-refresh /></template>
          </a-button>
        </div>
        <a-spin :loading="loading" class="a9-media-picker__gallery" :class="{ 'is-empty': isEmpty }">
          <a-empty v-if="isEmpty" :description="t('admin9Ui.mediaPicker.empty')" />
          <!-- 单选：radio 即选即关 -->
          <a-radio-group v-else-if="!multiple" :model-value="singleKey" @change="onSingleSelect">
            <div class="a9-media-picker__grid">
              <div
                v-for="item in list"
                :key="item.id"
                class="a9-media-picker__item"
                :class="{ 'is-unavailable': !isSelectable(item) }"
              >
                <a-radio :value="item.id" :disabled="!isSelectable(item)">
                  <template #radio>
                    <a-image
                      v-if="previewUrl(item)"
                      :src="previewUrl(item)"
                      :preview="false"
                      width="120"
                      height="90"
                      fit="cover"
                      show-loader
                    />
                    <div v-else class="a9-media-picker__placeholder" aria-hidden="true" />
                  </template>
                </a-radio>
                <span v-if="!isSelectable(item)" class="a9-media-picker__status">{{ statusLabel(item) }}</span>
                <a-popconfirm
                  v-if="item.status === 'failed' && canDelete"
                  :content="t('admin9Ui.mediaPicker.deleteConfirm')"
                  :ok-text="t('admin9Ui.mediaPicker.delete')"
                  :cancel-text="t('admin9Ui.mediaPicker.cancel')"
                  :ok-loading="isDeleting(item.id)"
                  @ok="onDeleteFailed(item.id)"
                >
                  <a-button
                    class="a9-media-picker__delete"
                    size="mini"
                    status="danger"
                    :loading="isDeleting(item.id)"
                    :disabled="isDeleting(item.id)"
                    @click.stop
                  >
                    {{ t('admin9Ui.mediaPicker.delete') }}
                  </a-button>
                </a-popconfirm>
              </div>
            </div>
          </a-radio-group>
          <!-- 多选：checkbox + 底部确认 -->
          <a-checkbox-group v-else :model-value="selectedKeys" @change="onMultiSelect">
            <div class="a9-media-picker__grid">
              <div
                v-for="item in list"
                :key="item.id"
                class="a9-media-picker__item"
                :class="{ 'is-unavailable': !isSelectable(item) }"
              >
                <a-checkbox
                  :value="item.id"
                  :disabled="!isSelectable(item) || (limitReached && !selectedKeys.includes(item.id))"
                >
                  <template #checkbox>
                    <a-image
                      v-if="previewUrl(item)"
                      :src="previewUrl(item)"
                      :preview="false"
                      width="120"
                      height="90"
                      fit="cover"
                      show-loader
                    />
                    <div v-else class="a9-media-picker__placeholder" aria-hidden="true" />
                  </template>
                </a-checkbox>
                <span v-if="!isSelectable(item)" class="a9-media-picker__status">{{ statusLabel(item) }}</span>
                <a-popconfirm
                  v-if="item.status === 'failed' && canDelete"
                  :content="t('admin9Ui.mediaPicker.deleteConfirm')"
                  :ok-text="t('admin9Ui.mediaPicker.delete')"
                  :cancel-text="t('admin9Ui.mediaPicker.cancel')"
                  :ok-loading="isDeleting(item.id)"
                  @ok="onDeleteFailed(item.id)"
                >
                  <a-button
                    class="a9-media-picker__delete"
                    size="mini"
                    status="danger"
                    :loading="isDeleting(item.id)"
                    :disabled="isDeleting(item.id)"
                    @click.stop
                  >
                    {{ t('admin9Ui.mediaPicker.delete') }}
                  </a-button>
                </a-popconfirm>
              </div>
            </div>
          </a-checkbox-group>
        </a-spin>
      </a-space>
      <template #footer>
        <div class="a9-media-picker__footer">
          <a-pagination :total="total" :current="current" :page-size="pageSize" show-total @change="onPageChange" />
          <a-space>
            <a-button @click="closeModal">
              {{ t('admin9Ui.mediaPicker.cancel') }}
            </a-button>
            <a-button v-if="multiple" type="primary" :disabled="selectCount === 0" @click="onConfirm">
              {{ t('admin9Ui.mediaPicker.confirm') }}{{ selectCount ? ` (${selectCount})` : '' }}
            </a-button>
          </a-space>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<style lang="less" scoped>
  .a9-media-picker {
    &__toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    &__gallery {
      display: flex;
      min-height: 390px;

      &.is-empty {
        align-items: center;
      }
    }

    &__grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-content: flex-start;
      width: 100%;
      min-height: 390px;

      :deep(.arco-radio),
      :deep(.arco-checkbox) {
        margin-right: 0;
        padding-left: 0;
      }

      :deep(.arco-image) {
        overflow: hidden;
        border: 2px solid var(--color-neutral-1);
      }

      :deep(.arco-radio-checked) .arco-image,
      :deep(.arco-checkbox-checked) .arco-image {
        border-color: rgb(var(--primary-6));
      }
    }

    &__item {
      position: relative;

      &.is-unavailable {
        opacity: 0.6;
      }
    }

    &__placeholder {
      width: 120px;
      height: 90px;
      background: var(--color-fill-2);
      border: 2px solid var(--color-neutral-1);
    }

    &__status,
    &__delete {
      position: absolute;
      right: 4px;
      z-index: 1;
    }

    &__status {
      bottom: 4px;
      padding: 2px 6px;
      color: var(--color-white);
      font-size: 12px;
      line-height: 18px;
      background: rgb(var(--danger-6));
      border-radius: 2px;
    }

    &__item:not(.is-unavailable) &__status {
      display: none;
    }

    &__delete {
      top: 4px;
    }

    &__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
  }
</style>
