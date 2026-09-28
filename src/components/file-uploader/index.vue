<script setup lang="ts">
  import { computed, inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, toRef, watch } from 'vue';
  import { useFormItem, type RequestOption, type UploadRequest } from '@arco-design/web-vue';
  import { useI18n } from 'vue-i18n';
  import safeFileUrl from '../../internal/file-url';
  import { normalizeFileTypes } from '../../internal/file-types';
  import formatFileSize from '../../internal/file-size';
  import fileUploadRejection from '../../internal/file-upload-rejection';
  import admin9UIOptionsKey from '../../internal/options';
  import type { FileItem, FileType, FileUploadCapability } from '../../services/types';
  import type {
    AFileUploaderExposed,
    AFileUploaderProps,
    FileUploadBatchResult,
    FileUploadFailure,
    FileUploadFailureReason,
    FileUploadTask,
  } from './types';

  interface UploadCallbacks {
    onProgress: (percent: number) => void;
    onSuccess: (item: FileItem) => void;
    onError: (error: unknown) => void;
  }

  interface InternalTask extends FileUploadTask {
    controller?: AbortController;
    callbacks: UploadCallbacks;
    run: number;
  }

  const props = withDefaults(defineProps<AFileUploaderProps>(), {
    service: undefined,
    fileTypes: undefined,
    groupId: null,
    accept: undefined,
    multiple: true,
    limit: 0,
    maxFileSize: 0,
    buttonText: '',
    disabled: false,
  });

  const emit = defineEmits<{
    (e: 'response', item: FileItem, task: FileUploadTask): void;
    (e: 'success', item: FileItem, task: FileUploadTask): void;
    (e: 'error', failure: FileUploadFailure): void;
    (e: 'complete', result: FileUploadBatchResult): void;
    (e: 'tasksChange', tasks: readonly FileUploadTask[]): void;
  }>();

  defineSlots<{
    trigger?: (slotProps: { disabled: boolean; uploading: boolean }) => unknown;
    result?: (slotProps: { succeededCount: number; dismiss: () => void }) => unknown;
    task?: (slotProps: { task: FileUploadTask }) => unknown;
  }>();

  const { t } = useI18n();
  const globalOptions = inject(admin9UIOptionsKey, undefined);
  const resolvedService = computed<Partial<FileUploadCapability> | undefined>(
    () => props.service ?? globalOptions?.fileService
  );
  const internalTasks = ref<InternalTask[]>([]);
  const panelVisible = ref(false);
  const succeededCount = ref(0);
  const root = ref<HTMLDivElement>();
  const triggerRoot = ref<HTMLElement>();
  const panel = ref<HTMLElement>();
  const panelStyle = ref<Record<string, string>>({});
  const mounted = ref(true);
  let taskSequence = 0;
  let batchRevision = 0;
  let completedRevision = 0;
  let enqueueDepth = 0;
  let lastCompletedResult: FileUploadBatchResult = { succeeded: [], failed: [], cancelled: [] };
  const completionWaiters: Array<{
    revision: number;
    resolve: (result: FileUploadBatchResult) => void;
  }> = [];

  const uploading = computed(() =>
    internalTasks.value.some((task) => task.status === 'pending' || task.status === 'uploading')
  );
  const { mergedDisabled, mergedSize } = useFormItem({ disabled: toRef(props, 'disabled'), size: toRef(props, 'size') });
  const allowedFileTypes = computed(() => normalizeFileTypes(props.fileTypes));
  const disabled = computed(() => mergedDisabled.value || allowedFileTypes.value.length === 0);
  const constraints = computed(() =>
    [
      props.limit > 0 ? t('admin9Ui.fileUploader.limitHint', { count: props.limit }) : '',
      props.maxFileSize > 0 ? t('admin9Ui.fileUploader.sizeHint', { size: formatFileSize(props.maxFileSize) }) : '',
    ]
      .filter(Boolean)
      .join(' · ')
  );
  const triggerLabel = computed(() => props.buttonText || t('admin9Ui.fileUploader.upload'));
  const summary = computed(() => {
    const succeeded = internalTasks.value.filter((task) => task.status === 'succeeded').length;
    const failed = internalTasks.value.filter((task) => task.status === 'failed').length;
    const active = internalTasks.value.filter((task) => task.status === 'pending' || task.status === 'uploading').length;
    const cancelled = internalTasks.value.filter((task) => task.status === 'cancelled').length;
    return Object.entries({ active, succeeded, failed, cancelled })
      .filter(([, count]) => count > 0)
      .map(([status, count]) => t(`admin9Ui.fileUploader.summaryParts.${status}`, { count }))
      .join(' · ');
  });

  const snapshotTask = (task: InternalTask): FileUploadTask => ({
    id: task.id,
    file: task.file,
    fileTypes: [...task.fileTypes],
    groupId: task.groupId,
    status: task.status,
    progress: task.progress,
    item: task.item,
    error: task.error,
    failureReason: task.failureReason,
  });
  const tasks = computed<readonly FileUploadTask[]>(() => internalTasks.value.map(snapshotTask));
  const notifyTasks = () => mounted.value && emit('tasksChange', internalTasks.value.map(snapshotTask));
  const findTask = (taskId: string) => internalTasks.value.find((task) => task.id === taskId);
  const isActive = (task: InternalTask) => task.status === 'pending' || task.status === 'uploading';
  const normalizeProgress = (percent: number) => (Number.isFinite(percent) ? Math.min(100, Math.max(0, percent)) : undefined);
  const createError = (message: string) => new Error(`[admin9-ui] AFileUploader ${message}`);
  const validateResult = (item: FileItem, fileTypes: readonly FileType[], taskId: string) => {
    if (!item || typeof item !== 'object') return createError('received an invalid FileItem result.');
    if (typeof item.id !== 'string' || item.id.trim().length === 0)
      return createError('requires a stable non-empty FileItem id.');
    if (!fileTypes.includes(item.type)) return createError('received a FileItem with a mismatched type.');
    if (item.status !== undefined && item.status !== 'ready') return createError('received a FileItem that is not ready.');
    if (!safeFileUrl(item.url)) return createError('received a FileItem without a usable URL.');
    const duplicate = internalTasks.value.some(
      (task) => task.id !== taskId && task.status === 'succeeded' && task.item?.id === item.id
    );
    return duplicate ? createError('received a duplicate FileItem id in the upload queue.') : undefined;
  };

  const buildResult = (): FileUploadBatchResult => ({
    succeeded: internalTasks.value.flatMap((task) => (task.status === 'succeeded' && task.item ? [task.item] : [])),
    failed: internalTasks.value.flatMap((task) =>
      task.status === 'failed' && task.failureReason
        ? [{ task: snapshotTask(task), reason: task.failureReason, error: task.error } as FileUploadFailure]
        : []
    ),
    cancelled: internalTasks.value.filter((task) => task.status === 'cancelled').map(snapshotTask),
  });
  const focusTrigger = () =>
    triggerRoot.value
      ?.querySelector<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ?.focus();

  const finishBatchIfSettled = () => {
    if (enqueueDepth > 0 || !mounted.value || internalTasks.value.some(isActive) || completedRevision >= batchRevision) return;
    completedRevision = batchRevision;
    const result = buildResult();
    lastCompletedResult = result;
    succeededCount.value = result.succeeded.length;
    emit('complete', result);
    for (let index = completionWaiters.length - 1; index >= 0; index -= 1) {
      if (completionWaiters[index].revision <= completedRevision) {
        const [waiter] = completionWaiters.splice(index, 1);
        waiter.resolve(result);
      }
    }
    if (result.failed.length === 0 && result.cancelled.length === 0) {
      const restoreFocus = Boolean(panel.value?.contains(document.activeElement));
      panelVisible.value = false;
      internalTasks.value = [];
      notifyTasks();
      if (restoreFocus) nextTick(focusTrigger);
    }
  };
  const failureText = (task: FileUploadTask) => {
    if (task.failureReason === 'file-type')
      return t('admin9Ui.fileUploader.failure.fileType', {
        types: task.fileTypes
          .map((type) => t(`admin9Ui.filePicker.types.${type}`))
          .join(t('admin9Ui.fileUploader.listSeparator')),
      });
    if (task.failureReason === 'file-format') {
      const rejection = fileUploadRejection(task.error);
      const formats = rejection?.code === 'unsupported-file-format' ? rejection.allowedFormats : undefined;
      return formats?.length
        ? t('admin9Ui.fileUploader.failure.fileFormats', { formats: formats.join(t('admin9Ui.fileUploader.listSeparator')) })
        : t('admin9Ui.fileUploader.failure.fileFormat');
    }
    if (task.failureReason === 'file-count') {
      return t('admin9Ui.fileUploader.failure.fileCount', { max: props.limit });
    }
    if (task.failureReason === 'file-size') {
      return t('admin9Ui.fileUploader.failure.fileSize', { max: formatFileSize(props.maxFileSize) });
    }
    if (task.failureReason === 'invalid-result') return t('admin9Ui.fileUploader.failure.invalidResult');
    return t('admin9Ui.fileUploader.failure.uploadFailed');
  };

  const failTask = (task: InternalTask, reason: FileUploadFailureReason, error: unknown) => {
    task.status = 'failed';
    task.error = error;
    task.failureReason = reason;
    task.controller = undefined;
    task.callbacks.onError(error);
    const failure = { task: snapshotTask(task), reason, error } satisfies FileUploadFailure;
    emit('error', failure);
    notifyTasks();
    finishBatchIfSettled();
  };

  const failUpload = (task: InternalTask, error: unknown) => {
    const rejection = fileUploadRejection(error);
    let reason: FileUploadFailureReason = 'upload-failed';
    if (rejection?.code === 'unsupported-file-type') reason = 'file-type';
    if (rejection?.code === 'unsupported-file-format') reason = 'file-format';
    failTask(task, reason, error);
  };

  const validateTask = (task: InternalTask) => {
    if (props.limit > 0 && internalTasks.value.indexOf(task) >= props.limit) {
      failTask(task, 'file-count', createError(`accepts at most ${props.limit} files in one queue.`));
    } else if (props.maxFileSize > 0 && task.file.size > props.maxFileSize) {
      failTask(task, 'file-size', createError(`accepts files no larger than ${props.maxFileSize} bytes.`));
    } else return true;
    return false;
  };

  const runTask = (task: InternalTask) => {
    if (!validateTask(task)) return;
    const service = resolvedService.value;
    if (!service || typeof service.upload !== 'function') {
      failTask(task, 'upload-failed', createError('requires FileUploadCapability.'));
      return;
    }
    task.run += 1;
    const { run } = task;
    const controller = new AbortController();
    task.controller = controller;
    task.status = 'uploading';
    task.progress = undefined;
    task.error = undefined;
    task.failureReason = undefined;
    notifyTasks();
    let request: Promise<FileItem>;
    try {
      request = service.upload({
        file: task.file,
        fileTypes: [...task.fileTypes],
        groupId: task.groupId,
        signal: controller.signal,
        onProgress: (percent) => {
          if (!mounted.value || task.run !== run || controller.signal.aborted) return;
          task.progress = normalizeProgress(percent);
          task.callbacks.onProgress(percent);
          notifyTasks();
        },
      });
    } catch (error) {
      failUpload(task, error);
      return;
    }
    Promise.resolve(request)
      .then((item) => {
        if (!mounted.value || task.run !== run || controller.signal.aborted) return;
        task.item = item;
        emit('response', item, snapshotTask(task));
        const error = validateResult(item, task.fileTypes, task.id);
        if (error) {
          failTask(task, 'invalid-result', error);
          return;
        }
        task.status = 'succeeded';
        task.progress = 100;
        task.controller = undefined;
        task.callbacks.onSuccess(item);
        emit('success', item, snapshotTask(task));
        notifyTasks();
        finishBatchIfSettled();
      })
      .catch((error: unknown) => {
        if (!mounted.value || task.run !== run || controller.signal.aborted) return;
        failUpload(task, error);
      });
  };

  const noOpCallbacks = (): UploadCallbacks => ({
    onProgress: () => undefined,
    onSuccess: () => undefined,
    onError: () => undefined,
  });
  const enqueue = (file: File, callbacks: UploadCallbacks) => {
    const fileTypes = [...allowedFileTypes.value];
    if (!fileTypes.length) {
      callbacks.onError(createError('requires at least one allowed FileType.'));
      return undefined;
    }
    const task = reactive<InternalTask>({
      id: `a9-upload-${Date.now()}-${(taskSequence += 1)}`,
      file,
      fileTypes,
      groupId: props.groupId ?? null,
      status: 'pending',
      callbacks,
      run: 0,
    });
    succeededCount.value = 0;
    internalTasks.value.push(task);
    panelVisible.value = true;
    batchRevision += 1;
    notifyTasks();
    runTask(task);
    return task;
  };

  function cancel(taskId?: string) {
    internalTasks.value.forEach((task) => {
      if ((!taskId || task.id === taskId) && isActive(task)) {
        task.run += 1;
        task.controller?.abort();
        task.controller = undefined;
        task.status = 'cancelled';
        task.progress = undefined;
      }
    });
    notifyTasks();
    finishBatchIfSettled();
  }
  const customUpload = (option: RequestOption): UploadRequest => {
    if (disabled.value) {
      option.onError(createError('is disabled.'));
      return { abort: () => undefined };
    }
    const { file } = option.fileItem;
    if (!file) {
      const error = createError('requires a local File.');
      option.onError(error);
      return { abort: () => undefined };
    }
    enqueueDepth += 1;
    let task: InternalTask | undefined;
    try {
      task = enqueue(file, {
        onProgress: option.onProgress,
        onSuccess: option.onSuccess,
        onError: option.onError,
      });
    } finally {
      enqueueDepth -= 1;
      queueMicrotask(finishBatchIfSettled);
    }
    return { abort: () => task && cancel(task.id) };
  };
  const retry = (taskId: string) => {
    if (disabled.value) return;
    const task = findTask(taskId);
    if (
      !task ||
      (task.status !== 'failed' && task.status !== 'cancelled') ||
      task.failureReason === 'file-type' ||
      task.failureReason === 'file-format'
    )
      return;
    succeededCount.value = 0;
    batchRevision += 1;
    task.status = 'pending';
    task.item = undefined;
    task.error = undefined;
    task.failureReason = undefined;
    runTask(task);
  };
  const remove = (taskId: string) => {
    const task = findTask(taskId);
    if (!task || isActive(task)) return;
    internalTasks.value = internalTasks.value.filter((entry) => entry.id !== taskId);
    if (internalTasks.value.length === 0) panelVisible.value = false;
    notifyTasks();
  };
  const clear = () => {
    cancel();
    succeededCount.value = 0;
    internalTasks.value = [];
    panelVisible.value = false;
    notifyTasks();
  };
  const closePanel = async () => {
    if (uploading.value) return;
    internalTasks.value = [];
    panelVisible.value = false;
    notifyTasks();
    await nextTick();
    focusTrigger();
  };
  const updatePanelPosition = async () => {
    if (!panelVisible.value) return;
    await nextTick();
    if (!root.value) return;
    const rootRect = root.value.getBoundingClientRect();
    const panelWidth = Math.min(360, Math.max(0, window.innerWidth - 48));
    const preferredLeft = rootRect.right - panelWidth;
    const viewportLeft = Math.max(24, Math.min(preferredLeft, window.innerWidth - panelWidth - 24));
    panelStyle.value = { left: `${viewportLeft - rootRect.left}px`, right: 'auto' };
  };
  const upload = (files: readonly File[]) => {
    if (mergedDisabled.value) return Promise.reject(createError('is disabled.'));
    if (!allowedFileTypes.value.length) return Promise.reject(createError('requires at least one allowed FileType.'));
    if (files.length === 0) return Promise.resolve({ succeeded: [], failed: [], cancelled: [] });
    enqueueDepth += 1;
    try {
      files.forEach((file) => enqueue(file, noOpCallbacks()));
    } finally {
      enqueueDepth -= 1;
    }
    const revision = batchRevision;
    finishBatchIfSettled();
    if (revision === 0) return Promise.resolve(buildResult());
    if (!uploading.value && completedRevision >= revision) return Promise.resolve(lastCompletedResult);
    return new Promise<FileUploadBatchResult>((resolve) => {
      completionWaiters.push({ revision, resolve });
    });
  };

  watch(
    () => [resolvedService.value, allowedFileTypes.value.join('|'), props.groupId] as const,
    (current, previous) => {
      if (previous && current.some((value, index) => value !== previous[index])) clear();
    }
  );
  watch(panelVisible, (visible) => {
    if (visible) updatePanelPosition();
  });
  onMounted(() => window.addEventListener('resize', updatePanelPosition));
  onBeforeUnmount(() => {
    mounted.value = false;
    window.removeEventListener('resize', updatePanelPosition);
    cancel();
    completionWaiters.splice(0).forEach((waiter) => waiter.resolve(buildResult()));
  });

  defineExpose<AFileUploaderExposed>({
    upload,
    cancel,
    retry,
    remove,
    clear,
    get tasks() {
      return tasks.value;
    },
  });
