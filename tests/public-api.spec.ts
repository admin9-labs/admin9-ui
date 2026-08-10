import { createApp, defineComponent } from 'vue';
import { describe, expect, it } from 'vitest';
import * as publicApi from '../src';
import type {
  Admin9UIPluginOptions,
  ATiptapEditorProps,
  TiptapAudioWidth,
  TiptapBlockWidth,
  TiptapImageDisplay,
  TiptapInlineImageSize,
  TiptapMediaAlign,
} from '../src';
import * as localeApi from '../src/locale';

const leafKeys = (value: Record<string, unknown>, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return entry && typeof entry === 'object' ? leafKeys(entry as Record<string, unknown>, path) : [path];
  });

describe('package public API', () => {
  it('exports plugin installation options under the specific public name', () => {
    const options: Admin9UIPluginOptions = {};

    expect(options).toEqual({});
  });

  it('exports the ATiptapEditor media contract types', () => {
    const display: TiptapImageDisplay = 'inline';
    const audioWidth: TiptapAudioWidth = 'compact';
    const width: TiptapBlockWidth = '75%';
    const size: TiptapInlineImageSize = '1.5em';
    const align: TiptapMediaAlign = 'right';
    const props: ATiptapEditorProps = { defaultImageDisplay: display, maxHeight: '60dvh' };

    expect({ display, audioWidth, width, size, align, props }).toEqual({
      display: 'inline',
      audioWidth: 'compact',
      width: '75%',
      size: '1.5em',
      align: 'right',
      props: { defaultImageDisplay: 'inline', maxHeight: '60dvh' },
    });
  });

  it('exports only the supported runtime capabilities from the root entry', () => {
    expect(Object.keys(publicApi).sort()).toEqual(
      [
        'AIconPicker',
        'AMediaLibrary',
        'AMediaPicker',
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
    expect(localeApi.enUS.mediaLibrary.groupAll).toBe('All');
    expect(localeApi.zhCN.mediaLibrary.groupUngrouped).toBe('未分组');
  });

  it('keeps English and Chinese locale keys structurally aligned', () => {
    expect(leafKeys(localeApi.enUS).sort()).toEqual(leafKeys(localeApi.zhCN).sort());
  });

  it('registers public components through the default plugin', () => {
    const app = createApp(defineComponent({ template: '<div />' }));
    app.use(publicApi.default);

    expect(app.component('AMediaLibrary')).toBe(publicApi.AMediaLibrary);
    expect(app.component('ATiptapEditor')).toBe(publicApi.ATiptapEditor);
  });
});
