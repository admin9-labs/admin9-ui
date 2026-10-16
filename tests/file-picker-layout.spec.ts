/* eslint-disable no-await-in-loop, @typescript-eslint/no-non-null-assertion -- Flush real Arco controls and assert mounted fixture elements. */
import { createApp, h, nextTick, reactive, ref, shallowRef, type App } from 'vue';
import ArcoVue from '@arco-design/web-vue';
import * as Icons from '@arco-design/web-vue/es/icon';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AFilePicker from '../src/components/file-picker/index.vue';
import { messages } from '../src/locale';
import type { AFilePickerExposed, AFilePickerProps, FileItem, FileListParams, FileListResult, FilePickerAdapter } from '../src';

const apps: App[] = [];
let width = 822;
let height = 580;
const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')?.get;
const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')?.get;
interface ResizeObserverFixture extends ResizeObserver {
  targets: Set<Element>;
  callback: ResizeObserverCallback;
}
const observers = new Set<ResizeObserverFixture>();
class MeasuredResizeObserver implements ResizeObserver {
  targets = new Set<Element>();

  constructor(readonly callback: ResizeObserverCallback) {
    observers.add(this);
  }

  observe(target: Element) {
    this.targets.add(target);
  }

  unobserve(target: Element) {
    this.targets.delete(target);
  }

  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }
}
const files: FileItem[] = Array.from({ length: 37 }, (_, index) => ({
  id: `file-${index + 1}`,
  name: `Image ${index + 1}.png`,
  type: 'image',
  groupId: null,
  url: `/files/${index + 1}.png`,
}));
function pageResult(params: FileListParams, pageSize = params.pageSize, all = files): FileListResult {
  const offset = (params.page - 1) * pageSize;
  return {
    list: all.slice(offset, offset + pageSize),
    pagination: { page: params.page, pageSize, total: all.length, hasMore: offset + pageSize < all.length },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function flush() {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
    await nextTick();
  }
}
function notifyResize(nextWidth: number, nextHeight: number) {
  width = nextWidth;
  height = nextHeight;
  observers.forEach((observer) => {
    const targets = [...observer.targets].filter((target) => target.matches('.a9-file-picker__results'));
    if (targets.length) {
      observer.callback(
        targets.map((target) => ({ target, contentRect: { width, height } } as ResizeObserverEntry)),
        observer
      );
    }
  });
}
async function settleResize(nextWidth: number, nextHeight: number) {
  notifyResize(nextWidth, nextHeight);
  await vi.advanceTimersByTimeAsync(150);
  await flush();
}
function click(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  element.click();
}
function renderedIds() {
  return [...document.querySelectorAll<HTMLElement>('.a9-file-picker__item')].map((item) => item.dataset.fileId);
}
async function manageFirst() {
  click('[data-testid="file-picker-batch"]');
  await flush();
  click('[data-file-id="file-1"] input');
  await flush();
}
function changeView(value: 'grid' | 'list') {
  click(`.a9-file-picker__view-toggle [aria-label="${value === 'grid' ? 'Grid' : 'List'} view"]`);
}
function narrowViewport() {
  const viewport = new EventTarget() as EventTarget & { matches: boolean };
  viewport.matches = true;
  const original = window.matchMedia.bind(window);
  vi.stubGlobal('matchMedia', (query: string) => (query === '(max-width: 720px)' ? viewport : original(query)));
  width = 326;
  height = 430;
  return viewport;
}
function escape(target: Element = document.activeElement ?? document.documentElement) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}
function mount(options: { props?: Partial<AFilePickerProps>; adapter?: Partial<FilePickerAdapter> } = {}) {
  const adapter: FilePickerAdapter = {
    list: vi.fn(async (params) => pageResult(params)),
    ...options.adapter,
  };
  const service = shallowRef(adapter);
  const props = reactive<AFilePickerProps>({ fileTypes: ['image'], multiple: true, ...options.props });
  const picker = ref<AFilePickerExposed>();
  const update = vi.fn();
  const selection = vi.fn();
  const visibility = vi.fn();
  const target = document.createElement('div');
  document.body.append(target);
  const app = createApp({
    render: () =>
      h(AFilePicker, {
        ...props,
        'ref': picker,
        'service': service.value,
        'onUpdate:modelValue': update,
        'onSelectionChange': selection,
        'onVisibleChange': visibility,
      }),
  });
  app.use(ArcoVue).use(createI18n({ legacy: false, locale: 'en-US', messages }));
  Object.entries(Icons).forEach(([name, icon]) => app.component(name, icon));
  app.mount(target);
  apps.push(app);
  return { app, adapter, service, props, picker, update, selection, visibility };
}

