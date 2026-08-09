import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';

const window = new Window({ url: 'http://localhost/' });
const browserGlobals = {
  window,
  document: window.document,
  navigator: window.navigator,
  Node: window.Node,
  Element: window.Element,
  HTMLElement: window.HTMLElement,
  SVGElement: window.SVGElement,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MutationObserver: window.MutationObserver,
  ResizeObserver: window.ResizeObserver,
  File: window.File,
  Blob: window.Blob,
  DataTransfer: window.DataTransfer,
  getComputedStyle: window.getComputedStyle.bind(window),
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
};
Object.entries(browserGlobals).forEach(([name, value]) => {
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
});

const { createApp, h, nextTick, shallowRef } = await import('vue');
const { createI18n } = await import('vue-i18n');
const ArcoVueModule = await import('@arco-design/web-vue');
const ArcoVue = ArcoVueModule.default.default;
const ArcoVueIcon = await import('@arco-design/web-vue/es/icon/index.js');
const packageExports = await import('@admin9-labs/admin9-ui');
const localeExports = await import('@admin9-labs/admin9-ui/locale');

assert.equal(packageExports.default.install instanceof Function, true);
assert.equal(packageExports.localePrefix, 'admin9Ui');
assert.equal(localeExports.localePrefix, 'admin9Ui');
assert.ok(packageExports.AIconPicker);
assert.ok(packageExports.AMediaLibrary);
assert.ok(packageExports.AMediaPicker);
assert.ok(packageExports.AProTable);

const require = createRequire(import.meta.url);
const commonJsPackage = require('@admin9-labs/admin9-ui');
const commonJsLocale = require('@admin9-labs/admin9-ui/locale');
assert.ok(commonJsPackage.AIconPicker);
assert.ok(commonJsPackage.AMediaLibrary);
assert.equal(commonJsLocale.localePrefix, 'admin9Ui');

const cssPath = import.meta.resolve('@admin9-labs/admin9-ui/styles');
const css = await readFile(new URL(cssPath), 'utf8');
assert.match(css, /\.a9-(icon|media|pro)-/);
assert.match(css, /\.a9-media-library/);

const mediaService = {
  async list({ page, pageSize }) {
    return { list: [], pagination: { page, pageSize, total: 0, hasMore: false } };
  },
  async upload() {
    throw new Error('Upload is not used by the mount smoke test.');
  },
  async remove(ids) {
    return ids;
  },
  async listGroups(mediaType) {
    return [{ id: `${mediaType}-fixtures`, name: 'Fixture group', count: 0 }];
  },
  async createGroup({ mediaType, name }) {
    return { id: `${mediaType}-created`, name };
  },
  async renameGroup({ groupId, name }) {
    return { id: groupId, name };
  },
  async removeGroup() {
    return undefined;
  },
  async move({ ids }) {
    return ids;
  },
};
let replacementListCalls = 0;
const replacementService = {
  ...mediaService,
  async list({ page, pageSize }) {
    replacementListCalls += 1;
    return { list: [], pagination: { page, pageSize, total: 0, hasMore: false } };
  },
};
const activeLibraryService = shallowRef(mediaService);

const host = document.createElement('div');
document.body.append(host);
const app = createApp({
  render: () =>
    h('main', [
      h(packageExports.AIconPicker, { modelValue: '' }),
      h(packageExports.AProTable, {
        columns: [{ title: 'Name', dataIndex: 'name' }],
        fetcher: async () => ({ list: [], total: 0 }),
      }),
      h(packageExports.AMediaPicker, {
        service: mediaService,
        canUpload: false,
        showFileList: false,
      }),
      h(packageExports.AMediaLibrary, {
        service: activeLibraryService.value,
        canUpload: false,
        canDelete: false,
        canMove: false,
        canManageGroups: false,
      }),
    ]),
});

app.use(ArcoVue);
Object.entries(ArcoVueIcon).forEach(([name, component]) => app.component(name, component));
app.use(createI18n({ legacy: false, locale: 'en-US', messages: localeExports.messages }));
app.use(packageExports.default, { mediaService });
app.mount(host);
await nextTick();
await new Promise((resolve) => setTimeout(resolve, 0));
await nextTick();

assert.ok(host.querySelector('.a9-icon-picker'), 'AIconPicker did not mount.');
assert.ok(host.querySelector('.a9-pro-table'), 'AProTable did not mount.');
assert.ok(host.querySelector('.a9-media-picker'), 'AMediaPicker did not mount.');
assert.ok(host.querySelector('.a9-media-library'), 'AMediaLibrary did not mount.');
assert.ok(host.querySelector('.arco-input-wrapper'), 'Arco input integration did not mount.');
assert.ok(host.querySelector('.arco-table'), 'Arco table integration did not mount.');
assert.ok(host.querySelector('.arco-upload'), 'Arco upload integration did not mount.');
assert.ok(host.querySelector('.a9-media-library .arco-spin'), 'AMediaLibrary Arco integration did not mount.');

activeLibraryService.value = replacementService;
await nextTick();
await new Promise((resolve) => setTimeout(resolve, 0));
await nextTick();
assert.ok(replacementListCalls > 0, 'AMediaLibrary did not use its replacement service.');
assert.ok(host.querySelector('.a9-media-library'), 'AMediaLibrary unmounted after its service changed.');

app.unmount();
await window.happyDOM.abort();
