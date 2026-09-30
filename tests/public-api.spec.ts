import { createApp, defineComponent } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import * as publicApi from '../src';
import type {
  Admin9UIPluginOptions,
  AChatComposerProps,
  ChatComposerSize,
  ACoverPickerProps,
  CoverMode,
  CoverPickerSize,
  CoverPickerValue,
  CoordinateSelection,
  CoordinateValue,
  FilePickerAdapter,
  FileGroupCreateCapability,
  FileGroupCreateOptions,
  FileDeleteCapability,
  FileMoveCapability,
  FileMoveOptions,
  AFilePickerProps,
  AImagePickerProps,
  ImagePickerDisplayMode,
  ImagePickerFit,
  AFilterFormProps,
  ProTableAction,
  ProTableActionSlot,
  AProTableEmits,
  AProTableExposed,
  AProTableProps,
  AProTableSlots,
  ProTableFetcher,
  ProTableFetcherParams,
  ProTableFetcherResult,
  ProTableFooterSlot,
  ProTableDataChange,
  ProTablePaginationOptions,
  ProTablePermission,
  ProTableRefreshContext,
  ProTableRefreshHandler,
  ProTableRefreshOptions,
  ProTableRequestOptions,
  ProTableRowKey,
  ProTableSelectionOptions,
  AFileUploaderProps,
  FileUploadBatchResult,
  ATiptapEditorProps,
  TiptapAudioWidth,
  TiptapBlockWidth,
  TiptapImageDisplay,
  TiptapInlineImageSize,
  TiptapMediaAlign,
  TiptapMediaError,
  TiptapMediaErrorReason,
  TiptapMediaOperation,
} from '../src';
import * as localeApi from '../src/locale';

const leafKeys = (value: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return entry && typeof entry === 'object' ? leafKeys(entry as Record<string, unknown>, path) : [path];
  });

