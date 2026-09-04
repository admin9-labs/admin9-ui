import { createApp, defineComponent } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import * as publicApi from '../src';
import type {
  Admin9UIPluginOptions,
  CoordinateSelection,
  CoordinateValue,
  FilePickerAdapter,
  AFilterFormProps,
  Action,
  Slot,
  AProTableEmits,
  AProTableExposed,
  AProTableProps,
  AProTableSlots,
  ProTableFetcher,
  ProTableFetcherParams,
  ProTableFetcherResult,
  ProTableFooterSlot,
  ProTablePermission,
  ProTableRequestOptions,
  ProTableRowKey,
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
    const props: AFileUploaderProps = { fileType: 'image', groupId: 'design', multiple: true };
    const result: FileUploadBatchResult = { succeeded: [], failed: [], cancelled: [] };

    expect(props).toEqual({ fileType: 'image', groupId: 'design', multiple: true });
    expect(result).toEqual({ succeeded: [], failed: [], cancelled: [] });
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
    const props: AFilterFormProps = { model, cols: 3, loading: false };

    expect(props).toEqual({ model, cols: 3, loading: false });
  });

  it('exports the complete pro table contract', async () => {
    interface Row {
      id: number;
    }
    const fetcher: ProTableFetcher<Row> = vi.fn().mockResolvedValue({ list: [{ id: 1 }], total: 1 });
    const params: ProTableFetcherParams = { page: 1, pageSize: 10 };
    const result: ProTableFetcherResult<Row> = await fetcher(params);
    const permission: ProTablePermission = (name) => name === 'records.update';
    const action: Action<Row> = {
      label: 'Edit',
      permissions: ['records.update'],
      onClick: vi.fn(),
    };
    const slot: Slot<Row> = {
      record: { id: 1 },
      column: { dataIndex: 'actions' },
      rowIndex: 0,
    };
    const footer: ProTableFooterSlot<Row> = { data: result.list, total: result.total };
    const props: AProTableProps<Row> = {
      columns: [{ dataIndex: 'id' }],
      fetcher,
      pagination: false,
      refreshable: true,
      surface: true,
      actions: [action],
      permission,
    };
    const slots: AProTableSlots<Row> = {
      'toolbar-left': () => 'Create',
      'toolbar-right': () => 'Export',
      'actions': ({ record }) => String(record.id),
      'footer': ({ total }) => String(total),
      'popover': () => 'Popover',
    };
    const requestOptions: ProTableRequestOptions = { clearCurrentData: true };
    const rowKey: ProTableRowKey = 1;
    const exposed: AProTableExposed = {
      doRequest: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      clearSelection: vi.fn(),
    };
    const emit = vi.fn() as unknown as AProTableEmits<Row>;
    emit('loadingChange', true);

    expect(action.permissions).toEqual(['records.update']);
    expect(slot.record.id).toBe(1);
    expect(footer.total).toBe(1);
    expect(props.pagination).toBe(false);
    expect(props.refreshable).toBe(true);
    expect(props.surface).toBe(true);
    expect(slots['toolbar-left']?.()).toBe('Create');
    expect(slots['toolbar-right']?.()).toBe('Export');
    expect(slots.actions?.(slot)).toBe('1');
    expect(requestOptions.clearCurrentData).toBe(true);
    expect(rowKey).toBe(1);
    expect(exposed.refresh).toBeTypeOf('function');
    expect(emit).toHaveBeenCalledWith('loadingChange', true);
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
        'AIconPicker',
        'ACoordinatePicker',
        'AFilePicker',
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
    expect(localeApi.enUS.filePicker.typeAllowed).toBe('All allowed types');
    expect(localeApi.zhCN.coordinatePicker.choose).toBe('选择坐标');
  });

  it('keeps English and Chinese locale keys structurally aligned', () => {
    expect(leafKeys(localeApi.enUS).sort()).toEqual(leafKeys(localeApi.zhCN).sort());
  });

  it('registers public components through the default plugin', () => {
    const app = createApp(defineComponent({ template: '<div />' }));
    app.use(publicApi.default);

    expect(app.component('AMediaLibrary')).toBeUndefined();
    expect(app.component('AFileManager')).toBeUndefined();
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
