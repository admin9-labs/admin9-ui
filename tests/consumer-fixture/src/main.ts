/* eslint-disable import/no-unresolved -- package imports resolve only after the tarball is installed in the fixture */
import { createApp, h, type Component } from 'vue';
import { createI18n } from 'vue-i18n';
import ArcoVue from '@arco-design/web-vue';
import * as ArcoVueIcon from '@arco-design/web-vue/es/icon';
import Admin9UI, {
  AIconPicker,
  AMediaLibrary,
  AMediaPicker,
  AProTable,
  arcoIconNames,
  localePrefix as rootLocalePrefix,
  messages as rootMessages,
  type CreateMediaGroupOptions,
  type Admin9UIOptions,
  type Admin9UIPluginOptions,
  type MediaItem,
  type MediaLibraryService,
  type MoveMediaOptions,
  type RemoveMediaGroupOptions,
  type RenameMediaGroupOptions,
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

const pluginOptions: Admin9UIPluginOptions = { mediaService };
const legacyPluginOptions: Admin9UIOptions = pluginOptions;
const compatiblePluginOptions: Admin9UIPluginOptions = legacyPluginOptions;

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
      h(AMediaPicker, { service: mediaService, canUpload: false, showFileList: false }),
      h(AMediaLibrary, {
        service: mediaService,
        canUpload: false,
        canDelete: false,
        canMove: false,
        canManageGroups: false,
      }),
      h(FixtureSfc, { service: mediaService }),
    ]),
});

app.use(ArcoVue);
Object.entries(ArcoVueIcon).forEach(([name, component]) => app.component(name, component as Component));
app.use(i18n);
app.use(Admin9UI, compatiblePluginOptions);
app.mount('#app');
