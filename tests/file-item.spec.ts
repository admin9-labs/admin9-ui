import { createApp, h, nextTick, reactive, type App, type Component } from 'vue';
import { Image } from '@arco-design/web-vue';
import * as Icons from '@arco-design/web-vue/es/icon';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FileItemView from '../src/internal/file-item.vue';
import { messages } from '../src/locale';
import type { FileItem } from '../src/services/types';

const apps: App[] = [];
const item: FileItem = {
  id: 'image-1',
  name: 'A long image name with a complete accessible filename.png',
  type: 'image',
  url: '/files/original.png',
  thumbnail: '/files/thumbnail.png',
  size: 2048,
};

function mount(file: FileItem, view: 'grid' | 'list' = 'grid') {
  const state = reactive({
    item: file,
    available: true,
    statusLabel: '',
    previewEnabled: true,
    view,
    showMetadata: true,
    showName: true,
  });
  const preview = vi.fn();
  const select = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h('article', { onClick: select }, h(FileItemView, { ...state, onPreviewOpen: preview })),
  });
  app.component('AImage', Image);
  Object.entries(Icons).forEach(([name, icon]) => app.component(name, icon as Component));
  app.use(createI18n({ legacy: false, locale: 'en-US', messages }));
  app.mount(host);
  apps.push(app);
  return { host, state, preview, select };
}

afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount());
  document.body.innerHTML = '';
});

describe('file card image rendering', () => {
  it('keeps image-only cards free of filenames while retaining preview names and unavailable status', async () => {
    const { host, state, preview } = mount({ ...item });
    state.showName = false;
    state.showMetadata = false;
    await nextTick();
    expect(host.querySelector('.a9-file-item__name')).toBeNull();
    expect(host.querySelector('.a9-file-item__meta')).toBeNull();
    expect(host.querySelector('img')?.getAttribute('alt')).toBe(item.name);
    const button = host.querySelector<HTMLButtonElement>('.a9-file-item__open');
    expect(button?.getAttribute('aria-label')).toBe(`Preview ${item.name}`);
    button?.click();
    expect(preview).toHaveBeenCalledOnce();
    state.item = { ...item, status: 'pending' };
    state.available = false;
    state.statusLabel = 'Image is processing';
    await nextTick();
    expect(host.querySelector('.a9-file-item__status')?.textContent).toBe('Image is processing');
    expect(host.querySelector('.a9-file-item__name')).toBeNull();
  });
  it.each(['grid', 'list'] as const)('preserves image and video thumbnails without cropping in %s view', async (view) => {
    const { host, state } = mount({ ...item }, view);
    await nextTick();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/files/thumbnail.png');
    expect(host.querySelector('img')?.style.objectFit).toBe('contain');
    state.item = { ...item, type: 'video', url: '/files/video.mp4' };
    await nextTick();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/files/thumbnail.png');
    expect(host.querySelector('img')?.style.objectFit).toBe('contain');
  });

  it('falls back to the safe original and keeps preview clicks separate from selection', async () => {
    // eslint-disable-next-line no-script-url -- Exercise rejection of an unsafe thumbnail URL.
    const { host, state, preview, select } = mount({ ...item, thumbnail: 'javascript:alert(1)' });
    await nextTick();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/files/original.png');
    const button = host.querySelector<HTMLButtonElement>('button.a9-file-item__open');
    button?.click();
    expect(preview).toHaveBeenCalledOnce();
    expect(preview).toHaveBeenCalledWith(button);
    expect(select).not.toHaveBeenCalled();
    state.previewEnabled = false;
    await nextTick();
    button?.click();
    expect(preview).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();
  });

  it('shows the complete filename and unavailable status in the existing information area', async () => {
    const { host, state } = mount({ ...item });
    expect(host.querySelector('.a9-file-item__name')?.getAttribute('title')).toBe(item.name);
    expect(host.querySelector('.a9-file-item__meta')?.textContent).toContain('PNG');
    state.showMetadata = false;
    await nextTick();
    expect(host.querySelector('.a9-file-item__meta')).toBeNull();
    expect(host.querySelector('.a9-file-item__name')?.textContent).toBe(item.name);
    expect(host.querySelector('.a9-file-item__open')).not.toBeNull();
    state.item = { ...item, status: 'pending' };
    state.available = false;
    state.statusLabel = 'The file is still processing. Please try again later.';
    await nextTick();
    expect(host.querySelector('.a9-file-item__meta')).toBeNull();
    expect(host.querySelector('.a9-file-item__status')?.textContent).toBe(state.statusLabel);
    expect(host.querySelector('.a9-file-item__status')?.getAttribute('title')).toBe(state.statusLabel);
    expect(host.querySelector('.a9-file-item__actions')).toBeNull();
  });
});
