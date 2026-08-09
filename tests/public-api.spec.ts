import { createApp, defineComponent } from 'vue';
import { describe, expect, it } from 'vitest';
import * as publicApi from '../src';
import type { Admin9UIPluginOptions } from '../src';
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

  it('exports only the supported runtime capabilities from the root entry', () => {
    expect(Object.keys(publicApi).sort()).toEqual(
      [
        'AIconPicker',
        'AMediaLibrary',
        'AMediaPicker',
        'AProTable',
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

  it('registers AMediaLibrary through the default plugin', () => {
    const app = createApp(defineComponent({ template: '<div />' }));
    app.use(publicApi.default);

    expect(app.component('AMediaLibrary')).toBe(publicApi.AMediaLibrary);
  });
});
