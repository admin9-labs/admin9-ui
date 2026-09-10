import { describe, expect, it } from 'vitest';
import { cleanPastedHTML, parseTableText, tableTextContent } from '../src/components/tiptap-editor/paste';
import { normalizeFontSize, normalizeTextColor } from '../src/components/tiptap-editor/text-format';

describe('rich text paste normalization', () => {
  it('retains empty TSV cells and treats formulas as literal text', () => {
    const rows = parseTableText('Name\t\tValue\r\nOne\t=SUM(A1:A2)\t\r\n');
    expect(rows).toEqual([
      ['Name', '', 'Value'],
      ['One', '=SUM(A1:A2)', ''],
    ]);
    expect(tableTextContent(rows).content?.[1].content?.[1].content?.[0].content?.[0].text).toBe('=SUM(A1:A2)');
    expect(parseTableText('')).toEqual([]);
  });
  it('counts skipped local images without removing neighboring text or safe images', () => {
    const result = cleanPastedHTML(
      '<p>A<img src="blob:unavailable">B<img src="/image.png"></p><img src="data:image/png;base64,AAAA">'
    );
    expect(result.skippedImages).toBe(2);
    expect(result.html).toContain('AB');
    expect(result.html).toContain('/image.png');
  });
  it('allows real colors and preset sizes without admitting style injection', () => {
    expect(normalizeTextColor('red')).toBeTruthy();
    expect(normalizeTextColor('var(--untrusted)')).toBeNull();
    expect(normalizeTextColor('red; background:url(example)')).toBeNull();
    expect(normalizeTextColor('transparent')).toBeNull();
    expect(normalizeFontSize('20px')).toBe('20px');
    expect(normalizeFontSize('999px')).toBeNull();
  });
});
