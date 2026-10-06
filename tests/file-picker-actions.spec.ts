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
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe('2 selected');
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
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe('0 selected');
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
    expect(document.querySelector('.arco-message')?.textContent).toContain('Deleted 1 files; 1 failed');
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
    await moveTo('Ungrouped');
    expect(host.adapter.moveFiles).toHaveBeenLastCalledWith({ ids: ['first', 'second'], groupId: null });
    expect(first.groupId).toBeNull();
    expect(second.groupId).toBeNull();
    expect(host.update).not.toHaveBeenCalled();
    expect(host.change).not.toHaveBeenCalled();
    expect(host.validator).not.toHaveBeenCalled();
  });

  it('retries the full selection without treating local group metadata as authoritative', async () => {
    const host = mount({ moveResult: async () => ['first'] });
    host.picker.value!.open();
    await flush();
    await moveTo('Destination');
    expect(document.querySelector('.arco-message')?.textContent).toContain('Moved 1 files; 1 failed');
    await moveTo('Destination');
    expect(host.adapter.moveFiles).toHaveBeenLastCalledWith({ ids: ['first', 'second'], groupId: 'root' });
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
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe('0 selected');
    expect(host.model.files).toEqual([first, second]);
    expect(host.update).not.toHaveBeenCalled();
    expect(host.change).not.toHaveBeenCalled();
    expect(host.validator).not.toHaveBeenCalled();
  });

  it('moves to a second-level group and keeps moved files selected outside the current group', async () => {
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
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe('2 selected');
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
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe('1 selected');
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
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe('0 selected');
    document.querySelector<HTMLInputElement>('[data-testid="file-picker-select-page"] input')!.click();
    await flush();
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe('2 selected');
    expect(document.querySelector('.a9-file-picker__selection-order')).toBeNull();
    expect(host.selection).not.toHaveBeenCalled();
    expect(document.querySelector<HTMLButtonElement>('.a9-file-picker__footer-actions button:last-child')!.disabled).toBe(true);
    document.querySelector<HTMLButtonElement>('.a9-file-picker__footer-actions button:last-child')!.click();
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
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe('2 selected');
    pageCheckbox.click();
    await flush();
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe('1 selected');
    document.querySelector<HTMLButtonElement>('[data-testid="file-picker-exit-batch"]')!.click();
    await flush();
    await beginManagement(false);
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe('0 selected');
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