describe('package public API', () => {
  it('exports the chat composer size contract', () => {
    const size: ChatComposerSize = 'medium';
    const props: AChatComposerProps = { modelValue: '', size };

    expect(props).toEqual({ modelValue: '', size: 'medium' });
  });

  it('exports plugin installation options under the specific public name', () => {
    const fileService = { list: async () => ({ list: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } }) };
    const options: Admin9UIPluginOptions = { fileService };

    expect(options.fileService).toBe(fileService);
  });

  it('exports the minimal file picker adapter without management requirements', () => {
    const picker: FilePickerAdapter = {
      list: async ({ page, pageSize }) => ({
        list: [],
        pagination: { page, pageSize, total: 0, hasMore: false },
      }),
    };

    expect(picker.list).toBeTypeOf('function');
    expect(picker.upload).toBeUndefined();
  });

  it('exports the file uploader contract types', () => {
    const props: AFileUploaderProps = { fileTypes: ['image'], groupId: 'design', multiple: true };
    const result: FileUploadBatchResult = { succeeded: [], failed: [], cancelled: [] };

    expect(props).toEqual({ fileTypes: ['image'], groupId: 'design', multiple: true });
    expect(result).toEqual({ succeeded: [], failed: [], cancelled: [] });
  });

  it('exports optional file group creation independently of uploading', async () => {
    const options: FileGroupCreateOptions = { name: 'Child', parentId: 'root' };
    const capability: FileGroupCreateCapability = { createGroup: async (input) => ({ id: 'child', ...input }) };
    const adapter: FilePickerAdapter = {
      list: async () => ({ list: [], pagination: { page: 1, pageSize: 24, total: 0, hasMore: false } }),
      ...capability,
    };
    expect(await adapter.createGroup?.(options)).toEqual({ id: 'child', name: 'Child', parentId: 'root' });
    expect(adapter.upload).toBeUndefined();
  });

  it('exports the image picker display contract', () => {
    const displayMode: ImagePickerDisplayMode = 'landscape';
    const fit: ImagePickerFit = 'cover';
    const props: AImagePickerProps = { displayMode, fit };

    expect(props).toEqual({ displayMode: 'landscape', fit: 'cover' });
  });

  it('keeps numeric page sizes optional for automatic file and image pagination', () => {
    const automaticFiles: AFilePickerProps = {};
    const fixedFiles: AFilePickerProps = { pageSize: 24 };
    const automaticImages: AImagePickerProps = { pageSize: undefined };
    const fixedImages: AImagePickerProps = { pageSize: 24 };

    expect(automaticFiles.pageSize).toBeUndefined();
    expect(automaticImages.pageSize).toBeUndefined();
    expect(fixedFiles.pageSize).toBe(24);
    expect(fixedImages.pageSize).toBe(24);
  });

  it('exports independent optional file deletion and move capabilities', async () => {
    const deletion: FileDeleteCapability = { deleteFiles: async (ids) => ids.slice(0, 1) };
    const moving: FileMoveCapability = { moveFiles: async ({ ids }) => ids };
    const options: FileMoveOptions = { ids: ['one', 'two'], groupId: null };
    expect(await deletion.deleteFiles(options.ids)).toEqual(['one']);
    expect(await moving.moveFiles(options)).toEqual(['one', 'two']);
  });

  it('exports the fixed-position cover picker contract', () => {
    const mode: CoverMode = 'triple';
    const value: CoverPickerValue = { mode, images: [null, null, null] };
    const size: CoverPickerSize = 'small';
    const props: ACoverPickerProps = { modelValue: value, size, accept: 'image/*', canUpload: true };

    expect(props).toEqual({ modelValue: value, size: 'small', accept: 'image/*', canUpload: true });
  });

  it('exports the coordinate picker value and selection types', () => {
    const value: CoordinateValue = { latitude: 27.8945, longitude: 102.2644 };
    const selection: CoordinateSelection = { ...value, source: 'search', title: '邛海' };

    expect(selection).toEqual({ latitude: 27.8945, longitude: 102.2644, source: 'search', title: '邛海' });
  });

  it('exports the filter form prop contract', () => {
    interface FilterModel {
      keyword: string;
    }
    const model: FilterModel = { keyword: '' };
    const props: AFilterFormProps = { model, cols: 3, fieldFlex: { keyword: 2 }, loading: false };

    expect(props).toEqual({ model, cols: 3, fieldFlex: { keyword: 2 }, loading: false });
  });

  it('exports the complete pro table contract', async () => {
    interface Row {
      id: number;
    }
    const fetcher: ProTableFetcher<Row> = vi.fn().mockResolvedValue({ list: [{ id: 1 }], total: 1 });
    const params: ProTableFetcherParams = { page: 1, pageSize: 10 };
    const result: ProTableFetcherResult<Row> = await fetcher(params);
    const permission: ProTablePermission = (name) => name === 'records.update';
    const action: ProTableAction<Row> = {
      label: 'Edit',
      permissions: ['records.update'],
      onClick: vi.fn(),
    };
    const slot: ProTableActionSlot<Row> = {
      record: { id: 1 },
      column: { dataIndex: 'actions' },
      rowIndex: 0,
    };
    const footer: ProTableFooterSlot<Row> = { data: result.list, total: result.total };
    const dataChange: ProTableDataChange<Row> = { list: result.list, total: result.total, page: 1, pageSize: 10 };
    const selectionOptions: ProTableSelectionOptions = { showCheckedAll: true, onlyCurrent: true };
    const paginationOptions: ProTablePaginationOptions = {
      showTotal: false,
      showPageSize: false,
      showJumper: true,
      simple: true,
      pageSizeOptions: [10, 20],
    };
    const refreshOptions: ProTableRefreshOptions = { resetPage: true, clearCurrentData: true };
    const refreshHandler: ProTableRefreshHandler = ({ refresh }: ProTableRefreshContext) => refresh(refreshOptions);
    const props: AProTableProps<Row> = {
      columns: [{ dataIndex: 'id' }],
      fetcher,
      title: 'Records',
      pagination: false,
      paginationOptions,
      refreshable: true,
      refreshHandler,
      selectionOptions,
      surface: true,
      actions: [action],
      permission,
    };
    const slots: AProTableSlots<Row> = {
      'surface-title': () => 'Scoped records',
      'toolbar-left': () => 'Create',
      'toolbar-right': () => 'Export',
      'before-table': () => 'Summary',
      'actions': ({ record }) => String(record.id),
      'footer': ({ total }) => String(total),
      'popover': () => 'Popover',
    };
    const requestOptions: ProTableRequestOptions = { clearCurrentData: true };
    const rowKey: ProTableRowKey = 1;
    const exposed: AProTableExposed = {
      doRequest: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      invalidate: vi.fn(),
      clearSelection: vi.fn(),
    };
    const emit = vi.fn() as unknown as AProTableEmits<Row>;
    emit('loadingChange', true);
    emit('dataChange', dataChange);

    expect(action.permissions).toEqual(['records.update']);
    expect(slot.record.id).toBe(1);
    expect(footer.total).toBe(1);
    expect(dataChange.pageSize).toBe(10);
    expect(props.pagination).toBe(false);
    expect(props.paginationOptions).toBe(paginationOptions);
    expect(props.refreshable).toBe(true);
    expect(props.refreshHandler).toBe(refreshHandler);
    expect(props.selectionOptions).toBe(selectionOptions);
    expect(props.surface).toBe(true);
    expect(slots['surface-title']?.()).toBe('Scoped records');
    expect(slots['toolbar-left']?.()).toBe('Create');
    expect(slots['toolbar-right']?.()).toBe('Export');
    expect(slots['before-table']?.()).toBe('Summary');
    expect(slots.actions?.(slot)).toBe('1');
    expect(requestOptions.clearCurrentData).toBe(true);
    expect(refreshOptions).toEqual({ resetPage: true, clearCurrentData: true });
    expect(rowKey).toBe(1);
    expect(exposed.refresh).toBeTypeOf('function');
    expect(exposed.invalidate).toBeTypeOf('function');
    expect(emit).toHaveBeenCalledWith('loadingChange', true);
    expect(emit).toHaveBeenCalledWith('dataChange', dataChange);
  });

  it('exports the ATiptapEditor media contract types', () => {
    const display: TiptapImageDisplay = 'inline';
    const audioWidth: TiptapAudioWidth = 'compact';
    const width: TiptapBlockWidth = '75%';
    const size: TiptapInlineImageSize = '1.5em';
    const align: TiptapMediaAlign = 'right';
    const operation: TiptapMediaOperation = 'insert';
    const reason: TiptapMediaErrorReason = 'invalid-selection';
    const mediaError: TiptapMediaError = {
      operation,
      mediaType: 'image',
      reason,
      attemptedItems: [],
      rejectedItems: [],
    };
    const props: ATiptapEditorProps = { defaultImageDisplay: display, maxHeight: '60dvh' };

    expect({ display, audioWidth, width, size, align, operation, reason, mediaError, props }).toEqual({
      display: 'inline',
      audioWidth: 'compact',
      width: '75%',
      size: '1.5em',
      align: 'right',
      operation: 'insert',
      reason: 'invalid-selection',
      mediaError: {
        operation: 'insert',
        mediaType: 'image',
        reason: 'invalid-selection',
        attemptedItems: [],
        rejectedItems: [],
      },
      props: { defaultImageDisplay: 'inline', maxHeight: '60dvh' },
    });
  });

  it('exports only the supported runtime capabilities from the root entry', () => {
    expect(Object.keys(publicApi).sort()).toEqual(
      [
        'AChatMessageList',
        'AChatComposer',
        'ACoverPicker',
        'AIconPicker',
        'ACoordinatePicker',
        'AFilePicker',
        'AImagePicker',
        'AFileUploader',
        'AFilterForm',
        'AProTable',
        'ATiptapEditor',
        'arcoIconNames',
        'default',
        'localePrefix',
        'messages',
      ].sort()
    );
  });

  it('keeps the locale entry limited to consumer-facing locale resources', () => {
    expect(Object.keys(localeApi).sort()).toEqual(['enUS', 'localePrefix', 'messages', 'zhCN'].sort());
    expect(localeApi.enUS.filePicker.types.archive).toBe('Archives');
    expect(localeApi.enUS.filePicker.typeAll).toBe('All');
    expect(localeApi.enUS.coverPicker.triple).toBe('Three images');
    expect(localeApi.zhCN.coordinatePicker.choose).toBe('选择坐标');
  });

  it('keeps English and Chinese locale keys structurally aligned', () => {
    expect(leafKeys(localeApi.enUS).sort()).toEqual(leafKeys(localeApi.zhCN).sort());
  });

  it('registers public components through the default plugin', () => {
    const app = createApp(defineComponent({ template: '<div />' }));
    app.use(publicApi.default);
    expect(app.component('AChatMessageList')).toBe(publicApi.AChatMessageList);
    expect(app.component('AChatComposer')).toBe(publicApi.AChatComposer);
    expect(app.component('ACoverPicker')).toBe(publicApi.ACoverPicker);

    expect(app.component('AMediaLibrary')).toBeUndefined();
    expect(app.component('AFileManager')).toBeUndefined();
    expect(app.component('AImagePicker')).toBe(publicApi.AImagePicker);
    expect(app.component('AFilePicker')).toBe(publicApi.AFilePicker);
    expect(app.component('AFileUploader')).toBe(publicApi.AFileUploader);
    expect(app.component('AFilterForm')).toBe(publicApi.AFilterForm);
    expect(app.component('ATiptapEditor')).toBe(publicApi.ATiptapEditor);
    expect(app.component('ACoordinatePicker')).toBe(publicApi.ACoordinatePicker);
  });

  it('reports global component conflicts without referring to repository-only documentation', () => {
    const app = createApp(publicApi.AProTable);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      app.component('AFilePicker', publicApi.AIconPicker);
      app.use(publicApi.default);

      const packageWarning = warn.mock.calls
        .map(([message]) => String(message))
        .find((message) => message.startsWith('[admin9-ui]'));
      expect(packageWarning).toContain('按需导入并在使用点设置本地别名');
      expect(packageWarning).not.toContain('DESIGN.md');
    } finally {
      warn.mockRestore();
    }
  });
});