</script>

<template>
  <div ref="root" class="a9-file-uploader" :class="{ 'is-panel-visible': panelVisible && tasks.length }">
    <a-upload :accept="accept" :disabled="disabled" :multiple="multiple" :show-file-list="false" :custom-request="customUpload">
      <template #upload-button>
        <span ref="triggerRoot" class="a9-file-uploader__trigger">
          <slot name="trigger" :disabled="disabled" :uploading="uploading">
            <a-button type="primary" :disabled="disabled" :size="mergedSize">
              <template #icon><icon-upload /></template>
              {{ triggerLabel }}
            </a-button>
          </slot>
        </span>
      </template>
    </a-upload>

    <div v-if="constraints" class="a9-file-uploader__constraints">{{ constraints }}</div>
    <slot name="result" :succeeded-count="succeededCount" :dismiss="() => (succeededCount = 0)">
      <div v-if="succeededCount" class="a9-file-uploader__result" role="status">
        <span>{{ t('admin9Ui.fileUploader.uploaded', { count: succeededCount }) }}</span>
        <a-button type="text" size="mini" :aria-label="t('admin9Ui.fileUploader.dismissResult')" @click="succeededCount = 0">
          <template #icon><icon-close /></template>
        </a-button>
      </div>
    </slot>
    <section
      v-if="panelVisible && tasks.length"
      ref="panel"
      class="a9-file-uploader__panel"
      role="region"
      :style="panelStyle"
      :aria-label="t('admin9Ui.fileUploader.queue')"
    >
      <header class="a9-file-uploader__header">
        <strong>{{ t('admin9Ui.fileUploader.queue') }}</strong>
        <a-tooltip v-if="!uploading" :content="t('admin9Ui.fileUploader.closeQueue')">
          <a-button type="text" size="mini" :aria-label="t('admin9Ui.fileUploader.closeQueue')" @click="closePanel">
            <template #icon><icon-close /></template>
          </a-button>
        </a-tooltip>
      </header>
      <div v-if="summary" class="a9-file-uploader__summary" aria-live="polite">{{ summary }}</div>
      <ul class="a9-file-uploader__tasks">
        <li v-for="task in tasks" :key="task.id" class="a9-file-uploader__task" :data-upload-task-id="task.id">
          <slot name="task" :task="task">
            <div class="a9-file-uploader__task-main">
              <span class="a9-file-uploader__name" :title="task.file.name">{{ task.file.name }}</span>
              <span class="a9-file-uploader__status">
                {{ t(`admin9Ui.fileUploader.status.${task.status}`) }}
              </span>
            </div>
            <a-progress
              v-if="task.status === 'uploading' && task.progress !== undefined"
              :percent="task.progress / 100"
              size="small"
              :show-text="false"
            />
            <a-spin v-else-if="task.status === 'uploading'" size="mini" />
            <div v-else-if="task.status === 'failed'" class="a9-file-uploader__error" role="alert">
              {{ failureText(task) }}
            </div>
            <div class="a9-file-uploader__task-actions">
              <a-tooltip
                v-if="task.status === 'pending' || task.status === 'uploading'"
                :content="t('admin9Ui.fileUploader.cancel')"
              >
                <a-button
                  type="text"
                  size="mini"
                  :aria-label="t('admin9Ui.fileUploader.cancelFile', { name: task.file.name })"
                  @click="cancel(task.id)"
                >
                  <template #icon><icon-stop /></template>
                </a-button>
              </a-tooltip>
              <a-tooltip
                v-if="
                  task.status === 'cancelled' ||
                  (task.status === 'failed' &&
                    task.failureReason !== 'file-count' &&
                    task.failureReason !== 'file-size' &&
                    task.failureReason !== 'file-type' &&
                    task.failureReason !== 'file-format')
                "
                :content="t('admin9Ui.fileUploader.retry')"
              >
                <a-button
                  type="text"
                  size="mini"
                  :aria-label="t('admin9Ui.fileUploader.retryFile', { name: task.file.name })"
                  :disabled="disabled"
                  @click="retry(task.id)"
                >
                  <template #icon><icon-refresh /></template>
                </a-button>
              </a-tooltip>
              <a-tooltip
                v-if="task.status !== 'pending' && task.status !== 'uploading'"
                :content="t('admin9Ui.fileUploader.remove')"
              >
                <a-button
                  type="text"
                  size="mini"
                  :aria-label="t('admin9Ui.fileUploader.removeFile', { name: task.file.name })"
                  @click="remove(task.id)"
                >
                  <template #icon><icon-delete /></template>
                </a-button>
              </a-tooltip>
            </div>
          </slot>
        </li>
      </ul>
    </section>
  </div>
