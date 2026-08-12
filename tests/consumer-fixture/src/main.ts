/* eslint-disable import/no-unresolved -- package imports resolve only after the tarball is installed in the fixture */
import { createApp, h, type Component } from 'vue';
import { createI18n } from 'vue-i18n';
import ArcoVue from '@arco-design/web-vue';
import * as ArcoVueIcon from '@arco-design/web-vue/es/icon';
import Admin9UI, {
  AIconPicker,
  AFileManager,
  AMediaLibrary,
  AMediaPicker,
  AProTable,
  ATiptapEditor,
  arcoIconNames,
  localePrefix as rootLocalePrefix,
  messages as rootMessages,
  type ATiptapEditorProps,
  type CreateMediaGroupOptions,
  type Admin9UIOptions,
  type Admin9UIPluginOptions,
  type MediaItem,
  type FileItem,
  type FileManagerAdapter,
  type FileListParams,
  type MediaLibraryService,
  type MoveMediaOptions,
  type RemoveMediaGroupOptions,
  type RenameMediaGroupOptions,
  type TiptapAudioWidth,
  type TiptapBlockWidth,
  type TiptapImageDisplay,
  type TiptapInlineImageSize,
  type TiptapMediaAlign,
} from '@admin9-labs/admin9-ui';
import { enUS, localePrefix, messages, zhCN } from '@admin9-labs/admin9-ui/locale';
import '@arco-design/web-vue/dist/arco.css';
import '@admin9-labs/admin9-ui/styles';
import FixtureSfc from './FixtureSfc.vue';

const mediaItem: MediaItem = {
  id: 'fixture-image',
  name: 'Fixture image',
  type: 'image',
  groupId: null,
  url: 'https://example.invalid/fixture.png',
};

const fileItem: FileItem = {
  id: 'fixture-document',
  name: 'Fixture document.pdf',
  type: 'document',
  groupId: null,
  url: 'https://example.invalid/fixture.pdf',
  extension: 'pdf',
};

const fileService: FileManagerAdapter = {
  async list(params: FileListParams) {
    return {
      list: [fileItem],
      pagination: { page: params.page, pageSize: params.pageSize, total: 1, hasMore: false },
      typeCounts: { document: 1 },
    };
  },
};

const mediaService: MediaLibraryService = {
  async list(params) {
    return {
      list: params.mediaType === 'image' ? [mediaItem] : [],
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total: 1,
        hasMore: false,
      },
    };
  },
  async upload(options) {
    options.onProgress?.(100);
    return mediaItem;
  },
  async remove(ids) {
    return ids;
  },
  async listGroups(mediaType) {
    return [{ id: `${mediaType}-fixtures`, name: 'Fixture group', count: 1 }];
  },
  async createGroup(options: CreateMediaGroupOptions) {
    return { id: `${options.mediaType}-created`, name: options.name };
  },
  async renameGroup(options: RenameMediaGroupOptions) {
    return { id: options.groupId, name: options.name };
  },
  async removeGroup(options: RemoveMediaGroupOptions) {
    if (!options.groupId) throw new Error('A group id is required.');
  },
  async move(options: MoveMediaOptions) {
    return options.ids;
  },
};

const pluginOptions: Admin9UIPluginOptions = { mediaService, fileService };
const legacyPluginOptions: Admin9UIOptions = pluginOptions;
const compatiblePluginOptions: Admin9UIPluginOptions = legacyPluginOptions;
const defaultImageDisplay: TiptapImageDisplay = 'inline';
const audioWidth: TiptapAudioWidth = 'standard';
const blockWidth: TiptapBlockWidth = '50%';
const inlineSize: TiptapInlineImageSize = '1.25em';
const mediaAlign: TiptapMediaAlign = 'center';
const editorMaxHeight: ATiptapEditorProps['maxHeight'] = 480;

if (
  localePrefix !== 'admin9Ui' ||
  rootLocalePrefix !== localePrefix ||
  rootMessages['en-US'].admin9Ui !== enUS ||
  messages['zh-CN'].admin9Ui !== zhCN ||
  arcoIconNames.length === 0
) {
  throw new Error('Package exports are inconsistent.');
}

const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
const app = createApp({
  render: () =>
    h('main', [
      h(AIconPicker, { modelValue: '', allowClear: true }),
      h(AProTable, {
        columns: [{ title: 'Name', dataIndex: 'name' }],
        fetcher: async () => ({ list: [{ id: 1, name: 'Fixture row' }], total: 1 }),
      }),
      h(ATiptapEditor, {
        modelValue:
          `<p>Fixture <img src="/fixture-inline.png" alt="Inline" data-display="inline" data-size="${inlineSize}"> content</p>` +
          `<img src="/fixture-block.png" alt="Block" data-display="block" data-width="${blockWidth}" data-align="${mediaAlign}">` +
          '<video src="/fixture.mp4" autoplay data-width="75%" data-align="right"></video>' +
          `<audio src="/fixture.mp3" autoplay data-width="${audioWidth}" data-align="center"></audio>`,
        service: mediaService,
        defaultImageDisplay,
        maxHeight: editorMaxHeight,
        canUploadImage: false,
        canUploadVideo: false,
        canUploadAudio: false,
      }),
      h(AMediaPicker, { service: mediaService, canUpload: false, showFileList: false }),
      h(AMediaLibrary, {
        service: mediaService,
        canUpload: false,
        canDelete: false,
        canMove: false,
        canManageGroups: false,
      }),
      h(AFileManager),
      h(FixtureSfc, { service: mediaService, fileService }),
    ]),
});

app.use(ArcoVue);
Object.entries(ArcoVueIcon).forEach(([name, component]) => app.component(name, component as Component));
app.use(i18n);
app.use(Admin9UI, compatiblePluginOptions);
app.mount('#app');
