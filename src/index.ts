import type { App, Plugin } from 'vue';
import admin9UIPluginOptionsKey from './internal/options';
import type { Admin9UIPluginOptions } from './services/types';

// 组件
import AFilePicker from './components/file-picker/index.vue';
import AFileUploader from './components/file-uploader/index.vue';
import AIconPicker from './components/icon-picker/index.vue';
import AProTable from './components/pro-table/index.vue';
import ATiptapEditor from './components/tiptap-editor/index.vue';
import ACoordinatePicker from './components/coordinate-picker/index.vue';
import AFilterForm from './components/filter-form/index.vue';

// 服务接口契约（供 App 实现 adapter 时 import 类型）
export type {
  Admin9UIPluginOptions,
  Admin9UIOptions,
  FileType,
  FileGroup,
  FileItem,
  FileListParams,
  FilePagination,
  FileListResult,
  FileUploadOptions,
  FileBrowseCapability,
  FileUploadCapability,
  FilePickerAdapter,
} from './services/types';

export type {
  AFileUploaderExposed,
  AFileUploaderProps,
  FileUploadBatchResult,
  FileUploadFailure,
  FileUploadFailureReason,
  FileUploadTask,
  FileUploadTaskStatus,
} from './components/file-uploader/types';

// locale（供 App 合并进宿主 vue-i18n）
export { messages, localePrefix } from './locale';

// 图标名清单（供 AIconPicker，App 也可直接用）
export { arcoIconNames } from './components/icon-picker/icon-names';

export type {
  ATiptapEditorProps,
  TiptapAudioWidth,
  TiptapBlockWidth,
  TiptapImageDisplay,
  TiptapInlineImageSize,
  TiptapMediaAlign,
  TiptapMediaError,
  TiptapMediaErrorReason,
  TiptapMediaOperation,
} from './components/tiptap-editor/types';

export type {
  CoordinateSelection,
  CoordinateSelectionSource,
  CoordinateValue,
  TencentMapSuggestion,
} from './components/coordinate-picker/types';

export type { AFilterFormProps } from './components/filter-form/types';

export type {
  Action,
  Slot,
  ProTableFetcherParams,
  ProTableFetcherResult,
  ProTableRequestOptions,
} from './components/pro-table/types';

// 组件命名导出（供按需 import）
export { ACoordinatePicker, AFilePicker, AFileUploader, AFilterForm, AIconPicker, AProTable, ATiptapEditor };

/**
 * 安装插件。
 *
 * @example 全局注入默认服务
 * app.use(Admin9UI, { fileService })
 *
 * @example 仅安装组件（service 由使用点 :service 传入）
 * app.use(Admin9UI)
 */
const Admin9UI = {
  install(app: App, options: Admin9UIPluginOptions = {}) {
    // 名称冲突检测：A 前缀下若与 Arco 原生组件重名，提示及早发现
    const reserved = [
      'AFilePicker',
      'AFileUploader',
      'AFilterForm',
      'AIconPicker',
      'AProTable',
      'ATiptapEditor',
      'ACoordinatePicker',
    ];
    reserved.forEach((name) => {
      if (app.component(name)) {
        // eslint-disable-next-line no-console
        console.warn(`[admin9-ui] Component "${name}" 已被注册。如需避免全局名称冲突，请按需导入并在使用点设置本地别名。`);
      }
    });

    app.component('AFilePicker', AFilePicker);
    app.component('AFileUploader', AFileUploader);
    app.component('AFilterForm', AFilterForm);
    app.component('AIconPicker', AIconPicker);
    app.component('AProTable', AProTable);
    app.component('ATiptapEditor', ATiptapEditor);
    app.component('ACoordinatePicker', ACoordinatePicker);

    // 提供默认服务，供使用点不传 :service 时回退
    app.provide(admin9UIPluginOptionsKey, options);
  },
} satisfies Plugin;

export default Admin9UI;
