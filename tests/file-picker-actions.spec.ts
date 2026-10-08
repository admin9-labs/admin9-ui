/* eslint-disable no-await-in-loop, @typescript-eslint/no-non-null-assertion -- Flush real Arco controls and assert mounted fixture elements. */
import { createApp, h, nextTick, reactive, ref, shallowRef, type App } from 'vue';
import ArcoVue, { Form, FormItem } from '@arco-design/web-vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AFilePicker from '../src/components/file-picker/index.vue';
import { messages } from '../src/locale';
import type { AFilePickerExposed, AFilePickerProps, FilePickerValue, FileItem, FilePickerAdapter } from '../src';

const apps: App[] = [];
const first: FileItem = Object.freeze({ id: 'first', name: 'First.png', type: 'image', groupId: null, url: '/first.png' });
const second: FileItem = Object.freeze({ ...first, id: 'second', name: 'Second.png', url: '/second.png' });
async function flush() {
  for (let i = 0; i < 16; i += 1) {
    await Promise.resolve();
    await nextTick();
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mount(
  options: {
    props?: Partial<AFilePickerProps>;
    deleteResult?: () => Promise<readonly string[]>;
    moveResult?: () => Promise<readonly string[]>;
    noCapabilities?: boolean;
    uploadResult?: () => Promise<FileItem>;
    slots?: Record<string, () => ReturnType<typeof h>>;
  } = {}
) {
  let files: FileItem[] = [{ ...first }, { ...second }];
  const adapter: FilePickerAdapter = {
    list: vi.fn(async ({ page, pageSize, groupId }) => {
      const filtered = files.filter((item) => groupId === undefined || item.groupId === groupId);
      return {
        list: filtered.slice((page - 1) * pageSize, page * pageSize),
        pagination: { page, pageSize, total: filtered.length, hasMore: page * pageSize < filtered.length },
      };
    }),
    listGroups: vi.fn(async () => [
      { id: 'root', name: 'Destination' },
      { id: 'child', name: 'Child', parentId: 'root' },
    ]),
    deleteFiles: vi.fn(async (ids) => {
      const result = options.deleteResult ? await options.deleteResult() : ids;
      files = files.filter((item) => !result.includes(item.id));
      return result;
    }),
    moveFiles: vi.fn(async ({ ids, groupId }) => {
      const result = options.moveResult ? await options.moveResult() : ids;
      files = files.map((item) => (result.includes(item.id) ? { ...item, groupId } : item));
      return result;
    }),
  };
  if (options.uploadResult) {
    adapter.upload = vi.fn(async () => {
      const item = await options.uploadResult!();
      files.push(item);
      return item;
    });
  }
  if (options.noCapabilities) {
    delete adapter.deleteFiles;
    delete adapter.moveFiles;
  }
  const service = shallowRef(adapter);
  const props = reactive<AFilePickerProps>({ multiple: true, canDeleteFiles: true, canMoveFiles: true, ...options.props });
  const picker = ref<AFilePickerExposed>();
  const update = vi.fn();
  const change = vi.fn();
  const selection = vi.fn();
  const confirmed = vi.fn();
  const validator = vi.fn((_value: unknown, callback: () => void) => callback());
  const model = reactive<{ files: FilePickerValue }>({ files: options.props?.multiple === false ? first : [first, second] });
  const errors: unknown[] = [];
  const target = document.createElement('div');
  document.body.append(target);
  const app = createApp({
    render: () =>
      h(
        Form,
        { model },
        {
          default: () =>
            h(
              FormItem,
              { field: 'files', validateTrigger: 'change', rules: [{ validator }] },
              {
                default: () =>
                  h(
                    AFilePicker,
                    {
                      ...props,
                      'ref': picker,
                      'service': service.value,
                      'modelValue': model.files,
                      'onUpdate:modelValue': update,
                      'onChange': change,
                      'onSelectionChange': selection,
                      'onConfirm': confirmed,
                    },
                    options.slots
                  ),
              }
            ),
        }
      ),
  });
  app.use(ArcoVue).use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.config.errorHandler = (error) => errors.push(error);
  app.mount(target);
  apps.push(app);
  return { app, adapter, service, props, picker, model, update, change, selection, confirmed, validator, errors };
}
async function beginManagement(selectPage = true) {
  if (document.querySelector('.a9-file-picker__management')) return;
  document.querySelector<HTMLButtonElement>('[data-testid="file-picker-batch"]')!.click();
  await flush();
  if (selectPage) {
    document.querySelector<HTMLInputElement>('[data-testid="file-picker-select-page"] input')!.click();
    await flush();
  }
}
async function nextPage() {
  document.querySelector<HTMLElement>('.a9-file-picker-modal .arco-pagination-item-next')!.click();
  await flush();
}
async function deleteSelected(picker: { value: AFilePickerExposed | undefined }) {
  picker.value?.open();
  await flush();
  await beginManagement();
  document.querySelector<HTMLButtonElement>('[data-testid="file-picker-delete-selected"]')!.click();
  await flush();
}
function confirmDelete() {
  document.querySelector<HTMLButtonElement>('.a9-file-picker-delete .arco-btn-primary')!.click();
}
async function moveTo(label: string) {
  await beginManagement();
  document.querySelector<HTMLElement>('.a9-file-picker__move')!.click();
  await flush();
  const option = [...document.querySelectorAll<HTMLElement>('.arco-cascader-option')].find(
    (item) => item.textContent?.trim() === label
  );
  if (!option) throw new Error(`Missing move option ${label}`);
  const input = option.querySelector<HTMLInputElement>('input');
  if (input) input.click();
  else option.click();
  await flush();
}
afterEach(async () => {
  apps.splice(0).forEach((app) => app.unmount());
  vi.useRealTimers();
  await flush();
  // Let Arco remove its message portal before replacing the body.
  await vi.waitFor(() => expect(document.querySelector('.arco-message-list')).toBeNull());
  document.body.innerHTML = '';
});

describe('file library actions in the picker', () => {
  it.each(['during upload', 'before retry'] as const)(
    'keeps batch successes when removing an upload record %s',
    async (timing) => {
      const uploaded: FileItem = { ...first, id: 'upload-a', name: 'A.png' };
      const retried: FileItem = { ...second, id: 'upload-b', name: 'B.png' };
      const pending = deferred<FileItem>();
      const uploadResult = vi
        .fn()
        .mockResolvedValueOnce(uploaded)
        .mockImplementationOnce(() => (timing === 'during upload' ? pending.promise : Promise.reject(new Error('temporary'))))
        .mockResolvedValueOnce(retried);
      const host = mount({ props: { canUpload: true, fileTypes: ['image'] }, uploadResult });
      host.picker.value!.open();
      await flush();
      const input = document.querySelector<HTMLInputElement>('.a9-file-uploader input[type="file"]')!;
      Object.defineProperty(input, 'files', {
        value: [new File(['a'], 'A.png', { type: 'image/png' }), new File(['b'], 'B.png', { type: 'image/png' })],
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
      document.querySelector<HTMLButtonElement>('button[aria-label="Remove upload record for A.png"]')!.click();
      await flush();
      if (timing === 'during upload') pending.resolve(retried);
      else document.querySelector<HTMLButtonElement>('button[aria-label="Retry upload for B.png"]')!.click();
      await flush();
      expect(document.querySelector('[data-testid="file-picker-upload-result"]')).toBeNull();
      expect(document.querySelector('[data-testid="file-picker-select-uploaded"]')).toBeNull();
      expect(host.selection).not.toHaveBeenCalled();
      document.querySelector<HTMLInputElement>('[data-file-id="upload-a"] input')!.click();
      document.querySelector<HTMLInputElement>('[data-file-id="upload-b"] input')!.click();
      await flush();
      expect(host.selection).toHaveBeenLastCalledWith([first, second, uploaded, retried]);
      expect(host.update).not.toHaveBeenCalled();
    }
  );

  it.each([
    { label: 'pending', metadata: { status: 'pending' } },
    { label: 'failed', metadata: { status: 'failed' } },
    // eslint-disable-next-line no-script-url -- The regression must reject a script URL from the adapter.
    { label: 'unsafe URL', metadata: { url: 'javascript:alert(1)' } },
  ] as const)('disables an ineligible uploaded file in the refreshed list: $label', async (invalid) => {
    const uploaded: FileItem = { ...first, id: 'uploaded', name: 'Uploaded.png' };
    const host = mount({ props: { canUpload: true, fileTypes: ['image'] }, uploadResult: async () => uploaded });
    host.picker.value!.open();
    await flush();
    const input = document.querySelector<HTMLInputElement>('.a9-file-uploader input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['image'], 'Uploaded.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    vi.mocked(host.adapter.list).mockResolvedValueOnce({
      list: [{ ...uploaded, ...invalid.metadata }],
      pagination: { page: 1, pageSize: 24, total: 1, hasMore: false },
    });
    await host.picker.value!.refresh();
    await flush();
    expect(document.querySelector<HTMLInputElement>('[data-file-id="uploaded"] input')?.disabled).toBe(true);
    expect(document.querySelector('[data-testid="file-picker-select-uploaded"]')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-group-id="root"]')!.click();
    await flush();
    expect(document.querySelector('[data-file-id="uploaded"]')).toBeNull();
    expect(document.querySelector('[data-testid="file-picker-select-uploaded"]')).toBeNull();
    expect(host.selection).not.toHaveBeenCalled();
  });

  it.each(['delete', 'move'] as const)(
    'does not undo upload management when retrying another failed upload: %s',
    async (action) => {
      const uploaded: FileItem = { ...first, id: 'upload-a', name: 'A.png' };
      const retried: FileItem = { ...second, id: 'upload-b', name: 'B.png' };
      const uploadResult = vi
        .fn()
        .mockResolvedValueOnce(uploaded)
        .mockRejectedValueOnce(new Error('temporary'))
        .mockResolvedValueOnce(retried);
      const host = mount({ props: { canUpload: true, fileTypes: ['image'] }, uploadResult });
      host.picker.value!.open();
      await flush();
      const input = document.querySelector<HTMLInputElement>('.a9-file-uploader input[type="file"]')!;
      Object.defineProperty(input, 'files', {
        value: [new File(['a'], 'A.png', { type: 'image/png' }), new File(['b'], 'B.png', { type: 'image/png' })],
      });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
      await beginManagement(false);
      document.querySelector<HTMLInputElement>('[data-file-id="upload-a"] input')!.click();
      await flush();
      if (action === 'delete') {
        document.querySelector<HTMLButtonElement>('[data-testid="file-picker-delete-selected"]')!.click();
        await flush();
        confirmDelete();
        await flush();
      } else await moveTo('Destination');
      document.querySelector<HTMLButtonElement>('[data-testid="file-picker-exit-batch"]')!.click();
      await flush();
      [...document.querySelectorAll<HTMLButtonElement>('.a9-file-picker__group-button')]
        .find((item) => item.textContent?.trim() === 'Ungrouped')!
        .click();
      await flush();
      document.querySelector<HTMLButtonElement>('button[aria-label="Retry upload for B.png"]')!.click();
      await flush();
      expect(document.querySelector('[data-file-id="upload-a"]')).toBeNull();
      document.querySelector<HTMLInputElement>('[data-file-id="upload-b"] input')!.click();
      await flush();
      if (action === 'move') {
        document.querySelector<HTMLButtonElement>('[data-group-id="root"]')!.click();
        await flush();
        document.querySelector<HTMLInputElement>('[data-file-id="upload-a"] input')!.click();
        await flush();
      }
      const expected =
        action === 'delete' ? [first, second, retried] : [first, second, retried, { ...uploaded, groupId: 'root' }];
      expect(host.selection).toHaveBeenLastCalledWith(expected);
      expect(host.update).not.toHaveBeenCalled();
      expect(uploadResult).toHaveBeenCalledTimes(3);
    }
  );

  it.each([1, 2])('renders singular/plural image management and deletion for %i targets', async (count) => {
    const host = mount({ props: { fileTypes: ['image'] } });
    host.picker.value!.open();
    await flush();
    await beginManagement(count === 2);
    if (count === 1) document.querySelector<HTMLInputElement>('[data-file-id="first"] input')!.click();
    await flush();
    const unit = count === 1 ? 'item' : 'items';
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      `${count} ${unit} selected for management`
    );
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-delete-selected"]')!.click();
    await flush();
    const imageUnit = count === 1 ? 'image' : 'images';
    expect(document.querySelector('.a9-file-picker-delete')?.textContent).toContain(
      `${count} selected ${imageUnit} from the library`
    );
    confirmDelete();
    await flush();
    expect(document.querySelector('.arco-message')?.textContent).toContain(`Deleted ${count} ${imageUnit} from the library`);
  });

  it.each([1, 2])('renders singular/plural movement success for %i images', async (count) => {
    const host = mount({ props: { fileTypes: ['image'] } });
    host.picker.value!.open();
    await flush();
    await beginManagement(count === 2);
    if (count === 1) document.querySelector<HTMLInputElement>('[data-file-id="first"] input')!.click();
    await flush();
    await moveTo('Destination');
    expect(document.querySelector('.arco-message')?.textContent).toContain(
      `Moved ${count} ${count === 1 ? 'image' : 'images'}`
    );
  });

  it('deletes an uploaded asset without showing a persistent result reminder', async () => {
    const uploaded = { ...first, id: 'uploaded', name: 'Uploaded.png' };
    const host = mount({ props: { canUpload: true, fileTypes: ['image'] }, uploadResult: async () => uploaded });
    host.picker.value!.open();
    await flush();
    const input = document.querySelector<HTMLInputElement>('.a9-file-uploader input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['image'], 'Uploaded.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(document.querySelector('[data-testid="file-picker-select-uploaded"]')).toBeNull();
    expect(document.querySelector('[data-file-id="uploaded"]')).not.toBeNull();
    await beginManagement(false);
    document.querySelector<HTMLInputElement>('[data-file-id="uploaded"] input')!.click();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-delete-selected"]')!.click();
    await flush();
    confirmDelete();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-exit-batch"]')!.click();
    await flush();
    expect(host.adapter.deleteFiles).toHaveBeenCalledWith(['uploaded']);
    expect(document.querySelector('[data-file-id="uploaded"]')).toBeNull();
    expect(document.querySelector('[data-testid="file-picker-select-uploaded"]')).toBeNull();
    expect(document.querySelector('[data-testid="file-picker-upload-result"]')).toBeNull();
    expect(host.update).not.toHaveBeenCalled();
    expect(host.selection).not.toHaveBeenCalled();
  });

  it('manually selects a moved upload from its destination with updated group metadata', async () => {
    const uploaded = { ...first, id: 'uploaded', name: 'Uploaded.png' };
    const host = mount({ props: { canUpload: true, fileTypes: ['image'] }, uploadResult: async () => uploaded });
    host.picker.value!.open();
    await flush();
    const input = document.querySelector<HTMLInputElement>('.a9-file-uploader input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['image'], 'Uploaded.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    await beginManagement(false);
    document.querySelector<HTMLInputElement>('[data-file-id="uploaded"] input')!.click();
    await flush();
    await moveTo('Destination');
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-exit-batch"]')!.click();
    await flush();
    [...document.querySelectorAll<HTMLButtonElement>('.a9-file-picker__group-button')]
      .find((item) => item.textContent?.trim() === 'Ungrouped')!
      .click();
    await flush();
    expect(document.querySelector('[data-file-id="uploaded"]')).toBeNull();
    document.querySelector<HTMLButtonElement>('[data-group-id="root"]')!.click();
    await flush();
    document.querySelector<HTMLInputElement>('[data-file-id="uploaded"] input')!.click();
    await flush();
    expect(host.adapter.moveFiles).toHaveBeenCalledWith({ ids: ['uploaded'], groupId: 'root' });
    expect(host.selection).toHaveBeenLastCalledWith([first, second, { ...uploaded, groupId: 'root' }]);
    expect(host.update).not.toHaveBeenCalled();
  });

  it('separates image selection and management actions and names every deletion target', async () => {
    const host = mount({ props: { fileTypes: ['image'] } });
    host.picker.value!.open();
    await flush();
    expect(document.querySelector('.arco-modal-title')?.textContent).toBe('Select images');
    expect(document.querySelector('.a9-file-picker__footer-actions')?.textContent).toContain('Use selected images');
    expect(document.querySelector('.a9-file-picker__search input')?.getAttribute('placeholder')).toBe('Search image names');
    await beginManagement();
    expect(document.querySelector('.arco-modal-title')?.textContent).toBe('Manage images');
    expect(document.querySelector('.a9-file-picker__footer-actions')?.textContent).not.toContain('Use selected');
    expect(document.querySelector('.a9-file-picker__footer-actions')?.textContent).toContain('Close management');
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-delete-selected"]')!.click();
    await flush();
    const dialog = document.querySelector('.a9-file-picker-delete')!;
    expect(dialog.textContent).toContain('Delete images from the library?');
    expect(dialog.querySelectorAll('.a9-file-picker__delete-targets li')).toHaveLength(2);
    expect(dialog.textContent).toContain(first.name);
    expect(dialog.textContent).toContain(second.name);
    expect(dialog.querySelectorAll('.a9-file-picker__delete-targets img')).toHaveLength(2);
    dialog.querySelector<HTMLButtonElement>('.arco-btn')!.click();
    await flush();
    expect(host.adapter.deleteFiles).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-exit-batch"]')!.click();
    await flush();
    expect(document.querySelector('.arco-modal-title')?.textContent).toBe('Select images');
    expect(document.querySelectorAll('.a9-file-picker__item.is-selected')).toHaveLength(2);
    expect(host.update).not.toHaveBeenCalled();
  });

  it('keeps image-only browsing on the grid while generic file browsing retains list controls', async () => {
    const host = mount({ props: { fileTypes: ['image'], defaultView: 'list' } });
    host.picker.value!.open();
    await flush();
    expect(document.querySelector('.a9-file-picker__items')?.getAttribute('data-view')).toBe('grid');
    expect(document.querySelector('.a9-file-picker__view-toggle')).toBeNull();
    expect(document.querySelector('.a9-file-item__meta')).toBeNull();
    host.props.fileTypes = ['image', 'document'];
    await flush();
    expect(document.querySelector('.a9-file-picker__items')?.getAttribute('data-view')).toBe('list');
    expect(document.querySelector('.a9-file-picker__view-toggle')).not.toBeNull();
    expect(document.querySelector('.a9-file-item__meta')?.textContent).toContain('PNG');
  });

  it('appends external controls on both toolbar sides and keeps refresh last', async () => {
    const host = mount({
      slots: {
        'toolbar-left': () => h('button', { 'data-testid': 'external-left' }, 'Help'),
        'toolbar-right': () => h('button', { 'data-testid': 'external-right' }, 'Import'),
      },
    });
    host.picker.value!.open();
    await flush();
    expect(document.querySelector('.a9-file-picker__filters')?.lastElementChild?.getAttribute('data-testid')).toBe(
      'external-left'
    );
    const actions = document.querySelector('.a9-file-picker__toolbar-actions')!;
    expect(actions.querySelector('[data-testid="external-right"]')).not.toBeNull();
    expect(actions.lastElementChild?.getAttribute('data-testid')).toBe('file-picker-refresh');
    expect(document.querySelector('.a9-file-picker__move')).toBeNull();
  });

  it('allows management of unready material without permitting it as a field value', async () => {
    const host = mount({ props: { multiple: false, limit: 1 } });
    vi.mocked(host.adapter.list).mockResolvedValue({
      list: [first, { ...second, status: 'failed', url: '' }, { ...first, id: '' }],
      pagination: { page: 1, pageSize: 24, total: 3, hasMore: false },
    });
    host.picker.value!.open();
    await flush();
    expect(document.querySelector<HTMLInputElement>('[data-file-id="second"] input')?.disabled).toBe(true);
    await beginManagement();
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      '2 items selected for management'
    );
    expect(document.querySelector<HTMLInputElement>('[data-file-id=""] input')?.disabled).toBe(true);
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-exit-batch"]')!.click();
    await flush();
    expect(document.querySelector('[data-file-id="second"]')?.classList.contains('is-selected')).toBe(false);
    expect(host.update).not.toHaveBeenCalled();
  });

  it('keeps keyboard focus in empty management mode and clears it on a record change', async () => {
    const host = mount();
    vi.mocked(host.adapter.list).mockResolvedValue({
      list: [],
      pagination: { page: 1, pageSize: 24, total: 0, hasMore: false },
    });
    host.picker.value!.open();
    await flush();
    await beginManagement(false);
    expect(document.activeElement).toBe(document.querySelector('[data-testid="file-picker-exit-batch"]'));
    host.model.files = [second];
    await flush();
    expect(document.querySelector('.a9-file-picker__management')).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('[data-testid="file-picker-batch"]'));
    expect(host.update).not.toHaveBeenCalled();
  });

  it('exits management on Escape from the modal header without closing the picker', async () => {
    const host = mount();
    host.picker.value!.open();
    await flush();
    await beginManagement(false);
    const close = document.querySelector<HTMLElement>('.arco-modal-close-btn')!;
    close.focus();
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await flush();
    expect(document.querySelector('.a9-file-picker__management')).toBeNull();
    const batch = document.querySelector<HTMLButtonElement>('[data-testid="file-picker-batch"]')!;
    expect(document.activeElement).toBe(batch);
    expect(document.querySelector('.arco-modal')?.closest<HTMLElement>('.arco-modal-container')?.style.display).not.toBe(
      'none'
    );
    expect(host.update).not.toHaveBeenCalled();
  });

  it('preserves search focus when management permissions change during normal selection', async () => {
    const host = mount({ props: { canDeleteFiles: false, canMoveFiles: false } });
    host.picker.value!.open();
    await flush();
    const search = document.querySelector<HTMLInputElement>('.a9-file-picker__search input')!;
    search.focus();
    host.props.canDeleteFiles = true;
    await flush();
    expect(document.activeElement).toBe(search);
    host.props.canDeleteFiles = false;
    await flush();
    expect(document.activeElement).toBe(search);
    expect(host.update).not.toHaveBeenCalled();
  });

  it('keeps successful deletion feedback separate from a failed refresh and its retry', async () => {
    const host = mount();
    await deleteSelected(host.picker);
    vi.mocked(host.adapter.list).mockRejectedValueOnce(new Error('refresh failed'));
    confirmDelete();
    await flush();
    expect(document.querySelector('.arco-message-success')?.textContent).toContain('Deleted 2 files');
    expect(document.querySelector('.arco-message-error')).toBeNull();
    expect(document.querySelector('[data-testid="file-picker-retry-list"]')).not.toBeNull();
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-retry-list"]')!.click();
    await flush();
    expect(document.querySelector('[data-testid="file-picker-retry-list"]')).toBeNull();
    expect(host.adapter.deleteFiles).toHaveBeenCalledOnce();
    expect(host.update).not.toHaveBeenCalled();
  });

  it('keeps old browse-only adapters valid when management is disabled', async () => {
    const host = mount({ noCapabilities: true, props: { canDeleteFiles: false, canMoveFiles: false } });
    host.picker.value!.open();
    await flush();
    expect(document.querySelector('.a9-file-picker__file-actions')).toBeNull();
    expect(document.querySelector('[data-testid="file-picker-batch"]')).toBeNull();
    expect(host.errors).toEqual([]);
    host.props.canDeleteFiles = true;
    await flush();
    expect(String(host.errors[0])).toContain('requires deleteFiles');
  });

  it('cancels deletion without a request and deletes referenced files without changing the field', async () => {
    const host = mount();
    await deleteSelected(host.picker);
    expect(host.adapter.deleteFiles).not.toHaveBeenCalled();
    expect(document.querySelector('.a9-file-picker-delete')?.textContent).toContain('2 selected files');
    document.querySelector<HTMLButtonElement>('.a9-file-picker-delete .arco-btn-secondary')!.click();
    await flush();
    expect(host.adapter.deleteFiles).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-delete-selected"]')!.click();
    await flush();
    confirmDelete();
    await flush();
    expect(host.adapter.deleteFiles).toHaveBeenCalledWith(['first', 'second']);
    expect(document.querySelectorAll('.a9-file-picker__item')).toHaveLength(0);
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      '0 items selected for management'
    );
    expect(document.querySelector('.arco-message')?.textContent).toContain('Deleted 2 files');
    expect(host.model.files).toEqual([first, second]);
    expect(host.update).not.toHaveBeenCalled();
    expect(host.change).not.toHaveBeenCalled();
    expect(host.validator).not.toHaveBeenCalled();
  });

  it('keeps failed deletions selected and ignores duplicate/foreign success IDs', async () => {
    const host = mount({ deleteResult: async () => ['first', 'first', 'foreign'] });
    await deleteSelected(host.picker);
    confirmDelete();
    await flush();
    expect(document.querySelector('[data-file-id="first"]')).toBeNull();
    expect(document.querySelector('[data-file-id="second"]')?.classList.contains('is-selected')).toBe(true);
    expect(document.querySelector('.arco-message')?.textContent).toContain('Deleted 1 file from the library; 1 not deleted');
    expect(host.update).not.toHaveBeenCalled();
  });

  it('retains the selection on a failed request without leaking backend messages', async () => {
    const host = mount({
      deleteResult: async () => {
        throw new Error('private detail');
      },
    });
    await deleteSelected(host.picker);
    confirmDelete();
    await flush();
    expect(document.querySelectorAll('.a9-file-picker__item.is-selected')).toHaveLength(2);
    expect(document.querySelector('.arco-message')?.textContent).toContain('Deletion failed');
    expect(document.body.textContent).not.toContain('private detail');
  });

  it('moves into a parent group then Ungrouped without mutating committed objects or form validation', async () => {
    const host = mount();
    host.picker.value!.open();
    await flush();
    await moveTo('Destination');
    expect(host.adapter.moveFiles).toHaveBeenCalledWith({ ids: ['first', 'second'], groupId: 'root' });
    expect(host.selection).toHaveBeenLastCalledWith([
      { ...first, groupId: 'root' },
      { ...second, groupId: 'root' },
    ]);
    document.querySelector<HTMLInputElement>('[data-testid="file-picker-select-page"] input')!.click();
    await flush();
    await moveTo('Ungrouped');
    expect(host.adapter.moveFiles).toHaveBeenLastCalledWith({ ids: ['first', 'second'], groupId: null });
    expect(first.groupId).toBeNull();
    expect(second.groupId).toBeNull();
    expect(host.update).not.toHaveBeenCalled();
    expect(host.change).not.toHaveBeenCalled();
    expect(host.validator).not.toHaveBeenCalled();
  });

  it('retries only files not confirmed moved by the service', async () => {
    const host = mount({ moveResult: async () => ['first'] });
    host.picker.value!.open();
    await flush();
    await moveTo('Destination');
    expect(document.querySelector('.arco-message')?.textContent).toContain('Moved 1 file; 1 not moved');
    await moveTo('Destination');
    expect(host.adapter.moveFiles).toHaveBeenLastCalledWith({ ids: ['second'], groupId: 'root' });
  });

  it('accumulates cross-page management independently and starts empty after reopen', async () => {
    const host = mount({ props: { pageSize: 1 } });
    host.picker.value!.open();
    await flush();
    await beginManagement();
    await nextPage();
    document.querySelector<HTMLInputElement>('[data-testid="file-picker-select-page"] input')!.click();
    await flush();
    await moveTo('Destination');
    expect(host.adapter.moveFiles).toHaveBeenLastCalledWith({ ids: ['first', 'second'], groupId: 'root' });
    host.picker.value!.close();
    await flush();
    host.picker.value!.open();
    await flush();
    await beginManagement(false);
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      '0 items selected for management'
    );
    expect(host.model.files).toEqual([first, second]);
    expect(host.update).not.toHaveBeenCalled();
    expect(host.change).not.toHaveBeenCalled();
    expect(host.validator).not.toHaveBeenCalled();
  });

  it('moves to a second-level group and clears successful management selections', async () => {
    const host = mount();
    host.picker.value!.open();
    await flush();
    const ungrouped = [...document.querySelectorAll<HTMLButtonElement>('.a9-file-picker__group-button')].find(
      (item) => item.textContent?.trim() === 'Ungrouped'
    )!;
    ungrouped.click();
    await flush();
    await beginManagement();
    document.querySelector<HTMLElement>('.a9-file-picker__move')!.click();
    await flush();
    document.querySelector<HTMLElement>('.arco-cascader-option[title="Destination"] .arco-cascader-option-label')!.click();
    await flush();
    document.querySelector<HTMLInputElement>('.arco-cascader-option[title="Child"] input')!.click();
    await flush();
    expect(host.adapter.moveFiles).toHaveBeenCalledWith({ ids: ['first', 'second'], groupId: 'child' });
    expect(document.querySelectorAll('.a9-file-picker__item')).toHaveLength(0);
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      '0 items selected for management'
    );
    expect(host.update).not.toHaveBeenCalled();
  });

  it('deletes cross-page selections and corrects an emptied last page', async () => {
    const host = mount({ props: { pageSize: 1 } });
    host.picker.value!.open();
    await flush();
    await beginManagement();
    await nextPage();
    document.querySelector<HTMLInputElement>('[data-testid="file-picker-select-page"] input')!.click();
    await flush();
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-delete-selected"]')!.click();
    await flush();
    confirmDelete();
    await flush();
    expect(host.adapter.deleteFiles).toHaveBeenCalledWith(['first', 'second']);
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    expect(host.update).not.toHaveBeenCalled();
  });

  it('disables actions without a selection and blocks duplicate writes/selection while a move is pending', async () => {
    const pending = deferred<readonly string[]>();
    const host = mount({ moveResult: () => pending.promise });
    host.model.files = [];
    host.picker.value!.open();
    await flush();
    await beginManagement(false);
    expect(document.querySelector<HTMLButtonElement>('[data-testid="file-picker-delete-selected"]')!.disabled).toBe(true);
    document.querySelector<HTMLElement>('[data-file-id="first"]')!.click();
    await flush();
    await moveTo('Destination');
    document.querySelector<HTMLElement>('[data-file-id="second"]')!.click();
    await flush();
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      '1 item selected for management'
    );
    expect(document.querySelector<HTMLInputElement>('.a9-file-picker__search input')!.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('.a9-file-picker__footer-actions button:last-child')!.disabled).toBe(true);
    host.picker.value!.close();
    pending.resolve(['first']);
    await flush();
    expect(host.adapter.moveFiles).toHaveBeenCalledOnce();
    expect(host.update).not.toHaveBeenCalled();
    expect(document.querySelector('.arco-message')).toBeNull();
  });

  it('manages multiple files with a single-value limit and restores the surviving selection draft', async () => {
    const host = mount({ props: { multiple: false, limit: 1 }, deleteResult: async () => ['second'] });
    host.picker.value!.open();
    await flush();
    expect(document.querySelector('.a9-file-picker__move')).toBeNull();
    expect(document.querySelector('[data-testid="file-picker-delete-selected"]')).toBeNull();
    await beginManagement(false);
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      '0 items selected for management'
    );
    document.querySelector<HTMLInputElement>('[data-testid="file-picker-select-page"] input')!.click();
    await flush();
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      '2 items selected for management'
    );
    expect(document.querySelector('.a9-file-picker__selection-order')).toBeNull();
    expect(host.selection).not.toHaveBeenCalled();
    expect(document.querySelector('.a9-file-picker__footer-actions')?.textContent).not.toContain('Use selected');
    expect(document.querySelector('.a9-file-picker__footer-actions')?.textContent).toContain('Back to selection');
    expect(host.confirmed).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-delete-selected"]')!.click();
    await flush();
    confirmDelete();
    await flush();
    expect(host.adapter.deleteFiles).toHaveBeenCalledWith(['first', 'second']);
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-exit-batch"]')!.click();
    await flush();
    expect(document.querySelector('[data-file-id="first"]')?.classList.contains('is-selected')).toBe(true);
    expect(host.update).not.toHaveBeenCalled();
    expect(host.change).not.toHaveBeenCalled();
    expect(host.model.files).toEqual(first);
    document.querySelector<HTMLButtonElement>('.a9-file-picker__footer-actions button:last-child')!.click();
    await flush();
    expect(host.confirmed).toHaveBeenCalledWith([first]);
    expect(host.update).not.toHaveBeenCalled();
  });

  it('selects only this page and deselects it without removing selections on other pages', async () => {
    const host = mount({ props: { pageSize: 1, limit: 1 } });
    host.picker.value!.open();
    await flush();
    await beginManagement();
    await nextPage();
    const pageCheckbox = document.querySelector<HTMLInputElement>('[data-testid="file-picker-select-page"] input')!;
    expect(pageCheckbox.checked).toBe(false);
    pageCheckbox.click();
    await flush();
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      '2 items selected for management'
    );
    pageCheckbox.click();
    await flush();
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      '1 item selected for management'
    );
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-exit-batch"]')!.click();
    await flush();
    await beginManagement(false);
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      '0 items selected for management'
    );
    expect(host.update).not.toHaveBeenCalled();
  });

  it.each(['close', 'service', 'model', 'disabled', 'readonly', 'permission', 'unmount'] as const)(
    'ignores late deletion results after %s',
    async (action) => {
      const pending = deferred<readonly string[]>();
      const host = mount({ deleteResult: () => pending.promise });
      await deleteSelected(host.picker);
      confirmDelete();
      confirmDelete();
      await flush();
      expect(host.adapter.deleteFiles).toHaveBeenCalledTimes(1);
      if (action === 'close') host.picker.value!.close();
      if (action === 'service') host.service.value = { ...host.adapter };
      if (action === 'model') host.model.files = [second];
      if (action === 'disabled') host.props.disabled = true;
      if (action === 'readonly') host.props.readonly = true;
      if (action === 'permission') host.props.canDeleteFiles = false;
      if (action === 'unmount') {
        host.app.unmount();
        apps.splice(apps.indexOf(host.app), 1);
      }
      await flush();
      const calls = vi.mocked(host.adapter.list).mock.calls.length;
      pending.resolve(['first']);
      await flush();
      expect(vi.mocked(host.adapter.list).mock.calls).toHaveLength(calls);
      expect(host.update).not.toHaveBeenCalled();
      expect(host.change).not.toHaveBeenCalled();
      expect(document.querySelector('.arco-message')).toBeNull();
    }
  );
});
