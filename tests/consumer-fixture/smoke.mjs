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
  DOMRect: window.DOMRect,
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
assert.ok(packageExports.ACoordinatePicker);
assert.ok(packageExports.AFileManager);
assert.ok(packageExports.AFilePicker);
assert.ok(packageExports.AMediaLibrary);
assert.ok(packageExports.AMediaPicker);
assert.ok(packageExports.AProTable);
assert.ok(packageExports.ATiptapEditor);

const require = createRequire(import.meta.url);
const commonJsPackage = require('@admin9-labs/admin9-ui');
const commonJsLocale = require('@admin9-labs/admin9-ui/locale');
assert.ok(commonJsPackage.AIconPicker);
assert.ok(commonJsPackage.ACoordinatePicker);
assert.ok(commonJsPackage.AFileManager);
assert.ok(commonJsPackage.AFilePicker);
assert.ok(commonJsPackage.AMediaLibrary);
assert.ok(commonJsPackage.ATiptapEditor);
assert.equal(commonJsLocale.localePrefix, 'admin9Ui');

const cssPath = import.meta.resolve('@admin9-labs/admin9-ui/styles');
const css = await readFile(new URL(cssPath), 'utf8');
assert.match(css, /\.a9-(coordinate|file|icon|media|pro|tiptap)-/);
assert.match(css, /\.a9-file-manager/);
assert.match(css, /\.a9-media-library/);
assert.match(css, /\.a9-tiptap-editor__media-bubble/);

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
const fileService = {
  async list({ page, pageSize }) {
    return { list: [], pagination: { page, pageSize, total: 0, hasMore: false }, typeCounts: {} };
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
      h(packageExports.ACoordinatePicker, {
        modelValue: { latitude: 27.8945, longitude: 102.2644 },
        apiKey: 'fixture-key',
        readonly: true,
      }),
      h(packageExports.AProTable, {
        columns: [{ title: 'Name', dataIndex: 'name' }],
        fetcher: async () => ({ list: [], total: 0 }),
      }),
      h(packageExports.ATiptapEditor, {
        modelValue:
          '<p>Fixture <img src="/fixture-inline.png" alt="Inline fixture" data-display="inline" data-size="1.25em"> content</p>' +
          '<img src="/fixture-block.png" alt="Block fixture" style="width:9999px" data-display="block" data-width="50%" data-align="center">' +
          '<video src="/fixture.mp4" autoplay data-width="75%" data-align="right"></video>' +
          '<audio src="/fixture.mp3" autoplay data-width="standard" data-align="center"></audio>',
        service: mediaService,
        defaultImageDisplay: 'inline',
        maxHeight: 480,
        canUploadImage: false,
        canUploadVideo: false,
        canUploadAudio: false,
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
      h(packageExports.AFileManager),
      h(packageExports.AFilePicker, { multiple: true, fileTypes: ['image', 'document'] }),
    ]),
});

app.use(ArcoVue);
Object.entries(ArcoVueIcon).forEach(([name, component]) => app.component(name, component));
app.use(createI18n({ legacy: false, locale: 'en-US', messages: localeExports.messages }));
app.use(packageExports.default, { mediaService, fileService });
app.mount(host);
await nextTick();
await new Promise((resolve) => setTimeout(resolve, 0));
await nextTick();

assert.ok(host.querySelector('.a9-icon-picker'), 'AIconPicker did not mount.');
assert.ok(host.querySelector('.a9-coordinate-picker'), 'ACoordinatePicker did not mount.');
assert.ok(host.querySelector('.a9-pro-table'), 'AProTable did not mount.');
assert.ok(host.querySelector('.a9-tiptap-editor'), 'ATiptapEditor did not mount.');
assert.equal(host.querySelector('.a9-tiptap-editor')?.style.getPropertyValue('--a9-tiptap-editor-max-height'), '480px');
assert.equal(host.querySelector('.a9-tiptap-editor__content')?.parentElement, host.querySelector('.a9-tiptap-editor'));
assert.ok(host.querySelector('button[aria-label="Insert image"]'), 'ATiptapEditor image picker did not mount.');
assert.ok(host.querySelector('button[aria-label="Insert video"]'), 'ATiptapEditor video picker did not mount.');
assert.ok(host.querySelector('button[aria-label="Insert audio"]'), 'ATiptapEditor audio picker did not mount.');
const mountedVideo = host.querySelector('.a9-tiptap-editor video');
const mountedAudio = host.querySelector('.a9-tiptap-editor audio');
const mountedBlockImage = host.querySelector('.a9-tiptap-editor [data-media-node="blockImage"] img');
const mountedInlineImage = host.querySelector('.a9-tiptap-editor [data-media-node="inlineImage"] img');
assert.equal(mountedBlockImage?.getAttribute('src'), '/fixture-block.png');
assert.equal(mountedInlineImage?.getAttribute('src'), '/fixture-inline.png');
assert.equal(host.querySelector('[data-media-node="blockImage"]')?.style.getPropertyValue('--a9-media-width'), '50%');
assert.equal(host.querySelector('[data-media-node="inlineImage"]')?.style.getPropertyValue('--a9-media-size'), '1.25em');
assert.equal(mountedVideo?.getAttribute('src'), '/fixture.mp4');
assert.equal(mountedAudio?.getAttribute('src'), '/fixture.mp3');
const mountedAudioWrapper = host.querySelector('[data-media-node="audio"]');
assert.equal(mountedAudioWrapper?.getAttribute('data-width'), 'standard');
assert.equal(mountedAudioWrapper?.getAttribute('data-align'), 'center');
assert.equal(mountedAudioWrapper?.style.getPropertyValue('--a9-media-width'), '480px');
[mountedVideo, mountedAudio].forEach((element) => {
  assert.ok(element?.hasAttribute('controls'), 'Embedded media is missing playback controls.');
  assert.equal(element?.getAttribute('preload'), 'metadata');
  assert.ok(!element?.hasAttribute('autoplay'), 'Embedded media retained autoplay.');
});
assert.ok(host.querySelector('.a9-media-picker'), 'AMediaPicker did not mount.');
assert.ok(host.querySelector('.a9-media-library'), 'AMediaLibrary did not mount.');
assert.ok(host.querySelector('.a9-file-manager'), 'AFileManager did not mount from list-only fileService.');
assert.ok(host.querySelector('.a9-file-picker'), 'AFilePicker did not mount from shared list-only fileService.');
assert.ok(host.querySelector('.arco-input-wrapper'), 'Arco input integration did not mount.');
assert.ok(host.querySelector('.arco-table'), 'Arco table integration did not mount.');
assert.ok(host.querySelector('.arco-upload'), 'Arco upload integration did not mount.');
assert.ok(host.querySelector('.a9-media-library .arco-spin'), 'AMediaLibrary Arco integration did not mount.');
assert.ok(host.querySelector('.a9-file-manager .arco-spin'), 'AFileManager Arco integration did not mount.');

activeLibraryService.value = replacementService;
await nextTick();
await new Promise((resolve) => setTimeout(resolve, 0));
await nextTick();
assert.ok(replacementListCalls > 0, 'AMediaLibrary did not use its replacement service.');
assert.ok(host.querySelector('.a9-media-library'), 'AMediaLibrary unmounted after its service changed.');

app.unmount();
await window.happyDOM.abort();
