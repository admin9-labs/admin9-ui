/* eslint-disable import/no-unresolved -- package imports resolve only after the tarball is installed in the fixture */
import { createApp, h, type Component } from 'vue';
import { createI18n } from 'vue-i18n';
import ArcoVue from '@arco-design/web-vue';
import * as ArcoVueIcon from '@arco-design/web-vue/es/icon';
import Admin9UI, {
  ACoverPicker,
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
  type ACoverPickerProps,
  type AFilterFormProps,
  type ProTableAction,
  type AProTableEmits,
  type AProTableExposed,
  type AProTableProps,
  type AProTableSlots,
  type CoordinateSelection,
  type CoordinateValue,
  type CoverPickerValue,
  type Admin9UIPluginOptions,
  type FileItem,
  type FilePickerAdapter,
  type FileUploadBatchResult,
  type FileUploadCapability,
  type ProTableFetcher,
  type ProTableFetcherParams,
  type ProTableFetcherResult,
  type ProTableFooterSlot,
  type ProTableDataChange,
  type ProTablePaginationOptions,
  type ProTablePermission,
  type ProTableRefreshContext,
  type ProTableRefreshHandler,
  type ProTableRefreshOptions,
  type ProTableRequestOptions,
  type ProTableRowKey,
  type ProTableSelectionOptions,
  type FileListParams,
  type TiptapAudioWidth,
  type TiptapBlockWidth,
  type TiptapImageDisplay,
  type TiptapInlineImageSize,
  type TiptapMediaAlign,
  type ProTableActionSlot,
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
    const matchesType = params.fileType
      ? params.fileType === fileItem.type
      : !params.fileTypes || params.fileTypes.includes(fileItem.type);
    const filtered = [fileItem].filter(
      (item) =>
        matchesType &&
        (params.groupId === undefined || params.groupId === item.groupId) &&
        (!params.keyword || item.name.toLowerCase().includes(params.keyword.toLowerCase()))
    );
    const offset = (params.page - 1) * params.pageSize;
    return {
      list: filtered.slice(offset, offset + params.pageSize),
      pagination: {
        page: params.page,
        pageSize: params.pageSize,
        total: filtered.length,
        hasMore: offset + params.pageSize < filtered.length,
      },
    };
  },
};
const filePickerService: FilePickerAdapter = {
  list: fileService.list,
  listGroups: async () => [{ id: 'root', name: 'Root' }],
  createGroup: async (input) => ({ id: 'new-group', ...input }),
  deleteFiles: async (ids) => ids,
  moveFiles: async ({ ids }) => ids,
};
const coverItem: FileItem = {
  id: 'fixture-cover',
  name: 'Fixture cover.png',
  type: 'image',
  groupId: null,
  url: 'https://example.invalid/fixture-cover.png',
  status: 'ready',
};
const coverValue: CoverPickerValue = { mode: 'single', images: [coverItem] };
const coverPickerProps: ACoverPickerProps = { modelValue: coverValue, service: filePickerService };
const fileUploaderService: FileUploadCapability = {
  async upload({ file, fileTypes, groupId, onProgress }) {
    if (!fileTypes.includes('image')) throw new Error('Only fixture images are supported');
    onProgress?.(100);
    return {
      id: `fixture-upload-${file.name}`,
      name: file.name,
      type: 'image',
      groupId,
      url: `https://example.invalid/uploads/${encodeURIComponent(file.name)}`,
      status: 'ready',
    };
  },
};
const emptyUploadResult: FileUploadBatchResult = { succeeded: [], failed: [], cancelled: [] };

const pluginOptions: Admin9UIPluginOptions = { fileService };
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
const filterFormProps: AFilterFormProps = { model: fixtureFilterModel, cols: 3, fieldFlex: { keyword: 2 } };
const coordinateValue: CoordinateValue = { latitude: 27.8945, longitude: 102.2644 };
const coordinateSelection: CoordinateSelection = { ...coordinateValue, source: 'model' };
interface FixtureRow {
  id: number;
  name: string;
}
const rowAction: ProTableAction<FixtureRow> = { label: 'Open', onClick: () => undefined };
const rowSlot: ProTableActionSlot<FixtureRow> = {
  record: { id: 1, name: 'Fixture row' },
  column: { dataIndex: 'actions' },
  rowIndex: 0,
};
const rowFetcher: ProTableFetcher<FixtureRow> = async (params) => ({
  list: [{ id: params.page, name: 'Fixture row' }],
  total: 1,
});
const refreshTable: ProTableRefreshHandler = ({ refresh }: ProTableRefreshContext) => refresh();
const proTableProps: AProTableProps<FixtureRow> = {
  columns: [{ title: 'Name', dataIndex: 'name' }],
  fetcher: rowFetcher,
  title: 'Fixture records',
  paginationOptions: { showJumper: true },
  refreshable: true,
  refreshHandler: refreshTable,
  selectionOptions: { showCheckedAll: true, onlyCurrent: true },
  surface: true,
  actions: [rowAction],
};
const proTableTypes: {
  emits?: AProTableEmits<FixtureRow>;
  exposed?: AProTableExposed;
  slots: AProTableSlots<FixtureRow>;
  params: ProTableFetcherParams;
  result: ProTableFetcherResult<FixtureRow>;
  footer: ProTableFooterSlot<FixtureRow>;
  dataChange: ProTableDataChange<FixtureRow>;
  pagination: ProTablePaginationOptions;
  permission: ProTablePermission;
  refreshContext?: ProTableRefreshContext;
  refreshHandler: ProTableRefreshHandler;
  refresh: ProTableRefreshOptions;
  request: ProTableRequestOptions;
  rowKey: ProTableRowKey;
  selection: ProTableSelectionOptions;
} = {
  slots: {
    'surface-title': () => 'Fixture records',
    'toolbar-left': () => 'Create',
    'toolbar-right': () => 'Export',
    'before-table': () => 'Summary',
  },
  params: { page: 1, pageSize: 10 },
  result: { list: [], total: 0 },
  footer: { data: [], total: 0 },
  dataChange: { list: [], total: 0, page: 1, pageSize: 10 },
  pagination: { showTotal: true, showPageSize: true },
  permission: () => true,
  refreshHandler: refreshTable,
  refresh: { resetPage: true, clearCurrentData: true },
  request: {},
  rowKey: 1,
  selection: { showCheckedAll: true, onlyCurrent: true },
};

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
if (rowSlot.record.id !== 1) throw new Error('Pro table slot type is inconsistent.');
if (proTableTypes.params.page !== 1) throw new Error('Pro table root types are inconsistent.');

const i18n = createI18n({ legacy: false, locale: 'en-US', messages });
const app = createApp({
  render: () =>
    h('main', [
      h(AIconPicker, { modelValue: '', allowClear: true }),
      h(ACoverPicker, coverPickerProps),
      h(AFilterForm, filterFormProps, { default: () => h('div', 'Fixture filter') }),
      h(ACoordinatePicker, { modelValue: coordinateValue, apiKey: 'fixture-key', readonly: true }),
      h(AProTable, proTableProps),
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
      h(AFileUploader, { service: fileUploaderService, fileTypes: ['image'], groupId: 'fixture-images' }),
      h(FixtureSfc, { service: filePickerService, filePickerService, fileUploaderService }),
    ]),
});

app.use(ArcoVue);
Object.entries(ArcoVueIcon).forEach(([name, component]) => app.component(name, component as Component));
app.use(i18n);
app.use(Admin9UI, pluginOptions);
app.mount('#app');