beforeEach(() => {
  width = 822;
  height = 580;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function resultWidth(this: HTMLElement) {
    return this.matches('.a9-file-picker__results') ? width : originalWidth?.call(this) ?? 0;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function resultHeight(this: HTMLElement) {
    if (this.matches('.a9-file-picker__results')) return height;
    return originalHeight?.call(this) ?? 0;
  });
  vi.stubGlobal('ResizeObserver', MeasuredResizeObserver);
});
afterEach(async () => {
  apps.splice(0).forEach((app) => app.unmount());
  observers.clear();
  vi.useRealTimers();
  await flush();
  // Let Arco remove its message portal before replacing the body.
  await vi.waitFor(() => expect(document.querySelector('.arco-message-list')).toBeNull());
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('file picker fixed pagination and responsive columns', () => {
  it('requests 20 items without waiting for layout and keeps every ID reachable', async () => {
    width = 0;
    height = 0;
    const host = mount();
    expect(host.adapter.list).not.toHaveBeenCalled();
    host.picker.value!.open();
    await flush();
    expect(host.adapter.list).toHaveBeenCalledOnce();
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }));
    const seen = renderedIds();
    expect(seen).toHaveLength(20);
    click('.a9-file-picker-modal .arco-pagination-item-next');
    await flush();
    seen.push(...renderedIds());
    expect(seen).toEqual(files.map((item) => item.id));
    expect(host.update).not.toHaveBeenCalled();
  });

  it('uses the same card content and page size for image-only and generic browsing', async () => {
    height = 290;
    const host = mount({ props: { modelValue: [files[0]] } });
    host.picker.value!.open();
    await flush();
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 20 }));
    expect(document.querySelector('.a9-file-item__name')?.textContent).toBe(files[0].name);
    expect(document.querySelector('.a9-file-item__meta')?.textContent).toBe('PNG');
    const cardText = document.querySelector('[data-file-id="file-1"] .a9-file-item')!.textContent;
    host.props.fileTypes = ['image', 'document'];
    await flush();
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 20 }));
    expect(document.querySelector('[data-file-id="file-1"] .a9-file-item')!.textContent).toBe(cardText);
    expect(document.querySelector('[data-file-id="file-1"]')?.classList.contains('is-selected')).toBe(true);
    expect(host.update).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'image', fileTypes: ['image'] as const },
    { label: 'file', fileTypes: ['image', 'document'] as const },
  ])('keeps the $label dialog height on the final, empty and failed page', async ({ fileTypes }) => {
    const host = mount({ props: { fileTypes } });
    host.picker.value!.open();
    await flush();
    const modal = document.querySelector<HTMLElement>('.arco-modal')!;
    expect(modal.style.height).toBe('720px');
    expect(modal.style.maxHeight).toBe('calc(100dvh - 32px)');
    click('.a9-file-picker-modal .arco-pagination-item-next');
    await flush();
    expect(renderedIds()).toHaveLength(17);
    expect(modal.style.height).toBe('720px');
    vi.mocked(host.adapter.list).mockResolvedValue(pageResult({ page: 1, pageSize: 20 }, 20, []));
    await host.picker.value!.refresh();
    await flush();
    expect(document.querySelector('.a9-file-picker__empty')).not.toBeNull();
    expect(modal.style.height).toBe('720px');
    vi.mocked(host.adapter.list).mockRejectedValue(new Error('Unavailable'));
    await host.picker.value!.refresh();
    expect(document.querySelector('.a9-file-picker__list-error')).not.toBeNull();
    expect(modal.style.height).toBe('720px');
    expect(host.update).not.toHaveBeenCalled();
  });

  it.each([undefined, 6, 24])(
    'preserves page, selection and requests across resize and view changes (pageSize %s)',
    async (pageSize) => {
      const host = mount({ props: { pageSize, fileTypes: ['image', 'document'] } });
      host.picker.value!.open();
      await flush();
      const capacity = pageSize ?? 20;
      expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: capacity }));
      click('[data-file-id="file-1"]');
      click('.a9-file-picker-modal .arco-pagination-item-next');
      await flush();
      click(`[data-file-id="file-${capacity + 1}"]`);
      const ids = renderedIds();
      vi.mocked(host.adapter.list).mockClear();
      changeView('list');
      await flush();
      changeView('grid');
      await flush();
      vi.useFakeTimers();
      await settleResize(480, 80);
      expect(host.adapter.list).not.toHaveBeenCalled();
      expect(renderedIds()).toEqual(ids);
      expect(document.querySelector<HTMLInputElement>('.arco-pagination input')?.value).toBe('2');
      expect(
        document.querySelector<HTMLElement>('.a9-file-picker__results')?.style.getPropertyValue('--a9-file-picker-columns')
      ).toBe('3');
      expect(document.querySelector<HTMLElement>('.arco-modal')?.style.height).toBe('720px');
      click('.a9-file-picker__footer-actions button:last-child');
      await flush();
      expect(host.update).toHaveBeenCalledWith([files[0], files[capacity]]);
    }
  );

  it.each([undefined, 0, -1, 2.5, Number.NaN])('uses the 20-item default for pageSize %s', async (pageSize) => {
    const host = mount({ props: { pageSize } });
    host.picker.value!.open();
    await flush();
    expect(host.adapter.list).toHaveBeenCalledOnce();
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 20 }));
  });

  it.each([10, 24])('uses server capacity %i for later pages without truncation or a resize request', async (capacity) => {
    const host = mount({ adapter: { list: vi.fn(async (params) => pageResult(params, capacity)) } });
    host.picker.value!.open();
    await flush();
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 20 }));
    const seen = renderedIds();
    for (let page = 2; page <= Math.ceil(files.length / capacity); page += 1) {
      click('.a9-file-picker-modal .arco-pagination-item-next');
      await flush();
      expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ page, pageSize: capacity }));
      seen.push(...renderedIds());
    }
    expect(seen).toEqual(files.map((item) => item.id));
    vi.useFakeTimers();
    await settleResize(480, 128);
    expect(host.adapter.list).toHaveBeenCalledTimes(Math.ceil(files.length / capacity));
  });

  it('coalesces open and repeated initial refresh while the first request is pending', async () => {
    width = 0;
    const response = deferred<FileListResult>();
    const host = mount({ adapter: { list: vi.fn(() => response.promise) } });
    host.picker.value!.open();
    const refreshed = vi.fn();
    const first = host.picker.value!.refresh().then(refreshed);
    const second = host.picker.value!.refresh().then(refreshed);
    await flush();
    expect(host.adapter.list).toHaveBeenCalledOnce();
    expect(refreshed).not.toHaveBeenCalled();
    response.resolve(pageResult({ page: 1, pageSize: 20 }));
    await Promise.all([first, second]);
    expect(refreshed).toHaveBeenCalledTimes(2);
  });

  it('resets the page for a changed pageSize and preserves cross-page selection', async () => {
    const host = mount();
    host.picker.value!.open();
    await flush();
    click('[data-file-id="file-1"]');
    click('.a9-file-picker-modal .arco-pagination-item-next');
    await flush();
    click('[data-file-id="file-21"]');
    host.props.pageSize = 6;
    await flush();
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 6 }));
    expect(renderedIds()).toEqual(files.slice(0, 6).map((file) => file.id));
    host.props.pageSize = undefined;
    await flush();
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }));
    click('.a9-file-picker__footer-actions button:last-child');
    await flush();
    expect(host.update).toHaveBeenCalledWith([files[0], files[20]]);
  });

  it('ignores old responses after a pageSize or service change', async () => {
    const response = deferred<FileListResult>();
    const host = mount({ adapter: { list: vi.fn(() => response.promise) } });
    host.picker.value!.open();
    await flush();
    const replacement = { ...files[0], id: 'replacement' };
    host.service.value = { list: vi.fn(async (params) => pageResult(params, params.pageSize, [replacement])) };
    host.props.pageSize = 6;
    await flush();
    response.resolve(pageResult({ page: 1, pageSize: 20 }));
    await flush();
    expect(renderedIds()).toEqual(['replacement']);
    expect(host.update).not.toHaveBeenCalled();
  });

  it('refreshes a changed pageSize without waiting for the obsolete first request', async () => {
    const response = deferred<FileListResult>();
    const list = vi.fn(async (params: FileListParams) => pageResult(params));
    list.mockImplementationOnce(() => response.promise);
    const host = mount({ adapter: { list } });
    host.picker.value!.open();
    await flush();
    host.props.pageSize = 6;
    await flush();
    await host.picker.value!.refresh();
    expect(list).toHaveBeenCalledTimes(3);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 6 }));
    response.resolve(pageResult({ page: 1, pageSize: 20 }));
    await flush();
    expect(renderedIds()).toEqual(files.slice(0, 6).map((file) => file.id));
  });

  it('keeps confirmation and limit feedback outside results without requerying', async () => {
    const host = mount({ props: { modelValue: [files[0]], limit: 1 } });
    host.picker.value!.open();
    await flush();
    click('[data-file-id="file-1"]');
    await flush();
    const notice = document.querySelector('[id$="-confirm-empty"]')!;
    expect(notice.textContent).toContain('removes');
    expect(notice.closest('.arco-modal-footer')).not.toBeNull();
    expect(notice.closest('.a9-file-picker__results')).toBeNull();
    click('[data-file-id="file-1"]');
    click('[data-file-id="file-2"]');
    await flush();
    expect(document.querySelector('.arco-message-warning:not(.fade-message-leave-active)')).not.toBeNull();
    expect(host.adapter.list).toHaveBeenCalledOnce();
    expect(host.update).not.toHaveBeenCalled();
  });

  it('defers a changed pageSize during deletion and applies it to the post-write refresh', async () => {
    const deleted = deferred<readonly string[]>();
    let remaining = files;
    const host = mount({
      props: { canDeleteFiles: true, modelValue: [files[0]] },
      adapter: {
        list: vi.fn(async (params) => pageResult(params, params.pageSize, remaining)),
        deleteFiles: vi.fn(async () => {
          const result = await deleted.promise;
          remaining = remaining.filter((file) => !result.includes(file.id));
          return result;
        }),
      },
    });
    host.picker.value!.open();
    await flush();
    await manageFirst();
    click('[data-testid="file-picker-delete-selected"]');
    await flush();
    click('.a9-file-picker-delete .arco-btn-primary');
    await flush();
    vi.mocked(host.adapter.list).mockClear();
    host.props.pageSize = 6;
    await flush();
    expect(host.adapter.list).not.toHaveBeenCalled();
    deleted.resolve(['file-1']);
    await flush();
    expect(host.adapter.list).toHaveBeenCalledOnce();
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 6 }));
    expect(renderedIds()).not.toContain('file-1');
    expect(host.update).not.toHaveBeenCalled();
  });

  it('applies a pageSize change received during the post-delete refresh', async () => {
    const refreshed = deferred<FileListResult>();
    const remaining = files.slice(1);
    const list = vi.fn(async (params: FileListParams) => pageResult(params, params.pageSize, remaining));
    list.mockImplementationOnce(async (params) => pageResult(params));
    list.mockImplementationOnce(() => refreshed.promise);
    const host = mount({
      props: { canDeleteFiles: true, modelValue: [files[0]] },
      adapter: { list, deleteFiles: vi.fn(async (ids) => ids) },
    });
    host.picker.value!.open();
    await flush();
    await manageFirst();
    click('[data-testid="file-picker-delete-selected"]');
    await flush();
    click('.a9-file-picker-delete .arco-btn-primary');
    await flush();
    expect(list).toHaveBeenCalledTimes(2);
    host.props.pageSize = 6;
    await flush();
    expect(list).toHaveBeenCalledTimes(2);
    refreshed.resolve(pageResult({ page: 1, pageSize: 20 }, 20, remaining));
    await flush();
    expect(list).toHaveBeenCalledTimes(3);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 6 }));
    expect(renderedIds()).toEqual(remaining.slice(0, 6).map((file) => file.id));
    expect(host.update).not.toHaveBeenCalled();
  });

  it.each(['model', 'permission'] as const)(
    'applies a deferred pageSize when %s invalidates a pending write and ignores its late result',
    async (invalidation) => {
      const deleted = deferred<readonly string[]>();
      const host = mount({
        props: { canDeleteFiles: true, modelValue: [files[0]] },
        adapter: { deleteFiles: vi.fn(() => deleted.promise) },
      });
      host.picker.value!.open();
      await flush();
      await manageFirst();
      click('[data-testid="file-picker-delete-selected"]');
      await flush();
      click('.a9-file-picker-delete .arco-btn-primary');
      await flush();
      vi.mocked(host.adapter.list).mockClear();
      host.props.pageSize = 6;
      await flush();
      expect(host.adapter.list).not.toHaveBeenCalled();
      if (invalidation === 'model') host.props.modelValue = [files[1]];
      else host.props.canDeleteFiles = false;
      await flush();
      expect(host.adapter.list).toHaveBeenCalledOnce();
      expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 6 }));
      deleted.resolve(['file-1']);
      await flush();
      expect(host.adapter.list).toHaveBeenCalledOnce();
      expect(renderedIds()).toEqual(files.slice(0, 6).map((file) => file.id));
      expect(host.update).not.toHaveBeenCalled();
    }
  );

  it('keeps uploads and paging stable across resizing', async () => {
    const uploaded = deferred<FileItem>();
    const host = mount({ props: { canUpload: true }, adapter: { upload: vi.fn(() => uploaded.promise) } });
    host.picker.value!.open();
    await flush();
    const input = document.querySelector<HTMLInputElement>('.a9-file-uploader input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['png'], 'new.png', { type: 'image/png' })] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    vi.useFakeTimers();
    await settleResize(480, 128);
    expect(host.adapter.list).toHaveBeenCalledOnce();
    uploaded.resolve({ ...files[0], id: 'uploaded', name: 'new.png' });
    await flush();
    expect(host.adapter.upload).toHaveBeenCalledOnce();
    expect(host.adapter.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 20 }));
    expect(host.update).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.a9-file-picker__item.is-selected')).toHaveLength(0);
  });

  it('closes the move popup, management mode and picker one layer per Escape', async () => {
    narrowViewport();
    const host = mount({
      props: { canMoveFiles: true, modelValue: [files[0]] },
      adapter: {
        listGroups: vi.fn(async () => [{ id: 'destination', name: 'Destination' }]),
        moveFiles: vi.fn(async ({ ids }) => ids),
      },
    });
    host.picker.value!.open();
    await flush();
    await manageFirst();
    click('.a9-file-picker__move');
    await flush();
    const input = document.querySelector<HTMLInputElement>('.a9-file-picker__move input')!;
    input.focus();
    expect(document.querySelector('.arco-cascader-option')).not.toBeNull();
    escape(input);
    await flush();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(document.querySelector('.a9-file-picker__management')).not.toBeNull();
    expect(host.visibility).toHaveBeenLastCalledWith(true);
    const popup = document.querySelector('.arco-cascader-option')?.closest<HTMLElement>('.arco-trigger-popup');
    expect(!popup || popup.style.display === 'none').toBe(true);
    escape(input);
    await flush();
    const batch = document.querySelector<HTMLButtonElement>('[data-testid="file-picker-batch"]')!;
    expect(document.querySelector('.a9-file-picker__management')).toBeNull();
    expect(document.activeElement).toBe(batch);
    expect(host.visibility).toHaveBeenLastCalledWith(true);
    escape(batch);
    await flush();
    expect(host.visibility).toHaveBeenLastCalledWith(false);
    expect(host.update).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'] as const)(
    'restores management focus after keyboard movement finishes with %s',
    async (outcome) => {
      narrowViewport();
      const host = mount({
        props: { canMoveFiles: true, modelValue: [files[0]] },
        adapter: {
          listGroups: vi.fn(async () => [{ id: 'destination', name: 'Destination' }]),
          moveFiles: vi.fn(async ({ ids }) => {
            if (outcome === 'failure') throw new Error('Move rejected');
            return ids;
          }),
        },
      });
      host.picker.value!.open();
      await flush();
      await manageFirst();
      click('.a9-file-picker__move');
      const input = document.querySelector<HTMLInputElement>('.a9-file-picker__move input')!;
      input.focus();
      input.value = 'Destination';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await flush();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50);
      });
      expect(host.adapter.moveFiles).toHaveBeenCalledWith({ ids: [files[0].id], groupId: 'destination' });
      expect(document.activeElement).toBe(document.querySelector('[data-testid="file-picker-exit-batch"]'));
      expect(host.visibility).toHaveBeenLastCalledWith(true);
      expect(host.update).not.toHaveBeenCalled();
    }
  );

  it('returns deletion cancellation focus to Delete and preserves management across desktop resize', async () => {
    const viewport = narrowViewport();
    const host = mount({
      props: { canDeleteFiles: true, modelValue: [files[0]] },
      adapter: { deleteFiles: vi.fn(async (ids) => ids) },
    });
    host.picker.value!.open();
    await flush();
    await manageFirst();
    const deleting = document.querySelector<HTMLButtonElement>('[data-testid="file-picker-delete-selected"]')!;
    deleting.focus();
    deleting.click();
    await flush();
    click('.a9-file-picker-delete .arco-btn-secondary');
    await flush();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(document.activeElement).toBe(deleting);
    expect(host.adapter.deleteFiles).not.toHaveBeenCalled();
    viewport.matches = false;
    viewport.dispatchEvent(new Event('change'));
    await flush();
    expect(document.querySelector('.a9-file-picker__management')).not.toBeNull();
    expect(document.querySelector('.a9-file-picker__management [role="status"]')?.textContent).toBe(
      '1 item selected for management'
    );
    expect(document.querySelector('[data-testid="file-picker-more"]')).toBeNull();
  });

  it('restores focus and closes the picker on the first Escape after all management permissions are removed', async () => {
    narrowViewport();
    const host = mount({
      props: { canDeleteFiles: true, canMoveFiles: true, modelValue: [files[0]] },
      adapter: {
        listGroups: vi.fn(async () => [{ id: 'destination', name: 'Destination' }]),
        deleteFiles: vi.fn(async (ids) => ids),
        moveFiles: vi.fn(async ({ ids }) => ids),
      },
    });
    host.picker.value!.open();
    await flush();
    await manageFirst();
    host.props.canDeleteFiles = false;
    host.props.canMoveFiles = false;
    await flush();
    expect(document.querySelector('.a9-file-picker__management')).toBeNull();
    expect(document.activeElement).toBe(document.querySelector('.a9-file-picker__search input'));
    expect(host.visibility).toHaveBeenLastCalledWith(true);
    escape();
    await flush();
    expect(host.visibility).toHaveBeenLastCalledWith(false);
    expect(host.update).not.toHaveBeenCalled();
  });
});
