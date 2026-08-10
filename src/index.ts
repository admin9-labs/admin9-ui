import type { App, Plugin } from 'vue';
import admin9UIPluginOptionsKey from './internal/options';
import type { Admin9UIPluginOptions } from './services/types';

// 组件
import AMediaPicker from './components/media-picker/index.vue';
import AMediaLibrary from './components/media-library/index.vue';
import AIconPicker from './components/icon-picker/index.vue';
import AProTable from './components/pro-table/index.vue';
import ATiptapEditor from './components/tiptap-editor/index.vue';

// 服务接口契约（供 App 实现 adapter 时 import 类型）
export type {
  MediaBrowseService,
  MediaUploadCapability,
  MediaRemoveCapability,
  MediaGroupCapability,
  MediaMoveCapability,
  MediaPickerService,
  MediaLibraryAdapter,
  MediaService,
  MediaLibraryService,
  MediaType,
  MediaGroup,
  MediaItem,
  MediaListParams,
  MediaListResult,
  MediaPagination,
  MediaUploadOptions,
  CreateMediaGroupOptions,
  RenameMediaGroupOptions,
  RemoveMediaGroupOptions,
  MoveMediaOptions,
  Admin9UIPluginOptions,
  Admin9UIOptions,
} from './services/types';

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

// 组件命名导出（供按需 import）
export { AMediaPicker, AMediaLibrary, AIconPicker, AProTable, ATiptapEditor };

/**
 * 安装插件。
 *
 * @example 全局注入默认服务
 * app.use(Admin9UI, { mediaService })
 *
 * @example 仅安装组件（service 由使用点 :service 传入）
 * app.use(Admin9UI)
 */
const Admin9UI = {
  install(app: App, options: Admin9UIPluginOptions = {}) {
    // 名称冲突检测：A 前缀下若与 Arco 原生组件重名，提示及早发现
    const reserved = ['AMediaPicker', 'AMediaLibrary', 'AIconPicker', 'AProTable', 'ATiptapEditor'];
    reserved.forEach((name) => {
      if (app.component(name)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[admin9-ui] Component "${name}" 已被注册，可能与 Arco 原生组件冲突。` +
            `若需隔离，可改用 A9/Pro 前缀（见 DESIGN.md §3）。`
        );
      }
    });

    app.component('AMediaPicker', AMediaPicker);
    app.component('AMediaLibrary', AMediaLibrary);
    app.component('AIconPicker', AIconPicker);
    app.component('AProTable', AProTable);
    app.component('ATiptapEditor', ATiptapEditor);

    // 提供默认服务，供使用点不传 :service 时回退
    app.provide(admin9UIPluginOptionsKey, options);
  },
} satisfies Plugin;

export default Admin9UI;
