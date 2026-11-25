import { Extension } from '@tiptap/core';
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';

export const fontSizes = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '36px', '48px'];

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

export const firstLineIndents = ['0em', '2em'];
export const lineHeights = ['1', '1.5', '2'];
export const letterSpacings = ['0px', '1px', '2px'];
export function normalizeFirstLineIndent(value: unknown): string | null {
  if (typeof value === 'string' && ['0', '0px', '0em'].includes(value)) return '0em';
  return value === '2em' ? value : null;
}
export const normalizeLineHeight = (value: unknown) =>
  typeof value === 'string' && lineHeights.includes(value) ? value : null;
export const normalizeLetterSpacing = (value: unknown) =>
  typeof value === 'string' && letterSpacings.includes(value) ? value : null;

/** Register alongside TextStyle and TextAlign in the editor's extension list. */
export const TextFormat = Extension.create({
  name: 'a9TextFormat',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          firstLineIndent: {
            default: null,
            parseHTML: (element: HTMLElement) => normalizeFirstLineIndent(element.style.textIndent),
            renderHTML: (attrs: Record<string, unknown>) => {
              const indent = normalizeFirstLineIndent(attrs.firstLineIndent);
              return indent === null ? {} : { style: `text-indent: ${indent}` };
            },
          },
        },
      },
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element: HTMLElement) => normalizeLineHeight(element.style.lineHeight),
            renderHTML: (attrs: Record<string, unknown>) =>
              normalizeLineHeight(attrs.lineHeight) ? { style: `line-height: ${attrs.lineHeight}` } : {},
          },
        },
      },
      {
        types: ['textStyle'],
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (element: HTMLElement) => normalizeLetterSpacing(element.style.letterSpacing),
            renderHTML: (attrs: Record<string, unknown>) =>
              normalizeLetterSpacing(attrs.letterSpacing) ? { style: `letter-spacing: ${attrs.letterSpacing}` } : {},
          },
        },
      },
    ];
  },
});