</template>

<style lang="less" scoped>
  .a9-file-uploader {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;

    &__constraints {
      color: var(--color-text-3);
      font-size: 12px;
    }

    &__result {
      display: flex;
      gap: 8px;
      align-items: center;
      color: rgb(var(--success-6));
      font-size: 12px;
    }

    &__panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 1001;
      width: min(360px, calc(100vw - 48px));
      padding: 12px;
      color: var(--color-text-1);
      background: var(--color-bg-popup);
      border: 1px solid var(--color-border-2);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgb(0 0 0 / 12%);
    }

    &__trigger {
      display: inline-flex;
    }

    &__header,
    &__task-main,
    &__task-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    &__header,
    &__task-main {
      justify-content: space-between;
    }

    &__summary,
    &__status,
    &__error {
      color: var(--color-text-3);
      font-size: 12px;
    }

    &__summary {
      margin: 4px 0 8px;
    }

    &__tasks {
      display: grid;
      max-height: min(320px, 45dvh);
      margin: 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;
    }

    &__task {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px 8px;
      align-items: center;
      padding: 8px 0;
      border-top: 1px solid var(--color-border-1);
    }

    &__task-main {
      min-width: 0;
    }

    &__name {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    :deep(.arco-progress),
    :deep(.arco-spin),
    &__error {
      grid-column: 1;
    }

    &__error {
      color: rgb(var(--red-6));
    }

    &__task-actions {
      grid-row: 1 / span 2;
      grid-column: 2;
    }
  }
</style>
