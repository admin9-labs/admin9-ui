import type { JSONContent } from '@tiptap/core';
import { isSafeMediaUrl } from './media-attributes';

export function cleanPastedHTML(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  let skippedImages = 0;
  template.content.querySelectorAll('*').forEach((image) => {
    if (!['img', 'v:imagedata'].includes(image.tagName.toLowerCase())) return;
    if (image.tagName.toLowerCase() !== 'img' || !isSafeMediaUrl(image.getAttribute('src'))) {
      skippedImages += 1;
      image.remove();
    }
  });
  return { html: template.innerHTML, skippedImages };
}

export function parseTableText(text: string): string[][] {
  if (!text) return [];
  const rows = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((row) => row.split('\t'));
  const width = Math.max(...rows.map((row) => row.length));
  return rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ''));
}

export function tableTextContent(rows: string[][]): JSONContent {
  return {
    type: 'table',
    content: rows.map((row) => ({
      type: 'tableRow',
      content: row.map((text) => ({
        type: 'tableCell',
        content: [{ type: 'paragraph', ...(text ? { content: [{ type: 'text', text }] } : {}) }],
      })),
    })),
  };
}
