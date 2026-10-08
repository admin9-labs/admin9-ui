/* eslint-disable no-await-in-loop, @typescript-eslint/no-non-null-assertion -- Flush Arco validation and assert mounted fixture elements. */
import { createApp, h, nextTick, reactive, ref, shallowRef, type App } from 'vue';
import ArcoVue, { Form, FormItem } from '@arco-design/web-vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AFilePicker from '../src/components/file-picker/index.vue';
import { messages } from '../src/locale';
import type { AFilePickerExposed, AFilePickerProps, FileGroup, FilePickerAdapter } from '../src';

const apps: App[] = [];
const image = { id: 'image', name: 'Image.png', url: '/image.png', type: 'image' as const, groupId: null };
async function flush() {
  for (let index = 0; index < 12; index += 1) {
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
function mount(overrides: Partial<FilePickerAdapter> = {}, initialProps: Partial<AFilePickerProps> = {}) {
  const groups: FileGroup[] = [
    { id: 'root', name: 'Root' },
    { id: 'child', name: 'Child', parentId: 'root' },
  ];
  const adapter: FilePickerAdapter = {
    list: vi.fn(async ({ page, pageSize }) => ({ list: [image], pagination: { page, pageSize, total: 1, hasMore: false } })),
    listGroups: vi.fn(async () => [...groups]),
    createGroup: vi.fn(async (input) => {
      const group = { ...input, id: `created-${groups.length}` };
      groups.push(group);
      return group;
    }),
    ...overrides,
  };
  const service = shallowRef(adapter);
  const props = reactive<AFilePickerProps>({ canCreateGroup: true, multiple: true, ...initialProps });
  const picker = ref<AFilePickerExposed>();
  const update = vi.fn();
  const visibility = vi.fn();
  const validator = vi.fn((_value: unknown, callback: () => void) => callback());
  const model = reactive({ files: [image] });
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
                  h(AFilePicker, {
                    ...props,
                    'ref': picker,
                    'service': service.value,
                    'modelValue': model.files,
                    'onUpdate:modelValue': update,
                    'onVisibleChange': visibility,
                  }),
              }
            ),
        }
      ),
  });
  app.use(ArcoVue).use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.config.errorHandler = (error) => errors.push(error);
  app.mount(target);
  apps.push(app);
  return { app, adapter, service, props, picker, groups, update, visibility, validator, errors };
}
async function openGroup(picker: { value: AFilePickerExposed | undefined }) {
  picker.value?.open();
  await flush();
  document.querySelector<HTMLButtonElement>('[data-testid="file-picker-create-group"]')?.click();
  await flush();
}
async function submit(name: string) {
  const input = document.querySelector<HTMLInputElement>('.a9-file-picker-create-group [aria-label="Group name"] input');
  if (!input) throw new Error('Missing group form');
  input.value = name;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document
    .querySelector('.a9-file-picker-create-group form')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await flush();
}
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('file group creation', () => {
  it('closes only the top dialog with each Escape and can reopen the creation form', async () => {
    const host = mount();
    await openGroup(host.picker);
    document.documentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(host.visibility).toHaveBeenLastCalledWith(true);
    document.documentElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flush();
    expect(host.visibility).toHaveBeenLastCalledWith(false);
    await openGroup(host.picker);
    await submit('Reopened');
    expect(host.adapter.createGroup).toHaveBeenCalledOnce();
  });

  it('uses image-specific title and empty states without a redundant single-type filter', async () => {
    const host = mount(
      { list: async ({ page, pageSize }) => ({ list: [], pagination: { page, pageSize, total: 0, hasMore: false } }) },
      { fileTypes: ['image'], multiple: false }
    );
    host.picker.value?.open();
    await flush();
    expect(document.querySelector('.a9-file-picker-modal .arco-modal-title')?.textContent).toBe('Select images');
    expect(document.querySelector('.a9-file-picker__type-select')).toBeNull();
    expect(document.querySelector('.a9-file-picker__selected-count')).toBeNull();
    expect(document.querySelector('.a9-file-picker__empty')?.textContent).toContain('No images');
    document.querySelector<HTMLElement>('[aria-label="Root"]')?.click();
    await flush();
    expect(document.querySelector('.a9-file-picker__empty')?.textContent).toContain('No images in this group');
    const search = document.querySelector<HTMLInputElement>('.a9-file-picker__search input')!;
    search.value = 'missing';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flush();
    expect(document.querySelector('.a9-file-picker__empty')?.textContent).toContain('No matching images');
  });

  it('requires both group capabilities only when explicitly enabled', async () => {
    const host = mount({ createGroup: undefined }, { canCreateGroup: false });
    host.picker.value?.open();
    await flush();
    expect(document.querySelector('[data-testid="file-picker-create-group"]')).toBeNull();
    host.props.canCreateGroup = true;
    await flush();
    expect(String(host.errors[0])).toContain('listGroups and createGroup');
  });

  it('creates a trimmed root, keeps the selection draft and does not validate the file field', async () => {
    const host = mount();
    await openGroup(host.picker);
    await submit('   ');
    expect(host.adapter.createGroup).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Enter a group name');
    await submit(' New group ');
    expect(host.adapter.createGroup).toHaveBeenCalledWith({ name: 'New group', parentId: null });
    expect(host.adapter.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ groupId: 'created-2', page: 1, keyword: undefined })
    );
    expect(document.querySelector('.a9-file-picker__selected-count')?.textContent).toContain('1 selected');
    expect(host.update).not.toHaveBeenCalled();
    expect(host.validator).not.toHaveBeenCalled();
  });

  it('offers only roots as parents and creates a child under the chosen root', async () => {
    const host = mount({}, { fileTypes: ['image'] });
    await openGroup(host.picker);
    document.querySelector<HTMLElement>('.a9-file-picker-create-group .arco-select')?.click();
    await flush();
    const options = [...document.querySelectorAll<HTMLElement>('.arco-select-option')];
    expect(options.map((option) => option.textContent?.trim())).toEqual(['No parent (top-level group)', 'Root']);
    options.find((option) => option.textContent?.trim() === 'Root')?.click();
    await submit('Second child');
    expect(host.adapter.createGroup).toHaveBeenCalledWith({ name: 'Second child', parentId: 'root' });
    expect(document.querySelector('[aria-label="Root / Second child"]')).not.toBeNull();
  });

  it('keeps input after creation failure and keeps the created group when refresh fails', async () => {
    const createGroup = vi
      .fn()
      .mockRejectedValueOnce(new Error('secret backend detail'))
      .mockResolvedValueOnce({ id: 'new', name: 'New', parentId: null });
    const host = mount({ createGroup });
    await openGroup(host.picker);
    await submit('New');
    expect(document.body.textContent).toContain('Failed to create group. Please retry.');
    expect(document.body.textContent).not.toContain('secret backend detail');
    expect(
      document.querySelector<HTMLInputElement>('.a9-file-picker-create-group [aria-label="Group name"] input')?.value
    ).toBe('New');
    vi.mocked(host.adapter.listGroups!).mockRejectedValueOnce(new Error('refresh failed'));
    await submit('New');
    expect(document.querySelector('[aria-label="New"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Failed to load groups');
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ groupId: 'new' }));
    expect(createGroup).toHaveBeenCalledTimes(2);
  });

  it.each(['cancel', 'close', 'service', 'disabled', 'readonly', 'permission', 'unmount'] as const)(
    'ignores a late create result after %s',
    async (action) => {
      const pending = deferred<FileGroup>();
      const createGroup = vi.fn(() => pending.promise);
      const host = mount({ createGroup });
      await openGroup(host.picker);
      await submit('Late');
      await submit('Late');
      expect(createGroup).toHaveBeenCalledTimes(1);
      if (action === 'cancel') document.querySelector<HTMLButtonElement>('.a9-file-picker__create-actions button')?.click();
      if (action === 'close') host.picker.value?.close();
      if (action === 'service') host.service.value = { ...host.adapter };
      if (action === 'disabled' || action === 'readonly') host.props[action] = true;
      if (action === 'permission') host.props.canCreateGroup = false;
      if (action === 'unmount') {
        host.app.unmount();
        apps.splice(apps.indexOf(host.app), 1);
      }
      await flush();
      const calls = vi.mocked(host.adapter.list).mock.calls.length;
      pending.resolve({ id: 'late', name: 'Late', parentId: null });
      await flush();
      expect(vi.mocked(host.adapter.list).mock.calls).toHaveLength(calls);
      expect(document.querySelector('[aria-label="Late"]')).toBeNull();
      expect(host.update).not.toHaveBeenCalled();
      expect(host.validator).not.toHaveBeenCalled();
    }
  );

  it('waits for groups to load before enabling creation', async () => {
    const pending = deferred<FileGroup[]>();
    const host = mount({ listGroups: () => pending.promise });
    host.picker.value?.open();
    await flush();
    expect(document.querySelector<HTMLButtonElement>('[data-testid="file-picker-create-group"]')?.disabled).toBe(true);
    pending.resolve([]);
    await flush();
    expect(document.querySelector<HTMLButtonElement>('[data-testid="file-picker-create-group"]')?.disabled).toBe(false);
  });
});
