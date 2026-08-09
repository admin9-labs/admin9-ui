import { describe, expect, it } from 'vitest';
import * as publicApi from '../src';
import * as localeApi from '../src/locale';

describe('package public API', () => {
  it('exports only the supported runtime capabilities from the root entry', () => {
    expect(Object.keys(publicApi).sort()).toEqual(
      ['AIconPicker', 'AMediaPicker', 'AProTable', 'arcoIconNames', 'default', 'localePrefix', 'messages'].sort()
    );
  });

  it('keeps the locale entry limited to consumer-facing locale resources', () => {
    expect(Object.keys(localeApi).sort()).toEqual(['enUS', 'localePrefix', 'messages', 'zhCN'].sort());
  });
});
