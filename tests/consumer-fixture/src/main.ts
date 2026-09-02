/* eslint-disable import/no-unresolved -- package imports resolve only after the tarball is installed in the fixture */
import { createApp, h, type Component } from 'vue';
import { createI18n } from 'vue-i18n';
import ArcoVue from '@arco-design/web-vue';
import * as ArcoVueIcon from '@arco-design/web-vue/es/icon';
import Admin9UI, {
  AIconPicker,
  ACoordinatePicker,
  AFilePicker,
  AFileUploader,
  AFilterForm,
  AProTable,
  ATiptapEditor,
  arcoIconNames,
  localePrefix as rootLocalePrefix,
  messages as rootMessages,
  type ATiptapEditorProps,
  type AFilterFormProps,
  type CoordinateSelection,
  type CoordinateValue,
  type Admin9UIOptions,
  type Admin9UIPluginOptions,
  type FileItem,
  type FilePickerAdapter,
  type FileUploadBatchResult,
  type FileUploadCapability,
  type FileListParams,
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

const fileItem: FileItem = {
  id: 'fixture-document',
  name: 'Fixture document.pdf',
  type: 'document',
  groupId: null,
  url: 'https://example.invalid/fixture.pdf',
  extension: 'pdf',
};

const fileService: FilePickerAdapter = {
  async list(params: FileListParams) {
    return {
      list: [fileItem],
      pagination: { page: params.page, pageSize: params.pageSize, total: 1, hasMore: false },
    };
  },
};
const filePickerService: FilePickerAdapter = { list: fileService.list };
const fileUploaderService: FileUploadCapability = {
  async upload({ file, fileType, groupId, onProgress }) {
    onProgress?.(100);
    return {
      id: `fixture-upload-${file.name}`,
      name: file.name,
      type: fileType,
      groupId,
      url: `https://example.invalid/uploads/${encodeURIComponent(file.name)}`,
      status: 'ready',
    };
  },
};
const emptyUploadResult: FileUploadBatchResult = { succeeded: [], failed: [], cancelled: [] };

const pluginOptions: Admin9UIPluginOptions = { fileService };
const legacyPluginOptions: Admin9UIOptions = pluginOptions;
const compatiblePluginOptions: Admin9UIPluginOptions = legacyPluginOptions;
const defaultImageDisplay: TiptapImageDisplay = 'inline';
const audioWidth: TiptapAudioWidth = 'standard';
const blockWidth: TiptapBlockWidth = '50%';
const inlineSize: TiptapInlineImageSize = '1.25em';
const mediaAlign: TiptapMediaAlign = 'center';
const editorMaxHeight: ATiptapEditorProps['maxHeight'] = 480;
interface FixtureFilterModel {
  keyword: string;
}
const fixtureFilterModel: FixtureFilterModel = { keyword: '' };
const filterFormProps: AFilterFormProps = { model: fixtureFilterModel, cols: 3 };
const coordinateValue: CoordinateValue = { latitude: 27.8945, longitude: 102.2644 };
const coordinateSelection: CoordinateSelection = { ...coordinateValue, source: 'model' };

if (
  localePrefix !== 'admin9Ui' ||
  rootLocalePrefix !== localePrefix ||
  rootMessages['en-US'].admin9Ui !== enUS ||
  messages['zh-CN'].admin9Ui !== zhCN ||
  arcoIconNames.length === 0
) {
  throw new Error('Package exports are inconsistent.');
}
if (coordinateSelection.source !== 'model') throw new Error('Coordinate selection type is inconsistent.');
if (emptyUploadResult.failed.length !== 0) throw new Error('File uploader result type is inconsistent.');

const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
const app = createApp({
  render: () =>
    h('main', [
      h(AIconPicker, { modelValue: '', allowClear: true }),
      h(AFilterForm, filterFormProps, { default: () => h('div', 'Fixture filter') }),
      h(ACoordinatePicker, { modelValue: coordinateValue, apiKey: 'fixture-key', readonly: true }),
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
        service: filePickerService,
        defaultImageDisplay,
        maxHeight: editorMaxHeight,
        canUploadImage: false,
        canUploadVideo: false,
        canUploadAudio: false,
      }),
      h(AFilePicker, { service: filePickerService, modelValue: [fileItem], fileTypes: ['document'], multiple: true }),
      h(AFileUploader, { service: fileUploaderService, fileType: 'image', groupId: 'fixture-images' }),
      h(FixtureSfc, { service: filePickerService, filePickerService, fileUploaderService }),
    ]),
});

app.use(ArcoVue);
Object.entries(ArcoVueIcon).forEach(([name, component]) => app.component(name, component as Component));
app.use(i18n);
app.use(Admin9UI, compatiblePluginOptions);
app.mount('#app');
