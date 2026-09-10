import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';

export const fontSizes = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px'];
export const textColors = ['#000000', '#666666', '#f53f3f', '#ff7d00', '#f7ba1e', '#00b42a', '#165dff', '#722ed1'];
export const highlightColors = ['#fff7cc', '#e8ffea', '#e8f3ff', '#ffe8f1', '#f5e8ff'];

export function normalizeTextColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const color = value.trim().toLowerCase();
  if (
    !color ||
    /[;{}]|var\(|url\(/.test(color) ||
    ['inherit', 'initial', 'unset', 'revert', 'currentcolor', 'transparent'].includes(color)
  )
    return null;
  if (typeof document === 'undefined') return /^#([\da-f]{3}|[\da-f]{6})$/.test(color) ? color : null;
  const { style } = document.createElement('span');
  style.color = color;
  if (!style.color || /^(rgba|hsla)\(/.test(style.color)) return null;
  return style.color;
}

export const normalizeFontSize = (value: unknown) => (typeof value === 'string' && fontSizes.includes(value) ? value : null);

export const SafeColor = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          color: {
            default: null,
            parseHTML: (element: HTMLElement) => normalizeTextColor(element.style.color),
            renderHTML: (attrs: Record<string, unknown>) =>
              normalizeTextColor(attrs.color) ? { style: `color: ${normalizeTextColor(attrs.color)}` } : {},
          },
        },
      },
    ];
  },
});
export const SafeFontSize = FontSize.extend({
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element: HTMLElement) => normalizeFontSize(element.style.fontSize),
            renderHTML: (attrs: Record<string, unknown>) =>
              normalizeFontSize(attrs.fontSize) ? { style: `font-size: ${attrs.fontSize}` } : {},
          },
        },
      },
    ];
  },
});
export const SafeHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          normalizeTextColor(element.getAttribute('data-color') || element.style.backgroundColor),
        renderHTML: (attrs: Record<string, unknown>) =>
          normalizeTextColor(attrs.color)
            ? {
                'data-color': normalizeTextColor(attrs.color),
                'style': `background-color: ${normalizeTextColor(attrs.color)}; color: inherit`,
              }
            : {},
      },
    };
  },
  parseHTML() {
    return [
      { tag: 'mark' },
      {
        style: 'background-color',
        getAttrs: (value) => (normalizeTextColor(value) ? { color: normalizeTextColor(value) } : false),
      },
    ];
  },
}).configure({ multicolor: true });

export { TextStyle };
